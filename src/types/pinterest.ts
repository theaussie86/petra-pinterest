export interface PinterestConnection {
  id: string
  tenant_id: string
  pinterest_user_id: string
  pinterest_username: string | null
  scope: string | null
  token_expires_at: string
  is_active: boolean
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface OAuthState {
  id: string
  state: string
  code_verifier: string
  blog_project_id: string
  tenant_id: string
  user_id: string
  created_at: string
  expires_at: string
}

// Pinterest API v5 response types
export interface PinterestTokenResponse {
  access_token: string
  token_type: string
  expires_in: number // seconds (2592000 = 30 days)
  refresh_token: string
  scope: string
}

export interface PinterestUserResponse {
  username: string
  account_type: string
}

export interface PinterestBoardResponse {
  id: string
  name: string
  description: string
  privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET'
  pin_count: number
  media?: { image_cover_url?: string }
}

export interface PinterestBoardsListResponse {
  items: PinterestBoardResponse[]
  bookmark?: string
}

export interface PinterestPinResponse {
  id: string
  board_id: string
  created_at: string
  link: string
  media: Record<string, unknown>
}

/**
 * Pinterest v5 media_source variants accepted by POST /pins.
 *
 * - `image_url`: we host the image somewhere publicly (Supabase Storage) and
 *   Pinterest fetches it itself. Used for regular image pins.
 * - `video_id`: we uploaded the video bytes to Pinterest's own S3 bucket via
 *   POST /media + multipart upload + polling, and pass the resulting media_id
 *   here. Pinterest does NOT accept a video URL — this is the only video path.
 *   A cover image is required in practice: supply either a `cover_image_url`
 *   (we host it) or a `cover_image_key_frame_time` (Pinterest extracts a
 *   frame server-side at the given second).
 */
export type PinterestMediaSource =
  | { source_type: 'image_url'; url: string }
  | {
      source_type: 'video_id'
      media_id: string
      cover_image_url?: string
      cover_image_content_type?: 'image/jpeg' | 'image/png'
      cover_image_data?: string
      cover_image_key_frame_time?: number
      is_standard?: boolean
    }

export interface PinterestCreatePinPayload {
  board_id: string
  title?: string
  description?: string
  alt_text?: string
  link?: string
  media_source: PinterestMediaSource
}

/** Response from `POST /v5/media` (media upload registration) */
export interface PinterestMediaRegisterResponse {
  media_id: string
  media_type: 'video'
  upload_url: string
  upload_parameters: Record<string, string>
}

/** Response from `GET /v5/media/{media_id}` */
export interface PinterestMediaStatusResponse {
  media_id: string
  media_type: 'video'
  status: 'registered' | 'processing' | 'succeeded' | 'failed'
}
