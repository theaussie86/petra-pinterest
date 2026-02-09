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

export interface PinterestCreatePinPayload {
  board_id: string
  title?: string
  description?: string
  alt_text?: string
  link?: string
  media_source: {
    source_type: 'image_url'
    url: string
  }
}
