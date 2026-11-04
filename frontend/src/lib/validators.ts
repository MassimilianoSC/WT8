import { z } from "zod";
import {
  GROUP_IDS,
  ROLE_GROUP,
  ROLE_IDS,
  STATI_ATTIVITA,
  TEMPLATE_IDS,
  type AlertCloseRequest,
  type AssistantMessageRequest,
  type CommentCreateRequest,
  type CommentUpdateRequest,
  type AssistantSettingsUpdateRequest,
  type AndamentoSettingsUpdateRequest,
  type ImportCommitRequest,
  type AlertRuleUpdateRequest,
  type AssignRequest,
  type ChangeStatoRequest,
  type CreatePracticeRequest,
  type FieldChangeRequest,
  type ListUpdateRequest,
  type NotificationUpdateRequest,
  type ResolveTemplateRequest,
  type ResubmitRequest,
  type RevisionRequest,
  type ReworkRequest,
  type UserInviteRequest,
  type UserUpdateRequest,
} from "@/lib/contract";
import { isValidIsoDate } from "@/lib/calendario";

/** Zod schemas shared by API route handlers and client forms. */

// Rotte di accesso (cutover 3.5): 422 su email non valida o password corta (le pagine mostrano testi propri in
// italiano, components/auth/auth-errors.ts). Il token mancante o non valido dà 400, controllato nella rotta.
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Email non valida"),
});

const strongPassword = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .max(128, "La password può avere al più 128 caratteri");

export const tokenPasswordSchema = z.object({
  token: z.string(),
  password: strongPassword,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Inserisci la password attuale"),
  newPassword: strongPassword,
});

/* ─── Contratto v0.1.7 (lib/contract.ts) ──────────────────────────────────────
 * Schemi dei corpi delle API nuove. Gli schemi sopra restano per la beta finché non si passa al nuovo
 * modello (D-60, D-68). Ogni schema è legato al tipo del contratto da un controllo a compilazione.
 */

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
const revision = z.number().int().nonnegative();
const operationId = z.uuid().optional();
const templateIdSchema = z.enum(TEMPLATE_IDS);
const groupIdSchema = z.enum(GROUP_IDS);
const roleIdSchema = z.enum(ROLE_IDS);

export const selectValueSchema = z.strictObject({
  code: nonEmpty(200),
  otherText: z.string().max(500).optional(),
});

export const fieldValueSchema = z.union([
  z.null(),
  z.string().max(20000),
  z.number().finite(),
  selectValueSchema,
  z.array(selectValueSchema).max(500),
]);

const flowIdSchema = z.string().regex(/^F\d{3}$/, "flowId non valido");

export const fieldChangeSchema = z.union([
  z.strictObject({ occurrenceKey: nonEmpty(200), flowId: flowIdSchema, value: fieldValueSchema }),
  z.strictObject({ occurrenceKey: nonEmpty(200), repeat: nonEmpty(50), rowId: nonEmpty(50), flowId: flowIdSchema, value: fieldValueSchema }),
  z.strictObject({
    repeat: nonEmpty(50),
    op: z.literal("ADD_ROW"),
    clientRowKey: nonEmpty(100),
    values: z.record(flowIdSchema, fieldValueSchema).optional(),
  }),
  z.strictObject({ repeat: nonEmpty(50), op: z.literal("REMOVE_ROW"), rowId: nonEmpty(50) }),
  z.strictObject({
    repeat: z.literal("VINCOLI"),
    rowId: nonEmpty(50),
    constraint: z.strictObject({ stato: selectValueSchema.nullable().optional(), ente: selectValueSchema.nullable().optional() }),
  }),
  z.strictObject({ transversal: z.literal("noteOperative"), group: groupIdSchema, value: z.string().max(20000) }),
  z.strictObject({ transversal: z.literal("fatturabile"), value: z.enum(["SI", "NO"]) }),
  z.strictObject({ transversal: z.literal("fatturato"), value: z.enum(["SI", "NO"]).nullable() }),
]);

