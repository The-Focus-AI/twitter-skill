---
title: "Twitter API Trending: Personalized Trends Endpoint Implementation"
date: 2026-01-20
topic: twitter-api-trending
recommendation: X API v2 Personalized Trends Endpoint
version_researched: Twitter API v2 (2024-2026)
use_when:
  - You need personalized trending topics for authenticated users
  - The authenticated user has an X Premium subscription
  - You want to leverage existing OAuth 2.0 PKCE authentication
  - You need trends tailored to user interests and location
avoid_when:
  - The target user base doesn't have X Premium subscriptions
  - You need location-based trends without personalization
  - You require anonymous/unauthorized access to trends
  - You need historical trending data beyond current trends
project_context:
  language: TypeScript
  relevant_dependencies: 
    - OAuth 2.0 PKCE authentication (already implemented)
    - Twitter API v2 client (twitter-skill)
    - Fetch API for HTTP requests
---

## Summary

This report evaluates and recommends the **X API v2 Personalized Trends endpoint** (`GET /2/users/personalized_trends`) as the primary solution for adding trending topics functionality to the twitter-feed repository[1][2]. The repository already uses OAuth 2.0 Authorization Code Flow with PKCE, which is the required authentication method for this endpoint[3]. The endpoint returns trends personalized to the authenticated user's interests, location, and activity, providing a more relevant experience than generic location-based trends[4].

**Key Finding:** The Personalized Trends endpoint requires the authenticated user to have an **X Premium subscription**. Non-premium users will receive a response with "Unknown" values for categories and post counts, effectively making the feature non-functional for those users[2].

The implementation is straightforward due to existing authentication infrastructure. No additional dependencies are required, and the endpoint integrates seamlessly with the current `twitter-skill` TypeScript codebase. Rate limits are generous (part of standard user context limits), and caching is recommended to minimize API calls[1].

**Alternative Considered:** The legacy v1.1 `trends/place.json` endpoint provides location-based trends using WOEID (Where On Earth ID) but requires OAuth 1.0a or App-only authentication, which would conflict with the existing PKCE implementation[5].

## Philosophy & Mental Model

The Personalized Trends endpoint reflects X's (Twitter's) shift toward personalized, user-centric data over generic, location-based aggregation[1][4]. The API leverages the authenticated user's:

- **Interest profile**: Based on accounts followed and content engaged with
- **Geographic context**: User's location settings and trending topics in their region  
- **Temporal patterns**: Recent activity and trending topics that have emerged recently

The mental model for developers should be: **"What's trending for this specific user?"** rather than "What's trending globally?" This personalization approach aligns with modern social media platforms' emphasis on relevance and engagement over raw volume metrics[1].

The endpoint returns an array of trend objects, each containing metadata about trending topics. Unlike search-based trend detection, this endpoint provides X's curated list of personalized trends, ensuring quality and relevance[2]. The API handles the complexity of trend calculation, including spam filtering, relevance scoring, and temporal analysis.

## Setup

The Personalized Trends endpoint requires no additional setup beyond what's already configured in the twitter-skill. The existing OAuth 2.0 PKCE authentication provides the necessary user context.

### Authentication Verification

Ensure the current authentication includes these scopes:
- `tweet.read` (already included)
- `users.read` (already included)

No new scopes are required. The endpoint uses the same Bearer token authentication already implemented.

### Type Definitions

Add the following TypeScript interfaces to `scripts/lib/types.ts`:

```typescript
// Add to existing types.ts file

export interface PersonalizedTrend {
  trend_name: string;
  category?: string;
  post_count?: string;
  trending_since?: string;
}

export interface PersonalizedTrendsResponse {
  data: PersonalizedTrend[];
  errors?: TwitterApiError[];
}
```

### API Endpoint Constants

The endpoint uses the existing `TWITTER_API_BASE` constant (`https://api.twitter.com/2`):

```typescript
const TRENDS_ENDPOINT = "/users/personalized_trends";
```

## Core Usage Patterns

### Pattern 1: Basic Trending Topics Fetch

The simplest implementation retrieves all available trend fields for the authenticated user.

```typescript
async function getPersonalizedTrends(): Promise<PersonalizedTrend[]> {
  const token = await getValidAccessToken();
  const url = `${TWITTER_API_BASE}/users/personalized_trends?personalized_trend.fields=category,post_count,trend_name,trending_since`;

  const response = await twitterRequest<PersonalizedTrendsResponse>(url);

  if (!response.data) {
    throw new Error("No trending data returned");
  }

  return response.data;
}
```

