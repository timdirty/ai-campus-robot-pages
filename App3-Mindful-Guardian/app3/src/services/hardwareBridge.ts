import type {DetectedPort, GuardianAlert, ZoneSensorReading} from '../types';
import {createDemoZoneSensorReadings} from './schoolSpaces';

const BRIDGE_URL =
  ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_ARDUINO_BRIDGE_URL) ||
  'http://localhost:3203';
const STATIC_DEMO = ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_STATIC_DEMO) === '1';
const STATIC_SNAPSHOT_KEY = 'app3:static-demo:guardian-snapshot';
const STATIC_ASSIGNMENT_KEY = 'app3:static-demo:robot-assignment';
const STATIC_CHANNEL = 'app3-static-demo-sync';

export type RobotDisplayClient = {
  id: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
  lastSeen: string;
};

export type RobotDisplayStatus = {
  clients: number;
  displays: RobotDisplayClient[];
};

export type RobotDisplayPairingInfo = {
  ip: string;
  bridgePort: number;
  vitePort: number;
  robotDisplayUrl: string;
  protocol?: string;
};

function withTimeout(ms: number): {signal: AbortSignal; clear: () => void} {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return {signal: controller.signal, clear: () => clearTimeout(id)};
}

function broadcastStaticDisplayEvent(payload: Record<string, unknown>) {
  if (!STATIC_DEMO || typeof window === 'undefined') return;
  try {
    const channel = new BroadcastChannel(STATIC_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // BroadcastChannel is a progressive enhancement; localStorage remains the fallback.
  }
}

function buildStaticPairingUrl(): string {
  if (typeof window === 'undefined') return './robot-display.html';
  return new URL('robot-display.html', window.location.href).toString();
}

function localZoneInsight(payload: ZoneInsightRequest): ZoneInsightResponse {
  const statusOnly = payload.mode === 'status';
  const sensor = payload.sensor;
  const zoneId = payload.zoneId;
  const tempMax = zoneId === 'zone-field' ? 32 : 28;
  const humMax = zoneId === 'zone-library' ? 50 : zoneId === 'zone-field' ? 75 : 60;
  const lightMin = zoneId === 'zone-field' ? 700 : zoneId === 'zone-library' ? 650 : 500;
  const temp = typeof sensor?.temperature === 'number' ? sensor.temperature : 0;
  const hum = typeof sensor?.humidity === 'number' ? sensor.humidity : 0;
  const light = typeof sensor?.light === 'number' ? sensor.light : 0;
  const score = Math.min(100, Math.round(18 + Math.max(0, temp - tempMax) * 10 + Math.max(0, hum - humMax) * 2 + Math.max(0, lightMin - light) / 10 + Math.max(0, payload.alertCount) * 8));
  const riskLevel = score >= 68 ? 'high' : score >= 45 ? 'medium' : 'low';
  const statusLabel = riskStatusLabel(riskLevel);
  return {
    ok: true,
    source: 'fallback',
    model: null,
    riskLevel,
    statusLabel,
    confidence: score,
    summary: statusOnly ? '' : `${payload.zoneName}目前判定為「${statusLabel}」，由線上練習版本機 AI 依感測器、節點與提醒數整理。`,
    situations: statusOnly ? [] : [
      `溫度 ${temp.toFixed(1)}°C、濕度 ${Math.round(hum)}%、光照 ${Math.round(light)}。`,
      riskLevel === 'low' ? '目前數值落在穩定範圍。' : '數值或提醒已有偏移，適合練習派遣與老師接手流程。',
    ],
    suggestions: statusOnly ? [] : [
      riskLevel === 'high' ? '請優先派機器人到場，並準備通知值週老師。' : '先觀察 1 到 3 分鐘，必要時派機器人前往確認。',
    ],
    error: 'GitHub Pages 線上練習模式',
  };
}

function localCampusEvent(payload: CampusEventAssessmentRequest): ZoneInsightResponse {
  const highRisk = /打架|推擠|攻擊|自傷|霸凌|受傷|失控|威脅|生氣|憤怒|哭|崩潰/.test(payload.eventText);
  const riskLevel = highRisk ? 'high' : 'medium';
  const statusLabel = riskStatusLabel(riskLevel);
  return {
    ok: true,
    source: 'fallback',
    model: null,
    riskLevel,
    statusLabel,
    confidence: highRisk ? 86 : 64,
    summary: `${payload.zoneName}新增事件判定為「${statusLabel}」。`,
    situations: [
      highRisk ? '事件內容包含衝突、失控或安全疑慮，建議立即到場確認。' : '事件需要老師確認，但尚未出現立即危險訊號。',
      payload.eventText.slice(0, 90),
    ],
    suggestions: [
      '請值週老師或機器人先前往確認現場。',
      '若學生情緒明顯低落、憤怒或有衝突跡象，請通知導師或輔導室接手。',
    ],
    error: 'GitHub Pages 線上練習模式',
  };
}

export async function fetchZoneSensors(): Promise<ZoneSensorReading[]> {
  if (STATIC_DEMO) return createDemoZoneSensorReadings();
  const {signal, clear} = withTimeout(2000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/sensors/live`, {signal});
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload.zones) ? payload.zones : [];
  } catch {
    return [];
  } finally {
    clear();
  }
}

export async function fetchBridgeHealth(): Promise<boolean> {
  if (STATIC_DEMO) return true;
  const {signal, clear} = withTimeout(1600);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/health`, {signal});
    return response.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

export async function fetchRobotDisplayClientCount(): Promise<number> {
  const status = await fetchRobotDisplayStatus();
  return status.clients;
}

export async function fetchRobotDisplayStatus(): Promise<RobotDisplayStatus> {
  if (STATIC_DEMO) {
    return {
      clients: 1,
      displays: [{
        id: 'static-practice-robot',
        ip: 'github-pages',
        userAgent: '線上練習版 Robot Display',
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      }],
    };
  }
  const {signal, clear} = withTimeout(1600);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/display/status`, {signal});
    if (!response.ok) return {clients: 0, displays: []};
    const payload = await response.json().catch(() => ({}));
    const clients = typeof payload.clients === 'number' && Number.isFinite(payload.clients) ? Math.max(0, payload.clients) : 0;
    const displays = Array.isArray(payload.displays)
      ? payload.displays.map((display: Partial<RobotDisplayClient>, index: number) => ({
        id: typeof display.id === 'string' ? display.id : `frontend-${index + 1}`,
        ip: typeof display.ip === 'string' ? display.ip : 'unknown',
        userAgent: typeof display.userAgent === 'string' ? display.userAgent : 'unknown',
        connectedAt: typeof display.connectedAt === 'string' ? display.connectedAt : '',
        lastSeen: typeof display.lastSeen === 'string' ? display.lastSeen : '',
      }))
      : [];
    return {clients, displays};
  } catch {
    return {clients: 0, displays: []};
  } finally {
    clear();
  }
}

export async function fetchRobotDisplayPairingInfo(): Promise<RobotDisplayPairingInfo | null> {
  if (STATIC_DEMO) {
    return {
      ip: typeof window !== 'undefined' ? window.location.hostname : 'github-pages',
      bridgePort: 0,
      vitePort: 0,
      robotDisplayUrl: buildStaticPairingUrl(),
      protocol: typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'https',
    };
  }
  const {signal, clear} = withTimeout(2400);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/display/info`, {signal});
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return {
      ip: typeof payload.ip === 'string' ? payload.ip : '',
      bridgePort: typeof payload.bridgePort === 'number' ? payload.bridgePort : 3203,
      vitePort: typeof payload.vitePort === 'number' ? payload.vitePort : 3001,
      robotDisplayUrl: typeof payload.robotDisplayUrl === 'string' ? payload.robotDisplayUrl : '',
      protocol: typeof payload.protocol === 'string' ? payload.protocol : undefined,
    };
  } catch {
    return null;
  } finally {
    clear();
  }
}

