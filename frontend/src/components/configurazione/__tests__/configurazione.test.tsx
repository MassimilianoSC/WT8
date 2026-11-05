import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/configurazione/config-source", async (orig) => ({
  ...(await orig<typeof import("@/components/configurazione/config-source")>()),
  ...(await import("@/components/__fixtures__/demo-config")).demoConfig,
}));

import { codeFromLabel, LIST_CONFLICT_MESSAGE, ListsEditor } from "@/components/configurazione/lists-editor";
import { AlertRulesEditor } from "@/components/configurazione/alert-rules-editor";
import { UsersAdmin } from "@/components/configurazione/users-admin";
import * as source from "@/components/configurazione/config-source";
import { ApiError } from "@/lib/client";
import type { TemplateId } from "@/lib/contract";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

// jsdom lacks what Radix Select / Switch measure with.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  serveTemplates();
});

/** Opens a Radix Select and picks an option. */
async function choose(trigger: HTMLElement, option: string) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const item = await screen.findByRole("option", { name: option });
  item.focus();
  fireEvent.keyDown(item, { key: "Enter" });
}

async function openList(listId: string, template?: TemplateId) {
  render(<ListsEditor initialTemplate={template ?? null} />);
  fireEvent.click(await screen.findByTestId(`list-${listId}`));
  return screen.getByTestId("list-detail");
}

