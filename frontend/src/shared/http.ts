export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchApi<T>(path: string, init: RequestInit = {}, options: { onUnauthorized?: () => void } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "无法连接服务器，请检查网络后重试");
  }
  if (!response.ok) {
    if (response.status === 401) options.onUnauthorized?.();
    const payload: unknown = await response.json().catch(() => null);
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
      ? payload.error : `请求失败（${response.status}）`;
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
