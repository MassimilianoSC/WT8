import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/client";
import { MOCK_DETAIL, MOCK_TEMPLATE } from "@/components/scheda/mock-template";

const toastMock = vi.hoisted(() => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

const source = vi.hoisted(() => ({
  loadSheet: vi.fn(),
  loadIteration: vi.fn(),
  loadHistory: vi.fn(),
  reloadPractice: vi.fn(),
  saveFields: vi.fn(),
  mockOptions: vi.fn(() => []),
}));
vi.mock("@/components/scheda/sheet-source", () => source);

const comments = vi.hoisted(() => ({
  loadComments: vi.fn(async (): Promise<CommentListResponse> => ({ items: [], canComment: true })),
  loadMentionable: vi.fn(async () => ({ groups: [], all: { label: "tutti" }, people: [] })),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock("@/components/commenti/comments-source", () => comments);

const commands = vi.hoisted(() => ({ runCommand: vi.fn() }));
vi.mock("@/components/scheda/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/scheda/commands")>()),
  runCommand: commands.runCommand,
}));

import { PraticaSheet } from "@/components/scheda/pratica-sheet";
import type { CommentListResponse, FieldChange, MeDTO, PraticaDetailDTO, RepeatRowDTO } from "@/lib/contract";

/** A user of the AIE group on INWIT (the mock practice's template). */
const AIE_USER: MeDTO = {
  id: "u-aie", name: "Tecnico AIE", email: "aie@example.it", status: "active", isAdmin: false,
  memberships: [{ templateId: "INWIT", group: "AIE", role: "AIE", leader: false }],
  canCreate: [], mustChangePassword: false, createdAt: "2026-09-01T09:00:00+02:00", updatedAt: "2026-09-01T09:00:00+02:00",
};