export const fieldChangeRequestSchema = z.strictObject({
  iteration: z.number().int().min(1),
  revision,
  operationId,
  changes: z.array(fieldChangeSchema).min(1).max(500),
});

/**
 * D-132 P-06: schema SOLO strutturale per la rotta del PATCH. Identifica le modifiche (chiavi, forme), ma i valori
 * (value, values, constraint) li valida il servizio DOPO 404, iterazione e permessi, così chi non può scrivere non
 * scopre esiti di validazione. Lo schema completo qui sopra resta il riferimento del contratto.
 */
const anyValue = z.unknown();
export const fieldChangeStructSchema = z.union([
  z.strictObject({ occurrenceKey: nonEmpty(200), flowId: flowIdSchema, value: anyValue }),
  z.strictObject({ occurrenceKey: nonEmpty(200), repeat: nonEmpty(50), rowId: nonEmpty(50), flowId: flowIdSchema, value: anyValue }),
  z.strictObject({ repeat: nonEmpty(50), op: z.literal("ADD_ROW"), clientRowKey: nonEmpty(100), values: z.record(flowIdSchema, anyValue).optional() }),
  z.strictObject({ repeat: nonEmpty(50), op: z.literal("REMOVE_ROW"), rowId: nonEmpty(50) }),
  z.strictObject({ repeat: z.literal("VINCOLI"), rowId: nonEmpty(50), constraint: z.strictObject({ stato: anyValue.optional(), ente: anyValue.optional() }) }),
  z.strictObject({ transversal: z.literal("noteOperative"), group: groupIdSchema, value: anyValue }),
  z.strictObject({ transversal: z.literal("fatturabile"), value: anyValue }),
  z.strictObject({ transversal: z.literal("fatturato"), value: anyValue }),
]);
export const fieldChangeRequestStructSchema = z.strictObject({
  iteration: z.number().int().min(1),
  revision,
  operationId,
  changes: z.array(fieldChangeStructSchema).min(1).max(500),
});

export const resolveTemplateRequestSchema = z.strictObject({
  committente: selectValueSchema,
  clienteFinale: selectValueSchema,
  operationId,
});

/** Codice G7: numero intero (D-93), trasportato come stringa di cifre. */
const codiceG7Schema = z.string().trim().regex(/^\d{1,20}$/, "Il Codice G7 deve contenere solo cifre");

export const createPracticeRequestSchema = z.strictObject({
  templateId: templateIdSchema,
  committente: selectValueSchema,
  clienteFinale: selectValueSchema,
  codiceG7: codiceG7Schema,
  codiceSito: nonEmpty(100),
  nomeSito: nonEmpty(200),
  operationId,
});

export const revisionRequestSchema = z.strictObject({ revision, operationId });
export const archiveRequestSchema = revisionRequestSchema;
export const restoreRequestSchema = revisionRequestSchema;

export const assignRequestSchema = z.strictObject({
  revision,
  operationId,
  groups: z
    .array(groupIdSchema)
    .min(1)
    .refine((g) => new Set(g).size === g.length, "Gruppi ripetuti"),
  note: z.string().max(2000).optional(),
});

export const changeStatoRequestSchema = z.strictObject({ revision, operationId, stato: z.enum(STATI_ATTIVITA) });
export const reworkRequestSchema = z.strictObject({ operationId, codiceG7: codiceG7Schema.optional() });
export const resubmitRequestSchema = z.strictObject({ revision, operationId, codiceG7: codiceG7Schema.optional() });

export const membershipSchema = z
  .strictObject({ templateId: templateIdSchema, group: groupIdSchema, role: roleIdSchema, leader: z.boolean() })
  .refine((m) => ROLE_GROUP[m.role] === m.group, "Ruolo e gruppo non coerenti");

