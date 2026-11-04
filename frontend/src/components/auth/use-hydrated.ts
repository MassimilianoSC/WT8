"use client";
import * as React from "react";

/**
 * False in the server HTML and until React has hydrated the page. The auth
 * forms keep their submit button disabled meanwhile: a click (or Enter) before
 * hydration would otherwise do a native GET of the form and never reach signIn.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated;
}
