import { fetchApi } from "../shared/http";
import { captureOwnerSessionInvalidation } from "./owner-session-events";

export const captureAdminUnauthorized = captureOwnerSessionInvalidation;

export function fetchAdminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetchApi<T>(path, init, { onUnauthorized: captureAdminUnauthorized() });
}