This pattern integrates with the existing `twitterRequest` helper function which already handles:
- Bearer token authentication
- Rate limit tracking
- Error handling
- JSON parsing

### Pattern 2: Filtered Fields for Specific Use Cases

When you only need specific trend metadata, you can request fewer fields to reduce response size:

```typescript
async function getTrendNamesOnly(): Promise<string[]> {
  const token = await getValidAccessToken();
  const url = `${TWITTER_API_BASE}/users/personalized_trends?personalized_trend.fields=trend_name`;

  const response = await twitterRequest<PersonalizedTrendsResponse>(url);
  
  return response.data?.map(trend => trend.trend_name) || [];
}
```

This is useful for lightweight operations where post counts and categories aren't needed.

### Pattern 3: With Premium Status Validation

Implement premium subscription validation to provide clear error messages:

```typescript
async function getPersonalizedTrendsWithValidation(): Promise<PersonalizedTrend[]> {
  const trends = await getPersonalizedTrends();
  
  // Check if user has premium by looking for "Unknown" values
  const hasPremium = trends.every(trend => 
    trend.category !== "Unknown" && trend.post_count !== "Unknown"
  );

  if (!hasPremium && trends.length > 0) {
    throw new Error(
      "Personalized trends require an X Premium subscription. " +
      "Non-premium users receive limited data. " +
      "Please upgrade your X account or use alternative trend sources."
    );
  }

  return trends;
}
```

This pattern helps developers build user-friendly applications that clearly communicate subscription requirements.

### Pattern 4: CLI Command Integration

Add a `trends` command to the twitter.ts CLI script:

```typescript
// Add to main() function switch statement

case "trends": {
  const trends = await getPersonalizedTrends();
  output(trends);
  break;
}
```

This enables command-line access:
```bash
cd ~/.claude/plugins/cache/focus-marketplace/twitter-skill/1.1.1 && \
  npx tsx scripts/twitter.ts trends
```

### Pattern 5: Caching for Rate Limit Efficiency

Implement caching to reduce API calls, as trends don't change rapidly:

```typescript
interface CachedTrends {
  data: PersonalizedTrend[];
  cached_at: number;
  expires_at: number;
}

const TRENDS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let trendsCache: CachedTrends | null = null;

async function getCachedTrends(): Promise<PersonalizedTrend[]> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (trendsCache && now < trendsCache.expires_at) {
    return trendsCache.data;
  }

  // Fetch fresh data
  const trends = await getPersonalizedTrends();
  trendsCache = {
    data: trends,
    cached_at: now,
    expires_at: now + TRENDS_CACHE_TTL,
  };

  return trends;
}
```

This pattern respects rate limits and improves response times for repeated requests.

## Anti-Patterns & Pitfalls

### Don't: Assume All Users Have Premium Access

**Why it's wrong:** The Personalized Trends endpoint returns "Unknown" values for non-premium users, but the API still returns HTTP 200. Without explicit validation, applications may display empty or meaningless data to users.

```typescript
// ❌ BAD: No validation
async function getTrends() {
  const response = await twitterRequest<PersonalizedTrendsResponse>(
    "/users/personalized_trends"
  );
  return response.data; // May contain "Unknown" values!
}
```

### Instead: Validate Premium Status

```typescript
// ✅ GOOD: Check for premium subscription
async function getTrends() {
  const trends = await getPersonalizedTrends();
  
  if (trends.length > 0 && trends[0].category === "Unknown") {
    throw new Error("X Premium subscription required");
  }
  
  return trends;
}
```

### Don't: Make Frequent Uncached Requests

**Why it's wrong:** Trending topics don't change rapidly. Making requests every few seconds wastes rate limit quota and doesn't provide additional value.

```typescript
// ❌ BAD: No caching
async function pollTrends() {
  setInterval(async () => {
    const trends = await getPersonalizedTrends(); // Wastes API calls!
    updateUI(trends);
  }, 5000);
}
```

### Instead: Cache with Appropriate TTL

```typescript
// ✅ GOOD: Cache with 15-minute TTL
const CACHE_TTL = 15 * 60 * 1000;
let cachedTrends: PersonalizedTrend[] | null = null;
let cacheExpiry = 0;

async function getTrendsWithCache() {
  if (Date.now() < cacheExpiry && cachedTrends) {
    return cachedTrends;
  }
  
  cachedTrends = await getPersonalizedTrends();
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedTrends;
}
```

### Don't: Ignore the Category Field

**Why it's wrong:** The category field provides valuable context for filtering or organizing trends by topic (e.g., "Technology", "Sports", "Entertainment"). Ignoring it misses an opportunity for better UX.

