// Hand-written Supabase database types for SubShare.
// These mirror supabase/migrations exactly. (Regenerate later with the
// Supabase CLI if you change the schema: `supabase gen types typescript`.)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// ---------- Enums ----------
export type Platform = 'youtube' | 'instagram' | 'github' | 'spotify' | 'x' | 'tiktok' | 'other'
export type Visibility = 'public' | 'private' | 'selected'
export type FollowStatus = 'pending' | 'accepted'
export type ActivityType = 'item_added' | 'collection_created' | 'platform_connected' | 'followed_account'
export type NotificationType =
  | 'new_follower'
  | 'follow_request'
  | 'request_accepted'
  | 'new_collection'
  | 'new_item_from_followed_user'
  | 'new_item_in_followed_collection'

// ---------- Row types ----------
export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_private: boolean
  onboarded: boolean
  created_at: string
  updated_at: string
}

export type ProfileInsert = {
  id: string
  username: string
  display_name: string
  avatar_url?: string | null
  bio?: string | null
  is_private?: boolean
  onboarded?: boolean
}

export type ProfileUpdate = Partial<ProfileInsert>

export type Follow = {
  follower_id: string
  following_id: string
  status: FollowStatus
  created_at: string
}

export type FollowInsert = Pick<Follow, 'follower_id' | 'following_id'> & { status?: FollowStatus }
export type FollowUpdate = Partial<Pick<Follow, 'status'>>

export type Collection = {
  id: string
  owner_id: string
  title: string
  description: string | null
  visibility: Visibility
  activity_enabled: boolean
  created_at: string
  updated_at: string
}

export type CollectionInsert = Pick<
  Collection,
  'owner_id' | 'title'
> & {
  description?: string | null
  visibility?: Visibility
  activity_enabled?: boolean
}

export type CollectionUpdate = Partial<Omit<CollectionInsert, 'owner_id'>>

export type CollectionShare = {
  collection_id: string
  user_id: string
  created_at: string
}

export type CollectionItem = {
  id: string
  collection_id: string
  platform: Platform
  external_id: string | null
  name: string
  avatar_url: string | null
  url: string
  added_at: string
}

export type CollectionItemInsert = Pick<CollectionItem, 'collection_id' | 'name' | 'url'> & {
  platform?: Platform
  external_id?: string | null
  avatar_url?: string | null
}

export type CollectionFollower = {
  collection_id: string
  user_id: string
  created_at: string
}

export type Activity = {
  id: string
  actor_id: string
  type: ActivityType
  collection_id: string | null
  item_id: string | null
  metadata: Json
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  type: NotificationType
  actor_id: string | null
  payload: Json
  is_read: boolean
  created_at: string
}

export type NotificationSettings = {
  user_id: string
  new_follower: boolean
  follow_request: boolean
  request_accepted: boolean
  new_collection: boolean
  new_item_from_followed_user: boolean
  new_item_in_followed_collection: boolean
}

export type PlatformConnection = {
  id: string
  user_id: string
  platform: Platform
  external_account_id: string | null
  external_username: string | null
  access_token: string // AES-GCM encrypted at rest; never sent to clients
  refresh_token: string | null
  token_expires_at: string | null
  scopes: string[]
  status: 'connected' | 'expired' | 'revoked' | 'error'
  last_synced_at: string | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export type PlatformImport = {
  id: string
  user_id: string
  platform: Platform
  external_id: string | null
  name: string
  avatar_url: string | null
  url: string
  status: 'pending' | 'imported' | 'dismissed'
  imported_item_id: string | null
  discovered_at: string
}

// ---------- RPC row types ----------
/** Sanitized connection shape returned by the list_my_connections RPC (no tokens). */
export type PlatformConnectionRow = {
  id: string
  platform: Platform
  status: PlatformConnection['status']
  external_account_id: string | null
  external_username: string | null
  last_synced_at: string | null
  last_sync_error: string | null
  created_at: string
}
export type FeedRow = {
  id: string
  actor_id: string
  type: ActivityType
  collection_id: string | null
  item_id: string | null
  metadata: Json
  created_at: string
  actor_username: string
  actor_display_name: string
  actor_avatar_url: string | null
  collection_title: string | null
  item_name: string | null
  item_platform: Platform | null
  item_url: string | null
}

export type SearchUserRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_private: boolean
  follow_status: FollowStatus | null
  follows_me: boolean
}

export type SearchCollectionRow = {
  id: string
  owner_id: string
  title: string
  description: string | null
  visibility: Visibility
  created_at: string
  owner_username: string
  owner_display_name: string
  owner_avatar_url: string | null
  item_count: number
  is_following: boolean
}

export type PopularItemRow = {
  platform: Platform
  external_id: string | null
  name: string
  avatar_url: string | null
  url: string
  shared_count: number
  sample_collection_id: string
}

export type SuggestedPersonRow = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_private: boolean
  reason: string
  follows_me: boolean
}

export type ProfileCountsRow = {
  followers: number
  following: number
  collections: number
  is_private: boolean
  follow_status: FollowStatus | null
}

export type SharedUser = {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
}

export type CollectionDetailRow = {
  id: string
  owner_id: string
  title: string
  description: string | null
  visibility: Visibility
  activity_enabled: boolean
  created_at: string
  owner_username: string
  owner_display_name: string
  owner_avatar_url: string | null
  item_count: number
  is_following: boolean
  is_owner: boolean
  shared_with: Json | null // SharedUser[] when viewer is the owner
}

export type CollectionSummaryRow = {
  id: string
  owner_id: string
  title: string
  description: string | null
  visibility: Visibility
  created_at: string
  item_count: number
  is_following: boolean
  is_owner: boolean
}

