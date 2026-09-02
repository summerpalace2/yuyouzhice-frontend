/**
 * client.ts
 * 强类型 HTTP 请求客户端，自动携带 Device-ID 与 CSRF Token
 * 严格遵照架构契约：浏览器只携带 HttpOnly Cookie，不操作 Java JWT
 */

let globalCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  globalCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return globalCsrfToken;
}

export function deviceId(): string {
  const storageKey = 'yuyouzhice-device-id';
  try {
    let value = window.localStorage.getItem(storageKey);
    if (!value) {
      value = `device-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      window.localStorage.setItem(storageKey, value);
    }
    return value;
  } catch {
    return 'browser-session';
  }
}

export function plannerIdempotencyKey(prefix = 'planner'): string {
  const suffix = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-yuyouzhice-device': deviceId(),
    ...(options.headers || {})
  };

  if (globalCsrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers['x-yuyouzhice-csrf']) {
    headers['x-yuyouzhice-csrf'] = globalCsrfToken;
  }

  let response: Response;
  try {
    response = await fetch(path, { ...options, credentials: 'same-origin', headers });
  } catch (netErr) {
    throw Object.assign(new Error('网络连接异常，请检查后端服务是否正常运行。'), { status: 0, cause: netErr });
  }

  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = { ok: false, message: response.ok ? '服务响应格式异常' : `服务出现异常 (HTTP ${response.status})` };
  }

  if (!response.ok) {
    throw Object.assign(new Error(data.message || '请求失败'), { data, status: response.status });
  }

  return data as T;
}
