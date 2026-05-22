let _proxyUrl: string | undefined;
let _proxyKey: string | undefined;

function getProxyUrl(): string {
  if (_proxyUrl === undefined) {
    _proxyUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_PROXY_URL) || 'http://localhost:3200';
  }
  return _proxyUrl;
}

function getProxyKey(): string {
  if (_proxyKey === undefined) {
    _proxyKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_PROXY_KEY) || '';
  }
  return _proxyKey;
}

function isProxyDisabled(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_PROXY_DISABLED === '1') {
    return true;
  }

  if (typeof process !== 'undefined') {
    return process.env.VITE_AI_PROXY_DISABLED === '1';
  }

  return false;
}

export async function askGemini(
  route: string,
  body: Record<string, unknown>
): Promise<Record<string, string>> {
  if (isProxyDisabled()) {
    throw new Error('proxy disabled');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${getProxyUrl()}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Key': getProxyKey(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`proxy ${res.status}`);

    const data = await res.json() as Record<string, unknown>;
    if (data.fallback) throw new Error('proxy fallback');

    return data as Record<string, string>;
  } finally {
    clearTimeout(timeout);
  }
}
