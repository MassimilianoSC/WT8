"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MailPlus, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import {
  ROLE_GROUP,
  ROLE_IDS,
  type MembershipDTO,
  type RoleId,
  type TemplateId,
  type TemplateSummaryDTO,
  type UserDTO,
  type UserListResponse,
  type UserStatus,
} from "@/lib/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GROUP_LABEL } from "@/components/pratiche/labels";
import { listTemplates } from "@/components/pratiche/data-source";
import { CommandDialogShell } from "@/components/scheda/command-dialog-shell";
import { inviteUser, loadUsers, resendInvite, updateUser } from "@/components/configurazione/config-source";
import { userDirezione } from "@/components/andamento/access";
import { LoadError, loadErrorMessage } from "@/components/layout/load-error";

const ALL = "all";

export const ROLE_LABEL: Record<RoleId, string> = {
  PM: "PM",
  PERMESSI: "Permessi",
  UT: "UT",
  PE: "PE",
  AIE: "AIE",
  DL: "DL",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Attivo",
  invited: "Invito in attesa",
  deactivated: "Disattivato",
};

/**
 * Users and memberships (§4, D-19): ADMIN only. `andamento` = PH_ANDAMENTO on
 * (§15): only then the Direzione box and badge; off, the page is as before.
 */
export function UsersAdmin({ andamento = false }: { andamento?: boolean }) {
  const [page, setPage] = React.useState<UserListResponse | null>(null);
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);
  const [filterTemplate, setFilterTemplate] = React.useState<string>(ALL);
  const [filterStatus, setFilterStatus] = React.useState<string>(ALL);
  const [editing, setEditing] = React.useState<UserDTO | "new" | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setPage(await loadUsers());
    setLoadError(null);
  }, []);
  // A failed read shows why and "Riprova", never "Caricamento…" forever.
  const firstLoad = React.useCallback(() => {
    setLoadError(null);
    reload().catch((e) => setLoadError(loadErrorMessage(e)));
  }, [reload]);

  React.useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
    firstLoad();
  }, [firstLoad]);

  const label = (id: TemplateId) => templates.find((t) => t.id === id)?.label ?? id;
  const users = (page?.items ?? []).filter(
    (u) =>
      (filterTemplate === ALL || u.memberships.some((m) => m.templateId === filterTemplate)) &&
      (filterStatus === ALL || u.status === filterStatus)
  );

  return (
    <div className="space-y-6" data-testid="users-admin">
      {page && page.templatesWithoutPmLeader.length > 0 && (
        <div className="flex gap-3 border-2 border-status-error bg-card px-4 py-3" role="alert" data-testid="no-pm-leader">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-error" />
          <div className="text-sm">
            <p className="font-medium">Gestori senza PM leader attivo: {page.templatesWithoutPmLeader.map(label).join(", ")}</p>
            <p className="text-muted-foreground">
              Senza PM leader gli alert destinati al PM non partono e non si possono creare pratiche: nomina un PM leader.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border border-border bg-card p-4">
        <div className="flex flex-wrap gap-4">
          <div className="w-56 space-y-1.5">
            <Label>Gestore</Label>
            <Select value={filterTemplate} onValueChange={setFilterTemplate}>
              <SelectTrigger data-testid="users-filter-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutti i gestori</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48 space-y-1.5">
            <Label>Stato</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger data-testid="users-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutti</SelectItem>
                {(Object.keys(STATUS_LABEL) as UserStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setEditing("new")} data-testid="users-invite">
          <UserPlus className="h-4 w-4" /> Invita utente
        </Button>
      </div>

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Stato</th>
              <th className="px-4 py-2 font-medium">Appartenenze</th>
              <th className="w-12 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {page === null && loadError ? (
              <tr>
                <td colSpan={5}>
                  <LoadError message={loadError} onRetry={firstLoad} testId="users-load-error" />
                </td>
              </tr>
            ) : page === null ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 font-mono text-xs text-muted-foreground">Caricamento…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted-foreground">Nessun utente.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className={cn("border-b border-border align-top", u.status === "deactivated" && "text-muted-foreground")} data-testid={`user-${u.id}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {u.name}
                    {u.isAdmin && (
                      <span className="ml-2 border border-foreground px-1 font-mono text-[10px] uppercase tracking-wider">ADMIN</span>
                    )}
                    {andamento && !u.isAdmin && userDirezione(u) && (
                      <span className="ml-2 border border-foreground px-1 font-mono text-[10px] uppercase tracking-wider" data-testid={`user-direzione-${u.id}`}>
                        DIREZIONE
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider">{STATUS_LABEL[u.status]}</td>
                  <td className="px-4 py-2.5">
                    <ul className="space-y-0.5 font-mono text-xs">
                      {u.memberships.map((m, i) => (
                        <li key={i}>
                          {label(m.templateId)} · {ROLE_LABEL[m.role]}
                          {m.leader && <span className="ml-1 font-semibold">· leader</span>}
                        </li>
                      ))}
                      {u.memberships.length === 0 && <li className="text-muted-foreground">—</li>}
                    </ul>
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setEditing(u)} aria-label={`Modifica ${u.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <UserDialog
        user={editing}
        templates={templates}
        andamento={andamento}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await reload();
        }}
      />
    </div>
  );
}

function UserDialog({
  user,
  templates,
  andamento,
  onClose,
  onSaved,
}: {
  user: UserDTO | "new" | null;
  andamento: boolean;
  templates: TemplateSummaryDTO[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isNew = user === "new";
  const existing = user && user !== "new" ? user : null;
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [direzione, setDirezione] = React.useState(false);
  const [active, setActive] = React.useState(true);
  const [memberships, setMemberships] = React.useState<MembershipDTO[]>([]);
  const [resending, setResending] = React.useState(false);

  async function resend() {
    if (!existing) return;
    setResending(true);
    try {
      await resendInvite(existing.id);
      toast.success(`Nuovo invito inviato a ${existing.email}: il link precedente non vale più`);
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResending(false);
    }
  }

  React.useEffect(() => {
    if (!user) return;
    setName(existing?.name ?? "");
    setEmail(existing?.email ?? "");
    setIsAdmin(existing?.isAdmin ?? false);
    setDirezione(existing ? userDirezione(existing) : false);
    setActive(existing ? existing.status !== "deactivated" : true);
    setMemberships(existing?.memberships ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // Direzione is on top of the memberships (D-193): they become optional only when it is on.
  const withDirezione = andamento && direzione && !isAdmin;
  const canSubmit = !!name.trim() && emailOk && (isAdmin || withDirezione || memberships.length > 0);
  // Off, the field is never sent: even its presence would be refused (422 FEATURE_DISABLED).
  const direzioneField = andamento ? { direzione: !isAdmin && direzione } : {};

  function setRow(i: number, patch: Partial<MembershipDTO>) {
    setMemberships((ms) =>
      ms.map((m, j) => {
        if (j !== i) return m;
        const next = { ...m, ...patch };
        return { ...next, group: ROLE_GROUP[next.role] };
      })
    );
  }

  function addRow() {
    const templateId = templates[0]?.id ?? "INWIT";
    setMemberships((ms) => [...ms, { templateId, role: "PM", group: ROLE_GROUP.PM, leader: false }]);
  }

  async function submit() {
    if (isNew) {
      await inviteUser({ name: name.trim(), email: email.trim(), isAdmin, memberships, ...direzioneField });
      toast.success("Invito inviato");
    } else if (existing) {
      const status: UserStatus = !active ? "deactivated" : existing.status === "deactivated" ? "active" : existing.status;
      await updateUser(existing.id, { name: name.trim(), isAdmin, memberships, status, ...direzioneField });
      toast.success("Utente aggiornato");
    }
    await onSaved();
  }

  return (
    <CommandDialogShell
      open={user !== null}
      onOpenChange={(o) => !o && onClose()}
      testId="user-dialog"
      title={isNew ? "Invita utente" : "Modifica utente"}
      description={
        isNew
          ? "Riceverà una mail con il link per impostare la password."
          : "Le appartenenze sostituiscono quelle attuali."
      }
      submitLabel={isNew ? "Invia invito" : "Salva"}
      canSubmit={canSubmit}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="user-name">Nome</Label>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-email">Email</Label>
          <Input id="user-email" type="email" value={email} disabled={!isNew} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={isAdmin} onCheckedChange={setIsAdmin} data-testid="user-admin" />
          ADMIN (supervisore, tutti i permessi)
        </label>
        {andamento && (
          <label className={cn("flex items-center gap-3 text-sm", isAdmin && "text-muted-foreground")}>
            <Switch checked={!isAdmin && direzione} disabled={isAdmin} onCheckedChange={setDirezione} data-testid="user-direzione" />
            <span>
              Direzione: legge Andamento e Statistiche di tutti i clienti
              {isAdmin && <span className="block text-xs">L&apos;ADMIN vede già tutto.</span>}
            </span>
          </label>
        )}
        {!isNew && (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={active} onCheckedChange={setActive} data-testid="user-active" />
            {existing?.status === "invited" && active ? "Invito in attesa" : active ? "Attivo" : "Disattivato"}
          </label>
        )}
      </div>
      {existing?.status === "invited" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-secondary px-3 py-2">
          <span className="text-xs text-muted-foreground">
            L&apos;invito non è ancora stato accettato. Un nuovo invito annulla il link precedente.
          </span>
          <Button type="button" variant="outline" size="sm" disabled={resending} onClick={resend} data-testid="user-resend-invite">
            {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />} Reinvia invito
          </Button>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
          Appartenenze (gestore, ruolo, leader)
        </legend>
        {memberships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Nessuna: l'ADMIN vede tutto."
              : withDirezione
                ? "Nessuna: solo Direzione (Andamento, Statistiche, Notifiche)."
                : "Serve almeno un'appartenenza per un utente non ADMIN."}
          </p>
        )}
        {memberships.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2" data-testid={`membership-${i}`}>
            <Select value={m.templateId} onValueChange={(v) => setRow(i, { templateId: v as TemplateId })}>
              <SelectTrigger aria-label={`Gestore ${i + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={m.role} onValueChange={(v) => setRow(i, { role: v as RoleId })}>
              <SelectTrigger aria-label={`Ruolo ${i + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_IDS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]} · {GROUP_LABEL[ROLE_GROUP[r]]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
              <input
                type="checkbox"
                checked={m.leader}
                onChange={(e) => setRow(i, { leader: e.target.checked })}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                aria-label={`Leader ${i + 1}`}
              />
              Leader
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 hover:text-status-error"
              onClick={() => setMemberships((ms) => ms.filter((_, j) => j !== i))}
              aria-label={`Togli appartenenza ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRow} data-testid="membership-add">
          <Plus className="h-4 w-4" /> Aggiungi appartenenza
        </Button>
      </fieldset>
    </CommandDialogShell>
  );
}