export const userInviteRequestSchema = z
  .strictObject({
    name: nonEmpty(200),
    email: z.email().max(200),
    isAdmin: z.boolean().optional(),
    direzione: z.boolean().optional(),
    memberships: z.array(membershipSchema).max(100),
  })
  .refine((u) => u.isAdmin === true || u.direzione === true || u.memberships.length > 0, "Serve almeno un'appartenenza");

export const userUpdateRequestSchema = z.strictObject({
  name: nonEmpty(200).optional(),
  status: z.enum(["active", "invited", "deactivated"]).optional(),
  isAdmin: z.boolean().optional(),
  direzione: z.boolean().optional(),
  memberships: z.array(membershipSchema).max(100).optional(),
});

/** §15: soglia delle pratiche ferme (giorni di calendario). */
export const andamentoSettingsUpdateRequestSchema = z.strictObject({
  sogliaFermeGiorni: z.number().int("Serve un numero intero di giorni").min(1, "Almeno 1 giorno").max(365, "Al massimo 365 giorni"),
});

export const listUpdateRequestSchema = z.strictObject({
  revision,
  items: z
    .array(z.strictObject({ code: nonEmpty(100), label: nonEmpty(300), active: z.boolean(), order: z.number().int() }))
    .max(2000),
});

export const alertRuleUpdateRequestSchema = z.strictObject({ revision, days: z.number().int().min(0).max(3650) });
export const notificationUpdateRequestSchema = z.strictObject({ read: z.literal(true) });
export const alertCloseRequestSchema = z.strictObject({ operationId });

/** §12: conferma dell'import (B9). operationId obbligatoria: ogni riga è un'operazione "<operationId>:<riga>". */
export const importCommitRequestSchema = z.strictObject({
  operationId: z.uuid(),
  choices: z
    .array(
      z.strictObject({
        rowIndex: z.number().int().positive(),
        action: z.enum(["APPLY", "SKIP"]),
        practiceId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
      })
    )
    .max(5000)
    .optional(),
});

/* ─── §13 Assistente AI ─────────────────────────────────────────────────────── */

/** PUT /api/assistant/settings (ADMIN, D-169, D-171): limiti per persona 1..100 al giorno e 1..10 al minuto. */
export const assistantSettingsUpdateRequestSchema = z.strictObject({
  enabled: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(100).optional(),
  perMinuteLimit: z.number().int().min(1).max(10).optional(),
});

const isoDateSchema = z.string().refine(isValidIsoDate, "data non valida (AAAA-MM-GG)");
const practiceListQuerySchema = z.strictObject({
  templateId: templateIdSchema.optional(),
  stato: z.enum(STATI_ATTIVITA).optional(),
  archived: z.boolean().optional(),
  q: z.string().trim().max(200).optional(),
  scope: z.enum(["assigned", "all"]).optional(),
  sort: z.enum(["open_first", "updated_desc", "created_desc"]).optional(),
  page: z.number().int().min(1).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** POST /api/assistant/messages: "sheet" vuole practiceId; iteration solo con "sheet"; listQuery solo con "list". */
export const assistantMessageRequestSchema = z.strictObject({
  requestId: z.uuid(),
  conversationId: z.uuid().optional(),
  text: z.string().trim().min(1, "La domanda è vuota").max(2000, "La domanda supera 2000 caratteri"),
  context: z
    .strictObject({
      page: z.enum(["list", "sheet", "stats", "other"]),
      practiceId: z.string().regex(/^[0-9a-f]{24}$/, "practiceId non valido").optional(),
      iteration: z.number().int().min(1).optional(),
      templateId: templateIdSchema.optional(),
      listQuery: practiceListQuerySchema.optional(),
    })
    .superRefine((c, ctx) => {
      if (c.page === "sheet" && !c.practiceId) ctx.addIssue({ code: "custom", message: "practiceId obbligatorio con page sheet", path: ["practiceId"] });
      if (c.page !== "sheet" && (c.practiceId !== undefined || c.iteration !== undefined)) ctx.addIssue({ code: "custom", message: "practiceId e iteration solo con page sheet", path: ["page"] });
      if (c.page !== "list" && c.listQuery !== undefined) ctx.addIssue({ code: "custom", message: "listQuery solo con page list", path: ["listQuery"] });
    })
    .optional(),
});

/* ─── §14 Commenti con menzioni (v0.5.0) ──────────────────────────────────────── */

export const COMMENT_MAX_CHARS = 10_000;
export const COMMENT_MAX_MENTIONS = 20;

const mentionLabel = z.string().trim().min(1).max(120);
export const commentMentionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("group"), id: z.enum(GROUP_IDS), label: mentionLabel }),
  z.strictObject({ kind: z.literal("all"), label: mentionLabel }),
  z.strictObject({ kind: z.literal("user"), id: z.string().regex(/^[0-9a-f]{24}$/, "id utente non valido"), label: mentionLabel }),
]);
// Testo semplice: nessuna interpretazione del markup (D-184). Vuoto dopo il trim → 422.
const commentBody = z.string().trim().min(1, "Il commento è vuoto").max(COMMENT_MAX_CHARS, `Il commento supera ${COMMENT_MAX_CHARS} caratteri`);
const commentMentions = z.array(commentMentionSchema).max(COMMENT_MAX_MENTIONS, `Al massimo ${COMMENT_MAX_MENTIONS} menzioni`);

