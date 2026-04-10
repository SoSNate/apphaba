import { Filesystem, Directory } from '@capacitor/filesystem'
import { supabase } from './supabase'
import type { App } from '@appaba/shared'

const BASE_DIR = Directory.Data

/** Recursively list all file paths under a storage prefix */
async function listAllStorageFiles(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !data) return []
  const results: string[] = []
  for (const item of data) {
    const fullPath = `${prefix}${item.name}`
    if (item.id === null) {
      // directory — recurse
      const children = await listAllStorageFiles(bucket, fullPath + '/')
      results.push(...children)
    } else {
      results.push(fullPath)
    }
  }
  return results
}

/** Stream all app files from Supabase Storage to device disk using native HTTP */
export async function downloadAppFiles(
  app: App,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<void> {
  const allPaths = await listAllStorageFiles('app-files', app.storage_path!)
  const total = allPaths.length

  for (let i = 0; i < allPaths.length; i++) {
    const storagePath = allPaths[i]
    const fileName = storagePath.split('/').pop() ?? 'file'
    onProgress?.(i + 1, total, fileName)

    // Use signed URL for private bucket, public URL for public apps
    const { data } = await supabase.storage
      .from('app-files')
      .createSignedUrl(storagePath, 120) // 2 min expiry — enough for download

    if (!data?.signedUrl) continue

    const relativePath = storagePath.replace(app.storage_path!, '')
    const localPath = `apps/${app.id}/${relativePath}`

    // Ensure parent directory exists
    const dirParts = localPath.split('/')
    dirParts.pop()
    const dirPath = dirParts.join('/')
    if (dirPath) {
      await Filesystem.mkdir({ path: dirPath, directory: BASE_DIR, recursive: true })
        .catch(() => {}) // ignore "already exists"
    }

    // Stream directly to disk — no in-memory buffering
    await Filesystem.downloadFile({
      path: localPath,
      directory: BASE_DIR,
      url: data.signedUrl,
    })
  }

  // Save local version timestamp + index path
  const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
  versions[app.id] = app.version
  localStorage.setItem('appaba_local_versions', JSON.stringify(versions))

  const indexStoragePath = allPaths.find(p => p.endsWith('index.html')) ?? ''
  const indexRelative = indexStoragePath.replace(app.storage_path!, '')
  const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
  indexPaths[app.id] = `apps/${app.id}/${indexRelative}`
  localStorage.setItem('appaba_index_paths', JSON.stringify(indexPaths))
}

/** Download public app files without auth (for QR scan users) */
export async function downloadPublicAppFiles(
  app: App,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<void> {
  const allPaths = await listAllStorageFiles('app-files', app.storage_path!)
  const total = allPaths.length

  for (let i = 0; i < allPaths.length; i++) {
    const storagePath = allPaths[i]
    const fileName = storagePath.split('/').pop() ?? 'file'
    onProgress?.(i + 1, total, fileName)

    const { data } = supabase.storage.from('app-files').getPublicUrl(storagePath)
    const relativePath = storagePath.replace(app.storage_path!, '')
    const localPath = `apps/${app.id}/${relativePath}`

    const dirParts = localPath.split('/')
    dirParts.pop()
    const dirPath = dirParts.join('/')
    if (dirPath) {
      await Filesystem.mkdir({ path: dirPath, directory: BASE_DIR, recursive: true })
        .catch(() => {})
    }

    await Filesystem.downloadFile({
      path: localPath,
      directory: BASE_DIR,
      url: data.publicUrl,
    })
  }

  const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
  versions[app.id] = app.version
  localStorage.setItem('appaba_local_versions', JSON.stringify(versions))

  const indexStoragePath = allPaths.find(p => p.endsWith('index.html')) ?? ''
  const indexRelative = indexStoragePath.replace(app.storage_path!, '')
  const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
  indexPaths[app.id] = `apps/${app.id}/${indexRelative}`
  localStorage.setItem('appaba_index_paths', JSON.stringify(indexPaths))
}

/** Get a bridge-safe URI for the app's index.html */
export async function getAppIndexUri(appId: string): Promise<string> {
  // Use saved index path (accounts for nested dist/ structure)
  const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
  const savedPath: string | undefined = indexPaths[appId]
  const localPath = savedPath ?? `apps/${appId}/index.html`

  const result = await Filesystem.getUri({
    path: localPath,
    directory: BASE_DIR,
  })
  return result.uri
}

export async function appExistsLocally(appId: string): Promise<boolean> {
  try {
    const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
    const savedPath: string | undefined = indexPaths[appId]
    const localPath = savedPath ?? `apps/${appId}/index.html`
    await Filesystem.stat({ path: localPath, directory: BASE_DIR })
    return true
  } catch {
    return false
  }
}

export async function deleteLocalApp(appId: string): Promise<void> {
  await Filesystem.rmdir({ path: `apps/${appId}`, directory: BASE_DIR, recursive: true })
    .catch(() => {})
  const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
  delete versions[appId]
  localStorage.setItem('appaba_local_versions', JSON.stringify(versions))
}

export function getLocalVersion(appId: string): string | null {
  const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
  return versions[appId] ?? null
}
