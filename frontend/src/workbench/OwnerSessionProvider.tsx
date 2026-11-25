import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ApiError } from "../shared/http";
import { OwnerSessionContext, useOwnerSession } from "./owner-session";
import type { OwnerSessionValue } from "./owner-session";
import { advanceOwnerSessionEpoch, registerOwnerSessionInvalidation } from "./owner-session-events";
import { sessionApi } from "./session-api";
import type { Owner } from "./session-api";

export function OwnerSessionProvider({ children }: { children?: ReactNode }) {
  const [owner, setOwner] = useState<Owner>();
  const ownerRef = useRef<Owner | undefined>(undefined);
  const [status, setStatus] = useState<OwnerSessionValue["status"]>("idle");
  const [logoutError, setLogoutError] = useState<string>();
  const generation = useRef(0);
  const logoutPending = useRef(false);
  const loginPending = useRef<Promise<unknown> | null>(null);
  const loginRequired = useRef(false);
  const location = useLocation();
  const locationKey = useRef(location.key);

  useLayoutEffect(() => {
    if (locationKey.current !== location.key && loginPending.current) generation.current++;
    locationKey.current = location.key;
  }, [location.key]);

  const expire = useCallback(() => {
    generation.current++;
    advanceOwnerSessionEpoch();
    loginRequired.current = true;
    ownerRef.current = undefined;
    setOwner(undefined);
    setStatus("unauthenticated");
  }, []);

  useLayoutEffect(() => registerOwnerSessionInvalidation(expire), [expire]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const validate = useCallback(async (): Promise<
    "authenticated" | "unauthenticated" | "error" | "obsolete"
  > => {
    if (loginRequired.current || logoutPending.current) {
      setStatus("unauthenticated");
      return "unauthenticated";
    }
    const expected = ++generation.current;
    if (!ownerRef.current) setStatus("checking");
    try {
      const session = await sessionApi.session();
      if (generation.current !== expected) return "obsolete";
      if (!session.authenticated || !session.owner) {
        expire();
        return "unauthenticated";
      }
      if (ownerRef.current?.id !== session.owner.id) advanceOwnerSessionEpoch();
      ownerRef.current = session.owner;
      setOwner(session.owner);
      setStatus("authenticated");
      return "authenticated";
    } catch (error: unknown) {
      if (generation.current !== expected) return "obsolete";
      if (error instanceof ApiError && error.status === 401) {
        expire();
        return "unauthenticated";
      }
      if (!ownerRef.current) setStatus("error");
      return "error";
    }
  }, [expire]);

  const cancelValidation = useCallback(() => {
    generation.current++;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (logoutPending.current) throw new Error("退出登录尚未完成，请稍后重试");
    if (loginPending.current) throw new Error("登录正在进行，请稍后重试");
    const expected = ++generation.current;
    advanceOwnerSessionEpoch();
    const request = sessionApi.login(email, password);
    loginPending.current = request;
    try {
      const session = await request;
      if (generation.current !== expected) throw new Error("登录已取消，请重试");
      if (!session.authenticated || !session.owner) throw new Error("登录失败，请重试");
      advanceOwnerSessionEpoch();
      loginRequired.current = false;
      ownerRef.current = session.owner;
      setOwner(session.owner);
      setStatus("authenticated");
      setLogoutError(undefined);
    } finally {
      if (loginPending.current === request) loginPending.current = null;
    }
  }, []);

  const logout = useCallback(async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    expire();
    setLogoutError(undefined);
    try {
      // A login response can write a cookie even if its UI result is obsolete.
      // Send logout only after that response, while keeping new logins blocked.
      if (loginPending.current) await loginPending.current.catch(() => {});
      await sessionApi.logout();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        setLogoutError("无法确认已退出登录，请重试登录或稍后再试。");
      }
    } finally {
      logoutPending.current = false;
    }
  }, [expire]);

  return (
    <OwnerSessionContext.Provider
      value={{ owner, login, logout, logoutError, status, validate, cancelValidation }}
    >
      {children ?? <Outlet />}
    </OwnerSessionContext.Provider>
  );
}

export function RequireOwner() {
  const { owner, status, validate, cancelValidation } = useOwnerSession();
  const location = useLocation();
  const [guardStatus, setGuardStatus] = useState<"checking" | "confirmed" | "error">("checking");
  const confirmed = useRef(false);
  const request = useRef(0);
  const check = useCallback(() => {
    const current = ++request.current;
    if (!confirmed.current) setGuardStatus("checking");
    void validate().then((result) => {
      if (request.current !== current) return;
      if (result === "authenticated") {
        confirmed.current = true;
        setGuardStatus("confirmed");
      } else if (result === "error" && !confirmed.current) {
        setGuardStatus("error");
      }
    });
  }, [validate]);
  useLayoutEffect(() => {
    check();
    return () => {
      request.current++;
      cancelValidation();
    };
  }, [location.key, location.pathname, location.search, location.hash, check, cancelValidation]);

  if (!owner && status === "unauthenticated") return <Navigate to="/admin/login" replace />;
  if (owner && guardStatus === "confirmed") return <Outlet />;
  if (guardStatus === "error")
    return (
      <div role="alert">
        无法验证登录状态。
        <button type="button" onClick={check}>
          重试
        </button>
      </div>
    );
  return <div role="status">正在验证登录状态…</div>;
}
