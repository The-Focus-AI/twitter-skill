---
name: twitter
description: This skill should be used when the user asks to "post a tweet", "read timeline", "check twitter", "like a tweet", "retweet", "search twitter", "manage twitter lists", "twitter auth", "get twitter user", "delete tweet", "trending topics", "what's trending", or mentions Twitter/X integration. Provides full Twitter API v2 access for posting, reading, engagement, and list management.
version: 1.3.0
---

# Twitter/X API Integration

This skill provides full Twitter/X API integration through OAuth 2.0 PKCE authentication. Post tweets, read timelines, engage with content, search, view trends, and manage lists.

## Script Location

The CLI script is located at:

```
${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts
```

Run commands using:

```bash
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts <command> [options]
```

## First-Time Setup

### Quick Start (Using Embedded Credentials)

Just run the auth command - no setup required:

```bash
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts auth
```

A browser will open for Twitter authentication. Authorize the app and you're ready to go.

### Using Your Own Credentials (Optional)

If you prefer to use your own Twitter Developer credentials:

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new project and app
3. In "User authentication settings":
   - App type: "Web App, Automated App or Bot"
   - App permissions: "Read and Write"
   - Callback URI: `http://127.0.0.1:3000/callback` (NOT localhost!)
   - Website URL: `http://127.0.0.1:3000`
4. Copy Client ID and Client Secret
5. Create `~/.config/twitter-skill/credentials.json`:

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

## Token Storage

Tokens are looked up in this order:
1. **Project-local**: `.claude/twitter-skill.local.json` (in current project directory)
2. **Global fallback**: `~/.config/twitter-skill/tokens.json`

This allows different projects to use different Twitter accounts, with a global default for projects without local tokens. Project-local tokens are automatically added to `.gitignore`.

## Available Commands

### Authentication

```bash
# Run OAuth flow (opens browser) - saves token to project-local .claude/
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts auth

# Run OAuth flow and save token globally (for use across all projects)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts auth --global

# Check authentication status
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts check
```

**Response fields:**
- `auth`: Checks token validity and expiration
- `check`: Returns `{ authenticated: boolean, user?: string, expiresAt?: string }`

### User Information

```bash
# Get authenticated user info
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts me

# Get authenticated user info including email
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts me --email

# Get user by username
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts user elonmusk

# Get user by ID
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts user-id 44196397

# Get multiple users by IDs (max 100, comma-separated)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts users "44196397,12,178273"
```

**Response fields for user objects:**
- `id`: User's unique ID
- `name`: Display name
- `username`: @handle (without the @)
- `created_at`: Account creation date
- `description`: Bio text
- `location`: User-provided location
- `profile_image_url`: Avatar URL
- `protected`: Whether tweets are protected
- `verified`: Whether account is verified
- `verified_type`: Type of verification (e.g., "blue", "business", "government")
- `url`: User's website URL
- `public_metrics`: Object containing:
  - `followers_count`: Number of followers
  - `following_count`: Number following
  - `tweet_count`: Total tweets
  - `listed_count`: Times listed

### Posting & Deleting Tweets

```bash
# Post a new tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts post "Hello from Claude Code!"

# Delete a tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts delete 1234567890
```

**Important:** Always confirm with the user before posting tweets.

**Response fields:**
- `post`: Returns `{ id, text, url }` - the `url` is the direct link to the posted tweet
- `delete`: Returns `{ deleted: true }` on success

### Reading Tweets

**Note on Long-Form Content (Articles/Note Tweets):**
The skill automatically requests the `note_tweet` field. If a tweet contains long-form content (up to 25k chars), the full text will be returned in the `note_tweet` object within the response.

```bash
# Get specific tweet by ID
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts tweet 1234567890

# Get my recent tweets (last 10)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts tweets

# Get home timeline (last 20 tweets from followed accounts)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts timeline
```

**Response fields for tweet objects:**
- `id`: Tweet's unique ID
- `text`: Tweet content (up to 280 chars, or check `note_tweet` for long-form)
- `author_id`: User ID of the author
- `created_at`: When the tweet was posted
- `conversation_id`: Thread ID (same as first tweet in thread)
- `source`: App used to post (e.g., "Twitter Web App")
- `lang`: Detected language code
- `public_metrics`: Object containing:
  - `retweet_count`: Number of retweets
  - `reply_count`: Number of replies
  - `like_count`: Number of likes
  - `quote_count`: Number of quote tweets
  - `bookmark_count`: Number of bookmarks
  - `impression_count`: View count
- `entities`: Object containing parsed URLs, mentions, hashtags
- `referenced_tweets`: Array of `{ type, id }` for retweets, quotes, replies
- `note_tweet`: Object with `{ text, entities }` for long-form content

