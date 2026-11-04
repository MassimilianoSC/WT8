import type { DefaultSession } from "next-auth";

// Sessione del modello nuovo (cutover 3.5, contratto SessionUserDTO): { id, name, email, isAdmin }. Appartenenze,
// leader e cambio password obbligatorio si rileggono dal database per id (lib/auth-v2.ts), mai dal token.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    isAdmin: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    isAdmin: boolean;
  }
}
