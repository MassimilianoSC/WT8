// Matcher DOM di Testing Library (toBeInTheDocument, toHaveTextContent, …) e pulizia dopo ogni prova.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
