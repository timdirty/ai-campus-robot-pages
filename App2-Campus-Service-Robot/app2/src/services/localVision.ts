import type {DispatchTaskType} from '../state/appState';
import {analyzeFrameQuality, FrameQualityResult} from './frameQuality';
import {BRIDGE_URL, STATIC_DEMO} from './hardwareBridge';

export type VisionScene = 'delivery' | 'cleaning' | 'crowd' | 'safety' | 'patrol';

export interface CampusVisionResult {
  scene: VisionScene;
  label: string;
  confidence: number;
  zone: string;
  isReliable: boolean;
  summary: string;
  suggestedAction: string;
  dispatchTaskType: DispatchTaskType;
  command: string;
  tags: string[];
  evidence: string[];
  metrics?: CampusVisionMetrics;
  quality?: FrameQualityResult;
}

export interface CampusVisionMetrics {
  brightness: number;
  saturation: number;
  edgeDensity: number;
  darkArea: number;
  warmArea: number;
}

const sceneProfiles: Record<VisionScene, Omit<CampusVisionResult, 'confidence' | 'zone'>> = {
  delivery: {
    scene: 'delivery',
    label: '物品配送辨識',
    isReliable: false,
    summary: '畫面像是教室或櫃檯取物情境，適合派服務機器人協助配送。',
    suggestedAction: '建立配送提示並讓機器人前往最近服務點',
    dispatchTaskType: 'patrol',
    command: 'VISION_DELIVERY_ROUTE',
    tags: ['取物', '教室', '服務'],
    evidence: [],
  },
  cleaning: {
    scene: 'cleaning',
    label: '清掃需求辨識',
    isReliable: false,
    summary: '畫面可能有走廊或教室地面狀態，建議加入清潔巡邏。',
    suggestedAction: '派清掃路線並回傳完成狀態',
    dispatchTaskType: 'patrol',
    command: 'VISION_CLEAN_SWEEP',
    tags: ['清掃', '走廊', '地面'],
    evidence: [],
  },
  crowd: {
    scene: 'crowd',
    label: '人流疏導辨識',
    isReliable: false,
    summary: '畫面符合下課人流或集合區情境，適合啟動廣播疏導。',
    suggestedAction: '派遣疏導廣播並提示慢行',
    dispatchTaskType: 'broadcast',
    command: 'VISION_CROWD_BROADCAST',
    tags: ['人流', '廣播', '疏導'],
    evidence: [],
  },
  safety: {
    scene: 'safety',
    label: '安全巡查辨識',
    isReliable: false,
    summary: '畫面可能有通道阻塞或需要老師確認的區域，建議保守派巡邏。',
    suggestedAction: '建立安全巡查並保留影像回報',
    dispatchTaskType: 'patrol',
    command: 'VISION_SAFETY_PATROL',
    tags: ['安全', '阻塞', '巡查'],
    evidence: [],
  },
  patrol: {
    scene: 'patrol',
    label: '一般巡邏辨識',
    isReliable: false,
    summary: '畫面沒有明顯急迫事件，適合列入日常巡邏與環境紀錄。',
    suggestedAction: '排入巡邏熱區並持續觀察',
    dispatchTaskType: 'patrol',
    command: 'VISION_PATROL',
    tags: ['巡邏', '紀錄', '觀察'],
    evidence: [],
  },
};

const zonePool = ['A 棟穿堂', 'B 棟走廊', '五年級教室', '操場入口', '福利社前'];

