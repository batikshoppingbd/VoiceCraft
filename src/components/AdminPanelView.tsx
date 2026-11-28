import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Mic,
  RefreshCw,
  Search,
  Sliders,
  Trash2,
  Volume2,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiDeleteAudioFile,
  apiGetAdminEngineStatus,
  type AdminEngineStatus,
} from '../lib/api';
import {
  deleteGeneratedAudioDoc,
  deleteVoiceProfileDoc,
  fetchAllAudios,
  fetchAllVoices,
  saveStudioConfig,
} from '../lib/studioStore';
import type {
  AudioFormat,
  GeneratedAudio,
  StudioConfig,
  SupportedLanguage,
  VoiceProfile,
} from '../types/studio';

interface AdminPanelViewProps {
  studioConfig: StudioConfig;
}

type AdminSection = 'overview' | 'generator' | 'library';

export function AdminPanelView({ studioConfig }: AdminPanelViewProps) {
  const [section, setSection] = useState<AdminSection>('overview');

  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [audios, setAudios] = useState<GeneratedAudio[]>([]);
  const [engineStatus, setEngineStatus] = useState<AdminEngineStatus | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const loadStudioData = async () => {
    setLoadingData(true);
    setDataError(null);
    setEngineError(null);

    try {
      setVoices(fetchAllVoices());
      setAudios(fetchAllAudios());
      const status = await apiGetAdminEngineStatus();
      setEngineStatus(status);
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : 'Unable to check server API status.');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void loadStudioData();
  }, []);

  const filteredVoices = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return voices;
    return voices.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.pitchRegister.toLowerCase().includes(q) ||
        v.language.toLowerCase().includes(q)
    );
  }, [voices, librarySearch]);

  const filteredAudios = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return audios;
    return audios.filter(
      (a) =>
        (a.title || a.text).toLowerCase().includes(q) ||
        a.voiceName.toLowerCase().includes(q)
    );
  }, [audios, librarySearch]);

  const handleSaveConfig = async (e: FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      await saveStudioConfig({
        ttsEnabled,
        voiceCloningEnabled,
        maxTextLength,
        defaultLanguage,
        defaultFormat,
        announcement: announcement.trim(),
      });
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
      {/* Top Studio Console Bar */}
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
              <Sliders className="w-4 h-4 text-[#9333EA] shrink-0" />
              <span className="truncate">Studio Console</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/app"
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-gradient-to-r from-[#2563EB] to-[#9333EA] text-xs font-semibold text-white hover:opacity-95 transition-opacity whitespace-nowrap"
            >
              <span>Open Studio</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              Studio Engine &amp; Controls
            </h1>
            <p className="text-sm text-[#A5B4CC] mt-1">
              Inspect Gemini API engine readiness, customize voice generator defaults, and manage local clips.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadStudioData()}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#111A2E] border border-white/10 hover:border-white/25 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Section Sub-Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {(
            [
              { id: 'overview', label: 'Overview & API', icon: Activity },
              { id: 'generator', label: 'Voice Generator', icon: Sliders },
              {
                id: 'library',
                label: `Voices & Audio (${voices.length + audios.length})`,
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Access Mode</div>
                <div className="mt-2 text-2xl font-bold text-emerald-400">Open Studio</div>
                <div className="mt-1 text-xs text-[#A5B4CC]">No login or registration required</div>
              </div>

              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Saved Voices</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
                  {voices.length}
                </div>
                <div className="mt-1 text-xs text-[#A5B4CC]">
                  Cloning {studioConfig.voiceCloningEnabled ? 'enabled' : 'paused'}
                </div>
              </div>

              <div className="bg-[#111A2E] border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-medium text-[#A5B4CC]">Generated Audio Clips</div>
                <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
                  {audios.length}
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
                      Server API Key &amp; Synthesis Engine
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
                For Vercel hosting, only <code className="text-white">GEMINI_API_KEY</code> is required
                in <strong className="text-white">Vercel Dashboard → Project Settings → Environment Variables</strong>.
                No Firebase Auth, OAuth Client ID, or Login setup is required.
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: VOICE GENERATOR CONTROLS */}
        {section === 'generator' && (
          <form
            onSubmit={handleSaveConfig}
            className="bg-[#111A2E] border border-white/10 rounded-2xl p-5 sm:p-6 space-y-6 max-w-3xl"
          >
            <div>
              <h2 className="text-base font-bold text-white">
                Voice Generator &amp; Cloning Controls
              </h2>
              <p className="text-xs text-[#A5B4CC] mt-1">
                Configure speech generation limits, default export preferences, and studio banner notices.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl bg-[#080D1C] border border-white/10 cursor-pointer">
                <div>
                  <div className="text-sm font-semibold text-white">Voice Generator (TTS)</div>
                  <div className="text-xs text-[#A5B4CC] mt-0.5">
                    Allow speech synthesis in the studio.
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
                    Allow analyzing and cloning new voice profiles.
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
                placeholder="e.g. Bangla & English neural synthesis active..."
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

        {/* TAB 3: VOICES & AUDIO LIBRARY */}
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
                  <span>Saved Voices ({voices.length})</span>
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
                  placeholder="Search by voice or clip title..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-white/10 bg-[#080D1C] text-white placeholder:text-[#A5B4CC]/60 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            {libraryTab === 'voices' ? (
              filteredVoices.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#A5B4CC]">
                  No voice profiles found.
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {filteredVoices.map((v) => (
                    <div key={v.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{v.name}</div>
                        <div className="text-xs text-[#A5B4CC] truncate">
                          {v.pitchRegister} · {v.language} · {v.sourceType}
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
                  ))}
                </div>
              )
            ) : filteredAudios.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#A5B4CC]">
                No generated audio clips found.
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {filteredAudios.map((a) => (
                  <div key={a.id} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {a.title || a.text.slice(0, 60)}
                      </div>
                      <div className="text-xs text-[#A5B4CC] truncate">
                        Voice: {a.voiceName} ·{' '}
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
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