```typescript
// ❌ BAD: Only using trend names
function displayTrends(trends: PersonalizedTrend[]) {
  trends.forEach(trend => {
    console.log(trend.trend_name); // Lost category information
  });
}
```

### Instead: Utilize All Available Fields

```typescript
// ✅ GOOD: Use category for organization
function displayTrends(trends: PersonalizedTrend[]) {
  const byCategory = trends.reduce((acc, trend) => {
    const category = trend.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(trend);
    return acc;
  }, {} as Record<string, PersonalizedTrend[]>);

  Object.entries(byCategory).forEach(([category, categoryTrends]) => {
    console.log(`\n${category}:`);
    categoryTrends.forEach(trend => {
      console.log(`  • ${trend.trend_name} (${trend.post_count || 'N/A'})`);
    });
  });
}
```

### Don't: Mix Authentication Methods

**Why it's wrong:** The Personalized Trends endpoint requires OAuth 2.0 User Context. Using App-only Bearer tokens (which work for search endpoints) will fail with 401 Unauthorized.

```typescript
// ❌ BAD: Using app-only token
const appOnlyToken = "your_app_only_bearer_token";
fetch("/users/personalized_trends", {
  headers: { Authorization: `Bearer ${appOnlyToken}` }
}); // ❌ Returns 401 - requires user context
```

### Instead: Use User Context Authentication

```typescript
// ✅ GOOD: Use existing PKCE user context
const userToken = await getValidAccessToken(); // Already implemented
fetch("/users/personalized_trends", {
  headers: { Authorization: `Bearer ${userToken}` }
}); // ✅ Works - user context token
```

## Why This Choice

The Personalized Trends endpoint is the optimal choice for this repository because it aligns perfectly with the existing architecture and provides the most relevant data for users.

### Decision Criteria

| Criterion | Weight | How Personalized Trends Scored |
|-----------|--------|-------------------------------|
| **Architectural Consistency** | High | Perfect - uses existing OAuth 2.0 PKCE infrastructure, no auth changes needed |
| **Data Relevance** | High | Excellent - personalized to user interests and location, more relevant than generic trends |
| **Implementation Effort** | Medium | Low - minimal code changes, reuses existing request infrastructure |
| **API Stability** | Medium | Good - official v2 endpoint, actively maintained |
| **Subscription Requirement** | Medium | Limitation - requires X Premium, but clear error handling available |
| **Rate Limits** | Low | Excellent - generous limits as part of standard user context quotas |
| **Documentation Quality** | Low | Good - official X documentation available with examples |

### Key Factors

- **Zero Authentication Changes Required**: The repository already implements OAuth 2.0 PKCE with user context, which is exactly what the Personalized Trends endpoint requires. No additional authentication setup is needed[3].

- **Perfect Integration with Existing Code**: The endpoint uses the same `twitterRequest` helper function pattern already established in the codebase. Adding trending functionality is a matter of adding a single function and CLI command[6].

- **Personalized Data Superior to Generic**: Location-based trends (v1.1) provide generic data that may not be relevant to a user's interests. Personalized trends combine location, interests, and activity for more meaningful results[1][4].

- **Future-Proof API Version**: The Personalized Trends endpoint is part of API v2, which X is actively developing and maintaining. The v1.1 location-based trends are legacy and may be deprecated in the future[5].

## Alternatives Considered

### Legacy v1.1 Location-Based Trends (`GET /1.1/trends/place.json`)

**What it is:** A legacy Twitter API endpoint that returns trends for a specific geographic location using WOEID (Where On Earth ID) identifiers[5].

**Why not chosen:** 
- Requires OAuth 1.0a or App-only Bearer authentication, which conflicts with the existing OAuth 2.0 PKCE implementation
- Provides generic location-based trends rather than personalized data
- Part of deprecated v1.1 API, may not be maintained long-term
- Requires WOEID lookup tables for location mapping
- Less relevant to individual users compared to personalized trends

**Choose this instead when:**
- You need trends for a specific geographic location regardless of user context
- You're building a location-based analytics tool
- You don't have user authentication and want anonymous trend access
- You specifically need trends for non-premium users (though quality is limited)

**Key tradeoff:** Generic location data vs. personalized relevance. Gain geographic control, lose personalization and architectural consistency.

### Third-Party Trend Aggregation Services (twitterapi.io, twexapi.io)

**What it is:** Third-party API services that aggregate Twitter/X trend data, often providing endpoints that don't require X Premium subscriptions[7][8].

**Why not chosen:**
- Adds external dependency and potential service reliability risks
- May violate X's Terms of Service depending on data source
- Data quality and freshness may be inferior to official API
- Additional API keys and authentication to manage
- Not officially supported or documented by X

