/**
 * Unit tests for localAi service.
 *
 * These tests run with `tsx` + Node.js built-in `assert`.
 * The AI proxy is not available in the test environment, so every
 * `askGemini` call throws a network error and the functions fall
 * back to their local template paths — which is exactly what we
 * want to verify here.
 */

import assert from 'node:assert/strict';
import {
  generateTeacherReply,
  generateDispatchRecommendation,
  generateStudentReport,
} from '../services/localAi';

async function run() {
  // -------------------------------------------------------------------------
  // generateTeacherReply — fallback path (proxy unavailable in tests)
  // -------------------------------------------------------------------------

  // General question → non-empty string reply
  const replyGeneral = await generateTeacherReply('我不懂這道題', '數學');
  assert.equal(typeof replyGeneral, 'string');
  assert.ok(replyGeneral.length > 0, 'expected non-empty fallback reply');

  // Subject detection via explicit argument
  const replyMath = await generateTeacherReply('加法怎麼算', '數學');
  assert.equal(typeof replyMath, 'string');
  assert.ok(replyMath.length > 0);

  // Subject detection via question keywords (語文)
  const replyChinese = await generateTeacherReply('作文怎麼寫');
  assert.equal(typeof replyChinese, 'string');
  assert.ok(replyChinese.length > 0);

  // Well-known keyword override (文藝復興三傑)
  const replyRenaissance = await generateTeacherReply('文藝復興三傑是誰？');
  assert.match(replyRenaissance, /達文西|米開朗基羅|拉斐爾/);

  // 考試準備 → quiz_request situation
  const replyQuiz = await generateTeacherReply('考試怎麼準備', '語文');
  assert.equal(typeof replyQuiz, 'string');
  assert.ok(replyQuiz.length > 0);

  // -------------------------------------------------------------------------
  // generateDispatchRecommendation — fallback path
  // -------------------------------------------------------------------------

  // Zone B with broadcast task → should contain "B"
  const recBroadcast = await generateDispatchRecommendation('B', 'broadcast');
  assert.equal(typeof recBroadcast, 'string');
  assert.ok(recBroadcast.length > 0, 'expected non-empty dispatch recommendation');
  assert.match(recBroadcast, /區域 B|疏導|廣播|巡邏/);

  // Zone 操場 with 巡邏
  const recPatrol = await generateDispatchRecommendation('操場', '巡邏');
  assert.equal(typeof recPatrol, 'string');
  assert.ok(recPatrol.length > 0);

  // Zone 走廊 with 清潔
  const recClean = await generateDispatchRecommendation('走廊', '清潔');
  assert.equal(typeof recClean, 'string');
  assert.ok(recClean.length > 0);

  // -------------------------------------------------------------------------
  // generateStudentReport — fallback path
  // -------------------------------------------------------------------------

  // High performer (averageScore >= 85)
  const reportHigh = await generateStudentReport('小明', { averageScore: 90 });
  assert.equal(typeof reportHigh, 'string');
  assert.ok(reportHigh.length > 0, 'expected non-empty student report');
  assert.match(reportHigh, /小明/);

  // Low performer (averageScore < 60)
  const reportLow = await generateStudentReport('小華', { averageScore: 55 });
  assert.equal(typeof reportLow, 'string');
  assert.ok(reportLow.length > 0);
  assert.match(reportLow, /小華/);

  // Medium performer (averageScore 60-84)
  const reportMedium = await generateStudentReport('小花', { averageScore: 72 });
  assert.equal(typeof reportMedium, 'string');
  assert.ok(reportMedium.length > 0);
  assert.match(reportMedium, /小花/);

  // Unknown score → defaults to medium template (non-empty)
  const reportNoScore = await generateStudentReport('小強', {});
  assert.equal(typeof reportNoScore, 'string');
  assert.ok(reportNoScore.length > 0);
  assert.match(reportNoScore, /小強/);

  console.log('localAi.test.ts: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
