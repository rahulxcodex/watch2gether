import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

describe('Proxy Routes Unit Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false, dbPath: ':memory:' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 400 when url parameter is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/proxy',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('valid public http(s) URL');
  });

  it('should return 400 when target is localhost or private IP (SSRF guard)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/proxy?url=http://localhost:3001/api/health',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toContain('Private network access refused');
  });

  it('should respond to OPTIONS preflight with full CORS headers', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/proxy',
      headers: {
        origin: 'https://example.com',
        'access-control-request-method': 'GET',
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('should successfully proxy and rewrite info.movieboxnoob.cc master playlist without WAF 403 block', async () => {
    const testStream = 'https://info.movieboxnoob.cc/playlist/CDHtzpOCaCYwjA9DjcySoA.m3u8';
    const res = await app.inject({
      method: 'GET',
      url: `/api/proxy?url=${encodeURIComponent(testStream)}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('mpegurl');
    expect(res.body).toContain('#EXTM3U');
    expect(res.body).toContain('/api/proxy?url=');
    expect(res.body).not.toContain('aye cuh wyd');
  }, 15000);
});
