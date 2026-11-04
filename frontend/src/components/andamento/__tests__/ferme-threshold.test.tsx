import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const source = vi.hoisted(() => ({ loadAndamentoSettings: vi.fn(), saveAndamentoSettings: vi.fn() }));
vi.mock("@/components/andamento/andamento-source", () => source);

import { ApiError } from "@/lib/client";
import { FermeThreshold } from "@/components/andamento/ferme-threshold";

beforeEach(() => vi.clearAllMocks());

describe("FermeThreshold (§15.3, Configurazione → Soglie)", () => {
  it("reads the threshold, accepts whole days 1–365 only, saves", async () => {
    source.loadAndamentoSettings.mockResolvedValue({ sogliaFermeGiorni: 30, updatedAt: null, updatedBy: null });
    source.saveAndamentoSettings.mockResolvedValue({ sogliaFermeGiorni: 45, updatedAt: "2026-10-11T12:00:00+02:00", updatedBy: "u-admin" });
    render(<FermeThreshold />);
    const input = await screen.findByTestId("ferme-threshold-input");
    expect(input).toHaveValue("30");
    const save = screen.getByTestId("ferme-threshold-save");
    expect(save).toBeDisabled();
    for (const bad of ["0", "366", "12,5", "x"]) {
      fireEvent.change(input, { target: { value: bad } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.click(save);
    await waitFor(() => expect(source.saveAndamentoSettings).toHaveBeenCalledWith(45));
    expect(toast.success).toHaveBeenCalledWith("Soglia salvata");
    expect(await screen.findByText(/Ultima modifica 11\/10\/2026 12:00/)).toBeInTheDocument();
  });

  it("a failed read shows why and Riprova", async () => {
    source.loadAndamentoSettings.mockRejectedValueOnce(new ApiError("x", 500, {})).mockResolvedValueOnce({ sogliaFermeGiorni: 30, updatedAt: null, updatedBy: null });
    render(<FermeThreshold />);
    fireEvent.click(await screen.findByTestId("ferme-threshold-error-retry"));
    expect(await screen.findByTestId("ferme-threshold-input")).toHaveValue("30");
  });
});
