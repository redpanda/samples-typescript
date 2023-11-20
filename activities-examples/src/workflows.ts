import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const {
  makeHTTPRequest,
  completeSomethingAsync,
  // cancellableFetch  // todo: demo usage
} = proxyActivities<typeof activities>({
  retry: {
    initialInterval: '50 milliseconds',
    maximumAttempts: 2,
  },
  startToCloseTimeout: '30 seconds',
});

export async function httpWorkflow(): Promise<string> {
  const answer = await makeHTTPRequest();
  return `The answer is ${answer}`;
}

export async function asyncActivityWorkflow(): Promise<string> {
  const answer = await completeSomethingAsync();

  return `The Peon says: ${answer}`;
}

type ConditionalRequest = {
  input: number;
}

export async function conditionalWorkflow({ input }: ConditionalRequest): Promise<string> {
  const answer = await makeHTTPRequest(input);
  if (answer === '42') {
    return 'The answer is 42';
  }
  return 'The answer is not 42';
}
