/**
 * TEST FIXTURE (cutover D-161): demo notifications and alert closing, moved out of the app code.
 * Tests plug it in with vi.mock(<source>, ...) in place of the real API calls.
 */
import type { AlertDTO, NotificationDTO, NotificationListResponse } from "@/lib/contract";
import { mockGet, mockPut } from "@/components/__fixtures__/demo-sheet";


let mockState: NotificationDTO[] | null = null;

/** Built from the demo practice, so links point to fields that exist in its real template. */
async function mockItems(): Promise<NotificationDTO[]> {
  if (mockState) return mockState;
  const practice = await mockGet("mock-0");
  const alert = practice?.alerts[0];
  mockState = [
    {
      id: "n-1",
      createdAt: "2026-10-08T09:00:00+02:00",
      read: false,
      kind: "ALERT",
      title: `[demo] Alert ${alert?.rule ?? "SOPRALLUOGO"} · ${practice?.codiceSito ?? ""}`,
      body: alert?.label ?? "[demo] Scadenza superata",
      link: practice ? { practiceId: practice.id, iteration: practice.iteration, flowId: alert?.flowId, sectionKey: alert?.sectionKey } : null,
    },
    {
      id: "n-2",
      createdAt: "2026-10-07T15:20:00+02:00",
      read: false,
      kind: "ASSIGN",
      title: `[demo] Pratica assegnata a UT/PE · ${practice?.codiceSito ?? ""}`,
      body: "[demo] Laura Verdi ti ha assegnato la pratica. Nota: sopralluogo da fissare con il custode.",
      link: practice ? { practiceId: practice.id } : null,
    },
    {
      id: "n-3",
      createdAt: "2026-10-06T09:00:00+02:00",
      read: true,
      kind: "REMINDER",
      title: "[demo] Promemoria settimanale: Invio Offerta",
      body: "[demo] L'offerta è stata inviata da più di una settimana senza ODA.",
      link: practice ? { practiceId: practice.id } : null,
    },
    {
      id: "n-4",
      createdAt: "2026-10-01T08:00:00+02:00",
      read: true,
      kind: "SYSTEM",
      title: "[demo] Liste aggiornate",
      body: "[demo] L'ADMIN ha aggiunto voci alla lista Incarico / Lavorazione.",
      link: null,
    },
  ];
  return mockState;
}

async function mockList(unread: boolean): Promise<NotificationListResponse> {
  const items = await mockItems();
  return { items: unread ? items.filter((n) => !n.read) : items, unread: items.filter((n) => !n.read).length };
}

async function mockClose(alert: AlertDTO): Promise<AlertDTO> {
  if (alert.status === "CLOSED") return alert;
  const closed: AlertDTO = {
    ...alert,
    status: "CLOSED",
    closeMode: "MANUAL",
    closedAt: new Date().toISOString(),
    closedBy: "u-admin",
    closedByName: "Amministratore",
    canCloseManually: false,
  };
  const practice = await mockGet(alert.practiceId);
  if (practice) {
    const alerts = practice.alerts.filter((a) => a.id !== alert.id);
    mockPut({ ...practice, alerts, openAlerts: alerts.length });
  }
  return closed;
}

/** Same signatures as notifications-source. */
export const demoNotifications = {
  loadNotifications: async (opts: { unread?: boolean; limit?: number } = {}) => mockList(opts.unread ?? false),
  markRead: async (id: string) => {
    mockState = (await mockItems()).map((n) => (n.id === id ? { ...n, read: true } : n));
  },
  markAllRead: async () => {
    mockState = (await mockItems()).map((n) => ({ ...n, read: true }));
  },
  closeAlert: async (alert: AlertDTO, _operationId: string) => mockClose(alert),
};
