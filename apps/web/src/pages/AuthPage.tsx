import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Mail, ArrowRight, KeyRound } from 'lucide-react'

export default function AuthPage() {
  const { sendOtp, verifyOtp } = useAuth()
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await sendOtp(email)
      setStep('code')
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">📱</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AppAba</h1>
          <p className="text-gray-500 text-sm mt-1">From code to mobile in seconds</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-1">Sign in</h2>
            <p className="text-sm text-gray-500 mb-5">No password needed — we'll email you a 6-digit code.</p>

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>

            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                text-white font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><span>Send code</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-1">Enter your code</h2>
            <p className="text-sm text-gray-500 mb-5">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{8}"
                maxLength={8}
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                placeholder="12345678"
                required
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm tracking-widest"
              />
            </div>

            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                text-white font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><span>Verify code</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setStep('email'); setToken(''); setError('') }}
              className="w-full mt-3 text-sm text-indigo-600 hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
