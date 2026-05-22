import 'dotenv/config';
import {execFile, spawn, spawnSync, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GoogleGenAI, createPartFromBase64} from '@google/genai';

const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || '';
const geminiModel = process.env.GEMINI_MODEL?.trim() || process.env.GOOGLE_AI_MODEL?.trim() || 'gemini-3.5-flash';
const geminiVisionModel = process.env.GEMINI_VISION_MODEL?.trim() || (geminiModel.toLowerCase().includes('gemma') ? 'gemini-2.5-flash' : geminiModel);
const ai = geminiApiKey ? new GoogleGenAI({apiKey: geminiApiKey}) : null;
const yoloWorkerEnabled = process.env.YOLO_WORKER_DISABLED !== '1';
const yoloWorkerTimeoutMs = Math.max(3000, Number(process.env.YOLO_WORKER_TIMEOUT_MS ?? 8000));
let pythonCommandCache: {command: string; args: string[]} | null | undefined;

export function isOllamaConfigured(): boolean {
  return Boolean(ai);
}

export function isGeminiConfigured(): boolean {
  return Boolean(ai);
}

export function getGeminiModel(): string {
  return geminiModel;
}

export async function checkGeminiHealth(): Promise<{provider: 'google-ai-studio'; model: string}> {
  if (!ai) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not configured');
  const rawText = await generateWithGemini('只回覆 JSON：{"ok":true}', {
    json: true,
    model: geminiModel,
    system: '你是 Google AI Studio 健康檢查端點，只能回覆指定 JSON。',
    timeoutMs: 7000,
  });
  const parsed = parseJsonObject<{ok?: boolean}>(rawText);
  if (parsed.ok !== true) throw new Error('Gemini returned malformed health response');
  return {provider: 'google-ai-studio', model: geminiModel};
}

const LOCAL_DELIVERY_REPLIES = [
  '建議優先配送保健室，確保藥品及時到達。',
  '請確認配送路線：從中央廚房出發，先到圖書館，再到保健室。',
  '溫度敏感物品請使用保溫袋，並加快配送速度。',
  '建議配送順序：緊急 > 一般 > 定期補給。',
  '目前廊道人流較多，建議等待人群散去後再啟動機器人。',
  '配送任務已記錄，請確認收件老師已就位。',
];

function localDeliveryReply(): string {
  return LOCAL_DELIVERY_REPLIES[Math.floor(Math.random() * LOCAL_DELIVERY_REPLIES.length)];
}

export interface DeliveryContext {
  command?: string;
  destination?: string;
  taskDescription?: string;
  userMessage?: string;
}

export type VisionSceneLabel = 'crowd' | 'safety' | 'cleaning' | 'delivery' | 'patrol';

const VALID_SCENE_LABELS: VisionSceneLabel[] = ['crowd', 'safety', 'cleaning', 'delivery', 'patrol'];

export type ClassroomEmotion = 'engaged' | 'neutral' | 'tired' | 'confused' | 'distracted';
export type ClassroomMotion = 'calm' | 'active' | 'restless';
type ClassroomVisualAlertLabel = '疑似滑手機' | '疑似睡覺' | '疑似舉手' | '分心躁動';

interface ClassroomVisualAlertDraft {
  label: ClassroomVisualAlertLabel;
  message?: string;
  personIds?: number[];
  boxes?: Array<{x: number; y: number; width: number; height: number}>;
}

export interface ClassroomCvSignals {
  brightness: number;
  edgeDensity: number;
  warmArea: number;
  motionLevel: number;
  estimatedPeople: number;
  postureSignal: 'upright' | 'mixed' | 'low';
  evidence?: string[];
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
  visualAlerts?: Array<ClassroomVisualAlertDraft & {
    message: string;
    boxes: Array<{x: number; y: number; width: number; height: number}>;
  }>;
  source: 'gemini' | 'ollama' | 'local';
}

interface YoloClassroomResult {
  yoloPersonCount: number;
  imageSize?: {width: number; height: number};
  detections: Array<{label: string; confidence: number; box: number[]}>;
}

interface YoloRunOptions {
  confidence?: number;
  imageSize?: number;
  iou?: number;
}

