import { NextRequest, NextResponse } from "next/server";
import { CloudStore } from "@/lib/cloud-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = CloudStore.login(email, password);

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        library: user.library,
      },
    });

    res.cookies.set("wt_uid", user.id, {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: false,
      sameSite: "lax",
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Login failed" },
      { status: 401 }
    );
  }
}
