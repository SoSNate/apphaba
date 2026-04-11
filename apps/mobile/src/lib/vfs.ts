import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { APPABA_SDK } from './filesystem'

const BASE_DIR = Directory.Data
export const PROJECT_DIR = 'AppAba_Projects'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectFile {
  name: string
  content: string
  userModified: boolean     // true when user manually edited (M2)
  lastModifiedByAI: boolean // true when last write was by AI (glow indicator)
  aiReason?: string         // why this file exists (from ← why: comment in delimiter)
}

export interface Project {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  files: ProjectFile[]
  blueprintTheme: 'nothing' | 'cyber' | 'retro' | null
  blueprintAnswers: string | null
}

interface ProjectManifest {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
  fileNames: string[]
  blueprintTheme: 'nothing' | 'cyber' | 'retro' | null
  blueprintAnswers: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50) || 'project'
}

function getProjectPath(projectId: string): string {
  return `${PROJECT_DIR}/${projectId}`
}

function getFilePath(projectId: string, fileName: string): string {
  return `${PROJECT_DIR}/${projectId}/${fileName}`
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createProject(name: string): Promise<Project> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const project: Project = {
    id,
    name,
    slug: slugify(name),
    createdAt: now,
    updatedAt: now,
    files: [],
    blueprintTheme: null,
    blueprintAnswers: null,
  }
  await Filesystem.mkdir({
    path: getProjectPath(id),
    directory: BASE_DIR,
    recursive: true,
  })
  await saveManifest(project)
  return project
}

export async function saveManifest(project: Project): Promise<void> {
  const manifest: ProjectManifest = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    fileNames: project.files.map(f => f.name),
    blueprintTheme: project.blueprintTheme,
    blueprintAnswers: project.blueprintAnswers,
  }
  await Filesystem.writeFile({
    path: getFilePath(project.id, 'manifest.json'),
    directory: BASE_DIR,
    data: JSON.stringify(manifest, null, 2),
    encoding: Encoding.UTF8,
  })
}

export async function writeProjectFile(projectId: string, file: ProjectFile): Promise<void> {
  await Filesystem.mkdir({
    path: getProjectPath(projectId),
    directory: BASE_DIR,
    recursive: true,
  }).catch(() => {})
  await Filesystem.writeFile({
    path: getFilePath(projectId, file.name),
    directory: BASE_DIR,
    data: file.content,
    encoding: Encoding.UTF8,
  })
}

export async function writeAllProjectFiles(project: Project): Promise<void> {
  await Filesystem.mkdir({
    path: getProjectPath(project.id),
    directory: BASE_DIR,
    recursive: true,
  }).catch(() => {})

  // Write appaba-sdk.js first so mini-app can reference it
  await Filesystem.writeFile({
    path: getFilePath(project.id, 'appaba-sdk.js'),
    directory: BASE_DIR,
    data: APPABA_SDK,
    encoding: Encoding.UTF8,
  }).catch(() => {})

  // Write all project files
  for (const file of project.files) {
    await writeProjectFile(project.id, file)
  }

  // Write architecture map
  const mapHtml = generateArchitectureMap(project)
  await Filesystem.writeFile({
    path: getFilePath(project.id, 'architecture-map.html'),
    directory: BASE_DIR,
    data: mapHtml,
    encoding: Encoding.UTF8,
  }).catch(() => {})

  await saveManifest(project)
}

export async function readProjectFile(projectId: string, fileName: string): Promise<string> {
  const result = await Filesystem.readFile({
    path: getFilePath(projectId, fileName),
    directory: BASE_DIR,
    encoding: Encoding.UTF8,
  })
  return result.data as string
}

export async function loadProjectFull(projectId: string): Promise<Project> {
  const raw = await Filesystem.readFile({
    path: getFilePath(projectId, 'manifest.json'),
    directory: BASE_DIR,
    encoding: Encoding.UTF8,
  })
  const manifest: ProjectManifest = JSON.parse(raw.data as string)

  const files: ProjectFile[] = []
  for (const name of manifest.fileNames) {
    try {
      const content = await readProjectFile(projectId, name)
      files.push({ name, content, userModified: false, lastModifiedByAI: true })
    } catch {
      // skip missing file
    }
  }

  return {
    id: manifest.id,
    name: manifest.name,
    slug: manifest.slug,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    files,
    blueprintTheme: manifest.blueprintTheme,
    blueprintAnswers: manifest.blueprintAnswers,
  }
}

