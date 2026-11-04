import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MeDTO } from "@/lib/contract";

const nav = vi.hoisted(() => ({ pathname: "/pratiche", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AssistantProvider, useAssistantPageContext, type PageContext } from "@/components/assistente/assistant-store";
import { AskButton, AssistantPanel } from "@/components/assistente/assistant-panel";
import type { AssistantMessageRequest, AssistantStatusDTO } from "@/components/assistente/types";
import {
  FACT,
  PRACTICE_SOURCE,
  answerEvents,
  controlledStream,
  demoStatus,
  doneEvent,
  errorResponse,
  ndjson,
  ndjsonResponse,
  startEvent,
  withSeq,
} from "@/components/__fixtures__/demo-assistant";

const PM: MeDTO = {
  id: "u-pm",
  name: "Laura Verdi",
  email: "laura@x",
  status: "active",
  isAdmin: false,
  memberships: [{ templateId: "ILIAD", group: "PM_PERMESSI", role: "PM", leader: true }],
  createdAt: "2026-10-01T09:00:00+02:00",
  updatedAt: "2026-10-01T09:00:00+02:00",
  canCreate: ["ILIAD"],
  mustChangePassword: false,
};

const SHEET_CTX: PageContext = {
  context: { page: "sheet", practiceId: "p-iliad-1", iteration: 2, templateId: "ILIAD" },
  label: "Pratica IL-TO-0001 · iterazione 2",
};

type Reply = Response | ((init: RequestInit) => Response | Promise<Response>);

/** fetch of the assistant routes: status always answers, messages take the queued replies in order. */
function stubAssistant(replies: Reply[], status: AssistantStatusDTO = demoStatus()) {
  const bodies: AssistantMessageRequest[] = [];
  const inits: RequestInit[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === "/api/assistant/status") return new Response(JSON.stringify(status), { headers: { "Content-Type": "application/json" } });
    if (url === "/api/assistant/messages") {
      bodies.push(JSON.parse(String(init.body)));
      inits.push(init);
      const r = replies.shift();
      if (!r) throw new Error("no reply queued");
      return typeof r === "function" ? r(init) : r;
    }
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, bodies, inits };
}

/** A reply streamed by the test; like a real fetch, aborting the signal errors the body. */
function live() {
  const s = controlledStream();
  const reply = (init: RequestInit) => {
    init.signal?.addEventListener("abort", () => s.fail());
    return ndjsonResponse(s.stream);
  };
  return { s, reply };
}

function PageCtx({ ctx }: { ctx: PageContext | null }) {
  useAssistantPageContext(ctx);
  return null;
}

function renderPanel({ status = demoStatus(), me = PM, ctx = null as PageContext | null } = {}) {
  const utils = render(
    <AssistantProvider me={me} initialStatus={status}>
      <PageCtx ctx={ctx} />
      <AskButton />
      <main>pagina</main>
      <AssistantPanel />
    </AssistantProvider>
  );
  fireEvent.click(screen.getByTestId("assistant-ask"));
  return utils;
}

const composer = () => screen.getByLabelText("Domanda per l'assistente") as HTMLTextAreaElement;
function askText(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(screen.getByTestId("assistant-send"));
}
const lastTurn = () => {
  const turns = screen.getAllByTestId("assistant-turn");
  return turns[turns.length - 1];
};

beforeEach(() => {
  nav.pathname = "/pratiche";
  nav.push.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chiedi and the panel", () => {
  it("opens next to the bell with the focus in the composer and role suggestions that fill without sending", async () => {
    const { fetchMock } = stubAssistant([]);
    renderPanel();
    expect(screen.getByTestId("assistant-ask")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Assistente · sola lettura")).toBeInTheDocument();
    expect(composer()).toHaveFocus();
    const suggestions = within(screen.getByTestId("assistant-suggestions")).getAllByRole("button");
    expect(suggestions[0]).toHaveTextContent("Quali pratiche ILIAD hanno il Forecast Ottenimento Permessi entro fine mese?");
    fireEvent.click(suggestions[0]);
    expect(composer().value).toBe("Quali pratiche ILIAD hanno il Forecast Ottenimento Permessi entro fine mese?");
    // Opening refreshes the counter; nothing is asked.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assistant/status", expect.anything()));
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/assistant/messages")).toBe(false);
    expect(screen.getByTestId("assistant-usage")).toHaveTextContent("12/30 oggi");
  });

  it("streams an answer: status first, sources and facts, [n] links to the sheet, read time and disclaimer", async () => {
    const { s, reply } = live();
    const { bodies } = stubAssistant([reply]);
    renderPanel({ ctx: SHEET_CTX });
    expect(screen.getByTestId("assistant-context")).toHaveTextContent("Pratica IL-TO-0001 · iterazione 2");
    askText("  Quante pratiche?  ");
    expect(bodies[0]).toMatchObject({ text: "Quante pratiche?", context: SHEET_CTX.context });
    expect(bodies[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bodies[0].conversationId).toBeUndefined();
    expect(composer().value).toBe("");
    expect(screen.getByTestId("assistant-stop")).toBeInTheDocument();

    const events = answerEvents();
    await act(async () => s.push(...events.slice(0, 2).map(({ seq: _s, ...e }) => e as never)));
    expect(await screen.findByTestId("assistant-status")).toHaveTextContent("Cerco le pratiche ILIAD con forecast entro il 31/10…");
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("Cerco le pratiche ILIAD");

    await act(async () => s.push(...events.slice(2).map(({ seq: _s, ...e }) => e as never)));
    const turn = lastTurn();
    await waitFor(() => expect(turn).toHaveAttribute("data-phase", "done"));
    expect(within(turn).getByTestId("assistant-answer")).toHaveTextContent("Sono 7 le pratiche ILIAD con forecast entro fine mese");
    const cite1 = within(within(turn).getByTestId("assistant-answer")).getByLabelText("Fonte 1: Forecast Ottenimento Permessi").closest("a");
    expect(cite1).toHaveAttribute("href", "/pratiche/p-iliad-1?iterazione=2&sezione=PERMESSI&campo=forecast_ottenimento_permessi");
    const sources = within(turn).getByTestId("assistant-sources");
    expect(sources).toHaveTextContent("IL-TO-0001 · Torino Lingotto · ILIAD · iterazione 2");
    expect(within(sources).getAllByRole("link")[1]).toHaveAttribute("href", "/pratiche?template=ILIAD&stato=ASSEGNATO");
    expect(sources).toHaveTextContent("ILIAD · stato ASSEGNATO");
    const facts = within(turn).getByTestId("assistant-facts");
    expect(facts).toHaveTextContent(FACT.label);
    expect(facts).toHaveTextContent("dal 09/10/2026 al 31/10/2026");
    expect(facts).toHaveTextContent("7");
    expect(within(turn).getByTestId("assistant-read-at")).toHaveTextContent("Dati letti tra le 10:41 e le 10:42 · Sola lettura. Le risposte possono contenere errori: verifica sulla scheda.");
    expect(within(turn).queryByTestId("assistant-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistant-usage")).toHaveTextContent("13/30 oggi");
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("Risposta conclusa.");
    // After the terminal event the client lets the body go.
    expect(s.state.cancelled).toBe(true);
  });

  it("the next question carries the conversation and the context of the page; a removed context is not sent", async () => {
    const { bodies } = stubAssistant([ndjsonResponse(ndjson(answerEvents())), ndjsonResponse(ndjson(answerEvents()))]);
    renderPanel({ ctx: SHEET_CTX });
    askText("Prima");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    fireEvent.click(screen.getByTestId("assistant-context-remove"));
    expect(screen.queryByTestId("assistant-context")).not.toBeInTheDocument();
    askText("Seconda");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].conversationId).toBe("c-1");
    expect(bodies[1].context).toBeUndefined();
    // The question keeps the context it was asked with.
    expect(within(screen.getAllByTestId("assistant-turn")[0]).getByText(/Pratica IL-TO-0001/)).toBeInTheDocument();
  });

  it("a double click sends one question only", async () => {
    const { s, reply } = live();
    const { fetchMock } = stubAssistant([reply]);
    renderPanel();
    fireEvent.change(composer(), { target: { value: "Una" } });
    const form = screen.getByTestId("assistant-composer");
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/assistant/messages")).toHaveLength(1);
    s.close();
  });

  it("Enter sends, Shift+Enter does not, nor Enter while an IME is composing", () => {
    const { fetchMock } = stubAssistant([ndjsonResponse(ndjson(answerEvents()))]);
    renderPanel();
    fireEvent.change(composer(), { target: { value: "Ciao" } });
    fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
    fireEvent.keyDown(composer(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer(), { key: "Enter", keyCode: 229 });
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/assistant/messages")).toHaveLength(0);
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/assistant/messages")).toHaveLength(1);
  });

  it("Interrompi aborts the request; the partial text stays, marked, with Riprova as a new question", async () => {
    const first = live();
    const { inits, bodies } = stubAssistant([first.reply, ndjsonResponse(ndjson(answerEvents()))]);
    renderPanel();
    askText("Lunga");
    await act(async () => first.s.push(startEvent(), { type: "delta", text: "Sono 7 le" }));
    await screen.findByText("Sono 7 le");
    fireEvent.click(screen.getByTestId("assistant-stop"));
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "aborted"));
    expect(inits[0].signal?.aborted).toBe(true);
    expect(within(lastTurn()).getByTestId("assistant-answer")).toHaveTextContent("Sono 7 le");
    expect(within(lastTurn()).getByText(/incompleta/)).toBeInTheDocument();
    expect(within(lastTurn()).getByTestId("assistant-error")).toHaveTextContent("Risposta interrotta da te.");
    fireEvent.click(within(lastTurn()).getByTestId("assistant-retry"));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1].text).toBe("Lunga");
    expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(2);
  });

  it("the model's bold and lists show as structure, never as '**' or HTML (as on the installation)", async () => {
    stubAssistant([
      ndjsonResponse(
        ndjson(withSeq([startEvent(), { type: "delta", text: ["Stato **ASSEGNATO**.", "", "- **Sopralluogo**: 28/09/2026", "- <b>Invio PE</b>"].join("\n") }]))
      ),
    ]);
    renderPanel();
    askText("Riassumi");
    const answer = await screen.findByTestId("assistant-answer");
    await waitFor(() => expect(within(answer).getAllByRole("listitem")).toHaveLength(2));
    expect(answer).not.toHaveTextContent("**");
    expect(within(answer).getByText("ASSEGNATO").tagName).toBe("STRONG");
    expect(within(answer).getAllByRole("listitem")[1]).toHaveTextContent("<b>Invio PE</b>");
    expect(answer.querySelector("b")).toBeNull();
  });

  it("a stream that closes without done shows 'Risposta interrotta' and never retries by itself", async () => {
    const { bodies } = stubAssistant([ndjsonResponse(ndjson(withSeq([startEvent(), { type: "delta", text: "Sono" }])))]);
    renderPanel();
    askText("Domanda");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "interrupted"));
    expect(within(lastTurn()).getByTestId("assistant-error")).toHaveTextContent("Risposta interrotta.");
    expect(within(lastTurn()).getByTestId("assistant-error")).toHaveTextContent("L'app funziona normalmente.");
    expect(within(lastTurn()).getByTestId("assistant-answer")).toHaveTextContent("Sono");
    expect(bodies).toHaveLength(1);
  });

  it("an error event after some text keeps the text and says the app works, with the support contact", async () => {
    stubAssistant([
      ndjsonResponse(
        ndjson(withSeq([startEvent(), { type: "delta", text: "Sono 7" }, { type: "error", code: "UNAVAILABLE", message: "Google non risponde", requestId: "r-1" }]))
      ),
    ]);
    renderPanel();
    askText("Domanda");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "error"));
    const box = within(lastTurn()).getByTestId("assistant-error");
    expect(box).toHaveTextContent("L'assistente non è disponibile in questo momento.");
    expect(box).toHaveTextContent("L'app funziona normalmente. Se il problema continua scrivi a operations@hqe.it.");
    expect(box).toHaveAttribute("data-tone", "error");
    expect(within(lastTurn()).getByTestId("assistant-answer")).toHaveTextContent("Sono 7");
    expect(screen.getByTestId("assistant-live")).toHaveTextContent("L'assistente non è disponibile");
  });

  it("'no data' and 'clarify' are neutral outcomes, not errors", async () => {
    stubAssistant([
      ndjsonResponse(ndjson(withSeq([startEvent(), { type: "delta", text: "Nessuna." }, doneEvent({ finishReason: "NO_ANSWER", answerState: "NO_DATA" })]))),
      ndjsonResponse(ndjson(withSeq([startEvent(), { type: "delta", text: "Quale cliente?" }, doneEvent({ finishReason: "CLARIFY", answerState: "CLARIFY" })]))),
    ]);
    renderPanel();
    askText("Pratiche di Marte?");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    let state = within(lastTurn()).getByTestId("assistant-state");
    expect(state).toHaveTextContent("Non trovo dati per rispondere.");
    expect(state).toHaveAttribute("data-tone", "neutral");
    expect(within(lastTurn()).queryByTestId("assistant-error")).not.toBeInTheDocument();
    askText("Forecast?");
    await waitFor(() => expect(screen.getAllByTestId("assistant-turn")).toHaveLength(2));
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    state = within(lastTurn()).getByTestId("assistant-state");
    expect(state).toHaveTextContent("Serve una precisazione");
  });

  it("an expired conversation offers 'Nuova conversazione' and puts the question back, without resending", async () => {
    const { bodies } = stubAssistant([
      ndjsonResponse(ndjson(answerEvents())),
      errorResponse(409, { error: "Conversazione scaduta", code: "CONVERSATION_EXPIRED" }),
    ]);
    renderPanel();
    askText("Prima");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    askText("Dopo 20 minuti");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "error"));
    expect(bodies[1].conversationId).toBe("c-1");
    expect(within(lastTurn()).getByTestId("assistant-error")).toHaveTextContent("La conversazione è scaduta.");
    fireEvent.click(within(lastTurn()).getByTestId("assistant-new-conversation"));
    expect(screen.queryAllByTestId("assistant-turn")).toHaveLength(0);
    expect(composer().value).toBe("Dopo 20 minuti");
    expect(bodies).toHaveLength(2);
  });

  it("an expired session sends to the login", async () => {
    stubAssistant([errorResponse(401, { error: "Non autenticato", code: "UNAUTHENTICATED" })]);
    renderPanel();
    askText("Domanda");
    const box = await screen.findByTestId("assistant-error");
    expect(box).toHaveTextContent("Sessione scaduta: accedi di nuovo.");
    expect(within(box).getByRole("link", { name: "Accedi" })).toHaveAttribute("href", "/login");
  });

  it("personal limits: day and minute have different texts, in the quota colour, and no Riprova", async () => {
    stubAssistant(
      [
        errorResponse(429, { error: "x", code: "QUOTA_USER_DAY", resetAt: "2026-10-10T00:00:00+02:00" }),
        errorResponse(429, { error: "x", code: "QUOTA_USER_MINUTE", retryAfterSeconds: 40 }),
      ],
      demoStatus({ usedToday: 30, remainingToday: 0 })
    );
    renderPanel({ status: demoStatus({ usedToday: 30, remainingToday: 0 }) });
    askText("Una");
    let box = await screen.findByTestId("assistant-error");
    expect(box).toHaveTextContent("Hai usato 30 domande su 30 oggi.");
    expect(box).toHaveTextContent("Il conteggio riparte domani (10/10/2026, ore 00:00).");
    expect(box).toHaveAttribute("data-tone", "quota");
    expect(within(box).queryByTestId("assistant-retry")).not.toBeInTheDocument();
    askText("Due");
    await waitFor(() => expect(screen.getAllByTestId("assistant-error")).toHaveLength(2));
    box = screen.getAllByTestId("assistant-error")[1];
    expect(box).toHaveTextContent("Hai fatto 4 domande nell'ultimo minuto.");
    expect(box).toHaveTextContent("Riprova tra 40 secondi.");
  });

  it("assistant switched off by the ADMIN: the panel says so and there is no composer", () => {
    stubAssistant([], demoStatus({ enabled: false, availability: "DISABLED" }));
    renderPanel({ status: demoStatus({ enabled: false, availability: "DISABLED" }) });
    expect(screen.getByTestId("assistant-disabled")).toHaveTextContent("Assistente disattivato dall'amministratore.");
    expect(screen.queryByTestId("assistant-composer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-suggestions")).not.toBeInTheDocument();
  });

  it("assistant unavailable (configuration or circuit): technical notice, the app works", () => {
    stubAssistant([], demoStatus({ availability: "UNAVAILABLE" }));
    renderPanel({ status: demoStatus({ availability: "UNAVAILABLE" }) });
    expect(screen.getByTestId("assistant-unavailable")).toHaveTextContent("L'assistente non è disponibile in questo momento.");
    expect(screen.getByTestId("assistant-unavailable")).toHaveTextContent("L'app funziona normalmente.");
  });

  it("Escape closes the panel, stops the question in flight and gives the focus back to Chiedi", async () => {
    const { s, reply } = live();
    const { inits } = stubAssistant([reply]);
    renderPanel();
    askText("Domanda");
    await act(async () => s.push(startEvent()));
    fireEvent.keyDown(composer(), { key: "Escape" });
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistant-ask")).toHaveFocus();
    expect(inits[0].signal?.aborted).toBe(true);
  });

  it("the panel stays open across navigation and keeps the conversation; Maximize opens /assistente", async () => {
    stubAssistant([ndjsonResponse(ndjson(answerEvents()))]);
    const view = renderPanel();
    askText("Domanda");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    nav.pathname = "/pratiche/p-iliad-1";
    view.rerender(
      <AssistantProvider me={PM} initialStatus={demoStatus()}>
        <AskButton />
        <AssistantPanel />
      </AssistantProvider>
    );
    expect(screen.getByTestId("assistant-panel")).toBeInTheDocument();
    expect(screen.getAllByTestId("assistant-turn")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("assistant-maximize"));
    expect(nav.push).toHaveBeenCalledWith("/assistente");
    expect(screen.queryByTestId("assistant-panel")).not.toBeInTheDocument();
  });

  it("a QUERY source refills the composer without sending", async () => {
    const query = { kind: "QUERY" as const, label: "Pratiche con forecast UT scaduto", question: "Quali forecast UT sono scaduti?", readAt: "2026-10-09T10:42:00+02:00" };
    const { bodies } = stubAssistant([
      ndjsonResponse(ndjson(withSeq([startEvent(), { type: "source", index: 1, source: query }, { type: "delta", text: "Vedi [1]." }, doneEvent()]))),
    ]);
    renderPanel();
    askText("Domanda");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    fireEvent.click(within(screen.getByTestId("assistant-sources")).getByRole("button"));
    expect(composer().value).toBe("Quali forecast UT sono scaduti?");
    expect(bodies).toHaveLength(1);
  });

  it("Markdown links written by the model never become links; only [n] point to the server's sources", async () => {
    const text =
      "Vedi [Roma Ostiense (TF-RM-0001)](1), [sito](https://evil.example/x?d=1), [qui](http://evil.example), " +
      "[clicca](javascript:alert(document.cookie)), ![img](https://evil.example/i.png), <javascript:alert(1)> e la fonte [1].";
    stubAssistant([
      ndjsonResponse(ndjson(withSeq([startEvent(), { type: "source", index: 1, source: PRACTICE_SOURCE }, { type: "delta", text }, doneEvent()]))),
    ]);
    renderPanel();
    askText("Domanda");
    await waitFor(() => expect(lastTurn()).toHaveAttribute("data-phase", "done"));
    const answer = within(lastTurn()).getByTestId("assistant-answer");
    expect(answer).toHaveTextContent("Vedi Roma Ostiense (TF-RM-0001), sito, qui, clicca, img, javascript:alert(1) e la fonte");
    expect(answer.textContent).not.toContain("](");
    expect(answer.querySelector("img")).toBeNull();
    const links = Array.from(answer.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/pratiche/p-iliad-1?iterazione=2&sezione=PERMESSI&campo=forecast_ottenimento_permessi"]);
  });

  it("over 2000 characters the question cannot be sent", () => {
    const { fetchMock } = stubAssistant([]);
    renderPanel();
    fireEvent.change(composer(), { target: { value: "x".repeat(2001) } });
    expect(screen.getByTestId("assistant-send")).toBeDisabled();
    expect(screen.getByTestId("assistant-too-long")).toHaveTextContent("Massimo 2000 caratteri (2001).");
    fireEvent.keyDown(composer(), { key: "Enter" });
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/assistant/messages")).toHaveLength(0);
  });
});

describe("without the assistant", () => {
  it("no provider (MeDTO.assistant missing): no Chiedi, no panel", () => {
    render(
      <>
        <AskButton />
        <AssistantPanel />
      </>
    );
    expect(screen.queryByTestId("assistant-ask")).not.toBeInTheDocument();
  });
});
