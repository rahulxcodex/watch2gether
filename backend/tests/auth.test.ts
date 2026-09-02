import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { closeDatabase } from '../src/db/db';

describe('Auth REST API (Zero-Wall Guest Access)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ dbPath: ':memory:', logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  it('should issue a guest JWT and user object with auto-generated name when body is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('token');
    expect(body).toHaveProperty('user');
    expect(body.user.id).toMatch(/^usr_/);
    expect(body.user.name).toBeTruthy();
    expect(body.user.isGuest).toBe(true);

    // Assert Cookie header
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(String(cookies)).toContain('w2g_token=');
  });

  it('should accept a custom display name for guest session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: {
        name: 'Cool Panda',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.user.name).toBe('Cool Panda');
    expect(body.user.isGuest).toBe(true);

    // Verify token can be decoded
    const decoded = app.jwt.verify<{ id: string; name: string; isGuest: boolean }>(body.token);
    expect(decoded.id).toBe(body.user.id);
    expect(decoded.name).toBe('Cool Panda');
    expect(decoded.isGuest).toBe(true);
  });
});
