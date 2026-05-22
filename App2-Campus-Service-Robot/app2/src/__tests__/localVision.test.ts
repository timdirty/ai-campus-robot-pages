import assert from 'node:assert/strict';
import {analyzeCampusFrame, analyzeCampusPixels} from '../services/localVision';

function run() {
  const crowd = analyzeCampusFrame('下課穿堂人流擁擠，需要廣播疏導');
  assert.equal(crowd.scene, 'crowd');
  assert.equal(crowd.dispatchTaskType, 'broadcast');
  assert.match(crowd.command, /VISION_/);
  assert.ok(crowd.confidence >= 72 && crowd.confidence <= 92);

  const clean = analyzeCampusFrame('五年級走廊地板有垃圾，安排清掃');
  assert.equal(clean.scene, 'cleaning');
  assert.equal(clean.dispatchTaskType, 'patrol');
  assert.ok(clean.tags.includes('清掃'));

  const fallback = analyzeCampusFrame('');
  assert.ok(fallback.label.length > 0);
  assert.ok(fallback.zone.length > 0);

  const noisyWarmFrame = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < noisyWarmFrame.length; i += 4) {
    const toggle = (i / 4) % 2 === 0;
    noisyWarmFrame[i] = toggle ? 220 : 80;
    noisyWarmFrame[i + 1] = toggle ? 150 : 55;
    noisyWarmFrame[i + 2] = toggle ? 95 : 40;
    noisyWarmFrame[i + 3] = 255;
  }
  const pixelResult = analyzeCampusPixels(32, 32, noisyWarmFrame);
  assert.ok(pixelResult.metrics, 'pixel result should include metrics');
  assert.ok(pixelResult.quality, 'pixel result should include frame quality');
  assert.ok(pixelResult.evidence.some((item) => item.includes('畫面品質')));
  assert.ok(pixelResult.evidence.length >= 3);
  assert.ok(pixelResult.confidence >= 58);

  const emptyDarkFrame = new Uint8ClampedArray(24 * 24 * 4).fill(12);
  for (let i = 3; i < emptyDarkFrame.length; i += 4) emptyDarkFrame[i] = 255;
  const lowQuality = analyzeCampusPixels(24, 24, emptyDarkFrame);
  assert.notEqual(lowQuality.quality?.level, 'good');
  assert.ok(lowQuality.quality?.hints.some((item) => item.includes('光線偏暗')));

  const seenScenes = new Set<string>();
  for (let round = 0; round < 500; round += 1) {
    const width = 28 + (round % 8);
    const height = 28 + (round % 6);
    const frame = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < frame.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const stripe = (x + round) % (3 + (round % 5)) === 0;
      const darkPatch = y > height * 0.62 && (round % 4 === 0);
      const warm = (x * y + round) % 9 < 3;
      frame[i] = darkPatch ? 28 : warm ? 210 : stripe ? 70 : 172;
      frame[i + 1] = darkPatch ? 28 : warm ? 138 : stripe ? 76 : 176;
      frame[i + 2] = darkPatch ? 30 : warm ? 86 : stripe ? 92 : 184;
      frame[i + 3] = 255;
    }
    const result = analyzeCampusPixels(width, height, frame);
    seenScenes.add(result.scene);
    assert.ok(result.confidence >= 0 && result.confidence <= 100, `round ${round}: confidence out of bounds`);
    assert.ok(result.metrics, `round ${round}: missing metrics`);
    assert.ok(result.quality, `round ${round}: missing quality`);
    assert.ok(result.evidence.length >= 3, `round ${round}: missing evidence`);
    assert.match(result.command, /^VISION_/, `round ${round}: expected vision command`);
    assert.ok(result.zone.length > 0, `round ${round}: missing zone`);
  }
  assert.ok(seenScenes.size >= 2, '500-round validation should exercise multiple scene classes');

  console.log('localVision.test.ts: all assertions passed, including 500-round pixel validation');
}

run();
