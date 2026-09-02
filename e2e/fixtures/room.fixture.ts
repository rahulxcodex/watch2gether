import { test as base, expect, Page, BrowserContext } from '@playwright/test';
import { BACKEND_URL } from '../playwright.config';

interface RoomFixtures {
  /** Creates a room via REST API and returns the room ID */
  roomId: string;
  /** Host page context */
  hostPage: Page;
  /** Guest page context in isolated browser context (simulates separate user) */
  guestContext: BrowserContext;
  guestPage: Page;
}

/** Create a room via the backend REST API directly (faster than UI flow) */
export async function createRoomViaApi(): Promise<string> {
  const resp = await fetch(BACKEND_URL + '/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'e2e-host', permissionMode: 'SHARED' }),
  });
  if (!resp.ok) throw new Error('Failed to create room: ' + resp.status);
  const data = await resp.json();
  return data.room.id;
}

export const test = base.extend<RoomFixtures>({
  roomId: async ({}, use) => {
    const id = await createRoomViaApi();
    await use(id);
  },

  hostPage: async ({ page }, use) => {
    await use(page);
  },

  guestContext: async ({ browser }, use) => {
    // Isolated context = fresh cookies/storage = separate user session
    const ctx = await browser.newContext();
    await use(ctx);
    await ctx.close();
  },

  guestPage: async ({ guestContext }, use) => {
    const page = await guestContext.newPage();
    await use(page);
  },
});

export { expect };
