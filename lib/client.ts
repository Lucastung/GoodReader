"use client";

// 瀏覽器端小工具：匿名 clientId、通行碼、API 呼叫
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 無痕模式等情況忽略 */
  }
}

let memoryClientId: string | null = null;
export function getClientId(): string {
  let id = safeGet("rd.clientId") ?? memoryClientId;
  if (!id) {
    id = crypto.randomUUID();
    safeSet("rd.clientId", id);
  }
  memoryClientId = id;
  return id;
}

export const getAccessCode = () => safeGet("rd.accessCode") ?? "";
export const setAccessCode = (c: string) => safeSet("rd.accessCode", c);
export const getPref = (k: string) => safeGet(`rd.pref.${k}`);
export const setPref = (k: string, v: string) => safeSet(`rd.pref.${k}`, v);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-access-code": getAccessCode(),
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  return body as T;
}
