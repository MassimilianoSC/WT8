"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TemplateId, TemplateSummaryDTO } from "@/lib/contract";
import { listTemplates } from "@/components/pratiche/data-source";

/**
 * Sidebar block "Pratiche": one entry for all clients plus one per template
 * (D-15). `allowed` restricts the entries to the user's memberships; `null`
 * means every template (ADMIN).
 */
export function TemplateNav({
  allowed,
  onNavigate,
}: {
  allowed: TemplateId[] | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = React.useState<TemplateSummaryDTO[]>([]);

  React.useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const onList = pathname === "/pratiche";
  const current = onList ? searchParams.get("template") : null;
  const visible = allowed ? templates.filter((t) => allowed.includes(t.id)) : templates;

  const entries = [
    { href: "/pratiche", label: "Tutti i clienti", active: onList && !current, testId: "nav-pratiche-all" },
    ...visible.map((t) => ({
      href: `/pratiche?template=${t.id}`,
      label: t.label,
      active: onList && current === t.id,
      testId: `nav-template-${t.id.toLowerCase()}`,
    })),
    { href: "/pratiche/archivio", label: "Archivio", active: pathname === "/pratiche/archivio", testId: "nav-archivio" },
  ];

  return (
    <div className="mb-3" data-testid="template-nav">
      <div className="flex items-center gap-3 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <FolderKanban className="h-4 w-4" />
        Pratiche
      </div>
      {entries.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          onClick={onNavigate}
          data-testid={e.testId}
          className={cn(
            "mb-0.5 flex items-center border border-transparent py-2 pl-10 pr-3 font-mono text-xs uppercase tracking-wider transition-colors",
            e.active
              ? "border-border bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {e.label}
        </Link>
      ))}
    </div>
  );
}
