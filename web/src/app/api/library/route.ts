import { NextRequest, NextResponse } from "next/server";
import { CloudStore } from "@/lib/cloud-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("wt_uid")?.value;
  if (!uid) {
    return NextResponse.json({ library: [] });
  }

  const library = CloudStore.getLibrary(uid);
  return NextResponse.json({ library });
}

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("wt_uid")?.value;
  const body = await req.json();
  const { library } = body || {};

  if (!Array.isArray(library)) {
    return NextResponse.json(
      { error: "Invalid library payload. Array expected." },
      { status: 400 }
    );
  }

  if (uid) {
    CloudStore.saveLibrary(uid, library);
  }

  return NextResponse.json({ success: true, count: library.length });
}
