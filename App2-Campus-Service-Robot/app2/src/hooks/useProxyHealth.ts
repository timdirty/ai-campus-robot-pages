import { useState, useEffect } from 'react';
import { BRIDGE_URL, STATIC_DEMO } from '../services/hardwareBridge';

export interface ProxyHealth {
  status: 'checking' | 'online' | 'offline';
  online: boolean | null;
  message: string;
  provider?: string;
  model?: string;
}

export function useProxyHealth() {
  const [health, setHealth] = useState<ProxyHealth>({
    status: 'checking',
    online: null,
    message: 'AI 連線檢查中',
  });

  useEffect(() => {
    if (STATIC_DEMO) {
      setHealth({
        status: 'online',
        online: true,
        message: '線上操作模式，已啟用本機 AI 備援。',
        provider: 'local-demo',
        model: 'browser-fallback',
      });
      return;
    }

    let cancelled = false;
    const check = () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      fetch(`${BRIDGE_URL}/api/llm/health`, { signal: controller.signal })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data?.ok !== true) {
            throw new Error(typeof data?.error === 'string' ? data.error : `LLM health HTTP ${response.status}`);
          }
          return data as {provider?: string; model?: string};
        })
        .then((data) => {
          if (!cancelled) {
            setHealth({
              status: 'online',
              online: true,
              message: 'AI 已連線',
              provider: data.provider,
              model: data.model,
            });
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setHealth({
              status: 'offline',
              online: false,
              message: error instanceof Error && error.name === 'AbortError'
                ? '雲端 AI 連線逾時，已切換本機備援'
                : '雲端 AI 未回應，已切換本機備援',
            });
          }
        })
        .finally(() => clearTimeout(timeout));
    };
    check();
    const intv = setInterval(check, 15000); // recheck every 15s
    return () => { cancelled = true; clearInterval(intv); };
  }, []);

  return health;
}
