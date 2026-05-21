"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import {
  Component,
  Sparkles,
  Cpu,
  Upload,
  Trash2,
  ChevronDown,
  ChevronUp,
  Boxes,
  GitBranch,
  Layers,
  AlertTriangle,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

interface ArchComponent {
  name: string;
  role: string;
}

interface ArchCritique {
  components: ArchComponent[];
  couplingHotspots: string[];
  singlePointsOfFailure: string[];
  decouplingSuggestions: string[];
  overallScore: number;
  summary: string;
  source: "mimo" | "corpus";
  model: string | null;
}

interface HistoryEntry {
  id: string;
  name: string;
  score: number;
  summary: string;
  timestamp: number;
  dataUrl: string;
}

const HISTORY_KEY = "repolens.arch.history";
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];

function scoreBand(score: number): {
  label: string;
  color: string;
  variant: "success" | "primary" | "warning" | "danger";
} {
  if (score >= 80)
    return { label: "Great", color: "var(--success)", variant: "success" };
  if (score >= 60)
    return { label: "Good", color: "var(--primary)", variant: "primary" };
  if (score >= 40)
    return { label: "Fair", color: "var(--warning)", variant: "warning" };
  return { label: "Poor", color: "var(--danger)", variant: "danger" };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
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
        MiMo VL
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

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
  iconColor,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  iconColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 border-b border-[var(--border)] flex items-center justify-between gap-2 hover:bg-[var(--background)]/40 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon
            className="w-4 h-4"
            // inline color via style works at runtime; React passes through
          />
          <span className="text-sm font-semibold tracking-tight">{title}</span>
          <Badge variant="outline">{count}</Badge>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
        )}
        {iconColor && null}
      </button>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

