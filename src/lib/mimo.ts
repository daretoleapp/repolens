/**
 * MiMo client — OpenRouter wrapper with dual-mode operation.
 *
 * Live mode: real MiMo Pro / Flash / VL via OpenRouter.
 * Corpus mode: deterministic heuristic fallback when key missing or upstream errors.
 *
 * Every API route should label responses with header `x-repolens-source: mimo|corpus`
 * so reviewers can verify real model usage on the live demo.
 */

import { env } from "./env";

export class MimoUnavailableError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY not configured");
    this.name = "MimoUnavailableError";
  }
}

export class MimoUpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MimoUpstreamError";
  }
}

export const isMimoFallback = (e: unknown): boolean =>
  e instanceof MimoUnavailableError || e instanceof MimoUpstreamError;

export type MimoTier = "pro" | "flash" | "vl";

export interface MimoMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

interface MimoCallOptions {
  tier: MimoTier;
  messages: MimoMessage[];
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  temperature?: number;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function modelFor(tier: MimoTier): string {
  if (tier === "pro") return env.mimoPro();
  if (tier === "flash") return env.mimoFlash();
  return env.mimoVL();
}

function defaultMaxTokens(tier: MimoTier): number {
  if (tier === "pro") return env.maxTokensPro();
  if (tier === "flash") return env.maxTokensFlash();
  return env.maxTokensVL();
}

export async function callMimo(opts: MimoCallOptions): Promise<{
  content: string;
  source: "mimo";
  model: string;
  tokensUsed?: number;
}> {
  const key = env.openrouterKey();
  if (!key) throw new MimoUnavailableError();

  const model = modelFor(opts.tier);
  const max_tokens = opts.maxTokens ?? defaultMaxTokens(opts.tier);

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_tokens,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.siteUrl(),
        "X-Title": "RepoLens",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new MimoUpstreamError(0, `network: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MimoUpstreamError(res.status, text.slice(0, 300));
  }

  const j = await res.json();
  const content = j?.choices?.[0]?.message?.content || "";
  return {
    content: typeof content === "string" ? content : JSON.stringify(content),
    source: "mimo",
    model,
    tokensUsed: j?.usage?.total_tokens,
  };
}

/** Robust JSON extractor — MiMo sometimes wraps in markdown or trailing text. */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip markdown fence
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const body = fence ? fence[1] : text;
  // Find first { ... last }
  const first = body.indexOf("{");
  const last = body.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(body.slice(first, last + 1)) as T;
  } catch {
    return null;
  }
}