export async function fetchSensorPorts(): Promise<DetectedPort[]> {
  if (STATIC_DEMO) return [];
  const {signal, clear} = withTimeout(2000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/sensors/ports`, {signal});
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload.ports) ? payload.ports : [];
  } catch {
    return [];
  } finally {
    clear();
  }
}

export async function assignSensorPort(portPath: string, zoneId: string | null): Promise<boolean> {
  if (STATIC_DEMO) return Boolean(portPath || zoneId);
  const {signal, clear} = withTimeout(2000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/sensors/assign`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(zoneId ? {portPath, zoneId} : {portPath, unassign: true}),
      signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

export async function fetchDrivePorts(): Promise<{ports: DetectedPort[]; assignedPath: string | null; connected: boolean}> {
  if (STATIC_DEMO) return {ports: [], assignedPath: null, connected: false};
  const {signal, clear} = withTimeout(2000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/drive/ports`, {signal});
    if (!response.ok) return {ports: [], assignedPath: null, connected: false};
    const payload = await response.json().catch(() => ({}));
    return {
      ports: Array.isArray(payload.ports) ? payload.ports : [],
      assignedPath: typeof payload.assignedPath === 'string' ? payload.assignedPath : null,
      connected: payload.connected === true,
    };
  } catch {
    return {ports: [], assignedPath: null, connected: false};
  } finally {
    clear();
  }
}

export async function assignDrivePort(portPath: string | null): Promise<{ok: boolean; message: string}> {
  if (STATIC_DEMO) return {ok: true, message: portPath ? '線上練習模式：已模擬指派底盤板' : '線上練習模式：已清除底盤指派'};
  const {signal, clear} = withTimeout(3000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/drive/assign`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(portPath ? {portPath} : {unassign: true}),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: payload.response || payload.error || (response.ok ? '底盤板已指派' : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError' ? '底盤板指派逾時' : error instanceof Error ? error.message : '無法連接本機硬體服務',
    };
  } finally {
    clear();
  }
}

export async function testDriveMotor(): Promise<{ok: boolean; message: string}> {
  if (STATIC_DEMO) return {ok: true, message: '線上練習模式：底盤馬達測試已模擬完成'};
  const {signal, clear} = withTimeout(7000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/drive/test`, {
      method: 'POST',
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: payload.response || payload.error || (response.ok ? '底盤馬達測試已送出' : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError' ? '底盤測試逾時' : error instanceof Error ? error.message : '無法連接本機硬體服務',
    };
  } finally {
    clear();
  }
}

export async function resetSensorAssignments(): Promise<boolean> {
  if (STATIC_DEMO) return true;
  const {signal, clear} = withTimeout(2000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/sensors/assignments/reset`, {
      method: 'POST',
      signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clear();
  }
}

export async function testSensorLed(portPath: string): Promise<{ok: boolean; message: string}> {
  if (STATIC_DEMO) return {ok: true, message: `線上練習模式：${portPath || 'Demo sensor'} LED 已模擬閃爍`};
  const {signal, clear} = withTimeout(5000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/sensors/test`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({portPath}),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: payload.response || payload.error || (response.ok ? 'LED test sent' : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError' ? '感測器測試逾時' : error instanceof Error ? error.message : '無法連接本機硬體服務',
    };
  } finally {
    clear();
  }
}

async function doGuardianPost(command: string, source: string) {
  if (STATIC_DEMO) {
    return {
      ok: true,
      statusCode: 200,
      message: `線上練習模式：已模擬硬體指令 ${command} (${source})`,
    };
  }
  const {signal, clear} = withTimeout(5000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/robot/command`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command, source}),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      statusCode: response.status,
      message: payload.response || payload.error || payload.status?.lastResponse || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      message: error instanceof Error && error.name === 'AbortError' ? '硬體橋接請求逾時' : error instanceof Error ? error.message : '無法連接本機硬體服務',
    };
  } finally {
    clear();
  }
}

