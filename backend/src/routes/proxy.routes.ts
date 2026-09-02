import { FastifyPluginAsync } from 'fastify';
import { Readable } from 'node:stream';

export const proxyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.route({
    method: ['GET', 'HEAD', 'OPTIONS'],
    url: '/proxy',
    handler: handleProxy,
  });

  fastify.route({
    method: ['GET', 'HEAD', 'OPTIONS'],
    url: '/api/proxy',
    handler: handleProxy,
  });
};

async function handleProxy(request: any, reply: any) {
  if (request.method === 'OPTIONS') {
    return reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS')
      .header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept')
      .header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
      .status(204)
      .send();
  }
  const query = request.query as Record<string, string | undefined>;
  let target = query.url;
  if (target) {
    target = target.trim().replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, '$1');
  }

  if (!target || !/^https?:\/\//i.test(target)) {
    return reply.status(400).send({ error: 'Enter a valid public http(s) URL.' });
  }

  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return reply.status(400).send({ error: 'Invalid URL' });
  }

  // Guard against loopback and local networks
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)/i.test(t.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(t.hostname)
  ) {
    return reply.status(400).send({ error: 'Private network access refused.' });
  }

  const range = request.headers.range as string | undefined;
  const customReferer = query.referer || (request.headers['x-proxy-referer'] as string | undefined);

  const upstreamHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
  };

  if (customReferer) {
    upstreamHeaders['Referer'] = customReferer;
  }
  if (range) {
    upstreamHeaders['Range'] = range;
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders,
    });

    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    reply.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    for (const h of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'cache-control',
    ]) {
      const val = upstream.headers.get(h);
      if (val) reply.header(h, val);
    }
    reply.header('accept-ranges', 'bytes');

    if (!upstream.ok) {
      reply.status(upstream.status);
      if (upstream.body) {
        const stream = Readable.fromWeb(upstream.body as any);
        return reply.send(stream);
      }
      return reply.send();
    }

    const contentType = upstream.headers.get('content-type') || '';
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    const isExplicitHls =
      /mpegurl|m3u8/i.test(contentType) ||
      /\.m3u8(?:$|[?#])/i.test(target);

    const couldBeHlsPlaylist =
      request.method === 'GET' &&
      !range &&
      !contentType.startsWith('video/') &&
      !contentType.startsWith('audio/') &&
      (isExplicitHls || !contentLength || contentLength < 1500000);

    if (couldBeHlsPlaylist) {
      const buffer = await upstream.arrayBuffer();
      const magic = Buffer.from(buffer.slice(0, 16)).toString('utf-8').trimStart();
      const text = Buffer.from(buffer).toString('utf-8');
      const isRealHls =
        magic.startsWith('#EXTM3U') ||
        text.includes('#EXTINF:') ||
        text.includes('#EXT-X-STREAM-INF:');

      if (isRealHls) {
        // Use relative /api/proxy?url=
        const proxyBase = '/api/proxy?url=';

        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/gi, (_match, uri) => {
                try {
                  const absolute = new URL(uri, target).href;
                  return `URI="${proxyBase}${encodeURIComponent(absolute)}"`;
                } catch {
                  return `URI="${uri}"`;
                }
              });
            }

            try {
              const absolute = new URL(trimmed, target).href;
              return `${proxyBase}${encodeURIComponent(absolute)}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        reply.header('cache-control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('content-type', 'application/vnd.apple.mpegurl');
        reply.removeHeader('content-length');
        return reply.status(upstream.status).send(rewritten);
      }

      // If it wasn't HLS, normalize MIME type if upstream disguised video/audio as text/html
      if (
        /video_|\.mp4|\.m4s|_init\./i.test(target) ||
        (contentType.includes('text/html') && /video/i.test(target))
      ) {
        reply.header('content-type', 'video/mp4');
      } else if (/audio_/i.test(target)) {
        reply.header('content-type', 'audio/mp4');
      } else if (/\.ts(?:$|[?#])/i.test(target)) {
        reply.header('content-type', 'video/mp2t');
      }

      return reply.status(upstream.status).send(Buffer.from(buffer));
    }

    // Media streaming (segments, MP4s): normalize disguised MIME types
    if (
      /video_|\.mp4|\.m4s|_init\./i.test(target) ||
      (contentType.includes('text/html') && /video/i.test(target))
    ) {
      reply.header('content-type', 'video/mp4');
    } else if (/audio_/i.test(target)) {
      reply.header('content-type', 'audio/mp4');
    } else if (/\.ts(?:$|[?#])/i.test(target)) {
      reply.header('content-type', 'video/mp2t');
    }

    reply.status(upstream.status);
    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body as any);
      return reply.send(stream);
    }
    return reply.send();
  } catch (e: any) {
    return reply.status(502).send({
      error: e?.message || 'Proxy upstream fetch failed',
    });
  }
}
