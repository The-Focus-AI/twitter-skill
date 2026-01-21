# Twitter/X Articles & Lists Research and Implementation

## Executive Summary

We have researched the capabilities of the Twitter/X API v2 regarding "Articles" (long-form content) and "Lists". Based on these findings, we have updated the `twitter-skill` codebase to support the retrieval of long-form content. List management was already fully implemented.

## Research Findings

### 1. Articles (Long-form Content)

*   **Creation:** There is **no dedicated public API endpoint** for creating "Articles" or "Note Tweets".
    *   To post long-form content (up to 25,000 characters), users with an **X Premium** subscription should simply use the standard `POST /2/tweets` endpoint. The API automatically handles the content as a long post if the user is eligible.
    *   The existing `post "text"` command in our CLI handles this natively.
*   **Retrieval:** Long-form tweets returned by the standard API have their `text` field truncated. The full content is available in a specific `note_tweet` field, which must be explicitly requested via the `tweet.fields` parameter.

### 2. Lists

*   **Capabilities:** The Twitter API v2 fully supports managing Lists, including creation, deletion, adding/removing members, and following lists.
*   **Current Status:** The `twitter-skill` CLI already implements comprehensive List support.

## Implementation Updates

We have updated the `twitter-skill` to correctly handle long-form content retrieval.

### Modified Files

1.  **`scripts/lib/types.ts`**: Added the `note_tweet` interface to the `Tweet` type definition.
    ```typescript
    note_tweet?: {
      text: string;
      entities?: TweetEntities;
    };
    ```

2.  **`scripts/twitter.ts`**: Updated the following commands to request the `note_tweet` field:
    *   `tweet <id>`
    *   `tweets` (get my recent tweets)
    *   `timeline`
    *   `search "query"`

## Usage Guide

### posting Long-Form Content
If your account has X Premium:
```bash
# Simply post a long string (up to 25k chars)
pnpm tsx scripts/twitter.ts post "Your very long text goes here..."
```

### Retrieving Long-Form Content
Use standard commands. If a tweet is a long-form post, the JSON output will now include a `note_tweet` object containing the full text.

```bash
pnpm tsx scripts/twitter.ts tweet <id>
```

**Example Output:**
```json
{
  "success": true,
  "data": {
    "id": "12345...",
    "text": "Beginning of the text... (truncated url)",
    "note_tweet": {
      "text": "Beginning of the text... and here is the rest of the long content that was previously hidden."
    }
  }
}
```

### Managing Lists
The existing commands allow full management of lists:

```bash
# List your lists
pnpm tsx scripts/twitter.ts lists

# Create a new list
pnpm tsx scripts/twitter.ts list-create "Tech News" --description "Latest in tech"

# Add a member
pnpm tsx scripts/twitter.ts list-add <list-id> <user-id>

# Get tweets from a list (Not currently implemented in CLI main switch, but supported by API)
```

*Note: While list management is implemented, a command to `get-list-tweets` (timeline of a list) is currently missing from the CLI `main` switch, though the API supports it (`GET /2/lists/:id/tweets`).*
