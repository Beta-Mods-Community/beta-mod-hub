import assert from "node:assert/strict";
import { it } from "node:test";
import { sendResendMail } from "../lib/account-mail-http";

const input = { key: 'secret-not-for-logs', from: 'Beta Mods <mail@example.com>', to: 'tester@example.com', subject: 'Verify', text: 'private-one-use-link' };
it('sends transactional mail over HTTPS to the fixed provider only', async () => {
  await sendResendMail(input, async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(init?.method, 'POST'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${input.key}`);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.to, [input.to]); assert.equal(body.text, input.text);
    return Response.json({ id: 'email-123456' });
  });
});
it('mail quota errors, redirects, malformed or oversized responses fail without leaking details', async () => {
  for (const response of [
    Response.json({ error: input.key }, { status: 429 }),
    new Response('', { status: 302 }),
    Response.json({ id: 'short' }), Response.json({ id: 'email-123456', error: 'bad' }),
    new Response('not json'), new Response('x'.repeat(17000)),
  ]) await assert.rejects(sendResendMail(input, async () => response), error => {
    assert.ok(error instanceof Error); assert.equal(error.message, 'Email delivery failed. Please try again later.'); return true;
  });
  await assert.rejects(sendResendMail(input, async () => { throw new Error(input.key); }), /Email delivery failed/);
});
