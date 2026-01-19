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
  ];

  const response = await twitterRequest<TwitterApiResponse<Tweet[]>>(
    `/users/${me.id}/tweets?tweet.fields=${fields.join(",")}&max_results=10`
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
  ];

  const response = await twitterRequest<SearchTweetsResponse>(
    `/tweets/search/recent?query=${encodeURIComponent(query)}&tweet.fields=${fields.join(",")}&max_results=10`
  );

  return response.data || [];
}

// ============================================================================
// List Commands
// ============================================================================

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

Search:
  search "query"                    Search tweets

Lists:
  lists                             Get my lists
  list <id>                         Get list details
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
