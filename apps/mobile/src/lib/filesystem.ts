import { Filesystem, Directory } from '@capacitor/filesystem'
import { supabase } from './supabase'
import type { App } from '@appaba/shared'

const BASE_DIR = Directory.Data

// Inline AppAba SDK — written alongside index.html on download so relative <script src> works
const APPABA_SDK = `(function(){
  var pending = {};
  window.AppAba = new Proxy({}, {
    get: function(_, plugin) {
      return new Proxy({}, {
        get: function(_, method) {
          return function() {
            var args = Array.prototype.slice.call(arguments);
            return new Promise(function(resolve, reject) {
              var id = Math.random().toString(36).slice(2);
              pending[id] = { resolve: resolve, reject: reject };
              window.parent.postMessage({ id: id, plugin: plugin, method: method, args: args }, '*');
            });
          };
        }
      });
    }
  });
  window.addEventListener('message', function(e) {
    var d = e.data;
    if (!d || !d.id || !pending[d.id]) return;
    var p = pending[d.id];
    delete pending[d.id];
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  });
})();`

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

    // Bucket is public — use public URL (no expiry issues)
    const { data } = supabase.storage.from('app-files').getPublicUrl(storagePath)

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

    const response = await fetch(data.publicUrl)
    if (!response.ok) continue
    const blob = await response.blob()
    const base64 = await blobToBase64(blob)

    await Filesystem.writeFile({
      path: localPath,
      directory: BASE_DIR,
      data: base64,
    })
  }

  // Write appaba-sdk.js alongside the app files so relative <script src="appaba-sdk.js"> works
  await Filesystem.writeFile({
    path: `apps/${app.id}/appaba-sdk.js`,
    directory: BASE_DIR,
    data: btoa(APPABA_SDK),
  }).catch(() => {})

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

    const response = await fetch(data.publicUrl)
    if (!response.ok) continue
    const blob = await response.blob()
    const base64 = await blobToBase64(blob)

    await Filesystem.writeFile({
      path: localPath,
      directory: BASE_DIR,
      data: base64,
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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
  const indexPaths = JSON.parse(localStorage.getItem('appaba_index_paths') ?? '{}')
  delete indexPaths[appId]
  localStorage.setItem('appaba_index_paths', JSON.stringify(indexPaths))
}

export function getLocalVersion(appId: string): string | null {
  const versions = JSON.parse(localStorage.getItem('appaba_local_versions') ?? '{}')
  return versions[appId] ?? null
}