export async function sendGuardianHardwareCommand(command: string, source: string) {
  const first = await doGuardianPost(command, source);
  // Auto-retry once on transient 503/timeout
  if (!first.ok && (first.statusCode === 503 || first.statusCode === 0)) {
    await new Promise((r) => setTimeout(r, 400));
    return doGuardianPost(command, source);
  }
  return first;
}

export async function sendGuardianDriveCommand(command: string) {
  if (STATIC_DEMO) return {ok: true, message: `線上練習模式：已模擬移動指令 ${command}`};
  const {signal, clear} = withTimeout(1800);
  const normalized = command.trim().toUpperCase();
  const driveEndpoint = /^(FORWARD|BACKWARD|LEFT|RIGHT|STOP|HEARTBEAT|PATROL_START|ROBOT_RESUME|ROBOT_PAUSE|SPEED:\d+)$/.test(normalized)
    ? '/api/robot/drive'
    : '/api/robot/command';
  try {
    const response = await fetch(`${BRIDGE_URL}${driveEndpoint}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command: normalized, source: 'app3:drive-dock'}),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      message: payload.error || payload.response || (response.ok ? `Drive ${normalized}` : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError' ? '移動指令逾時' : error instanceof Error ? error.message : '無法連接本機硬體服務',
    };
  } finally {
    clear();
  }
}

export interface GuardianSnapshotPayload {
  emotion: string;
  stress: number;
  stability: number;
  focus: number;
  fusionScore: number;
  signals: {moodScore: number; soundScore: number; nodeScore: number; alertScore: number};
  riskScore: number;
  riskLabel: string;
  moodLabel: string;
  robotActive: boolean;
}

export interface RobotAssignmentPayload {
  zoneId: string;
  zoneName: string;
  location: string;
  riskLevel: 'low' | 'medium' | 'high';
  statusLabel: string;
  stage: string;
  missionId?: string | null;
  active: boolean;
  moving?: boolean;
  travelStartedAt?: string | null;
  travelEndsAt?: string | null;
  fromZoneId?: string | null;
  fromZoneName?: string | null;
  fromLocation?: string | null;
}

export interface ZoneInsightRequest {
  mode?: 'status' | 'detail';
  zoneId: string;
  zoneName: string;
  location: string;
  currentStatusLabel?: string;
  currentRiskLevel?: string;
  ruleBasedScore?: number;
  alertCount: number;
  nodeStatus: string;
  sensor?: {
    temperature: number | null;
    humidity: number | null;
    light: number | null;
    motion?: boolean;
    status?: string;
  };
}

export interface ZoneInsightResponse {
  ok: boolean;
  source: 'google-ai-studio' | 'ollama-gemma' | 'cloud-gemma' | 'fallback' | string;
  model: string | null;
  riskLevel: 'low' | 'medium' | 'high';
  statusLabel: string;
  confidence: number | null;
  summary: string;
  situations: string[];
  suggestions: string[];
  error?: string;
}

export interface CampusEventAssessmentRequest {
  zoneId: string;
  zoneName: string;
  location: string;
  eventText: string;
  source: 'manual' | 'robot-emotion' | string;
}

export interface RobotEmotionEvent {
  id: string;
  zoneId: string;
  zoneName: string;
  location: string;
  emotion: string;
  emotionLabel: string;
  riskLevel: 'medium' | 'high';
  description: string;
  source: string;
  updatedAt: string;
}

function hasMojibake(value: unknown): boolean {
  return typeof value === 'string' && /[�\uE000-\uF8FF]|ï¿½|Ã|Â|[撌瘜隢璈鈭嚗蝘蝣摰雿霈]/.test(value);
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() && !hasMojibake(value) ? value.trim() : fallback;
}

function cleanTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && !hasMojibake(item))
      .map((item) => item.trim())
    : [];
}

function riskStatusLabel(riskLevel: 'low' | 'medium' | 'high'): string {
  if (riskLevel === 'high') return '高風險';
  if (riskLevel === 'low') return '安全';
  return '注意';
}

function normalizeRobotEmotionEvent(event: Partial<RobotEmotionEvent>): RobotEmotionEvent | null {
  if (typeof event.id !== 'string' || typeof event.emotion !== 'string') return null;
  const riskLevel: RobotEmotionEvent['riskLevel'] = event.riskLevel === 'high' ? 'high' : 'medium';
  const emotion = cleanText(event.emotion, 'care_needed');
  return {
    id: cleanText(event.id, `robot-emotion-${Date.now().toString(36)}`),
    zoneId: cleanText(event.zoneId, ''),
    zoneName: cleanText(event.zoneName, '校園區域'),
    location: cleanText(event.location, '校園區域'),
    emotion,
    emotionLabel: cleanText(event.emotionLabel, emotion),
    riskLevel,
    description: cleanText(event.description, '機器人前端回報需要老師確認。'),
    source: cleanText(event.source, 'robot-display'),
    updatedAt: cleanText(event.updatedAt, new Date().toISOString()),
  };
}

export async function pushRobotEmotionEvent(event: Omit<RobotEmotionEvent, 'id' | 'updatedAt'> & {id?: string}): Promise<void> {
  if (STATIC_DEMO) {
    const payload = {
      type: 'robot_emotion_event',
      id: event.id ?? `static-emotion-${Date.now().toString(36)}`,
      updatedAt: new Date().toISOString(),
      ...event,
    };
    try { localStorage.setItem('app3:static-demo:emotion-event', JSON.stringify(payload)); } catch {}
    broadcastStaticDisplayEvent(payload);
    return;
  }
  try {
    await fetch(`${BRIDGE_URL}/api/display/emotion-event`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(event),
    });
  } catch {
    // Robot display notifications are best-effort.
  }
}

export async function fetchZoneInsight(payload: ZoneInsightRequest): Promise<ZoneInsightResponse> {
  if (STATIC_DEMO) return localZoneInsight(payload);
  const statusOnly = payload.mode === 'status';
  const {signal, clear} = withTimeout(statusOnly ? 7000 : 16000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/ai/zone-advisor`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    const riskLevel = result.riskLevel === 'high' || result.riskLevel === 'medium' || result.riskLevel === 'low' ? result.riskLevel : 'medium';
    const fallbackSummary = statusOnly ? '' : '目前沒有可用的 AI 判讀內容。';
    return {
      ok: Boolean(result.ok ?? true),
      source: result.source || 'fallback',
      model: result.model ?? null,
      riskLevel,
      statusLabel: riskStatusLabel(riskLevel),
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
      summary: cleanText(result.summary, fallbackSummary),
      situations: cleanTextList(result.situations),
      suggestions: cleanTextList(result.suggestions),
      error: cleanText(result.error, ''),
    };
  } catch (error) {
    return {
      ok: true,
      source: 'fallback',
      model: null,
      riskLevel: 'medium',
      statusLabel: '注意',
      confidence: null,
      summary: statusOnly ? '' : '本機 AI 備援已接手，請先依目前燈號與現場巡查結果處理。',
      situations: statusOnly ? [] : ['雲端 AI 或橋接服務暫時沒有回應，前端已切換本機備援流程。'],
      suggestions: statusOnly ? [] : ['先完成現場確認與派遣閉環；網路恢復後可再重新判讀。'],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clear();
  }
}

export async function evaluateCampusEvent(payload: CampusEventAssessmentRequest): Promise<ZoneInsightResponse> {
  if (STATIC_DEMO) return localCampusEvent(payload);
  const {signal, clear} = withTimeout(14000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/ai/zone-advisor`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...payload, mode: 'manual_event'}),
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    const riskLevel = result.riskLevel === 'high' ? 'high' : 'medium';
    const statusLabel = riskStatusLabel(riskLevel);
    return {
      ok: Boolean(result.ok ?? true),
      source: result.source || 'fallback',
      model: result.model ?? null,
      riskLevel,
      statusLabel,
      confidence: typeof result.confidence === 'number' ? result.confidence : null,
      summary: cleanText(result.summary, `${payload.zoneName}新增事件已判定為${statusLabel}。`),
      situations: cleanTextList(result.situations),
      suggestions: cleanTextList(result.suggestions),
      error: cleanText(result.error, ''),
    };
  } catch (error) {
    return {
      ok: true,
      source: 'fallback',
      model: null,
      riskLevel: /打架|攻擊|自傷|霸凌|受傷|失控|威脅|生氣|憤怒/.test(payload.eventText) ? 'high' : 'medium',
      statusLabel: /打架|攻擊|自傷|霸凌|受傷|失控|威脅|生氣|憤怒/.test(payload.eventText) ? '高風險' : '注意',
      confidence: null,
      summary: '本機 AI 備援已先完成事件分級並建立提醒。',
      situations: ['雲端 AI 或橋接服務暫時沒有回應，已先以本機關鍵詞規則處理。'],
      suggestions: ['先派機器人或值週老師前往確認，稍後可重新判讀。'],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clear();
  }
}

export async function fetchAlertCareRecommendation(alert: GuardianAlert): Promise<{reply: string; source: string}> {
  if (STATIC_DEMO) {
    const highRisk = alert.riskLevel === 'high';
    return {
      reply: highRisk
        ? '請先由熟悉學生或場域的老師低壓接近，確認安全與是否有立即危險；若出現自傷、衝突或失控跡象，立即通知導師與輔導室接手。'
        : '建議先派老師或機器人到場確認，保持不公開點名、不貼標籤的關懷方式，記錄現場變化後再決定是否升級處理。',
      source: 'fallback',
    };
  }
  const {signal, clear} = withTimeout(12000);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/ai/guardian`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        alertType: alert.type,
        severity: alert.riskLevel,
        zoneName: alert.location,
        category: alert.category,
        className: alert.className,
        studentAlias: alert.studentAlias,
        message: alert.description,
      }),
      signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    const reply = typeof payload.reply === 'string' ? payload.reply.trim() : '';
    if (!reply) throw new Error('empty LLM reply');
    return {reply, source: typeof payload.source === 'string' ? payload.source : 'llm'};
  } catch (error) {
    return {
      reply: '',
      source: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'fallback',
    };
  } finally {
    clear();
  }
}

