import { captureOwnerSessionInvalidation } from "../workbench/owner-session-events";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const invalidate = path.startsWith("/api/admin/")
    ? captureOwnerSessionInvalidation()
    : undefined;
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
    if (response.status === 401) invalidate?.();
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? `请求失败（${response.status}）`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
