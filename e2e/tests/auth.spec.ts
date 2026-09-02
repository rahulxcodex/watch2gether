/**
 * ACCEPTANCE CRITERION: Room & Identity
 *
 * "A guest session can be created and enter a room using only the invite URL,
 *  with no login prompt blocking the video."
 */
import { test, expect } from '../fixtures/room.fixture';

test.describe('Zero-Wall Guest Access', () => {
  test('guest can join room via invite URL without any login prompt', async ({
    guestPage,
    roomId,
  }) => {
    // Navigate directly to room URL (simulates clicking an invite link)
    await guestPage.goto('/room/' + roomId);

    // Should NOT see a login dialog, sign-in form, or auth gate
    await expect(guestPage.locator('[data-testid="login-modal"]')).not.toBeVisible({
      timeout: 3_000,
    });
    await expect(guestPage.locator('[data-testid="auth-gate"]')).not.toBeVisible({
      timeout: 3_000,
    });
    await expect(guestPage.locator('input[name="password"]')).not.toBeVisible({
      timeout: 1_000,
    });

    // Should see the room interface — at minimum the video player area
    await expect(
      guestPage.locator('[data-testid="video-player"], [data-testid="room-container"]')
    ).toBeVisible({ timeout: 10_000 });

    // Verify URL contains the room ID (guest was not redirected away)
    expect(guestPage.url()).toContain(roomId);
  });

  test('guest can set a nickname on first visit and enter room', async ({
    guestPage,
    roomId,
  }) => {
    await guestPage.goto('/room/' + roomId);

    // If a nickname dialog appears, fill and submit (allowed UX, must not block video)
    const nicknameInput = guestPage.locator('[data-testid="nickname-input"]');
    if (await nicknameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nicknameInput.fill('e2e-guest');
      await guestPage.locator('[data-testid="join-room-btn"]').click();
    }

    // After joining, should see room
    await expect(
      guestPage.locator('[data-testid="video-player"], [data-testid="room-container"]')
    ).toBeVisible({ timeout: 10_000 });
  });
});
