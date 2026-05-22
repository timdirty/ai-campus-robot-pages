import assert from 'node:assert/strict';
import {analyzeEmotionTypography} from '../services/emotionTypography';

function run() {
  const crisis = analyzeEmotionTypography('我被欺負到不想活了');
  assert.equal(crisis.mood, 'worried');
  assert.equal(crisis.tone, 'support');
  assert.ok(crisis.intensity >= 65);
  assert.ok(crisis.keywords.length >= 1);

  const tired = analyzeEmotionTypography('考試壓力很大，最近睡不著也很累');
  assert.equal(tired.mood, 'tired');
  assert.match(tired.guidance, /行距|柔和|降低/);

  const happy = analyzeEmotionTypography('今天我做到目標，很開心也很放心');
  assert.equal(happy.mood, 'happy');
  assert.equal(happy.tone, 'bright');

  const fallback = analyzeEmotionTypography('');
  assert.equal(fallback.mood, 'steady');
  assert.ok(fallback.preview.length > 0);

  console.log('emotionTypography.test.ts: all assertions passed');
}

run();
