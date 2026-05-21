/**
 * GitHub data layer — REST client + intelligent fetchers + in-memory cache.
 *
 * No DB; cache lives per-server-process (resets on cold start). Cache TTL: 10 min.
 * For demo with public repos, this is plenty.
 */

import { Octokit } from "@octokit/rest";
import { env } from "./env";

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 10 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    cache.delete(key);
    return null;
  }
  return e.value as T;
}

function cacheSet<T>(key: string, value: T, ttl = TTL_MS): void {
  cache.set(key, { value, expires: Date.now() + ttl });
}

let _octokit: Octokit | null = null;
function octokit(): Octokit {
  if (_octokit) return _octokit;
  const token = env.githubToken();
  _octokit = new Octokit({ auth: token || undefined, userAgent: "repolens" });
  return _octokit;
}

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  pushedAt: string;
  createdAt: string;
  size: number;
  url: string;
  private: boolean;
}

export async function getRepo(owner: string, repo: string): Promise<RepoInfo> {
  const k = `repo:${owner}/${repo}`;
  const cached = cacheGet<RepoInfo>(k);
  if (cached) return cached;
  const r = await octokit().repos.get({ owner, repo });
  const info: RepoInfo = {
    owner: r.data.owner.login,
    name: r.data.name,
    fullName: r.data.full_name,
    description: r.data.description || "",
    stars: r.data.stargazers_count,
    forks: r.data.forks_count,
    watchers: r.data.watchers_count,
    openIssues: r.data.open_issues_count,
    defaultBranch: r.data.default_branch,
    language: r.data.language,
    topics: r.data.topics || [],
    pushedAt: r.data.pushed_at || r.data.updated_at || "",
    createdAt: r.data.created_at || "",
    size: r.data.size,
    url: r.data.html_url,
    private: r.data.private,
  };
  cacheSet(k, info);
  return info;
}

export interface PRSummary {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  user: string;
  userAvatar: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commits?: number;
  labels: string[];
  url: string;
  baseBranch: string;
  headBranch: string;
}

export async function listPRs(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
  limit = 50
): Promise<PRSummary[]> {
  const k = `prs:${owner}/${repo}:${state}:${limit}`;
  const cached = cacheGet<PRSummary[]>(k);
  if (cached) return cached;
  const r = await octokit().pulls.list({
    owner, repo, state, per_page: Math.min(limit, 100), sort: "updated", direction: "desc",
  });
  const items: PRSummary[] = r.data.slice(0, limit).map(p => ({
    number: p.number,
    title: p.title,
    state: (p.merged_at ? "closed" : (p.state as "open" | "closed")),
    merged: !!p.merged_at,
    draft: !!p.draft,
    user: p.user?.login || "ghost",
    userAvatar: p.user?.avatar_url || "",
    body: (p.body || "").slice(0, 2000),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    closedAt: p.closed_at,
    mergedAt: p.merged_at,
    labels: (p.labels || []).map(l => (typeof l === "string" ? l : l.name || "")),
    url: p.html_url,
    baseBranch: p.base?.ref || "main",
    headBranch: p.head?.ref || "",
  }));
  cacheSet(k, items);
  return items;
}

export interface PRDetail extends PRSummary {
  files: { filename: string; additions: number; deletions: number; changes: number; status: string }[];
  comments: number;
  reviewComments: number;
}

export async function getPR(owner: string, repo: string, number: number): Promise<PRDetail> {
  const k = `pr:${owner}/${repo}:${number}`;
  const cached = cacheGet<PRDetail>(k);
  if (cached) return cached;
  const [pr, files] = await Promise.all([
    octokit().pulls.get({ owner, repo, pull_number: number }),
    octokit().pulls.listFiles({ owner, repo, pull_number: number, per_page: 100 }),
  ]);
  const detail: PRDetail = {
    number: pr.data.number,
    title: pr.data.title,
    state: (pr.data.merged_at ? "closed" : (pr.data.state as "open" | "closed")),
    merged: !!pr.data.merged_at,
    draft: !!pr.data.draft,
    user: pr.data.user?.login || "ghost",
    userAvatar: pr.data.user?.avatar_url || "",
    body: (pr.data.body || "").slice(0, 4000),
    createdAt: pr.data.created_at,
    updatedAt: pr.data.updated_at,
    closedAt: pr.data.closed_at,
    mergedAt: pr.data.merged_at,
    additions: pr.data.additions,
    deletions: pr.data.deletions,
    changedFiles: pr.data.changed_files,
    commits: pr.data.commits,
    labels: (pr.data.labels || []).map(l => (typeof l === "string" ? l : l.name || "")),
    url: pr.data.html_url,
    baseBranch: pr.data.base.ref,
    headBranch: pr.data.head.ref,
    files: files.data.map(f => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      status: f.status,
    })),
    comments: pr.data.comments,
    reviewComments: pr.data.review_comments,
  };
  cacheSet(k, detail);
  return detail;
}

