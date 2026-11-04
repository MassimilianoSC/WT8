import Link from "next/link";
import { cn } from "@/lib/utils";

/** Stark high-contrast wrapper shared by all auth screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Brand / marketing panel */}
      <div className="relative hidden flex-col justify-between bg-foreground p-12 text-background lg:flex">
        <div className="font-heading text-2xl font-black tracking-tighter">PracticeHub</div>
        <div className="space-y-6">
          <div className="font-heading text-5xl font-black leading-[0.95] tracking-tighter">
            Una pratica.
            <br />
            Ogni team.
            <br />
            <span className="text-[hsl(var(--primary))]">Nessun silos.</span>
          </div>
          <p className="max-w-sm font-mono text-sm text-background/60">
            Gestione dati unificata tra team che lavorano sugli stessi casi di business
            in fasi diverse del processo.
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-background/40">
          Inserimento — Verifica — Approvazione
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center bg-background p-6">
        <div className={cn("w-full max-w-sm space-y-8")}>
          <div className="lg:hidden">
            <div className="font-heading text-2xl font-black tracking-tighter">PracticeHub</div>
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-black tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="pt-2 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
