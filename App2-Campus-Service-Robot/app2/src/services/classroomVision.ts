import {BRIDGE_URL, STATIC_DEMO} from './hardwareBridge';

export type ClassroomEmotion = 'engaged' | 'neutral' | 'tired' | 'confused' | 'distracted';
export type ClassroomMotion = 'calm' | 'active' | 'restless';

export interface ClassroomCvSignals {
  brightness: number;
  edgeDensity: number;
  warmArea: number;
  motionLevel: number;
  estimatedPeople: number;
  postureSignal: 'upright' | 'mixed' | 'low';
  evidence: string[];
}

export interface ClassroomAnalysisResult {
  studentCount: number;
  llmStudentCount?: number;
  cvStudentCount?: number;
  yoloStudentCount?: number;
  focusScore: number;
  emotion: ClassroomEmotion;
  emotionLabel: string;
  motion: ClassroomMotion;
  summary: string;
  evidence: string[];
  learningAlerts?: Array<{label: string; detail: string}>;
  visualAlerts?: Array<{
    label: '疑似滑手機' | '疑似睡覺' | '疑似舉手' | '分心躁動';
    message: string;
    boxes: Array<{x: number; y: number; width: number; height: number}>;
  }>;
  source: 'gemini' | 'ollama' | 'local';
  cv: ClassroomCvSignals;
}

export interface ClassroomPersonDetection {
  label: 'person';
  confidence: number;
  box: [number, number, number, number];
}

export interface ClassroomTrackedPerson extends ClassroomPersonDetection {
  id: number;
  age: number;
  missed: number;
}

export interface ClassroomFrameCapture {
  imageDataUrl: string;
  imageBase64: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampScore(value: number) {
  return clamp(Math.round(value), 0, 100);
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export function captureClassroomFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
  maxSide = 640,
  quality = 0.72,
): ClassroomFrameCapture | null {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageDataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    imageDataUrl,
    imageBase64: dataUrlToBase64(imageDataUrl),
    width: frame.width,
    height: frame.height,
    data: frame.data,
  };
}

export async function captureClassroomImage(
  file: File,
  maxSide = 640,
  quality = 0.78,
): Promise<ClassroomFrameCapture> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('image read failed'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('image canvas unavailable');

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageDataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    imageDataUrl,
    imageBase64: dataUrlToBase64(imageDataUrl),
    width: frame.width,
    height: frame.height,
    data: frame.data,
  };
}

export function analyzeClassroomPixels(
  width: number,
  height: number,
  data: Uint8ClampedArray | number[],
  previous?: Uint8ClampedArray | number[] | null,
): ClassroomCvSignals {
  const step = 5;
  let samples = 0;
  let brightnessTotal = 0;
  let edgeTotal = 0;
  let warmPixels = 0;
  let motionPixels = 0;
  let uprightEnergy = 0;
  let lowEnergy = 0;

  const pixelAt = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    return {r, g, b, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b};
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const p = pixelAt(x, y);
      brightnessTotal += p.luma;
      if (p.r > 85 && p.g > 45 && p.b > 25 && p.r > p.b * 1.12 && p.g > p.b * 0.75) warmPixels += 1;
      if (x + step < width && y + step < height) {
        const right = pixelAt(x + step, y).luma;
        const down = pixelAt(x, y + step).luma;
        const edge = Math.abs(p.luma - right) + Math.abs(p.luma - down);
        edgeTotal += edge;
        if (y < height * 0.62) uprightEnergy += edge;
        if (y > height * 0.62) lowEnergy += edge;
      }
      if (previous) {
        const idx = (y * width + x) * 4;
        const prev = 0.2126 * (previous[idx] ?? 0) + 0.7152 * (previous[idx + 1] ?? 0) + 0.0722 * (previous[idx + 2] ?? 0);
        if (Math.abs(p.luma - prev) > 28) motionPixels += 1;
      }
      samples += 1;
    }
  }

  const brightness = clampScore((brightnessTotal / Math.max(1, samples) / 255) * 100);
  const edgeDensity = clampScore(edgeTotal / Math.max(1, samples) / 2.3);
  const warmArea = clampScore((warmPixels / Math.max(1, samples)) * 100);
  const motionLevel = previous ? clampScore((motionPixels / Math.max(1, samples)) * 130) : 18;
  const estimatedPeople = clamp(
    Math.round((warmArea * 0.38 + edgeDensity * 0.18 + motionLevel * 0.08) / 2.6),
    warmArea > 4 ? 1 : 0,
    45,
  );
  const postureRatio = uprightEnergy / Math.max(1, uprightEnergy + lowEnergy);
  const postureSignal = postureRatio > 0.62 ? 'upright' : postureRatio < 0.47 ? 'low' : 'mixed';
  const evidence = [
    `CV 亮度 ${brightness}`,
    `CV 邊緣密度 ${edgeDensity}`,
    `膚色/暖色區 ${warmArea}`,
    `動作量 ${motionLevel}`,
    `姿態 ${postureSignal === 'upright' ? '坐姿較挺' : postureSignal === 'low' ? '低姿態偏多' : '姿態混合'}`,
  ];

  return {brightness, edgeDensity, warmArea, motionLevel, estimatedPeople, postureSignal, evidence};
}

