import assert from "node:assert/strict";
import { it } from "node:test";
import { validateCloudFeedback } from "../lib/cloud-feedback-policy";
import { createScanEnvelope } from "../lib/cloud-zip";

it('cloud attachments cannot bypass archive validation with a filename change', async () => {
  const zip = createScanEnvelope(Buffer.from('plain log'));
  assert.equal(await validateCloudFeedback('log.zip', zip), null);
  for (const suffix of ['txt', 'log', 'sav', 'save', 'fos', 'json', 'ini']) assert.ok(await validateCloudFeedback(`log.${suffix}`, zip));
  const encrypted = Buffer.from(zip); encrypted[6] |= 1;
  assert.ok(await validateCloudFeedback('log.zip', encrypted));
});
it('cloud text allows ordinary UTF-8 logs but refuses controls and invalid bytes', async () => {
  assert.equal(await validateCloudFeedback('error.log', Buffer.from('é example\r\n\tlog')), null);
  assert.ok(await validateCloudFeedback('error.log', Buffer.from([255, 254, 0])));
  assert.ok(await validateCloudFeedback('error.log', Buffer.from('text\0binary')));
  assert.ok(await validateCloudFeedback('error.sav', Buffer.from('save')));
});