export async function listProjects(): Promise<Project[]> {
  try {
    const result = await Filesystem.readdir({ path: PROJECT_DIR, directory: BASE_DIR })
    const projects: Project[] = []
    for (const entry of result.files) {
      try {
        // readdir entries may have .name or be a string depending on Capacitor version
        const dirName = typeof entry === 'string' ? entry : (entry as any).name
        const raw = await Filesystem.readFile({
          path: `${PROJECT_DIR}/${dirName}/manifest.json`,
          directory: BASE_DIR,
          encoding: Encoding.UTF8,
        })
        const manifest: ProjectManifest = JSON.parse(raw.data as string)
        projects.push({
          id: manifest.id,
          name: manifest.name,
          slug: manifest.slug,
          createdAt: manifest.createdAt,
          updatedAt: manifest.updatedAt,
          files: manifest.fileNames.map(n => ({ name: n, content: '', userModified: false, lastModifiedByAI: false })),
          blueprintTheme: manifest.blueprintTheme,
          blueprintAnswers: manifest.blueprintAnswers,
        })
      } catch {
        // skip corrupt manifest
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  await Filesystem.rmdir({
    path: getProjectPath(projectId),
    directory: BASE_DIR,
    recursive: true,
  }).catch(() => {})
}

export async function renameProject(project: Project, newName: string): Promise<Project> {
  const updated = { ...project, name: newName, slug: slugify(newName), updatedAt: new Date().toISOString() }
  await saveManifest(updated)
  return updated
}

/** Returns the preview URL for the project index — uses Service Worker intercept */
export function getProjectPreviewUrl(projectId: string): string {
  return `http://studio.local/projects/${projectId}/index.html`
}

// ── Multi-file stream parser ───────────────────────────────────────────────────

const FILE_DELIMITER = /^=== FILE: ([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+) ===(.*)?$/m
const FILE_DELIMITER_GLOBAL = /^=== FILE: ([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+) ===(.*)?$/gm
const VALID_FILENAME = /^[a-z0-9_.-]+\.(html|css|js|json|txt)$/i

/**
 * Parse multi-file AI output into ProjectFile[].
 * Handles partial streaming (last section may be incomplete).
 * Falls back to single index.html if no delimiters found.
 */
export function parseMultiFileStream(rawText: string, streamComplete = false): ProjectFile[] {
  if (!rawText.trim()) return []

  // Strip markdown fences if present
  let text = rawText.trim()
  text = text.replace(/^```[\w]*\n?/m, '').replace(/\n?```\s*$/m, '')

  const markers = [...text.matchAll(FILE_DELIMITER_GLOBAL)]

  // Fallback: no delimiters → treat as single index.html
  if (markers.length === 0) {
    if (!text) return []
    return [{
      name: 'index.html',
      content: text,
      userModified: false,
      lastModifiedByAI: true,
      aiReason: 'entry point',
    }]
  }

  const files: ProjectFile[] = []
  const parts = text.split(FILE_DELIMITER_GLOBAL)
  // split with capturing group gives: [before, name, whyRaw, content, name, whyRaw, content, ...]
  // parts[0] = text before first marker (discard)
  // then groups of 3: [name, whyRaw, content]

  for (let i = 1; i < parts.length; i += 3) {
    const name = (parts[i] ?? '').trim()
    const whyRaw = (parts[i + 1] ?? '').trim()  // may be "← why: entry point" or ""
    const content = (parts[i + 2] ?? '').trim()

    if (!name || !VALID_FILENAME.test(name)) continue

    // Extract aiReason from "← why: ..." or "// why: ..."
    const reasonMatch = whyRaw.match(/(?:←\s*why:|\/\/\s*why:)\s*(.+)/i)
    const aiReason = reasonMatch ? reasonMatch[1].trim() : undefined

    // During streaming, skip the last section if it might be incomplete
    const isLast = i + 3 >= parts.length
    if (isLast && !streamComplete && content.length < 20) continue

    if (content) {
      files.push({ name, content, userModified: false, lastModifiedByAI: true, aiReason })
    }
  }

  return files
}

// ── Architecture Map ──────────────────────────────────────────────────────────

/**
 * Generate a self-contained architecture-map.html showing file dependencies.
 * Pure SVG — no external dependencies.
 */
export function generateArchitectureMap(project: Project): string {
  const indexFile = project.files.find(f => f.name === 'index.html')
  const edges: [string, string][] = []

  if (indexFile) {
    // Find <script src="..."> references
    const scriptMatches = indexFile.content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)
    for (const m of scriptMatches) {
      const src = m[1].replace(/^\.\//, '')
      if (project.files.find(f => f.name === src)) {
        edges.push(['index.html', src])
      }
    }
    // Find <link href="..."> references
    const linkMatches = indexFile.content.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)
    for (const m of linkMatches) {
      const href = m[1].replace(/^\.\//, '')
      if (project.files.find(f => f.name === href)) {
        edges.push(['index.html', href])
      }
    }
  }

  const nodes = project.files.filter(f => f.name !== 'architecture-map.html')
  const nodeCount = nodes.length
  const cx = 220, cy = 180, r = 130
  const angleStep = nodeCount > 0 ? (2 * Math.PI) / nodeCount : 0

  const nodePositions: Record<string, { x: number; y: number }> = {}
  nodes.forEach((f, i) => {
    // index.html at center-top
    if (f.name === 'index.html') {
      nodePositions[f.name] = { x: cx, y: 60 }
    } else {
      const angle = -Math.PI / 2 + angleStep * i
      nodePositions[f.name] = {
        x: Math.round(cx + r * Math.cos(angle)),
        y: Math.round(cy + r * Math.sin(angle) + 60),
      }
    }
  })

  const edgeSvg = edges.map(([from, to]) => {
    const a = nodePositions[from]
    const b = nodePositions[to]
    if (!a || !b) return ''
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#4f46e5" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>`
  }).join('\n')

  const nodeColors: Record<string, string> = {
    'index.html': '#6366f1',
    'style.css': '#06b6d4',
    'main.js': '#f59e0b',
    'utils.js': '#10b981',
    'api-logic.js': '#ef4444',
  }

  const nodeSvg = nodes.map(f => {
    const pos = nodePositions[f.name]
    if (!pos) return ''
    const color = nodeColors[f.name] ?? '#8b5cf6'
    const dot = f.userModified ? '#3b82f6' : f.lastModifiedByAI ? '#22c55e' : '#6b7280'
    const reason = f.aiReason ? f.aiReason.slice(0, 30) : ''
    return `
      <g>
        <circle cx="${pos.x}" cy="${pos.y}" r="28" fill="${color}22" stroke="${color}" stroke-width="1.5"/>
        <circle cx="${pos.x + 22}" cy="${pos.y - 22}" r="5" fill="${dot}"/>
        <text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" fill="#fff" font-size="11" font-family="monospace">${f.name}</text>
        ${reason ? `<text x="${pos.x}" y="${pos.y + 44}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="monospace">${reason}</text>` : ''}
      </g>`
  }).join('\n')

  const legend = `
    <g transform="translate(10, ${cy * 2 + 20})">
      <circle cx="10" cy="0" r="5" fill="#22c55e"/><text x="20" y="4" fill="#94a3b8" font-size="10" font-family="sans-serif">AI modified</text>
      <circle cx="90" cy="0" r="5" fill="#3b82f6"/><text x="100" y="4" fill="#94a3b8" font-size="10" font-family="sans-serif">User modified</text>
    </g>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Architecture Map — ${project.name}</title>
<style>
  body{margin:0;background:#030712;display:flex;flex-direction:column;align-items:center;padding:16px;font-family:sans-serif}
  h2{color:#e2e8f0;font-size:14px;margin:0 0 12px;letter-spacing:0.05em}
  svg{max-width:100%;border:1px solid #1e293b;border-radius:12px;background:#0f172a}
  p{color:#64748b;font-size:12px;margin-top:12px}
</style>
</head>
<body>
<h2>🗺 Architecture Map — ${project.name}</h2>
<svg width="${cx * 2}" height="${cy * 2 + 60}" xmlns="http://www.w3.org/2000/svg">
  ${edgeSvg}
  ${nodeSvg}
  ${legend}
</svg>
<p>Generated by AppAba Project Studio · ${new Date().toLocaleString()}</p>
</body>
</html>`
}
