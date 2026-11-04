import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AlertDTO, NotificationDTO } from "@/lib/contract";

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// Fixtures in place of the API (cutover: no demo data in the app).
vi.mock("@/components/notifiche/notifications-source", async (orig) => ({
  ...(await orig<typeof import("@/components/notifiche/notifications-source")>()),
  ...(await import("@/components/__fixtures__/demo-notifications")).demoNotifications,
}));

import { linkHref, closeAlert, loadNotifications, markAllRead } from "@/components/notifiche/notifications-source";
import { NotificationList } from "@/components/notifiche/notification-list";
import { NotificationsPage } from "@/components/notifiche/notifications-page";
import { AlertsPanel } from "@/components/scheda/alerts-panel";
import { serveTemplates } from "@/components/scheda/__tests__/serve-templates";

beforeEach(() => {
  vi.clearAllMocks();
  serveTemplates();
});

const alert = (patch: Partial<AlertDTO> = {}): AlertDTO => ({
  id: "a1",
  practiceId: "mock-0",
  iteration: 1,
  rule: "SOPRALLUOGO",
  label: "Data sopralluogo non compilata",
  flowId: "F020",
  executionStatus: "ACTIVE",
  openedAt: "2026-09-11T09:00:00+02:00",
  dueAt: "2026-09-11",
  status: "OPEN",
  canCloseManually: true,
  ...patch,
});

describe("linkHref", () => {
  it("builds the sheet path with iteration, section, field and row", () => {
    expect(linkHref({ practiceId: "p1" })).toBe("/pratiche/p1");
    expect(
      linkHref({ practiceId: "p1", iteration: 2, sectionKey: "PM_PERMESSI.ITER", occurrenceKey: "F059@PM_PERMESSI.ITER", flowId: "F059", rowId: "r2" })
    ).toBe("/pratiche/p1?iterazione=2&sezione=PM_PERMESSI.ITER&campo=F059%40PM_PERMESSI.ITER&riga=r2");
    expect(linkHref({ practiceId: "p1", flowId: "F020" })).toBe("/pratiche/p1?campo=F020");
  });

  it("a MENTION opens the sheet on its comment (§14)", () => {
    expect(linkHref({ practiceId: "p1", iteration: 2, commentId: "c9" })).toBe("/pratiche/p1?iterazione=2&commento=c9");
  });
});

describe("NotificationList", () => {
  const items: NotificationDTO[] = [
    { id: "n1", createdAt: "2026-10-08T09:00:00+02:00", read: false, kind: "ALERT", title: "Alert", body: "Scaduto", link: { practiceId: "p1", flowId: "F020" } },
    { id: "n2", createdAt: "2026-10-07T09:00:00+02:00", read: true, kind: "SYSTEM", title: "Sistema", body: "Liste", link: null },
  ];

  it("marks an unread item read and opens its link", async () => {
    const onRead = vi.fn();
    render(<NotificationList items={items} onRead={onRead} />);
    expect(screen.getAllByLabelText("Non letta")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("notification-n1"));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith("/pratiche/p1?campo=F020"));
    expect(onRead).toHaveBeenCalledWith("n1");
  });

  it("without a link: once read it is not a button and does nothing", async () => {
    render(<NotificationList items={items} />);
    expect(screen.getByTestId("notification-n2").tagName).toBe("DIV");
    fireEvent.click(screen.getByTestId("notification-n2"));
    await new Promise((r) => setTimeout(r, 0));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("an unread SYSTEM notice without a link: the click only marks it read, the text stays whole", async () => {
    const onRead = vi.fn();
    const onNavigate = vi.fn();
    const body = "Le mail non partono da più di un'ora: controlla la configurazione SMTP. ".repeat(4).trim();
    const system: NotificationDTO = { id: "s1", createdAt: "2026-10-09T09:00:00+02:00", read: false, kind: "SYSTEM", title: "Mail non inviate", body, link: null };
    render(<NotificationList items={[system]} onRead={onRead} onNavigate={onNavigate} compact />);
    const row = screen.getByTestId("notification-s1");
    expect(row.tagName).toBe("BUTTON");
    expect(row).toHaveAttribute("title", "Segna come letta");
    expect(screen.getByText(body).className).not.toContain("line-clamp");
    fireEvent.click(row);
    await waitFor(() => expect(onRead).toHaveBeenCalledWith("s1"));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("calls onNavigate only before opening a linked practice", async () => {
    const onNavigate = vi.fn();
    render(<NotificationList items={items} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("notification-n1"));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
  });
});

describe("NotificationsPage", () => {
  it("page shows the list and the reminder that reading does not close alerts", async () => {
    render(<NotificationsPage />);
    expect(await screen.findByTestId("notification-list")).toBeInTheDocument();
    expect(screen.getByText(/Leggere una notifica non chiude l.alert/)).toBeInTheDocument();
  });
});

describe("AlertsPanel", () => {
  it("lists open alerts, goes to the field and closes with a confirmation", async () => {
    const onGoTo = vi.fn();
    const onClose = vi.fn().mockResolvedValue(undefined);
    render(<AlertsPanel alerts={[alert()]} labelOf={() => "Data assegnazione"} onGoTo={onGoTo} onClose={onClose} />);
    const row = screen.getByTestId("alert-a1");
    expect(row).toHaveTextContent("Data assegnazione · scadenza 11/09/2026");
    fireEvent.click(within(row).getByTestId("alert-goto-a1"));
    expect(onGoTo).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    fireEvent.click(within(row).getByTestId("alert-close-a1"));
    fireEvent.click(screen.getByTestId("alert-close-dialog-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }), expect.any(String)));
  });

  it("shows suspended alerts as suspended, without manual close", () => {
    render(
      <AlertsPanel alerts={[alert({ executionStatus: "SUSPENDED" })]} labelOf={() => null} onGoTo={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("sospeso: pratica archiviata")).toBeInTheDocument();
    expect(screen.queryByTestId("alert-close-a1")).not.toBeInTheDocument();
  });

  it("FATTURABILE_KO: no Chiudi, a link to Fatturabile instead (D-137)", () => {
    const onGoToFatturabile = vi.fn();
    render(
      <AlertsPanel
        alerts={[alert({ rule: "FATTURABILE_KO", flowId: undefined, canCloseManually: true })]}
        labelOf={() => null}
        onGoTo={vi.fn()}
        onGoToFatturabile={onGoToFatturabile}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId("alert-close-a1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Si chiude decidendo Fatturabile (SÌ o NO) in cima alla scheda"));
    expect(onGoToFatturabile).toHaveBeenCalled();
  });

  it("renders nothing without open alerts", () => {
    const { container } = render(
      <AlertsPanel alerts={[alert({ status: "CLOSED" })]} labelOf={() => null} onGoTo={vi.fn()} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
