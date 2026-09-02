import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_INPUT = 220;
const MAX_OUTPUT_TOKENS = 450;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4.5";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

function parseJsonLoose(text: string) {
  if (!text) throw new Error("empty response");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("provider returned non-JSON metadata");
}

function normalize(data: any, imdbId?: string, fallbackSeries?: string) {
  const out = {
    series: String(data?.series || fallbackSeries || "").trim().slice(0, 120),
    seasonNumber: Number.isInteger(data?.seasonNumber) ? data.seasonNumber : null,
    episodeNumber: Number.isInteger(data?.episodeNumber) ? data.episodeNumber : null,
    episodeCode: String(data?.episodeCode || "").slice(0, 20),
    episodeTitle: String(data?.episodeTitle || "").slice(0, 160),
    confidence: ["high", "medium", "low"].includes(data?.confidence) ? data.confidence : "low",
    seriesYear: Number.isInteger(data?.seriesYear) ? data.seriesYear : null,
    seriesImdbId: String(data?.seriesImdbId || imdbId || "").match(/^tt\d{7,10}$/i)?.[0] || null,
    seriesImdbUrl: null as string | null,
    seriesImdbRating: typeof data?.seriesImdbRating === "number" ? data.seriesImdbRating : null,
    seriesGenres: Array.isArray(data?.seriesGenres) ? data.seriesGenres.slice(0, 6).map(String) : [],
    seriesSummary: String(data?.seriesSummary || "").slice(0, 500),
    episodeImdbId: String(data?.episodeImdbId || "").match(/^tt\d{7,10}$/i)?.[0] || null,
    episodeImdbUrl: null as string | null,
    episodeSummary: String(data?.episodeSummary || "").slice(0, 500),
    metadataNotes: String(data?.metadataNotes || "").slice(0, 500),
  };
  if (out.seriesImdbId) out.seriesImdbUrl = `https://www.imdb.com/title/${out.seriesImdbId}/`;
  if (out.episodeImdbId) out.episodeImdbUrl = `https://www.imdb.com/title/${out.episodeImdbId}/`;
  if (!out.episodeCode && out.seasonNumber != null && out.episodeNumber != null) {
    out.episodeCode = `S${String(out.seasonNumber).padStart(2, "0")}E${String(
      out.episodeNumber
    ).padStart(2, "0")}`;
  }
  return out;
}

async function fetchCompactImdb(imdbId: string) {
  if (!imdbId) return {} as any;
  try {
    const r = await fetch(`https://www.imdb.com/title/${imdbId}/`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html,application/xhtml+xml" },
    });
    if (!r.ok) return {};
    const html = (await r.text()).slice(0, 500000);
    const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      try {
        const j = JSON.parse(m[1]);
        const x = Array.isArray(j) ? j.find((v: any) => v?.["@type"]) : j;
        if (!x) continue;
        return {
          name: x.name || "",
          year: Number(String(x.datePublished || "").slice(0, 4)) || null,
          rating: Number(x?.aggregateRating?.ratingValue) || null,
          genres: Array.isArray(x.genre) ? x.genre.slice(0, 6) : x.genre ? [x.genre] : [],
          description: String(x.description || "").slice(0, 500),
          type: x["@type"] || "",
        };
      } catch {}
    }
  } catch {}
  return {};
}

function buildPrompt({ series, url, imdbId, imdb, playlistHint }: any) {
  return `Return ONLY compact JSON. Identify one anime/movie/episode.
Required keys: series,seasonNumber,episodeNumber,episodeCode,episodeTitle,confidence,seriesYear,seriesSummary,episodeSummary,metadataNotes.
Use null for unknown numbers. Never invent data. Keep summaries <=180 chars. Do not search for subtitles.
User series: ${series || ""}
IMDb: ${imdbId || ""}
Stream URL: ${url || ""}
IMDb facts: ${JSON.stringify(imdb).slice(0, 1400)}
Playlist hint: ${playlistHint.slice(0, 500)}
If IMDb facts already identify the title, trust them. Extract SxxEyy from the URL/hint when present.`;
}

async function callGemini(key: string, prompt: string) {
  const schema = {
    type: "object",
    properties: {
      series: { type: "string" },
      seasonNumber: { type: "integer", nullable: true },
      episodeNumber: { type: "integer", nullable: true },
      episodeCode: { type: "string" },
      episodeTitle: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      seriesYear: { type: "integer", nullable: true },
      seriesSummary: { type: "string" },
      episodeSummary: { type: "string" },
      metadataNotes: { type: "string" },
    },
    required: [
      "series",
      "seasonNumber",
      "episodeNumber",
      "episodeCode",
      "episodeTitle",
      "confidence",
      "seriesYear",
      "seriesSummary",
      "episodeSummary",
      "metadataNotes",
    ],
  };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
      key
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0,
        },
      }),
    }
  );
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  const j = await r.json();
  const text = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  return parseJsonLoose(text);
}

