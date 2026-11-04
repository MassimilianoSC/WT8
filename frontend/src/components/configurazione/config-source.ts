import { apiFetch } from "@/lib/client";
import type {
  AlertRuleConfigDTO,
  AlertRuleUpdateRequest,
  ListDTO,
  ListItemDTO,
  ListUpdateRequest,
  TemplateId,
  UserDTO,
  UserInviteRequest,
  UserListResponse,
  UserUpdateRequest,
} from "@/lib/contract";
import { invalidateCatalogs } from "@/components/scheda/lists-source";

/**
 * Data access of the Configurazione pages (F4): lists (§6), alert thresholds
 * (§6, v0.1.7) and users (§4, v0.1.8).
 */

// ─── Lists ──────────────────────────────────────────────────────────────────

/**
 * Lists of a scope from the real route (B6). `null` = common lists only.
 */
export async function loadLists(templateId: TemplateId | null): Promise<ListDTO[]> {
  const qs = templateId ? `?templateId=${templateId}` : "";
  const lists = await apiFetch<ListDTO[]>(`/api/lists${qs}`);
  return lists.filter((l) => l.templateId === templateId);
}

/** PUT with revision: 409 REVISION_CONFLICT; 422 with `usedCodes` when a used code is removed (D-106). */
export async function saveList(list: ListDTO, items: ListItemDTO[]): Promise<ListDTO> {
  const body: ListUpdateRequest = { items, revision: list.revision };
  const qs = list.templateId ? `?templateId=${list.templateId}` : "";
  const saved = await apiFetch<ListDTO>(`/api/lists/${encodeURIComponent(list.listId)}${qs}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  invalidateCatalogs();
  return saved;
}

// ─── Alert thresholds ───────────────────────────────────────────────────────

export async function loadAlertRules(templateId: TemplateId): Promise<AlertRuleConfigDTO[]> {
  return apiFetch<AlertRuleConfigDTO[]>(`/api/alert-rules?templateId=${templateId}`);
}

export async function saveAlertRule(rule: AlertRuleConfigDTO, days: number): Promise<AlertRuleConfigDTO> {
  const body: AlertRuleUpdateRequest = { days, revision: rule.revision };
  return apiFetch<AlertRuleConfigDTO>(
    `/api/alert-rules/${encodeURIComponent(rule.ruleId)}?templateId=${rule.templateId}`,
    { method: "PUT", body: JSON.stringify(body) }
  );
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function loadUsers(): Promise<UserListResponse> {
  return apiFetch<UserListResponse>("/api/users");
}

export async function inviteUser(req: UserInviteRequest): Promise<UserDTO> {
  return apiFetch<UserDTO>("/api/users", { method: "POST", body: JSON.stringify(req) });
}

/** POST /api/users/{id}/resend-invite (v0.1.11, D-108): only for invited users (else 409);
 *  the previous link stops working and a new mail is sent. */
export async function resendInvite(id: string): Promise<UserDTO> {
  return apiFetch<UserDTO>(`/api/users/${encodeURIComponent(id)}/resend-invite`, { method: "POST" });
}

export async function updateUser(id: string, req: UserUpdateRequest): Promise<UserDTO> {
  return apiFetch<UserDTO>(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(req) });
}
