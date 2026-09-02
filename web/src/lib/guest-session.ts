import { UserDTO } from "@watch2gether/shared";
import { generateGuestName, generateRandomAvatarColor } from "./utils";

const GUEST_STORAGE_KEY = "w2g_guest_session";

export function getOrCreateGuestSession(): UserDTO {
  if (typeof window === "undefined") {
    return {
      id: "server-user-" + Math.random().toString(36).substring(2, 9),
      name: "Guest",
      isGuest: true,
      color: "#6366f1",
      avatarColor: "#6366f1",
      joinedAt: Date.now(),
    };
  }

  try {
    const saved = localStorage.getItem(GUEST_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as UserDTO;
      if (parsed && parsed.id && parsed.name) {
        return parsed;
      }
    }
  } catch {
    // ignore parse / storage errors
  }

  const newSession: UserDTO = {
    id: "guest_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36),
    name: generateGuestName(),
    isGuest: true,
    color: generateRandomAvatarColor(),
    avatarColor: generateRandomAvatarColor(),
    joinedAt: Date.now(),
  };

  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newSession));
  } catch {
    // ignore storage quota errors
  }

  return newSession;
}

export function updateGuestSession(updates: Partial<UserDTO>): UserDTO {
  const current = getOrCreateGuestSession();
  const updated: UserDTO = { ...current, ...updates };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}
