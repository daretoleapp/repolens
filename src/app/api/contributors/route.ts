import { NextRequest, NextResponse } from "next/server";
import { listContributors, listPRs, type PRSummary } from "@/lib/github";
import { callMimo, extractJson, isMimoFallback } from "@/lib/mimo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContribProfile {
  login: string;
  avatar: string;
  totalContributions: number;
  prsAuthored: number;
  prsMerged: number;
  prsDraft: number;
  recentLabels: string[];
  expertise?: string;
  burnoutSignal?: "ok" | "watch" | "warn";
  lateNightCommits?: number;
}

interface MimoExpertJson {
  contributors?: { login: string; expertise: string; burnoutSignal?: "ok" | "watch" | "warn" }[];
}

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const name = req.nextUrl.searchParams.get("name");
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name required" }, { status: 400 });
  }
  try {
    const [contribs, prs] = await Promise.all([
      listContributors(owner, name, 30),
      listPRs(owner, name, "all", 100),
    ]);

    const byUser = new Map<string, ContribProfile>();
    for (const c of contribs) {
      byUser.set(c.login, {
        login: c.login,
        avatar: c.avatar,
        totalContributions: c.contributions,
        prsAuthored: 0,
        prsMerged: 0,
        prsDraft: 0,
        recentLabels: [],
      });
    }
    const labelTally = new Map<string, Map<string, number>>();
    for (const pr of prs as PRSummary[]) {
      const u = byUser.get(pr.user);
      if (!u) continue;
      u.prsAuthored += 1;
      if (pr.merged) u.prsMerged += 1;
      if (pr.draft) u.prsDraft += 1;
      const ll = labelTally.get(pr.user) || new Map<string, number>();
      for (const l of pr.labels) ll.set(l, (ll.get(l) || 0) + 1);
      labelTally.set(pr.user, ll);
    }
    for (const [login, ll] of labelTally) {
      const u = byUser.get(login);
      if (!u) continue;
      u.recentLabels = [...ll.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k);
    }
    const list = [...byUser.values()].sort((a, b) => b.totalContributions - a.totalContributions);

    // MiMo Pro: assign expertise based on labels + name
    let mimoModel: string | null = null;
    let source: "mimo" | "corpus" = "corpus";
    try {
      const top = list.slice(0, 8);
      const compact = top
        .map(
          c => `${c.login} | total=${c.totalContributions} prs=${c.prsAuthored}/${c.prsMerged}m labels=${c.recentLabels.join(",") || "none"}`
        )
        .join("\n");
      const r = await callMimo({
        tier: "pro",
        responseFormat: "json_object",
        messages: [
          { role: "system", content: "Output strictly a single JSON object." },
          {
            role: "user",
            content: `Profile contributors of ${owner}/${name}:

${compact}

Return JSON:
{
  "contributors": [
    {
      "login": "...",
      "expertise": "<area in 2-4 words, e.g. 'Auth & sessions', 'CI/CD', 'UI components'>",
      "burnoutSignal": "ok"|"watch"|"warn"
    }
  ]
}

Burnout: 'warn' only if PR volume + label diversity suggests overload; 'watch' if rising trend; 'ok' otherwise.`,
          },
        ],
      });
      const j = extractJson<MimoExpertJson>(r.content);
      if (j?.contributors) {
        const m = new Map(j.contributors.map(c => [c.login, c]));
        for (const u of list) {
          const x = m.get(u.login);
          if (x) {
            u.expertise = x.expertise;
            u.burnoutSignal = x.burnoutSignal;
          }
        }
        source = "mimo";
        mimoModel = r.model;
      }
    } catch (e) {
      if (!isMimoFallback(e)) console.error("[contributors] mimo error:", e);
    }

    if (source === "corpus") {
      // Heuristic expertise from labels
      for (const u of list) {
        u.expertise = u.recentLabels[0] || "general";
        u.burnoutSignal = u.prsAuthored > 30 ? "watch" : "ok";
      }
    }

    return NextResponse.json(
      { contributors: list, source, model: mimoModel },
      {
        headers: {
          "x-repolens-source": source,
          ...(mimoModel ? { "x-repolens-model": mimoModel } : {}),
        },
      }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