async function callOpenAICompatible(base: string, key: string, model: string, prompt: string) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a metadata extractor. Output only JSON, no markdown. Be concise and never invent facts.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const text = String(j?.choices?.[0]?.message?.content || "").trim();
  return parseJsonLoose(text);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const series = String(body?.series || "").trim().slice(0, MAX_INPUT);
  const url = String(body?.url || "").trim();
  const imdbId = String(body?.imdbId || "").trim().toLowerCase();

  if (!series && !imdbId) {
    return NextResponse.json({ error: "Series name or IMDb ID is required." }, { status: 400 });
  }

  const imdb: any = await fetchCompactImdb(imdbId);
  let playlistHint = "";
  if (url) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0", accept: "application/vnd.apple.mpegurl,text/plain,*/*" },
      });
      if (r.ok) playlistHint = (await r.text()).slice(0, 700);
    } catch {}
  }

  // Fast resolution if local IMDb facts and URL patterns match
  const combined = `${url}\n${playlistHint}`;
  const m = combined.match(/[Ss](\d{1,2})[ ._-]?[Ee](\d{1,3})/);
  const localSeries = series || imdb.name || `IMDb ${imdbId}`;
  if (m && imdb.name) {
    return NextResponse.json(
      normalize(
        {
          series: imdb.name,
          seasonNumber: Number(m[1]),
          episodeNumber: Number(m[2]),
          confidence: "high",
          seriesYear: imdb.year,
          seriesSummary: imdb.description,
          metadataNotes: "Resolved locally from IMDb JSON-LD and episode code.",
        },
        imdbId,
        localSeries
      )
    );
  }

  const prompt = buildPrompt({ series, url, imdbId, imdb, playlistHint });
  const order = String(process.env.LLM_PROVIDER_ORDER || "gemini,grok,openrouter")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const providers: Array<[string, () => Promise<any>]> = [];
  for (const p of order) {
    if (p === "gemini" && process.env.GEMINI_API_KEY) {
      providers.push(["gemini", () => callGemini(process.env.GEMINI_API_KEY!, prompt)]);
    }
    if (p === "grok" && process.env.XAI_API_KEY) {
      providers.push([
        "grok",
        () => callOpenAICompatible("https://api.x.ai/v1", process.env.XAI_API_KEY!, GROK_MODEL, prompt),
      ]);
    }
    if (p === "openrouter" && process.env.OPENROUTER_API_KEY) {
      providers.push([
        "openrouter",
        () =>
          callOpenAICompatible(
            "https://openrouter.ai/api/v1",
            process.env.OPENROUTER_API_KEY!,
            OPENROUTER_MODEL,
            prompt
          ),
      ]);
    }
  }

  if (!providers.length) {
    // If no LLM keys are configured, return structured fallback using IMDb or supplied name
    return NextResponse.json(
      normalize(
        {
          series: localSeries,
          seasonNumber: m ? Number(m[1]) : 1,
          episodeNumber: m ? Number(m[2]) : 1,
          confidence: "low",
          seriesYear: imdb.year || null,
          seriesSummary: imdb.description || "",
          metadataNotes: "Fallback metadata generated (configure GEMINI_API_KEY for automatic AI extraction).",
        },
        imdbId,
        localSeries
      )
    );
  }

  const failures = [];
  for (const [name, fn] of providers) {
    try {
      const data = normalize(await fn(), imdbId, localSeries);
      if (data.series || data.episodeCode || data.episodeTitle) {
        if (!data.seriesYear && imdb.year) data.seriesYear = imdb.year;
        if (!data.seriesSummary && imdb.description) data.seriesSummary = imdb.description;
        if (!data.seriesImdbRating && imdb.rating) data.seriesImdbRating = imdb.rating;
        if (!data.seriesGenres.length && imdb.genres?.length) data.seriesGenres = imdb.genres;
        data.metadataNotes = `Provider: ${name}.`;
        return NextResponse.json(data);
      }
    } catch (e: any) {
      failures.push(`${name}: ${e?.message || e}`);
    }
  }

  return NextResponse.json(
    normalize(
      {
        series: localSeries,
        confidence: "low",
        metadataNotes: `LLM providers failed: ${failures.join(" | ")}`,
      },
      imdbId,
      localSeries
    )
  );
}
