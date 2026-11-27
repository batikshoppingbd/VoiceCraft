import { ArrowLeft, Loader2, LogIn } from 'lucide-react';
import { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';

interface AuthGateProps {
  targetLabel?: string;
}

function mapAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before finishing. Please try again.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser popup was blocked. Please allow popups for this site and click Continue with Google again.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Domain "${host}" is not authorized in Firebase Authentication. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to Google Sign-In. Check your connection and try again.';
  }
  return msg || 'Unable to sign in with Google. Please try again.';
}

export function AuthGate({ targetLabel = 'VoiceCraft Studio' }: AuthGateProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(mapAuthError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080D1C] text-white flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[560px] h-[340px] rounded-full bg-gradient-to-tr from-[#2563EB]/25 to-[#9333EA]/20 blur-[110px]"
      />

      <div className="relative w-full max-w-md bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#A5B4CC] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </a>
        </div>

        <div className="space-y-3 text-center">
          <div className="inline-flex items-center justify-center bg-white/95 rounded-xl px-3.5 py-2 mx-auto">
            <img
              src="/assets/aistudio/file_00000000f3808211bcfd7bd5316f31f5_6f37ae42.png"
              alt="VoiceCraft"
              width={96}
              height={64}
              referrerPolicy="no-referrer"
              className="h-11 w-auto object-contain"
            />
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight text-white">
            Sign in to {targetLabel}
          </h1>
          <p className="text-sm text-[#A5B4CC] leading-relaxed">
            Register or sign in with your Google account to create cloned voices, synthesize speech,
            and manage your workspace.
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200 leading-relaxed">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 disabled:opacity-60 text-sm font-semibold text-white transition-opacity cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Connecting Google Account...</span>
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="pt-4 border-t border-white/10 text-xs text-[#A5B4CC] space-y-1.5 text-center">
          <p>New users are automatically registered on first Google sign-in.</p>
          <p className="text-[11px] text-[#A5B4CC]/80">
            First workspace login automatically initializes administrator access.
          </p>
        </div>
      </div>
    </div>
  );
}
