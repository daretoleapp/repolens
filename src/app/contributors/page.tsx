"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Users,
  TrendingUp,
  Sparkles,
  Cpu,
  AlertTriangle,
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
import { cn, formatNumber } from "@/lib/utils";

interface Contributor {
  login: string;
  avatar: string;
  totalContributions: number;
  prsAuthored: number;
  prsMerged: number;
  prsDraft: number;
  recentLabels: string[];
  expertise?: string;
  burnoutSignal?: "ok" | "watch" | "warn";
}

interface ContributorsResponse {
  contributors: Contributor[];
  source: "mimo" | "corpus";
  model: string | null;
}

interface PRSummary {
  number: number;
  user: string;
  labels: string[];
  merged: boolean;
  draft: boolean;
}

interface PRsResponse {
  items: PRSummary[];
}

interface FetchState {
  key: string;
  contributors: Contributor[];
  source: "mimo" | "corpus" | null;
  model: string | null;
  prs: PRSummary[];
  error: string | null;
}

const INITIAL_STATE: FetchState = {
  key: "",
  contributors: [],
  source: null,
  model: null,
  prs: [],
  error: null,
};

const PALETTE = [
  "#5eead4",
  "#818cf8",
  "#c084fc",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#34d399",
  "#60a5fa",
];

function hashColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(login: string): string {
  if (!login) return "?";
  const parts = login.split(/[-_.]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return login.slice(0, 2).toUpperCase();
}

function burnoutBadge(signal: Contributor["burnoutSignal"]) {
  if (signal === "warn") {
    return { variant: "danger" as const, label: "Burnout: warn", dot: "#ef4444" };
  }
  if (signal === "watch") {
    return { variant: "warning" as const, label: "Burnout: watch", dot: "#f59e0b" };
  }
  return { variant: "success" as const, label: "Healthy", dot: "#10b981" };
}

interface ChartDatum {
  login: string;
  total: number;
  fill: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--background-card)] px-2.5 py-1.5 text-xs shadow-lg">
      <div className="font-medium">{d.login}</div>
      <div className="text-[var(--foreground-muted)]">
        {formatNumber(d.total)} contributions
      </div>
    </div>
  );
}

interface AvatarProps {
  login: string;
  src: string;
  size?: number;
}