type PendingYoloRequest = {
  resolve: (value: YoloClassroomResult | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let yoloWorker: ChildProcessWithoutNullStreams | null = null;
let yoloWorkerBuffer = '';
let yoloWorkerReady = false;
let yoloWorkerBooting = false;
let yoloRequestSeq = 0;
const pendingYoloRequests = new Map<string, PendingYoloRequest>();

export interface ClassroomPersonDetection {
  label: 'person';
  confidence: number;
  box: [number, number, number, number];
}

interface GeminiGenerateOptions {
  images?: string[];
  json?: boolean;
  model?: string;
  system?: string;
  timeoutMs?: number;
}

function stripDataUrl(imageBase64: string): {data: string; mimeType: string} {
  const match = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
  return match ? {mimeType: match[1], data: match[2]} : {mimeType: 'image/jpeg', data: imageBase64};
}

async function generateWithGemini(prompt: string, options: GeminiGenerateOptions = {}): Promise<string> {
  if (!ai) throw new Error('gemini not configured');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const fullPrompt = [options.system, prompt, options.json ? '請只輸出 JSON，不要 Markdown。' : ''].filter(Boolean).join('\n\n');
  try {
    const parts = [
      {text: fullPrompt},
      ...(options.images ?? []).map((image) => {
        const media = stripDataUrl(image);
        return createPartFromBase64(media.data, media.mimeType);
      }),
    ];
    const request = ai.models.generateContent({
      model: options.model ?? ((options.images?.length ?? 0) > 0 ? geminiVisionModel : geminiModel),
      contents: [{role: 'user', parts}],
      config: {
        temperature: options.json ? 0.2 : 0.45,
        responseMimeType: options.json ? 'application/json' : undefined,
      },
    });
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('gemini timeout')), options.timeoutMs ?? 12000);
      }),
    ]);
    const text = response.text ?? '';
    if (!text.trim()) throw new Error('empty gemini response');
    return text.trim();
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseJsonObject<T>(rawText: string): T {
  const raw = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('no json');
  return JSON.parse(jsonMatch[0]) as T;
}

