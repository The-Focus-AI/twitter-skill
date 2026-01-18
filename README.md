# Twitter Skill

A Claude Code plugin for full Twitter/X API integration with OAuth 2.0 PKCE authentication.

## Features

- **OAuth 2.0 PKCE Authentication** with 1Password CLI support
- **Tweet Operations**: Post, delete, read tweets and timeline
- **Engagement**: Like, unlike, retweet, unretweet
- **Search**: Search recent tweets
- **List Management**: Create, delete, manage list members
- **Rate Limit Tracking**: Real-time visibility into API limits

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up credentials (supports 1Password or manual entry)
pnpm tsx scripts/twitter.ts setup

# Authenticate with Twitter
pnpm tsx scripts/twitter.ts auth

# Get your profile
pnpm tsx scripts/twitter.ts me
```

## Commands

### Setup & Authentication
```bash
setup                             # Configure API credentials
auth                              # Run OAuth flow
check                             # Verify authentication status
```

### User
```bash
me [--email]                      # Get authenticated user info
user <username>                   # Get user by username
```

### Tweets
```bash
post "text"                       # Post a tweet
delete <id>                       # Delete a tweet
tweet <id>                        # Get a single tweet
tweets                            # Get my recent tweets
timeline                          # Get home timeline
```

### Engagement
```bash
like <id>                         # Like a tweet
unlike <id>                       # Unlike a tweet
retweet <id>                      # Retweet
unretweet <id>                    # Undo retweet
```

### Search
```bash
search "query"                    # Search tweets
```

### Lists
```bash
lists                             # Get my lists
list <id>                         # Get list details
list-members <id>                 # Get members of a list
list-add <list-id> <user-id>      # Add user to list
list-remove <list-id> <user-id>   # Remove user from list
list-create "name" [--private]    # Create a new list
list-delete <id>                  # Delete a list
```

## Rate Limit Tracking

Every API call logs rate limit status:
```
[rate-limit] /users/me: 1199997/1200000, resets in 13m
[rate-limit] /lists/.../members: 2/5 (low), resets in 14m
[rate-limit] /tweets: 0/50 (CRITICAL), resets in 5m
```

## Credential Setup

### Option 1: 1Password (Recommended)

If you have 1Password CLI installed, credentials are loaded from:
- `op://Development/Twitter Client ID/notesPlain`
- `op://Development/Twitter Client Secret/notesPlain`

### Option 2: Manual Configuration

Create `~/.config/twitter-skill/credentials.json`:
```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

## Token Storage

Tokens are stored per-project at `.claude/twitter-skill.local.json`, allowing different projects to use different Twitter accounts.

## As a Claude Code Plugin

Add to your Claude Code plugins to use Twitter from any project:

```bash
# From Claude Code
/twitter post "Hello from Claude Code!"
/twitter timeline
/twitter lists
```

## License

MIT