describe("ListsEditor", () => {
  it("proposes codes from labels", () => {
    expect(codeFromLabel("Nuovo sito à Roma")).toBe("NUOVO_SITO_A_ROMA");
    expect(codeFromLabel("  - Upgrade 5G - ")).toBe("UPGRADE_5G");
  });

  it("controlled lists: labels only, no new items, no deactivation", async () => {
    const detail = await openList("COMMITTENTE");
    expect(within(detail).getByText(/si cambiano solo le etichette/)).toBeInTheDocument();
    expect(screen.queryByTestId("list-add")).not.toBeInTheDocument();
    expect(within(detail).getAllByRole("switch").every((s) => s.hasAttribute("disabled"))).toBe(true);
    fireEvent.change(within(detail).getByLabelText("Etichetta 2"), { target: { value: "Telebit SpA" } });
    fireEvent.click(screen.getByTestId("list-save"));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Lista salvata"));
  });

  it("configurable lists: add with a proposed code, deactivate saved items, remove only new ones", async () => {
    const save = vi.spyOn(source, "saveList");
    const detail = await openList("INCARICO_LAVORAZIONE", "INWIT");
    expect(within(detail).queryAllByLabelText("Togli la voce")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("list-add"));
    fireEvent.change(within(detail).getByLabelText("Etichetta 4"), { target: { value: "Swap antenne" } });
    expect(within(detail).getByLabelText("Codice 4")).toHaveValue("SWAP_ANTENNE");
    expect(within(detail).getAllByLabelText("Togli la voce")).toHaveLength(1);
    fireEvent.click(within(detail).getByLabelText("Attiva Upgrade"));
    fireEvent.click(screen.getByTestId("list-save"));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    const items = save.mock.calls[0][1];
    expect(items.map((i) => [i.code, i.active, i.order])).toEqual([
      ["NUOVO_SITO", true, 1],
      ["UPGRADE", false, 2],
      ["RISANAMENTO", false, 3],
      ["SWAP_ANTENNE", true, 4],
    ]);
    expect(items[0]).not.toHaveProperty("isNew");
  });

  it("typing the label of a new item keeps the focus (bug 'una lettera alla volta', D-205)", async () => {
    const detail = await openList("INCARICO_LAVORAZIONE", "INWIT");
    fireEvent.click(screen.getByTestId("list-add"));
    const input = within(detail).getByLabelText("Etichetta 4");
    input.focus();
    for (const value of ["S", "Sw", "Swa", "Swap"]) fireEvent.change(input, { target: { value } });
    // The row must not be remounted while the derived code changes: same element, still focused.
    expect(within(detail).getByLabelText("Etichetta 4")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(within(detail).getByLabelText("Codice 4")).toHaveValue("SWAP");
  });

  it("shows read-only lists without editing controls", async () => {
    const detail = await openList("FORNITORE_CARATTERIZZAZIONE", "INWIT");
    expect(within(detail).getByText("Sola lettura")).toBeInTheDocument();
    expect(within(detail).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("list-save")).not.toBeInTheDocument();
  });

  it("on 409 warns that the draft is discarded and reloads", async () => {
    vi.spyOn(source, "saveList").mockRejectedValueOnce(
      new ApiError("Conflitto", 409, { error: "Conflitto", code: "REVISION_CONFLICT" })
    );
    const load = vi.spyOn(source, "loadLists");
    const detail = await openList("CLIENTE_FINALE");
    fireEvent.change(within(detail).getByLabelText("Etichetta 1"), { target: { value: "Iliad Italia" } });
    const calls = load.mock.calls.length;
    fireEvent.click(screen.getByTestId("list-save"));
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith(LIST_CONFLICT_MESSAGE));
    expect(load.mock.calls.length).toBeGreaterThan(calls);
  });

  it("offers only the clients of the user's memberships (fase 2, L1)", async () => {
    render(<ListsEditor allowed={["ILIAD"]} />);
    await screen.findByTestId("list-CLIENTE_FINALE");
    const trigger = screen.getByTestId("lists-scope");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    await screen.findByRole("option", { name: "ILIAD" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Comuni a tutti i gestori", "ILIAD"]);
  });

  it("a failed load says so instead of staying on 'Caricamento…'", async () => {
    vi.spyOn(source, "loadLists").mockRejectedValueOnce(new ApiError("Template non trovato", 404, { error: "Template non trovato" }));
    render(<ListsEditor initialTemplate="TOWERNET" />);
    expect(await screen.findByTestId("lists-load-error")).toHaveTextContent("Liste non disponibili per questo gestore.");
    expect(screen.queryByText("Caricamento…")).not.toBeInTheDocument();
  });

  it("refuses duplicate codes before saving", async () => {
    const detail = await openList("INCARICO_LAVORAZIONE", "ILIAD");
    fireEvent.click(screen.getByTestId("list-add"));
    fireEvent.change(within(detail).getByLabelText("Etichetta 4"), { target: { value: "Upgrade" } });
    fireEvent.click(screen.getByTestId("list-save"));
    expect(await within(detail).findByRole("alert")).toHaveTextContent("Due voci hanno lo stesso codice.");
  });

  it("C2: changing group shows a list of the new combination, never the one chosen before", async () => {
    render(<ListsEditor initialTemplate="ILIAD" />);
    fireEvent.click(await screen.findByTestId("list-TIPOLOGIA_SITO"));
    expect(within(screen.getByTestId("list-detail")).getByRole("heading")).toHaveTextContent("Tipologia sito");
    await choose(screen.getByTestId("lists-group"), "UT/PE");
    // The first list of ILIAD + UT/PE, selected in the menu too.
    expect(within(await screen.findByTestId("list-detail")).getByRole("heading")).toHaveTextContent("Fornitore Caratterizzazione");
    expect(screen.queryByTestId("list-TIPOLOGIA_SITO")).not.toBeInTheDocument();
    // A combination without lists: no detail of another one.
    await choose(screen.getByTestId("lists-group"), "AIE");
    await waitFor(() => expect(screen.queryByTestId("list-detail")).not.toBeInTheDocument());
    expect(screen.getByText("Nessuna lista.")).toBeInTheDocument();
    // Changing client keeps the group: the first list of the new client + group opens.
    await choose(screen.getByTestId("lists-group"), "UT/PE");
    await choose(screen.getByTestId("lists-scope"), "TOWERNET");
    await waitFor(() => expect(within(screen.getByTestId("list-detail")).getByRole("heading")).toHaveTextContent("Fornitore Caratterizzazione"));
    expect(screen.getByTestId("list-FORNITORE_CARATTERIZZAZIONE").className).toMatch(/bg-foreground/);
  });

  it("C2: unsaved changes are not lost in silence when the group change would replace the list", async () => {
    const detail = await openList("INCARICO_LAVORAZIONE", "ILIAD");
    fireEvent.change(within(detail).getByLabelText("Etichetta 1"), { target: { value: "Nuovo sito modificato" } });
    await choose(screen.getByTestId("lists-group"), "UT/PE");
    expect(await screen.findByTestId("confirm-dialog")).toHaveTextContent("Ci sono modifiche non salvate");
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument());
    // Still on the same list, with the edit, and the group filter unchanged.
    expect(within(screen.getByTestId("list-detail")).getByLabelText("Etichetta 1")).toHaveValue("Nuovo sito modificato");
    expect(screen.getByTestId("lists-group")).toHaveTextContent("Tutti i gruppi");
  });
});

describe("AlertRulesEditor", () => {
  it("changes the days of one rule", async () => {
    render(<AlertRulesEditor />);
    const row = await screen.findByTestId("rule-SOPRALLUOGO");
    expect(within(row).getByText("giorni lavorativi")).toBeInTheDocument();
    const save = within(row).getByTestId("rule-save-SOPRALLUOGO");
    expect(save).toBeDisabled();
    fireEvent.change(within(row).getByRole("textbox"), { target: { value: "x" } });
    expect(save).toBeDisabled();
    fireEvent.change(within(row).getByRole("textbox"), { target: { value: "10" } });
    fireEvent.click(save);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Soglia salvata"));
  });
});

describe("UsersAdmin", () => {
  it("warns about clients without a PM leader", async () => {
    render(<UsersAdmin />);
    const alert = await screen.findByTestId("no-pm-leader");
    expect(alert).toHaveTextContent("TOWERNET");
    expect(alert).not.toHaveTextContent("INWIT");
  });

  it("invites a user with a membership; the group follows the role", async () => {
    const invite = vi.spyOn(source, "inviteUser");
    render(<UsersAdmin />);
    fireEvent.click(await screen.findByTestId("users-invite"));
    const dialog = screen.getByTestId("user-dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Anna Gialli" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "anna@example.it" } });
    expect(within(dialog).getByTestId("user-dialog-submit")).toBeDisabled();
    fireEvent.click(within(dialog).getByTestId("membership-add"));
    await choose(within(dialog).getByLabelText("Ruolo 1"), "UT · UT/PE");
    fireEvent.click(within(dialog).getByLabelText("Leader 1"));
    fireEvent.click(within(dialog).getByTestId("user-dialog-submit"));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Invito inviato"));
    expect(invite.mock.calls[0][0].memberships).toEqual([
      expect.objectContaining({ role: "UT", group: "UT_PE", leader: true }),
    ]);
  });

  it("switch off (PH_ANDAMENTO): no Direzione box, and the field is never sent", async () => {
    const invite = vi.spyOn(source, "inviteUser");
    render(<UsersAdmin />);
    fireEvent.click(await screen.findByTestId("users-invite"));
    const dialog = screen.getByTestId("user-dialog");
    expect(within(dialog).queryByTestId("user-direzione")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Anna Gialli" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "anna@example.it" } });
    fireEvent.click(within(dialog).getByTestId("membership-add"));
    fireEvent.click(within(dialog).getByTestId("user-dialog-submit"));
    await waitFor(() => expect(invite).toHaveBeenCalled());
    expect(invite.mock.calls[0][0]).not.toHaveProperty("direzione");
  });

  it("switch on: Direzione alone, without memberships, can be invited (D-193); ADMIN turns it off", async () => {
    const invite = vi.spyOn(source, "inviteUser");
    render(<UsersAdmin andamento />);
    fireEvent.click(await screen.findByTestId("users-invite"));
    const dialog = screen.getByTestId("user-dialog");
    fireEvent.change(within(dialog).getByLabelText("Nome"), { target: { value: "Capo Area" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "capo@example.it" } });
    expect(within(dialog).getByTestId("user-dialog-submit")).toBeDisabled();
    fireEvent.click(within(dialog).getByTestId("user-direzione"));
    expect(within(dialog).getByText("Nessuna: solo Direzione (Andamento, Statistiche, Notifiche).")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId("user-admin"));
    expect(within(dialog).getByTestId("user-direzione")).toBeDisabled();
    expect(within(dialog).getByText("L'ADMIN vede già tutto.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByTestId("user-admin"));
    fireEvent.click(within(dialog).getByTestId("user-dialog-submit"));
    await waitFor(() => expect(invite).toHaveBeenCalled());
    expect(invite.mock.calls[0][0]).toMatchObject({ direzione: true, isAdmin: false, memberships: [] });
  });

  it("shows the server's 422 when the last PM leader would be removed", async () => {
    render(<UsersAdmin />);
    const row = await screen.findByTestId("user-u-pm-1");
    fireEvent.click(within(row).getByLabelText("Modifica Laura Verdi"));
    const dialog = screen.getByTestId("user-dialog");
    fireEvent.click(within(dialog).getByTestId("user-active"));
    fireEvent.click(within(dialog).getByTestId("user-dialog-submit"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("INWIT resterebbe senza PM leader attivo");
  });

  it("resends the invitation of an invited user only (D-108)", async () => {
    const resend = vi.spyOn(source, "resendInvite");
    render(<UsersAdmin />);
    const invited = await screen.findByTestId("user-u-dl-1");
    fireEvent.click(within(invited).getByLabelText("Modifica Paolo Neri"));
    fireEvent.click(screen.getByTestId("user-resend-invite"));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Nuovo invito inviato a paolo.neri@example.it: il link precedente non vale più")
    );
    expect(resend).toHaveBeenCalledWith("u-dl-1");
  });

  it("does not offer a new invitation to active users", async () => {
    render(<UsersAdmin />);
    const row = await screen.findByTestId("user-u-ut-1");
    fireEvent.click(within(row).getByLabelText("Modifica Marco Bianchi"));
    expect(screen.queryByTestId("user-resend-invite")).not.toBeInTheDocument();
    await expect(source.resendInvite("u-ut-1")).rejects.toMatchObject({ status: 409 });
  });
});
