import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AssistantSettingsEditor } from "@/components/configurazione/assistant-settings";
import type { AssistantSettingsDTO } from "@/components/assistente/types";
import { demoSettings } from "@/components/__fixtures__/demo-assistant";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stub(initial: AssistantSettingsDTO, put?: (body: Record<string, unknown>) => Response) {
  const puts: Record<string, unknown>[] = [];
  let current = initial;
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    expect(url).toBe("/api/assistant/settings");
    if (init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      puts.push(body);
      if (put) return put(body);
      current = { ...current, ...body, updatedBy: "Admin", updatedAt: "2026-10-09T14:00:00+02:00" };
      return json(current);
    }
    return json(current);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { puts };
}

describe("Configurazione > Assistente AI", () => {
  it("the switch turns the assistant off for everyone at once", async () => {
    const { puts } = stub(demoSettings());
    render(<AssistantSettingsEditor />);
    const sw = await screen.findByTestId("assistant-enabled");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("assistant-updated")).toHaveTextContent("Ultima modifica: 09/10/2026 alle 10:00, Amministratore.");
    fireEvent.click(sw);
    await waitFor(() => expect(puts).toEqual([{ enabled: false }]));
    await waitFor(() => expect(screen.getByTestId("assistant-enabled")).toHaveAttribute("aria-checked", "false"));
    expect(toast.success).toHaveBeenCalledWith("Assistente spento per tutti.");
  });

  it("limits: only allowed values, only what changed is sent", async () => {
    const { puts } = stub(demoSettings());
    render(<AssistantSettingsEditor />);
    const daily = await screen.findByTestId("assistant-daily");
    const minute = screen.getByTestId("assistant-minute");
    const save = screen.getByTestId("assistant-limits-save");
    expect(save).toBeDisabled();
    for (const bad of ["0", "101", "abc", "", "2.5"]) {
      fireEvent.change(daily, { target: { value: bad } });
      expect(save).toBeDisabled();
    }
    expect(screen.getByText("Da 1 a 100.")).toBeInTheDocument();
    fireEvent.change(daily, { target: { value: "50" } });
    fireEvent.change(minute, { target: { value: "11" } });
    expect(save).toBeDisabled();
    fireEvent.change(minute, { target: { value: "4" } });
    fireEvent.click(save);
    await waitFor(() => expect(puts).toEqual([{ dailyLimit: 50 }]));
    expect(toast.success).toHaveBeenCalledWith("Limiti salvati.");
  });

  it("a 422 from the server gives the ranges in Italian", async () => {
    stub(demoSettings(), () => json({ error: "out of range" }, 422));
    render(<AssistantSettingsEditor />);
    fireEvent.change(await screen.findByTestId("assistant-minute"), { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("assistant-limits-save"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Valori non ammessi: domande al giorno da 1 a 100, al minuto da 1 a 10."));
  });

  it("technical switch off on the server: the page says the app switch has no effect", async () => {
    stub(demoSettings({ technicalEnabled: false }));
    render(<AssistantSettingsEditor />);
    expect(await screen.findByTestId("assistant-technical-off")).toHaveTextContent("questo interruttore non ha effetto");
  });

  it("a non-ADMIN reading the settings gets a clear message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Forbidden" }, 403)));
    render(<AssistantSettingsEditor />);
    expect(await screen.findByTestId("assistant-settings-error")).toHaveTextContent("Solo gli amministratori possono cambiare l'assistente.");
  });
});
