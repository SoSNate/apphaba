export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

export interface App {
  id: string
  user_id: string
  name: string
  slug: string
  is_public: boolean
  storage_path: string | null
  version: string
  created_at: string
  updated_at: string
}

export interface DownloadedApp extends App {
  local_path: string
  local_version: string
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
