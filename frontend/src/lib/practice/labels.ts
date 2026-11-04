/** Etichette leggibili per testi del server (mail, notifiche, storico, export, template): come l'interfaccia (D-155). */
import type { GroupId } from "@/lib/contract";

export const GROUP_LABELS: Readonly<Record<GroupId, string>> = {
  PM_PERMESSI: "PM/Permessi",
  UT_PE: "UT/PE",
  AIE: "AIE",
  DL: "DL",
};

export const groupsLabel = (groups: readonly GroupId[]) => groups.map((g) => GROUP_LABELS[g]).join(", ");