export interface ContributorStat {
  login: string;
  avatar: string;
  contributions: number;
}

export async function listContributors(owner: string, repo: string, limit = 30): Promise<ContributorStat[]> {
  const k = `contrib:${owner}/${repo}:${limit}`;
  const cached = cacheGet<ContributorStat[]>(k);
  if (cached) return cached;
  const r = await octokit().repos.listContributors({ owner, repo, per_page: limit });
  const items = r.data.map(c => ({
    login: c.login || "ghost",
    avatar: c.avatar_url || "",
    contributions: c.contributions || 0,
  }));
  cacheSet(k, items);
  return items;
}

export interface CommitActivity {
  week: number; // unix
  total: number;
  days: number[]; // 7
}

export async function commitActivity(owner: string, repo: string): Promise<CommitActivity[]> {
  const k = `commitact:${owner}/${repo}`;
  const cached = cacheGet<CommitActivity[]>(k);
  if (cached) return cached;
  const r = await octokit().repos.getCommitActivityStats({ owner, repo });
  // GitHub may return 202 if computing; data will be empty array.
  const items = (Array.isArray(r.data) ? r.data : []).map(w => ({
    week: w.week, total: w.total, days: w.days || [],
  }));
  cacheSet(k, items, 30 * 60 * 1000); // 30 min TTL — slow endpoint
  return items;
}

export async function listIssues(owner: string, repo: string, limit = 30): Promise<{ number: number; title: string; state: string; labels: string[]; user: string; createdAt: string; url: string; }[]> {
  const k = `issues:${owner}/${repo}:${limit}`;
  const cached = cacheGet<typeof items>(k);
  if (cached) return cached;
  const r = await octokit().issues.listForRepo({ owner, repo, state: "all", per_page: limit, sort: "updated", direction: "desc" });
  const items = r.data
    .filter(i => !i.pull_request) // exclude PRs
    .map(i => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels || []).map(l => (typeof l === "string" ? l : l.name || "")),
      user: i.user?.login || "ghost",
      createdAt: i.created_at,
      url: i.html_url,
    }));
  cacheSet(k, items);
  return items;
}

/** Top files by churn — naive: sample N recent commits, accumulate file changes. */
export async function topChurnFiles(owner: string, repo: string, sample = 30, limit = 50): Promise<{ filename: string; commits: number; additions: number; deletions: number }[]> {
  const k = `churn:${owner}/${repo}:${sample}:${limit}`;
  const cached = cacheGet<{ filename: string; commits: number; additions: number; deletions: number }[]>(k);
  if (cached) return cached;
  const recent = await octokit().repos.listCommits({ owner, repo, per_page: sample });
  const tally = new Map<string, { commits: number; additions: number; deletions: number }>();
  await Promise.all(recent.data.slice(0, sample).map(async c => {
    try {
      const detail = await octokit().repos.getCommit({ owner, repo, ref: c.sha });
      for (const f of detail.data.files || []) {
        const k = f.filename;
        const cur = tally.get(k) || { commits: 0, additions: 0, deletions: 0 };
        cur.commits += 1;
        cur.additions += f.additions || 0;
        cur.deletions += f.deletions || 0;
        tally.set(k, cur);
      }
    } catch {
      // ignore individual commit failures
    }
  }));
  const items = [...tally.entries()]
    .map(([filename, v]) => ({ filename, ...v }))
    .sort((a, b) => (b.commits * 100 + b.additions + b.deletions) - (a.commits * 100 + a.additions + a.deletions))
    .slice(0, limit);
  cacheSet(k, items);
  return items;
}

export function clearCache(): void {
  cache.clear();
}
