// @vitest-environment node
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/html";
import {
  handoffEmail,
  invitationEmail,
  mentionEmail,
  practiceCompletedEmail,
  practiceCreatedEmail,
  resetPasswordEmail,
  welcomeEmail,
} from "@/lib/email";

const EVIL = `<img src=x onerror="alert('x')">&`;
const LINK = "http://localhost:3000/practices/abc";

describe("escapeHtml", () => {
  it("neutralizza i caratteri speciali", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });

  it("lascia invariato il testo normale, accenti compresi", () => {
    expect(escapeHtml("Mario Rossi · Pratica 1AB12345 — città")).toBe("Mario Rossi · Pratica 1AB12345 — città");
  });
});

describe("modelli di mail (R8)", () => {
  const all = [
    invitationEmail(EVIL, LINK),
    resetPasswordEmail(EVIL, LINK),
    welcomeEmail(EVIL, LINK),
    handoffEmail(EVIL, EVIL, EVIL, EVIL, LINK),
    mentionEmail({ name: EVIL, actorName: EVIL, codiceSito: EVIL, nomeSito: EVIL, gestore: EVIL, link: LINK }),
    practiceCreatedEmail(EVIL, EVIL, EVIL, LINK),
    practiceCompletedEmail(EVIL, EVIL, EVIL, LINK),
  ];

  it("nessun valore interpolato può iniettare HTML", () => {
    for (const { html } of all) {
      expect(html).not.toContain("<img");
      expect(html).not.toContain(`onerror="`);
      expect(html).toContain("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
    }
  });

  it("il link resta cliccabile e identico", () => {
    for (const { html } of all) expect(html).toContain(`href="${LINK}"`);
  });

  it("i testi normali non cambiano", () => {
    const { subject, html } = handoffEmail("Mario Rossi", "1AB12345", "Vodafone", "PM", LINK);
    expect(subject).toBe("Pratica 1AB12345 passata al tuo team");
    expect(html).toContain("<p>Ciao Mario Rossi,</p>");
    expect(html).toContain("<strong>PM</strong> ha passato la pratica");
    expect(html).toContain("<strong>1AB12345</strong> (Vodafone)");
  });

  it("gli oggetti restano testo semplice (niente entità visibili)", () => {
    expect(practiceCompletedEmail("A", "R&D-01", "C", LINK).subject).toBe("Pratica R&D-01 completata");
  });
});
