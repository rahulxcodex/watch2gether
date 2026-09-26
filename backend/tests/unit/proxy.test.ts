import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

  it('should successfully proxy and rewrite master playlist without WAF 403 block', async () => {
    const originalFetch = global.fetch;
    const testStream = 'https://media.example.com/playlist/master.m3u8';
    const mockM3U8 = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nchunklist_360p.m3u8`;

    global.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes('media.example.com')) {
        return new Response(mockM3U8, {
          status: 200,
          headers: {
            'content-type': 'application/vnd.apple.mpegurl',
          },
        });
      }
      return originalFetch(url);
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/proxy?url=${encodeURIComponent(testStream)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('mpegurl');
      expect(res.body).toContain('#EXTM3U');
      expect(res.body).toContain('/api/proxy?url=');
      expect(res.body).toContain('chunklist_360p.m3u8');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