export async function classifyVisionScene(imageBase64: string): Promise<{scene: VisionSceneLabel; confidence: number; zone: string; summary: string; source: 'gemini' | 'local'}> {
  const zonePool = ['A 棟穿堂', 'B 棟走廊', '五年級教室', '操場入口', '福利社前'];
  try {
    const prompt = `請分析這張台灣國小校園照片，選出最符合的場景類別，輸出純 JSON（不含任何說明文字）：

類別（只能選一個）：
- crowd   → 走廊擁擠、下課人潮、集合排隊、多人聚集
- safety  → 通道阻塞、地面危險、異常聚集、暗區、跌倒風險
- cleaning → 地面髒污、水漬、廢棄物、明顯清掃需求
- delivery → 便當箱、包裹、取物區、教室發送物品情境
- patrol  → 空曠走廊、操場、無特殊事件的一般環境

{"scene":"<類別>","confidence":<0-100整數，反映你的確信度>,"zone":"<一個繁體中文地點，如「B棟走廊」>","summary":"<一句繁體中文，具體描述畫面情境和建議行動>"}`;

    const rawText = await generateWithGemini(prompt, {
      images: [imageBase64],
      json: true,
      system: '你是台灣國小校園服務機器人的視覺 AI 模組，專門分析校園安全與服務需求。分析要精確、快速，只回傳 JSON。',
    });
    const parsed = parseJsonObject<{scene?: string; confidence?: number; zone?: string; summary?: string}>(rawText);
    const scene = VALID_SCENE_LABELS.includes(parsed.scene as VisionSceneLabel) ? parsed.scene as VisionSceneLabel : 'patrol';
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, parsed.confidence)) : 75;
    const zone = typeof parsed.zone === 'string' && parsed.zone ? parsed.zone : zonePool[Math.floor(Math.random() * zonePool.length)];
    const summary = typeof parsed.summary === 'string' && parsed.summary ? parsed.summary : '';
    return {scene, confidence, zone, summary, source: 'gemini'};
  } catch {
    return {scene: 'patrol', confidence: 60, zone: zonePool[Math.floor(Math.random() * zonePool.length)], summary: '（Gemini 辨識失敗，使用預設場景）', source: 'local'};
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stripPeopleCounts(text: string): string {
  return text
    .replace(/\d+\s*(?:人|位)(?:學生|人物|老師|師生)?/g, '多位學生')
    .replace(/約\s*多位學生/g, '多位學生')
    .trim();
}

function chooseClassroomCount(yoloCount?: number): {studentCount: number; reason: string} {
  const validYolo = typeof yoloCount === 'number' && yoloCount > 0 ? yoloCount : 0;
  return {
    studentCount: validYolo,
    reason: validYolo > 0 ? `人數只採用 YOLO ${validYolo}` : 'YOLO 未偵測到人數',
  };
}

function yoloBoxToPercent(detection: {box: number[]}, imageSize?: {width: number; height: number}) {
  const [x1, y1, x2, y2] = detection.box;
  const width = Math.max(1, imageSize?.width ?? Math.max(x2, 1));
  const height = Math.max(1, imageSize?.height ?? Math.max(y2, 1));
  return {
    x: Math.max(0, Math.min(100, (x1 / width) * 100)),
    y: Math.max(0, Math.min(100, (y1 / height) * 100)),
    width: Math.max(2, Math.min(100, ((x2 - x1) / width) * 100)),
    height: Math.max(2, Math.min(100, ((y2 - y1) / height) * 100)),
  };
}

function estimateLocalFocusScore(cv: ClassroomCvSignals): number {
  const focusBase = 82 + (cv.postureSignal === 'upright' ? 8 : cv.postureSignal === 'low' ? -16 : -4);
  const motionPenalty = cv.motionLevel > 62 ? 17 : cv.motionLevel > 42 ? 8 : 0;
  return clampScore(focusBase - motionPenalty + (cv.estimatedPeople >= 10 ? 3 : 0));
}

function sortYoloDetectionsForPrompt(detections: YoloClassroomResult['detections'], imageSize?: {width: number; height: number}) {
  const height = Math.max(1, imageSize?.height ?? 768);
  return [...detections].sort((a, b) => {
    const aCenterY = ((a.box[1] ?? 0) + (a.box[3] ?? 0)) / 2;
    const bCenterY = ((b.box[1] ?? 0) + (b.box[3] ?? 0)) / 2;
    const aRow = Math.floor((aCenterY / height) * 8);
    const bRow = Math.floor((bCenterY / height) * 8);
    if (aRow !== bRow) return aRow - bRow;
    return (a.box[0] ?? 0) - (b.box[0] ?? 0);
  });
}

function promptYoloResult(yolo?: YoloClassroomResult | null): YoloClassroomResult | null {
  if (!yolo) return null;
  return {
    ...yolo,
    detections: sortYoloDetectionsForPrompt(
      yolo.detections.filter((d) => d.label === 'person' && Array.isArray(d.box) && d.box.length === 4),
      yolo.imageSize,
    ),
  };
}

function mergeVisualAlerts(
  primary?: ClassroomVisualAlertDraft[],
  secondary?: ClassroomVisualAlertDraft[],
): ClassroomVisualAlertDraft[] | undefined {
  const labels = new Set<ClassroomVisualAlertLabel>(['疑似滑手機', '疑似睡覺', '疑似舉手', '分心躁動']);
  const merged = new Map<ClassroomVisualAlertLabel, ClassroomVisualAlertDraft>();
  [...(primary ?? []), ...(secondary ?? [])].forEach((item) => {
    if (!item || !labels.has(item.label)) return;
    const current = merged.get(item.label);
    if (current && ((current.personIds?.length ?? 0) > 0 || (current.boxes?.length ?? 0) > 0)) {
      if (!current.message && item.message) current.message = item.message;
      return;
    }
    const personIds = [...new Set([...(current?.personIds ?? []), ...(item.personIds ?? [])]
      .map((id) => Math.round(Number(id)))
      .filter((id) => id > 0))];
    merged.set(item.label, {
      label: item.label,
      message: current?.message || item.message,
      personIds,
      boxes: [...(current?.boxes ?? []), ...(item.boxes ?? [])],
    });
  });
  const alerts = [...merged.values()].filter((item) => (item.personIds?.length ?? 0) > 0 || (item.boxes?.length ?? 0) > 0);
  return alerts.length ? alerts : undefined;
}

function normalizeClassroomResult(input: Partial<ClassroomAnalysisResult>, cv: ClassroomCvSignals, source: 'gemini' | 'ollama' | 'local', yolo?: YoloClassroomResult | null): ClassroomAnalysisResult {
  const allowedEmotion: ClassroomEmotion[] = ['engaged', 'neutral', 'tired', 'confused', 'distracted'];
  const allowedMotion: ClassroomMotion[] = ['calm', 'active', 'restless'];
  const emotion = allowedEmotion.includes(input.emotion as ClassroomEmotion) ? input.emotion as ClassroomEmotion : 'neutral';
  const motion = allowedMotion.includes(input.motion as ClassroomMotion) ? input.motion as ClassroomMotion : 'calm';
  const labels: Record<ClassroomEmotion, string> = {
    engaged: '投入',
    neutral: '穩定',
    tired: '疲倦',
    confused: '困惑',
    distracted: '分心',
  };
  const llmCount = Math.max(0, Math.min(45, Math.round(Number(input.studentCount ?? cv.estimatedPeople ?? 0))));
  const cvCount = Math.max(0, Math.min(45, Math.round(Number(cv.estimatedPeople ?? 0))));
  const normalizedYoloCount = typeof yolo?.yoloPersonCount === 'number' ? Math.max(0, Math.min(45, Math.round(yolo.yoloPersonCount))) : undefined;
  const countDecision = chooseClassroomCount(normalizedYoloCount);
  const studentCount = countDecision.studentCount;
  const rawFocusScore = Number(input.focusScore);
  const focusScore = clampScore(
    source !== 'local' && Number.isFinite(rawFocusScore) && rawFocusScore > 0
      ? rawFocusScore
      : Number.isFinite(rawFocusScore) && rawFocusScore > 0
        ? rawFocusScore
        : estimateLocalFocusScore(cv),
  );
  const evidence = Array.isArray(input.evidence) && input.evidence.length
    ? input.evidence.map(String).filter((item) => !/^採用 LLM \d+/.test(item)).slice(0, 4)
    : (cv.evidence ?? ['CV 訊號不足']);
  const summary = typeof input.summary === 'string' && input.summary
    ? stripPeopleCounts(input.summary)
    : `LLM 判讀：專注度 ${focusScore}%，氛圍為${typeof input.emotionLabel === 'string' && input.emotionLabel ? input.emotionLabel : labels[emotion]}。`;
  const learningAlerts = Array.isArray(input.learningAlerts)
    ? input.learningAlerts
      .map((item) => ({
        label: String((item as {label?: unknown}).label ?? '').slice(0, 24),
        detail: String((item as {detail?: unknown}).detail ?? '').slice(0, 120),
      }))
      .filter((item) => item.label && item.detail)
      .slice(0, 3)
    : undefined;
  const validAlertLabels = new Set<ClassroomVisualAlertLabel>(['疑似滑手機', '疑似睡覺', '疑似舉手', '分心躁動']);
  const visualAlerts = Array.isArray(input.visualAlerts)
    ? input.visualAlerts
      .filter((item) => item && validAlertLabels.has(item.label))
      .map((item) => ({
        label: item.label,
        message: typeof item.message === 'string' && item.message ? item.message : `${item.label}，請老師確認。`,
        boxes: [
          ...(Array.isArray(item.personIds) && yolo
            ? item.personIds
              .map((id) => yolo.detections[Math.max(0, Math.round(Number(id)) - 1)])
              .filter((d): d is {label: string; confidence: number; box: number[]} => Boolean(d) && Array.isArray(d.box) && d.box.length === 4)
              .map((d) => yoloBoxToPercent(d, yolo.imageSize))
            : []),
          ...(Array.isArray(item.boxes) ? item.boxes : [])
          .map((box) => {
            const raw = {
              x: Number(box.x) || 0,
              y: Number(box.y) || 0,
              width: Number(box.width) || 0,
              height: Number(box.height) || 0,
            };
            const scale = raw.x <= 1.5 && raw.y <= 1.5 && raw.width <= 1.5 && raw.height <= 1.5 ? 100 : 1;
            return {
              x: Math.max(0, Math.min(100, raw.x * scale)),
              y: Math.max(0, Math.min(100, raw.y * scale)),
              width: Math.max(2, Math.min(100, raw.width * scale)),
              height: Math.max(2, Math.min(100, raw.height * scale)),
            };
          })
        ]
          .filter((box, index, list) => box.width > 2 && box.height > 2 && list.findIndex((other) => Math.abs(other.x - box.x) < 1 && Math.abs(other.y - box.y) < 1) === index)
          .slice(0, 12),
      }))
      .slice(0, 4)
    : undefined;
  return {
    studentCount,
    llmStudentCount: llmCount,
    cvStudentCount: cvCount,
    yoloStudentCount: normalizedYoloCount,
    focusScore,
    emotion,
    emotionLabel: typeof input.emotionLabel === 'string' && input.emotionLabel ? input.emotionLabel : labels[emotion],
    motion,
    summary,
    evidence: [countDecision.reason, ...evidence].slice(0, 4),
    learningAlerts,
    visualAlerts,
    source,
  };
}

function localClassroomAnalysis(cv: ClassroomCvSignals): ClassroomAnalysisResult {
  const focusScore = estimateLocalFocusScore(cv);
  const emotion: ClassroomEmotion = focusScore >= 84 ? 'engaged' : focusScore >= 70 ? 'neutral' : cv.postureSignal === 'low' ? 'tired' : 'distracted';
  const motion: ClassroomMotion = cv.motionLevel > 62 ? 'restless' : cv.motionLevel > 36 ? 'active' : 'calm';
  return normalizeClassroomResult({
    studentCount: cv.estimatedPeople,
    focusScore,
    emotion,
    motion,
    summary: `本地影像訊號顯示動作量 ${cv.motionLevel}，專注度約 ${focusScore}%。`,
    evidence: cv.evidence ?? [],
  }, cv, 'local');
}

function normalizeYoloResult(parsed: Partial<YoloClassroomResult> & {ok?: boolean}): YoloClassroomResult | null {
  if (!parsed.ok || typeof parsed.yoloPersonCount !== 'number') return null;
  return {
    yoloPersonCount: Math.max(0, Math.min(60, Math.round(parsed.yoloPersonCount))),
    imageSize: parsed.imageSize && typeof parsed.imageSize.width === 'number' && typeof parsed.imageSize.height === 'number'
      ? {width: parsed.imageSize.width, height: parsed.imageSize.height}
      : undefined,
    detections: Array.isArray(parsed.detections) ? parsed.detections : [],
  };
}

function stopYoloWorker() {
  pendingYoloRequests.forEach((request) => {
    clearTimeout(request.timeout);
    request.resolve(null);
  });
  pendingYoloRequests.clear();
  yoloWorkerReady = false;
  yoloWorkerBooting = false;
  yoloWorkerBuffer = '';
  const worker = yoloWorker;
  yoloWorker = null;
  worker?.kill();
}

function handleYoloWorkerLine(line: string) {
  if (!line.trim()) return;
  let parsed: (Partial<YoloClassroomResult> & {id?: string; ok?: boolean; ready?: boolean}) | null = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (parsed.ready) {
    yoloWorkerReady = true;
    yoloWorkerBooting = false;
    return;
  }
  if (!parsed.id) return;
  const pending = pendingYoloRequests.get(parsed.id);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingYoloRequests.delete(parsed.id);
  pending.resolve(normalizeYoloResult(parsed));
}

function ensureYoloWorker() {
  if (!yoloWorkerEnabled || yoloWorker || yoloWorkerBooting) return;
  const python = resolvePythonCommand();
  if (!python) return;
  yoloWorkerBooting = true;
  const scriptPath = fileURLToPath(new URL('./classroom_yolo_worker.py', import.meta.url));
  yoloWorker = spawn(python.command, [...python.args, scriptPath], {stdio: ['pipe', 'pipe', 'pipe']});
  yoloWorker.stdout.on('data', (chunk: Buffer) => {
    yoloWorkerBuffer += chunk.toString('utf8');
    let newline = yoloWorkerBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = yoloWorkerBuffer.slice(0, newline);
      yoloWorkerBuffer = yoloWorkerBuffer.slice(newline + 1);
      handleYoloWorkerLine(line);
      newline = yoloWorkerBuffer.indexOf('\n');
    }
  });
  yoloWorker.stderr.on('data', () => {});
  yoloWorker.on('error', () => stopYoloWorker());
  yoloWorker.on('exit', () => stopYoloWorker());
}

