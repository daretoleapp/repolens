import { NextRequest, NextResponse } from "next/server";
import { callMimo, extractJson, isMimoFallback } from "@/lib/mimo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MimoArchJson {
  components?: { name: string; role: string }[];
  couplingHotspots?: string[];
  singlePointsOfFailure?: string[];
  decouplingSuggestions?: string[];
  overallScore?: number;
  summary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dataUrl: string | undefined = body.dataUrl;
    const description: string | undefined = body.description;
    if (!dataUrl) {
      return NextResponse.json({ error: "dataUrl required" }, { status: 400 });
    }

    let mimoModel: string | null = null;
    let source: "mimo" | "corpus" = "corpus";
    let result: MimoArchJson | null = null;

    try {
      const r = await callMimo({
        tier: "vl",
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content:
              "You are a senior software architect. Analyze the architecture diagram and return strict JSON.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this architecture diagram. Return JSON:
{
  "components": [{"name": "...", "role": "..."}],
  "couplingHotspots": ["<components with too many connections>"],
  "singlePointsOfFailure": ["<critical chokepoints>"],
  "decouplingSuggestions": ["<concrete decoupling moves>"],
  "overallScore": <0-100 architectural health>,
  "summary": "<1-2 sentence verdict>"
}

${description ? `Author note: ${description}\n\n` : ""}Limit each list to 4 items. Be specific (use actual component names from the diagram).`,
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      });
      result = extractJson<MimoArchJson>(r.content);
      if (result) {
        source = "mimo";
        mimoModel = r.model;
      }
    } catch (e) {
      if (!isMimoFallback(e)) console.error("[arch-critique] mimo error:", e);
    }

    if (!result) {
      result = {
        components: [{ name: "diagram", role: "uploaded asset" }],
        couplingHotspots: ["MiMo unavailable — cannot analyze visual content"],
        singlePointsOfFailure: [],
        decouplingSuggestions: [
          "Set OPENROUTER_API_KEY in Settings to enable MiMo VL analysis.",
        ],
        overallScore: 0,
        summary: "Corpus mode: visual analysis requires MiMo VL.",
      };
    }

    return NextResponse.json(
      { ...result, source, model: mimoModel },
      {
        headers: {
          "x-repolens-source": source,
          ...(mimoModel ? { "x-repolens-model": mimoModel } : {}),
        },
      }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
