"use client";
import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";

/** Client-side context providers (theme + auth session). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
