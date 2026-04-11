import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Send, Folder, Eye, FileCode2, RefreshCw, Upload, Settings, X, Map, Zap } from 'lucide-react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Toast } from '@capacitor/toast'
import { Capacitor } from '@capacitor/core'
import { useAppBridge } from '../hooks/useAppBridge'
import {
  createProject, writeAllProjectFiles, loadProjectFull,
  parseMultiFileStream, generateArchitectureMap, getProjectPreviewUrl,
  readProjectFile, writeProjectFile,
} from '../lib/vfs'
import type { Project, ProjectFile } from '../lib/vfs'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const APP_URL = import.meta.env.VITE_APP_URL ?? 'https://apphaba-web.vercel.app'

const MODELS_BY_PROVIDER: Record<string, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: '2.5 Pro' },
    { id: 'gemini-2.5-flash', label: '2.5 Flash' },
  ],
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isBlueprint?: boolean
}

interface Props {
  projectId?: string
  sharedContent?: string  // content injected from Android share intent
  onBack: () => void
  onOpenSettings: () => void
  onPublished?: () => void
}

export function ProjectStudioScreen({ projectId, sharedContent, onBack, onOpenSettings, onPublished }: Props) {
  const { user } = useAuth()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Phase: blueprint (AI asks questions) → coding (AI generates files)
  const [phase, setPhase] = useState<'blueprint' | 'coding'>('blueprint')
  const [project, setProject] = useState<Project | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'generating' | 'error'>('idle')
  const [activePanel, setActivePanel] = useState<'chat' | 'preview' | 'files'>('chat')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [publishName, setPublishName] = useState('')
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle')

  // Model/provider
  const [activeProvider] = useState(() => localStorage.getItem('appaba_active_provider') ?? 'anthropic')
  const [activeModel, setActiveModel] = useState(() => {
    const p = localStorage.getItem('appaba_active_provider') ?? 'anthropic'
    return localStorage.getItem(`appaba_model_${p}`) ?? (MODELS_BY_PROVIDER[p]?.[1]?.id ?? 'claude-sonnet-4-6')
  })

  const abortRef = useRef<AbortController | null>(null)

  // Wire up AppAba bridge for the preview iframe
  const { sendCapabilities } = useAppBridge(iframeRef, project?.id ?? '')

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (projectId) {
      loadProjectFull(projectId).then(p => {
        setProject(p)
        setPhase('coding')
        setRefreshKey(k => k + 1)
      }).catch(() => {})
    }
    // Inject shared content as first message
    if (sharedContent) {
      setMessages([{
        role: 'user',
        content: `📎 Shared content:\n\n${sharedContent}\n\nWhat should I build based on this?`,
      }])
    }
  }, [projectId, sharedContent])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getSettings() {
    const provider = localStorage.getItem('appaba_active_provider') ?? 'anthropic'
    const apiKey = localStorage.getItem(`appaba_api_key_${provider}`) ?? ''
    const model = localStorage.getItem(`appaba_model_${provider}`) ?? activeModel
    return { provider, apiKey, model }
  }

  function addMessage(msg: Message) {
    setMessages(prev => [...prev, msg])
  }

  function reloadPreview() {
    setRefreshKey(k => k + 1)
  }

  function heuristicName(prompt: string): string {
    // Extract first ~30 chars, remove question words
    return prompt.replace(/^(build|create|make|i want|can you|please)\s+/i, '').slice(0, 30).trim() || 'My Project'
  }

  // ── Blueprint Phase ────────────────────────────────────────────────────────

  async function sendBlueprintRequest(userPrompt: string) {
    const { provider, apiKey, model } = getSettings()
    if (!apiKey) {
      Toast.show({ text: '⚙️ Add your API key in Settings first', duration: 'long', position: 'bottom' })
      onOpenSettings()
      return
    }

    setStatus('generating')
    addMessage({ role: 'user', content: userPrompt })

    try {
      const res = await fetch(`${APP_URL}/api/vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt, apiKey, provider, model, mode: 'blueprint', stream: false }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const blueprintText = data.html ?? data.text ?? ''
      addMessage({ role: 'assistant', content: blueprintText, isBlueprint: true })
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `❌ ${err.message}` })
    } finally {
      setStatus('idle')
    }
  }

  // ── Code Generation Phase ──────────────────────────────────────────────────

  async function generate(userPrompt: string) {
    const { provider, apiKey, model } = getSettings()
    if (!apiKey) {
      Toast.show({ text: '⚙️ Add your API key in Settings first', duration: 'long', position: 'bottom' })
      onOpenSettings()
      return
    }

    setStatus('generating')
    addMessage({ role: 'user', content: userPrompt })

    // Create project if first generation
    let currentProject = project
    if (!currentProject) {
      currentProject = await createProject(heuristicName(userPrompt))
      setProject(currentProject)
    }

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const projectFiles = currentProject.files
      .filter(f => f.userModified)
      .map(f => ({ name: f.name, content: f.content }))

    const payload = {
      prompt: userPrompt,
      apiKey,
      provider,
      model,
      mode: 'studio',
      stream: true,
      history,
      projectFiles: projectFiles.length > 0 ? projectFiles : undefined,
      blueprintTheme: currentProject.blueprintTheme,
      blueprintAnswers: currentProject.blueprintAnswers,
    }

    abortRef.current = new AbortController()
    let buffer = ''

    try {
      const res = await fetch(`${APP_URL}/api/vibe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error(await res.text())

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta =
              parsed.delta?.text ??
              parsed.choices?.[0]?.delta?.content ??
              (() => {
                const parts = parsed.candidates?.[0]?.content?.parts ?? []
                return (parts.find((p: any) => !p.thought && p.text) ?? parts[parts.length - 1])?.text ?? ''
              })()
            if (delta) {
              buffer += delta
              // Live parse during streaming — write once index.html is complete
              const partial = parseMultiFileStream(buffer, false)
              const hasCompleteIndex = partial.find(f => f.name === 'index.html' && f.content.includes('</html>'))
              if (hasCompleteIndex && partial.length >= 1) {
                const liveProject = { ...currentProject!, files: partial, updatedAt: new Date().toISOString() }
                await writeAllProjectFiles(liveProject).catch(() => {})
                reloadPreview()
              }
            }
          } catch {}
        }
      }

      // Final parse — complete stream
      const finalFiles = parseMultiFileStream(buffer, true)
      if (finalFiles.length > 0) {
        const updatedProject: Project = {
          ...currentProject!,
          files: finalFiles,
          updatedAt: new Date().toISOString(),
          blueprintTheme: currentProject!.blueprintTheme,
          blueprintAnswers: currentProject!.blueprintAnswers,
        }
        await writeAllProjectFiles(updatedProject)
        setProject(updatedProject)
        reloadPreview()
        addMessage({ role: 'assistant', content: `✅ Generated ${finalFiles.length} files. Tap Preview to see your app.` })
        await Haptics.impact({ style: ImpactStyle.Medium })
      } else {
        addMessage({ role: 'assistant', content: '⚠️ No files were generated. Try rephrasing your request.' })
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addMessage({ role: 'assistant', content: `❌ ${err.message}` })
        setStatus('error')
      }
    } finally {
      setStatus('idle')
    }
  }

  // ── Send handler ──────────────────────────────────────────────────────────

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || status === 'generating') return
    setInput('')
    await Haptics.impact({ style: ImpactStyle.Light })

    if (phase === 'blueprint') {
      // First message → get blueprint
      if (messages.length === 0 || messages.every(m => m.role === 'user')) {
        await sendBlueprintRequest(trimmed)
        return
      }
      // Second message → user replied with theme/answers → transition to coding
      const blueprintMsg = messages.find(m => m.isBlueprint)
      if (blueprintMsg) {
        // Extract theme from reply
        const themeMap: Record<string, 'nothing' | 'cyber' | 'retro'> = {
          a: 'nothing', b: 'cyber', c: 'retro',
          '1': 'nothing', '2': 'cyber', '3': 'retro',
        }
        const themeChar = trimmed.trim()[0]?.toLowerCase() ?? ''
        const blueprintTheme = themeMap[themeChar] ?? 'nothing'

        let currentProject = project ?? await createProject(heuristicName(messages[0]?.content ?? 'Project'))
        currentProject = { ...currentProject, blueprintTheme, blueprintAnswers: trimmed }
        setProject(currentProject)
        setPhase('coding')

        await generate(`${messages[0]?.content ?? ''}\n\nTheme choice and requirements: ${trimmed}`)
        return
      }
    }

    // Coding phase — all subsequent messages are generation/iteration
    await generate(trimmed)
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function publish() {
    if (!project || !user) return
    setPublishStatus('publishing')
    try {
      const appId = crypto.randomUUID()
      const slug = `${publishName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now().toString(36)}`
      const storagePath = `${user.id}/${appId}/`

      for (const file of project.files) {
        const { error } = await supabase.storage.from('app-files').upload(
          `${storagePath}${file.name}`,
          new Blob([file.content], { type: 'text/plain' }),
          { upsert: true }
        )
        if (error) throw error
      }

      const { error: dbError } = await supabase.from('apps').insert({
        id: appId,
        user_id: user.id,
        name: publishName || project.name,
        slug,
        is_public: false,
        storage_path: storagePath,
        version: new Date().toISOString(),
      })
      if (dbError) throw dbError

      setPublishStatus('done')
      await Toast.show({ text: '🚀 Published! App is now in My Apps.', duration: 'long', position: 'bottom' })
      setTimeout(() => { setShowPublishDialog(false); onPublished?.() }, 1200)
    } catch (err: any) {
      await Toast.show({ text: '❌ ' + err.message, duration: 'long', position: 'bottom' })
      setPublishStatus('error')
    }
  }

  // ── Preview URI ────────────────────────────────────────────────────────────

  // Use file URI fallback (Service Worker requires registration; fallback is reliable)
  const [previewUri, setPreviewUri] = useState<string | null>(null)
  useEffect(() => {
    if (!project) return
    import('@capacitor/filesystem').then(({ Filesystem, Directory }) => {
      Filesystem.getUri({ path: `AppAba_Projects/${project.id}/index.html`, directory: Directory.Data })
        .then(r => setPreviewUri(Capacitor.convertFileSrc(r.uri)))
        .catch(() => {})
    })
  }, [project?.id, refreshKey])

  // ── Architecture Map ──────────────────────────────────────────────────────

  function openArchitectureMap() {
    if (!project) return
    readProjectFile(project.id, 'architecture-map.html')
      .then(html => {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        if (iframeRef.current) iframeRef.current.src = url
        setActivePanel('preview')
      })
      .catch(() => Toast.show({ text: 'Architecture map not yet generated', duration: 'short', position: 'bottom' }))
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const panelIndex = activePanel === 'chat' ? 0 : activePanel === 'preview' ? 1 : 2

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col overflow-hidden">

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 pt-12 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {project?.name ?? 'Project Studio'}
          </p>
          <p className="text-gray-500 text-xs">
            {phase === 'blueprint' ? '🗺️ Blueprint Phase' : `${project?.files.length ?? 0} files`}
          </p>
        </div>
        <button
          onClick={() => { setShowPublishDialog(true); setPublishName(project?.name ?? '') }}
          disabled={!project || project.files.length === 0}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-xl disabled:opacity-40"
        >
          <Upload className="w-3.5 h-3.5" /> Publish
        </button>
        <button onClick={onOpenSettings} className="text-gray-400 p-1">
          <Settings className="w-4 h-4" />
        </button>
      </header>

      {/* Tab bar */}
      <div className="bg-gray-900 border-b border-gray-800 flex flex-shrink-0">
        {(['chat', 'preview', 'files'] as const).map((panel, i) => {
          const icons = [<Zap className="w-3.5 h-3.5" />, <Eye className="w-3.5 h-3.5" />, <FileCode2 className="w-3.5 h-3.5" />]
          const labels = ['Chat', 'Preview', 'Files']
          const active = activePanel === panel
          return (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                active ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500'
              }`}
            >
              {icons[i]} {labels[i]}
            </button>
          )
        })}
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 flex transition-transform duration-300"
          style={{ width: '300%', transform: `translateX(-${panelIndex * 33.333}%)` }}
        >
          {/* ── Chat Panel ── */}
          <div className="w-1/3 h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🏗️</div>
                  <p className="text-gray-400 font-medium text-sm">Describe what you want to build</p>
                  <p className="text-gray-600 text-xs mt-1">I'll ask a few questions before writing any code</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : msg.isBlueprint
                        ? 'bg-gray-800 border border-indigo-800 text-gray-100 rounded-bl-sm font-mono text-xs'
                        : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {status === 'generating' && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-400 text-xs">
                      {phase === 'blueprint' ? 'Designing blueprint...' : 'Generating files...'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-800 flex gap-2 pb-8">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={phase === 'blueprint' && messages.length === 0
                  ? "Describe your app idea..."
                  : phase === 'blueprint'
                    ? "Reply with A, B, or C + your answers..."
                    : "Ask for changes or new features..."
                }
                rows={2}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 outline-none focus:border-indigo-500 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || status === 'generating'}
                className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center self-end disabled:opacity-40 active:bg-indigo-500"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* ── Preview Panel ── */}
          <div className="w-1/3 h-full flex flex-col bg-black">
            {previewUri ? (
              <iframe
                key={refreshKey}
                ref={iframeRef}
                src={previewUri}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="flex-1 w-full border-none"
                onLoad={sendCapabilities}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                {project ? (
                  <>
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500 text-sm">Loading preview...</p>
                  </>
                ) : (
                  <>
                    <Eye className="w-10 h-10 text-gray-700" />
                    <p className="text-gray-600 text-sm">Preview appears after first generation</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Files Panel ── */}
          <div className="w-1/3 h-full flex flex-col overflow-hidden">
            {project && project.files.length > 0 ? (
              <>
                {selectedFile ? (
                  /* File content view */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                      <button onClick={() => setSelectedFile(null)} className="text-gray-400">
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <span className="text-white text-sm font-mono">{selectedFile.name}</span>
                      {selectedFile.aiReason && (
                        <span className="text-xs text-gray-500 ml-auto">← {selectedFile.aiReason}</span>
                      )}
                    </div>
                    <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 font-mono bg-gray-950 leading-relaxed">
                      {selectedFile.content}
                    </pre>
                  </div>
                ) : (
                  /* File list */
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3">
                      {project.name}
                    </p>
                    {project.files.map(file => {
                      const dotColor = file.userModified ? 'bg-blue-400' : file.lastModifiedByAI ? 'bg-green-400' : 'bg-gray-600'
                      const ext = file.name.split('.').pop() ?? ''
                      const extColor: Record<string, string> = { html: 'text-orange-400', css: 'text-cyan-400', js: 'text-yellow-400', json: 'text-green-400' }
                      return (
                        <button
                          key={file.name}
                          onClick={() => setSelectedFile(file)}
                          className="w-full flex items-center gap-3 bg-gray-900 rounded-xl px-3 py-2.5 active:bg-gray-800"
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className={`font-mono text-sm ${extColor[ext] ?? 'text-gray-300'}`}>{file.name}</span>
                          <span className="ml-auto text-xs text-gray-600">{(file.content.length / 1024).toFixed(1)}kb</span>
                          {file.aiReason && (
                            <span className="text-xs text-gray-600 max-w-[80px] truncate">{file.aiReason}</span>
                          )}
                        </button>
                      )
                    })}

                    {/* Architecture Map */}
                    <button
                      onClick={openArchitectureMap}
                      className="w-full flex items-center gap-3 bg-indigo-900/30 border border-indigo-800 rounded-xl px-3 py-2.5 active:bg-indigo-900/50"
                    >
                      <Map className="w-4 h-4 text-indigo-400" />
                      <span className="text-indigo-300 text-sm">Architecture Map</span>
                    </button>

                    {/* Legend */}
                    <div className="pt-4 flex gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="text-gray-500 text-xs">AI modified</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        <span className="text-gray-500 text-xs">You edited</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
                <Folder className="w-10 h-10 text-gray-700" />
                <p className="text-gray-600 text-sm text-center">Files appear here after generation</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPublishDialog(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Publish to My Apps</h3>
              <button onClick={() => setShowPublishDialog(false)} className="text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <input
              type="text"
              value={publishName}
              onChange={e => setPublishName(e.target.value)}
              placeholder="App name"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 mb-4"
            />
            <p className="text-gray-500 text-xs mb-4">{project?.files.length ?? 0} files will be uploaded to Supabase Storage.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowPublishDialog(false)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm">Cancel</button>
              <button
                onClick={publish}
                disabled={publishStatus === 'publishing' || !publishName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                {publishStatus === 'publishing' ? 'Publishing...' : publishStatus === 'done' ? '✅ Done!' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
