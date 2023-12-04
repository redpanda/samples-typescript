import { ApplicationFailure, WorkflowHandleWithFirstExecutionRunId } from '@temporalio/client'
import { Runtime, DefaultLogger, Worker } from '@temporalio/worker'
import { TestWorkflowEnvironment, workflowInterceptorModules } from '@temporalio/testing'
import assert from 'assert'
import { describe, it } from 'mocha'
import sinon from 'sinon'
import { v4 as uuid } from 'uuid'
import * as activities from '../../activities'
import { order, deliveredSignal, pickedUpSignal, getStatusQuery, OrderStatus } from '..'
import { WorkflowCoverage } from '@temporalio/nyc-test-coverage'
import { setTimeout } from 'timers/promises'
import { Product, products } from 'common'

const workflowCoverage = new WorkflowCoverage()

describe('order workflow', async function () {
  let shutdown: () => Promise<void>
  let env: TestWorkflowEnvironment

  let execute: (productId: number) => ReturnType<typeof order>
  let start: (productId: number) => Promise<WorkflowHandleWithFirstExecutionRunId<typeof order>>

  let chargeCustomerStub: sinon.SinonStub
  let sendPushNotificationStub: sinon.SinonStub

  this.slow(10_000)
  this.timeout(20_000)

  before(async function () {
    // Filter INFO log messages for clearer test output
    Runtime.install({ logger: new DefaultLogger('WARN') })
    env = await TestWorkflowEnvironment.createTimeSkipping()

    chargeCustomerStub = sinon.stub()
    sendPushNotificationStub = sinon.stub()

    const worker = await Worker.create(
      workflowCoverage.augmentWorkerOptions({
        connection: env.nativeConnection,
        taskQueue: 'test-food-delivery',
        workflowsPath: require.resolve('..'),
        //activities: mockActivities,
        activities: {
          ...activities,
          ...{
            chargeCustomer: chargeCustomerStub,
            sendPushNotification: sendPushNotificationStub,
          },
        },
      })
    )

    const runPromise = worker.run()
    shutdown = async () => {
      worker.shutdown()
      await runPromise
      await env.teardown()
    }
  })

  beforeEach(() => {
    start = (productId: number) => {
      return env.client.workflow.start(order, {
        taskQueue: 'test-food-delivery',
        workflowExecutionTimeout: 30_000,
        // Use random ID because ID is meaningless for this test
        workflowId: `test-${uuid()}`,
        args: [productId], // Pass the expenseId property as a string
      })
    }

    execute = async (productId: number) => {
      return env.client.workflow.execute(order, {
        taskQueue: 'test-food-delivery',
        workflowExecutionTimeout: 120_000,
        // Use random ID because ID is meaningless for this test
        workflowId: `test-${uuid()}`,
        args: [productId], // Pass the expenseId property as a string
      })
    }
  })

  after(async () => {
    await shutdown()
  })

  after(() => {
    workflowCoverage.mergeIntoGlobalCoverage()
  })

  afterEach(() => {
    sinon.restore()
  })

  it('rejects with a product not found', async () => {
    const exec = async () => await execute(5)
    await assert.rejects(exec, 'Product 5 not found')
  })

  it('sucessfully order a product', async () => {
    const product = products[1]
    chargeCustomerStub.withArgs(product).resolves()
    sendPushNotificationStub.withArgs('🚗 Order picked up').onCall(0).resolves()
    sendPushNotificationStub.withArgs('✅ Order delivered!').onCall(1).resolves()
    sendPushNotificationStub
      .withArgs(`✍️ Rate your meal. How was the ${product.name.toLowerCase()}?`)
      .onCall(1)
      .resolves()

    let query: OrderStatus

    const handle = await start(2)

    // This generally takes less than one second, but allow up to 5 seconds for slow CI environments
    await setTimeout(2000)

    // Pick up the order
    await handle.signal(pickedUpSignal)
    query = await handle.query(getStatusQuery)
    assert.strictEqual(query.state, 'Picked up')

    // Deliver the order
    await handle.signal(deliveredSignal)
    query = await handle.query(getStatusQuery)
    assert.strictEqual(query.state, 'Delivered')

    await env.sleep('1 min')
  })
})
