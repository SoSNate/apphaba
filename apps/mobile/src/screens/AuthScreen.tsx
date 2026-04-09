import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Mail, Hash, ArrowRight } from 'lucide-react'

export function AuthScreen() {
  const { sendOtp, verifyOtp } = useAuth()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendOtp(email)
      setStep('otp')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyOtp(email, token)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-indigo-800 flex flex-col items-center justify-center px-6">
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">📱</div>
        <h1 className="text-3xl font-bold text-white">AppAba</h1>
        <p className="text-indigo-200 text-sm mt-1">Your apps, on your phone</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Sign in</h2>
              <p className="text-xs text-gray-500 mt-0.5">We'll send a code to your email</p>
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white
                font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><span>Send code</span><ArrowRight className="w-4 h-4" /></>
              }
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Check your email</h2>
              <p className="text-xs text-gray-500 mt-0.5">Enter the 6-digit code sent to <strong>{email}</strong></p>
            </div>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 text-sm tracking-widest font-mono"
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading || token.length !== 6}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white
                font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Verify & sign in'
              }
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setToken(''); setError('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
