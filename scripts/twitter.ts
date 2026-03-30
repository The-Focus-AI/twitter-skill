#!/usr/bin/env npx tsx
/**
 * Twitter CLI - Full Twitter/X API integration
 *
 * Usage:
 *   pnpm tsx scripts/twitter.ts <command> [options]
 *
 * Commands:
 *   auth                          Authenticate with Twitter
 *   check                         Check authentication status
 *   me [--email]                  Get authenticated user info
 *   post "text"                   Post a tweet
 *   delete <id>                   Delete a tweet
 *   tweet <id>                    Get a single tweet
 *   tweets                        Get my recent tweets
 *   timeline                      Get home timeline
 *   like <id>                     Like a tweet
 *   unlike <id>                   Unlike a tweet
 *   retweet <id>                  Retweet
 *   unretweet <id>                Undo retweet
 *   bookmarks                     Get my bookmarked tweets
 *   bookmark <id>                 Bookmark a tweet
 *   unbookmark <id>               Remove a bookmark
 *   bookmarks-archive [path]      Generate HTML archive of bookmarks
 *   search "query"                Search tweets
 *   user <username>               Get user by username
 *   user-id <id>                  Get user by ID
 *   users <id1,id2,...>           Get multiple users by IDs (max 100)
 *   lists                         Get my lists
 *   list <id>                     Get list details
 *   list-members <id>             Get members of a list
 *   list-add <list-id> <user-id>  Add user to list
 *   list-remove <list-id> <user-id> Remove user from list
 *   list-create "name"            Create a new list
 *   list-delete <id>              Delete a list
 */

import {
  performAuth,
  performSetup,
  checkAuth,
  getValidAccessToken,
  getProjectTokenPath,
  getGlobalTokenPath,
  SETUP_INSTRUCTIONS,
} from "./lib/auth.js";
import { output, fail } from "./lib/output.js";
import type {
  TwitterApiResponse,
  TwitterUser,
  Tweet,
  TwitterList,
  SearchTweetsResponse,
  PersonalizedTrend,
  PersonalizedTrendsResponse,
} from "./lib/types.js";

// ============================================================================
// API Client with Rate Limit Tracking
// ============================================================================

const TWITTER_API_BASE = "https://api.twitter.com/2";

interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  resetInSeconds: number;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get("x-rate-limit-limit");
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = headers.get("x-rate-limit-reset");

  if (!limit || !remaining || !reset) {
    return null;
  }

  const resetTimestamp = parseInt(reset, 10) * 1000;
  const resetDate = new Date(resetTimestamp);
  const resetInSeconds = Math.max(0, Math.ceil((resetTimestamp - Date.now()) / 1000));

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    reset: resetDate,
    resetInSeconds,
  };
}

function logRateLimit(endpoint: string, info: RateLimitInfo | null): void {
  if (!info) return;

  const resetTime = info.resetInSeconds > 60
    ? `${Math.ceil(info.resetInSeconds / 60)}m`
    : `${info.resetInSeconds}s`;

  // Color code: green if >50%, yellow if >20%, red if <=20%
  const pct = info.remaining / info.limit;
  let status: string;
  if (pct > 0.5) {
    status = `${info.remaining}/${info.limit}`;
  } else if (pct > 0.2) {
    status = `${info.remaining}/${info.limit} (low)`;
  } else {
    status = `${info.remaining}/${info.limit} (CRITICAL)`;
  }

  console.error(`[rate-limit] ${endpoint}: ${status}, resets in ${resetTime}`);
}

