import { GROUP_IDS, type GroupId, type StatoAttivita } from "@/lib/contract";

/** Display order of the operational groups (G §2, D-17). */
export const GROUP_ORDER: readonly GroupId[] = GROUP_IDS;

export const GROUP_LABEL: Record<GroupId, string> = {
  PM_PERMESSI: "PM/Permessi",
  UT_PE: "UT/PE",
  AIE: "AIE",
  DL: "DL",
};

/** Labels as written in the Guida (§14). */
export const STATO_LABEL: Record<StatoAttivita, string> = {
  CREATA: "CREATA",
  ASSEGNATO: "ASSEGNATO",
  IN_APPROVAZIONE: "IN APPROVAZIONE",
  PROTOCOLLATO: "PROTOCOLLATO",
  INTEGRAZIONE_RICHIESTA: "INTEGRAZIONE RICHIESTA",
  AUTORIZZATO: "AUTORIZZATO",
  DINIEGATO: "DINIEGATO",
  TAR: "TAR",
  REALIZZATO: "REALIZZATO",
  TERMINATO: "TERMINATO",
  STAND_BY: "STAND-BY",
  KO: "KO",
};

/** Concluding states: shown as filled badges, sorted after the open ones. */
export const STATI_CONCLUSIVI: StatoAttivita[] = ["TERMINATO", "KO"];
