import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const name = req.nextUrl.searchParams.get("name");
  if (!owner || !name) {
    return NextResponse.json({ error: "owner and name required" }, { status: 400 });
  }
  try {
    const info = await getRepo(owner, name);
    return NextResponse.json(info);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
