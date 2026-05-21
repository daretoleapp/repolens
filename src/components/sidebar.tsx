"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitPullRequest,
  Flame,
  Component,
  Users,
  Settings,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/prs", label: "PR Intelligence", icon: GitPullRequest },
  { href: "/hotspots", label: "Hotspots", icon: Flame },
  { href: "/architecture", label: "Architecture", icon: Component },
  { href: "/contributors", label: "Contributors", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--background-elevated)] flex flex-col">
      <div className="p-5 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center">
            <Eye className="w-4 h-4 text-[var(--primary-foreground)]" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-semibold text-sm tracking-tight">RepoLens</div>
            <div className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wider">
              Codebase Intel
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-[var(--background-card)] text-[var(--foreground)] border border-[var(--border-strong)]"
                  : "text-[var(--foreground-muted)] hover:bg-[var(--background-card)]/50 hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        <div className="px-3 py-2 rounded-lg bg-gradient-to-br from-[var(--primary)]/10 to-[var(--accent)]/10 border border-[var(--primary)]/20">
          <div className="text-[10px] uppercase tracking-wider text-[var(--primary)] font-semibold">
            Powered by
          </div>
          <div className="text-sm font-medium mt-0.5">Xiaomi MiMo</div>
          <div className="text-[10px] text-[var(--foreground-subtle)] mt-1">
            Pro reasoning · VL multimodal
          </div>
        </div>
      </div>
    </aside>
  );
}
