"use client";
import * as React from "react";

/** True inside the bare shell of the mandatory password change (D-173). */
const PasswordChangeRequired = React.createContext(false);

export function PasswordChangeRequiredProvider({ children }: { children: React.ReactNode }) {
  return <PasswordChangeRequired.Provider value={true}>{children}</PasswordChangeRequired.Provider>;
}

export function usePasswordChangeRequired(): boolean {
  return React.useContext(PasswordChangeRequired);
}
