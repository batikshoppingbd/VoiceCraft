import {
  CheckCircle2,
  Loader2,
  LogOut,
  Mic,
  Moon,
  Play,
  Plus,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  apiAnalyzeVoiceSample,
  apiDeleteAudioFile,
  apiGenerateVoicePreview,
  type AnalyzeVoiceResponse,
} from '../lib/api';
import {
  createVoiceProfileDoc,
  deleteVoiceProfileDoc,
  updateUserSettings,
  updateVoiceProfileDoc,
} from '../lib/firebase';
import type {
  ActiveAudioTrack,
  AudioFormat,
  StudioConfig,
  SupportedLanguage,
  ThemeMode,
  UserProfile,
  VoiceProfile,
} from '../types/studio';
import { VoiceRecorder } from './VoiceRecorder';

interface SettingsAndCloneViewProps {
  userId: string;
  userProfile: UserProfile | null;
  studioConfig: StudioConfig;
  isAdmin: boolean;
  voices: VoiceProfile[];
  theme: ThemeMode;
  onSetTheme: (theme: ThemeMode) => void;
  onVoiceCreated: (voiceId: string) => void;
  onUseVoiceInGenerator: (voiceId: string) => void;
  onPlayTrack: (track: ActiveAudioTrack) => void;
  onSignOut: () => Promise<void>;
}

const ANALYSIS_STEPS = [
  'Uploading voice sample securely',
  'Analyzing pitch register & vocal timbre',
  'Building personal voice DNA',
  'Synthesizing cloned preview clip',
];

