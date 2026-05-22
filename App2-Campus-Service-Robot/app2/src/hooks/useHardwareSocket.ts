import {useEffect, useRef, useState} from 'react';
import {STATIC_DEMO} from '../services/hardwareBridge';

export interface HardwareSocketStatus {
  connected: boolean;
  port: string;
  simulated: boolean;
  mode: 'ws' | 'polling';
  reconnecting: boolean;
  lastCommandAck: {command: string; ok: boolean; ts: number} | null;
}

export function useHardwareSocket(bridgeBaseUrl: string): HardwareSocketStatus {
  const wsUrl = bridgeBaseUrl.replace(/^http/, 'ws');
  const [status, setStatus] = useState<HardwareSocketStatus>({
    connected: false,
    port: '',
    simulated: false,
    mode: 'polling',
    reconnecting: false,
    lastCommandAck: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  function stopPolling() {
    if (pollingTimerRef.current !== null) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }

  function stopHeartbeat() {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }

  function startPolling() {
    if (pollingTimerRef.current !== null) return;
    pollingTimerRef.current = setInterval(() => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      fetch(`${bridgeBaseUrl}/api/health`, {signal: ctrl.signal})
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: {arduinoConnected?: boolean; activePath?: string}) => {
          clearTimeout(t);
          if (!mountedRef.current) return;
          setStatus((s) => ({...s, connected: Boolean(data.arduinoConnected), port: data.activePath ?? '', mode: 'polling', reconnecting: false}));
        })
        .catch(() => {
          clearTimeout(t);
          if (!mountedRef.current) return;
          setStatus((s) => ({...s, connected: false, mode: 'polling'}));
        });
    }, 3000);
  }

  function connect() {
    if (wsRef.current) {
      const old = wsRef.current;
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try { old.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    if (connectDeadlineRef.current) clearTimeout(connectDeadlineRef.current);
    connectDeadlineRef.current = setTimeout(() => {
      connectDeadlineRef.current = null;
      if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
        startPolling();
      }
    }, 5000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      // SecurityError: insecure WS from HTTPS page, or malformed URL — fall back to polling
      startPolling();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (connectDeadlineRef.current) {
        clearTimeout(connectDeadlineRef.current);
        connectDeadlineRef.current = null;
      }
      reconnectDelayRef.current = 1000;
      stopPolling();
      if (mountedRef.current) setStatus((s) => ({...s, mode: 'ws', reconnecting: false}));
      // Client-side keepalive: send heartbeat every 15s to traverse NAT/proxies
      stopHeartbeat();
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('"heartbeat"');
      }, 15000);
    };

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const event = JSON.parse(String(evt.data)) as {type?: string; connected?: boolean; port?: string; simulated?: boolean; command?: string; ok?: boolean};
        if (event.type === 'arduino_status') {
          setStatus((s) => ({
            ...s,
            connected: Boolean(event.connected),
            port: event.port ?? '',
            simulated: Boolean(event.simulated),
            mode: 'ws',
            reconnecting: false,
          }));
        } else if (event.type === 'command_ack') {
          setStatus((s) => ({
            ...s,
            lastCommandAck: {command: event.command ?? '', ok: Boolean(event.ok), ts: Date.now()},
          }));
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (connectDeadlineRef.current) {
        clearTimeout(connectDeadlineRef.current);
        connectDeadlineRef.current = null;
      }
      stopHeartbeat();
      wsRef.current = null;
      if (!mountedRef.current) return;
      setStatus((s) => ({...s, mode: 'polling', reconnecting: true}));
      startPolling();
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
      // Jitter: spread reconnects by ±20% so multiple tabs don't thundering-herd the bridge
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      reconnectTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        stopPolling();
        connect();
      }, delay + jitter);
    };

    ws.onerror = () => { /* onclose fires after onerror */ };
  }

  useEffect(() => {
    if (STATIC_DEMO) {
      setStatus({
        connected: true,
        port: 'showcase-control',
        simulated: true,
        mode: 'polling',
        reconnecting: false,
        lastCommandAck: null,
      });
      return;
    }

    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      if (connectDeadlineRef.current) {
        clearTimeout(connectDeadlineRef.current);
        connectDeadlineRef.current = null;
      }
      stopPolling();
      stopHeartbeat();
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeBaseUrl]);

  return status;
}