async function runYoloWorker(imageBase64: string, options: YoloRunOptions = {}): Promise<YoloClassroomResult | null> {
  if (!yoloWorkerEnabled) return null;
  ensureYoloWorker();
  if (!yoloWorker) return null;
  const id = String(++yoloRequestSeq);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingYoloRequests.delete(id);
      resolve(null);
    }, yoloWorkerReady ? yoloWorkerTimeoutMs : Math.max(yoloWorkerTimeoutMs, 20000));
    pendingYoloRequests.set(id, {resolve, timeout});
    try {
      yoloWorker?.stdin.write(`${JSON.stringify({id, imageBase64, ...options})}\n`);
    } catch {
      clearTimeout(timeout);
      pendingYoloRequests.delete(id);
      resolve(null);
    }
  });
}

async function runYoloClassroomScript(imageBase64: string, options: YoloRunOptions = {}): Promise<YoloClassroomResult | null> {
  const workerResult = await runYoloWorker(imageBase64, options);
  if (workerResult) return workerResult;
  const python = resolvePythonCommand();
  if (!python) return null;
  const scriptPath = fileURLToPath(new URL('./classroom_yolo_llm.py', import.meta.url));
  return new Promise((resolve) => {
    const child = execFile(
      python.command,
      [...python.args, scriptPath],
      {timeout: 12000, maxBuffer: 1024 * 1024},
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim()) as Partial<YoloClassroomResult> & {ok?: boolean};
          resolve(normalizeYoloResult(parsed));
        } catch {
          resolve(null);
        }
      },
    );
    child.stdin?.end(JSON.stringify({imageBase64, ...options}));
  });
}

