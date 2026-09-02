import {
  CreateRoomRequestDTO,
  CreateRoomResponseDTO,
  RoomDetailsDTO,
  AuthResponseDTO,
} from "@watch2gether/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function createRoom(
  payload: CreateRoomRequestDTO = {}
): Promise<CreateRoomResponseDTO> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const roomData = (await res.json()) as CreateRoomResponseDTO;
      fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: roomData.roomCode,
          name: roomData.name,
          mediaUrl: roomData.mediaUrl,
          mediaType: roomData.mediaType,
        }),
      }).catch(() => {});
      return roomData;
    }
  } catch (err) {
    console.warn("API createRoom request failed, fallback to local generation:", err);
  }

  // Graceful fallback for offline / mock mode
  const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const fallbackRoom: CreateRoomResponseDTO = {
    id: "room_" + randomCode.toLowerCase(),
    roomCode: randomCode,
    name: payload.name || `Watch Party ${randomCode}`,
    hostId: "host_" + Math.random().toString(36).substring(2, 8),
    mediaUrl: payload.mediaUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    mediaType: payload.mediaType || "MP4",
    permissionMode: payload.permissionMode || "SHARED",
    currentTime: 0,
    playbackState: "PAUSED",
    version: 1,
    createdAt: Date.now(),
  };

  fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomCode: fallbackRoom.roomCode,
      name: fallbackRoom.name,
      mediaUrl: fallbackRoom.mediaUrl,
      mediaType: fallbackRoom.mediaType,
    }),
  }).catch(() => {});

  return fallbackRoom;
}

export async function getRoomDetails(roomCode: string): Promise<RoomDetailsDTO | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/rooms/${roomCode}`);
    if (res.ok) {
      return (await res.json()) as RoomDetailsDTO;
    }
  } catch (err) {
    console.warn("API getRoomDetails request failed:", err);
  }
  return null;
}

export async function getGuestAuth(name?: string): Promise<AuthResponseDTO | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      return (await res.json()) as AuthResponseDTO;
    }
  } catch (err) {
    console.warn("API getGuestAuth request failed:", err);
  }
  return null;
}