**Choose this instead when:**
- X Premium subscription requirement is a hard blocker
- You need trend data for multiple accounts without individual authentication
- You're building a research/analytics tool that doesn't need real-time accuracy
- You want to avoid X API rate limits entirely

**Key tradeoff:** Service reliability and ToS compliance vs. avoiding subscription requirements. Gain broader access, lose official support and data quality guarantees.

### Manual Trend Detection via Search API

**What it is:** Using the Search API (`GET /2/tweets/search/recent`) to track keyword/hashtag volumes over time to identify trending topics manually[9].

**Why not chosen:**
- Extremely rate-limited (60 requests per 15 minutes vs. unlimited trends)
- Requires complex logic for trend calculation, spam filtering, and relevance scoring
- Only provides last 7 days of data
- Computationally expensive - need to aggregate many search results
- Doesn't leverage X's existing trend algorithms

**Choose this instead when:**
- You need to detect trends for very specific niche topics not covered by standard trends
- You want full control over trend calculation algorithms
- You're researching historical trend patterns
- You need trends that X doesn't surface in their curated list

**Key tradeoff:** Complete control and flexibility vs. implementation complexity and rate limits. Gain customization, lose simplicity and API efficiency.

## Caveats & Limitations

- **X Premium Subscription Required**: This is the most significant limitation. The Personalized Trends endpoint only returns meaningful data (categories, post counts) for users with X Premium subscriptions. Non-premium users receive responses with "Unknown" values, making the feature effectively non-functional for those users[2]. Applications must clearly communicate this requirement or implement fallback mechanisms.

- **User-Specific Data Only**: The endpoint returns trends personalized to the authenticated user's account. It cannot be used to fetch trends for other users or to get generic "global" trends. If you need trends for multiple users or geographic regions, you'll need to authenticate each user separately or use alternative endpoints[1].

- **No Historical Data**: The endpoint only returns current trending topics. There's no API endpoint to retrieve historical trending data or trends from past dates. For trend analysis over time, you'd need to store trends periodically or use alternative data sources[1].

- **Limited Customization**: Unlike search-based trend detection, you cannot filter or customize which trends are returned. X's algorithm determines relevance, and there are no parameters to adjust the personalization algorithm or request trends from specific categories[2].

- **Potential Service Disruption**: As with any third-party API, X could deprecate, modify, or restrict access to the Personalized Trends endpoint. The premium requirement itself represents a significant access restriction that could impact user base eligibility[1].

- **Regional Availability**: Some trending features may have regional restrictions or differences based on the user's location settings. Users in certain countries may receive different or limited trend data compared to others[4].

## References

[1] [X API v2: Personalized Trends Introduction](https://docs.x.com/x-api/trends/personalized-trends/introduction) - Official X documentation explaining the Personalized Trends feature, authentication requirements, and use cases.

[2] [X API v2: Get Personalized Trends API Reference](https://docs.x.com/x-api/trends/get-personalized-trends) - Complete API reference including endpoint URL, required fields, query parameters, response format, and premium subscription requirements.

[3] [X API: OAuth 2.0 Authorization Code Flow with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) - Official documentation for OAuth 2.0 PKCE authentication, which is the method already implemented in the twitter-skill repository.

[4] [X API v2: Personalized Trends Overview](https://docs.x.com/x-api/trends/personalized-trends/introduction) - Detailed explanation of how personalized trends differ from location-based trends and how the personalization algorithm works.

[5] [X API v1.1: Trends for Location Overview](https://developer.x.com/en/docs/x-api/v1/trends/trends-for-location/overview) - Documentation for the legacy v1.1 location-based trends endpoint, including WOEID requirements and endpoint specifications.

[6] Twitter Skill Repository Codebase - Analysis of existing `twitter-skill/1.1.1/scripts/twitter.ts` implementation showing OAuth 2.0 PKCE integration, `twitterRequest` helper function, and CLI command structure.

[7] [TwitterAPI.io Documentation](https://docs.twitterapi.io/api-reference/endpoint/get_trends) - Third-party API service providing Twitter trend data without premium requirements, used as an alternative option evaluated.

[8] [TwitterXAPI Documentation](https://docs.twitterxapi.com/api-reference/trending-endpoints/get-trending-topics) - Alternative third-party trending topics endpoint documentation, evaluated as a non-official solution.

[9] [X API v2: Search Tweets API Reference](https://developer.x.com/en/docs/twitter-api/tweets/search/api-reference) - Documentation for the Search API endpoint, evaluated as a method for manual trend detection through keyword/hashtag volume tracking.