function resolvePythonCommand(): {command: string; args: string[]} | null {
  if (pythonCommandCache !== undefined) return pythonCommandCache;
  const configured = process.env.YOLO_PYTHON?.trim() || process.env.PYTHON?.trim();
  const candidates: Array<{command: string; args: string[]}> = [
    ...(configured ? [{command: configured, args: []}] : []),
    ...(process.platform === 'win32'
      ? [
          {command: 'py', args: ['-3']},
          {command: 'python', args: []},
          {command: 'python3', args: []},
        ]
      : [
          {command: 'python3', args: []},
          {command: 'python', args: []},
        ]),
  ];

  pythonCommandCache = null;
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, '--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    if (result.status === 0) {
      pythonCommandCache = candidate;
      break;
    }
  }
  return pythonCommandCache;
}

export async function detectClassroomPeople(imageBase64: string, options: YoloRunOptions = {}): Promise<{detections: ClassroomPersonDetection[]; source: 'yolo' | 'local'}> {
  const yolo = await runYoloClassroomScript(imageBase64, options);
  if (!yolo) return {detections: [], source: 'local'};
  const detections = yolo.detections
    .filter((d) => d.label === 'person' && Array.isArray(d.box) && d.box.length === 4)
    .map((d) => ({
      label: 'person' as const,
      confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)),
      box: d.box.map((v) => Math.max(0, Math.round(Number(v) || 0))).slice(0, 4) as [number, number, number, number],
    }));
  return {detections, source: 'yolo'};
}

