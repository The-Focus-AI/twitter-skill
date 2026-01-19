---
name: twitter
description: This skill should be used when the user asks to "post a tweet", "read timeline", "check twitter", "like a tweet", "retweet", "search twitter", "manage twitter lists", "twitter auth", "get twitter user", "delete tweet", or mentions Twitter/X integration. Provides full Twitter API v2 access for posting, reading, engagement, and list management.
version: 1.0.0
---

# Twitter/X API Integration

This skill provides full Twitter/X API integration through OAuth 2.0 PKCE authentication. Post tweets, read timelines, engage with content, search, and manage lists.

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

Tokens are stored per-project at `.claude/twitter-skill.local.json`. This allows different projects to use different Twitter accounts. The file is automatically added to `.gitignore`.

## Available Commands

### Authentication

```bash
# Run OAuth flow (opens browser)
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts auth

# Check authentication status
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts check
```

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

### Posting & Deleting Tweets

```bash
# Post a new tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts post "Hello from Claude Code!"

# Delete a tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts delete 1234567890
```

**Important:** Always confirm with the user before posting tweets.

### Reading Tweets

```bash
# Get a specific tweet
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts tweet 1234567890

# Get my recent tweets
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts tweets

# Get home timeline
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts timeline
```

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
```

### Search

```bash
# Search recent tweets
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts search "claude ai"
```

### List Management

```bash
# Get my lists
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts lists

# Get list details
pnpm tsx ${CLAUDE_PLUGIN_ROOT}/scripts/twitter.ts list 1234567890

# Get list members
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

## Common Workflows

### Post a Tweet

1. Confirm the tweet text with the user
2. Run: `post "Tweet text"`
3. Return the tweet URL to the user

### Check Notifications/Mentions

1. Get the timeline: `timeline`
2. Filter for mentions or important accounts
3. Summarize for the user

### Manage Lists

1. List existing lists: `lists`
2. Get members: `list-members <id>`
3. Add/remove members as needed

### Research a Topic

1. Search for tweets: `search "topic"`
2. Get specific tweets for more detail: `tweet <id>`
3. Get user info for context: `user <username>`

## API Rate Limits

Twitter API v2 has rate limits. The most common:
- Tweets lookup: 300 requests per 15 minutes
- Post tweet: 200 tweets per 24 hours
- Like/Unlike: 50 per 24 hours
- Search: 180 requests per 15 minutes

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
