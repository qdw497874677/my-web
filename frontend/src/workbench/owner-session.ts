import { createContext, useContext } from "react";
import type { Owner } from "./session-api";

export interface OwnerSessionValue {
  owner?: Owner;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutError?: string;
  /** Internal route-guard state and operations. */
  status: "idle" | "checking" | "authenticated" | "unauthenticated" | "error";
  validate: () => Promise<"authenticated" | "unauthenticated" | "error" | "obsolete">;
  cancelValidation: () => void;
}

export const OwnerSessionContext = createContext<OwnerSessionValue | null>(null);

export function useOwnerSession(): OwnerSessionValue {
  const value = useContext(OwnerSessionContext);
  if (!value) throw new Error("useOwnerSession must be used within OwnerSessionProvider");
  return value;
}
