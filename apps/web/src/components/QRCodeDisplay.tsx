import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface Props {
  url: string
  appName: string
}

export function QRCodeDisplay({ url, appName }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <QRCodeSVG value={url} size={180} level="M" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">{appName}</p>
        <p className="text-xs text-gray-400 mt-1 break-all max-w-xs">{url}</p>
      </div>
      <button
        onClick={copyLink}
        className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700
          bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors"
      >
        {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy link</>}
      </button>
    </div>
  )
}
