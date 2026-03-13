import { transformRawIssue } from '../transformer';

async function run() {
  const raw = `Fix login error\nWhen a user with expired token tries to login, they see a 500 error. Steps to reproduce:\n1. Expire token\n2. Try to login\nExpected: friendly 401`;
  const s = await transformRawIssue(raw);
  console.log('Transform output:', JSON.stringify(s, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
