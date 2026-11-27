import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AudioLines, Home, Moon, Plus, Settings, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import { SettingsAndCloneView } from './components/SettingsAndCloneView';
import { StudioAudioPlayer } from './components/StudioAudioPlayer';
import { TtsStudioView } from './components/TtsStudioView';
import {
  db,
  ensureWorkspaceProfile,
  getWorkspaceId,
  handleFirestoreError,
  OperationType,
  updateUserSettings,
} from './lib/firebase';
import type {
  ActiveAudioTrack,
  GeneratedAudio,
  StudioTab,
  ThemeMode,
  UserProfile,
  VoiceProfile,
} from './types/studio';

function MobileStudioApp() {
  const [workspaceId] = useState<string>(() => getWorkspaceId());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [generatedAudios, setGeneratedAudios] = useState<GeneratedAudio[]>([]);

  const [activeTab, setActiveTab] = useState<StudioTab>('home');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<ActiveAudioTrack | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
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
    void updateUserSettings(workspaceId, { themePreference: nextTheme }).catch(
      () => undefined
    );
  };

  useEffect(() => {
    let active = true;
    void ensureWorkspaceProfile(workspaceId)
      .then((profile) => {
        if (!active) return;
        setUserProfile(profile);
        if (profile.themePreference === 'dark' || profile.themePreference === 'light') {
          setTheme(profile.themePreference);
        }
      })
      .catch((err) => console.error('Workspace init error:', err));

    const unsubUser = onSnapshot(
      doc(db, 'users', workspaceId),
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${workspaceId}`)
    );

    const voicesQuery = query(
      collection(db, 'voiceProfiles'),
      where('userId', '==', workspaceId)
    );
    const unsubVoices = onSnapshot(
      voicesQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as VoiceProfile)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setVoices(list);
        if (list.length > 0 && !selectedVoiceId) {
          setSelectedVoiceId(list[0].id);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'voiceProfiles')
    );

    const genQuery = query(
      collection(db, 'generatedAudios'),
      where('userId', '==', workspaceId)
    );
    const unsubGen = onSnapshot(
      genQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as GeneratedAudio)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setGeneratedAudios(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'generatedAudios')
    );

    return () => {
      active = false;
      unsubUser();
      unsubVoices();
      unsubGen();
    };
  }, [workspaceId]);

  const tabTitle =
    activeTab === 'home'
      ? 'Home'
      : activeTab === 'generate'
      ? 'Generate'
      : 'Settings';

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Compact Mobile-First Sticky Top App Bar (56px) */}
      <header className="sticky top-0 z-30 h-14 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <AudioLines className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-display text-base font-bold tracking-tight">
              VoiceCraft
            </span>
          </div>

          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
            {tabTitle}
          </span>

          <button
            type="button"
            onClick={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Scrollable App Content */}
      <main
        className={`flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5 min-w-0 ${
          activeTrack ? 'pb-48 sm:pb-44' : 'pb-24'
        }`}
      >
        {activeTab === 'home' && (
          <HomeView
            userId={workspaceId}
            generatedAudios={generatedAudios}
            activeTrackId={activeTrack?.id || null}
            onPlayTrack={setActiveTrack}
            onGoGenerate={() => setActiveTab('generate')}
            defaultFormat={userProfile?.defaultFormat || 'wav'}
          />
        )}

        {activeTab === 'generate' && (
          <TtsStudioView
            userId={workspaceId}
            userProfile={userProfile}
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
            onGoSettings={() => setActiveTab('settings')}
            onGeneratedSuccess={() => {
              // Keep user on generate or let them inspect player; Home updates live
            }}
            onPlayTrack={setActiveTrack}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsAndCloneView
            userId={workspaceId}
            userProfile={userProfile}
            voices={voices}
            theme={theme}
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
              userId={workspaceId}
              onClose={() => setActiveTrack(null)}
              compact
            />
          </div>
        </div>
      )}

      {/* Fixed 3-Tab Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Primary navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800"
      >
        <div className="max-w-xl mx-auto h-full grid grid-cols-3 items-center px-4">
          {/* Tab 1: Home */}
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

          {/* Tab 2: Plus (+) Generate */}
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

          {/* Tab 3: Settings & Voice Clone */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'settings'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[11px] font-medium tracking-tight">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MobileStudioApp />
    </ErrorBoundary>
  );
}