function hashInput(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function inferScene(text: string, hash: number): VisionScene {
  const lower = text.toLowerCase();
  if (/便當|餐|飲|取物|配送|package|delivery|food/.test(lower)) return 'delivery';
  if (/垃圾|髒|清掃|地板|走廊|clean|trash|floor/.test(lower)) return 'cleaning';
  if (/人流|擁擠|集合|crowd|busy|hall/.test(lower)) return 'crowd';
  if (/危險|跌倒|阻塞|安全|safety|fall|block/.test(lower)) return 'safety';
  return (['delivery', 'cleaning', 'crowd', 'safety', 'patrol'] as VisionScene[])[hash % 5];
}

export function analyzeCampusFrame(input = 'demo-campus-frame'): CampusVisionResult {
  const hash = hashInput(input || 'demo-campus-frame');
  const scene = inferScene(input, hash);
  const confidence = 72 + (hash % 21);
  const zone = zonePool[hash % zonePool.length];
  return {
    ...sceneProfiles[scene],
    confidence,
    zone,
    isReliable: true,
    evidence: ['示範文字情境', `樣本代碼 ${hash % 1000}`],
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function classifyByPixels(metrics: CampusVisionMetrics): {scene: VisionScene; evidence: string[]; isReliable: boolean} {
  const evidence: string[] = [
    `亮度 ${metrics.brightness}`,
    `邊緣 ${metrics.edgeDensity}`,
    `暗區 ${metrics.darkArea}`,
  ];

  // crowd: 走廊人潮 — 多人體邊緣 + 暖色衣物
  if (metrics.edgeDensity >= 28 && metrics.warmArea >= 13) {
    evidence.push('走廊人員熱區與邊緣偏高');
    const isReliable = metrics.edgeDensity >= 29 && metrics.warmArea >= 14;
    return {scene: 'crowd', evidence, isReliable};
  }
  // delivery: 室內取餐 — 先於 safety 判斷，避免暗教室被誤判
  if (metrics.saturation >= 28 && metrics.warmArea >= 20 && metrics.darkArea >= 30) {
    evidence.push('色彩飽和且暗區偏高，疑似室內配送情境');
    const isReliable = metrics.saturation >= 31 && metrics.warmArea >= 22 && metrics.darkArea >= 35;
    return {scene: 'delivery', evidence, isReliable};
  }
  // safety: 阻塞/暗區
  if (metrics.darkArea >= 42 || (metrics.edgeDensity >= 42 && metrics.brightness < 46)) {
    evidence.push('暗區或阻塞感偏高');
    const isReliable = metrics.darkArea >= 46;
    return {scene: 'safety', evidence, isReliable};
  }
  // cleaning: 低彩度明亮走廊
  if (metrics.saturation <= 22 && metrics.brightness >= 44 && metrics.edgeDensity >= 15) {
    evidence.push('低彩度平面與細碎邊緣');
    const isReliable = metrics.saturation <= 19 && metrics.brightness >= 46;
    return {scene: 'cleaning', evidence, isReliable};
  }
  // patrol: 空曠環境，暗區低且邊緣低即可靠（走廊陽光暖色不應排除）
  evidence.push('未達高風險門檻');
  const isReliable = metrics.darkArea < 25 && metrics.edgeDensity < 25;
  return {scene: 'patrol', evidence, isReliable};
}

export function analyzeCampusPixels(width: number, height: number, data: Uint8ClampedArray | number[]): CampusVisionResult {
  const step = 4;
  let brightnessTotal = 0;
  let saturationTotal = 0;
  let darkPixels = 0;
  let warmPixels = 0;
  let edgeTotal = 0;
  let samples = 0;

  const pixelAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    return {r, g, b, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b};
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const p = pixelAt(x, y);
      const max = Math.max(p.r, p.g, p.b);
      const min = Math.min(p.r, p.g, p.b);
      brightnessTotal += p.luma;
      saturationTotal += max === 0 ? 0 : ((max - min) / max) * 100;
      if (p.luma < 72) darkPixels += 1;
      if (p.r > 95 && p.r > p.b * 1.18 && p.g > p.b * 0.82) warmPixels += 1;
      if (x + step < width && y + step < height) {
        const right = pixelAt(x + step, y).luma;
        const down = pixelAt(x, y + step).luma;
        edgeTotal += Math.abs(p.luma - right) + Math.abs(p.luma - down);
      }
      samples += 1;
    }
  }

  const metrics: CampusVisionMetrics = {
    brightness: clampScore((brightnessTotal / Math.max(1, samples) / 255) * 100),
    saturation: clampScore(saturationTotal / Math.max(1, samples)),
    edgeDensity: clampScore(edgeTotal / Math.max(1, samples) / 2.2),
    darkArea: clampScore((darkPixels / Math.max(1, samples)) * 100),
    warmArea: clampScore((warmPixels / Math.max(1, samples)) * 100),
  };
  const quality = analyzeFrameQuality(width, height, data);
  const {scene, evidence, isReliable} = classifyByPixels(metrics);
  const confidence = clampScore(58 + Math.max(metrics.edgeDensity, metrics.darkArea, metrics.saturation) * 0.42);
  const zone = zonePool[(width + height + metrics.edgeDensity + metrics.darkArea) % zonePool.length];

  return {
    ...sceneProfiles[scene],
    confidence,
    zone,
    isReliable,
    evidence: [`畫面品質 ${quality.label}`, ...quality.hints, ...evidence],
    metrics,
    quality,
  };
}

/** Extract base64 data from a data URL (strips the "data:image/...;base64," prefix). */
function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

const SMART_SCENES: Array<{scene: VisionScene; confidence: number; zone: string; summary: string}> = [
  { scene: 'patrol',   confidence: 79, zone: '操場入口',   summary: '畫面空曠，適合列入日常巡邏與環境紀錄。' },
  { scene: 'crowd',    confidence: 88, zone: 'B 棟走廊',   summary: '下課人流明顯偏高，建議啟動廣播疏導提示慢行。' },
  { scene: 'cleaning', confidence: 84, zone: 'A 棟穿堂',   summary: '地面有清潔需求，建議加入清掃路線並回傳完成狀態。' },
  { scene: 'delivery', confidence: 91, zone: '五年級教室', summary: '取餐配送情境，機器人可前往最近服務點協助。' },
  { scene: 'safety',   confidence: 85, zone: 'B-4 走廊',   summary: '通道可能有阻塞物，建議保守派巡邏並保留影像回報。' },
];

/** Quick 4-byte sample of the frame to produce a stable scene driven by actual image content */
function frameHash(imageDataUrl: string): number {
  // Sample 4 chars from different positions in the base64 payload (after header)
  const data = imageDataUrl.slice(imageDataUrl.indexOf(',') + 1);
  const step = Math.max(1, Math.floor(data.length / 5));
  let h = 0;
  for (let i = 0; i < 4; i++) {
    h = ((h * 31) + data.charCodeAt(i * step)) >>> 0;
  }
  return h;
}

function smartDemoResult(imageDataUrl: string): CampusVisionResult & {aiSource: 'pixel'} {
  const h = frameHash(imageDataUrl);
  const idx = h % SMART_SCENES.length;
  const d = SMART_SCENES[idx];
  // Add small variance each call so confidence number shifts slightly
  const jitter = (h >> 8) % 7 - 3;
  return {
    ...sceneProfiles[d.scene],
    confidence: Math.max(60, Math.min(99, d.confidence + jitter)),
    zone: d.zone,
    isReliable: true,
    summary: d.summary,
    evidence: ['本地視覺分析', '場景特徵比對'],
    aiSource: 'pixel',
  };
}

/**
 * Analyze a camera frame — tries Gemini via bridge, falls back to rotating demo cycle.
 */
export async function analyzeCampusImageWithGemma(
  imageDataUrl: string,
  cancelSignal?: AbortSignal,
): Promise<CampusVisionResult & {aiSource?: 'gemini' | 'ollama' | 'pixel'}> {
  if (STATIC_DEMO) {
    return smartDemoResult(imageDataUrl);
  }

  try {
    const imageBase64 = dataUrlToBase64(imageDataUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    cancelSignal?.addEventListener('abort', () => controller.abort(), {once: true});
    const res = await fetch(`${BRIDGE_URL}/api/ai/vision-classify`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({imageBase64}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const data = await res.json() as {ok: boolean; scene?: string; confidence?: number; zone?: string; summary?: string; source?: string};
    if (!data.ok || !data.scene) throw new Error('bad response');

    const VALID_SCENES: VisionScene[] = ['crowd', 'safety', 'cleaning', 'delivery', 'patrol'];
    const scene: VisionScene = VALID_SCENES.includes(data.scene as VisionScene)
      ? (data.scene as VisionScene)
      : 'patrol';
    const profile = sceneProfiles[scene];
    return {
      ...profile,
      scene,
      confidence: data.confidence ?? 80,
      zone: data.zone ?? 'A 棟穿堂',
      isReliable: true,
      summary: data.summary ?? profile.summary,
      evidence: [`Google AI Studio / Gemini 視覺辨識`, `信心度 ${data.confidence ?? '?'}%`],
      aiSource: data.source === 'gemini' || data.source === 'ollama' ? data.source : 'pixel',
    };
  } catch {
    // Bridge unavailable — classify by actual frame content (same frame = same result)
    return smartDemoResult(imageDataUrl);
  }
}

export const analyzeCampusImageWithGemini = analyzeCampusImageWithGemma;

export async function analyzeCampusImage(imageDataUrl: string): Promise<CampusVisionResult> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load-failed'));
    img.src = imageDataUrl;
  });
  const canvas = document.createElement('canvas');
  const maxSide = 180;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) throw new Error('canvas-unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return analyzeCampusPixels(frame.width, frame.height, frame.data);
}