function Avatar({ login, src, size = 40 }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--background-elevated)] text-xs font-semibold text-[var(--foreground-muted)] border border-[var(--border-strong)]"
        style={{ width: size, height: size }}
        aria-label={login}
      >
        {initials(login)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${login} avatar`}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className="shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--background-elevated)] object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export default function ContributorsPage() {
  const { owner, name } = useRepo();
  const [state, setState] = useState<FetchState>(INITIAL_STATE);

  const requestKey = `${owner}/${name}`;
  const loading = state.key !== requestKey;
  const { contributors, source, model, prs, error } = state;

  useEffect(() => {
    let cancelled = false;
    const q = `?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`;
    const key = `${owner}/${name}`;

    Promise.all([
      fetch(`/api/contributors${q}`).then(async r => {
        if (!r.ok) throw new Error(`contributors ${r.status}`);
        return (await r.json()) as ContributorsResponse;
      }),
      fetch(`/api/prs${q}&state=all`).then(async r => {
        if (!r.ok) return { items: [] } as PRsResponse;
        return (await r.json()) as PRsResponse;
      }),
    ])
      .then(([c, p]) => {
        if (cancelled) return;
        setState({
          key,
          contributors: c.contributors || [],
          source: c.source,
          model: c.model,
          prs: p.items || [],
          error: null,
        });
      })
      .catch(e => {
        if (cancelled) return;
        setState({
          key,
          contributors: [],
          source: null,
          model: null,
          prs: [],
          error: (e as Error).message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [owner, name]);

  const chartData: ChartDatum[] = useMemo(
    () =>
      contributors.slice(0, 10).map(c => ({
        login: c.login,
        total: c.totalContributions,
        fill: hashColor(c.expertise || c.login),
      })),
    [contributors]
  );

  // Pairing matrix: shared-label co-occurrence between top 8 PR authors.
  const pairing = useMemo(() => {
    if (!prs.length) return null;

    const labelsByUser = new Map<string, Set<string>>();
    const countByUser = new Map<string, number>();
    for (const pr of prs) {
      countByUser.set(pr.user, (countByUser.get(pr.user) || 0) + 1);
      const set = labelsByUser.get(pr.user) || new Set<string>();
      for (const l of pr.labels) set.add(l);
      labelsByUser.set(pr.user, set);
    }

    const top = [...countByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([login]) => login);

    if (top.length < 2) return null;

    let max = 0;
    const matrix: number[][] = top.map((_, i) =>
      top.map((__, j) => {
        if (i === j) return 0;
        const a = labelsByUser.get(top[i]);
        const b = labelsByUser.get(top[j]);
        if (!a || !b) return 0;
        let overlap = 0;
        for (const l of a) if (b.has(l)) overlap++;
        if (overlap > max) max = overlap;
        return overlap;
      })
    );

    return { users: top, matrix, max };
  }, [prs]);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Contributor Insights
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Per-contributor activity, expertise areas, burnout signals, and
            review pairing patterns
          </p>
        </div>
        {!loading && source && (
          <Badge
            variant={source === "mimo" ? "primary" : "outline"}
            className="shrink-0"
          >
            {source === "mimo" ? (
              <Sparkles className="w-3 h-3" />
            ) : (
              <Cpu className="w-3 h-3" />
            )}
            {source === "mimo" ? model || "MiMo" : "Corpus mode"}
          </Badge>
        )}
      </div>

      {error && (
        <Card className="border-[var(--danger)]/40">
          <CardContent className="flex items-center gap-2 text-sm text-[var(--danger)]">
            <AlertTriangle className="w-4 h-4" />
            Failed to load contributors: {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top contributors by activity</CardTitle>
          <CardDescription>
            Top 10 by total contributions; bars colored by expertise area
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <Empty
              icon={Users}
              title="No contributor data yet"
              hint="Try a different demo repo or wait a moment for cache to warm"
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <XAxis
                    dataKey="login"
                    tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: "var(--foreground-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    tickFormatter={v => formatNumber(v as number)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--border)", opacity: 0.3 }}
                    content={<ChartTooltip />}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : contributors.length === 0 ? (
        <Card>
          <CardContent>
            <Empty
              icon={Users}
              title="No contributors found"
              hint="This repo may be private or have no commits in the recent window"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contributors.map(c => {
            const burnout = burnoutBadge(c.burnoutSignal);
            const accent = hashColor(c.expertise || c.login);
            return (
              <Card
                key={c.login}
                className={cn(
                  "transition-all duration-200",
                  "hover:translate-y-[-2px] hover:border-[var(--border-strong)]"
                )}
              >
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Avatar login={c.login} src={c.avatar} />
                    <div className="flex-1 min-w-0">
                      <a
                        href={`https://github.com/${c.login}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold hover:text-[var(--primary)] truncate block"
                      >
                        {c.login}
                      </a>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {c.expertise && (
                          <Badge
                            variant="accent"
                            style={{
                              borderColor: `${accent}55`,
                              color: accent,
                              backgroundColor: `${accent}1f`,
                            }}
                          >
                            {c.expertise}
                          </Badge>
                        )}
                        <Badge variant={burnout.variant}>
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: burnout.dot }}
                          />
                          {burnout.label}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-[var(--background-elevated)] py-1.5">
                      <div className="text-sm font-semibold">
                        {c.prsAuthored}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wider">
                        Authored
                      </div>
                    </div>
                    <div className="rounded-md bg-[var(--background-elevated)] py-1.5">
                      <div className="text-sm font-semibold text-[var(--success)]">
                        {c.prsMerged}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wider">
                        Merged
                      </div>
                    </div>
                    <div className="rounded-md bg-[var(--background-elevated)] py-1.5">
                      <div className="text-sm font-semibold text-[var(--foreground-muted)]">
                        {c.prsDraft}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wider">
                        Draft
                      </div>
                    </div>
                  </div>

                  {c.recentLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.recentLabels.slice(0, 3).map(l => (
                        <Badge key={l} variant="outline">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5">
                    <span className="text-[11px] text-[var(--foreground-subtle)] uppercase tracking-wider">
                      Total
                    </span>
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <TrendingUp
                        className="w-3.5 h-3.5"
                        style={{ color: accent }}
                      />
                      {formatNumber(c.totalContributions)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Collaboration affinity</CardTitle>
          <CardDescription>
            Who reviews whose code (last 100 PRs) — shared-label overlap
            between top authors as a proxy for collaboration affinity
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : !pairing ? (
            <Empty
              icon={Users}
              title="Not enough PR data"
              hint="Need at least two active authors with labeled PRs to compute affinity"
            />
          ) : (
            <div className="overflow-x-auto">
              <div
                className="grid gap-1 text-[11px]"
                style={{
                  gridTemplateColumns: `minmax(120px, 1fr) repeat(${pairing.users.length}, minmax(40px, 1fr))`,
                }}
              >
                <div />
                {pairing.users.map(u => (
                  <div
                    key={`col-${u}`}
                    className="text-[var(--foreground-muted)] truncate text-center px-1"
                    title={u}
                  >
                    {u}
                  </div>
                ))}
                {pairing.users.map((row, i) => (
                  <div key={`row-${row}`} className="contents">
                    <div
                      className="text-[var(--foreground-muted)] truncate pr-2 self-center"
                      title={row}
                    >
                      {row}
                    </div>
                    {pairing.users.map((_, j) => {
                      const v = pairing.matrix[i][j];
                      const intensity =
                        pairing.max > 0 ? v / pairing.max : 0;
                      const bg =
                        i === j
                          ? "var(--background-elevated)"
                          : `rgba(94, 234, 212, ${0.06 + intensity * 0.55})`;
                      return (
                        <div
                          key={`cell-${i}-${j}`}
                          className="h-9 rounded-sm flex items-center justify-center font-medium text-[var(--foreground)]"
                          style={{ background: bg }}
                          title={
                            i === j
                              ? `${pairing.users[i]} (self)`
                              : `${pairing.users[i]} ↔ ${pairing.users[j]}: ${v} shared labels`
                          }
                        >
                          {i === j ? "·" : v || ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--foreground-subtle)]">
                <span>Less</span>
                <div className="flex gap-0.5">
                  {[0.06, 0.2, 0.35, 0.5, 0.6].map(a => (
                    <div
                      key={a}
                      className="w-4 h-3 rounded-sm"
                      style={{ background: `rgba(94, 234, 212, ${a})` }}
                    />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
