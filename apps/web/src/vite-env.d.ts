/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Allow webkitdirectory on input elements
declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string
  }
}
