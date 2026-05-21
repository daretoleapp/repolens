"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import {
  GitPullRequest,
  GitMerge,
  Flame,
  Activity,
  AlertTriangle,
  Sparkles,
  Cpu,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Skeleton,
  Empty,
} from "@/components/ui";
import { useRepo } from "@/components/repo-context";
import { formatNumber, formatRelative, riskBand, cn } from "@/lib/utils";
import type { PRSummary } from "@/lib/github";

type Source = "mimo" | "corpus";

interface HotspotFile {
  filename: string;
  commits: number;
  additions: number;
  deletions: number;
  hotspot: { score: number; band: "cool" | "warm" | "hot" | "critical" };
}

interface HotspotsResponse {
  files: HotspotFile[];
  recommendations: unknown[];
  themes: string[];
  summary: string;
  source: Source;
  model: string | null;
}

interface RiskResponse {
  score: number;
  factors: string[];
  summary: string;
  suggestedReviewer: string;
  suggestedReviewerReason: string;
  pr: PRSummary & {
    files: { filename: string; additions: number; deletions: number; changes: number; status: string }[];
  };
  source: Source;
  model: string | null;
}

interface RiskyPR {
  pr: PRSummary;
  score: number;
  source: Source;
}

// Boxed state — value carried with the key it was loaded for. Lets us derive
// "stale" without calling setState synchronously inside an effect.
interface Box<T> {
  key: string;
  data: T | null;
  error: string | null;
}

const emptyBox = <T,>(): Box<T> => ({ key: "", data: null, error: null });

function Avatar({ src, login, size = 24 }: { src: string; login: string; size?: number }) {
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

function SourceBadge({ source, model }: { source: Source | null; model: string | null }) {
  if (!source) return null;
  const Icon = source === "mimo" ? Sparkles : Cpu;
  return (
    <Badge variant={source === "mimo" ? "primary" : "outline"} className="gap-1.5">
      <Icon className="w-3 h-3" />
      <span className="uppercase tracking-wide">{source}</span>
      {model && source === "mimo" && (
        <span className="text-[10px] opacity-70 ml-1">{model}</span>
      )}
    </Badge>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "primary" | "warning" | "success" | "danger";
}) {
  const tones: Record<string, string> = {
    default: "text-[var(--foreground-muted)]",
    primary: "text-[var(--primary)]",
    warning: "text-[var(--warning)]",
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
  };
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-[var(--foreground-muted)]">
            {label}
          </span>
          <Icon className={cn("w-4 h-4", tones[tone])} />
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {typeof value === "number" ? formatNumber(value) : value}
          </div>
        )}
        {hint && !loading && (
          <div className="text-[11px] text-[var(--foreground-subtle)]">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function healthBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "great", color: "var(--success)" };
  if (score >= 60) return { label: "good", color: "var(--primary)" };
  if (score >= 40) return { label: "fair", color: "var(--warning)" };
  return { label: "poor", color: "var(--danger)" };
}