export function SettingsAndCloneView({
  userId,
  userProfile,
  studioConfig,
  isAdmin,
  voices,
  theme,
  onSetTheme,
  onVoiceCreated,
  onUseVoiceInGenerator,
  onPlayTrack,
  onSignOut,
}: SettingsAndCloneViewProps) {
  const cloningPaused = !studioConfig.voiceCloningEnabled && !isAdmin;

  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>(
    userProfile?.defaultLanguage || 'en'
  );
  const [defaultSpeed, setDefaultSpeed] = useState<number>(
    userProfile?.defaultSpeed || 1.0
  );
  const [defaultPitch, setDefaultPitch] = useState<number>(
    userProfile?.defaultPitch || 0
  );
  const [defaultFormat, setDefaultFormat] = useState<AudioFormat>(
    userProfile?.defaultFormat || 'wav'
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [showCloneForm, setShowCloneForm] = useState(voices.length === 0 && !cloningPaused);
  const [voiceName, setVoiceName] = useState('');
  const [cloneLang, setCloneLang] = useState<SupportedLanguage>('en');
  const [sample, setSample] = useState<{
    blob: Blob;
    fileName: string;
    sourceType: 'microphone' | 'upload';
    durationSec: number;
  } | null>(null);
  const [ownershipChecked, setOwnershipChecked] = useState(false);
  const [consentText] = useState(
    'I verify this is my own voice or I have explicit permission to create a personal voice profile.'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeVoiceResponse | null>(null);
  const [savingClone, setSavingClone] = useState(false);

  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setDefaultLanguage(userProfile.defaultLanguage);
      setDefaultSpeed(userProfile.defaultSpeed);
      setDefaultPitch(userProfile.defaultPitch);
      setDefaultFormat(userProfile.defaultFormat);
    }
  }, [userProfile]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      await updateUserSettings(userId, {
        defaultLanguage,
        defaultSpeed,
        defaultPitch,
        defaultFormat,
        themePreference: theme,
      });
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAnalyzeClone = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloneError(null);
    if (cloningPaused) {
      setCloneError('Voice cloning is currently paused by the administrator.');
      return;
    }
    if (!voiceName.trim()) {
      setCloneError('Please enter a name for your cloned voice.');
      return;
    }
    if (!sample) {
      setCloneError('Please record with microphone or upload MP3, WAV, or M4A audio.');
      return;
    }
    if (!ownershipChecked) {
      setCloneError('Please verify voice ownership before cloning.');
      return;
    }

    setAnalyzing(true);
    setStepIdx(0);
    setAnalysisResult(null);

    const timer = window.setInterval(() => {
      setStepIdx((prev) => (prev < ANALYSIS_STEPS.length - 1 ? prev + 1 : prev));
    }, 1800);

    try {
      const res = await apiAnalyzeVoiceSample({
        audioBlob: sample.blob,
        fileName: sample.fileName,
        voiceName: voiceName.trim(),
        language: cloneLang,
        ownershipAccepted: ownershipChecked,
        consentStatement: consentText,
      });
      setAnalysisResult(res);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Voice analysis failed.');
    } finally {
      window.clearInterval(timer);
      setAnalyzing(false);
    }
  };

  const handleSaveClonedVoice = async () => {
    if (!analysisResult || !sample) return;
    setSavingClone(true);
    setCloneError(null);
    try {
      const voiceId = await createVoiceProfileDoc({
        userId,
        name: voiceName.trim(),
        language: cloneLang,
        sourceType: sample.sourceType,
        sampleAudioId: analysisResult.sampleAudioId,
        sampleMimeType: analysisResult.sampleMimeType,
        sampleDurationSec: analysisResult.analysis.estimatedDurationSec || sample.durationSec,
        sampleTranscript: analysisResult.analysis.transcript || '',
        baseVoiceName: analysisResult.analysis.baseVoiceName,
        voiceStylePrompt: analysisResult.analysis.voiceStylePrompt,
        acousticSummary: analysisResult.analysis.acousticSummary,
        pitchRegister: analysisResult.analysis.pitchRegister,
        speakingTempo: analysisResult.analysis.speakingTempo,
        timbreProfile: analysisResult.analysis.timbreProfile,
        defaultSpeed: analysisResult.analysis.suggestedSpeed,
        defaultPitch: analysisResult.analysis.suggestedPitch,
        consentStatement: consentText,
        previewAudioId: analysisResult.previewAudioId,
      });
      setVoiceName('');
      setSample(null);
      setAnalysisResult(null);
      setOwnershipChecked(false);
      setShowCloneForm(false);
      onVoiceCreated(voiceId);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Failed to save voice profile.');
    } finally {
      setSavingClone(false);
    }
  };

  const handlePreviewExisting = async (voice: VoiceProfile) => {
    setCloneError(null);
    if (voice.previewAudioId) {
      onPlayTrack({
        id: voice.previewAudioId,
        serverAudioId: voice.previewAudioId,
        category: 'generated',
        title: `${voice.name} — Preview`,
        subtitle: voice.pitchRegister,
        durationSec: 6,
      });
      return;
    }
    setPreviewingId(voice.id);
    try {
      const res = await apiGenerateVoicePreview({
        voiceName: voice.name,
        language: voice.language,
        baseVoiceName: voice.baseVoiceName,
        voiceStylePrompt: voice.voiceStylePrompt,
        speed: voice.defaultSpeed,
        pitch: voice.defaultPitch,
      });
      await updateVoiceProfileDoc(voice.id, { previewAudioId: res.previewAudioId });
      onPlayTrack({
        id: res.previewAudioId,
        serverAudioId: res.previewAudioId,
        category: 'generated',
        title: `${voice.name} — Preview`,
        subtitle: voice.pitchRegister,
        durationSec: res.durationSec,
        waveformPeaks: res.waveformPeaks,
      });
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setPreviewingId(null);
    }
  };

  const handleDeleteVoice = async (voice: VoiceProfile) => {
    setDeletingId(voice.id);
    try {
      await deleteVoiceProfileDoc(voice.id);
      if (voice.sampleAudioId) {
        await apiDeleteAudioFile('samples', voice.sampleAudioId).catch(() => undefined);
      }
      if (voice.previewAudioId) {
        await apiDeleteAudioFile('generated', voice.previewAudioId).catch(() => undefined);
      }
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Failed to delete voice.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          Voice Settings & Cloning
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Clone your own voice, manage saved profiles, and set default speech preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Voice Cloning & Saved Cloned Voices */}
        <section className="lg:col-span-7 min-w-0 w-full">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Voice Cloning
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Record or upload your sample to clone a personal voice.
                </p>
              </div>
              <button
                type="button"
                disabled={cloningPaused}
                onClick={() => setShowCloneForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                {showCloneForm ? 'Hide Cloner' : 'Clone Voice'}
              </button>
            </div>

            {!studioConfig.voiceCloningEnabled && (
              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
                {isAdmin
                  ? 'New voice cloning is currently paused for standard members (Admin access remains active).'
                  : 'Creating new cloned voices is temporarily paused by the administrator. You can continue using your saved voices below.'}
              </div>
            )}

            {showCloneForm && !cloningPaused && (
              <form
                onSubmit={handleAnalyzeClone}
                className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4 min-w-0"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label
                      htmlFor="clone-voice-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Voice Name
                    </label>
                    <input
                      id="clone-voice-name"
                      type="text"
                      maxLength={80}
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      placeholder="e.g. My Bangla Voice"
                      className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="min-w-0">
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Language
                    </span>
                    <div className="grid grid-cols-3 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      {(
                        [
                          { id: 'en', label: 'English' },
                          { id: 'bn', label: 'বাংলা' },
                          { id: 'bilingual', label: 'Both' },
                        ] as const
                      ).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setCloneLang(l.id)}
                          className={`py-2 text-xs font-medium rounded-lg transition-colors truncate ${
                            cloneLang === l.id
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <VoiceRecorder language={cloneLang} onSampleReady={setSample} />

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Voice Ownership Verification</span>
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    <input
                      type="checkbox"
                      checked={ownershipChecked}
                      onChange={(e) => setOwnershipChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 shrink-0"
                    />
                    <span>
                      I confirm this is my own voice or I hold explicit permission from the speaker.
                    </span>
                  </label>
                </div>

                {cloneError && (
                  <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                    {cloneError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button
                    type="submit"
                    disabled={analyzing}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cloning Voice...
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Analyze & Clone Voice
                      </>
                    )}
                  </button>
                  {analyzing && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {ANALYSIS_STEPS[stepIdx]}...
                    </span>
                  )}
                </div>

                {analysisResult && (
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Voice Ready to Save</span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                          {analysisResult.analysis.pitchRegister} ·{' '}
                          {analysisResult.analysis.speakingTempo}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onPlayTrack({
                            id: analysisResult.previewAudioId,
                            serverAudioId: analysisResult.previewAudioId,
                            category: 'generated',
                            title: `${voiceName.trim()} — Preview`,
                            subtitle: analysisResult.analysis.pitchRegister,
                            durationSec: analysisResult.previewDurationSec,
                            waveformPeaks: analysisResult.previewWaveformPeaks,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 text-blue-600" />
                        Preview
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveClonedVoice}
                      disabled={savingClone}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                      {savingClone ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                      Save Cloned Voice Profile
                    </button>
                  </div>
                )}
              </form>
            )}

            {/* Saved Cloned Voice Profiles List */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                My Cloned Voices ({voices.length})
              </div>

              {voices.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                  No cloned voices yet. Use the form above to create your first voice profile.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {v.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {v.pitchRegister} ·{' '}
                          {v.language === 'bn'
                            ? 'বাংলা'
                            : v.language === 'bilingual'
                            ? 'Bilingual'
                            : 'English'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewExisting(v)}
                          disabled={previewingId === v.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          {previewingId === v.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          Preview
                        </button>

                        <button
                          type="button"
                          onClick={() => onUseVoiceInGenerator(v.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[38px] text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Use
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteVoice(v)}
                          disabled={deletingId === v.id}
                          aria-label={`Delete ${v.name}`}
                          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          {deletingId === v.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Account, Voice Settings & App Theme */}
        <section className="lg:col-span-5 min-w-0 w-full space-y-5">
          {userProfile && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {userProfile.photoURL ? (
                    <img
                      src={userProfile.photoURL}
                      alt={userProfile.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {userProfile.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {userProfile.displayName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {userProfile.email}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    isAdmin
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isAdmin ? 'Admin' : 'Member'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                {isAdmin && (
                  <a
                    href="/admin"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Open Admin Panel
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSavePreferences}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5"
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Voice & Studio Settings
            </h2>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Theme
              </span>
              <div className="grid grid-cols-2 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => onSetTheme('light')}
                  className={`py-2 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => onSetTheme('dark')}
                  className={`py-2 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-slate-900 text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Default Language
              </span>
              <div className="grid grid-cols-3 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(
                  [
                    { id: 'en', label: 'English' },
                    { id: 'bn', label: 'বাংলা' },
                    { id: 'bilingual', label: 'Bilingual' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDefaultLanguage(item.id)}
                    className={`py-2 text-xs font-medium rounded-lg truncate ${
                      defaultLanguage === item.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Default Speed
                </span>
                <span className="font-mono tabular-nums">{defaultSpeed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={defaultSpeed}
                onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                className="w-full studio-slider bg-slate-200 dark:bg-slate-700"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Default Pitch
                </span>
                <span className="font-mono tabular-nums">
                  {defaultPitch > 0 ? `+${defaultPitch.toFixed(1)}` : defaultPitch.toFixed(1)} st
                </span>
              </div>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={defaultPitch}
                onChange={(e) => setDefaultPitch(Number(e.target.value))}
                className="w-full studio-slider bg-slate-200 dark:bg-slate-700"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Default Download Format
              </span>
              <div className="grid grid-cols-2 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDefaultFormat('wav')}
                  className={`py-2 text-xs font-medium rounded-lg ${
                    defaultFormat === 'wav'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  WAV (Lossless)
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultFormat('mp3')}
                  className={`py-2 text-xs font-medium rounded-lg ${
                    defaultFormat === 'mp3'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  MP3 (192kbps)
                </button>
              </div>
            </div>

            {settingsError && (
              <p className="text-xs text-red-600 dark:text-red-400">{settingsError}</p>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                {settingsSaved && (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Saved</span>
                  </>
                )}
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-60 transition-colors"
              >
                {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
