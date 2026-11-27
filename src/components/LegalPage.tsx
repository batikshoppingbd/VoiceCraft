import { ArrowLeft, ArrowRight } from 'lucide-react';

interface LegalPageProps {
  type: 'privacy' | 'terms';
}

export function LegalPage({ type }: LegalPageProps) {
  const isPrivacy = type === 'privacy';

  const navigate = (path: string) => {
    window.location.href = path;
  };

  return (
    <div className="min-h-screen bg-[#080D1C] text-white flex flex-col">
      <header className="sticky top-0 z-40 h-16 bg-[#080D1C]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
          <a
            href="/"
            aria-label="VoiceCraft Home"
            className="inline-flex items-center whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] rounded-xl"
          >
            <span className="inline-flex items-center justify-center bg-white/95 rounded-xl px-2.5 py-1 shadow-sm border border-white/20">
              <img
                src="/assets/aistudio/file_00000000f3808211bcfd7bd5316f31f5_6f37ae42.png"
                alt="VoiceCraft"
                width={66}
                height={44}
                referrerPolicy="no-referrer"
                className="h-9 w-auto object-contain"
              />
            </span>
          </a>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#A5B4CC] hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Home
            </a>
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Voice Generation
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-xs font-medium text-[#A5B4CC] mb-3">
          VoiceCraft Legal · Updated November 2026
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white mb-6">
          {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
        </h1>

        <div className="space-y-8 text-[#A5B4CC] text-[15px] leading-relaxed bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-8">
          {isPrivacy ? (
            <>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  1. Information Processed
                </h2>
                <p>
                  When you use VoiceCraft to convert text into AI-generated speech or create an
                  authorized personal voice profile, the text prompts and uploaded/recorded voice
                  samples you submit are processed solely to perform voice analysis and speech
                  synthesis.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  2. Workspace &amp; Browser Audio Storage
                </h2>
                <p>
                  VoiceCraft stores your workspace profile metadata in cloud database records linked
                  to your browser workspace identifier and caches generated WAV/MP3 audio clips in
                  your browser&apos;s local storage (IndexedDB) so you can replay and download your
                  audio directly on your device.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  3. Voice Ownership &amp; Consent
                </h2>
                <p>
                  Creating a personal voice profile requires explicit confirmation that the voice
                  sample belongs to you or that you hold documented authorization from the speaker.
                  You can delete saved voice profiles and generated audio history at any time from
                  the application.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  4. Contact
                </h2>
                <p>
                  If you have questions regarding privacy or data deletion, reach out via the{' '}
                  <a href="/#contact" className="text-white underline hover:text-[#A5B4CC]">
                    Contact section
                  </a>{' '}
                  or email{' '}
                  <a
                    href="mailto:support@voicecraft.studio"
                    className="text-white underline hover:text-[#A5B4CC]"
                  >
                    support@voicecraft.studio
                  </a>
                  .
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  1. Acceptable Use
                </h2>
                <p>
                  VoiceCraft provides AI text-to-speech and authorized personal voice profile tools
                  for lawful creative, educational, accessibility, and content production projects.
                  You agree not to impersonate any individual without explicit consent or generate
                  misleading, deceptive, or unlawful audio content.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  2. Voice Sample Authorization
                </h2>
                <p>
                  Whenever you upload or record an audio sample to build a personal voice profile,
                  you affirm that you are the speaker or possess explicit permission from the
                  speaker to synthesize speech modeled on that sample.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  3. Generated Content &amp; Availability
                </h2>
                <p>
                  You retain responsibility for the scripts you submit and the generated audio files
                  you download. Service availability depends on underlying AI synthesis capacity and
                  supported browser features.
                </p>
              </section>
              <section className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-white">
                  4. Updates to Terms
                </h2>
                <p>
                  We may update these terms as VoiceCraft evolves. Continued use of the platform
                  constitutes acceptance of the current terms.
                </p>
              </section>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 px-4 sm:px-6 text-center text-sm text-[#A5B4CC]">
        © 2026 VoiceCraft. All Rights Reserved.
      </footer>
    </div>
  );
}