export default function OverviewPage() {
  const { owner, name } = useRepo();
  const repoKey = `${owner}/${name}`;

  const [prsBox, setPrsBox] = useState<Box<PRSummary[]>>(emptyBox);
  const [hotspotsBox, setHotspotsBox] = useState<Box<HotspotsResponse>>(emptyBox);
  const [riskyBox, setRiskyBox] = useState<
    Box<{ items: RiskyPR[]; mimoModel: string | null; anyMimo: boolean }>
  >(emptyBox);

  // PRs
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

  // Hotspots
  useEffect(() => {
    let cancelled = false;
    const key = `${owner}/${name}`;
    fetch(`/api/hotspots?owner=${owner}&name=${name}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: HotspotsResponse) => {
        if (cancelled) return;
        setHotspotsBox({ key, data: d, error: null });
      })
      .catch(e => {
        if (cancelled) return;
        setHotspotsBox({ key, data: null, error: (e as Error).message || "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, name]);

  // Derived from boxed state, scoped to current repo
  const prs = prsBox.key === repoKey ? prsBox.data : null;
  const prsErr = prsBox.key === repoKey ? prsBox.error : null;
  const hotspots = hotspotsBox.key === repoKey ? hotspotsBox.data : null;
  const hotspotsErr = hotspotsBox.key === repoKey ? hotspotsBox.error : null;

  // Risky PRs — depends on prs being loaded for the current repo
  useEffect(() => {
    if (!prs) return;
    const key = `${owner}/${name}`;
    const open = prs.filter(p => p.state === "open" && !p.draft).slice(0, 8);
    if (open.length === 0) {
      // Resolve into the box asynchronously so this isn't a sync setState.
      queueMicrotask(() => {
        setRiskyBox({ key, data: { items: [], mimoModel: null, anyMimo: false }, error: null });
      });
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      open.map(p =>
        fetch(`/api/pr-risk?owner=${owner}&name=${name}&number=${p.number}`)
          .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((d: RiskResponse) => ({
            pr: p,
            score: d.score,
            source: d.source,
            model: d.model,
          }))
      )
    ).then(results => {
      if (cancelled) return;
      const ok: RiskyPR[] = [];
      let mimoModel: string | null = null;
      let anyMimo = false;
      for (const r of results) {
        if (r.status === "fulfilled") {
          ok.push({ pr: r.value.pr, score: r.value.score, source: r.value.source });
          if (r.value.source === "mimo") {
            anyMimo = true;
            mimoModel = r.value.model || mimoModel;
          }
        }
      }
      ok.sort((a, b) => b.score - a.score);
      setRiskyBox({ key, data: { items: ok.slice(0, 5), mimoModel, anyMimo }, error: null });
    });
    return () => {
      cancelled = true;
    };
  }, [prs, owner, name]);

  const risky = riskyBox.key === repoKey ? riskyBox.data : null;

  const kpis = useMemo(() => {
    if (!prs) return null;
    const total = prs.length;
    const open = prs.filter(p => p.state === "open").length;
    const merged = prs.filter(p => p.merged).length;
    return { total, open, merged };
  }, [prs]);

  const hotspotCount = useMemo(() => {
    if (!hotspots) return null;
    return hotspots.files.filter(f => f.hotspot.score >= 60).length;
  }, [hotspots]);

  const health = useMemo(() => {
    if (!kpis || hotspotCount == null) return null;
    const ratio = kpis.total > 0 ? kpis.merged / kpis.total : 0.5;
    return Math.max(0, Math.min(100, Math.round(60 + ratio * 30 - hotspotCount * 2)));
  }, [kpis, hotspotCount]);

  const recentActivity = useMemo(() => {
    if (!prs) return null;
    return [...prs]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
  }, [prs]);

  // Source badge — prefer mimo if any contributing API returned it
  const activeSource = useMemo<{ source: Source; model: string | null } | null>(() => {
    if (risky?.anyMimo) return { source: "mimo", model: risky.mimoModel };
    if (hotspots?.source === "mimo") return { source: "mimo", model: hotspots.model };
    if (hotspots?.source === "corpus") return { source: "corpus", model: null };
    if (risky && risky.items.length > 0) return { source: "corpus", model: null };
    return null;
  }, [risky, hotspots]);

  const fatalError = prsErr && hotspotsErr;

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Snapshot for{" "}
            <span className="font-mono text-[var(--foreground)]">
              {owner}/{name}
            </span>
          </p>
        </div>
        <SourceBadge
          source={activeSource?.source ?? null}
          model={activeSource?.model ?? null}
        />
      </div>

      {fatalError ? (
        <Card>
          <CardContent>
            <Empty
              icon={AlertTriangle}
              title="Couldn't load this repo"
              hint="Check the repo name, your GitHub token in Settings, or try a demo repo."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Total PRs"
              value={kpis?.total ?? 0}
              icon={GitPullRequest}
              loading={!kpis}
              hint={kpis ? "All-time (sample)" : undefined}
            />
            <KpiCard
              label="Open PRs"
              value={kpis?.open ?? 0}
              icon={GitPullRequest}
              tone="primary"
              loading={!kpis}
              hint={kpis ? "Awaiting review or work" : undefined}
            />
            <KpiCard
              label="Merged"
              value={kpis?.merged ?? 0}
              icon={GitMerge}
              tone="success"
              loading={!kpis}
              hint={
                kpis && kpis.total > 0
                  ? `${Math.round((kpis.merged / kpis.total) * 100)}% merge rate`
                  : undefined
              }
            />
            <KpiCard
              label="Hotspots"
              value={hotspotCount ?? 0}
              icon={Flame}
              tone="warning"
              loading={hotspotCount == null}
              hint={hotspotCount != null ? "Files at risk (score ≥60)" : undefined}
            />
          </div>

          {/* Health gauge + Top risky PRs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--primary)]" />
                  Repo health
                </CardTitle>
                <CardDescription>
                  Composite of merge rate and hotspot pressure
                </CardDescription>
              </CardHeader>
              <CardContent>
                {health == null ? (
                  <div className="flex items-center justify-center py-12">
                    <Skeleton className="h-40 w-40 rounded-full" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-full h-48 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="70%"
                          outerRadius="100%"
                          data={[
                            { name: "health", value: health, fill: healthBand(health).color },
                          ]}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <PolarAngleAxis
                            type="number"
                            domain={[0, 100]}
                            angleAxisId={0}
                            tick={false}
                          />
                          <RadialBar
                            background={{ fill: "var(--border)" }}
                            dataKey="value"
                            cornerRadius={10}
                          />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-4xl font-semibold tabular-nums">{health}</div>
                        <div
                          className="text-xs uppercase tracking-wider mt-1 font-medium"
                          style={{ color: healthBand(health).color }}
                        >
                          {healthBand(health).label}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                    Top risky open PRs
                  </CardTitle>
                  <CardDescription>Ranked by AI risk score</CardDescription>
                </div>
                <Link
                  href="/prs"
                  className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1"
                >
                  All PRs <ArrowUpRight className="w-3 h-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {risky == null ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : risky.items.length === 0 ? (
                  <Empty
                    icon={GitPullRequest}
                    title="No open PRs"
                    hint="No active pull requests to score."
                  />
                ) : (
                  <ul className="space-y-2">
                    {risky.items.map(({ pr, score }) => {
                      const band = riskBand(score);
                      return (
                        <li key={pr.number}>
                          <Link
                            href={`/prs?focus=${pr.number}`}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--background-elevated)] transition-colors group"
                          >
                            <Avatar src={pr.userAvatar} login={pr.user} size={24} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm truncate font-medium group-hover:text-[var(--primary)] transition-colors">
                                {pr.title}
                              </div>
                              <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                                #{pr.number} · {pr.user} · {formatRelative(pr.updatedAt)}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium tabular-nums",
                                band.color
                              )}
                            >
                              {score}
                              <span className="opacity-70">{band.label}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity feed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                Recent activity
              </CardTitle>
              <CardDescription>Latest PR updates</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity == null ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <Empty
                  icon={GitPullRequest}
                  title="No recent activity"
                  hint="No PR events to show right now."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {recentActivity.map(pr => {
                    const action = pr.merged
                      ? "merged PR"
                      : pr.state === "closed"
                        ? "closed PR"
                        : pr.draft
                          ? "drafted PR"
                          : "opened PR";
                    const ActionIcon = pr.merged ? GitMerge : GitPullRequest;
                    const actionTone = pr.merged
                      ? "text-[var(--success)]"
                      : pr.state === "closed"
                        ? "text-[var(--foreground-muted)]"
                        : "text-[var(--primary)]";
                    return (
                      <li key={pr.number} className="py-2.5 flex items-center gap-3">
                        <Avatar src={pr.userAvatar} login={pr.user} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">
                            <span className="font-medium">{pr.user}</span>{" "}
                            <span className="text-[var(--foreground-muted)] inline-flex items-center gap-1">
                              <ActionIcon className={cn("w-3 h-3", actionTone)} />
                              {action}
                            </span>{" "}
                            <Link
                              href={`/prs?focus=${pr.number}`}
                              className="hover:text-[var(--primary)]"
                            >
                              #{pr.number}
                            </Link>{" "}
                            <span className="text-[var(--foreground)]">{pr.title}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-[var(--foreground-muted)] shrink-0 tabular-nums">
                          {formatRelative(pr.updatedAt)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
