"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  GitPullRequest,
  GitMerge,
  GitBranch,
  AlertTriangle,
  Sparkles,
  Cpu,
  ArrowUpRight,
  Search,
  X,
  Users,
  FileCode,
  Plus,
  Minus,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Skeleton,
  Empty,
} from "@/components/ui";
import { useRepo } from "@/components/repo-context";
import { formatRelative, riskBand, cn } from "@/lib/utils";
import type { PRSummary } from "@/lib/github";

type Source = "mimo" | "corpus";
type StateFilter = "all" | "open" | "merged" | "closed" | "draft";

interface PRFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
}

interface RiskResponse {
  score: number;
  factors: string[];
  summary: string;
  suggestedReviewer: string;
  suggestedReviewerReason: string;
  pr: PRSummary & {
    files: PRFile[];
    additions?: number;
    deletions?: number;
    changedFiles?: number;
    commits?: number;
  };
  source: Source;
  model: string | null;
}

interface Box<T> {
  key: string;
  data: T | null;
  error: string | null;
}

const emptyBox = <T,>(): Box<T> => ({ key: "", data: null, error: null });

function readFocusFromURL(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const focus = params.get("focus");
  if (!focus) return null;
  const n = Number(focus);
  return Number.isNaN(n) ? null : n;
}

function Avatar({ src, login, size = 20 }: { src: string; login: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="rounded-full bg-[var(--border)] flex items-center justify-center text-[10px] font-medium text-[var(--foreground-muted)] shrink-0"
        style={{ width: size, height: size }}
      >
        {login.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={login}
      width={size}
      height={size}
      className="rounded-full shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}

function StateBadge({ pr }: { pr: PRSummary }) {
  if (pr.draft) {
    return (
      <Badge variant="default" className="gap-1">
        <GitBranch className="w-3 h-3" />
        Draft
      </Badge>
    );
  }
  if (pr.merged) {
    return (
      <Badge variant="accent" className="gap-1">
        <GitMerge className="w-3 h-3" />
        Merged
      </Badge>
    );
  }
  if (pr.state === "closed") {
    return (
      <Badge variant="danger" className="gap-1">
        <X className="w-3 h-3" />
        Closed
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1">
      <GitPullRequest className="w-3 h-3" />
      Open
    </Badge>
  );
}

function statusOf(pr: PRSummary): StateFilter {
  if (pr.draft) return "draft";
  if (pr.merged) return "merged";
  if (pr.state === "closed") return "closed";
  return "open";
}

function fileStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "added")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-[var(--success)]/15 text-[var(--success)]">
        A
      </span>
    );
  if (s === "removed" || s === "deleted")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-[var(--danger)]/15 text-[var(--danger)]">
        D
      </span>
    );
  if (s === "renamed")
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-[var(--accent)]/15 text-[var(--accent)]">
        R
      </span>
    );
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-[var(--warning)]/15 text-[var(--warning)]">
      M
    </span>
  );
}

