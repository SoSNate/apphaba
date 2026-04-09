import { useState, useRef } from 'react'
import { Upload, FolderOpen } from 'lucide-react'

interface FileEntry {
  file: File
  path: string
}

interface Props {
  onFiles: (entries: FileEntry[]) => void
  uploading: boolean
  progress: string
}

async function readDirectoryEntry(entry: FileSystemEntry, basePath = ''): Promise<FileEntry[]> {
  if (entry.isFile) {
    return new Promise(resolve =>
      (entry as FileSystemFileEntry).file(f =>
        resolve([{ file: f, path: basePath + f.name }])
      )
    )
  }
  const dirEntry = entry as FileSystemDirectoryEntry
  const reader = dirEntry.createReader()
  return new Promise(resolve =>
    reader.readEntries(async entries => {
      const nested = await Promise.all(
        entries.map(e => readDirectoryEntry(e, basePath + entry.name + '/'))
      )
      resolve(nested.flat())
    })
  )
}

function flattenInputFiles(files: FileList): FileEntry[] {
  return Array.from(files).map(f => ({
    file: f,
    // webkitRelativePath = "folderName/sub/file.js" — drop the root folder name
    path: (f as File & { webkitRelativePath: string }).webkitRelativePath
      .split('/').slice(1).join('/') || f.name,
  }))
}

export function FolderDropZone({ onFiles, uploading, progress }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const items = Array.from(e.dataTransfer.items)
    const entries = await Promise.all(
      items
        .map(item => item.webkitGetAsEntry())
        .filter(Boolean)
        .map(entry => readDirectoryEntry(entry!))
    )
    onFiles(entries.flat())
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      onFiles(flattenInputFiles(e.target.files))
    }
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200
        ${uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${isDragging
          ? 'border-indigo-500 bg-indigo-50 scale-[1.01]'
          : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30'
        }
      `}
    >
      {uploading ? (
        <div className="space-y-3">
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-indigo-600 font-medium">{progress || 'Uploading...'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-center">
            {isDragging
              ? <FolderOpen className="w-10 h-10 text-indigo-500" />
              : <Upload className="w-10 h-10 text-gray-400" />
            }
          </div>
          <div>
            <p className="text-base font-medium text-gray-700">
              {isDragging ? 'Drop your folder here' : 'Drag your project folder here'}
            </p>
            <p className="text-sm text-gray-400 mt-1">or click to browse · HTML/JS files</p>
          </div>
        </div>
      )}
      {/* @ts-ignore */}
      <input
        ref={inputRef}
        type="file"
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