async function twitterRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getValidAccessToken();
  const url = `${TWITTER_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Parse and log rate limit info
  const rateLimitInfo = parseRateLimitHeaders(response.headers);
  const endpointPath = endpoint.split("?")[0]; // Remove query params for cleaner logging
  logRateLimit(endpointPath, rateLimitInfo);

  // Handle 204 No Content (for delete operations)
  if (response.status === 204) {
    return { deleted: true } as T;
  }

  const data = await response.json();

  if (!response.ok) {
    const error = data as { detail?: string; title?: string; errors?: Array<{ message?: string }> };
    let message =
      error.detail ||
      error.title ||
      error.errors?.[0]?.message ||
      `API request failed: ${response.status}`;

    // Add rate limit context for 429 errors
    if (response.status === 429 && rateLimitInfo) {
      message += ` (resets in ${rateLimitInfo.resetInSeconds}s)`;
    }

    throw new Error(message);
  }

  return data as T;
}

// ============================================================================
// User Commands
// ============================================================================

async function getMe(includeEmail: boolean = false): Promise<TwitterUser> {
  const fields = [
    "id",
    "name",
    "username",
    "created_at",
    "description",
    "location",
    "profile_image_url",
    "protected",
    "verified",
    "verified_type",
    "url",
    "public_metrics",
  ];

  if (includeEmail) {
    fields.push("confirmed_email");
  }

  const response = await twitterRequest<TwitterApiResponse<TwitterUser>>(
    `/users/me?user.fields=${fields.join(",")}`
  );

  if (!response.data) {
    throw new Error("Failed to get user info");
  }

  return response.data;
}

async function getUserByUsername(username: string): Promise<TwitterUser> {
  const fields = [
    "id",
    "name",
    "username",
    "created_at",
    "description",
    "location",
    "profile_image_url",
    "protected",
    "verified",
    "verified_type",
    "url",
    "public_metrics",
  ];

  const response = await twitterRequest<TwitterApiResponse<TwitterUser>>(
    `/users/by/username/${username}?user.fields=${fields.join(",")}`
  );

  if (!response.data) {
    throw new Error(`User @${username} not found`);
  }

  return response.data;
}

async function getUserById(userId: string): Promise<TwitterUser> {
  const fields = [
    "id",
    "name",
    "username",
    "created_at",
    "description",
    "location",
    "profile_image_url",
    "protected",
    "verified",
    "verified_type",
    "url",
    "public_metrics",
  ];

  const response = await twitterRequest<TwitterApiResponse<TwitterUser>>(
    `/users/${userId}?user.fields=${fields.join(",")}`
  );

  if (!response.data) {
    throw new Error(`User with ID ${userId} not found`);
  }

  return response.data;
}

async function getUsersByIds(userIds: string[]): Promise<TwitterUser[]> {
  if (userIds.length === 0) return [];
  if (userIds.length > 100) {
    throw new Error("Maximum 100 user IDs per request");
  }

  const fields = [
    "id",
    "name",
    "username",
    "created_at",
    "description",
    "location",
    "profile_image_url",
    "protected",
    "verified",
    "verified_type",
    "url",
    "public_metrics",
  ];

  const response = await twitterRequest<TwitterApiResponse<TwitterUser[]>>(
    `/users?ids=${userIds.join(",")}&user.fields=${fields.join(",")}`
  );

  return response.data || [];
}

// ============================================================================
// Tweet Commands
// ============================================================================

async function postTweet(text: string): Promise<Tweet> {
  const response = await twitterRequest<TwitterApiResponse<Tweet>>("/tweets", {
    method: "POST",
    body: JSON.stringify({ text }),
  });

  if (!response.data) {
    throw new Error("Failed to post tweet");
  }

  return response.data;
}

async function deleteTweet(id: string): Promise<{ deleted: boolean }> {
  return twitterRequest<{ deleted: boolean }>(`/tweets/${id}`, {
    method: "DELETE",
  });
}

async function getTweet(id: string): Promise<Tweet> {
  const fields = [
    "id",
    "text",
    "author_id",
    "created_at",
    "conversation_id",
    "public_metrics",
    "source",
    "lang",
    "entities",
    "referenced_tweets",
    "note_tweet",
    "article",
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet>>(
    `/tweets/${id}?tweet.fields=${fields.join(",")}`
  );

  if (!response.data) {
    throw new Error(`Tweet ${id} not found`);
  }

  return response.data;
}

async function getMyTweets(): Promise<Tweet[]> {
  const me = await getMe();
  const fields = [
    "id",
    "text",
    "created_at",
    "public_metrics",
    "source",
    "note_tweet",
    "article",
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet[]>>(
    `/users/${me.id}/tweets?tweet.fields=${fields.join(",")}&max_results=100`
  );

  return response.data || [];
}

async function getTimeline(): Promise<Tweet[]> {
  const fields = [
    "id",
    "text",
    "author_id",
    "created_at",
    "public_metrics",
    "note_tweet",
    "article",
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet[]>>(
    `/users/me/reverse_chronological_timeline?tweet.fields=${fields.join(",")}&max_results=20`
  );

  return response.data || [];
}

// ============================================================================
// Engagement Commands
// ============================================================================

async function likeTweet(tweetId: string): Promise<{ liked: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { liked: boolean } }>(
    `/users/${me.id}/likes`,
    {
      method: "POST",
      body: JSON.stringify({ tweet_id: tweetId }),
    }
  );

  return { liked: response.data?.liked ?? true };
}

async function unlikeTweet(tweetId: string): Promise<{ liked: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { liked: boolean } }>(
    `/users/${me.id}/likes/${tweetId}`,
    {
      method: "DELETE",
    }
  );

  return { liked: response.data?.liked ?? false };
}

async function retweet(tweetId: string): Promise<{ retweeted: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { retweeted: boolean } }>(
    `/users/${me.id}/retweets`,
    {
      method: "POST",
      body: JSON.stringify({ tweet_id: tweetId }),
    }
  );

  return { retweeted: response.data?.retweeted ?? true };
}

async function unretweet(tweetId: string): Promise<{ retweeted: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { retweeted: boolean } }>(
    `/users/${me.id}/retweets/${tweetId}`,
    {
      method: "DELETE",
    }
  );

  return { retweeted: response.data?.retweeted ?? false };
}

async function getTweetRetweeters(tweetId: string): Promise<TwitterUser[]> {
  const fields = [
    "id",
    "name",
    "username",
    "description",
    "profile_image_url",
    "public_metrics",
    "verified",
  ];

  const response = await twitterRequest<TwitterApiResponse<TwitterUser[]>>(
    `/tweets/${tweetId}/retweeted_by?user.fields=${fields.join(",")}&max_results=100`
  );

  return response.data || [];
}

// ============================================================================
// Bookmark Commands
// ============================================================================

async function bookmarkTweet(tweetId: string): Promise<{ bookmarked: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { bookmarked: boolean } }>(
    `/users/${me.id}/bookmarks`,
    {
      method: "POST",
      body: JSON.stringify({ tweet_id: tweetId }),
    }
  );

  return { bookmarked: response.data?.bookmarked ?? true };
}

async function removeBookmark(tweetId: string): Promise<{ bookmarked: boolean }> {
  const me = await getMe();
  const response = await twitterRequest<{ data: { bookmarked: boolean } }>(
    `/users/${me.id}/bookmarks/${tweetId}`,
    {
      method: "DELETE",
    }
  );

  return { bookmarked: response.data?.bookmarked ?? false };
}

async function getBookmarks(): Promise<{ tweets: Tweet[]; includes?: { media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string; width?: number; height?: number }> } }> {
  const me = await getMe();
  const fields = [
    "id",
    "text",
    "author_id",
    "created_at",
    "public_metrics",
    "note_tweet",
    "article",
    "attachments",
    "entities",
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet[]>>(
    `/users/${me.id}/bookmarks?tweet.fields=${fields.join(",")}&expansions=attachments.media_keys&media.fields=url,preview_image_url,type,width,height,media_key&max_results=100`
  );

  return { tweets: response.data || [], includes: response.includes };
}

// ============================================================================
// Bookmarks Archive Generator
// ============================================================================

async function generateBookmarksArchive(outputPath: string): Promise<string> {
  // Fetch bookmarks with media
  console.error("Fetching bookmarks...");
  const { tweets, includes } = await getBookmarks();

  if (tweets.length === 0) {
    throw new Error("No bookmarks found");
  }

  // Build media lookup
  const mediaMap = new Map<string, { url: string; type: string; width?: number; height?: number }>();
  for (const m of includes?.media || []) {
    const url = m.url || m.preview_image_url;
    if (url) {
      mediaMap.set(m.media_key, { url, type: m.type, width: m.width, height: m.height });
    }
  }

  // Collect unique author IDs and fetch profiles
  const authorIds = [...new Set(tweets.map(t => t.author_id).filter(Boolean))] as string[];
  console.error(`Fetching ${authorIds.length} author profiles...`);
  const authors = await getUsersByIds(authorIds);
  const authorMap: Record<string, { name: string; username: string; pic: string }> = {};
  for (const a of authors) {
    authorMap[a.id] = {
      name: a.name,
      username: a.username,
      pic: (a.profile_image_url || "").replace("_normal", "_400x400"),
    };
  }

  // Attach media to tweets
  interface EnrichedTweet extends Tweet {
    _media: Array<{ url: string; type: string; width?: number; height?: number }>;
  }
  const enriched: EnrichedTweet[] = tweets.map(t => {
    const mediaKeys = (t as any).attachments?.media_keys || [];
    const _media: EnrichedTweet["_media"] = [];
    for (const mk of mediaKeys) {
      const m = mediaMap.get(mk);
      if (m) _media.push(m);
    }
    return { ...t, _media };
  });

  // Generate HTML
  const html = buildArchiveHtml(enriched, authorMap);

  // Write file
  const fs = await import("node:fs");
  const path = await import("node:path");
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, html, "utf-8");

  return resolved;
}

function buildArchiveHtml(
  tweets: Array<Tweet & { _media: Array<{ url: string; type: string; width?: number; height?: number }> }>,
  authors: Record<string, { name: string; username: string; pic: string }>
): string {
  const authorsJson = JSON.stringify(authors).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const tweetsJson = JSON.stringify(tweets).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Twitter Bookmarks Archive</title>
<style>
:root{--bg:#000;--surface:#111;--surface-hover:#181818;--border:#222;--text:#e7e9ea;--text-secondary:#71767b;--accent:#1d9bf0;--like:#f91880;--retweet:#00ba7c}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased}
.header{position:sticky;top:0;z-index:100;background:rgba(0,0,0,.75);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.header-inner{max-width:680px;margin:0 auto;padding:12px 16px}
.header-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.header h1{font-size:20px;font-weight:700}
.header .count{color:var(--text-secondary);font-size:13px}
.search-box{width:100%;background:#202327;border:1px solid transparent;border-radius:9999px;padding:10px 16px;color:var(--text);font-size:15px;outline:none;transition:all .2s}
.search-box:focus{border-color:var(--accent);background:#000}
.search-box::placeholder{color:var(--text-secondary)}
.filters{display:flex;gap:0;margin-top:12px;border-bottom:1px solid var(--border);overflow-x:auto}
.filter-btn{flex:1;min-width:0;background:none;border:none;border-bottom:2px solid transparent;padding:12px 16px;color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap;text-align:center}
.filter-btn:hover{color:var(--text);background:rgba(255,255,255,.03)}
.filter-btn.active{color:var(--text);border-bottom-color:var(--accent)}
.container{max-width:680px;margin:0 auto;padding:0 0 80px}
.date-section{padding:12px 16px;font-size:15px;font-weight:700;color:var(--text);border-bottom:1px solid var(--border);scroll-margin-top:120px;position:sticky;top:105px;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10}
.tweet{border-bottom:1px solid var(--border);padding:12px 16px;transition:background .15s;cursor:pointer}
.tweet:hover{background:var(--surface-hover)}
.tweet-header{display:flex;gap:12px;align-items:flex-start}
.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;object-fit:cover;background:#333}
.tweet-header-right{flex:1;min-width:0}
.author-line{display:flex;align-items:baseline;gap:4px;flex-wrap:wrap}
.author-name{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.author-handle,.tweet-date,.dot{color:var(--text-secondary);font-size:15px}
.tweet-body{margin-top:4px;padding-left:52px}
.tweet-text{font-size:15px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.tweet-text a{color:var(--accent);text-decoration:none}
.tweet-text a:hover{text-decoration:underline}
.tweet-text.collapsed{max-height:200px;overflow:hidden;position:relative}
.tweet-text.collapsed::after{content:"";position:absolute;bottom:0;left:0;right:0;height:60px;background:linear-gradient(transparent,var(--bg));pointer-events:none}
.tweet:hover .tweet-text.collapsed::after{background:linear-gradient(transparent,var(--surface-hover))}
.show-more{color:var(--accent);font-size:14px;cursor:pointer;margin-top:4px;display:inline-block;font-weight:500}
.show-more:hover{text-decoration:underline}
.tweet-media{margin-top:12px;border-radius:16px;overflow:hidden;border:1px solid var(--border)}
.tweet-media img{width:100%;display:block;max-height:500px;object-fit:cover}
.tweet-media.multi{display:grid;grid-template-columns:1fr 1fr;gap:2px}
.tweet-media.multi img{max-height:280px}
.video-badge{position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.7);color:#fff;font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px}
.media-wrapper{position:relative}
.article-card{margin-top:12px;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface)}
.article-card .article-title{padding:12px 16px;font-size:15px;font-weight:700;line-height:1.3}
.article-card .article-preview{padding:0 16px 12px;font-size:14px;color:var(--text-secondary);line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.metrics{display:flex;gap:0;margin-top:12px;max-width:400px;justify-content:space-between}
.metric{display:flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:13px;padding:4px 0;transition:color .15s}
.metric svg{width:18px;height:18px}
.metric.reply:hover{color:var(--accent)}
.metric.rt:hover{color:var(--retweet)}
.metric.like:hover{color:var(--like)}
.metric.view:hover{color:var(--accent)}
.metric.bm:hover{color:var(--accent)}
.no-results{text-align:center;padding:60px 20px;color:var(--text-secondary);font-size:15px}
.toc{position:fixed;right:max(24px,calc((100vw - 680px)/2 - 220px));top:130px;width:180px;font-size:13px}
.toc-title{font-weight:700;margin-bottom:8px;color:var(--text)}
.toc a{display:block;padding:4px 8px;color:var(--text-secondary);text-decoration:none;border-radius:8px;transition:all .15s}
.toc a:hover{color:var(--text);background:var(--surface)}
@media(max-width:1100px){.toc{display:none}}
@media(max-width:600px){.tweet-body{padding-left:0;margin-top:8px}.avatar{width:36px;height:36px}.filter-btn{padding:10px 8px;font-size:13px}}
</style>
</head>
<body>
<div class="header"><div class="header-inner">
<div class="header-top"><h1>Bookmarks</h1><span class="count" id="count"></span></div>
<input type="text" class="search-box" id="search" placeholder="Search bookmarks" autocomplete="off">
<div class="filters" id="filters">
<button class="filter-btn active" data-sort="date-desc">Newest</button>
<button class="filter-btn" data-sort="date-asc">Oldest</button>
<button class="filter-btn" data-sort="likes">Top Liked</button>
<button class="filter-btn" data-sort="impressions">Most Viewed</button>
<button class="filter-btn" data-sort="bookmarks">Most Saved</button>
</div></div></div>
<nav class="toc" id="toc"></nav>
<div class="container" id="feed"></div>
<script>
const AUTHORS=${authorsJson};
const TWEETS=${tweetsJson};
let currentSort='date-desc',searchQuery='';
function fmt(n){if(!n)return'0';if(n>=1e6)return(n/1e6).toFixed(1).replace(/\\.0$/,'')+'M';if(n>=1e3)return(n/1e3).toFixed(1).replace(/\\.0$/,'')+'K';return String(n)}
function fmtDate(iso){const d=new Date(iso),now=new Date(),diff=now-d;if(diff<864e5)return Math.floor(diff/36e5)+'h';if(diff<6048e5)return Math.floor(diff/864e5)+'d';if(d.getFullYear()===now.getFullYear())return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
function monthKey(iso){return new Date(iso).toLocaleDateString('en-US',{year:'numeric',month:'long'})}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function linkify(t){let h=esc(t);h=h.replace(/(https?:\\/\\/[^\\s<]+)/g,'<a href="$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">$1</a>');h=h.replace(/@(\\w+)/g,'<a href="https://twitter.com/$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">@$1</a>');h=h.replace(/#(\\w+)/g,'<a href="https://twitter.com/hashtag/$1" target="_blank" rel="noopener" onclick="event.stopPropagation()">#$1</a>');return h}
function getSorted(tw){const s=[...tw];switch(currentSort){case'date-desc':s.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));break;case'date-asc':s.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));break;case'likes':s.sort((a,b)=>(b.public_metrics?.like_count||0)-(a.public_metrics?.like_count||0));break;case'impressions':s.sort((a,b)=>(b.public_metrics?.impression_count||0)-(a.public_metrics?.impression_count||0));break;case'bookmarks':s.sort((a,b)=>(b.public_metrics?.bookmark_count||0)-(a.public_metrics?.bookmark_count||0));break}return s}
function getFiltered(tw){if(!searchQuery)return tw;const q=searchQuery.toLowerCase();return tw.filter(t=>{const text=(t.note_tweet?.text||t.article?.plain_text||t.text||'').toLowerCase();const a=AUTHORS[t.author_id];const at=a?(a.name+' '+a.username).toLowerCase():'';return text.includes(q)||at.includes(q)})}
function renderTweet(t){const a=AUTHORS[t.author_id]||{name:'Unknown',username:'unknown',pic:''};const fullText=t.note_tweet?.text||t.text||'';const isLong=fullText.length>400;const url='https://twitter.com/'+a.username+'/status/'+t.id;const m=t.public_metrics||{};const media=t._media||[];const article=t.article;let mh='';if(media.length===1){const i=media[0];mh='<div class="tweet-media"><div class="media-wrapper"><img src="'+esc(i.url)+'" alt="" loading="lazy">'+(i.type!=='photo'?'<span class="video-badge">▶ Video</span>':'')+'</div></div>'}else if(media.length>1){mh='<div class="tweet-media multi">'+media.map(i=>'<div class="media-wrapper"><img src="'+esc(i.url)+'" alt="" loading="lazy">'+(i.type!=='photo'?'<span class="video-badge">▶</span>':'')+'</div>').join('')+'</div>'}let ah='';if(article&&!media.length){ah='<div class="article-card">'+(article.title?'<div class="article-title">'+esc(article.title)+'</div>':'')+(article.preview_text?'<div class="article-preview">'+esc(article.preview_text)+'</div>':'')+'</div>'}const sm=isLong?'<span class="show-more" onclick="event.stopPropagation();toggleText(\\''+t.id+'\\')">Show more</span>':'';return'<div class="tweet" onclick="window.open(\\''+url+'\\',\\'_blank\\')"><div class="tweet-header"><img class="avatar" src="'+esc(a.pic)+'" alt="" loading="lazy" onerror="this.style.display=\\'none\\'"><div class="tweet-header-right"><div class="author-line"><span class="author-name">'+esc(a.name)+'</span><span class="author-handle">@'+esc(a.username)+'</span><span class="dot">·</span><span class="tweet-date">'+fmtDate(t.created_at)+'</span></div></div></div><div class="tweet-body"><div class="tweet-text'+(isLong?' collapsed':'')+'" id="text-'+t.id+'">'+linkify(fullText)+'</div>'+sm+mh+ah+'<div class="metrics"><span class="metric reply"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'+fmt(m.reply_count)+'</span><span class="metric rt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'+fmt(m.retweet_count)+'</span><span class="metric like"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'+fmt(m.like_count)+'</span><span class="metric view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'+fmt(m.impression_count)+'</span><span class="metric bm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'+fmt(m.bookmark_count)+'</span></div></div></div>'}
window.toggleText=function(id){const el=document.getElementById('text-'+id);const btn=el.nextElementSibling;if(el.classList.contains('collapsed')){el.classList.remove('collapsed');btn.textContent='Show less'}else{el.classList.add('collapsed');btn.textContent='Show more'}};
function render(){const feed=document.getElementById('feed');const toc=document.getElementById('toc');const filtered=getFiltered(TWEETS);const sorted=getSorted(filtered);document.getElementById('count').textContent=sorted.length+' bookmarks';if(!sorted.length){feed.innerHTML='<div class="no-results">No bookmarks match your search.</div>';toc.innerHTML='';return}let html='',tocHtml='<div class="toc-title">Jump to</div>',lastMonth='';const showDates=currentSort==='date-desc'||currentSort==='date-asc';for(const t of sorted){if(showDates){const mk=monthKey(t.created_at);if(mk!==lastMonth){const sid='section-'+mk.replace(/\\s/g,'-');html+='<div class="date-section" id="'+sid+'">'+mk+'</div>';tocHtml+='<a href="#'+sid+'">'+mk+'</a>';lastMonth=mk}}html+=renderTweet(t)}feed.innerHTML=html;toc.innerHTML=showDates?tocHtml:''}
document.querySelectorAll('.filter-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentSort=btn.dataset.sort;render()})});
document.getElementById('search').addEventListener('input',e=>{searchQuery=e.target.value;render()});
document.addEventListener('keydown',e=>{if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();document.getElementById('search').focus()}if(e.key==='Escape')document.getElementById('search').blur()});
render();
</script></body></html>`;
}

