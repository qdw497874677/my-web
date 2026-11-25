import { fetchApi } from "../shared/http";

export interface Owner {
  id: string;
  email: string;
}

export interface Session {
  authenticated: boolean;
  owner?: Owner;
}

export const sessionApi = {
  session: () => fetchApi<Session>("/api/auth/session"),
  login: (email: string, password: string) =>
    fetchApi<Session>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => fetchApi<void>("/api/auth/logout", { method: "POST" }),
};
