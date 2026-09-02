import { describe, it, expect } from "vitest";
import { QUICK_EMOJIS } from "@/components/chat/ChatPanel";

describe("Chat & Reactions UI Components", () => {
  it("should contain standard quick-reaction emojis including fire, heart, laughter, popcorn", () => {
    expect(QUICK_EMOJIS).toContain("❤️");
    expect(QUICK_EMOJIS).toContain("🔥");
    expect(QUICK_EMOJIS).toContain("😂");
    expect(QUICK_EMOJIS).toContain("🍿");
    expect(QUICK_EMOJIS.length).toBeGreaterThanOrEqual(6);
  });
});