function nameInput() {
  return within(screen.getByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO")).getByRole("textbox");
}

describe("PraticaSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    source.loadSheet.mockResolvedValue({ template: MOCK_TEMPLATE, practice: MOCK_DETAIL });
    source.loadHistory.mockImplementation(async (_id: string, _it: number, _page: number, view: string) => ({
      items: [
        {
          id: "h1", practiceId: "mock-0", iteration: 1, kind: "FIELD", flowId: "F020", source: "USER",
          oldValue: null, newValue: "2026-09-02", userId: "u1", userName: "Laura Verdi",
          timestamp: "2026-09-02T12:00:00+02:00",
        },
        {
          id: "h2", practiceId: "mock-0", iteration: 1, kind: "ASSIGN", detail: "Assegna a UT/PE", source: "USER",
          userId: "u1", userName: "Laura Verdi", timestamp: "2026-09-05T09:30:00+02:00",
        },
      ].filter((e) => (view === "fields") === (e.kind === "FIELD")),
      total: 1, page: 1, pageSize: 20,
    }));
  });

  it("renders header, transversal panel, progress and sections", async () => {
    render(<PraticaSheet id="mock-0" />);
    expect(await screen.findByTestId("sheet-header")).toHaveTextContent("MI1000");
    expect(screen.getByTestId("stato-badge-protocollato")).toBeInTheDocument();
    expect(screen.getByTestId("transversal-panel")).toBeInTheDocument();
    expect(within(screen.getByTestId("progress-strip")).getAllByText("non assegnato")).toHaveLength(2);
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
  });

  it("comments above the history, with the count in the header (D-184)", async () => {
    const c = {
      id: "c1", practiceId: "mock-0", iteration: 1, parentId: null, author: { id: "u1", name: "Anna" }, body: "Ciao", mentions: [],
      createdAt: "2026-10-10T09:00:00+02:00", editedAt: null, deleted: false, canEdit: true, canDelete: true, replies: [],
    };
    comments.loadComments.mockResolvedValueOnce({ items: [c, { ...c, id: "c2" }], canComment: true });
    render(<PraticaSheet id="mock-0" commentId="c2" />);
    expect(await screen.findByTestId("sheet-comments-mark")).toHaveTextContent("2 commenti");
    expect(screen.getByTestId("sheet-comments-mark")).toHaveAttribute("href", "#commenti");
    const panel = screen.getByTestId("comments-panel");
    expect(panel.compareDocumentPosition(screen.getByTestId("history-panel")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("buffers edits in the save bar and sends them with the revision", async () => {
    source.saveFields.mockImplementation(async (p, changes) => ({
      practice: { ...p, revision: p.revision + 1, values: { ...p.values, F003: changes[0].value } },
      toasts: [{ kind: "INFO", message: "Forecast ricalcolato" }],
    }));
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");

    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    expect(screen.getByTestId("save-bar")).toHaveTextContent("1 modifica non salvata");

    fireEvent.click(screen.getByTestId("save-bar-save"));
    await waitFor(() => expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument());
    expect(source.saveFields).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 7 }),
      [{ occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Milano Duomo" }]
    );
    expect(toastMock.info).toHaveBeenCalledWith("Forecast ricalcolato");
    expect(nameInput()).toHaveValue("Milano Duomo");
  });

  it("discards pending edits", async () => {
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    fireEvent.click(screen.getByTestId("save-bar-discard"));
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
    expect(nameInput()).toHaveValue("Milano Centro");
  });

  it("on 409 reloads, warns and keeps the local edits", async () => {
    source.saveFields.mockRejectedValue(new ApiError("Conflitto", 409, { error: "Conflitto" }));
    source.reloadPractice.mockResolvedValue({
      ...MOCK_DETAIL,
      revision: 8,
      values: { ...MOCK_DETAIL.values, F002: "MI2000" },
    });
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");

    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    fireEvent.click(screen.getByTestId("save-bar-save"));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
    expect(screen.getByTestId("sheet-header")).toHaveTextContent("MI1000"); // header fields come from the summary
    expect(nameInput()).toHaveValue("Milano Duomo");
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
    const code = within(screen.getByTestId("field-F002@PM_PERMESSI.CORE_ANAGRAFICA_SITO")).getByRole("textbox");
    expect(code).toHaveValue("MI2000");
  });

  it("shows the value history and the activity timeline apart (D-47)", async () => {
    render(<PraticaSheet id="mock-0" />);
    const panel = await screen.findByTestId("history-panel");
    const entry = await within(panel).findByTestId("history-h1");
    expect(entry).toHaveTextContent("Data assegnazione");
    expect(entry).toHaveTextContent("02/09/2026");
    expect(within(panel).queryByText("Assegna a UT/PE")).not.toBeInTheDocument();
    expect(source.loadHistory).toHaveBeenCalledWith("mock-0", 1, 1, "fields");
    fireEvent.click(within(panel).getByTestId("history-tab-events"));
    expect(await within(panel).findByText("Assegna a UT/PE")).toBeInTheDocument();
    expect(source.loadHistory).toHaveBeenCalledWith("mock-0", 1, 1, "events");
  });

  it("opens a past iteration read-only, without save bar or commands", async () => {
    source.loadSheet.mockResolvedValue({
      template: MOCK_TEMPLATE,
      practice: {
        ...MOCK_DETAIL,
        iteration: 2,
        iterations: [
          { id: "it-1", n: 1, codiceG7: "400000", createdAt: "2026-06-01T09:00:00+02:00", current: false },
          { id: "it-2", n: 2, codiceG7: "400000", createdAt: "2026-09-01T09:00:00+02:00", current: true },
        ],
      },
    });
    source.loadIteration.mockResolvedValue({ ...MOCK_DETAIL, iteration: 1, statoAttivita: "KO" });
    render(<PraticaSheet id="mock-0" iteration={1} />);

    expect(await screen.findByTestId("past-iteration-banner")).toHaveTextContent("Iterazione 1: sola lettura");
    expect(source.loadIteration).toHaveBeenCalledWith("mock-0", 1);
    expect(screen.getByTestId("stato-badge-ko")).toBeInTheDocument();
    const field = screen.getByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO");
    expect(within(field).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("cmd-assign")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Torna all.iterazione corrente/));
    expect(routerMock.push).toHaveBeenCalledWith("/pratiche/mock-0");
  });

  it("a past iteration that cannot be read shows why and Riprova, not an endless skeleton", async () => {
    source.loadSheet.mockResolvedValue({
      template: MOCK_TEMPLATE,
      practice: { ...MOCK_DETAIL, iteration: 2 },
    });
    source.loadIteration.mockRejectedValueOnce(new ApiError("Internal server error", 500, {}));
    source.loadIteration.mockResolvedValueOnce({ ...MOCK_DETAIL, iteration: 1, statoAttivita: "KO" });
    render(<PraticaSheet id="mock-0" iteration={1} />);
    const box = await screen.findByTestId("sheet-load-error");
    expect(box).toHaveTextContent("Errore del server: riprova tra poco.");
    expect(box).toHaveTextContent("Torna all'iterazione corrente");
    fireEvent.click(within(box).getByTestId("load-error-retry"));
    expect(await screen.findByTestId("past-iteration-banner")).toBeInTheDocument();
  });

  it("a practice that cannot be read shows a fixed text, not the server's", async () => {
    source.loadSheet.mockRejectedValueOnce(new ApiError("Practice not found", 404, {}));
    render(<PraticaSheet id="mock-0" />);
    expect(await screen.findByTestId("sheet-load-error")).toHaveTextContent("Pratica non trovata: forse è stata eliminata.");
  });

  it("opens a section from the side index", async () => {
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("section-index");
    expect(screen.queryByTestId("field-F090@AIE.FASE_AIE")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("index-AIE.FASE_AIE"));
    expect(screen.getByTestId("field-F090@AIE.FASE_AIE")).toBeInTheDocument();
  });

  it("C3: «Storico» at the bottom of the side index, apart from the groups, scrolls to the history", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(<PraticaSheet id="mock-0" />);
    const index = await screen.findByTestId("section-index");
    const entry = within(index).getByTestId("index-storico");
    expect(entry).toHaveTextContent("Storico");
    // Last in the index, after every group's sections.
    const buttons = within(index).getAllByRole("button");
    expect(buttons[buttons.length - 1]).toBe(entry);
    expect(document.getElementById("storico")).toContainElement(screen.getByTestId("history-panel"));
    fireEvent.click(entry);
    expect(scroll).toHaveBeenCalled();
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById("storico"));
    raf.mockRestore();
  });

  it("C4: «Commenti (n)» just above «Storico» scrolls to the comments; the count is the sheet's", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const c = {
      id: "c1", practiceId: "mock-0", iteration: 1, parentId: null, author: { id: "u1", name: "Anna" }, body: "Ciao", mentions: [],
      createdAt: "2026-10-10T09:00:00+02:00", editedAt: null, deleted: false, canEdit: true, canDelete: true, replies: [],
    };
    comments.loadComments.mockResolvedValueOnce({ items: [c, { ...c, id: "c2" }, { ...c, id: "c3" }], canComment: true });
    render(<PraticaSheet id="mock-0" />);
    const index = await screen.findByTestId("section-index");
    const entry = within(index).getByTestId("index-commenti");
    await waitFor(() => expect(entry).toHaveTextContent("Commenti (3)"));
    const buttons = within(index).getAllByRole("button");
    expect(buttons.slice(-2)).toEqual([entry, within(index).getByTestId("index-storico")]);
    fireEvent.click(entry);
    expect(scroll.mock.contexts.at(-1)).toBe(document.getElementById("commenti"));
    raf.mockRestore();
  });

  it("C4: the side index shows from 640 px (zoom 200% on a desktop), not only from 1024 px", async () => {
    render(<PraticaSheet id="mock-0" />);
    const aside = (await screen.findByTestId("section-index")).closest("aside")!;
    expect(aside.className).toMatch(/\bsm:block\b/);
    // The grid gives it a column from the same width; at 1024 px and more the layout is unchanged.
    expect(aside.parentElement!.className).toMatch(/sm:grid-cols-\[11rem_minmax\(0,1fr\)\]/);
    expect(aside.parentElement!.className).toMatch(/lg:grid-cols-\[13rem_minmax\(0,1fr\)\]/);
  });

  it("C3: the history entry is there on a past iteration too", async () => {
    source.loadSheet.mockResolvedValue({ template: MOCK_TEMPLATE, practice: { ...MOCK_DETAIL, iteration: 2 } });
    source.loadIteration.mockResolvedValue({ ...MOCK_DETAIL, iteration: 1 });
    render(<PraticaSheet id="mock-0" iteration={1} />);
    await screen.findByTestId("past-iteration-banner");
    expect(within(screen.getByTestId("section-index")).getByTestId("index-storico")).toBeInTheDocument();
    expect(document.getElementById("storico")).toContainElement(screen.getByTestId("history-panel"));
  });

  it("runs Assegna from the header and shows the updated practice", async () => {
    commands.runCommand.mockImplementation(async (p, c) => ({ ...p, revision: p.revision + 1, enabledGroups: [...p.enabledGroups, ...c.groups] }));
    render(<PraticaSheet id="mock-0" />);
    fireEvent.click(await screen.findByTestId("cmd-assign"));
    fireEvent.click(screen.getByTestId("assign-group-AIE"));
    fireEvent.click(screen.getByTestId("assign-dialog-submit"));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Pratica assegnata"));
    expect(commands.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 7 }),
      { kind: "assign", groups: ["AIE"], note: undefined },
      expect.any(String)
    );
    expect(within(screen.getByTestId("progress-strip")).getAllByText("non assegnato")).toHaveLength(1);
  });

  it("on a command conflict reloads the practice and closes the dialog", async () => {
    commands.runCommand.mockRejectedValue(new ApiError("Conflitto", 409, { error: "Conflitto", code: "REVISION_CONFLICT" }));
    source.reloadPractice.mockResolvedValue({ ...MOCK_DETAIL, revision: 9, statoAttivita: "AUTORIZZATO" });
    render(<PraticaSheet id="mock-0" />);
    fireEvent.click(await screen.findByTestId("cmd-stato"));
    fireEvent.click(screen.getByTestId("stato-option-TERMINATO"));
    fireEvent.click(screen.getByTestId("stato-dialog-submit"));
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalled());
    expect(await screen.findByTestId("stato-badge-autorizzato")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("stato-dialog")).not.toBeInTheDocument());
  });

  it("disables state and other commands while edits are unsaved", async () => {
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    expect(screen.getByTestId("cmd-stato")).toBeDisabled();
    expect(screen.getByTestId("cmd-more")).toBeDisabled();
    expect(screen.getByTestId("cmd-assign")).toBeEnabled();
  });

  it("opens the sections of the user's own group", async () => {
    render(<PraticaSheet id="mock-0" me={AIE_USER} />);
    await screen.findByTestId("sheet-header");
    expect(screen.getByTestId("field-F090@AIE.FASE_AIE")).toBeInTheDocument();
    expect(screen.queryByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO")).not.toBeInTheDocument();
  });

  it("shows the open alerts and goes to the field", async () => {
    render(<PraticaSheet id="mock-0" me={AIE_USER} />);
    const panel = await screen.findByTestId("alerts-panel");
    expect(panel).toHaveTextContent(MOCK_DETAIL.alerts[0].label);
    expect(within(panel).queryByTestId("alert-close-al-1")).not.toBeInTheDocument(); // canCloseManually false
    expect(screen.queryByTestId("field-F020@PM_PERMESSI.FASE_PRELIMINARE")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByTestId("alert-goto-al-1"));
    expect(screen.getByTestId("field-F020@PM_PERMESSI.FASE_PRELIMINARE")).toBeInTheDocument();
  });

  it("opens the section of a notification link", async () => {
    render(<PraticaSheet id="mock-0" focus={{ campo: "F090" }} />);
    await screen.findByTestId("sheet-header");
    await waitFor(() => expect(screen.getByTestId("field-F090@AIE.FASE_AIE")).toBeInTheDocument());
  });

  it("opens an archived practice read-only with the banner and Ripristina", async () => {
    source.loadSheet.mockResolvedValue({
      template: MOCK_TEMPLATE,
      practice: {
        ...MOCK_DETAIL,
        archived: true,
        archivedAt: "2026-10-01T18:00:00+02:00",
        access: Object.fromEntries(Object.keys(MOCK_DETAIL.access).map((k) => [k, { editable: false, reason: "ARCHIVED" }])),
        actions: { ...MOCK_DETAIL.actions, canRestore: true, canAssign: false, canChangeStato: false },
      },
    });
    render(<PraticaSheet id="mock-0" />);
    expect(await screen.findByTestId("archived-banner")).toHaveTextContent("Archiviata: sola lettura, alert sospesi");
    const field = screen.getByTestId("field-F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO");
    expect(within(field).getByText("Pratica archiviata: sola lettura")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("archived-restore"));
    expect(screen.getByTestId("confirm-restore")).toHaveTextContent("Lo Stato attività non cambia.");
  });

  it("removing a row drops its pending edits; the others stay (L11)", async () => {
    // The server answers the removal with the practice without that row.
    source.saveFields.mockImplementation(async (p: PraticaDetailDTO, changes: FieldChange[]) => {
      const removed = changes.find((c) => "op" in c && c.op === "REMOVE_ROW") as { rowId: string } | undefined;
      return {
        practice: removed ? { ...p, revision: p.revision + 1, repeats: { ...p.repeats, ARPA: p.repeats.ARPA!.filter((r: RepeatRowDTO) => r.rowId !== removed.rowId) } } : p,
        toasts: [],
      };
    });
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    const row = screen.getByTestId("repeat-row-ARPA-arpa-2");
    const parere = within(row).getAllByPlaceholderText("gg/mm/aaaa").find((i) => (i as HTMLInputElement).value === "")!;
    fireEvent.change(parere, { target: { value: "05102026" } });
    fireEvent.blur(parere);
    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    expect(screen.getByTestId("save-bar")).toHaveTextContent("2 modifiche non salvate");

    fireEvent.click(within(row).getByRole("button", { name: /Rimuovi/ }));
    fireEvent.click(await screen.findByTestId("confirm-dialog-ok"));
    await waitFor(() => expect(screen.getByTestId("save-bar")).toHaveTextContent("1 modifica non salvata"));

    fireEvent.click(screen.getByTestId("save-bar-save"));
    await waitFor(() => expect(source.saveFields).toHaveBeenCalledTimes(2));
    expect(source.saveFields.mock.calls[1][1]).toEqual([{ occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Milano Duomo" }]);
  });

  it("a day picked from the calendar joins the pending edits like a typed one (D-190)", async () => {
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    const row = screen.getByTestId("repeat-row-ARPA-arpa-2");
    const parere = within(row).getAllByPlaceholderText("gg/mm/aaaa").find((i) => (i as HTMLInputElement).value === "")!;
    const open = parere.parentElement!.querySelector<HTMLButtonElement>('button[aria-label="Scegli la data dal calendario"]')!;
    fireEvent.click(open);
    const calendar = await screen.findByTestId("date-calendar");
    fireEvent.click(calendar.querySelector<HTMLButtonElement>("[data-day]")!);
    expect(screen.getByTestId("save-bar")).toHaveTextContent("1 modifica non salvata");
    expect(parere).not.toHaveValue("");
  });

  it("removing the only edited row hides the save bar", async () => {
    source.saveFields.mockImplementation(async (p: PraticaDetailDTO) => ({
      practice: { ...p, repeats: { ...p.repeats, ARPA: p.repeats.ARPA!.filter((r: RepeatRowDTO) => r.rowId !== "arpa-2") } },
      toasts: [],
    }));
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    const row = screen.getByTestId("repeat-row-ARPA-arpa-2");
    const parere = within(row).getAllByPlaceholderText("gg/mm/aaaa").find((i) => (i as HTMLInputElement).value === "")!;
    fireEvent.change(parere, { target: { value: "05102026" } });
    fireEvent.blur(parere);
    expect(screen.getByTestId("save-bar")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /Rimuovi/ }));
    fireEvent.click(await screen.findByTestId("confirm-dialog-ok"));
    await waitFor(() => expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument());
  });

  const withoutArpa2 = () => ({ ...MOCK_DETAIL, revision: 8, repeats: { ...MOCK_DETAIL.repeats, ARPA: MOCK_DETAIL.repeats.ARPA!.filter((r: RepeatRowDTO) => r.rowId !== "arpa-2") } });
  const editRowAndName = async () => {
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    const row = screen.getByTestId("repeat-row-ARPA-arpa-2");
    const parere = within(row).getAllByPlaceholderText("gg/mm/aaaa").find((i) => (i as HTMLInputElement).value === "")!;
    fireEvent.change(parere, { target: { value: "05102026" } });
    fireEvent.blur(parere);
    fireEvent.change(nameInput(), { target: { value: "Milano Duomo" } });
    fireEvent.click(screen.getByTestId("save-bar-save"));
  };
  const NAME_EDIT = { occurrenceKey: "F003@PM_PERMESSI.CORE_ANAGRAFICA_SITO", flowId: "F003", value: "Milano Duomo" };

  it.each(["ROW_NOT_FOUND", "ROW_REMOVED", "ROW_GROUP_MISMATCH", "ROW_OTHER_ITERATION"])(
    "422 %s on save: drop that row's edits, reload, save the rest, say so (contract v0.5.3)",
    async (code) => {
      source.saveFields
        .mockRejectedValueOnce(new ApiError("Riga non trovata", 422, { error: "Riga non trovata", code, rowId: "arpa-2" }))
        .mockImplementationOnce(async (p: PraticaDetailDTO) => ({ practice: { ...p, revision: p.revision + 1 }, toasts: [] }));
      // Meanwhile someone else removed arpa-2.
      source.reloadPractice.mockResolvedValue(withoutArpa2());
      await editRowAndName();
      await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/le altre sono state salvate/)));
      expect(source.saveFields.mock.calls[1][0]).toMatchObject({ revision: 8 });
      expect(source.saveFields.mock.calls[1][1]).toEqual([NAME_EDIT]);
      expect(toastMock.error).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument());
      expect(screen.queryByTestId("repeat-row-ARPA-arpa-2")).not.toBeInTheDocument();
    }
  );

  it("the text alone ('Riga non trovata…', older server) is understood too; a failed retry keeps the rest pending", async () => {
    source.saveFields
      .mockRejectedValueOnce(new ApiError("Riga non trovata", 422, { error: "Riga non trovata" }))
      .mockRejectedValueOnce(new ApiError("Rete non disponibile", 0, {}));
    source.reloadPractice.mockResolvedValue(withoutArpa2());
    await editRowAndName();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Rete non disponibile"));
    expect(screen.getByTestId("save-bar")).toHaveTextContent("1 modifica non salvata");
  });

  it("422 ROW_LOCKED: the server's message as is, no reload, edits kept", async () => {
    const message = "Questa riga è collegata a un vincolo Presente e non si può togliere";
    source.saveFields.mockRejectedValueOnce(new ApiError(message, 422, { error: message, code: "ROW_LOCKED", rowId: "arpa-2" }));
    await editRowAndName();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(message));
    expect(source.reloadPractice).not.toHaveBeenCalled();
    expect(screen.getByTestId("save-bar")).toHaveTextContent("2 modifiche non salvate");
  });

  it("sends row operations at once", async () => {
    source.saveFields.mockImplementation(async (p) => ({ practice: p, toasts: [] }));
    render(<PraticaSheet id="mock-0" />);
    await screen.findByTestId("sheet-header");
    fireEvent.click(screen.getByTestId("repeat-add-ARPA"));
    await waitFor(() =>
      expect(source.saveFields).toHaveBeenCalledWith(expect.anything(), [
        { repeat: "ARPA", op: "ADD_ROW", clientRowKey: expect.any(String) },
      ])
    );
    expect(screen.queryByTestId("save-bar")).not.toBeInTheDocument();
  });
});