export function localClassroomAnalysis(cv: ClassroomCvSignals): ClassroomAnalysisResult {
  const focusBase = 82 + (cv.postureSignal === 'upright' ? 8 : cv.postureSignal === 'low' ? -16 : -4);
  const motionPenalty = cv.motionLevel > 62 ? 17 : cv.motionLevel > 42 ? 8 : 0;
  const focusScore = clampScore(focusBase - motionPenalty);
  const emotion: ClassroomEmotion = focusScore >= 84 ? 'engaged' : focusScore >= 70 ? 'neutral' : cv.postureSignal === 'low' ? 'tired' : 'distracted';
  const motion: ClassroomMotion = cv.motionLevel > 62 ? 'restless' : cv.motionLevel > 36 ? 'active' : 'calm';
  const labels: Record<ClassroomEmotion, string> = {
    engaged: '投入',
    neutral: '穩定',
    tired: '疲倦',
    confused: '困惑',
    distracted: '分心',
  };
  return {
    studentCount: cv.estimatedPeople,
    llmStudentCount: cv.estimatedPeople,
    cvStudentCount: cv.estimatedPeople,
    yoloStudentCount: undefined,
    focusScore,
    emotion,
    emotionLabel: labels[emotion],
    motion,
    summary: `暫用本地影像訊號判讀：畫面動作量${cv.motionLevel > 62 ? '偏高' : cv.motionLevel > 36 ? '中等' : '平穩'}，整體專注度約 ${focusScore}%。`,
    evidence: cv.evidence,
    source: 'local',
    cv,
  };
}