export default function PRIntelligencePage() {
  const { owner, name } = useRepo();
  const repoKey = `${owner}/${name}`;

  const [prsBox, setPrsBox] = useState<Box<PRSummary[]>>(emptyBox);

  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Risk cache: prNumber -> { score, source }, scoped by repo via key.
  const [riskBoxKey, setRiskBoxKey] = useState("");
  const [riskByPR, setRiskByPR] = useState<Record<number, { score: number; source: Source }>>({});
  const inFlight = useRef<Set<number>>(new Set());

  // Drawer — initial value comes from URL via lazy initializer (not an effect).
  const [openPR, setOpenPR] = useState<number | null>(() => readFocusFromURL());
  const [filesExpanded, setFilesExpanded] = useState(false);

  // Drawer data — boxed by `${repoKey}:${number}` so we never sync-clear in an effect.
  const [drawerBox, setDrawerBox] = useState<Box<RiskResponse>>(emptyBox);

  // Reset risk cache when repo changes (deferred to avoid sync setState in effect)
  useEffect(() => {
    if (riskBoxKey === repoKey) return;
    queueMicrotask(() => {
      setRiskBoxKey(repoKey);
      setRiskByPR({});
      inFlight.current.clear();
    });
  }, [repoKey, riskBoxKey]);

  // Load PRs
  useEffect(() => {
    let cancelled = false;
    const key = `${owner}/${name}`;
    fetch(`/api/prs?owner=${owner}&name=${name}&state=all&limit=100`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (cancelled) return;
        setPrsBox({ key, data: d.items as PRSummary[], error: null });
      })
      .catch(e => {
        if (cancelled) return;
        setPrsBox({ key, data: null, error: (e as Error).message || "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, name]);

  const prs = prsBox.key === repoKey ? prsBox.data : null;
  const error = prsBox.key === repoKey ? prsBox.error : null;

  const fetchRisk = useCallback(
    (number: number) => {
      const key = `${owner}/${name}`;
      return fetch(`/api/pr-risk?owner=${owner}&name=${name}&number=${number}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: RiskResponse) => {
          // Only cache if repo hasn't changed mid-flight
          setRiskByPR(prev =>
            key === `${owner}/${name}`
              ? { ...prev, [number]: { score: d.score, source: d.source } }
              : prev
          );
          return d;
        })
        .catch(() => null);
    },
    [owner, name]
  );

  const lazyLoadRisk = useCallback(
    (number: number) => {
      if (riskByPR[number] || inFlight.current.has(number)) return;
      inFlight.current.add(number);
      fetchRisk(number).finally(() => {
        inFlight.current.delete(number);
      });
    },
    [riskByPR, fetchRisk]
  );

  // Drawer load
  useEffect(() => {
    if (openPR == null) return;
    let cancelled = false;
    const key = `${owner}/${name}:${openPR}`;
    fetch(`/api/pr-risk?owner=${owner}&name=${name}&number=${openPR}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RiskResponse) => {
        if (cancelled) return;
        setDrawerBox({ key, data: d, error: null });
        // Also cache in row table
        setRiskByPR(prev => ({
          ...prev,
          [d.pr.number]: { score: d.score, source: d.source },
        }));
      })
      .catch(e => {
        if (cancelled) return;
        setDrawerBox({ key, data: null, error: (e as Error).message || "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [openPR, owner, name]);

  // Reset files-expanded when drawer changes target — guard with current state
  useEffect(() => {
    if (filesExpanded) {
      // queue async to avoid sync setState in effect
      queueMicrotask(() => setFilesExpanded(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPR]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (openPR != null) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [openPR]);

  // ESC closes drawer
  useEffect(() => {
    if (openPR == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPR(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPR]);

  const drawerKey = openPR != null ? `${owner}/${name}:${openPR}` : "";
  const drawerData = drawerBox.key === drawerKey ? drawerBox.data : null;
  const drawerError = drawerBox.key === drawerKey ? drawerBox.error : null;
  const drawerLoading = openPR != null && drawerBox.key !== drawerKey;

  const authors = useMemo(() => {
    if (!prs) return [];
    return [...new Set(prs.map(p => p.user))].sort();
  }, [prs]);

  const labels = useMemo(() => {
    if (!prs) return [];
    return [...new Set(prs.flatMap(p => p.labels))].sort();
  }, [prs]);

  const filtered = useMemo(() => {
    if (!prs) return null;
    const q = search.trim().toLowerCase();
    return prs
      .filter(p => {
        if (stateFilter !== "all" && statusOf(p) !== stateFilter) return false;
        if (authorFilter !== "all" && p.user !== authorFilter) return false;
        if (labelFilter !== "all" && !p.labels.includes(labelFilter)) return false;
        if (q) {
          const hay = `${p.title} ${p.user} ${p.number}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .slice(0, 50);
  }, [prs, stateFilter, authorFilter, labelFilter, search]);

  const drawerSource = drawerData?.source ?? null;
  const drawerModel = drawerData?.model ?? null;

  const activeSource: Source | null = useMemo(() => {
    const vals = Object.values(riskByPR);
    if (vals.some(v => v.source === "mimo")) return "mimo";
    if (vals.length > 0) return "corpus";
    return null;
  }, [riskByPR]);

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PR Intelligence</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Risk-scored pull requests for{" "}
            <span className="font-mono text-[var(--foreground)]">
              {owner}/{name}
            </span>
          </p>
        </div>
        {activeSource && (
          <Badge
            variant={activeSource === "mimo" ? "primary" : "outline"}
            className="gap-1.5"
          >
            {activeSource === "mimo" ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              <Cpu className="w-3 h-3" />
            )}
            <span className="uppercase tracking-wide">{activeSource}</span>
          </Badge>
        )}
      </div>

      {/* Filter bar — sticky */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-[var(--background)]/80 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value as StateFilter)}
            className="h-9 px-3 pr-8 rounded-lg bg-[var(--background-card)] border border-[var(--border-strong)] text-sm focus:outline-none focus:border-[var(--primary)] cursor-pointer"
            aria-label="State filter"
          >
            <option value="all">All states</option>
            <option value="open">Open</option>
            <option value="merged">Merged</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
          </select>
          <select
            value={authorFilter}
            onChange={e => setAuthorFilter(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg bg-[var(--background-card)] border border-[var(--border-strong)] text-sm focus:outline-none focus:border-[var(--primary)] cursor-pointer max-w-[180px]"
            aria-label="Author filter"
          >
            <option value="all">All authors</option>
            {authors.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={labelFilter}
            onChange={e => setLabelFilter(e.target.value)}
            className="h-9 px-3 pr-8 rounded-lg bg-[var(--background-card)] border border-[var(--border-strong)] text-sm focus:outline-none focus:border-[var(--primary)] cursor-pointer max-w-[180px]"
            aria-label="Label filter"
          >
            <option value="all">All labels</option>
            {labels.map(l => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] pointer-events-none" />
            <Input
              placeholder="Search title, author, number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <Card>
          <CardContent>
            <Empty
              icon={AlertTriangle}
              title="Couldn't load PRs"
              hint="Try a different repo or check your GitHub token."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] border-b border-[var(--border)]">
                    <th className="w-16 px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Title</th>
                    <th className="w-32 px-4 py-2.5 font-medium">Author</th>
                    <th className="w-24 px-4 py-2.5 font-medium">State</th>
                    <th className="w-24 px-4 py-2.5 font-medium text-right">Updated</th>
                    <th className="w-20 px-4 py-2.5 font-medium text-right">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered == null ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-[var(--border)]">
                        <td className="px-4 py-3" colSpan={6}>
                          <Skeleton className="h-5 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12">
                        <Empty
                          icon={GitPullRequest}
                          title="No PRs match your filters"
                          hint="Try widening the state or clearing the search."
                        />
                      </td>
                    </tr>
                  ) : (
                    filtered.map(pr => {
                      const risk = riskByPR[pr.number];
                      const band = risk ? riskBand(risk.score) : null;
                      return (
                        <tr
                          key={pr.number}
                          onMouseEnter={() => lazyLoadRisk(pr.number)}
                          onClick={() => setOpenPR(pr.number)}
                          className="border-b border-[var(--border)] hover:bg-[var(--background-elevated)] cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-[var(--foreground-muted)] text-xs">
                            #{pr.number}
                          </td>
                          <td className="px-4 py-3 max-w-0">
                            <div className="truncate font-medium">{pr.title}</div>
                            {pr.labels.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {pr.labels.slice(0, 3).map(l => (
                                  <span
                                    key={l}
                                    className="inline-flex items-center px-1.5 py-px rounded text-[10px] bg-[var(--border)] text-[var(--foreground-muted)]"
                                  >
                                    {l}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar src={pr.userAvatar} login={pr.user} size={20} />
                              <span className="truncate text-xs text-[var(--foreground-muted)]">
                                {pr.user}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StateBadge pr={pr} />
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-[var(--foreground-muted)] tabular-nums">
                            {formatRelative(pr.updatedAt)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {risk ? (
                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium tabular-nums",
                                  band!.color
                                )}
                              >
                                {risk.score}
                              </span>
                            ) : (
                              <span className="text-[var(--foreground-subtle)] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drawer + backdrop */}
      {openPR != null && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm fade-in"
            onClick={() => setOpenPR(null)}
            aria-hidden="true"
          />
          <aside
            className={cn(
              "fixed inset-y-0 right-0 z-50 w-full max-w-[500px] bg-[var(--background-elevated)] border-l border-[var(--border-strong)] shadow-2xl",
              "transition-transform duration-300 ease-out translate-x-0"
            )}
            role="dialog"
            aria-modal="true"
            aria-label={`PR #${openPR} details`}
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--border)]">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-[var(--foreground-muted)] font-mono">
                    #{openPR}
                  </div>
                  <div className="text-base font-semibold mt-0.5 leading-snug">
                    {drawerData?.pr.title || (drawerLoading ? "Loading…" : "PR detail")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpenPR(null)}
                  aria-label="Close drawer"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                {drawerLoading ? (
                  <div className="p-4 space-y-4">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : drawerError ? (
                  <div className="p-4">
                    <Empty
                      icon={AlertTriangle}
                      title="Failed to load PR"
                      hint={drawerError}
                    />
                  </div>
                ) : drawerData ? (
                  <div className="p-4 space-y-5">
                    {/* Risk score */}
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                        Risk score
                      </div>
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "px-4 py-3 rounded-lg border text-center min-w-[88px]",
                            riskBand(drawerData.score).color
                          )}
                        >
                          <div className="text-3xl font-semibold tabular-nums leading-none">
                            {drawerData.score}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider mt-1 font-medium">
                            {riskBand(drawerData.score).label}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Avatar
                              src={drawerData.pr.userAvatar}
                              login={drawerData.pr.user}
                              size={20}
                            />
                            <span className="text-sm">{drawerData.pr.user}</span>
                          </div>
                          <StateBadgeRow pr={drawerData.pr} />
                        </div>
                      </div>
                    </div>

                    {/* Factors */}
                    {drawerData.factors.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                          Risk factors
                        </div>
                        <ul className="space-y-1.5">
                          {drawerData.factors.map((f, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-[var(--foreground)]"
                            >
                              <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--warning)] shrink-0" />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Summary */}
                    {drawerData.summary && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
                          Summary
                        </div>
                        <p className="text-sm text-[var(--foreground)] leading-relaxed">
                          {drawerData.summary}
                        </p>
                      </div>
                    )}

                    {/* Suggested reviewer */}
                    {drawerData.suggestedReviewer && (
                      <Card className="border-[var(--primary)]/30 bg-[var(--primary)]/5">
                        <CardContent className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--primary)]">
                            <Users className="w-3.5 h-3.5" />
                            Suggested reviewer
                          </div>
                          <div className="text-sm font-medium">
                            {drawerData.suggestedReviewer}
                          </div>
                          {drawerData.suggestedReviewerReason && (
                            <div className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                              {drawerData.suggestedReviewerReason}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <StatBlock
                        label="Additions"
                        value={`+${drawerData.pr.additions ?? 0}`}
                        icon={Plus}
                        tone="success"
                      />
                      <StatBlock
                        label="Deletions"
                        value={`-${drawerData.pr.deletions ?? 0}`}
                        icon={Minus}
                        tone="danger"
                      />
                      <StatBlock
                        label="Files"
                        value={drawerData.pr.changedFiles ?? drawerData.pr.files.length}
                        icon={FileCode}
                      />
                      <StatBlock
                        label="Commits"
                        value={drawerData.pr.commits ?? 0}
                        icon={GitBranch}
                      />
                    </div>

                    {/* Files list */}
                    {drawerData.pr.files.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setFilesExpanded(v => !v)}
                          className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2 hover:text-[var(--foreground)]"
                        >
                          <span>Files ({drawerData.pr.files.length})</span>
                          <span className="normal-case tracking-normal text-xs">
                            {filesExpanded ? "Hide" : "Show"}
                          </span>
                        </button>
                        {filesExpanded && (
                          <ul className="space-y-1">
                            {drawerData.pr.files.slice(0, 10).map(f => (
                              <li
                                key={f.filename}
                                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-[var(--background-card)]"
                              >
                                {fileStatusBadge(f.status)}
                                <span className="font-mono truncate flex-1">{f.filename}</span>
                                <span className="text-[var(--success)] tabular-nums">
                                  +{f.additions}
                                </span>
                                <span className="text-[var(--danger)] tabular-nums">
                                  -{f.deletions}
                                </span>
                              </li>
                            ))}
                            {drawerData.pr.files.length > 10 && (
                              <li className="text-xs text-[var(--foreground-subtle)] text-center py-1">
                                +{drawerData.pr.files.length - 10} more
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* GitHub link */}
                    <a
                      href={drawerData.pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
                    >
                      View on GitHub
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : null}
              </div>

              {/* Footer source label */}
              {drawerSource && (
                <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--foreground-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    {drawerSource === "mimo" ? (
                      <Sparkles className="w-3 h-3 text-[var(--primary)]" />
                    ) : (
                      <Cpu className="w-3 h-3" />
                    )}
                    Source: <span className="uppercase tracking-wide">{drawerSource}</span>
                  </span>
                  {drawerModel && drawerSource === "mimo" && (
                    <span className="font-mono">{drawerModel}</span>
                  )}
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function StateBadgeRow({ pr }: { pr: PRSummary }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <StateBadge pr={pr} />
      <span className="text-[11px] text-[var(--foreground-muted)]">
        updated {formatRelative(pr.updatedAt)}
      </span>
    </div>
  );
}

function StatBlock({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "text-[var(--foreground-muted)]",
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
  };
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--background-card)] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
        <Icon className={cn("w-3 h-3", tones[tone])} />
        {label}
      </div>
      <div className="text-base font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