export async function fetchRobotEmotionEvents(since?: string): Promise<RobotEmotionEvent[]> {
  if (STATIC_DEMO) {
    try {
      const raw = localStorage.getItem('app3:static-demo:emotion-event');
      if (!raw) return [];
      const event = normalizeRobotEmotionEvent(JSON.parse(raw));
      if (!event) return [];
      if (since && event.updatedAt <= since) return [];
      return [event];
    } catch {
      return [];
    }
  }
  const {signal, clear} = withTimeout(2000);
  try {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await fetch(`${BRIDGE_URL}/api/display/emotion-events${qs}`, {signal});
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    if (!Array.isArray(payload.events)) return [];
    return payload.events
      .map((event: Partial<RobotEmotionEvent>) => normalizeRobotEmotionEvent(event))
      .filter((event): event is RobotEmotionEvent => Boolean(event));
  } catch {
    return [];
  } finally {
    clear();
  }
}

export async function pushGuardianSnapshot(payload: GuardianSnapshotPayload): Promise<void> {
  if (STATIC_DEMO) {
    const event = {type: 'guardian_snapshot', ...payload, updatedAt: new Date().toISOString()};
    try { localStorage.setItem(STATIC_SNAPSHOT_KEY, JSON.stringify(event)); } catch {}
    broadcastStaticDisplayEvent(event);
    return;
  }
  try {
    await fetch(`${BRIDGE_URL}/api/display/guardian-snapshot`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Bridge offline is expected during standalone demo — silently ignore
  }
}

export async function pushRobotAssignment(payload: RobotAssignmentPayload): Promise<void> {
  if (STATIC_DEMO) {
    const event = {type: 'robot_assignment', ...payload, updatedAt: new Date().toISOString()};
    try { localStorage.setItem(STATIC_ASSIGNMENT_KEY, JSON.stringify(event)); } catch {}
    broadcastStaticDisplayEvent(event);
    return;
  }
  try {
    await fetch(`${BRIDGE_URL}/api/display/robot-assignment`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1600),
    });
  } catch {
    // Robot display sync is best-effort; the main command center should keep running.
  }
}