### Engagement

```bash
# Like a tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts like 1234567890

# Unlike a tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts unlike 1234567890

# Retweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts retweet 1234567890

# Undo retweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts unretweet 1234567890

# Get users who retweeted a tweet (up to 100)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts retweeters 1234567890
```

**Response fields:**
- `like/unlike`: Returns `{ liked: boolean }`
- `retweet/unretweet`: Returns `{ retweeted: boolean }`
- `retweeters`: Returns array of user objects (see User Information section)

### Search

```bash
# Search recent tweets (last 7 days)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts search "claude ai"
```

**Response:** Returns array of tweet objects (see Reading Tweets section). Search queries support Twitter's search operators:
- `from:username` - Tweets from a specific user
- `to:username` - Replies to a specific user
- `#hashtag` - Tweets with hashtag
- `"exact phrase"` - Exact phrase match
- `-word` - Exclude word
- `lang:en` - Filter by language

### Trends

```bash
# Get personalized trending topics
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts trends
```

**Note:** This endpoint requires X Premium subscription for full data. Non-premium users may receive "Unknown" for category and post_count fields.

**Response fields for trend objects:**
- `trend_name`: The trending topic or hashtag
- `category`: Topic category (e.g., "Sports", "Entertainment", "Technology")
- `post_count`: Approximate number of posts (e.g., "10K", "100K+")
- `trending_since`: When the topic started trending

### List Management

```bash
# Get my lists
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts lists

# Get list details
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list 1234567890

# Get tweets from a list (last 20)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-tweets 1234567890

# Get list members (up to 100)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-members 1234567890

# Add user to list
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-add <list-id> <user-id>

# Remove user from list
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-remove <list-id> <user-id>

# Create a new list
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-create "My List" --description "Description" --private

# Delete a list
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list-delete 1234567890
```

**Response fields for list objects:**
- `id`: List's unique ID
- `name`: List name
- `description`: List description
- `private`: Whether the list is private
- `owner_id`: User ID of list owner
- `member_count`: Number of members
- `follower_count`: Number of followers
- `created_at`: When the list was created

**Response fields for operations:**
- `list-add`: Returns `{ is_member: true }` on success
- `list-remove`: Returns `{ is_member: false }` on success
- `list-delete`: Returns `{ deleted: true }` on success

## Response Format

All commands output JSON with a consistent structure:

```json
{
  "success": true,
  "data": {
    // Response data here
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Rate Limit Information

The CLI outputs rate limit info to stderr after each request:
```
[rate-limit] /users/me: 75/75, resets in 15m
```

Status indicators:
- Normal: `X/Y` - plenty of requests remaining
- Low: `X/Y (low)` - less than 50% remaining
- Critical: `X/Y (CRITICAL)` - less than 20% remaining

## Common Workflows

### Post a Tweet

1. Confirm the tweet text with the user
2. Run: `post "Tweet text"`
3. Return the tweet URL to the user

### Check Notifications/Mentions

1. Get the timeline: `timeline`
2. Filter for mentions or important accounts
3. Summarize for the user

### See What's Trending

1. Get trends: `trends`
2. Present the top trending topics
3. Search for tweets on interesting trends: `search "#trending_topic"`

### Manage Lists

1. List existing lists: `lists`
2. Get members: `list-members <id>`
3. Add/remove members as needed

### Research a Topic

1. Search for tweets: `search "topic"`
2. Get specific tweets for more detail: `tweet <id>`
3. Get user info for context: `user <username>`

### Analyze Tweet Engagement

1. Get the tweet: `tweet <id>`
2. Check public_metrics for engagement stats
3. Get retweeters: `retweeters <id>` to see who shared it

## API Rate Limits

Twitter API v2 has rate limits. The most common:
- Tweets lookup: 300 requests per 15 minutes
- Post tweet: 200 tweets per 24 hours
- Like/Unlike: 50 per 24 hours
- Search: 180 requests per 15 minutes
- Trends: 75 requests per 15 minutes

The skill will return rate limit errors when exceeded.

## Troubleshooting

### "Something went wrong" during auth
- Ensure callback URL is `http://127.0.0.1:3000/callback` (NOT localhost)
- Check that port 3000 is not in use

### Token expires quickly
- The skill automatically refreshes tokens before expiry
- If issues persist, run `auth` again

### "Not authorized" errors
- Check that your app has the required permissions
- Run `auth` to re-authenticate with updated scopes

### Rate limit exceeded
- Wait for the rate limit window to reset (usually 15 minutes)
- Space out requests when doing bulk operations

### Trends showing "Unknown" values
- This endpoint requires X Premium subscription for full data
- Non-premium accounts will see trend names but not categories or post counts
