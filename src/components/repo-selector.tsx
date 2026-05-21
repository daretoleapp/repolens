"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Star, GitFork, Search, Check, X, Folder } from "lucide-react";
import { useRepo } from "./repo-context";
import { DEMO_REPOS } from "@/lib/demos";
import { cn, formatNumber } from "@/lib/utils";
import type { RepoInfo } from "@/lib/github";

export function RepoSelector() {
  const { owner, name, setRepo, isCustom } = useRepo();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<RepoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/repo?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then((data: RepoInfo | { error: string }) => {
        if (cancelled) return;
        if ("error" in data) setInfo(null);
        else setInfo(data);
      })
      .catch(() => !cancelled && setInfo(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [owner, name]);

  function applyCustom() {
    const m = customInput.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
    if (!m) {
      setCustomError("Format: owner/repo or full GitHub URL");
      return;
    }
    setRepo(m[1], m[2]);
    setCustomInput("");
    setCustomError("");
    setOpen(false);
  }

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background-elevated)]/80 backdrop-blur">
      <div className="px-6 py-3 flex items-center gap-4">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen(o => !o)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg",
              "bg-[var(--background-card)] border border-[var(--border-strong)]",
              "hover:border-[var(--primary)]/50 transition-colors"
            )}
          >
            <Folder className="w-4 h-4 text-[var(--foreground-muted)]" />
            <div className="text-left">
              <div className="text-sm font-medium leading-tight">
                {owner}/{name}
              </div>
              <div className="text-[10px] text-[var(--foreground-subtle)] leading-tight">
                {isCustom ? "Custom" : "Demo repo"}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-[var(--foreground-subtle)]" />
          </button>

          {open && (
            <div className="absolute top-full left-0 mt-2 w-96 bg-[var(--background-card)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden">
              <div className="p-3 border-b border-[var(--border)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-semibold mb-2">
                  Demo Repos
                </div>
                <div className="space-y-0.5 max-h-64 overflow-y-auto">
                  {DEMO_REPOS.map(d => {
                    const active = d.owner === owner && d.name === name;
                    return (
                      <button
                        key={`${d.owner}/${d.name}`}
                        onClick={() => {
                          setRepo(d.owner, d.name);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 transition-colors",
                          active
                            ? "bg-[var(--primary)]/10 border border-[var(--primary)]/30"
                            : "hover:bg-[var(--background-elevated)]"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.label}</div>
                          <div className="text-[10px] text-[var(--foreground-subtle)] truncate">
                            {d.owner}/{d.name} · {d.description}
                          </div>
                        </div>
                        {active && <Check className="w-4 h-4 text-[var(--primary)]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-subtle)] font-semibold mb-2">
                  Custom GitHub Repo
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="w-3.5 h-3.5 text-[var(--foreground-subtle)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={customInput}
                      onChange={e => {
                        setCustomInput(e.target.value);
                        setCustomError("");
                      }}
                      onKeyDown={e => e.key === "Enter" && applyCustom()}
                      placeholder="owner/repo or URL"
                      className="w-full h-8 pl-8 pr-2 rounded-md bg-[var(--background)] border border-[var(--border-strong)] text-xs focus:outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                  <button
                    onClick={applyCustom}
                    className="px-3 h-8 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:bg-[var(--primary)]/90"
                  >
                    Load
                  </button>
                </div>
                {customError && (
                  <div className="text-[10px] text-[var(--danger)] mt-1.5 flex items-center gap-1">
                    <X className="w-3 h-3" />
                    {customError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 text-xs">
          {loading ? (
            <div className="text-[var(--foreground-subtle)]">Loading repo…</div>
          ) : info ? (
            <>
              <div className="flex items-center gap-1 text-[var(--foreground-muted)]">
                <Star className="w-3.5 h-3.5" />
                {formatNumber(info.stars)}
              </div>
              <div className="flex items-center gap-1 text-[var(--foreground-muted)]">
                <GitFork className="w-3.5 h-3.5" />
                {formatNumber(info.forks)}
              </div>
              <a
                href={info.url}
                target="_blank"
                rel="noopener"
                className="text-[var(--foreground-muted)] hover:text-[var(--primary)] flex items-center gap-1"
              >
                <Folder className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            </>
          ) : (
            <div className="text-[var(--danger)]">Failed to load</div>
          )}
        </div>
      </div>
    </div>
  );
}