async function detectClassroomVisualAlerts(imageBase64: string, yolo?: YoloClassroomResult | null): Promise<ClassroomVisualAlertDraft[] | undefined> {
  if (!ai) return undefined;
  const prompt = `你是教室即時告警分析模組。請檢查照片中是否有疑似滑手機、疑似睡覺、疑似舉手。這是老師複核用的「疑似告警」，只要畫面合理可疑就要列出，不要因為無法百分百確定而省略。

逐類掃描：
1. 先找疑似滑手機：手上拿手機/平板、低頭看螢幕、桌上或手中有明顯黑色/藍色長方形裝置且正在操作。
2. 再找疑似睡覺：頭趴在桌上、側臉貼桌面、上半身明顯伏在桌面。只要頭部貼近桌面或趴在手臂上，就列入疑似睡覺。
3. 再找疑似舉手：手掌或手臂舉高過肩膀或頭部，像是在發問、求助或回應。

輸出規則：
- 每一種狀況最多回傳一則 visualAlerts。
- 不要輸出 boxes、personIds、座標或畫框資料。
- 若完全沒有該狀況，不要回傳該 label。
- message 要用繁體中文簡短寫出大概位置、狀況與建議確認，例如「畫面右後方有學生趴在桌上，請老師確認。」。

只輸出 JSON：
{"visualAlerts":[{"label":"疑似滑手機","message":"畫面右側有學生疑似使用手機，請老師確認。"},{"label":"疑似睡覺","message":"畫面後方有學生疑似趴睡，請老師確認。"},{"label":"疑似舉手","message":"畫面中央有學生疑似舉手，請老師留意。"}]}`;

  const rawText = await generateWithGemini(prompt, {
    images: [imageBase64],
    json: true,
    model: geminiVisionModel,
    system: '你是低干擾、非身分辨識的教室行為告警模組。只回傳 JSON。',
    timeoutMs: 14000,
  });
  const parsed = parseJsonObject<{visualAlerts?: ClassroomVisualAlertDraft[]}>(rawText);
  return Array.isArray(parsed.visualAlerts) ? parsed.visualAlerts : undefined;
}

