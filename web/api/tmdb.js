export const config = { runtime: "nodejs" };
const TMDB_BASE = "https://api.themoviedb.org/3";
const READ_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN || "";
const API_KEY = process.env.TMDB_API_KEY || "";
const MAX = 120;
const clean = (s,n=MAX)=>String(s||"").trim().slice(0,n);
function yearOf(x){const d=String(x?.release_date||x?.first_air_date||"");return /^\d{4}/.test(d)?Number(d.slice(0,4)):null;}
async function tmdb(path,params={}){const u=new URL(TMDB_BASE+path);for(const[k,v]of Object.entries(params)){if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v));}const h={accept:"application/json"};if(READ_TOKEN)h.Authorization=`Bearer ${READ_TOKEN}`;else if(API_KEY)u.searchParams.set("api_key",API_KEY);const r=await fetch(u,{headers:h});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.status_message||`TMDB HTTP ${r.status}`);return d;}
function normalize(x,type){if(!x)return null;return {ok:true,source:"tmdb",tmdbId:x.id||null,mediaType:type,posterPath:x.poster_path||null,backdropPath:x.backdrop_path||null,overview:clean(x.overview,1200),rating:typeof x.vote_average==="number"?x.vote_average:null,voteCount:typeof x.vote_count==="number"?x.vote_count:null,year:yearOf(x),title:clean(x.title||x.name),originalTitle:clean(x.original_title||x.original_name),tagline:clean(x.tagline,220),status:clean(x.status,60),runtime:typeof x.runtime==="number"?x.runtime:null,episodeRunTime:Array.isArray(x.episode_run_time)?x.episode_run_time.slice(0,3):[],genres:Array.isArray(x.genres)?x.genres.slice(0,12).map(g=>({id:g.id,name:clean(g.name,60)})):[],seasons:type==="tv"&&Array.isArray(x.seasons)?x.seasons.map(s=>({id:s.id,seasonNumber:s.season_number,name:clean(s.name,120),overview:clean(s.overview,500),airDate:s.air_date||null,episodeCount:s.episode_count||0,posterPath:s.poster_path||null,rating:typeof s.vote_average==="number"?s.vote_average:null,voteCount:typeof s.vote_count==="number"?s.vote_count:null})):[],externalIds:x.external_ids?{imdbId:x.external_ids.imdb_id||null,tvdbId:x.external_ids.tvdb_id||null}:null,credits:x.credits?{cast:Array.isArray(x.credits.cast)?x.credits.cast.slice(0,12).map(c=>({id:c.id,name:clean(c.name,80),character:clean(c.character,100),profilePath:c.profile_path||null})):[],crew:Array.isArray(x.credits.crew)?x.credits.crew.filter(c=>["Director","Writer","Screenplay","Producer"].includes(c.job)).slice(0,12).map(c=>({id:c.id,name:clean(c.name,80),job:clean(c.job,50),profilePath:c.profile_path||null})):[]}:null};}
async function imdbFallback(title,imdbId,type){
  const q=clean(title); let rows=[];
  try{const r=await fetch(`https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json?includeVideos=0`,{headers:{accept:"application/json"}});const j=await r.json();rows=Array.isArray(j?.d)?j.d:[];}catch{}
  const exact=rows.find(x=>imdbId&&x?.id===imdbId)||rows.find(x=>String(x?.l||"").toLowerCase()===q.toLowerCase())||rows[0];
  if(!exact)return null;
  const poster=typeof exact?.i?.imageUrl==="string"?exact.i.imageUrl:(typeof exact?.i==="string"?exact.i:null);
  return {ok:true,source:"imdb",mediaType:type,title:clean(exact.l),year:Number(exact.y)||null,posterUrl:poster||null,backdropUrl:null,rating:null,voteCount:null,overview:"",genres:[]};
}
async function jikanFallback(title,type){
  try{const r=await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean(title))}&limit=5&sfw=true`);if(!r.ok)return null;const j=await r.json();const rows=Array.isArray(j?.data)?j.data:[];const pick=rows.find(x=>type==="movie"?(x.type==="Movie"):(x.type!=="Movie"))||rows[0];if(!pick)return null;const img=pick.images?.jpg?.large_image_url||pick.images?.jpg?.image_url||null;return {ok:true,source:"jikan",mediaType:type,title:clean(pick.title),originalTitle:clean(pick.title_japanese),year:pick.year||null,posterUrl:img,backdropUrl:null,posterPath:null,backdropPath:null,overview:clean(pick.synopsis,1200),rating:typeof pick.score==="number"?pick.score:null,voteCount:typeof pick.scored_by==="number"?pick.scored_by:null,status:clean(pick.status,60),runtime:pick.duration?null:null,genres:Array.isArray(pick.genres)?pick.genres.map(g=>({id:g.mal_id,name:clean(g.name,60)})):[],seasons:[]};}catch{return null;}}
async function fallback(title,imdbId,type){
  const imdb=await imdbFallback(title,imdbId,type);
  const anime=await jikanFallback(title,type);
  if(anime){
    const a=String(anime.title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const b=String(title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const close=a===b||a.includes(b)||b.includes(a);
    if(close) return {...imdb,...anime,posterUrl:anime.posterUrl||imdb?.posterUrl||null,source:imdb?.posterUrl?"jikan+imdb":"jikan"};
  }
  return imdb;
}
function normalizeEpisode(e){return {id:e.id||null,episodeNumber:e.episode_number||null,seasonNumber:e.season_number||null,name:clean(e.name,180),overview:clean(e.overview,900),airDate:e.air_date||null,stillPath:e.still_path||null,rating:typeof e.vote_average==="number"?e.vote_average:null,voteCount:typeof e.vote_count==="number"?e.vote_count:null,runtime:typeof e.runtime==="number"?e.runtime:null,guestStars:Array.isArray(e.guest_stars)?e.guest_stars.slice(0,8).map(g=>({id:g.id,name:clean(g.name,80),character:clean(g.character,100),profilePath:g.profile_path||null})):[]};}

async function jikan(path, params={}) {
  const u = new URL(`https://api.jikan.moe/v4/${path}`);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k,String(v));
  const r = await fetch(u, { headers: { accept: "application/json" } });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d?.message || `Jikan HTTP ${r.status}`);
  return d;
}
function jikanSearchRows(d) {
  return Array.isArray(d?.data) ? d.data.slice(0,10) : [];
}
function jikanSummary(x) {
  if (!x) return null;
  return {
    mal_id:x.mal_id, title:clean(x.title,180), title_english:clean(x.title_english,180), title_japanese:clean(x.title_japanese,180),
    type:x.type||null, year:x.year||null, episodes:x.episodes||null, score:typeof x.score==='number'?x.score:null,
    scored_by:typeof x.scored_by==='number'?x.scored_by:null, rank:x.rank||null, popularity:x.popularity||null,
    members:x.members||null, favorites:x.favorites||null, synopsis:clean(x.synopsis,1400), background:clean(x.background,800),
    status:clean(x.status,80), duration:clean(x.duration,80), url:x.url||null,
    aired:x.aired||null, images:x.images||{}, genres:Array.isArray(x.genres)?x.genres.map(g=>({mal_id:g.mal_id,name:clean(g.name,60)})):[],
    studios:Array.isArray(x.studios)?x.studios.map(g=>({mal_id:g.mal_id,name:clean(g.name,80)})):[],
    producers:Array.isArray(x.producers)?x.producers.map(g=>({mal_id:g.mal_id,name:clean(g.name,80)})):[]
  };
}
async function jikanFull(malId){ return (await jikan(`anime/${encodeURIComponent(malId)}/full`))?.data || null; }
async function jikanEpisodes(malId){
  let all=[];
  for(let page=1;page<=10;page++){
    const d=await jikan(`anime/${encodeURIComponent(malId)}/episodes`,{page});
    const rows=Array.isArray(d?.data)?d.data:[];
    all.push(...rows);
    if(!d?.pagination?.has_next_page || !rows.length) break;
  }
  return all.map(e=>({mal_id:e.mal_id,episode:e.episode,title:clean(e.title,180),synopsis:clean(e.synopsis,900),aired:e.aired||null,score:typeof e.score==='number'?e.score:null,scored_by:typeof e.scored_by==='number'?e.scored_by:null,images:e.images||{}}));
}
export default async function handler(req,res){
  res.setHeader("access-control-allow-origin","*");
  res.setHeader("cache-control","public,max-age=21600,stale-while-revalidate=604800");
  if(req.method!=="GET") return res.status(405).json({ok:false,error:"Method not allowed"});
  const imdbId=clean(req.query?.imdbId,20).toLowerCase();
  const title=clean(req.query?.title);
  const type=req.query?.type==="movie"?"movie":"tv";
  const action=clean(req.query?.action,30).toLowerCase();

  if(action==='anime'){
    try {
      const q=clean(req.query?.title,180);
      if(!q) return res.status(200).json({ok:true,results:[]});
      const d=await jikan('anime',{q,limit:8,sfw:'true'});
      return res.status(200).json({ok:true,results:jikanSearchRows(d).map(jikanSummary)});
    } catch(e) { return res.status(200).json({ok:false,results:[],error:'Anime metadata unavailable'}); }
  }
  if(action==='anime-full'){
    try { const d=await jikanFull(clean(req.query?.malId,20)); return res.status(200).json({ok:!!d,data:d||null}); }
    catch(e){ return res.status(200).json({ok:false,data:null,error:'Anime details unavailable'}); }
  }
  if(action==='anime-episodes'){
    try { const episodes=await jikanEpisodes(clean(req.query?.malId,20)); return res.status(200).json({ok:true,episodes}); }
    catch(e){ return res.status(200).json({ok:false,episodes:[],error:'Anime episodes unavailable'}); }
  }
  if(action==="season"){
    if(!READ_TOKEN&&!API_KEY) return res.status(200).json({ok:true,source:"fallback",tmdbId:null,seasonNumber:Number(req.query.season),episodes:[]});
    try{
      const id=String(req.query.tmdbId||"").replace(/\D/g,"");
      const s=Number(req.query.season);
      if(!id || !Number.isInteger(s) || s<0) return res.status(200).json({ok:true,source:"fallback",seasonNumber:s,episodes:[]});
      const d=await tmdb(`/tv/${id}/season/${s}`,{language:"en-US"});
      return res.status(200).json({ok:true,source:"tmdb",tmdbId:Number(id),seasonNumber:s,name:clean(d.name),overview:clean(d.overview,700),airDate:d.air_date||null,posterPath:d.poster_path||null,rating:typeof d.vote_average==="number"?d.vote_average:null,voteCount:typeof d.vote_count==="number"?d.vote_count:null,episodeCount:Array.isArray(d.episodes)?d.episodes.length:0,episodes:Array.isArray(d.episodes)?d.episodes.map(normalizeEpisode):[]});
    }catch{return res.status(200).json({ok:true,source:"fallback",seasonNumber:Number(req.query.season),episodes:[]});}
  }
  try{
    let item=null;
    if(req.query?.tmdbId){
      item=await tmdb(`/${type}/${String(req.query.tmdbId).replace(/\D/g,"")}`,{language:"en-US",append_to_response:"credits,external_ids"});
    } else {
      let found=null;
      if(imdbId){
        const f=await tmdb(`/find/${encodeURIComponent(imdbId)}`,{external_source:"imdb_id",language:"en-US"});
        found=type==="movie"?f?.movie_results?.[0]:f?.tv_results?.[0];
      }
      if(!found&&title){
        const f=await tmdb(`/search/${type}`,{query:title,include_adult:"false",language:"en-US",page:1});
        found=f?.results?.[0];
      }
      if(found?.id) item=await tmdb(`/${type}/${found.id}`,{language:"en-US",append_to_response:"credits,external_ids"});
    }
    if(!item) throw new Error("No TMDB match");
    return res.status(200).json(normalize(item,type));
  }catch(e){
    const fb=await fallback(title,imdbId,type);
    if(fb) return res.status(200).json(fb);
    return res.status(200).json({ok:false,source:"none",error:"Metadata unavailable"});
  }
}
