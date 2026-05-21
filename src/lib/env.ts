// Auto-load env from .env.local + fallback to ~/.agent/credentials/openrouter.env
// + ~/.agent/credentials/github-daretoleapp.env (in dev only).
//
// Keys never embedded; user must provide via env or Settings UI (which writes
// to a server-side cookie scoped to the session).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const env = {
  openrouterKey: () => process.env.OPENROUTER_API_KEY || "",
  githubToken: () => process.env.GITHUB_TOKEN || "",
  siteUrl: () => SITE_URL,
  mimoPro: () => process.env.MIMO_MODEL_PRO || "xiaomi/mimo-v2.5-pro",
  mimoFlash: () => process.env.MIMO_MODEL_FLASH || "xiaomi/mimo-v2.5-flash",
  mimoVL: () => process.env.MIMO_MODEL_VL || "xiaomi/mimo-v2.5",
  maxTokensPro: () => Number(process.env.MIMO_MAX_TOKENS_PRO || 400),
  maxTokensFlash: () => Number(process.env.MIMO_MAX_TOKENS_FLASH || 150),
  maxTokensVL: () => Number(process.env.MIMO_MAX_TOKENS_VL || 400),
};
