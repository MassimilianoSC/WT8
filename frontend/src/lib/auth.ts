import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Db } from "mongodb";
import { verifyPassword } from "@/lib/password";
import { ensureStoreBootstrapped, getStoreDb, store } from "@/lib/store/db";
import { ensureFirstAdminOnce } from "@/services/first-admin";
import { clientIp, guardedLogin, TooManyLoginAttempts } from "@/services/login-guard";

/**
 * NextAuth (Auth.js v5): provider Credentials e sessione JWT (nessun archivio di sessioni sul server).
 * Dal cutover (3.5) le credenziali si verificano sugli utenti del modello nuovo e il token porta solo
 * { id, name, email, isAdmin } (contratto SessionUserDTO): appartenenze, stato e cambio password obbligatorio si
 * rileggono dal database per id a ogni richiesta (lib/auth-v2.ts, D-94).
 *
 * PR-22: limite ai tentativi falliti (services/login-guard.ts) e sessione che scade dopo 10 ore senza uso.
 * D-173: al primo tentativo di accesso del processo nasce il primo ADMIN dall'ambiente, solo se non ce n'è nessuno.
 */

/** PR-22: troppi tentativi falliti; il client riceve code = "troppi_tentativi". */
class TroppiTentativi extends CredentialsSignin {
  code = "troppi_tentativi";
}

/** Utente ATTIVO del modello nuovo con quelle credenziali, oppure null (invitati e disattivati non entrano). */
async function verifyCredentials(db: Db, email: string, password: string) {
  const user = await store.users(db).findOne({ email });
  if (!user || user.status !== "active" || !user.passwordHash) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return { id: user._id.toHexString(), name: user.name, email: user.email, isAdmin: user.isAdmin };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  // PR-22: la sessione scade dopo 10 ore senza uso; durante l'uso si rinnova (al più ogni 15 minuti).
  session: { strategy: "jwt", maxAge: 10 * 3600, updateAge: 15 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        // PR-22: limite ai tentativi per email e per indirizzo, PRIMA di verificare la password.
        const db = await getStoreDb();
        await ensureStoreBootstrapped(db);
        await ensureFirstAdminOnce(db);
        try {
          return await guardedLogin({ db, email, ip: clientIp(request?.headers) }, () => verifyCredentials(db, email, password));
        } catch (e) {
          if (e instanceof TooManyLoginAttempts) throw new TroppiTentativi();
          throw e;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.isAdmin = user.isAdmin === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.uid === "string" ? token.uid : "";
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
  },
});
