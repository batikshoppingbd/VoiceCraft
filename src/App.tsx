import {
  Home,
  Moon,
  Plus,
  Sliders,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/LegalPage';
import { ProfileView } from './components/ProfileView';
import { StudioAudioPlayer } from './components/StudioAudioPlayer';
import { TtsStudioView } from './components/TtsStudioView';
import {
  DEFAULT_STUDIO_CONFIG,
  getWorkspaceId,
  loadStudioConfig,
  loadUserSettings,
  subscribeGeneratedAudios,
  subscribeStudioConfig,
  subscribeUserSettings,
  subscribeVoices,
  updateUserSettings,
} from './lib/studioStore';
import type {
  ActiveAudioTrack,
  GeneratedAudio,
  ProfileSection,
  StudioConfig,
  StudioTab,
  ThemeMode,
  UserSettings,
  VoiceProfile,
} from './types/studio';

function MobileStudioApp({ studioConfig }: { studioConfig: StudioConfig }) {
  const userId = getWorkspaceId();
  const [userSettings, setUserSettings] = useState<UserSettings>(() => loadUserSettings());
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [generatedAudios, setGeneratedAudios] = useState<GeneratedAudio[]>([]);

  const [activeTab, setActiveTab] = useState<StudioTab>('home');
  const [profileSection, setProfileSection] = useState<ProfileSection>('settings');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(
    () => loadUserSettings().defaultVoiceId || null
  );
  const [activeTrack, setActiveTrack] = useState<ActiveAudioTrack | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const pref = loadUserSettings().themePreference;
    if (pref === 'dark' || pref === 'light') {
      return pref;
    }
    try {
      const saved = window.localStorage.getItem('voicecraft-theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('voicecraft-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const handleSetTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    void updateUserSettings({ themePreference: nextTheme });
  };

  useEffect(() => {
    const unsubSettings = subscribeUserSettings(setUserSettings);
    const unsubVoices = subscribeVoices((list) => {
      setVoices(list);
      if (list.length > 0) {
        setSelectedVoiceId((current) => {
          if (current && list.some((v) => v.id === current)) return current;
          const savedDefault = loadUserSettings().defaultVoiceId;
          if (savedDefault && list.some((v) => v.id === savedDefault)) {
            return savedDefault;
          }
          return list[0].id;
        });
      }
    });
    const unsubGen = subscribeGeneratedAudios(setGeneratedAudios);

    return () => {
      unsubSettings();
      unsubVoices();
      unsubGen();
    };
  }, []);

  const tabTitle =
    activeTab === 'home'
      ? 'Home'
      : activeTab === 'generate'
      ? 'Generate'
      : 'Profile';

  const displayInitial = (userSettings.displayName || 'V').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Compact Mobile-First Sticky Top App Bar (56px) */}
      <header className="sticky top-0 z-30 h-14 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex items-center whitespace-nowrap shrink-0 rounded-xl"
            title="VoiceCraft Home"
            aria-label="VoiceCraft Home"
          >
            <span className="inline-flex items-center justify-center dark:bg-white/95 rounded-lg dark:px-2 py-0.5 transition-colors">
              <img
                src="/assets/aistudio/file_00000000f3808211bcfd7bd5316f31f5_6f37ae42.png"
                alt="VoiceCraft"
                width={54}
                height={36}
                referrerPolicy="no-referrer"
                className="h-8 w-auto object-contain"
              />
            </span>
          </a>

          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
            {tabTitle}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Console</span>
            </a>

            <button
              type="button"
              onClick={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Open Profile"
              title={userSettings.displayName || 'Profile'}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
                activeTab === 'profile'
                  ? 'ring-2 ring-blue-600'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2563EB] to-[#9333EA] text-white text-xs font-bold flex items-center justify-center">
                {displayInitial}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable App Content */}
      <main
        className={`flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 min-w-0 ${
          activeTrack ? 'pb-48 sm:pb-44' : 'pb-24'
        }`}
      >
        {studioConfig.announcement && (
          <div className="mb-4 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/40 text-xs font-medium text-blue-800 dark:text-blue-200">
            {studioConfig.announcement}
          </div>
        )}

        {activeTab === 'home' && (
          <HomeView
            userId={userId}
            generatedAudios={generatedAudios}
            activeTrackId={activeTrack?.id || null}
            onPlayTrack={setActiveTrack}
            onGoGenerate={() => setActiveTab('generate')}
            defaultFormat={userSettings.defaultFormat || studioConfig.defaultFormat || 'wav'}
          />
        )}

        {activeTab === 'generate' && (
          <TtsStudioView
            userId={userId}
            userSettings={userSettings}
            studioConfig={studioConfig}
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
            onGoSettings={() => {
              setProfileSection('clone');
              setActiveTab('profile');
            }}
            onGeneratedSuccess={() => {
              // Home library updates live via store subscription
            }}
            onPlayTrack={setActiveTrack}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            userId={userId}
            userSettings={userSettings}
            studioConfig={studioConfig}
            voices={voices}
            generatedCount={generatedAudios.length}
            theme={theme}
            activeSection={profileSection}
            onChangeSection={setProfileSection}
            onSetTheme={handleSetTheme}
            onVoiceCreated={(voiceId) => {
              setSelectedVoiceId(voiceId);
            }}
            onUseVoiceInGenerator={(voiceId) => {
              setSelectedVoiceId(voiceId);
              setActiveTab('generate');
            }}
            onPlayTrack={setActiveTrack}
          />
        )}
      </main>

      {/* Floating Audio Player Dock above Bottom Nav */}
      {activeTrack && (
        <div className="fixed bottom-[68px] left-0 right-0 z-30 px-3 sm:px-6 pointer-events-none">
          <div className="max-w-4xl mx-auto pointer-events-auto shadow-lg rounded-2xl">
            <StudioAudioPlayer
              track={activeTrack}
              userId={userId}
              onClose={() => setActiveTrack(null)}
              compact
              playbackSpeed={userSettings.playbackSpeed || 1.0}
              autoPlay={userSettings.autoPlayAfterGenerate ?? true}
            />
          </div>
        </div>
      )}

      {/* Fixed 3-Tab Mobile Bottom Navigation Bar: Home | Generate (+) | Profile */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800"
      >
        <div className="max-w-xl mx-auto h-full grid grid-cols-3 items-center px-4">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'home'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Home</span>
          </button>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setActiveTab('generate')}
              aria-label="Generate voice"
              className={`min-w-[52px] min-h-[44px] px-4 rounded-2xl flex items-center justify-center transition-transform active:scale-95 ${
                activeTab === 'generate'
                  ? 'bg-blue-700 text-white shadow-md shadow-blue-600/25'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }`}
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            aria-label="Profile"
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'profile'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const pathname =
    typeof window !== 'undefined'
      ? window.location.pathname.replace(/\/+$/, '') || '/'
      : '/';

  const isStudioApp = pathname === '/app' || pathname.startsWith('/app/');
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPrivacy = pathname === '/privacy' || pathname === '/privacy-policy';
  const isTerms = pathname === '/terms' || pathname.startsWith('/terms-of-service');

  const [studioConfig, setStudioConfig] = useState<StudioConfig>(() =>
    typeof window !== 'undefined' ? loadStudioConfig() : DEFAULT_STUDIO_CONFIG
  );

  useEffect(() => {
    return subscribeStudioConfig(setStudioConfig);
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      document.title = 'Studio Console — VoiceCraft';
    } else if (isStudioApp) {
      document.title = 'VoiceCraft Studio — AI Voice Generator App';
    } else if (isPrivacy) {
      document.title = 'Privacy Policy — VoiceCraft';
    } else if (isTerms) {
      document.title = 'Terms of Service — VoiceCraft';
    } else {
      document.title = 'VoiceCraft – AI Voice Generator | Convert Text to Speech Online';
    }
  }, [isAdminRoute, isStudioApp, isPrivacy, isTerms]);

  return (
    <ErrorBoundary>
      {isAdminRoute ? (
        <AdminPanelView studioConfig={studioConfig} />
      ) : isStudioApp ? (
        <MobileStudioApp studioConfig={studioConfig} />
      ) : isPrivacy ? (
        <LegalPage type="privacy" />
      ) : isTerms ? (
        <LegalPage type="terms" />
      ) : (
        <LandingPage />
      )}
    </ErrorBoundary>
  );
}