// ============================================================================
// Search Commands
// ============================================================================

async function searchTweets(query: string): Promise<Tweet[]> {
  const fields = [
    "id",
    "text",
    "author_id",
    "created_at",
    "public_metrics",
    "source",
    "note_tweet",
    "article",
  ];

  const response = await twitterRequest<SearchTweetsResponse>(
    `/tweets/search/recent?query=${encodeURIComponent(query)}&tweet.fields=${fields.join(",")}&max_results=100`
  );

  return response.data || [];
}

// ============================================================================
// List Commands
// ============================================================================

async function getListTweets(listId: string): Promise<Tweet[]> {
  const fields = [
    "id",
    "text",
    "author_id",
    "created_at",
    "public_metrics",
    "note_tweet",
    "article",
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet[]>>(
    `/lists/${listId}/tweets?tweet.fields=${fields.join(",")}&max_results=20`
  );

  return response.data || [];
}

async function getMyLists(): Promise<TwitterList[]> {
  const me = await getMe();
  const fields = ["id", "name", "description", "private", "member_count", "follower_count", "owner_id", "created_at"];

  const response = await twitterRequest<TwitterApiResponse<TwitterList[]>>(
    `/users/${me.id}/owned_lists?list.fields=${fields.join(",")}`
  );

  return response.data || [];
}

async function getList(listId: string): Promise<TwitterList> {
  const fields = ["id", "name", "description", "private", "member_count", "follower_count", "owner_id", "created_at"];

  const response = await twitterRequest<TwitterApiResponse<TwitterList>>(
    `/lists/${listId}?list.fields=${fields.join(",")}`
  );

  if (!response.data) {
    throw new Error(`List ${listId} not found`);
  }

  return response.data;
}

async function getListMembers(listId: string): Promise<TwitterUser[]> {
  const fields = ["id", "name", "username", "description", "profile_image_url", "verified"];

  const response = await twitterRequest<TwitterApiResponse<TwitterUser[]>>(
    `/lists/${listId}/members?user.fields=${fields.join(",")}&max_results=100`
  );

  return response.data || [];
}

async function addListMember(listId: string, userId: string): Promise<{ is_member: boolean }> {
  const response = await twitterRequest<{ data: { is_member: boolean } }>(
    `/lists/${listId}/members`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    }
  );

  return { is_member: response.data?.is_member ?? true };
}

