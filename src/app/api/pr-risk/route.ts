import { NextRequest, NextResponse } from "next/server";
import { getPR } from "@/lib/github";
import { callMimo, extractJson, isMimoFallback } from "@/lib/mimo";
import { heuristicRiskScore } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MimoRiskJson {
  score?: number;
  factors?: string[];
  summary?: string;
  suggestedReviewer?: string;
  suggestedReviewerReason?: string;
}

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const name = req.nextUrl.searchParams.get("name");
  const numStr = req.nextUrl.searchParams.get("number");
  if (!owner || !name || !numStr) {
    return NextResponse.json({ error: "owner, name, number required" }, { status: 400 });
  }
  const number = Number(numStr);
  try {
    const pr = await getPR(owner, name, number);
    const heuristic = heuristicRiskScore(pr);

    // Build compact prompt for MiMo Pro
    const fileList = pr.files
      .slice(0, 20)
      .map(f => `${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join("\n");

    const prompt = `You are a senior code reviewer evaluating PR risk for ${owner}/${name}.
Analyze this PR and return a JSON object with this exact shape:
{
  "score": <0-100 risk number>,
  "factors": [<2-4 short reason strings>],
  "summary": "<1-2 sentence neutral summary of what the PR does>",
  "suggestedReviewer": "<github login from contributors familiar with these files, or "any senior" if unsure>",
  "suggestedReviewerReason": "<short why>"
}

PR #${pr.number}: ${pr.title}
By: ${pr.user}
Branches: ${pr.headBranch} -> ${pr.baseBranch}
Stats: +${pr.additions || 0}/-${pr.deletions || 0} across ${pr.changedFiles || pr.files.length} files
Labels: ${pr.labels.join(", ") || "none"}
Body: ${pr.body.slice(0, 600) || "(empty)"}

Files:
${fileList}

Heuristic baseline score: ${heuristic.score} (factors: ${heuristic.factors.join("; ")})

Return JSON only, no markdown.`;

    let mimoResult: MimoRiskJson | null = null;
    let source: "mimo" | "corpus" = "corpus";
    let mimoModel: string | null = null;

    try {
      const r = await callMimo({
        tier: "pro",
        responseFormat: "json_object",
        messages: [
          { role: "system", content: "Output strictly a single JSON object. No prose." },
          { role: "user", content: prompt },
        ],
      });
      mimoResult = extractJson<MimoRiskJson>(r.content);
      if (mimoResult && typeof mimoResult.score === "number") {
        source = "mimo";
        mimoModel = r.model;
      }
    } catch (e) {
      if (!isMimoFallback(e)) console.error("[pr-risk] mimo error:", e);
    }

    const final = mimoResult && source === "mimo"
      ? {
          score: Math.max(0, Math.min(100, Math.round(mimoResult.score!))),
          factors: mimoResult.factors?.slice(0, 5) || heuristic.factors,
          summary: mimoResult.summary || `${pr.title}`,
          suggestedReviewer: mimoResult.suggestedReviewer || "any senior",
          suggestedReviewerReason: mimoResult.suggestedReviewerReason || "",
        }
      : {
          score: heuristic.score,
          factors: heuristic.factors,
          summary: `${pr.title} — ${pr.additions || 0} added, ${pr.deletions || 0} deleted across ${pr.changedFiles || pr.files.length} files.`,
          suggestedReviewer: "any senior",
          suggestedReviewerReason: "Corpus mode — no model context for reviewer matching.",
        };

    return NextResponse.json(
      { ...final, pr, source, model: mimoModel },
      { headers: { "x-repolens-source": source, ...(mimoModel ? { "x-repolens-model": mimoModel } : {}) } }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
