import axios from 'axios';

export async function makeHTTPRequest(input = 42): Promise<string> {
  const res = await axios.get('http://httpbin.org/get?answer='+input);

  return res.data.args.answer;
}
