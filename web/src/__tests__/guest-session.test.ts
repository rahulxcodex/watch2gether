import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreateGuestSession, updateGuestSession } from "@/lib/guest-session";

describe("Zero-Wall Guest Session", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should create a valid guest session with random name and color if none exists", () => {
    const session = getOrCreateGuestSession();
    expect(session).toBeDefined();
    expect(session.id).toMatch(/^guest_/);
    expect(session.name).toBeTruthy();
    expect(session.isGuest).toBe(true);
    expect(session.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("should persist and return the existing guest session across calls", () => {
    const session1 = getOrCreateGuestSession();
    const session2 = getOrCreateGuestSession();

    expect(session1.id).toBe(session2.id);
    expect(session1.name).toBe(session2.name);
  });

  it("should update guest session preferences when modified", () => {
    getOrCreateGuestSession();
    const updated = updateGuestSession({ name: "Custom Panda" });

    expect(updated.name).toBe("Custom Panda");
    const reloaded = getOrCreateGuestSession();
    expect(reloaded.name).toBe("Custom Panda");
  });
});
