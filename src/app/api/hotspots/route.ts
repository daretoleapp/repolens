import { NextRequest, NextResponse } from "next/server";
import { topChurnFiles } from "@/lib/github";
import { fileHotspotScore } from "@/lib/scoring";
import { callMimo, extractJson, isMimoFallback } from "@/lib/mimo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MimoHotspotJson {
  fileRecommendations?: { filename: string; recommendation: string; priority: "low" | "medium" | "high" }[];
  themes?: string[];
  summary?: string;
}

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const name = req.nextUrl.searchParams.get("name");
  const sample = Number(req.nextUrl.searchParams.get("sample") || "30");
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name required" }, { status: 400 });
  }
  try {
    const files = await topChurnFiles(owner, name, sample, 50);
    const scored = files.map(f => ({
      ...f,
      hotspot: fileHotspotScore(f),
    }));

    // Top 10 only for MiMo
    const top = scored.slice(0, 10);
    const compact = top
      .map(f => `${f.filename} | ${f.commits} commits | +${f.additions}/-${f.deletions} | score ${f.hotspot.score}`)
      .join("\n");

    let mimoResult: MimoHotspotJson | null = null;
    let source: "mimo" | "corpus" = "corpus";
    let mimoModel: string | null = null;

    try {
      const r = await callMimo({
        tier: "pro",
        responseFormat: "json_object",
        messages: [
          { role: "system", content: "Output strictly a single JSON object. No prose." },
          {
            role: "user",
            content: `Hotspot analysis for ${owner}/${name}. The top files by churn are:

${compact}

Return JSON:
{
  "fileRecommendations": [
    {"filename": "...", "recommendation": "<1 sentence action>", "priority": "low"|"medium"|"high"}
  ],
  "themes": ["<2-3 short patterns observed>"],
  "summary": "<1 sentence overall takeaway>"
}

Recommendations should be specific (e.g. "extract auth helper", "add integration tests for billing flow"). Priority: high if churn-critical, medium if architectural, low if cosmetic. Limit to 5 file recommendations max.`,
          },
        ],
      });
      mimoResult = extractJson<MimoHotspotJson>(r.content);
      if (mimoResult) {
        source = "mimo";
        mimoModel = r.model;
      }
    } catch (e) {
      if (!isMimoFallback(e)) console.error("[hotspots] mimo error:", e);
    }

    const fallbackRecs = top.slice(0, 5).map(f => ({
      filename: f.filename,
      recommendation:
        f.hotspot.band === "critical"
          ? "Critical churn — schedule deep review and add coverage"
          : f.hotspot.band === "hot"
          ? "Frequent changes — consider extracting helpers"
          : f.hotspot.band === "warm"
          ? "Watch for regression — add tests if missing"
          : "Stable — no action needed",
      priority: f.hotspot.band === "critical" ? ("high" as const) : f.hotspot.band === "hot" ? ("medium" as const) : ("low" as const),
    }));

    const response = {
      files: scored,
      recommendations: mimoResult?.fileRecommendations?.slice(0, 5) || fallbackRecs,
      themes: mimoResult?.themes || ["churn-heavy modules", "config files in flux"],
      summary:
        mimoResult?.summary ||
        `${scored.filter(f => f.hotspot.score >= 60).length} files in hot/critical band; focus there first.`,
      source,
      model: mimoModel,
    };

    return NextResponse.json(response, {
      headers: {
        "x-repolens-source": source,
        ...(mimoModel ? { "x-repolens-model": mimoModel } : {}),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