export default function ArchitecturePage() {
  const { owner, name } = useRepo();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(
    null
  );
  const [description, setDescription] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ArchCritique | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as HistoryEntry[];
          if (Array.isArray(parsed)) setHistory(parsed.slice(0, 3));
        }
      } catch {}
    });
    return () => {
      alive = false;
    };
  }, []);

  const persistHistory = useCallback((next: HistoryEntry[]) => {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const readFile = useCallback((file: File) => {
    if (!ACCEPT.includes(file.type)) {
      toast.error("Use PNG, JPEG, or WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Image too large (max ${formatBytes(MAX_BYTES)})`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setDataUrl(url);
      setFileName(file.name);
      setFileSize(file.size);
      setResult(null);
      const img = new window.Image();
      img.onload = () =>
        setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = url;
    };
    reader.onerror = () => toast.error("Could not read file");
    reader.readAsDataURL(file);
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  };

  const clear = () => {
    setDataUrl(null);
    setFileName(null);
    setFileSize(null);
    setDimensions(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const analyze = async () => {
    if (!dataUrl) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/arch-critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, description: description || undefined }),
      });
      const json = (await r.json()) as ArchCritique & { error?: string };
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      const normalized: ArchCritique = {
        components: json.components || [],
        couplingHotspots: json.couplingHotspots || [],
        singlePointsOfFailure: json.singlePointsOfFailure || [],
        decouplingSuggestions: json.decouplingSuggestions || [],
        overallScore: json.overallScore ?? 0,
        summary: json.summary || "",
        source: json.source,
        model: json.model ?? null,
      };
      setResult(normalized);
      toast.success(`Critique complete · ${normalized.source}`);
      const entry: HistoryEntry = {
        id:
          (typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now())),
        name: fileName || "diagram",
        score: normalized.overallScore,
        summary: normalized.summary,
        timestamp: Date.now(),
        dataUrl,
      };
      persistHistory([entry, ...history].slice(0, 3));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Analysis failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setDataUrl(entry.dataUrl);
    setFileName(entry.name);
    setFileSize(null);
    setDimensions(null);
    setResult(null);
    const img = new window.Image();
    img.onload = () =>
      setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = entry.dataUrl;
    toast.success("Loaded from history");
  };

  const band = result ? scoreBand(result.overallScore) : null;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Component className="w-6 h-6 text-[var(--primary)]" />
            Architecture Critique
          </h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1 max-w-2xl">
            Upload an architecture diagram. MiMo VL will analyze components,
            coupling hotspots, single points of failure, and suggest decoupling
            moves.
          </p>
          {owner && name && (
            <div className="text-[11px] text-[var(--foreground-subtle)] mt-1.5 font-mono">
              context · {owner}/{name}
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: upload */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Upload diagram</CardTitle>
              <CardDescription>
                PNG, JPEG, or WebP · up to {formatBytes(MAX_BYTES)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "rounded-xl border-2 border-dashed transition-all cursor-pointer",
                  "flex flex-col items-center justify-center text-center px-4 py-8",
                  dragOver
                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-[var(--border-strong)] hover:border-[var(--primary)]/60 hover:bg-[var(--background)]/30"
                )}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
              >
                {dataUrl ? (
                  <div className="w-full space-y-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={dataUrl}
                      alt="Architecture preview"
                      className="max-h-72 w-full object-contain rounded-lg border border-[var(--border)] bg-[var(--background)]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--foreground-muted)]">
                      <span className="font-mono truncate max-w-[200px]">
                        {fileName}
                      </span>
                      <span className="tabular-nums">
                        {fileSize !== null && formatBytes(fileSize)}
                        {dimensions && (
                          <>
                            {fileSize !== null ? " · " : ""}
                            {dimensions.w}×{dimensions.h}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[var(--foreground-subtle)] mb-2" />
                    <div className="text-sm font-medium text-[var(--foreground)]">
                      Drop your diagram here
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] mt-1">
                      or click to browse
                    </div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept={ACCEPT.join(",")}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) readFile(f);
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--foreground-muted)] mb-1.5 block">
                  Add context (optional)
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Microservices for fintech app, 50 RPS"
                  rows={3}
                  className={cn(
                    "w-full rounded-lg bg-[var(--background)] border border-[var(--border-strong)] px-3 py-2 text-sm",
                    "focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/30",
                    "placeholder:text-[var(--foreground-subtle)] resize-none"
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={analyze}
                  disabled={!dataUrl || loading}
                  className="flex-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {loading ? "Analyzing…" : "Analyze with MiMo VL"}
                </Button>
                {dataUrl && (
                  <Button variant="ghost" onClick={clear} aria-label="Clear">
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent critiques</CardTitle>
                <CardDescription>
                  Click a thumbnail to reload the diagram.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {history.map(h => {
                    const b = scoreBand(h.score);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => loadFromHistory(h)}
                        className="group rounded-lg border border-[var(--border)] hover:border-[var(--primary)] overflow-hidden text-left transition-colors"
                        title={h.summary}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={h.dataUrl}
                          alt={h.name}
                          className="w-full h-20 object-cover bg-[var(--background)]"
                        />
                        <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                          <span
                            className="text-[10px] font-mono truncate"
                            title={h.name}
                          >
                            {h.name}
                          </span>
                          <span
                            className="text-[10px] font-semibold tabular-nums"
                            style={{ color: b.color }}
                          >
                            {h.score}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: critique result */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !loading && (
            <Card>
              <CardContent>
                <Empty
                  icon={Component}
                  title="No critique yet"
                  hint="Upload a diagram to begin"
                />
              </CardContent>
            </Card>
          )}

          {loading && (
            <div className="space-y-4">
              <Skeleton className="h-48" />
              <Skeleton className="h-24" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            </div>
          )}

          {result && band && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle>Architectural health</CardTitle>
                      <CardDescription>
                        Overall structural soundness based on the diagram.
                      </CardDescription>
                    </div>
                    <Badge variant={band.variant}>{band.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="w-44 h-44 shrink-0 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          innerRadius="70%"
                          outerRadius="100%"
                          data={[
                            {
                              name: "score",
                              value: result.overallScore,
                              fill: band.color,
                            },
                          ]}
                          startAngle={90}
                          endAngle={-270}
                        >
                          <PolarAngleAxis
                            type="number"
                            domain={[0, 100]}
                            tick={false}
                          />
                          <RadialBar
                            background={{ fill: "var(--border)" }}
                            dataKey="value"
                            cornerRadius={8}
                            isAnimationActive={false}
                          />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div
                          className="text-4xl font-semibold tabular-nums"
                          style={{ color: band.color }}
                        >
                          {result.overallScore}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mt-0.5">
                          / 100
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-relaxed text-[var(--foreground)]">
                        {result.summary || "No summary provided."}
                      </div>
                      <div className="mt-3">
                        <SourceBadge
                          source={result.source}
                          model={result.model}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CollapsibleSection
                  title="Components"
                  icon={Boxes}
                  count={result.components.length}
                >
                  {result.components.length === 0 ? (
                    <div className="text-xs text-[var(--foreground-muted)]">
                      No components identified.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {result.components.map((c, i) => (
                        <li
                          key={`${c.name}-${i}`}
                          className="rounded-lg border border-[var(--border)] p-3"
                        >
                          <div className="text-sm font-medium text-[var(--foreground)]">
                            {c.name}
                          </div>
                          <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
                            {c.role}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Coupling Hotspots"
                  icon={GitBranch}
                  count={result.couplingHotspots.length}
                >
                  {result.couplingHotspots.length === 0 ? (
                    <div className="text-xs text-[var(--foreground-muted)]">
                      No coupling hotspots flagged.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {result.couplingHotspots.map((h, i) => (
                        <Badge key={i} variant="danger">
                          {h}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Single Points of Failure"
                  icon={AlertTriangle}
                  count={result.singlePointsOfFailure.length}
                >
                  {result.singlePointsOfFailure.length === 0 ? (
                    <div className="text-xs text-[var(--foreground-muted)]">
                      None identified.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {result.singlePointsOfFailure.map((s, i) => (
                        <Badge key={i} variant="warning">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection
                  title="Decoupling Suggestions"
                  icon={Layers}
                  count={result.decouplingSuggestions.length}
                >
                  {result.decouplingSuggestions.length === 0 ? (
                    <div className="text-xs text-[var(--foreground-muted)]">
                      No suggestions.
                    </div>
                  ) : (
                    <ol className="space-y-2 list-none">
                      {result.decouplingSuggestions.map((s, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm leading-relaxed"
                        >
                          <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] text-[11px] font-semibold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-[var(--foreground)]">{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CollapsibleSection>
              </div>

              <div className="flex justify-end">
                <SourceBadge source={result.source} model={result.model} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