export type CollectionItemRow = {
  id: string
  collection_id: string
  platform: Platform
  external_id: string | null
  name: string
  avatar_url: string | null
  url: string
  added_at: string
}

// ---------- Supabase generic ----------
// Relationships mirror the FK constraints created in the migrations; they let
// supabase-js type embedded selects like `profiles!follows_following_id_fkey`.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: ProfileUpdate
        Relationships: []
      }
      follows: {
        Row: Follow
        Insert: FollowInsert
        Update: FollowUpdate
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey'
            columns: ['follower_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'follows_following_id_fkey'
            columns: ['following_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      collections: {
        Row: Collection
        Insert: CollectionInsert
        Update: CollectionUpdate
        Relationships: [
          {
            foreignKeyName: 'collections_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      collection_shares: {
        Row: CollectionShare
        Insert: Pick<CollectionShare, 'collection_id' | 'user_id'>
        Update: Partial<Pick<CollectionShare, 'collection_id' | 'user_id'>>
        Relationships: [
          {
            foreignKeyName: 'collection_shares_collection_id_fkey'
            columns: ['collection_id']
            isOneToOne: false
            referencedRelation: 'collections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'collection_shares_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      collection_items: {
        Row: CollectionItem
        Insert: CollectionItemInsert
        Update: Partial<Omit<CollectionItemInsert, 'collection_id'>>
        Relationships: [
          {
            foreignKeyName: 'collection_items_collection_id_fkey'
            columns: ['collection_id']
            isOneToOne: false
            referencedRelation: 'collections'
            referencedColumns: ['id']
          },
        ]
      }
      collection_followers: {
        Row: CollectionFollower
        Insert: Pick<CollectionFollower, 'collection_id' | 'user_id'>
        Update: Partial<Pick<CollectionFollower, 'collection_id' | 'user_id'>>
        Relationships: [
          {
            foreignKeyName: 'collection_followers_collection_id_fkey'
            columns: ['collection_id']
            isOneToOne: false
            referencedRelation: 'collections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'collection_followers_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      activities: {
        Row: Activity
        Insert: Pick<Activity, 'actor_id'> & Partial<Pick<Activity, 'type' | 'collection_id' | 'item_id' | 'metadata'>>
        Update: never
        Relationships: [
          {
            foreignKeyName: 'activities_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_collection_id_fkey'
            columns: ['collection_id']
            isOneToOne: false
            referencedRelation: 'collections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'collection_items'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: Notification
        Insert: Pick<Notification, 'user_id' | 'type'> & Partial<Pick<Notification, 'actor_id' | 'payload' | 'is_read'>>
        Update: Partial<Pick<Notification, 'is_read'>>
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notification_settings: {
        Row: NotificationSettings
        Insert: Pick<NotificationSettings, 'user_id'> & Partial<Omit<NotificationSettings, 'user_id'>>
        Update: Partial<Omit<NotificationSettings, 'user_id'>>
        Relationships: [
          {
            foreignKeyName: 'notification_settings_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      platform_connections: {
        Row: PlatformConnection
        Insert: Pick<PlatformConnection, 'user_id' | 'platform' | 'access_token'> &
          Partial<
            Pick<
              PlatformConnection,
              | 'external_account_id'
              | 'external_username'
              | 'refresh_token'
              | 'token_expires_at'
              | 'scopes'
              | 'status'
              | 'last_synced_at'
              | 'last_sync_error'
            >
          >
        Update: Partial<
          Pick<
            PlatformConnection,
            'access_token' | 'refresh_token' | 'token_expires_at' | 'scopes' | 'status' | 'last_synced_at' | 'last_sync_error'
          >
        >
        Relationships: [
          {
            foreignKeyName: 'platform_connections_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      platform_imports: {
        Row: PlatformImport
        Insert: Pick<PlatformImport, 'user_id' | 'platform' | 'name' | 'url'> &
          Partial<Pick<PlatformImport, 'external_id' | 'avatar_url'>>
        Update: Partial<Pick<PlatformImport, 'status' | 'imported_item_id'>>
        Relationships: [
          {
            foreignKeyName: 'platform_imports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'platform_imports_imported_item_id_fkey'
            columns: ['imported_item_id']
            isOneToOne: false
            referencedRelation: 'collection_items'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      get_feed: {
        Args: { p_before?: string | null; p_before_id?: string | null; p_limit?: number }
        Returns: FeedRow[]
      }
      get_profile_activities: {
        Args: { p_profile_id: string; p_before?: string | null; p_before_id?: string | null; p_limit?: number }
        Returns: FeedRow[]
      }
      search_users: {
        Args: { p_q: string; p_limit?: number }
        Returns: SearchUserRow[]
      }
      search_collections: {
        Args: { p_q: string; p_limit?: number }
        Returns: SearchCollectionRow[]
      }
      get_popular_items: {
        Args: { p_limit?: number }
        Returns: PopularItemRow[]
      }
      get_suggested_people: {
        Args: { p_limit?: number }
        Returns: SuggestedPersonRow[]
      }
      get_profile_counts: {
        Args: { p_profile_id: string }
        Returns: ProfileCountsRow[]
      }
      get_collection: {
        Args: { p_id: string }
        Returns: CollectionDetailRow[]
      }
      get_collections_for_profile: {
        Args: { p_owner_id: string }
        Returns: CollectionSummaryRow[]
      }
      get_collection_items: {
        Args: { p_collection_id: string }
        Returns: CollectionItemRow[]
      }
      list_my_connections: {
        Args: Record<string, never>
        Returns: PlatformConnectionRow[]
      }
      disconnect_platform: {
        Args: { p_platform: Platform }
        Returns: null
      }
    }
    Enums: {
      platform: Platform
      visibility: Visibility
      follow_status: FollowStatus
      activity_type: ActivityType
      notification_type: NotificationType
    }
  }
}
