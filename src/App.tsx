import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Home,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import { LandingPage } from './components/LandingPage';
import { LegalPage } from './components/LegalPage';
import { SettingsAndCloneView } from './components/SettingsAndCloneView';
import { StudioAudioPlayer } from './components/StudioAudioPlayer';
import { TtsStudioView } from './components/TtsStudioView';
import {
  auth,
  db,
  DEFAULT_STUDIO_CONFIG,
  ensureAuthenticatedUserProfile,
  handleFirestoreError,
  OperationType,
  signOutUser,
  subscribeStudioConfig,
  updateUserSettings,
} from './lib/firebase';
import type {
  ActiveAudioTrack,
  GeneratedAudio,
  StudioConfig,
  StudioTab,
  ThemeMode,
  UserProfile,
  VoiceProfile,
} from './types/studio';

interface MobileStudioAppProps {
  firebaseUser: User;
  initialProfile: UserProfile;
  isAdmin: boolean;
  studioConfig: StudioConfig;
  onSignOut: () => Promise<void>;
}

function MobileStudioApp({
  firebaseUser,
  initialProfile,
  isAdmin,
  studioConfig,
  onSignOut,
}: MobileStudioAppProps) {
  const userId = firebaseUser.uid;
  const [userProfile, setUserProfile] = useState<UserProfile>(initialProfile);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [generatedAudios, setGeneratedAudios] = useState<GeneratedAudio[]>([]);

  const [activeTab, setActiveTab] = useState<StudioTab>('home');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<ActiveAudioTrack | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (
      initialProfile.themePreference === 'dark' ||
      initialProfile.themePreference === 'light'
    ) {
      return initialProfile.themePreference;
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
    void updateUserSettings(userId, { themePreference: nextTheme }).catch(() => undefined);
  };

  useEffect(() => {
    const unsubUser = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${userId}`)
    );

    const voicesQuery = query(
      collection(db, 'voiceProfiles'),
      where('userId', '==', userId)
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
      where('userId', '==', userId)
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
      unsubUser();
      unsubVoices();
      unsubGen();
    };
  }, [userId]);

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
            {isAdmin && (
              <a
                href="/admin"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
            defaultFormat={userProfile?.defaultFormat || studioConfig.defaultFormat || 'wav'}
          />
        )}

        {activeTab === 'generate' && (
          <TtsStudioView
            userId={userId}
            userProfile={userProfile}
            studioConfig={studioConfig}
            isAdmin={isAdmin}
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            onSelectVoiceId={setSelectedVoiceId}
            onGoSettings={() => setActiveTab('settings')}
            onGeneratedSuccess={() => {
              // Home library updates live via Firestore snapshot
            }}
            onPlayTrack={setActiveTrack}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsAndCloneView
            userId={userId}
            userProfile={userProfile}
            studioConfig={studioConfig}
            isAdmin={isAdmin}
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
            onSignOut={onSignOut}
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

function AuthenticatedRouter({ isAdminRoute }: { isAdminRoute: boolean }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>(DEFAULT_STUDIO_CONFIG);

  useEffect(() => {
    let unsubConfig: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubConfig) {
        unsubConfig();
        unsubConfig = null;
      }

      if (!user) {
        setFirebaseUser(null);
        setUserProfile(null);
        setIsAdmin(false);
        setAuthError(null);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      setAuthError(null);
      try {
        const result = await ensureAuthenticatedUserProfile(user);
        setFirebaseUser(user);
        setUserProfile(result.profile);
        setIsAdmin(result.isAdmin);
        unsubConfig = subscribeStudioConfig(setStudioConfig);
      } catch (err) {
        setFirebaseUser(user);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to initialize your account profile.'
        );
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubConfig) unsubConfig();
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080D1C] text-white flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm text-[#A5B4CC]">
          <Loader2 className="w-5 h-5 animate-spin text-[#2563EB]" />
          <span>Loading VoiceCraft workspace...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate targetLabel={isAdminRoute ? 'Admin Console' : 'VoiceCraft Studio'} />;
  }

  if (authError || !userProfile) {
    return (
      <div className="min-h-screen bg-[#080D1C] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#111A2E] border border-white/10 rounded-2xl p-6 space-y-4 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h1 className="font-display text-lg font-bold">Account Initialization Error</h1>
          <p className="text-xs text-[#A5B4CC] leading-relaxed">
            {authError || 'Could not load your profile. Please sign in again.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/15"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (userProfile.status === 'suspended') {
    return (
      <div className="min-h-screen bg-[#080D1C] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#111A2E] border border-red-500/30 rounded-2xl p-6 space-y-4 text-center">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <h1 className="font-display text-lg font-bold">Account Suspended</h1>
          <p className="text-sm text-[#A5B4CC] leading-relaxed">
            Access for <strong className="text-white">{userProfile.email}</strong> has been
            suspended by the workspace administrator.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <a
              href="/"
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-white/10 text-[#A5B4CC] hover:text-white"
            >
              Back to Home
            </a>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAdminRoute) {
    if (!isAdmin) {
      return (
        <div className="min-h-screen bg-[#080D1C] text-white flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-[#111A2E] border border-white/10 rounded-2xl p-6 space-y-4 text-center">
            <Shield className="w-8 h-8 text-purple-400 mx-auto" />
            <h1 className="font-display text-lg font-bold">Administrator Access Required</h1>
            <p className="text-sm text-[#A5B4CC] leading-relaxed">
              You are currently signed in as <strong className="text-white">{userProfile.email}</strong>,
              which is a standard member account.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <a
                href="/app"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-[#2563EB] to-[#9333EA] text-white"
              >
                Open Studio
              </a>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-white/10 text-[#A5B4CC] hover:text-white"
              >
                <LogOut className="w-3.5 h-3.5" />
                Switch Google Account
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <AdminPanelView
        currentUser={userProfile}
        studioConfig={studioConfig}
        onSignOut={signOutUser}
      />
    );
  }

  return (
    <MobileStudioApp
      firebaseUser={firebaseUser}
      initialProfile={userProfile}
      isAdmin={isAdmin}
      studioConfig={studioConfig}
      onSignOut={signOutUser}
    />
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
  const isTerms = pathname === '/terms' || pathname === '/terms-of-service';

  useEffect(() => {
    if (isAdminRoute) {
      document.title = 'Admin Console — VoiceCraft';
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
      {isAdminRoute || isStudioApp ? (
        <AuthenticatedRouter isAdminRoute={isAdminRoute} />
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
