import * as React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FieldOccurrenceDTO, FieldValue, ListRefDTO } from "@/lib/contract";
import { ApiError } from "@/lib/client";
import { Field } from "@/components/scheda/fields/field";
import { useSheetOptions } from "@/components/scheda/use-sheet-options";
import { loadListOptions } from "@/components/scheda/sheet-source";
import { saveList, loadLists } from "@/components/configurazione/config-source";
import { ISTAT_UNAVAILABLE } from "@/components/scheda/lists-source";
import { EMPTY_LIST_TEXT } from "@/components/scheda/fields/format";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const ref = (listId: string, kind: ListRefDTO["kind"] = "CONFIGURABLE", parentFlowId?: string): ListRefDTO => ({
  listId, kind, allowOther: false, parentFlowId,
});

function occ(label: string, list: ListRefDTO): FieldOccurrenceDTO {
  return {
    occurrenceKey: `${label}@S`, flowId: label, label, sectionKey: "S", order: 1, kind: "MASTER",
    ownerGroup: "PM_PERMESSI", dataType: "SELECT", list, required: false,
  };
}

/** One menu field fed by the real-lists hook, as in the sheet. */
function Menu({ o, value = null, parent }: { o: FieldOccurrenceDTO; value?: FieldValue; parent?: FieldValue }) {
  const getOptions = useSheetOptions("INWIT");
  const res = getOptions(o.list!, parent);
  return (
    <Field
      occurrence={o}
      value={value}
      access={{ editable: true }}
      onChange={() => {}}
      options={res.options}
      optionsLoading={res.loading}
      optionsEmptyText={res.emptyText}
    />
  );
}

async function openMenu(label: string) {
  const field = await screen.findByTestId(`field-${label}@S`);
  await waitFor(() => expect(within(field).getByRole("combobox")).not.toHaveTextContent("Caricamento"));
  fireEvent.click(within(field).getByRole("combobox"));
}

describe("menus from the real lists (B6)", () => {
  it("uses the template's list, without deactivated items", async () => {
    serveTemplates();
    render(<Menu o={occ("Incarico", ref("INCARICO_LAVORAZIONE"))} />);
    await openMenu("Incarico");
    expect(screen.getByRole("option", { name: "Nuovo sito" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Risanamento" })).not.toBeInTheDocument();
  });

  it("still labels a saved value whose code was deactivated", async () => {
    serveTemplates();
    render(<Menu o={occ("Incarico", ref("INCARICO_LAVORAZIONE"))} value={{ code: "RISANAMENTO" }} />);
    const field = await screen.findByTestId("field-Incarico@S");
    await waitFor(() => expect(within(field).getByRole("combobox")).toHaveTextContent("Risanamento (disattivata)"));
  });

  it("an empty list says who can fill it (D-103)", async () => {
    serveTemplates();
    render(<Menu o={occ("Referente", ref("REFERENTE"))} />);
    await openMenu("Referente");
    expect(screen.getByText(EMPTY_LIST_TEXT)).toBeInTheDocument();
  });

  it("ISTAT cascade: provinces follow the chosen region", async () => {
    serveTemplates();
    render(<Menu o={occ("Provincia", ref("ISTAT_PROVINCE", "ISTAT", "F007"))} parent={{ code: "03" }} />);
    await openMenu("Provincia");
    expect(await screen.findByRole("option", { name: "Milano" })).toBeInTheDocument();
  });

  it("ISTAT without parent asks to choose it first", async () => {
    serveTemplates();
    render(<Menu o={occ("Comune", ref("ISTAT_COMUNI", "ISTAT", "F008"))} />);
    fireEvent.click(within(await screen.findByTestId("field-Comune@S")).getByRole("combobox"));
    expect(screen.getByText("Scegli prima il valore del livello superiore")).toBeInTheDocument();
  });

  it("ISTAT 503 is a message, not a broken page (R-13)", async () => {
    serveTemplates({}, { istatAvailable: false });
    render(<Menu o={occ("Regione", ref("ISTAT_REGIONI", "ISTAT"))} />);
    await openMenu("Regione");
    expect(await screen.findByText(ISTAT_UNAVAILABLE)).toBeInTheDocument();
  });

  it("creation uses the common lists, with their real ALTRO code", async () => {
    serveTemplates();
    const options = await loadListOptions("CLIENTE_FINALE", null);
    expect(options.map((o) => o.code)).toContain("ALTRO");
  });
});

describe("Configurazione → Liste on the real routes", () => {
  it("removing a used code is refused with usedCodes (D-106)", async () => {
    serveTemplates();
    const list = (await loadLists("INWIT")).find((l) => l.listId === "INCARICO_LAVORAZIONE")!;
    const err = await saveList(list, list.items.filter((i) => i.code !== "UPGRADE")).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, body: { usedCodes: ["UPGRADE"] } });
  });

  it("a stale revision is a 409", async () => {
    serveTemplates();
    const list = (await loadLists(null)).find((l) => l.listId === "COMMITTENTE")!;
    await saveList(list, list.items);
    const err = await saveList(list, list.items).catch((e) => e);
    expect(err).toMatchObject({ status: 409 });
  });
});

describe("ListsEditor", () => {
  it("shows the usedCodes message", async () => {
    serveTemplates();
    const { ListsEditor } = await import("@/components/configurazione/lists-editor");
    const source = await import("@/components/configurazione/config-source");
    vi.spyOn(source, "saveList").mockRejectedValueOnce(
      new ApiError("Codici in uso", 422, { error: "Codici in uso", usedCodes: ["UPGRADE", "NUOVO_SITO"] })
    );
    render(<ListsEditor initialTemplate="INWIT" />);
    expect(screen.queryByTestId("lists-preview-note")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("list-INCARICO_LAVORAZIONE"));
    const detail = screen.getByTestId("list-detail");
    fireEvent.change(within(detail).getByLabelText("Etichetta 1"), { target: { value: "Nuovo sito (5G)" } });
    fireEvent.click(screen.getByTestId("list-save"));
    expect(await within(detail).findByRole("alert")).toHaveTextContent(
      "Codici già usati in pratiche, non si possono togliere: UPGRADE, NUOVO_SITO. Disattivali."
    );
  });
});
