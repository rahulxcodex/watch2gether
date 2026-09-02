import { NextRequest, NextResponse } from "next/server";
import { CloudStore } from "@/lib/cloud-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("wt_uid")?.value;
  if (!uid) {
    return NextResponse.json({ user: null });
  }

  const user = CloudStore.getUser(uid);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      library: user.library,
    },
  });
}

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("wt_uid");
  return res;
}
