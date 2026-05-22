import assert from 'node:assert/strict';
import {analyzePrivacyFrame} from '../services/visualPrivacyGuardian';

function run() {
  const calmFrame = new Uint8ClampedArray(24 * 24 * 4).fill(180);
  for (let i = 3; i < calmFrame.length; i += 4) calmFrame[i] = 255;
  const calm = analyzePrivacyFrame(24, 24, calmFrame);
  assert.equal(calm.level, 'calm');
  assert.notEqual(calm.quality.level, 'poor');
  assert.ok(calm.evidence.some((item) => item.includes('畫面品質')));
  assert.ok(calm.evidence.some((item) => item.includes('亮度')));

  const busyFrame = new Uint8ClampedArray(24 * 24 * 4);
  for (let i = 0; i < busyFrame.length; i += 4) {
    const high = (i / 4) % 2 === 0;
    busyFrame[i] = high ? 250 : 15;
    busyFrame[i + 1] = high ? 250 : 15;
    busyFrame[i + 2] = high ? 250 : 15;
    busyFrame[i + 3] = 255;
  }
  const busy = analyzePrivacyFrame(24, 24, busyFrame);
  assert.ok(busy.level === 'watch' || busy.level === 'support');
  assert.ok(busy.score > calm.score);

  const blankDark = new Uint8ClampedArray(24 * 24 * 4).fill(10);
  for (let i = 3; i < blankDark.length; i += 4) blankDark[i] = 255;
  const lowQuality = analyzePrivacyFrame(24, 24, blankDark);
  assert.notEqual(lowQuality.quality.level, 'good');
  assert.ok(lowQuality.quality.hints.some((item) => item.includes('光線偏暗')));

  const seenLevels = new Set<string>();
  for (let round = 0; round < 500; round += 1) {
    const width = 24 + (round % 9);
    const height = 24 + (round % 7);
    const frame = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < frame.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const lowLight = round % 5 === 0 && y > height * 0.55;
      const busyTexture = (x * 3 + y * 5 + round) % (4 + (round % 5)) === 0;
      const value = lowLight ? 24 : busyTexture ? 245 : 156 + ((x + y + round) % 42);
      frame[i] = value;
      frame[i + 1] = value;
      frame[i + 2] = value;
      frame[i + 3] = 255;
    }
    const result = analyzePrivacyFrame(width, height, frame);
    seenLevels.add(result.level);
    assert.ok(result.score >= 0 && result.score <= 100, `round ${round}: score out of bounds`);
    assert.ok(result.metrics.brightness >= 0 && result.metrics.brightness <= 100, `round ${round}: brightness out of bounds`);
    assert.ok(result.quality.metrics.brightness >= 0 && result.quality.metrics.brightness <= 100, `round ${round}: quality brightness out of bounds`);
    assert.ok(result.evidence.some((item) => item.includes('亮度')), `round ${round}: missing brightness evidence`);
    assert.ok(result.summary.length > 0, `round ${round}: missing summary`);
  }
  assert.ok(seenLevels.size >= 2, '500-round validation should exercise multiple risk levels');

  console.log('visualPrivacyGuardian.test.ts: all assertions passed, including 500-round pixel validation');
}

run();
