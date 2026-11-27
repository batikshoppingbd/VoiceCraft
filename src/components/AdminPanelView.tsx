import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  LogOut,
  Mic,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Volume2,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiDeleteAudioFile,
  apiGetAdminEngineStatus,
  type AdminEngineStatus,
} from '../lib/api';
import {
  adminFetchAllAudios,
  adminFetchAllVoices,
  adminFetchUsers,
  adminSaveStudioConfig,
  adminSetUserAdminRole,
  adminSetUserStatus,
  BOOTSTRAPPED_ADMIN_EMAIL,
  deleteGeneratedAudioDoc,
  deleteVoiceProfileDoc,
} from '../lib/firebase';
import type {
  AudioFormat,
  GeneratedAudio,
  StudioConfig,
  SupportedLanguage,
  UserProfile,
  VoiceProfile,
} from '../types/studio';

interface AdminPanelViewProps {
  currentUser: UserProfile;
  studioConfig: StudioConfig;
  onSignOut: () => Promise<void>;
}

type AdminSection = 'overview' | 'users' | 'generator' | 'library';

function formatDate(ts: { toDate?: () => Date } | undefined): string {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AdminPanelView({
  currentUser,
  studioConfig,
  onSignOut,
}: AdminPanelViewProps) {
  const [section, setSection] = useState<AdminSection>('overview');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [audios, setAudios] = useState<GeneratedAudio[]>([]);
  const [engineStatus, setEngineStatus] = useState<AdminEngineStatus | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // User filter state
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'admin' | 'active' | 'suspended'>('all');

  // Studio config form state
  const [ttsEnabled, setTtsEnabled] = useState(studioConfig.ttsEnabled);
  const [voiceCloningEnabled, setVoiceCloningEnabled] = useState(studioConfig.voiceCloningEnabled);
  const [maxTextLength, setMaxTextLength] = useState(studioConfig.maxTextLength);
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>(
    studioConfig.defaultLanguage
  );
  const [defaultFormat, setDefaultFormat] = useState<AudioFormat>(studioConfig.defaultFormat);
  const [announcement, setAnnouncement] = useState(studioConfig.announcement || '');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Library moderation state
  const [libraryTab, setLibraryTab] = useState<'voices' | 'audios'>('voices');
  const [librarySearch, setLibrarySearch] = useState('');

  useEffect(() => {
    setTtsEnabled(studioConfig.ttsEnabled);
    setVoiceCloningEnabled(studioConfig.voiceCloningEnabled);
    setMaxTextLength(studioConfig.maxTextLength);
    setDefaultLanguage(studioConfig.defaultLanguage);
    setDefaultFormat(studioConfig.defaultFormat);
    setAnnouncement(studioConfig.announcement || '');
  }, [studioConfig]);

  const loadAllAdminData = async () => {
    setLoadingData(true);
    setDataError(null);
    setEngineError(null);

    try {
      const [userList, voiceList, audioList] = await Promise.all([
        adminFetchUsers(),
        adminFetchAllVoices(),
        adminFetchAllAudios(),
      ]);
      setUsers(userList);
      setVoices(voiceList);
      setAudios(audioList);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Unable to load admin records.');
    }

    try {
      const status = await apiGetAdminEngineStatus();
      setEngineStatus(status);
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : 'Unable to check server API status.');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadAllAdminData();
  }, []);

  const userById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) map.set(u.uid, u);
    return map;
  }, [users]);

  const stats = useMemo(() => {
    const activeCount = users.filter((u) => u.status === 'active').length;
    const suspendedCount = users.filter((u) => u.status === 'suspended').length;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    return {
      totalUsers: users.length,
      activeCount,
      suspendedCount,
      adminCount,
      totalVoices: voices.length,
      totalAudios: audios.length,
    };
  }, [users, voices, audios]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userFilter === 'admin' && u.role !== 'admin') return false;
      if (userFilter === 'active' && u.status !== 'active') return false;
      if (userFilter === 'suspended' && u.status !== 'suspended') return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userFilter]);

  const filteredVoices = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter((v) => {
      const owner = userById.get(v.userId);
      return (
        v.name.toLowerCase().includes(q) ||
        (owner?.email || '').toLowerCase().includes(q) ||
        (owner?.displayName || '').toLowerCase().includes(q)
      );
    });
  }, [voices, librarySearch, userById]);

  const filteredAudios = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return audios;
    return audios.filter((a) => {
      const owner = userById.get(a.userId);
      return (
        (a.title || a.text).toLowerCase().includes(q) ||
        a.voiceName.toLowerCase().includes(q) ||
        (owner?.email || '').toLowerCase().includes(q)
      );
    });
  }, [audios, librarySearch, userById]);

  const handleToggleStatus = async (target: UserProfile) => {
    const nextStatus = target.status === 'active' ? 'suspended' : 'active';
    setBusyId(`status-${target.uid}`);
    setDataError(null);
    try {
      await adminSetUserStatus(target.uid, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, status: nextStatus } : u))
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAdminRole = async (target: UserProfile) => {
    const makeAdmin = target.role !== 'admin';
    setBusyId(`role-${target.uid}`);
    setDataError(null);
    try {
      await adminSetUserAdminRole(target, makeAdmin, currentUser.uid);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === target.uid ? { ...u, role: makeAdmin ? 'admin' : 'user' } : u
        )
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to update user role.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      await adminSaveStudioConfig(
        {
          ttsEnabled,
          voiceCloningEnabled,
          maxTextLength,
          defaultLanguage,
          defaultFormat,
          announcement: announcement.trim(),
        },
        currentUser.uid
      );
      setConfigSaved(true);
      window.setTimeout(() => setConfigSaved(false), 3000);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Unable to save studio config.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteVoice = async (voice: VoiceProfile) => {
    setBusyId(`voice-${voice.id}`);
    setDataError(null);
    try {
      await deleteVoiceProfileDoc(voice.id);
      if (voice.sampleAudioId) {
        await apiDeleteAudioFile('samples', voice.sampleAudioId).catch(() => undefined);
      }
      if (voice.previewAudioId) {
        await apiDeleteAudioFile('generated', voice.previewAudioId).catch(() => undefined);
      }
      setVoices((prev) => prev.filter((v) => v.id !== voice.id));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to delete voice profile.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAudio = async (audio: GeneratedAudio) => {
    setBusyId(`audio-${audio.id}`);
    setDataError(null);
    try {
      await deleteGeneratedAudioDoc(audio.id);
      await apiDeleteAudioFile('generated', audio.serverAudioId).catch(() => undefined);
      setAudios((prev) => prev.filter((a) => a.id !== audio.id));
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to delete generated audio.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#080D1C] text-white flex flex-col">
      {/* Top Admin Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[#080D1C]/95 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="inline-flex items-center bg-white/95 rounded-lg px-2 py-0.5 shrink-0"
              title="VoiceCraft Home"
            >
              <img
                src="/assets/aistudio/file_00000000f3808211bcfd7bd5316f31f5_6f37ae42.png"
                alt="VoiceCraft"
                width={54}
                height={36}
                referrerPolicy="no-referrer"
                className="h-7 w-auto object-contain"
              />
            </a>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white truncate">
              <Shield className="w-4 h-4 text-[#9333EA] shrink-0" />
              <span className="truncate">Admin Console</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/app"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              <span>Open Studio</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-xs font-medium text-[#A5B4CC] hover:text-red-200 transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header & Signed-in Identity */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              Platform Administration
            </h1>
            <p className="text-sm text-[#A5B4CC] mt-1">
              Manage registered Google users, voice generator limits, cloned voices, and API status.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-white">{currentUser.displayName}</div>
              <div className="text-[11px] text-[#A5B4CC]">{currentUser.email}</div>
            </div>
            <button
              type="button"
              onClick={() => void loadAllAdminData()}
              disabled={loadingData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#111A2E] border border-white/10 hover:border-white/25 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>

        {/* Section Sub-Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {(
            [
              { id: 'overview', label: 'Overview & API', icon: Activity },
              { id: 'users', label: `Users (${stats.totalUsers})`, icon: Users },
              { id: 'generator', label: 'Voice Generator', icon: Sliders },
              {
                id: 'library',
                label: `Voices & Audio (${stats.totalVoices + stats.totalAudios})`,
                icon: Volume2,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#9333EA] text-white'
                    : 'bg-[#111A2E] border border-white/10 text-[#A5B4CC] hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {dataError && (
          <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200">
            {dataError}
          </div>
        )}

        {/* TAB 1: OVERVIEW & SERVER API STATUS */}
        {section === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Registered Users</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
                  {stats.totalUsers}
                </div>
                <div className="mt-1 text-xs text-[#A5B4CC] tabular-nums">
                  {stats.adminCount} admin · {stats.suspendedCount} suspended
                </div>
              </div>

              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Active Accounts</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-emerald-400">
                  {stats.activeCount}
                </div>
                <div className="mt-1 text-xs text-[#A5B4CC]">Google Sign-In verified</div>
              </div>

              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Cloned Voices</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
                  {stats.totalVoices}
                </div>
                <div className="mt-1 text-xs text-[#A5B4CC]">
                  Cloning {studioConfig.voiceCloningEnabled ? 'enabled' : 'paused'}
                </div>
              </div>

              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Generated Audio Clips</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
                  {stats.totalAudios}
                </div>
                <div className="mt-1 text-xs text-[#A5B4CC]">
                  Generator {studioConfig.ttsEnabled ? 'enabled' : 'paused'}
                </div>
              </div>
            </div>

            {/* Live Server API Engine Card */}
            <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Server API Key & Synthesis Engine
                    </h2>
                    <p className="text-xs text-[#A5B4CC]">
                      Live server-side check (keys stay strictly in server environment variables).
                    </p>
                  </div>
                </div>

                {engineStatus && (
                  <span
                    className={`text-xs font-semibold ${
                      engineStatus.geminiConfigured ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {engineStatus.geminiConfigured
                      ? 'GEMINI_API_KEY Active'
                      : 'GEMINI_API_KEY Missing'}
                  </span>
                )}
              </div>

              {engineError ? (
                <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                  {engineError}
                </div>
              ) : engineStatus ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-[#080D1C] border border-white/10 space-y-1">
                    <div className="text-[11px] font-medium text-[#A5B4CC]">API Key State</div>
                    <div
                      className={`text-sm font-semibold ${
                        engineStatus.geminiConfigured ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {engineStatus.geminiConfigured
                        ? 'Configured in Server Env'
                        : 'Not Found in Server Env'}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#080D1C] border border-white/10 space-y-1">
                    <div className="text-[11px] font-medium text-[#A5B4CC]">Active Models</div>
                    <div className="text-xs font-mono text-white flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#9333EA] shrink-0" />
                      <span className="truncate">
                        {engineStatus.modelAnalysis} / {engineStatus.modelTts}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#080D1C] border border-white/10 space-y-1">
                    <div className="text-[11px] font-medium text-[#A5B4CC]">Runtime Environment</div>
                    <div className="text-sm font-semibold text-white uppercase">
                      {engineStatus.runtime}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[#A5B4CC]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking server API configuration...</span>
                </div>
              )}

              <div className="p-4 rounded-xl bg-[#080D1C] border border-white/10 text-xs text-[#A5B4CC] leading-relaxed">
                For security, <code className="text-white">GEMINI_API_KEY</code> is never stored in
                the database or exposed in browser inputs. To update or rotate your key on Vercel,
                open <strong className="text-white">Vercel Dashboard → Project Settings → Environment Variables</strong>,
                set <code className="text-white">GEMINI_API_KEY</code>, and redeploy.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {section === 'users' && (
          <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#A5B4CC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by name or Google email..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="grid grid-cols-4 sm:inline-grid gap-1 p-1 bg-[#080D1C] border border-white/10 rounded-xl">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'admin', label: 'Admins' },
                    { id: 'active', label: 'Active' },
                    { id: 'suspended', label: 'Suspended' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setUserFilter(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      userFilter === opt.id
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#A5B4CC] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#A5B4CC]">
                No users match the current search or filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-[#A5B4CC]">
                      <th className="py-3 pr-4">User</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Joined</th>
                      <th className="py-3 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-sm">
                    {filteredUsers.map((u) => {
                      const isSelf = u.uid === currentUser.uid;
                      const isBootstrappedOwner =
                        u.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                      const locked = isSelf || isBootstrappedOwner;

                      return (
                        <tr key={u.uid} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-3 min-w-0">
                              {u.photoURL ? (
                                <img
                                  src={u.photoURL}
                                  alt={u.displayName}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-white/10"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-600/25 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-300 shrink-0">
                                  {u.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-white truncate">
                                  {u.displayName}
                                  {isSelf && (
                                    <span className="ml-1.5 text-[11px] font-normal text-[#A5B4CC]">
                                      (You)
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#A5B4CC] truncate">{u.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                u.role === 'admin' ? 'text-purple-400' : 'text-[#A5B4CC]'
                              }`}
                            >
                              {u.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold ${
                                u.status === 'active' ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {u.status === 'active' ? 'Active' : 'Suspended'}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap text-xs text-[#A5B4CC] tabular-nums">
                            {formatDate(u.createdAt)}
                          </td>

                          <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                            {locked ? (
                              <span className="text-xs text-[#A5B4CC]/70">Protected</span>
                            ) : (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyId !== null}
                                  onClick={() => void handleToggleAdminRole(u)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-white/10 bg-[#080D1C] hover:border-purple-400/50 text-xs font-medium text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <Shield className="w-3.5 h-3.5 text-purple-400" />
                                  {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                </button>

                                <button
                                  type="button"
                                  disabled={busyId !== null}
                                  onClick={() => void handleToggleStatus(u)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border text-xs font-medium disabled:opacity-50 cursor-pointer ${
                                    u.status === 'active'
                                      ? 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {u.status === 'active' ? (
                                    <>
                                      <UserX className="w-3.5 h-3.5" />
                                      Suspend
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="w-3.5 h-3.5" />
                                      Activate
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: VOICE GENERATOR CONTROLS */}
        {section === 'generator' && (
          <form
            onSubmit={handleSaveConfig}
            className="bg-[#111A2E] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-6 max-w-3xl"
          >
            <div>
              <h2 className="text-base font-bold text-white">
                Voice Generator & Cloning Controls
              </h2>
              <p className="text-xs text-[#A5B4CC] mt-1">
                Changes apply immediately for all signed-in VoiceCraft users.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl bg-[#080D1C] border border-white/10 cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-white">Voice Generator (TTS)</div>
                  <div className="text-xs text-[#A5B4CC] mt-0.5">
                    Allow members to synthesize speech from text.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(e) => setTtsEnabled(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded accent-[#2563EB]"
                />
              </label>

              <label className="flex items-start justify-between gap-3 p-4 rounded-xl bg-[#080D1C] border border-white/10 cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-white">Voice Cloning</div>
                  <div className="text-xs text-[#A5B4CC] mt-0.5">
                    Allow members to analyze and clone new voices.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={voiceCloningEnabled}
                  onChange={(e) => setVoiceCloningEnabled(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded accent-[#2563EB]"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="admin-max-chars"
                  className="block text-xs font-medium text-[#A5B4CC] mb-1.5"
                >
                  Max Characters / Request
                </label>
                <input
                  id="admin-max-chars"
                  type="number"
                  min={200}
                  max={5000}
                  step={100}
                  value={maxTextLength}
                  onChange={(e) => setMaxTextLength(Number(e.target.value) || 200)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums rounded-xl border border-white/10 bg-[#080D1C] text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-default-lang"
                  className="block text-xs font-medium text-[#A5B4CC] mb-1.5"
                >
                  Default Language
                </label>
                <select
                  id="admin-default-lang"
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value as SupportedLanguage)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা</option>
                  <option value="bilingual">Bilingual</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="admin-default-fmt"
                  className="block text-xs font-medium text-[#A5B4CC] mb-1.5"
                >
                  Default Export Format
                </label>
                <select
                  id="admin-default-fmt"
                  value={defaultFormat}
                  onChange={(e) => setDefaultFormat(e.target.value as AudioFormat)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="wav">WAV (Lossless)</option>
                  <option value="mp3">MP3 (192kbps)</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-announcement"
                className="block text-xs font-medium text-[#A5B4CC] mb-1.5"
              >
                Studio Announcement Banner (Optional)
              </label>
              <input
                id="admin-announcement"
                type="text"
                maxLength={300}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="e.g. Scheduled maintenance tonight at 11 PM..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white placeholder:text-[#A5B4CC]/50 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {configError && (
              <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                {configError}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                {configSaved && (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Studio configuration saved</span>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-gradient-to-r from-[#2563EB] to-[#9333EA] text-white hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                {savingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Studio Controls
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: VOICES & AUDIO LIBRARY MODERATION */}
        {section === 'library' && (
          <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="grid grid-cols-2 sm:inline-grid gap-1 p-1 bg-[#080D1C] border border-white/10 rounded-xl">
                <button
                  type="button"
                  onClick={() => setLibraryTab('voices')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    libraryTab === 'voices'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#A5B4CC] hover:text-white'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Cloned Voices ({voices.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryTab('audios')}
                  className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    libraryTab === 'audios'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#A5B4CC] hover:text-white'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Generated Clips ({audios.length})</span>
                </button>
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#A5B4CC] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search by voice, clip title, or owner email..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            {libraryTab === 'voices' ? (
              filteredVoices.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#A5B4CC]">
                  No cloned voice profiles found.
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {filteredVoices.map((v) => {
                    const owner = userById.get(v.userId);
                    return (
                      <div
                        key={v.id}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{v.name}</div>
                          <div className="text-xs text-[#A5B4CC] truncate">
                            Owner: {owner?.email || v.userId} · {v.pitchRegister} · {v.language}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteVoice(v)}
                          disabled={busyId !== null}
                          aria-label={`Delete voice ${v.name}`}
                          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#A5B4CC] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                        >
                          {busyId === `voice-${v.id}` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : filteredAudios.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#A5B4CC]">
                No generated audio clips found.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {filteredAudios.map((a) => {
                  const owner = userById.get(a.userId);
                  return (
                    <div
                      key={a.id}
                      className="py-3.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {a.title || a.text.slice(0, 60)}
                        </div>
                        <div className="text-xs text-[#A5B4CC] truncate">
                          Owner: {owner?.email || a.userId} · Voice: {a.voiceName} ·{' '}
                          <span className="font-mono tabular-nums">{a.durationSec}s</span> ·{' '}
                          {a.format.toUpperCase()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAudio(a)}
                        disabled={busyId !== null}
                        aria-label={`Delete audio ${a.title || a.id}`}
                        className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#A5B4CC] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                      >
                        {busyId === `audio-${a.id}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
