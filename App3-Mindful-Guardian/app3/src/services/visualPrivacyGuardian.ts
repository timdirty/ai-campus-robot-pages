import {analyzeFrameQuality, FrameQualityResult} from './frameQuality';

export type VisualPrivacyLevel = 'calm' | 'watch' | 'support';

export interface VisualPrivacyResult {
  level: VisualPrivacyLevel;
  label: string;
  score: number;
  summary: string;
  evidence: string[];
  quality: FrameQualityResult;
  metrics: {
    brightness: number;
    motionEdges: number;
    crowdTexture: number;
    lowLightArea: number;
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analyzePrivacyFrame(width: number, height: number, data: Uint8ClampedArray | number[]): VisualPrivacyResult {
  const step = 5;
  let lumaTotal = 0;
  let edgeTotal = 0;
  let busyPixels = 0;
  let lowLightPixels = 0;
  let samples = 0;

  const lumaAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const luma = lumaAt(x, y);
      const right = x + step < width ? lumaAt(x + step, y) : luma;
      const down = y + step < height ? lumaAt(x, y + step) : luma;
      const edge = Math.abs(luma - right) + Math.abs(luma - down);
      lumaTotal += luma;
      edgeTotal += edge;
      if (edge > 52) busyPixels += 1;
      if (luma < 58) lowLightPixels += 1;
      samples += 1;
    }
  }

  const metrics = {
    brightness: clamp((lumaTotal / Math.max(1, samples) / 255) * 100),
    motionEdges: clamp(edgeTotal / Math.max(1, samples) / 2.4),
    crowdTexture: clamp((busyPixels / Math.max(1, samples)) * 100),
    lowLightArea: clamp((lowLightPixels / Math.max(1, samples)) * 100),
  };
  const quality = analyzeFrameQuality(width, height, data);
  const riskScore = clamp(metrics.motionEdges * 0.45 + metrics.crowdTexture * 0.32 + metrics.lowLightArea * 0.3);
  const evidence = [`畫面品質 ${quality.label}`, ...quality.hints, `亮度 ${metrics.brightness}`, `紋理 ${metrics.crowdTexture}`, `低光 ${metrics.lowLightArea}`];

  if (riskScore >= 58) {
    return {
      level: 'support',
      label: '需要老師關注',
      score: riskScore,
      summary: '畫面只做場域紋理與低光分析，顯示活動密度或視線死角偏高。',
      evidence: [...evidence, '不做人臉或身分辨識'],
      quality,
      metrics,
    };
  }
  if (riskScore >= 34) {
    return {
      level: 'watch',
      label: '持續觀察',
      score: riskScore,
      summary: '場域有活動變化，建議保留低解析度環境紀錄並搭配現場巡查確認。',
      evidence: [...evidence, '隱私保護模式'],
      quality,
      metrics,
    };
  }
  return {
    level: 'calm',
    label: '場域穩定',
    score: riskScore,
    summary: '目前畫面紋理與低光區不高，維持一般守護模式。',
    evidence: [...evidence, '未觸發影像提醒'],
    quality,
    metrics,
  };
}
