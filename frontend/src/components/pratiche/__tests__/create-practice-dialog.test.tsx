import { beforeEach, describe, expect, it, vi } from "vitest";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MOCK_TEMPLATES } from "@/components/__fixtures__/demo-data";
import { demoSummaries } from "@/components/__fixtures__/demo-store";

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/pratiche/data-source", async (orig) => ({
  ...(await orig<typeof import("@/components/pratiche/data-source")>()),
  ...(await import("@/components/__fixtures__/demo-list")).demoList,
}));
vi.mock("@/components/scheda/commands", async (orig) => ({
  ...(await orig<typeof import("@/components/scheda/commands")>()),
  ...(await import("@/components/__fixtures__/demo-commands")).demoCommands,
}));

import { CreatePracticeDialog } from "@/components/pratiche/create-practice-dialog";
import { TEMPLATE_IDS } from "@/lib/contract";

const ALL_TEMPLATES = [...TEMPLATE_IDS];

beforeEach(() => {
  serveTemplates();
});

function pick(label: RegExp | string, option: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("CreatePracticeDialog (demo data)", () => {
  it("resolves the template from Cliente Finale and creates the practice", async () => {
    render(<CreatePracticeDialog templates={MOCK_TEMPLATES} allowed={ALL_TEMPLATES} />);
    fireEvent.click(screen.getByTestId("create-pratica-button"));
    fireEvent.change(screen.getByLabelText("Codice G7"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Codice Sito"), { target: { value: "TO0001" } });
    fireEvent.change(screen.getByLabelText("Nome Sito"), { target: { value: "Torino Nord" } });
    await screen.findByText("Scegli Cliente Finale e Committente.");
    await waitFor(() => expect(screen.getByLabelText("Cliente Finale")).not.toHaveTextContent("Caricamento"));
    pick("Cliente Finale", "TowerNet");
    pick("Committente", "Todos");

    expect(await screen.findByText("TOWERNET")).toBeInTheDocument();
    const submit = screen.getByTestId("create-pratica-dialog-submit");
    // Enabled once the duplicate check (D-157) has answered: none here.
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.queryByTestId("create-duplicates")).not.toBeInTheDocument();
    fireEvent.click(submit);
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith(expect.stringMatching(/^\/pratiche\/nuova-\d+$/)));
  });

  it("asks for a manual template with Altro, and requires the Altro text", async () => {
    render(<CreatePracticeDialog templates={MOCK_TEMPLATES} allowed={ALL_TEMPLATES} />);
    fireEvent.click(screen.getByTestId("create-pratica-button"));
    expect(screen.queryByTestId("create-missing")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Codice G7"), { target: { value: "1" } });
    // C2: once started, the dialog says which mandatory fields are missing.
    expect(screen.getByTestId("create-missing")).toHaveTextContent("Mancano: Codice Sito, Nome Sito, Cliente Finale, Committente");
    fireEvent.change(screen.getByLabelText("Codice Sito"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Nome Sito"), { target: { value: "Prova" } });
    await waitFor(() => expect(screen.getByLabelText("Cliente Finale")).not.toHaveTextContent("Caricamento"));
    pick("Cliente Finale", "Altro");
    pick("Committente", "Sirti");

    // Altro without text is incomplete: no resolution yet.
    expect(screen.getByText("Scegli Cliente Finale e Committente.")).toBeInTheDocument();
    const other = screen.getByPlaceholderText("Specifica il valore (Altro)");
    fireEvent.change(other, { target: { value: "Nuovo cliente" } });
    fireEvent.blur(other);

    expect(await screen.findByText("La combinazione non determina il template: sceglilo tu.")).toBeInTheDocument();
    const submit = screen.getByTestId("create-pratica-dialog-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByTestId("create-template-LEONARDO"));
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("refuses a template the user cannot create in (canCreate)", async () => {
    render(<CreatePracticeDialog templates={MOCK_TEMPLATES} allowed={["INWIT"]} />);
    fireEvent.click(screen.getByTestId("create-pratica-button"));
    fireEvent.change(screen.getByLabelText("Codice G7"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Codice Sito"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Nome Sito"), { target: { value: "Prova" } });
    await waitFor(() => expect(screen.getByLabelText("Cliente Finale")).not.toHaveTextContent("Caricamento"));
    pick("Cliente Finale", "TowerNet");
    pick("Committente", "Todos");
    expect(await screen.findByText("Non puoi creare pratiche per TOWERNET.")).toBeInTheDocument();
    expect(screen.getByTestId("create-pratica-dialog-submit")).toBeDisabled();
  });

  it("warns about a practice with the same client, G7, site and name, and creates only when confirmed (D-157)", async () => {
    const existing = demoSummaries().find((p) => p.templateId === "TOWERNET" && p.codiceG7)!;
    render(<CreatePracticeDialog templates={MOCK_TEMPLATES} allowed={ALL_TEMPLATES} />);
    fireEvent.click(screen.getByTestId("create-pratica-button"));
    fireEvent.change(screen.getByLabelText("Codice G7"), { target: { value: existing.codiceG7 } });
    fireEvent.change(screen.getByLabelText("Codice Sito"), { target: { value: ` ${existing.codiceSito.toLowerCase()} ` } });
    fireEvent.change(screen.getByLabelText("Nome Sito"), { target: { value: existing.nomeSito } });
    await waitFor(() => expect(screen.getByLabelText("Cliente Finale")).not.toHaveTextContent("Caricamento"));
    pick("Cliente Finale", "TowerNet");
    pick("Committente", "Todos");

    const warning = await screen.findByTestId("create-duplicates");
    expect(warning).toHaveTextContent("Esiste già una pratica con questi dati:");
    expect(warning.querySelector("a")).toHaveAttribute("href", `/pratiche/${existing.id}`);
    const submit = screen.getByTestId("create-pratica-dialog-submit");
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByTestId("create-anyway"));
    expect(submit).toBeEnabled();

    // Changing the key re-checks and drops the confirmation.
    fireEvent.change(screen.getByLabelText("Nome Sito"), { target: { value: `${existing.nomeSito} 2` } });
    await waitFor(() => expect(screen.queryByTestId("create-duplicates")).not.toBeInTheDocument());
    await waitFor(() => expect(submit).toBeEnabled());
  });
});