async function removeListMember(listId: string, userId: string): Promise<{ is_member: boolean }> {
  const response = await twitterRequest<{ data: { is_member: boolean } }>(
    `/lists/${listId}/members/${userId}`,
    {
      method: "DELETE",
    }
  );

  return { is_member: response.data?.is_member ?? false };
}

async function createList(name: string, description?: string, isPrivate?: boolean): Promise<TwitterList> {
  const body: { name: string; description?: string; private?: boolean } = { name };
  if (description) body.description = description;
  if (isPrivate !== undefined) body.private = isPrivate;

  const response = await twitterRequest<TwitterApiResponse<TwitterList>>("/lists", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.data) {
    throw new Error("Failed to create list");
  }

  return response.data;
}

async function deleteList(listId: string): Promise<{ deleted: boolean }> {
  const response = await twitterRequest<{ data: { deleted: boolean } }>(
    `/lists/${listId}`,
    {
      method: "DELETE",
    }
  );

  return { deleted: response.data?.deleted ?? true };
}

// ============================================================================
// Trends Commands
// ============================================================================

async function getPersonalizedTrends(): Promise<PersonalizedTrend[]> {
  const url = `/users/personalized_trends?personalized_trend.fields=category,post_count,trend_name,trending_since`;

  const response = await twitterRequest<PersonalizedTrendsResponse>(url);

  if (!response.data) {
    throw new Error("No trending data returned");
  }

  // Check for non-premium user response (all "Unknown")
  const looksLikeNonPremium = response.data.length > 0 && 
    response.data.every(t => t.category === "Unknown" && t.post_count === "Unknown");
    
  if (looksLikeNonPremium) {
    console.error("Warning: Received 'Unknown' for trend categories/counts. This endpoint requires X Premium for full data.");
  }

  return response.data;
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.log(`
Twitter CLI - Full Twitter/X API integration

Usage:
  pnpm tsx scripts/twitter.ts <command> [options]

Setup & Authentication:
  setup                             Configure API credentials (1Password or manual)
  auth [--global]                   Run OAuth flow, save tokens
                                    --global: Save to ~/.config/twitter-skill/tokens.json
  check                             Verify authentication status

User:
  me [--email]                      Get authenticated user info
  user <username>                   Get user by username
  user-id <id>                      Get user by ID
  users <id1,id2,...>               Get multiple users by IDs (max 100)

Tweets:
  post "text"                       Post a tweet
  delete <id>                       Delete a tweet
  tweet <id>                        Get a single tweet
  tweets                            Get my recent tweets
  timeline                          Get home timeline

Engagement:
  like <id>                         Like a tweet
  unlike <id>                       Unlike a tweet
  retweet <id>                      Retweet
  unretweet <id>                    Undo retweet
  retweeters <id>                   Get users who retweeted a tweet

Bookmarks:
  bookmarks                         Get my bookmarked tweets
  bookmark <id>                     Bookmark a tweet
  unbookmark <id>                   Remove a bookmark
  bookmarks-archive [path]          Generate navigable HTML archive (default: bookmarks-archive.html)

Search:
  search "query"                    Search tweets

Trends:
  trends                            Get personalized trending topics (requires X Premium)

Lists:
  lists                             Get my lists
  list <id>                         Get list details
  list-tweets <id>                  Get tweets from a list
  list-members <id>                 Get members of a list
  list-add <list-id> <user-id>      Add user to list
  list-remove <list-id> <user-id>   Remove user from list
  list-create "name" [--description "desc"] [--private]
                                    Create a new list
  list-delete <id>                  Delete a list
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  try {
    switch (command) {
      // Authentication
      case "auth": {
        const globalFlag = args.includes("--global");
        await performAuth(globalFlag);
        console.error("\n✓ Authentication complete!");
        const tokenLocation = globalFlag ? getGlobalTokenPath() : getProjectTokenPath();
        output({ authenticated: true, tokenPath: tokenLocation });
        break;
      }

      case "check": {
        const status = await checkAuth();
        output(status);
        break;
      }

      case "setup": {
        await performSetup();
        output({ setup: true });
        break;
      }

      // User
      case "me": {
        const includeEmail = args.includes("--email");
        const user = await getMe(includeEmail);
        output(user);
        break;
      }

      case "user": {
        const username = args[1];
        if (!username) {
          fail("Usage: user <username>");
        }
        const user = await getUserByUsername(username.replace(/^@/, ""));
        output(user);
        break;
      }

      case "user-id": {
        const userId = args[1];
        if (!userId) {
          fail("Usage: user-id <id>");
        }
        const user = await getUserById(userId);
        output(user);
        break;
      }

      case "users": {
        const idsArg = args[1];
        if (!idsArg) {
          fail("Usage: users <id1,id2,...>");
        }
        const userIds = idsArg.split(",").map((id) => id.trim());
        const users = await getUsersByIds(userIds);
        output(users);
        break;
      }

      // Tweets
      case "post": {
        const text = args[1];
        if (!text) {
          fail("Usage: post \"text\"");
        }
        const tweet = await postTweet(text);
        output({
          ...tweet,
          url: `https://twitter.com/i/status/${tweet.id}`,
        });
        break;
      }

      case "delete": {
        const id = args[1];
        if (!id) {
          fail("Usage: delete <id>");
        }
        const result = await deleteTweet(id);
        output(result);
        break;
      }

      case "tweet": {
        const id = args[1];
        if (!id) {
          fail("Usage: tweet <id>");
        }
        const tweet = await getTweet(id);
        output(tweet);
        break;
      }

      case "tweets": {
        const tweets = await getMyTweets();
        output(tweets);
        break;
      }

      case "timeline": {
        const timeline = await getTimeline();
        output(timeline);
        break;
      }

      // Engagement
      case "like": {
        const id = args[1];
        if (!id) {
          fail("Usage: like <id>");
        }
        const result = await likeTweet(id);
        output(result);
        break;
      }

      case "unlike": {
        const id = args[1];
        if (!id) {
          fail("Usage: unlike <id>");
        }
        const result = await unlikeTweet(id);
        output(result);
        break;
      }

      case "retweet": {
        const id = args[1];
        if (!id) {
          fail("Usage: retweet <id>");
        }
        const result = await retweet(id);
        output(result);
        break;
      }

      case "unretweet": {
        const id = args[1];
        if (!id) {
          fail("Usage: unretweet <id>");
        }
        const result = await unretweet(id);
        output(result);
        break;
      }

      case "retweeters": {
        const id = args[1];
        if (!id) {
          fail("Usage: retweeters <id>");
        }
        const users = await getTweetRetweeters(id);
        output(users);
        break;
      }

      // Bookmarks
      case "bookmarks": {
        const result = await getBookmarks();
        output({ tweets: result.tweets, includes: result.includes });
        break;
      }

      case "bookmark": {
        const id = args[1];
        if (!id) {
          fail("Usage: bookmark <id>");
        }
        const result = await bookmarkTweet(id);
        output(result);
        break;
      }

      case "unbookmark": {
        const id = args[1];
        if (!id) {
          fail("Usage: unbookmark <id>");
        }
        const result = await removeBookmark(id);
        output(result);
        break;
      }

      case "bookmarks-archive": {
        const outPath = args[1] || "bookmarks-archive.html";
        const resolved = await generateBookmarksArchive(outPath);
        console.error(`✓ Archive written to ${resolved}`);
        output({ path: resolved, tweets: (await getBookmarks()).tweets.length });
        break;
      }

      // Search
      case "search": {
        const query = args[1];
        if (!query) {
          fail("Usage: search \"query\"");
        }
        const tweets = await searchTweets(query);
        output(tweets);
        break;
      }

      // Trends
      case "trends": {
        const trends = await getPersonalizedTrends();
        output(trends);
        break;
      }

      // Lists
      case "lists": {
        const lists = await getMyLists();
        output(lists);
        break;
      }

      case "list": {
        const id = args[1];
        if (!id) {
          fail("Usage: list <id>");
        }
        const list = await getList(id);
        output(list);
        break;
      }

      case "list-members": {
        const id = args[1];
        if (!id) {
          fail("Usage: list-members <id>");
        }
        const members = await getListMembers(id);
        output(members);
        break;
      }

      case "list-tweets": {
        const id = args[1];
        if (!id) {
          fail("Usage: list-tweets <id>");
        }
        const tweets = await getListTweets(id);
        output(tweets);
        break;
      }

      case "list-add": {
        const listId = args[1];
        const userId = args[2];
        if (!listId || !userId) {
          fail("Usage: list-add <list-id> <user-id>");
        }
        const result = await addListMember(listId, userId);
        output(result);
        break;
      }

      case "list-remove": {
        const listId = args[1];
        const userId = args[2];
        if (!listId || !userId) {
          fail("Usage: list-remove <list-id> <user-id>");
        }
        const result = await removeListMember(listId, userId);
        output(result);
        break;
      }

      case "list-create": {
        const name = args[1];
        if (!name) {
          fail("Usage: list-create \"name\" [--description \"desc\"] [--private]");
        }
        const descIdx = args.indexOf("--description");
        const description = descIdx !== -1 ? args[descIdx + 1] : undefined;
        const isPrivate = args.includes("--private");
        const list = await createList(name, description, isPrivate);
        output(list);
        break;
      }

      case "list-delete": {
        const id = args[1];
        if (!id) {
          fail("Usage: list-delete <id>");
        }
        const result = await deleteList(id);
        output(result);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

// Run
main();
