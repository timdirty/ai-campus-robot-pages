import assert from 'node:assert/strict';
import {generateSupportReply} from '../services/localGuardianAi';

// All tests call generateSupportReply() directly.
// The Gemini proxy is unavailable in the test environment, so the function
// falls back to local keyword-based templates automatically.

async function run() {
  // 1. Crisis detection: 我不想活了 → should mention 輔導 or 1925 or 安全
  const crisisReply = await generateSupportReply('我不想活了');
  assert.strictEqual(typeof crisisReply, 'string');
  assert.ok(crisisReply.length > 0, 'crisis reply should be non-empty');
  assert.ok(
    crisisReply.includes('輔導') || crisisReply.includes('1925') || crisisReply.includes('安全'),
    `crisis reply should mention 輔導/1925/安全, got: ${crisisReply}`
  );

  // 2. Fallback on proxy error: proxy unavailable → should return non-empty string, not throw
  const proxyErrorReply = await generateSupportReply('我需要幫助');
  assert.strictEqual(typeof proxyErrorReply, 'string');
  assert.ok(proxyErrorReply.length > 0, 'fallback reply should be non-empty');

  // 3. Bullying detection: 被同學欺負了 → non-empty string
  const bullyingReply = await generateSupportReply('被同學欺負了');
  assert.strictEqual(typeof bullyingReply, 'string');
  assert.ok(bullyingReply.length > 0, 'bullying reply should be non-empty');

  // 4. Academic stress: 考試快到了很緊張 → non-empty string
  const academicReply = await generateSupportReply('考試快到了很緊張');
  assert.strictEqual(typeof academicReply, 'string');
  assert.ok(academicReply.length > 0, 'academic stress reply should be non-empty');

  // 5. Positive response: 今天考試進步了好開心 → non-empty string
  const positiveReply = await generateSupportReply('今天考試進步了好開心');
  assert.strictEqual(typeof positiveReply, 'string');
  assert.ok(positiveReply.length > 0, 'positive reply should be non-empty');

  // 6. General fallback: 今天天氣很好 → non-empty string
  const generalReply = await generateSupportReply('今天天氣很好');
  assert.strictEqual(typeof generalReply, 'string');
  assert.ok(generalReply.length > 0, 'general fallback reply should be non-empty');

  console.log('localGuardianAi tests passed (6/6)');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
