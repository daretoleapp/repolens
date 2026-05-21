"use client";

import { useEffect, useState } from "react";
import {
  Treemap,
  Tooltip,
  ResponsiveContainer,
  type TreemapNode,
} from "recharts";
import { Flame, Sparkles, Cpu, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Skeleton,
  Empty,
} from "@/components/ui";
import { useRepo } from "@/components/repo-context";
import { cn, formatNumber } from "@/lib/utils";

type Band = "critical" | "hot" | "warm" | "cool";

interface HotspotFile {
  filename: string;
  commits: number;
  additions: number;
  deletions: number;
  hotspot: { score: number; band: Band };
}

interface Recommendation {
  filename: string;
  recommendation: string;
  priority: "low" | "medium" | "high";
}

interface HotspotsResponse {
  files: HotspotFile[];
  recommendations: Recommendation[];
  themes: string[];
  summary: string;
  source: "mimo" | "corpus";
  model: string | null;
}

const BAND_COLORS: Record<Band, string> = {
  critical: "#ef4444",
  hot: "#f59e0b",
  warm: "#5eead4",
  cool: "#374151",
};

const BAND_LABELS: Record<Band, string> = {
  critical: "Critical",
  hot: "Hot",
  warm: "Warm",
  cool: "Cool",
};

const BAND_BADGE_VARIANT: Record<
  Band,
  "danger" | "warning" | "accent" | "default"
> = {
  critical: "danger",
  hot: "warning",
  warm: "accent",
  cool: "default",
};

const PRIORITY_VARIANT: Record<
  Recommendation["priority"],
  "danger" | "warning" | "primary"
> = {
  high: "danger",
  medium: "warning",
  low: "primary",
};

interface TreemapCellNode extends TreemapNode {
  full?: string;
  band?: Band;
  size?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
}

