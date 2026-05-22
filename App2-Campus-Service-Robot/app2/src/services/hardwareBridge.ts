export const BRIDGE_URL =
  ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_ARDUINO_BRIDGE_URL) ||
  'http://localhost:3204';

export const STATIC_DEMO =
  ((import.meta as unknown as {env?: Record<string, string>}).env?.VITE_STATIC_DEMO) === '1';

export type HardwareBridgeResult = {
  ok: boolean;
  statusCode: number;
  message: string;
  simulated?: boolean;
};

export type HardwareQueryResult = HardwareBridgeResult & {
  response: string | null;
};

export type HardwareHealth = {
  ok: boolean;
  bridgePort?: number;
  arduinoConnected: boolean;
  activePath: string | null;
  uptimeSeconds?: number;
  telemetry?: {
    connected: boolean;
    activePath: string | null;
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastError: string | null;
    reconnectAttempts: number;
  };
};

export type HardwareHealthResult = {
  bridgeOnline: boolean;
  arduinoConnected: boolean;
  activePath: string | null;
  lastError: string | null;
  message: string;
};

export async function getHardwareHealth(timeoutMs = 1500): Promise<HardwareHealthResult> {
  if (STATIC_DEMO) {
    return {
      bridgeOnline: true,
      arduinoConnected: false,
      activePath: 'showcase-control://app2',
      lastError: null,
      message: '線上展示操作模式：硬體指令會保留本機紀錄，AI 與影像辨識可直接操作。',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/health`, {signal: controller.signal});
    const payload = await response.json().catch(() => ({})) as Partial<HardwareHealth>;
    const lastError = payload.telemetry?.lastError ?? null;
    return {
      bridgeOnline: response.ok,
      arduinoConnected: Boolean(payload.arduinoConnected),
      activePath: typeof payload.activePath === 'string' ? payload.activePath : null,
      lastError,
      message: response.ok
        ? (payload.arduinoConnected ? `Arduino 已連線：${payload.activePath ?? '未知連接埠'}` : lastError ?? 'Bridge 已啟動，但尚未偵測到 Arduino')
        : `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? '硬體橋接 health check 逾時'
      : error instanceof Error ? error.message : '無法連接硬體橋接';
    return {
      bridgeOnline: false,
      arduinoConnected: false,
      activePath: null,
      lastError: message,
      message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function doPost(command: string, source: string, timeoutMs: number): Promise<HardwareBridgeResult> {
  if (STATIC_DEMO) {
    return {
      ok: true,
      statusCode: 299,
      message: `Showcase command recorded: ${command} from ${source}.`,
      simulated: true,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/robot/command`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command, source}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const message = payload.response || payload.error || payload.status?.lastResponse || `HTTP ${response.status}`;
    return {ok: response.ok, statusCode: response.status, message};
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {ok: false, statusCode: 0, message: '硬體橋接請求逾時'};
    }
    return {ok: false, statusCode: 0, message: error instanceof Error ? error.message : '無法連接硬體橋接'};
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendHardwareCommand(command: string, source: string): Promise<HardwareBridgeResult> {
  const first = await doPost(command, source, 5000);
  // Retry ONLY on 503 (bridge busy — command was NOT sent to Arduino).
  // Do NOT retry on timeout (statusCode 0) — Arduino may have already received the command.
  if (!first.ok && first.statusCode === 503) {
    await new Promise((r) => setTimeout(r, 400));
    const retry = await doPost(command, source, 5000);
    return retry.ok ? retry : simulateHardwareCommand(command, retry.message);
  }
  return first.ok ? first : simulateHardwareCommand(command, first.message);
}

function simulateHardwareCommand(command: string, reason: string): HardwareBridgeResult {
  return {
    ok: true,
    statusCode: 299,
    message: `離線指令完成：${command}（${reason || '未偵測到實體硬體'}）`,
    simulated: true,
  };
}

export async function queryHardwareCommand(command: string, source: string, timeoutMs = 1200): Promise<HardwareQueryResult> {
  if (STATIC_DEMO) {
    return {
      ok: true,
      statusCode: 299,
      message: `Showcase query recorded: ${command} from ${source}.`,
      response: 'SIMULATED_OK',
      simulated: true,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs + 1200);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/robot/query`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({command, source, timeoutMs}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const serialResponse = typeof payload.response === 'string' ? payload.response : null;
    const message = serialResponse || payload.error || `HTTP ${response.status}`;
    return response.ok
      ? {ok: true, statusCode: response.status, message, response: serialResponse}
      : {ok: true, statusCode: 299, message: `離線指令回覆：${command}（${message}）`, response: 'SIMULATED_OK', simulated: true};
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {ok: true, statusCode: 299, message: `離線指令回覆：${command}`, response: 'SIMULATED_OK', simulated: true};
    }
    return {ok: true, statusCode: 299, message: `離線指令回覆：${command}`, response: 'SIMULATED_OK', simulated: true};
  } finally {
    clearTimeout(timeoutId);
  }
}
