import { describe, it, expect } from "vitest";
import { extractYouTubeId } from "@/components/player/YouTubePlayer";

describe("Unified Player - YouTube ID Extraction", () => {
  it("should extract 11-char video ID from standard watch URL", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(extractYouTubeId(url)).toBe("dQw4w9WgXcQ");
  });

  it("should extract video ID from shortened youtu.be URL", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ?t=42";
    expect(extractYouTubeId(url)).toBe("dQw4w9WgXcQ");
  });

  it("should extract video ID from embed URL", () => {
    const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    expect(extractYouTubeId(url)).toBe("dQw4w9WgXcQ");
  });

  it("should handle raw video ID input gracefully", () => {
    const id = "dQw4w9WgXcQ";
    expect(extractYouTubeId(id)).toBe("dQw4w9WgXcQ");
  });
});
