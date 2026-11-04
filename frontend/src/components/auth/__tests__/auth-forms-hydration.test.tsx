import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const signIn = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("next-auth/react", () => ({ signIn }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import LoginPage from "@/app/login/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import { SetPasswordForm } from "@/components/auth/set-password-form";

const FORMS = [
  { name: "login", el: <LoginPage />, button: "login-submit-button" },
  { name: "forgot-password", el: <ForgotPasswordPage />, button: "forgot-submit-button" },
  {
    name: "set-password",
    el: <SetPasswordForm flow="reset" token="t" endpoint="/api/auth/reset-password" title="T" subtitle="S" cta="Imposta" />,
    button: "set-password-submit-button",
  },
];

/** A click or Enter before hydration must never trigger the native GET of the form. */
describe("auth forms before hydration", () => {
  for (const f of FORMS) {
    it(`${f.name}: the server HTML has the submit button disabled, enabled once hydrated`, () => {
      const host = document.createElement("div");
      host.innerHTML = renderToString(f.el);
      expect(host.querySelector(`[data-testid="${f.button}"]`)).toBeDisabled();

      render(f.el);
      expect(screen.getByTestId(f.button)).toBeEnabled();
    });
  }
});

import ChangePasswordPage from "@/app/(account)/change-password/page";

/** Password managers fill and save the right field (autocomplete on every access form). */
describe("autocomplete of the access forms", () => {
  it("email, current password and new password are marked", () => {
    const ac = (el: React.ReactElement) => {
      const host = document.createElement("div");
      host.innerHTML = renderToString(el);
      return Array.from(host.querySelectorAll("input")).map((i) => `${i.type}:${i.getAttribute("autocomplete")}`);
    };
    expect(ac(<LoginPage />)).toEqual(["email:email", "password:current-password"]);
    expect(ac(<ForgotPasswordPage />)).toEqual(["email:email"]);
    expect(ac(FORMS[2].el)).toEqual(["password:new-password", "password:new-password"]);
    expect(ac(<ChangePasswordPage />)).toEqual(["password:current-password", "password:new-password", "password:new-password"]);
  });
});

describe("login typed before hydration", () => {
  it("keeps what the user typed in the server HTML and sends it whole", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = renderToString(<LoginPage />);
    (host.querySelector("#email") as HTMLInputElement).value = "admin@anteprima.local";
    (host.querySelector("#password") as HTMLInputElement).value = "Anteprima@2026";
    await act(async () => {
      hydrateRoot(host, <LoginPage />);
    });
    const button = host.querySelector('[data-testid="login-submit-button"]') as HTMLButtonElement;
    await waitFor(() => expect(button).toBeEnabled());
    expect((host.querySelector("#password") as HTMLInputElement).value).toBe("Anteprima@2026");
    fireEvent.submit(host.querySelector("form")!);
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("credentials", { email: "admin@anteprima.local", password: "Anteprima@2026", redirect: false })
    );
    host.remove();
  });
});
