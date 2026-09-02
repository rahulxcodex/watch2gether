import { NextRequest, NextResponse } from "next/server";
import { CloudStore } from "@/lib/cloud-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const users = CloudStore.getAllUsers();
  const rooms = CloudStore.getAllRooms();

  const totalUsers = users.length;
  const totalRooms = rooms.length;
  const totalActiveParticipants = rooms.reduce((acc, r) => acc + (r.activeUsersCount || 1), 0);

  return NextResponse.json({
    stats: {
      totalRooms,
      totalActiveUsers: totalActiveParticipants,
      totalRegisteredUsers: totalUsers,
    },
    rooms,
    users,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomCode, name, mediaUrl, mediaType, memberName } = body || {};
    if (roomCode) {
      CloudStore.trackRoom(roomCode, name, mediaUrl, mediaType, memberName);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get("roomCode");

  if (!roomCode) {
    return NextResponse.json({ error: "Missing roomCode" }, { status: 400 });
  }

  const terminated = CloudStore.terminateRoom(roomCode);
  return NextResponse.json({ success: terminated });
}