export const commentCreateRequestSchema = z.strictObject({
  body: commentBody,
  mentions: commentMentions,
  parentId: z.string().regex(/^[0-9a-f]{24}$/, "parentId non valido").optional(),
  operationId,
});

export const commentUpdateRequestSchema = z.strictObject({
  body: commentBody,
  mentions: commentMentions,
  operationId,
});

// Controlli a compilazione: ogni schema produce esattamente un valore accettato dal tipo del contratto.
type Assignable<T, U extends T> = U;
type _ContractChecks = [
  Assignable<FieldChangeRequest, z.output<typeof fieldChangeRequestSchema>>,
  Assignable<ResolveTemplateRequest, z.output<typeof resolveTemplateRequestSchema>>,
  Assignable<CreatePracticeRequest, z.output<typeof createPracticeRequestSchema>>,
  Assignable<RevisionRequest, z.output<typeof revisionRequestSchema>>,
  Assignable<AssignRequest, z.output<typeof assignRequestSchema>>,
  Assignable<ChangeStatoRequest, z.output<typeof changeStatoRequestSchema>>,
  Assignable<ReworkRequest, z.output<typeof reworkRequestSchema>>,
  Assignable<ResubmitRequest, z.output<typeof resubmitRequestSchema>>,
  Assignable<UserInviteRequest, z.output<typeof userInviteRequestSchema>>,
  Assignable<UserUpdateRequest, z.output<typeof userUpdateRequestSchema>>,
  Assignable<ListUpdateRequest, z.output<typeof listUpdateRequestSchema>>,
  Assignable<AlertRuleUpdateRequest, z.output<typeof alertRuleUpdateRequestSchema>>,
  Assignable<NotificationUpdateRequest, z.output<typeof notificationUpdateRequestSchema>>,
  Assignable<AlertCloseRequest, z.output<typeof alertCloseRequestSchema>>,
  Assignable<ImportCommitRequest, z.output<typeof importCommitRequestSchema>>,
  Assignable<AssistantSettingsUpdateRequest, z.output<typeof assistantSettingsUpdateRequestSchema>>,
  Assignable<AssistantMessageRequest, z.output<typeof assistantMessageRequestSchema>>,
  Assignable<CommentCreateRequest, z.output<typeof commentCreateRequestSchema>>,
  Assignable<CommentUpdateRequest, z.output<typeof commentUpdateRequestSchema>>,
  Assignable<AndamentoSettingsUpdateRequest, z.output<typeof andamentoSettingsUpdateRequestSchema>>,
];
