import {
  ArrowRight,
  AudioLines,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Download,
  FileAudio,
  Film,
  GraduationCap,
  Layers,
  Mail,
  Menu,
  MessageSquare,
  Mic,
  Presentation,
  Send,
  Sliders,
  Smartphone,
  Sparkles,
  UserCheck,
  Volume2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import heroStudioImg from '../assets/images/hero_voicecraft_studio_1795749615829.jpg';

const WAVEFORM_BARS = [
  0.34, 0.56, 0.82, 0.48, 0.94, 0.68, 0.42, 0.88, 1.0, 0.62,
  0.78, 0.45, 0.9, 0.72, 0.52, 0.85, 0.6, 0.95, 0.48, 0.74,
  0.55, 0.86, 0.4, 0.66,
];

const HOW_IT_WORKS_STEPS = [
  {
    number: '01.',
    title: 'Enter Your Text',
    description:
      'Write or paste the text you want to convert into speech.',
    detail: 'Supports English, বাংলা, and bilingual scripts up to 5,000 characters.',
  },
  {
    number: '02.',
    title: 'Choose Your Voice',
    description:
      'Select an available AI voice or an authorized personal voice profile.',
    detail: 'Adjust speaking speed, pitch semitones, and delivery style direction.',
  },
  {
    number: '03.',
    title: 'Generate Your Voice',
    description:
      'Click Generate and listen to your AI-generated audio.',
    detail: 'Preview immediately in the studio player and export WAV or MP3.',
  },
];

const WHY_CHOOSE_ITEMS = [
  {
    icon: Sparkles,
    title: 'Simple and User-Friendly Interface',
    description:
      'Navigate effortlessly between your audio library, voice generator, and voice profile settings.',
  },
  {
    icon: Volume2,
    title: 'Modern AI Voice Technology',
    description:
      'Powered by neural speech synthesis models built for clear, natural vocal pacing and articulation.',
  },
  {
    icon: Layers,
    title: 'Easy Text-to-Speech Workflow',
    description:
      'Go from written script to playable speech in three focused steps without complex timelines.',
  },
  {
    icon: UserCheck,
    title: 'Personal Voice Profile Support',
    description:
      'Build an authorized personal voice profile from a short voice recording or uploaded audio clip.',
  },
  {
    icon: FileAudio,
    title: 'Convenient Audio Generation',
    description:
      'Keep your generated clips organized in one workspace and download WAV or MP3 files whenever needed.',
  },
  {
    icon: Smartphone,
    title: 'Responsive Web Experience',
    description:
      'Designed to work cleanly across Android phones, iPhones, tablets, laptops, and desktop monitors.',
  },
];

const USE_CASES = [
  {
    icon: Mic,
    title: 'Content Creation',
    description:
      'Turn written scripts, podcasts intros, and storytelling drafts into clear spoken narration.',
  },
  {
    icon: Film,
    title: 'Video Voiceovers',
    description:
      'Produce consistent voiceover tracks in WAV or MP3 ready for video editing timelines.',
  },
  {
    icon: GraduationCap,
    title: 'Educational Narration',
    description:
      'Create accessible spoken lessons, study guides, and bilingual English or বাংলা explanations.',
  },
  {
    icon: Presentation,
    title: 'Presentation Audio',
    description:
      'Add crisp, well-paced vocal commentary to product walkthroughs and slide decks.',
  },
  {
    icon: MessageSquare,
    title: 'Social Media Content',
    description:
      'Generate punchy narration for short-form reels, explainers, and creator updates quickly.',
  },
  {
    icon: Briefcase,
    title: 'Personal Voice Projects',
    description:
      'Use an authorized personal voice profile to narrate personal notes, drafts, and creative ideas.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'What is VoiceCraft?',
    answer:
      'VoiceCraft is an AI-powered platform designed to convert text into generated speech.',
  },
  {
    question: 'How do I generate an AI voice?',
    answer:
      'Enter your text, select an available voice, and click the Generate button.',
  },
  {
    question: 'Can I create a personal voice profile?',
    answer:
      "Personal voice profile creation is available if the platform's voice profile feature is enabled.",
  },
  {
    question: 'Can I download generated audio?',
    answer:
      'Yes, if audio download is supported by the application.',
  },
  {
    question: 'Is VoiceCraft easy to use?',
    answer:
      'Yes. VoiceCraft is designed with a simple and user-friendly interface.',
  },
  {
    question: 'Does VoiceCraft support mobile devices?',
    answer:
      'Yes. The website is designed to work on desktop, tablet, and mobile devices.',
  },
];

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const goToApp = () => {
    window.location.href = '/app';
  };

  const handleMobileLinkClick = () => {
    setMobileMenuOpen(false);
  };

  const handleContactSubmit = (e: FormEvent) => {
    e.preventDefault();
    setContactError(null);

    const name = contactName.trim();
    const email = contactEmail.trim();
    const msg = contactMessage.trim();

    if (name.length < 2) {
      setContactError('Please enter your name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setContactError('Please enter a valid email address.');
      return;
    }
    if (msg.length < 10) {
      setContactError('Please enter a message of at least 10 characters.');
      return;
    }

    setContactSubmitted(true);
    setContactName('');
    setContactEmail('');
    setContactMessage('');
  };

  return (
    <div className="min-h-screen bg-[#080D1C] text-white selection:bg-[#2563EB]/40 selection:text-white">
      {/* Section 1: Sticky & Responsive Navigation Bar */}
      <header className="sticky top-0 z-50 h-16 bg-[#080D1C]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: VoiceCraft Brand Logo */}
          <a
            href="#home"
            className="inline-flex items-center whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] rounded-xl"
            aria-label="VoiceCraft Home"
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

          {/* Zone 2: Desktop Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#A5B4CC]"
          >
            <a
              href="#home"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </a>
            <a
              href="#features"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#faq"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
            <a
              href="#contact"
              className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          </nav>

          {/* Zone 3: Get Started CTA + Mobile Hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={goToApp}
              className="hidden sm:inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 shadow-md shadow-[#2563EB]/25 cursor-pointer"
            >
              Get Started
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
              className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-white/10 bg-[#111A2E] text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div
            id="mobile-nav-menu"
            className="md:hidden bg-[#080D1C]/98 backdrop-blur-lg border-b border-white/10 px-4 py-4 shadow-xl"
          >
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
              {[
                { label: 'Home', href: '#home' },
                { label: 'Features', href: '#features' },
                { label: 'How It Works', href: '#how-it-works' },
                { label: 'FAQ', href: '#faq' },
                { label: 'Contact', href: '#contact' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={handleMobileLinkClick}
                  className="min-h-[44px] px-3 flex items-center rounded-xl text-sm font-medium text-[#A5B4CC] hover:text-white hover:bg-[#111A2E] transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <button
                type="button"
                onClick={goToApp}
                className="mt-2 min-h-[44px] w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] flex items-center justify-center gap-2 cursor-pointer"
              >
                Get Started
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Section 2: Hero Section */}
        <section
          id="home"
          className="relative overflow-hidden border-b border-white/10"
        >
          {/* Ambient Blue & Purple Radial Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 left-1/4 w-[540px] h-[540px] rounded-full bg-[#2563EB]/18 blur-[120px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 right-1/6 w-[480px] h-[480px] rounded-full bg-[#9333EA]/16 blur-[120px]"
          />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Hero Copy (Left) */}
            <div className="lg:col-span-7 space-y-6">
              <p className="text-sm font-medium text-[#A5B4CC] tracking-wide">
                Create. Generate. Experience the Power of AI Voice.
              </p>

              <h1 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] font-bold leading-[1.08] tracking-tight text-white [text-wrap:balance] max-w-2xl">
                Turn Your Text Into{' '}
                <span className="bg-gradient-to-r from-[#60A5FA] via-[#818CF8] to-[#C084FC] bg-clip-text text-transparent">
                  Natural AI Voices
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[#A5B4CC] leading-relaxed max-w-xl">
                Experience the power of AI voice generation with VoiceCraft. Transform your
                written text into natural-sounding speech with a simple and intuitive voice
                generation experience.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={goToApp}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 min-h-[48px] rounded-xl text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-[#2563EB]/25 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Start Voice Generation
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>

                <a
                  href="#features"
                  className="inline-flex items-center justify-center px-6 py-3.5 min-h-[48px] rounded-xl text-sm sm:text-base font-semibold text-white bg-[#111A2E] border border-white/15 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Features
                </a>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-[#A5B4CC]">
                <span>Text-to-Speech AI</span>
                <span aria-hidden="true">·</span>
                <span>English &amp; বাংলা Support</span>
                <span aria-hidden="true">·</span>
                <span>WAV &amp; MP3 Export</span>
              </div>
            </div>

            {/* Hero Visual (Right): Studio Microphone + Live Acoustic Waveform */}
            <div className="lg:col-span-5">
              <div className="relative rounded-2xl bg-[#111A2E] border border-white/10 overflow-hidden shadow-2xl">
                <div className="relative aspect-[16/10] w-full bg-[#080D1C] overflow-hidden">
                  {!heroImageFailed ? (
                    <img
                      src={heroStudioImg}
                      alt="VoiceCraft AI studio condenser microphone with glowing blue and purple audio waveforms"
                      width={1280}
                      height={800}
                      fetchPriority="high"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImageFailed(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#2563EB]/25 via-[#111A2E] to-[#9333EA]/25 p-6 text-center">
                      <Mic className="w-12 h-12 text-[#60A5FA] mb-3" aria-hidden="true" />
                      <p className="font-display text-sm font-semibold text-white">
                        VoiceCraft Neural Audio Engine
                      </p>
                    </div>
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[#111A2E] via-transparent to-transparent"
                  />
                </div>

                {/* Animated Audio Waveform Bar Strip */}
                <div className="p-5 sm:p-6 border-t border-white/10 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#9333EA] flex items-center justify-center shrink-0">
                        <Mic className="w-4 h-4 text-white" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          AI Voice Waveform Preview
                        </p>
                        <p className="text-xs text-[#A5B4CC] truncate">
                          Natural speech synthesis &amp; voice profiling
                        </p>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-xs text-[#A5B4CC] shrink-0">
                      24 kHz
                    </span>
                  </div>

                  {/* Animated Sound Waves */}
                  <div
                    aria-hidden="true"
                    className="h-12 flex items-end justify-between gap-1.5 px-1"
                  >
                    {WAVEFORM_BARS.map((heightRatio, idx) => (
                      <span
                        key={idx}
                        className="vc-wave-bar flex-1 rounded-full bg-gradient-to-t from-[#2563EB] to-[#9333EA]"
                        style={{
                          height: `${Math.round(heightRatio * 100)}%`,
                          animationDelay: `${(idx % 8) * 140}ms`,
                        }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#A5B4CC] font-mono tabular-nums pt-1 border-t border-white/10">
                    <span>Speed 1.0x · Pitch 0 st</span>
                    <span>WAV / MP3</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Features Section (Asymmetric Bento Grid of Real Features) */}
        <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#60A5FA] mb-2">
              Platform Capabilities
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              Everything You Need to Create AI Voices
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Feature 1 (Wide Card) */}
            <article className="md:col-span-7 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <AudioLines className="w-5 h-5 text-[#60A5FA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  AI Text to Speech
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Convert written text into natural-sounding AI speech. Supports English,
                  বাংলা (Bangla), and bilingual scripts up to 5,000 characters per generation.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono">
                English · বাংলা · Bilingual
              </p>
            </article>

            {/* Feature 2 */}
            <article className="md:col-span-5 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <Volume2 className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  Natural Voice Experience
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Experience expressive and realistic AI-generated speech with fine-tuned
                  speaking speed (0.5x–2.0x) and pitch (-6 to +6 semitones) controls.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono tabular-nums">
                Speed 0.5x–2.0x · Pitch ±6 st
              </p>
            </article>

            {/* Feature 3 */}
            <article className="md:col-span-5 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <Mic className="w-5 h-5 text-[#60A5FA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  Personal Voice Profile
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Create a personal voice profile using an authorized voice sample, when
                  supported. Record with your microphone or upload MP3, WAV, M4A, or WebM audio.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono">
                Consent-verified voice profiling
              </p>
            </article>

            {/* Feature 4 (Wide Card) */}
            <article className="md:col-span-7 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <Sliders className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  Multiple Voice Options
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Explore available AI voice styles and options. Switch between saved voice
                  profiles and customize delivery style prompts before generating speech.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono">
                Custom Voice Profiles · Style Direction
              </p>
            </article>

            {/* Feature 5 */}
            <article className="md:col-span-6 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <Zap className="w-5 h-5 text-[#60A5FA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  Fast Voice Generation
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Generate speech through a simple and streamlined workflow and preview tracks
                  directly inside the built-in studio waveform player.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono">
                Streamlined 3-tab studio
              </p>
            </article>

            {/* Feature 6 */}
            <article className="md:col-span-6 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-5">
              <div>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/25 to-[#9333EA]/25 border border-white/10 flex items-center justify-center mb-5">
                  <Download className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-white mb-2">
                  Audio Download
                </h3>
                <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                  Download generated audio in supported audio formats, including studio-quality
                  WAV and portable MP3 directly from your library or player.
                </p>
              </div>
              <p className="text-xs text-[#A5B4CC] font-mono">
                WAV · MP3 Downloads
              </p>
            </article>
          </div>
        </section>

        {/* Section 4: How It Works */}
        <section
          id="how-it-works"
          className="border-y border-white/10 bg-[#111A2E]/45 py-16 sm:py-24 px-4 sm:px-6"
        >
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl mb-10 sm:mb-12">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA] mb-2">
                Simple Workflow
              </p>
              <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
                Create Your AI Voice in 3 Simple Steps
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {HOW_IT_WORKS_STEPS.map((step) => (
                <div
                  key={step.number}
                  className="bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-7 flex flex-col justify-between gap-4"
                >
                  <div>
                    <span className="font-mono tabular-nums text-sm font-semibold bg-gradient-to-r from-[#60A5FA] to-[#C084FC] bg-clip-text text-transparent">
                      {step.number}
                    </span>
                    <h3 className="font-display text-xl font-semibold text-white mt-2 mb-2.5">
                      {step.title}
                    </h3>
                    <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  <p className="text-xs text-[#A5B4CC] pt-4 border-t border-white/10">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex justify-start sm:justify-center">
              <button
                type="button"
                onClick={goToApp}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 min-h-[48px] rounded-xl text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-[#2563EB]/25 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Start Creating Your Voice
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {/* Section 5: Why Choose VoiceCraft? */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#60A5FA] mb-2">
              Built for Clarity
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              Why Choose VoiceCraft?
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHY_CHOOSE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-[#111A2E] border border-white/10 rounded-2xl p-6 space-y-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB]/20 to-[#9333EA]/20 border border-white/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#60A5FA]" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#A5B4CC] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 6: Use Cases */}
        <section className="border-t border-white/10 py-16 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="max-w-2xl mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA] mb-2">
              Use Cases
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              One Platform, Endless Possibilities
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {USE_CASES.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <div
                  key={useCase.title}
                  className="bg-[#111A2E] border border-white/10 rounded-2xl p-6 space-y-3 hover:border-white/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[#A78BFA]" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {useCase.title}
                  </h3>
                  <p className="text-sm text-[#A5B4CC] leading-relaxed">
                    {useCase.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 7: Gradient Call to Action */}
        <section className="py-10 sm:py-16 px-4 sm:px-6 max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#2563EB] to-[#9333EA] p-8 sm:p-12 lg:p-14 border border-white/15 shadow-2xl">
            <div className="relative z-10 max-w-2xl space-y-5">
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white [text-wrap:balance]">
                Your Words Deserve a Voice.
              </h2>
              <p className="text-base sm:text-lg text-white/90 leading-relaxed">
                Start transforming your text into AI-generated speech with VoiceCraft.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={goToApp}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 min-h-[48px] rounded-xl text-sm sm:text-base font-semibold text-[#080D1C] bg-white hover:bg-slate-100 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 shadow-lg cursor-pointer"
                >
                  Start Voice Generation
                  <Wand2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 8: FAQ */}
        <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="text-left sm:text-center max-w-2xl sm:mx-auto mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#60A5FA] mb-2">
              Questions &amp; Answers
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={item.question}
                  className="bg-[#111A2E] border border-white/10 rounded-2xl overflow-hidden"
                >
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${idx}`}
                      className="w-full min-h-[56px] px-6 py-4 flex items-center justify-between gap-4 text-left font-display text-base sm:text-lg font-semibold text-white hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-[#A5B4CC] shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  {isOpen && (
                    <div
                      id={`faq-panel-${idx}`}
                      className="px-6 pb-5 text-[15px] text-[#A5B4CC] leading-relaxed border-t border-white/10 pt-3.5"
                    >
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact Section */}
        <section
          id="contact"
          className="border-t border-white/10 py-16 sm:py-24 px-4 sm:px-6 max-w-6xl mx-auto"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA]">
                Get in Touch
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Contact VoiceCraft
              </h2>
              <p className="text-[#A5B4CC] text-[15px] leading-relaxed">
                Have questions about VoiceCraft, personal voice profiles, or feedback on
                the AI voice generator? Send us a message or reach our team directly.
              </p>
              <div className="pt-2 space-y-2 text-sm text-[#A5B4CC]">
                <a
                  href="mailto:support@voicecraft.studio"
                  className="inline-flex items-center gap-2 text-white hover:text-[#60A5FA] transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#60A5FA]" aria-hidden="true" />
                  support@voicecraft.studio
                </a>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#111A2E] border border-white/10 rounded-2xl p-6 sm:p-8">
              {contactSubmitted ? (
                <div className="py-6 space-y-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" aria-hidden="true" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-white">
                    Message Received
                  </h3>
                  <p className="text-sm text-[#A5B4CC] leading-relaxed">
                    Thank you for contacting VoiceCraft. Our team will review your note and
                    reply to your email shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setContactSubmitted(false)}
                    className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} noValidate className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="block text-sm font-medium text-white mb-1.5"
                      >
                        Your Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Alex Rahman"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#080D1C] border border-white/15 text-sm text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block text-sm font-medium text-white mb-1.5"
                      >
                        Email Address
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#080D1C] border border-white/15 text-sm text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-sm font-medium text-white mb-1.5"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      required
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="How can we help with VoiceCraft?"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1C] border border-white/15 text-sm text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:border-[#2563EB] resize-y"
                    />
                  </div>

                  {contactError && (
                    <p role="alert" className="text-sm text-rose-400">
                      {contactError}
                    </p>
                  )}

                  <div className="pt-1">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] to-[#9333EA] hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
                    >
                      Send Message
                      <Send className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Section 9: Footer */}
      <footer className="border-t border-white/10 bg-[#080D1C] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-white/10">
            <div className="md:col-span-5 space-y-3">
              <a
                href="#home"
                className="inline-flex items-center whitespace-nowrap rounded-xl"
                aria-label="VoiceCraft Home"
              >
                <span className="inline-flex items-center justify-center bg-white/95 rounded-xl px-3 py-1.5 shadow-sm border border-white/20">
                  <img
                    src="/assets/aistudio/file_00000000f3808211bcfd7bd5316f31f5_6f37ae42.png"
                    alt="VoiceCraft"
                    width={84}
                    height={56}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-11 w-auto object-contain"
                  />
                </span>
              </a>
              <p className="text-sm text-[#A5B4CC] leading-relaxed max-w-sm">
                VoiceCraft is a modern AI voice generation platform designed to turn written
                text into natural-sounding speech with personal voice profile support.
              </p>
            </div>

            <div className="md:col-span-3 space-y-3">
              <h3 className="font-display text-sm font-semibold text-white">Quick Links</h3>
              <ul className="space-y-2 text-sm text-[#A5B4CC]">
                <li>
                  <a href="#features" className="hover:text-white transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-white transition-colors">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-white transition-colors">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="#contact" className="hover:text-white transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-4 space-y-3">
              <h3 className="font-display text-sm font-semibold text-white">
                Platform &amp; Legal
              </h3>
              <ul className="space-y-2 text-sm text-[#A5B4CC]">
                <li>
                  <a href="/app" className="hover:text-white transition-colors">
                    Start Voice Generation
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs sm:text-sm text-[#A5B4CC]">
            <p>© 2026 VoiceCraft. All Rights Reserved.</p>
            <p>AI Voice Generator · Text to Speech Platform</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
