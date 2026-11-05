import nodemailer from "nodemailer";
import { escapeHtml } from "@/lib/html";

/**
 * Email service. When SMTP_HOST is configured, mail is sent via SMTP.
 * Otherwise (dev/default) mail is "sent" to the console using nodemailer's
 * JSON transport, and any action link is logged prominently so invitation /
 * password-reset flows are fully testable without a real mail server.
 */

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_SECURE,
  SMTP_FROM,
} = process.env;

const hasSmtp = Boolean(SMTP_HOST);

function getTransport() {
  if (hasSmtp) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: SMTP_SECURE === "true",
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
      // D-137 A-04: un invio non può durare più della lease dell'outbox (5 minuti), altrimenti un altro worker lo
      // riprenderebbe mentre è ancora in corso.
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}

const FROM = SMTP_FROM || "WT8 <no-reply@practicehub.local>";

interface MailInput {
  to: string;
  subject: string;
  html: string;
  actionLink?: string;
  /** Message-ID stabile (outbox): un nuovo tentativo dello stesso messaggio usa lo stesso id (P-13). */
  messageId?: string;
}

export async function sendMail({ to, subject, html, actionLink, messageId }: MailInput) {
  const transport = getTransport();
  const info = await transport.sendMail({ from: FROM, to, subject, html, ...(messageId ? { messageId } : {}) });

  if (!hasSmtp) {
    // Dev mode: surface the message + link so it can be used for testing.
    console.log("\n========== [DEV EMAIL] ==========");
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    if (actionLink) console.log(`Link:    ${actionLink}`);
    console.log("=================================\n");
  }
  return info;
}

/* ---------- Templates ---------- */
// Ogni valore interpolato nel corpo HTML passa da escapeHtml (R8); gli oggetti sono testo semplice.

const shell = (title: string, body: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #D4D4D4;">
    <div style="background:#002EA6;color:#fff;padding:20px 24px;font-weight:800;font-size:18px;letter-spacing:-0.5px;">
      WT8
    </div>
    <div style="padding:24px;color:#111;font-size:15px;line-height:1.6;">
      <h2 style="margin:0 0 12px;font-size:20px;">${escapeHtml(title)}</h2>
      ${body}
    </div>
  </div>`;

const button = (link: string, label: string) =>
  `<a href="${escapeHtml(link)}" style="display:inline-block;background:#002EA6;color:#fff;text-decoration:none;padding:12px 20px;font-weight:700;margin:16px 0;">${escapeHtml(label)}</a>`;

export function invitationEmail(name: string, link: string) {
  return {
    subject: "Sei stato invitato a WT8",
    html: shell(
      "Invito ricevuto",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p>Un amministratore ti ha invitato a WT8. Clicca sotto per impostare la password e attivare il tuo account. Questo link scade tra 24 ore.</p>
       ${button(link, "Imposta la password")}
       <p style="color:#555;font-size:13px;">Se il pulsante non funziona, copia questo link:<br>${escapeHtml(link)}</p>`
    ),
  };
}

export function resetPasswordEmail(name: string, link: string) {
  return {
    subject: "Reimposta la password di WT8",
    html: shell(
      "Reimpostazione password",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p>Abbiamo ricevuto una richiesta per reimpostare la tua password. Clicca sotto per scegliere una nuova password. Questo link scade tra 1 ora.</p>
       ${button(link, "Reimposta password")}
       <p style="color:#555;font-size:13px;">Se non hai richiesto questo reset, puoi ignorare questa email.</p>`
    ),
  };
}

export function welcomeEmail(name: string, link: string) {
  return {
    subject: "Benvenuto in WT8",
    html: shell(
      "Benvenuto",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p>Il tuo account WT8 è ora attivo. Puoi accedere e iniziare a collaborare con il tuo team.</p>
       ${button(link, "Vai a WT8")}`
    ),
  };
}