function TreemapCell(props: unknown) {
  const node = props as TreemapCellNode & {
    onCellClick?: (full: string) => void;
  };
  const { x, y, width, height, name, band, full, onCellClick } = node;
  const fill = BAND_COLORS[(band ?? "cool") as Band];
  const showLabel = width > 60 && height > 24;
  return (
    <g
      onClick={() => {
        if (full && onCellClick) onCellClick(full);
      }}
      style={{ cursor: full ? "pointer" : "default" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="var(--background)"
        strokeWidth={2}
        rx={3}
      />
      {showLabel && (
        <text
          x={x + 6}
          y={y + 16}
          fill="#0a0a0a"
          fontSize={11}
          fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {String(name).length > 20
            ? String(name).slice(0, 18) + "…"
            : String(name)}
        </text>
      )}
    </g>
  );
}

function TreemapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TreemapCellNode }>;
}) {
  if (!active || !payload || !payload.length) return null;
  const node = payload[0]?.payload;
  if (!node) return null;
  const churn = (node.additions ?? 0) + (node.deletions ?? 0);
  return (
    <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--background-card)] p-3 shadow-lg text-xs">
      <div className="font-mono text-[var(--foreground)] mb-1 break-all max-w-[260px]">
        {node.full ?? node.name}
      </div>
      <div className="text-[var(--foreground-muted)] space-y-0.5">
        <div>
          Score:{" "}
          <span className="text-[var(--foreground)] font-medium">
            {node.size ?? node.value ?? 0}
          </span>{" "}
          {node.band && (
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                background: `${BAND_COLORS[node.band]}30`,
                color: BAND_COLORS[node.band],
              }}
            >
              {BAND_LABELS[node.band]}
            </span>
          )}
        </div>
        <div>Commits: {node.commits ?? 0}</div>
        <div>
          Churn: +{node.additions ?? 0} / -{node.deletions ?? 0} ({churn})
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ score, band }: { score: number; band: Band }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: BAND_COLORS[band] }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-[var(--foreground-muted)] w-8 text-right">
        {Math.round(pct)}
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  band,
}: {
  label: string;
  value: number;
  band: Band;
}) {
  return (
    <Card className="overflow-hidden">
      <div
        className="h-1"
        style={{ background: BAND_COLORS[band] }}
        aria-hidden
      />
      <CardContent className="py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--foreground-muted)] font-medium">
            {label}
          </div>
          <div
            className="text-2xl font-semibold tabular-nums"
            style={{ color: BAND_COLORS[band] }}
          >
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({
  source,
  model,
}: {
  source: "mimo" | "corpus";
  model: string | null;
}) {
  if (source === "mimo") {
    return (
      <Badge variant="primary" className="gap-1.5">
        <Sparkles className="w-3 h-3" />
        MiMo
        {model && (
          <span className="text-[10px] opacity-70 font-normal">· {model}</span>
        )}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5">
      <Cpu className="w-3 h-3" />
      Corpus
    </Badge>
  );
}

export default function HotspotsPage() {
  const { owner, name } = useRepo();
  const [data, setData] = useState<HotspotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doneRecs, setDoneRecs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!owner || !name) return;
    let alive = true;
    Promise.resolve()
      .then(async () => {
        if (!alive) return;
        setLoading(true);
        setError(null);
        setDoneRecs(new Set());
        try {
          const r = await fetch(
            `/api/hotspots?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`
          );
          if (!r.ok) throw new Error(await r.text());
          const json = (await r.json()) as HotspotsResponse;
          if (alive) setData(json);
        } catch (e: unknown) {
          if (alive)
            setError(e instanceof Error ? e.message : "Failed to load");
        } finally {
          if (alive) setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [owner, name]);

  const files = data?.files ?? [];
  const counts = {
    critical: files.filter(f => f.hotspot.band === "critical").length,
    hot: files.filter(f => f.hotspot.band === "hot").length,
    warm: files.filter(f => f.hotspot.band === "warm").length,
    cool: files.filter(f => f.hotspot.band === "cool").length,
  };

  const treemapData = files.map(f => ({
    name: f.filename.split("/").pop() ?? f.filename,
    size: f.hotspot.score,
    full: f.filename,
    band: f.hotspot.band,
    commits: f.commits,
    additions: f.additions,
    deletions: f.deletions,
  }));

  const top20 = [...files]
    .sort((a, b) => b.hotspot.score - a.hotspot.score)
    .slice(0, 20);

  const handleCellClick = async (full: string) => {
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Filename copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const toggleDone = (filename: string) => {
    setDoneRecs(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Flame className="w-6 h-6 text-[var(--danger)]" />
            Hotspots
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Files where bugs hide — churn × frequency × criticality
          </p>
        </div>
        {data && <SourceBadge source={data.source} model={data.model} />}
      </header>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-96" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent>
            <Empty
              icon={Flame}
              title="Couldn't load hotspots"
              hint={error}
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && files.length === 0 && (
        <Card>
          <CardContent>
            <Empty
              icon={Flame}
              title="No hotspots yet"
              hint="This repo has no churn activity in the analyzed range."
            />
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && files.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Critical · ≥80" value={counts.critical} band="critical" />
            <KpiCard label="Hot · 60–79" value={counts.hot} band="hot" />
            <KpiCard label="Warm · 35–59" value={counts.warm} band="warm" />
            <KpiCard label="Cool · <35" value={counts.cool} band="cool" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Churn map</CardTitle>
              <CardDescription>
                Box size = hotspot score. Click any cell to copy the path.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapData}
                    dataKey="size"
                    nameKey="name"
                    aspectRatio={4 / 3}
                    isAnimationActive={false}
                    content={
                      <TreemapCell
                        // @ts-expect-error recharts forwards extra props
                        onCellClick={handleCellClick}
                      />
                    }
                  >
                    <Tooltip content={<TreemapTooltip />} />
                  </Treemap>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Top 20 risky files</CardTitle>
                <CardDescription>
                  Ranked by hotspot score across the analyzed window.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--foreground-subtle)] border-b border-[var(--border)]">
                        <th className="px-4 py-2 w-10">#</th>
                        <th className="px-4 py-2">File</th>
                        <th className="px-4 py-2">Band</th>
                        <th className="px-4 py-2">Score</th>
                        <th className="px-4 py-2 text-right">Commits</th>
                        <th className="px-4 py-2 text-right">+/- LOC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top20.map((f, idx) => (
                        <tr
                          key={f.filename}
                          className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--background)]/40 transition-colors"
                        >
                          <td className="px-4 py-2 text-[var(--foreground-subtle)] tabular-nums">
                            {idx + 1}
                          </td>
                          <td
                            className="px-4 py-2 font-mono text-xs max-w-[320px] truncate"
                            title={f.filename}
                          >
                            {f.filename}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={BAND_BADGE_VARIANT[f.hotspot.band]}>
                              {BAND_LABELS[f.hotspot.band]}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <ScoreBar
                              score={f.hotspot.score}
                              band={f.hotspot.band}
                            />
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-[var(--foreground-muted)]">
                            {formatNumber(f.commits)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs whitespace-nowrap">
                            <span className="text-[var(--success)]">
                              +{formatNumber(f.additions)}
                            </span>
                            <span className="text-[var(--foreground-subtle)]">
                              {" / "}
                            </span>
                            <span className="text-[var(--danger)]">
                              -{formatNumber(f.deletions)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-1">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
                      MiMo Recommendations
                    </CardTitle>
                    <CardDescription>{data.summary}</CardDescription>
                  </div>
                </div>
                {data.themes && data.themes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {data.themes.map(t => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recommendations.length === 0 && (
                  <div className="text-xs text-[var(--foreground-muted)]">
                    No recommendations.
                  </div>
                )}
                {data.recommendations.map((rec, i) => {
                  const done = doneRecs.has(rec.filename);
                  return (
                    <div
                      key={`${rec.filename}-${i}`}
                      className={cn(
                        "rounded-lg border border-[var(--border)] p-3 space-y-2 transition-opacity",
                        done && "opacity-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={PRIORITY_VARIANT[rec.priority]}>
                          {rec.priority}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDone(rec.filename)}
                          className="text-[11px]"
                        >
                          <Check className="w-3 h-3" />
                          {done ? "Undo" : "Mark done"}
                        </Button>
                      </div>
                      <div
                        className="font-mono text-[11px] text-[var(--foreground-muted)] break-all"
                        title={rec.filename}
                      >
                        {rec.filename}
                      </div>
                      <div className="text-sm text-[var(--foreground)] leading-relaxed">
                        {rec.recommendation}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