export async function analyzeClassroomFrame(
  capture: ClassroomFrameCapture,
  previous?: Uint8ClampedArray | number[] | null,
  signal?: AbortSignal,
  yolo?: {yoloPersonCount: number; imageSize?: {width: number; height: number}; detections: ClassroomPersonDetection[]},
): Promise<ClassroomAnalysisResult> {
  const cv = analyzeClassroomPixels(capture.width, capture.height, capture.data, previous);
  if (STATIC_DEMO) {
    const local = localClassroomAnalysis(cv);
    return {
      ...local,
      learningAlerts: local.focusScore < 72
        ? [{label: '注意力提醒', detail: '偵測到專注度下降，建議切換互動提問或短暫活動。'}]
        : [{label: '課堂穩定', detail: '整體互動穩定，可持續觀察後排學生參與度。'}],
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 32000);
    signal?.addEventListener('abort', () => controller.abort(), {once: true});
    const res = await fetch(`${BRIDGE_URL}/api/ai/classroom-analyze`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({imageBase64: capture.imageBase64, cv, yolo}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = await res.json() as Partial<ClassroomAnalysisResult> & {ok?: boolean};
    if (!payload.ok && !payload.studentCount) throw new Error('bad classroom response');
    return {
      studentCount: clamp(Math.round(Number(payload.studentCount ?? cv.estimatedPeople)), 0, 45),
      llmStudentCount: clamp(Math.round(Number(payload.llmStudentCount ?? payload.studentCount ?? cv.estimatedPeople)), 0, 45),
      cvStudentCount: clamp(Math.round(Number(payload.cvStudentCount ?? cv.estimatedPeople)), 0, 45),
      yoloStudentCount: typeof payload.yoloStudentCount === 'number' ? clamp(Math.round(Number(payload.yoloStudentCount)), 0, 45) : undefined,
      focusScore: clampScore(Number(payload.focusScore ?? localClassroomAnalysis(cv).focusScore)),
      emotion: (payload.emotion ?? 'neutral') as ClassroomEmotion,
      emotionLabel: typeof payload.emotionLabel === 'string' ? payload.emotionLabel : '穩定',
      motion: (payload.motion ?? 'calm') as ClassroomMotion,
      summary: typeof payload.summary === 'string' ? payload.summary : localClassroomAnalysis(cv).summary,
      evidence: Array.isArray(payload.evidence) ? payload.evidence.slice(0, 4).map(String) : cv.evidence,
      learningAlerts: Array.isArray(payload.learningAlerts)
        ? payload.learningAlerts
          .map((item) => ({
            label: String((item as {label?: unknown}).label ?? '').slice(0, 24),
            detail: String((item as {detail?: unknown}).detail ?? '').slice(0, 120),
          }))
          .filter((item) => item.label && item.detail)
          .slice(0, 3)
        : undefined,
      visualAlerts: Array.isArray(payload.visualAlerts) ? payload.visualAlerts : undefined,
      source: payload.source === 'gemini' || payload.source === 'ollama' ? payload.source : 'local',
      cv,
    };
  } catch {
    return localClassroomAnalysis(cv);
  }
}

export async function analyzeClassroomAlerts(
  capture: ClassroomFrameCapture,
  signal?: AbortSignal,
): Promise<Pick<ClassroomAnalysisResult, 'visualAlerts' | 'source'>> {
  if (STATIC_DEMO) {
    return {visualAlerts: [], source: 'local'};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 17000);
  signal?.addEventListener('abort', () => controller.abort(), {once: true});
  try {
    const res = await fetch(`${BRIDGE_URL}/api/ai/classroom-alerts`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({imageBase64: capture.imageBase64}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = await res.json() as Pick<ClassroomAnalysisResult, 'visualAlerts' | 'source'> & {ok?: boolean};
    return {
      visualAlerts: Array.isArray(payload.visualAlerts) ? payload.visualAlerts : [],
      source: payload.source === 'gemini' ? 'gemini' : 'local',
    };
  } catch {
    return {visualAlerts: [], source: 'local'};
  } finally {
    clearTimeout(timeout);
  }
}

function overlapRatio(a: [number, number, number, number], b: [number, number, number, number]) {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  return intersection / Math.max(1, areaA + areaB - intersection);
}

export function reconcileTrackedPeople(
  previous: ClassroomTrackedPerson[],
  detections: ClassroomPersonDetection[],
  nextId: number,
): {tracks: ClassroomTrackedPerson[]; nextId: number} {
  const used = new Set<number>();
  const tracks: ClassroomTrackedPerson[] = [];

  for (const detection of detections) {
    let bestIndex = -1;
    let bestScore = 0;
    previous.forEach((track, index) => {
      if (used.has(index)) return;
      const score = overlapRatio(track.box, detection.box);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 0.18) {
      const matched = previous[bestIndex];
      used.add(bestIndex);
      tracks.push({...detection, id: matched.id, age: matched.age + 1, missed: 0});
    } else {
      tracks.push({...detection, id: nextId, age: 1, missed: 0});
      nextId += 1;
    }
  }

  previous.forEach((track, index) => {
    if (!used.has(index) && track.missed < 2) {
      tracks.push({...track, missed: track.missed + 1});
    }
  });

  return {tracks: tracks.slice(0, 45), nextId};
}

export async function detectClassroomPeople(
  capture: ClassroomFrameCapture,
  signal?: AbortSignal,
  yolo?: {confidence?: number; imageSize?: number; iou?: number},
): Promise<{detections: ClassroomPersonDetection[]; source: 'yolo' | 'local'}> {
  if (STATIC_DEMO) {
    return {detections: [], source: 'local'};
  }

  const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
  signal?.addEventListener('abort', () => controller.abort(), {once: true});
  try {
    const res = await fetch(`${BRIDGE_URL}/api/ai/classroom-track`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({imageBase64: capture.imageBase64, yolo}),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!res.ok) throw new Error(`bridge ${res.status}`);
    const payload = await res.json() as {ok?: boolean; detections?: ClassroomPersonDetection[]; source?: string};
    if (!payload.ok || !Array.isArray(payload.detections)) throw new Error('bad tracking response');
    return {
      detections: payload.detections
        .filter((d) => d.label === 'person' && Array.isArray(d.box) && d.box.length === 4)
        .map((d) => ({
          label: 'person',
          confidence: clamp(Number(d.confidence) || 0, 0, 1),
          box: d.box.map((value) => Math.max(0, Math.round(Number(value) || 0))).slice(0, 4) as [number, number, number, number],
        })),
      source: payload.source === 'yolo' ? 'yolo' : 'local',
    };
  } catch {
    return {detections: [], source: 'local'};
  } finally {
    clearTimeout(timeout);
  }
}