export function handoffEmail(
  name: string,
  practiceCode: string,
  client: string,
  fromTeam: string,
  link: string
) {
  return {
    subject: `Pratica ${practiceCode} passata al tuo team`,
    html: shell(
      "Nuova pratica per il tuo team",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p><strong>${escapeHtml(fromTeam)}</strong> ha passato la pratica
       <strong>${escapeHtml(practiceCode)}</strong> (${escapeHtml(client)}) al tuo team. È ora in attesa della tua azione.</p>
       ${button(link, "Apri pratica")}`
    ),
  };
}

export function practiceCreatedEmail(
  name: string,
  practiceCode: string,
  client: string,
  link: string
) {
  return {
    subject: `Nuova pratica ${practiceCode} assegnata al tuo team`,
    html: shell(
      "Nuova pratica per il tuo team",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p>È stata creata la pratica <strong>${escapeHtml(practiceCode)}</strong> (${escapeHtml(client)}) ed è assegnata al tuo team.</p>
       ${button(link, "Apri pratica")}`
    ),
  };
}

export function practiceCompletedEmail(
  name: string,
  practiceCode: string,
  client: string,
  link: string
) {
  return {
    subject: `Pratica ${practiceCode} completata`,
    html: shell(
      "Pratica completata",
      `<p>Ciao ${escapeHtml(name || "there")},</p>
       <p>La pratica <strong>${escapeHtml(practiceCode)}</strong> (${escapeHtml(client)}) è stata completata e ha concluso il suo percorso.</p>
       ${button(link, "Apri pratica")}`
    ),
  };
}

/** Base degli indirizzi nelle mail (stessa regola dei servizi esistenti). */
export const appBaseUrl = () => process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

/** Assegna (D-21): mail a ogni membro attivo dei gruppi destinatari, con la nota di chi assegna. */
export function assignEmail(input: {
  name: string;
  codiceSito: string;
  nomeSito: string;
  gestore: string;
  groups: string;
  actorName: string;
  note?: string;
  link: string;
}) {
  const note = input.note?.trim();
  return {
    subject: `Pratica ${input.codiceSito} assegnata a ${input.groups}`,
    html: shell(
      "Pratica assegnata",
      `<p>Ciao ${escapeHtml(input.name || "")},</p>
       <p><strong>${escapeHtml(input.actorName)}</strong> ha assegnato a <strong>${escapeHtml(input.groups)}</strong> la pratica
       <strong>${escapeHtml(input.codiceSito)}</strong> – ${escapeHtml(input.nomeSito)} (${escapeHtml(input.gestore)}).</p>
       ${note ? `<p style="white-space:pre-wrap;border-left:3px solid #002EA6;padding-left:12px;">${escapeHtml(note)}</p>` : ""}
       ${button(input.link, "Apri pratica")}`
    ),
  };
}

/** Menzione in un commento (D-185): chi e dove, mai il testo del commento. */
export function mentionEmail(input: { name: string; actorName: string; codiceSito: string; nomeSito: string; gestore: string; link: string }) {
  return {
    subject: `${input.actorName} ti ha menzionato sulla pratica ${input.codiceSito}`,
    html: shell(
      "Menzione in un commento",
      `<p>Ciao ${escapeHtml(input.name || "")},</p>
       <p><strong>${escapeHtml(input.actorName)}</strong> ti ha menzionato in un commento sulla pratica
       <strong>${escapeHtml(input.codiceSito)}</strong> – ${escapeHtml(input.nomeSito)} (${escapeHtml(input.gestore)}).</p>
       ${button(input.link, "Apri il commento")}`
    ),
  };
}

/** Alert e promemoria (D-44, D-46): mail ai destinatari della regola, con escape di ogni valore. */
export function alertEmail(input: { name: string; label: string; codiceSito: string; nomeSito: string; gestore: string; due: string | null; reminder: boolean; link: string }) {
  const what = input.reminder ? "Promemoria" : "Alert";
  return {
    subject: `${what}: ${input.label} — pratica ${input.codiceSito}`,
    html: shell(
      `${what} della pratica`,
      `<p>Ciao ${escapeHtml(input.name || "")},</p>
       <p><strong>${escapeHtml(input.label)}</strong> sulla pratica <strong>${escapeHtml(input.codiceSito)}</strong> – ${escapeHtml(input.nomeSito)} (${escapeHtml(input.gestore)}).</p>
       ${input.due ? `<p>Scadenza: ${escapeHtml(input.due)}</p>` : ""}
       ${button(input.link, "Apri pratica")}`
    ),
  };
}
