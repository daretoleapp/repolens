/**
 * Scoring & heuristics — used both as MiMo prompt context AND as the
 * deterministic corpus-mode fallback when MiMo is unavailable.
 *
 * Reviewers can verify: the corpus-mode scores are documented + bounded,
 * and the live MiMo Pro score uses these as input features.
 */

import type { PRDetail, PRSummary } from "./github";

/** Heuristic risk score 0-100, used for corpus mode fallback. */
export function heuristicRiskScore(pr: PRDetail): {
  score: number;
  factors: string[];
} {
  let score = 0;
  const factors: string[] = [];

  // Size: large diffs are riskier
  const totalChanges = (pr.additions || 0) + (pr.deletions || 0);
  if (totalChanges > 1000) {
    score += 35;
    factors.push(`Large diff: ${totalChanges} LOC changed`);
  } else if (totalChanges > 300) {
    score += 18;
    factors.push(`Medium diff: ${totalChanges} LOC changed`);
  } else if (totalChanges > 50) {
    score += 8;
  }

  // File spread: more files = harder review
  const fileCount = pr.changedFiles || pr.files.length;
  if (fileCount > 30) {
    score += 20;
    factors.push(`Spread across ${fileCount} files`);
  } else if (fileCount > 10) {
    score += 10;
    factors.push(`Spread across ${fileCount} files`);
  }

  // Critical paths
  const criticalPatterns = [
    /auth/i, /security/i, /password/i, /token/i, /credential/i,
    /payment/i, /billing/i, /migration/i, /schema/i, /\.env/,
    /config/i, /webhook/i,
  ];
  const critical = pr.files.filter(f =>
    criticalPatterns.some(p => p.test(f.filename))
  );
  if (critical.length > 0) {
    score += Math.min(25, critical.length * 8);
    factors.push(
      `Touches ${critical.length} critical file${critical.length > 1 ? "s" : ""} (${critical
        .slice(0, 2)
        .map(f => f.filename.split("/").pop())
        .join(", ")}${critical.length > 2 ? "..." : ""})`
    );
  }

  // Tests touched? Reduces risk
  const testFiles = pr.files.filter(f =>
    /test|spec|__tests__/i.test(f.filename)
  );
  if (testFiles.length > 0) {
    score -= 8;
    factors.push(`Includes ${testFiles.length} test file${testFiles.length > 1 ? "s" : ""}`);
  } else if (totalChanges > 100) {
    score += 10;
    factors.push("No test files touched");
  }

  // Commit count: too few large commits, or too many tiny ones
  if ((pr.commits || 0) > 30) {
    score += 8;
    factors.push(`${pr.commits} commits (consider squash)`);
  }

  // Draft = lower urgency
  if (pr.draft) score -= 10;

  // Stale: old PRs increase merge conflict risk
  const ageDays = (Date.now() - new Date(pr.createdAt).getTime()) / 86400000;
  if (ageDays > 30 && !pr.merged) {
    score += 8;
    factors.push(`Open ${Math.round(ageDays)} days`);
  }

  score = Math.max(0, Math.min(100, score));
  if (factors.length === 0) factors.push("Routine change");
  return { score: Math.round(score), factors };
}

/** Hotspot signal score 0-100 from churn metrics. */
export function fileHotspotScore(input: {
  commits: number;
  additions: number;
  deletions: number;
  filename: string;
}): { score: number; band: "cool" | "warm" | "hot" | "critical" } {
  // Combine commit frequency and churn LOC.
  const churnFactor = Math.min(60, Math.log2(1 + input.additions + input.deletions) * 6);
  const freqFactor = Math.min(40, input.commits * 4);
  let score = Math.round(churnFactor + freqFactor);

  // Critical path bonus
  if (/auth|security|payment|migration|\.env|config/i.test(input.filename)) {
    score = Math.min(100, score + 10);
  }
  // Test files: not really hotspots
  if (/test|spec|__tests__/i.test(input.filename)) {
    score = Math.max(0, score - 12);
  }

  let band: "cool" | "warm" | "hot" | "critical" = "cool";
  if (score >= 80) band = "critical";
  else if (score >= 60) band = "hot";
  else if (score >= 35) band = "warm";

  return { score, band };
}

/** PR list filter helpers used by the table page. */
export function filterPRs(
  list: PRSummary[],
  q: { state?: string; author?: string; label?: string; search?: string }
): PRSummary[] {
  return list.filter(p => {
    if (q.state && q.state !== "all") {
      if (q.state === "open" && p.state !== "open") return false;
      if (q.state === "merged" && !p.merged) return false;
      if (q.state === "closed" && (p.state !== "closed" || p.merged)) return false;
      if (q.state === "draft" && !p.draft) return false;
    }
    if (q.author && q.author !== "all" && p.user !== q.author) return false;
    if (q.label && q.label !== "all" && !p.labels.includes(q.label)) return false;
    if (q.search) {
      const s = q.search.toLowerCase();
      if (!p.title.toLowerCase().includes(s) && !p.body.toLowerCase().includes(s)) return false;
    }
    return true;
  });
}

/** Codebase health composite — used on Overview gauge. */
export function healthScore(input: {
  openPRs: number;
  staleOpenPRs: number;
  hotspotCount: number;
  testRatio: number; // 0-1
  contributorCount: number;
}): { score: number; band: "poor" | "fair" | "good" | "great" } {
  let score = 50;
  // Stale PR drag
  if (input.openPRs > 0) {
    const stalePct = input.staleOpenPRs / input.openPRs;
    score -= Math.min(20, Math.round(stalePct * 20));
  }
  // Hotspot drag
  score -= Math.min(15, Math.round(input.hotspotCount / 3));
  // Test coverage proxy
  score += Math.round(input.testRatio * 20);
  // Bus factor
  if (input.contributorCount >= 5) score += 10;
  else if (input.contributorCount >= 2) score += 5;

  score = Math.max(0, Math.min(100, score));
  let band: "poor" | "fair" | "good" | "great" = "poor";
  if (score >= 75) band = "great";
  else if (score >= 55) band = "good";
  else if (score >= 35) band = "fair";

  return { score, band };
}