export async function analyzeClassroomTeachingFrame(
  imageBase64: string,
  cv: ClassroomCvSignals,
  yolo?: YoloClassroomResult | null,
): Promise<ClassroomAnalysisResult> {
  const analysisCv: ClassroomCvSignals = cv;

  try {
    const prompt = `請分析這張國小教室照片的學習氛圍。不要估算人數，不要辨識個人身份。只輸出 JSON。

focusScore 必須是你依照片判斷出的實際 0-100 分數，不可照抄 0；除非全班完全無法學習，否則不要給 0。
summary 必須依序描述畫面左側、中間、右側的課堂狀況，用「左側：... 中間：... 右側：...」格式；不要提分數、人數、模型或偵測來源。

格式如下，請替換所有範例值：
{"studentCount":0,"focusScore":65,"emotion":"engaged|neutral|tired|confused|distracted","emotionLabel":"繁中短詞","motion":"calm|active|restless","summary":"左側：... 中間：... 右側：...","evidence":["2-4個照片線索"],"learningAlerts":[{"label":"短標題","detail":"根據照片狀況給老師的具體建議"}],"visualAlerts":[]}

learningAlerts 請回 1-3 則，不要使用制式句「目前專注度 X%，維持原教學節奏」。`;

    const rawText = await generateWithGemini(prompt, {
      images: [imageBase64],
      json: true,
      system: '你是低干擾、非身分辨識的教室視覺分析模組。只回傳 JSON。',
      timeoutMs: 30000,
    });
    const parsed = parseJsonObject<Partial<ClassroomAnalysisResult>>(rawText);
    return normalizeClassroomResult(parsed, analysisCv, 'gemini', yolo ?? null);
  } catch {
    return normalizeClassroomResult(localClassroomAnalysis(analysisCv), analysisCv, 'local', yolo ?? null);
  }
}

export async function analyzeClassroomVisualAlerts(imageBase64: string): Promise<{visualAlerts: ClassroomAnalysisResult['visualAlerts']; source: 'gemini' | 'local'}> {
  const visualAlerts = await detectClassroomVisualAlerts(imageBase64, null).catch(() => undefined);
  const validAlertLabels = new Set<ClassroomVisualAlertLabel>(['疑似滑手機', '疑似睡覺', '疑似舉手', '分心躁動']);
  const normalized = Array.isArray(visualAlerts)
    ? visualAlerts
      .filter((item) => item && validAlertLabels.has(item.label))
      .map((item) => ({
        label: item.label,
        message: typeof item.message === 'string' && item.message ? item.message : `${item.label}，請老師確認。`,
        boxes: [],
      }))
      .slice(0, 4)
    : [];
  return {visualAlerts: normalized, source: normalized.length ? 'gemini' : 'local'};
}

export async function analyzeDeliveryTask(context: DeliveryContext): Promise<{reply: string; source: 'gemini' | 'local'}> {
  try {
    const prompt = [
      '你是校園服務機器人 AI 助手，協助老師決策配送任務。請用 1-2 句繁體中文給出配送建議。',
      context.destination ? `目的地：${context.destination}` : '',
      context.command ? `指令：${context.command}` : '',
      context.taskDescription ? `任務描述：${context.taskDescription}` : '',
      context.userMessage ? `老師詢問：${context.userMessage}` : '',
    ].filter(Boolean).join('\n');

    const text = await generateWithGemini(prompt, {
      system: '你是校園服務機器人 AI 助手，使用繁體中文、短句、可執行建議。',
    });
    if (!text) throw new Error('empty response');
    return {reply: text, source: 'gemini'};
  } catch {
    return {reply: localDeliveryReply(), source: 'local'};
  }
}

