import { NextRequest, NextResponse } from "next/server";
import { listPRs } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const name = req.nextUrl.searchParams.get("name");
  const state = (req.nextUrl.searchParams.get("state") as "open" | "closed" | "all") || "all";
  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name required" }, { status: 400 });
  }
  try {
    const items = await listPRs(owner, name, state, limit);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
