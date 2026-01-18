/**
 * Twitter API v2 Type Definitions
 */

// ============================================================================
// Core Types
// ============================================================================

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  created_at?: string;
  description?: string;
  location?: string;
  profile_image_url?: string;
  protected?: boolean;
  verified?: boolean;
  verified_type?: string;
  url?: string;
  public_metrics?: UserPublicMetrics;
  confirmed_email?: string;
}

export interface UserPublicMetrics {
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count: number;
}

export interface Tweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: ReferencedTweet[];
  public_metrics?: TweetPublicMetrics;
  source?: string;
  lang?: string;
  entities?: TweetEntities;
}

export interface ReferencedTweet {
  type: "retweeted" | "quoted" | "replied_to";
  id: string;
}

export interface TweetPublicMetrics {
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count?: number;
  impression_count?: number;
}

export interface TweetEntities {
  urls?: TweetUrl[];
  mentions?: TweetMention[];
  hashtags?: TweetHashtag[];
  annotations?: TweetAnnotation[];
}

export interface TweetUrl {
  start: number;
  end: number;
  url: string;
  expanded_url: string;
  display_url: string;
}

export interface TweetMention {
  start: number;
  end: number;
  username: string;
  id: string;
}

export interface TweetHashtag {
  start: number;
  end: number;
  tag: string;
}

export interface TweetAnnotation {
  start: number;
  end: number;
  probability: number;
  type: string;
  normalized_text: string;
}

// ============================================================================
// List Types
// ============================================================================

export interface TwitterList {
  id: string;
  name: string;
  owner_id?: string;
  description?: string;
  private?: boolean;
  follower_count?: number;
  member_count?: number;
  created_at?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface TwitterApiResponse<T> {
  data?: T;
  includes?: ResponseIncludes;
  meta?: ResponseMeta;
  errors?: TwitterApiError[];
}

export interface ResponseIncludes {
  users?: TwitterUser[];
  tweets?: Tweet[];
}

export interface ResponseMeta {
  result_count?: number;
  next_token?: string;
  previous_token?: string;
  newest_id?: string;
  oldest_id?: string;
}

export interface TwitterApiError {
  detail?: string;
  title?: string;
  type?: string;
  resource_type?: string;
  parameter?: string;
  value?: string;
  status?: number;
}

// ============================================================================
// Request Types
// ============================================================================

export interface CreateTweetRequest {
  text: string;
  reply?: {
    in_reply_to_tweet_id: string;
  };
  quote_tweet_id?: string;
}

export interface CreateListRequest {
  name: string;
  description?: string;
  private?: boolean;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchTweetsResponse {
  data?: Tweet[];
  includes?: ResponseIncludes;
  meta?: SearchMeta;
}

export interface SearchMeta {
  newest_id?: string;
  oldest_id?: string;
  result_count: number;
  next_token?: string;
}
