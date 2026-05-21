"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Key,
  GitBranch,
  Settings as SettingsIcon,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Cpu,
  ExternalLink,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
} from "@/components/ui";
import { useRepo } from "@/components/repo-context";
import { DEMO_REPOS } from "@/lib/demos";
import { cn } from "@/lib/utils";

type TabId = "api-keys" | "demo" | "about";

const TABS: { id: TabId; label: string; hash: string; icon: typeof Key }[] = [
  { id: "api-keys", label: "API Keys", hash: "#api-keys", icon: Key },
  { id: "demo", label: "Demo Repo", hash: "#demo", icon: SettingsIcon },
  { id: "about", label: "About", hash: "#about", icon: Info },
];

const STORAGE_OR = "repolens.openrouter";
const STORAGE_GH = "repolens.github";

function hashToTab(h: string): TabId {
  const hh = h.replace(/^#/, "");
  if (hh === "demo" || hh === "about" || hh === "api-keys") return hh as TabId;
  return "api-keys";
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("api-keys");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate tab from URL hash, then sync changes back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    Promise.resolve().then(() => {
      setTab(hashToTab(window.location.hash));
      setHydrated(true);
    });
    const onHash = () => setTab(hashToTab(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function selectTab(id: TabId) {
    setTab(id);
    if (typeof window !== "undefined") {
      const target = `#${id}`;
      if (window.location.hash !== target) {
        history.replaceState(null, "", target);
      }
    }
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Configure API keys, demo repo, and theme preferences
        </p>
      </div>

      <div className="border-b border-[var(--border)] flex items-center gap-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors -mb-px border-b-2",
                active
                  ? "border-[var(--primary)] text-[var(--foreground)]"
                  : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {hydrated && tab === "api-keys" && <ApiKeysTab />}
      {hydrated && tab === "demo" && <DemoTab />}
      {hydrated && tab === "about" && <AboutTab />}
    </div>
  );
}

/* ─────────── Tab 1: API Keys ─────────── */

function ApiKeysTab() {
  const [openrouter, setOpenrouter] = useState("");
  const [github, setGithub] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setOpenrouter(localStorage.getItem(STORAGE_OR) || "");
        setGithub(localStorage.getItem(STORAGE_GH) || "");
      } catch {
        // ignore
      }
      setLoaded(true);
    });
  }, []);

  const missing =
    loaded && !openrouter.trim() && !github.trim();

  return (
    <div className="space-y-4 max-w-3xl">
      {missing && (
        <Card className="border-[var(--warning)]/40 bg-[var(--warning)]/5">
          <CardContent className="flex items-start gap-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
            <div className="text-[var(--foreground-muted)]">
              Demo runs in corpus-mode without{" "}
              <code className="text-[var(--warning)]">OPENROUTER_API_KEY</code>.
              Visit{" "}
              <a
                href="https://openrouter.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                openrouter.ai
              </a>{" "}
              to sign up.
            </div>
          </CardContent>
        </Card>
      )}

      <KeyCard
        title="OpenRouter API Key"
        description="Used for MiMo Pro reasoning + MiMo VL multimodal"
        icon={Sparkles}
        value={openrouter}
        onChange={setOpenrouter}
        placeholder="sk-or-v1-..."
        storageKey={STORAGE_OR}
        validate={v => {
          if (!v) return null;
          if (!v.startsWith("sk-or-v1-"))
            return "Key should start with sk-or-v1-";
          return null;
        }}
        onTest={async key => {
          const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return "OpenRouter key is valid";
        }}
        helper={
          <span>
            Server env var <code>OPENROUTER_API_KEY</code> takes precedence.
            Saved client-side only — backend persistence not yet wired.
          </span>
        }
      />

      <KeyCard
        title="GitHub Personal Access Token"
        description="Optional — boosts rate limit for public repos"
        icon={GitBranch}
        value={github}
        onChange={setGithub}
        placeholder="ghp_..."
        storageKey={STORAGE_GH}
        validate={() => null}
        onTest={async key => {
          const r = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${key}` },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = (await r.json()) as { login?: string };
          return `Authenticated as ${j.login || "user"}`;
        }}
        helper={
          <span>
            Stored in <code>localStorage</code>. Server uses{" "}
            <code>GITHUB_TOKEN</code> env var when present.
          </span>
        }
      />
    </div>
  );
}

interface KeyCardProps {
  title: string;
  description: string;
  icon: typeof Key;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  storageKey: string;
  validate: (v: string) => string | null;
  onTest: (key: string) => Promise<string>;
  helper: React.ReactNode;
}

function KeyCard({
  title,
  description,
  icon: Icon,
  value,
  onChange,
  placeholder,
  storageKey,
  validate,
  onTest,
  helper,
}: KeyCardProps) {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(value);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setDraft(value));
  }, [value]);

  const dirty = draft !== value;
  const error = validate(draft);

  async function save() {
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      if (draft.trim()) {
        localStorage.setItem(storageKey, draft.trim());
      } else {
        localStorage.removeItem(storageKey);
      }
      onChange(draft.trim());
      // Note: backend persistence (POST /api/settings) not implemented yet.
      toast.success(draft.trim() ? `${title} saved` : `${title} cleared`);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!draft.trim()) {
      toast.error("Enter a key first");
      return;
    }
    if (error) {
      toast.error(error);
      return;
    }
    setTesting(true);
    try {
      const msg = await onTest(draft.trim());
      toast.success(msg);
    } catch (e) {
      toast.error(
        `Test failed: ${(e as Error).message}. Browser CORS may block this — server-side validation recommended.`
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--primary)]" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={show ? "text" : "password"}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              className="w-full pr-10 font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || !dirty || !!error}
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save
          </Button>
          <Button onClick={test} disabled={testing || !draft.trim()}>
            {testing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Test
          </Button>
        </div>
        {error && (
          <div className="text-xs text-[var(--danger)] flex items-center gap-1">
            <X className="w-3 h-3" />
            {error}
          </div>
        )}
        <div className="text-[11px] text-[var(--foreground-subtle)]">
          {helper}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────── Tab 2: Demo Repo ─────────── */

function DemoTab() {
  const { owner, name, setRepo, isCustom } = useRepo();
  const [customOwner, setCustomOwner] = useState("");
  const [customName, setCustomName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function applyCustom() {
    const o = customOwner.trim();
    const n = customName.trim();
    if (!o || !n) {
      setError("Both owner and repo name required");
      return;
    }
    if (!/^[\w.-]+$/.test(o) || !/^[\w.-]+$/.test(n)) {
      setError("Use only letters, numbers, dashes, underscores, dots");
      return;
    }
    setError(null);
    setRepo(o, n);
    toast.success(`Loaded ${o}/${n}`);
    setCustomOwner("");
    setCustomName("");
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="bg-[var(--primary)]/5 border-[var(--primary)]/30">
        <CardContent className="flex items-center gap-2.5">
          <Check className="w-4 h-4 text-[var(--primary)] shrink-0" />
          <div className="flex-1">
            <div className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
              Currently selected
            </div>
            <div className="text-sm font-semibold mt-0.5">
              {owner}/{name}
            </div>
          </div>
          <Badge variant={isCustom ? "outline" : "primary"}>
            {isCustom ? "Custom" : "Demo"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEMO_REPOS.map(d => {
          const active = d.owner === owner && d.name === name;
          return (
            <button
              key={`${d.owner}/${d.name}`}
              onClick={() => {
                setRepo(d.owner, d.name);
                toast.success(`Switched to ${d.label}`);
              }}
              className={cn(
                "text-left rounded-xl bg-[var(--background-card)] border p-4 transition-all",
                active
                  ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/30"
                  : "border-[var(--border)] hover:border-[var(--border-strong)]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {d.label}
                  </div>
                  <div className="text-[11px] text-[var(--foreground-subtle)] truncate">
                    {d.owner}/{d.name}
                  </div>
                </div>
                {active && (
                  <Check className="w-4 h-4 text-[var(--primary)] shrink-0" />
                )}
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mt-2 line-clamp-2">
                {d.description}
              </p>
              <div className="flex items-center gap-1.5 mt-3">
                <Badge variant="outline">{d.language}</Badge>
                <Badge variant="default">{d.size}</Badge>
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custom repo</CardTitle>
          <CardDescription>
            Load any public GitHub repository
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="owner"
              value={customOwner}
              onChange={e => {
                setCustomOwner(e.target.value);
                setError(null);
              }}
              className="flex-1 min-w-[120px]"
            />
            <span className="self-center text-[var(--foreground-muted)]">
              /
            </span>
            <Input
              placeholder="repo"
              value={customName}
              onChange={e => {
                setCustomName(e.target.value);
                setError(null);
              }}
              onKeyDown={e => e.key === "Enter" && applyCustom()}
              className="flex-1 min-w-[120px]"
            />
            <Button variant="primary" onClick={applyCustom}>
              <Check className="w-3.5 h-3.5" />
              Apply
            </Button>
          </div>
          {error && (
            <div className="text-xs text-[var(--danger)] flex items-center gap-1">
              <X className="w-3 h-3" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────── Tab 3: About ─────────── */

function AboutTab() {
  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardContent className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-[var(--primary-foreground)]">
              R
            </span>
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold tracking-tight">
              RepoLens
            </div>
            <p className="text-sm text-[var(--foreground-muted)] mt-1">
              See risk, hotspots, and reviewer fit before you click open. Stop
              reviewing PRs blind.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-[var(--primary)]/10 to-[var(--accent)]/10 border-[var(--primary)]/30">
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--primary)]" />
            <div className="text-sm font-semibold">
              Powered by Xiaomi MiMo
            </div>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            Reasoning, summarization, and multimodal understanding via the MiMo
            family of models served on OpenRouter.
          </p>
          <a
            href="https://100t.xiaomimimo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline mt-1"
          >
            Submit to MiMo grant
            <ExternalLink className="w-3 h-3" />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What this app does</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
            <li className="flex gap-2">
              <span className="text-[var(--primary)]">•</span>
              Surfaces PR risk before you click into the diff — change size,
              file hotspots, and reviewer fit.
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--primary)]">•</span>
              Maps contributor expertise and burnout signals from real activity
              patterns.
            </li>
            <li className="flex gap-2">
              <span className="text-[var(--primary)]">•</span>
              Critiques architecture and flags churn hotspots using MiMo
              reasoning over public GitHub data.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <CardDescription>
            MiMo tiers used across the app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ModelRow
            name="MiMo Pro"
            useCase="Deep reasoning — PR risk explanations, architecture critique"
            icon={Sparkles}
          />
          <ModelRow
            name="MiMo Flash"
            useCase="Fast summaries — contributor expertise tagging, label inference"
            icon={Cpu}
          />
          <ModelRow
            name="MiMo VL"
            useCase="Multimodal — diagrams, screenshots, README image parsing"
            icon={Sparkles}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tech stack</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {[
            "Next.js 15",
            "MiMo via OpenRouter",
            "GitHub REST",
            "Recharts",
            "Tailwind v4",
            "TypeScript",
          ].map(t => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-[var(--foreground-muted)]">Source:</span>
            <a
              href="https://github.com/daretoleapp/repolens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline"
            >
              github.com/daretoleapp/repolens
            </a>
          </div>
          <a
            href="https://100t.xiaomimimo.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Submit MiMo Grant
            <ExternalLink className="w-3 h-3" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

interface ModelRowProps {
  name: string;
  useCase: string;
  icon: typeof Sparkles;
}

function ModelRow({ name, useCase, icon: Icon }: ModelRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] p-3">
      <Icon className="w-4 h-4 text-[var(--primary)] mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-[var(--foreground-muted)] mt-0.5">
          {useCase}
        </div>
      </div>
    </div>
  );
}
