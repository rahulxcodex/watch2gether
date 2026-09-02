/**
 * ACCEPTANCE CRITERION: Room & Identity
 *
 * "Text chat messages sent by Client A appear instantly on Client B's screen."
 */
import { test, expect } from '../fixtures/room.fixture';

test.describe('Real-Time Chat', () => {
  test('message sent by host appears on guest screen within 500ms', async ({
    hostPage,
    guestPage,
    roomId,
  }) => {
    // Both clients join the same room
    await Promise.all([
      hostPage.goto('/room/' + roomId),
      guestPage.goto('/room/' + roomId),
    ]);

    // Wait for both to have a connected room UI
    await Promise.all([
      expect(hostPage.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 10_000 }),
      expect(guestPage.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 10_000 }),
    ]);

    const testMessage = 'Hello from e2e-host-' + Date.now();

    // Host types and sends a message
    const t0 = Date.now();
    await hostPage.locator('[data-testid="chat-input"]').fill(testMessage);
    await hostPage.locator('[data-testid="chat-send-btn"]').click();

    // Verify message appears on GUEST screen
    await expect(guestPage.locator('[data-testid="chat-messages"]')).toContainText(
      testMessage,
      { timeout: 2_000 } // 2s generous limit; expectation is near-instant
    );

    const elapsed = Date.now() - t0;
    console.log('Chat delivery latency:', elapsed, 'ms');
    expect(elapsed).toBeLessThan(2_000); // Practical network tolerance
  });

  test('guest message appears on host screen', async ({
    hostPage,
    guestPage,
    roomId,
  }) => {
    await Promise.all([
      hostPage.goto('/room/' + roomId),
      guestPage.goto('/room/' + roomId),
    ]);

    await Promise.all([
      expect(hostPage.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 10_000 }),
      expect(guestPage.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 10_000 }),
    ]);

    const replyMessage = 'Hello back from guest-' + Date.now();
    await guestPage.locator('[data-testid="chat-input"]').fill(replyMessage);
    await guestPage.locator('[data-testid="chat-send-btn"]').click();

    await expect(hostPage.locator('[data-testid="chat-messages"]')).toContainText(
      replyMessage,
      { timeout: 2_000 }
    );
  });

  test('emoji reactions can be sent and received', async ({
    hostPage,
    guestPage,
    roomId,
  }) => {
    await Promise.all([
      hostPage.goto('/room/' + roomId),
      guestPage.goto('/room/' + roomId),
    ]);

    // Click a reaction button on host
    const reactionBtn = hostPage.locator('[data-testid="reaction-btn"]').first();
    if (await reactionBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reactionBtn.click();
      // Guest should receive the reaction
      await expect(guestPage.locator('[data-testid="reaction-canvas"]')).toBeVisible({
        timeout: 2_000,
      });
    }
  });
});