export async function generateTeachingText(prompt: string): Promise<{text: string; source: 'gemini' | 'local'}> {
  try {
    const text = await generateWithGemini(prompt, {
      system: '你是國小校園服務機器人的教學助手。請用自然、簡短、繁體中文回答。',
      timeoutMs: 10000,
    });
    return {text, source: 'gemini'};
  } catch {
    return {text: '', source: 'local'};
  }
}

function classroomAlertFallback(message: string): string {
  const segments = message
    .split(/[；;。]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = (segments.length ? segments : [message]).flatMap((part) => {
    const area = /左側|左邊|左方|左前|左後/.test(part)
      ? '左邊'
      : /右側|右邊|右方|右前|右後/.test(part)
        ? '右邊'
        : /中間|中央|中排|正中/.test(part)
          ? '中間'
          : '';
    if (/手機|滑手機|電子裝置/.test(part)) return [`${area || '同學'}別玩手機`];
    if (/睡|趴|低頭/.test(part)) return [`${area || '同學'}打起精神`];
    return [];
  });
  return parts.length ? `${parts.slice(0, 2).join('，')}。` : '上課要專心，先看老師這邊。';
}

export async function generateRobotDisplayReply(context: {
  message: string;
  kind?: 'chat' | 'classroom-alert' | 'delivery' | string;
}): Promise<{message: string; emotion: string; source: 'gemini' | 'local'}> {
  const kind = typeof context.kind === 'string' ? context.kind : 'chat';
  const userMessage = typeof context.message === 'string' ? context.message.trim().slice(0, 1000) : '';
  if (!userMessage) {
    return {message: '我在這裡，準備好了！', emotion: 'happy', source: 'local'};
  }

  const isClassroomAlert = kind === 'classroom-alert';
  const fallback = isClassroomAlert
    ? classroomAlertFallback(userMessage)
    : '收到，我會用最簡單的方式幫你說明。';

  try {
    const prompt = isClassroomAlert
      ? [
          '請替國小校園服務機器人的螢幕產生一句課堂提醒。',
          '情境是老師端偵測到學生可能上課玩手機、趴睡或分心。',
          '你必須根據偵測訊息中的畫面位置回覆，例如左側/中間/右側/左前方/右後方。',
          '如果左邊有人玩手機，就說「左邊同學別玩手機」；如果右邊有人趴睡，就說「右邊同學打起精神」。',
          '如果偵測訊息包含舉手或求助，請忽略，不要在生氣提醒中提到舉手。',
          '如果同時有多個狀況，最多合併提醒兩個位置；不要提「畫面偵測」。',
          '語氣可以有一點嚴肅和可愛，但不要羞辱、不要威脅、不要點名個人。',
          '句子要短，32 字以內，繁體中文。',
          `偵測訊息：${userMessage}`,
          '只輸出 JSON：{"emotion":"angry","message":"提醒內容"}',
        ].join('\n')
      : [
          '你是國小校園服務機器人的前端螢幕角色，回答要短、親切、繁體中文。',
          '請依使用者訊息選一個 emotion，並產生 1 句 35 字以內回答。',
          'emotion 只能是 neutral, happy, sad, angry, surprised, love, sleepy, cool, thinking, wink, excited, crying 其中之一。',
          `使用者訊息：${userMessage}`,
          '只輸出 JSON：{"emotion":"happy","message":"回答內容"}',
        ].join('\n');
    const rawText = await generateWithGemini(prompt, {
      json: true,
      system: '你是機器人顯示端的簡短回覆產生器。只能回 JSON。',
      timeoutMs: 10000,
    });
    const parsed = parseJsonObject<{emotion?: string; message?: string}>(rawText);
    const allowed = new Set(['neutral', 'happy', 'sad', 'angry', 'surprised', 'love', 'sleepy', 'cool', 'thinking', 'wink', 'excited', 'crying']);
    const emotion = allowed.has(String(parsed.emotion)) ? String(parsed.emotion) : isClassroomAlert ? 'angry' : 'happy';
    const message = typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim().slice(0, 80) : fallback;
    return {message, emotion, source: 'gemini'};
  } catch {
    return {message: fallback, emotion: isClassroomAlert ? 'angry' : 'happy', source: 'local'};
  }
}
