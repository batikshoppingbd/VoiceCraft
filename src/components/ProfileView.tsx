import {
  AudioLines,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Mic,
  Moon,
  Play,
  Plus,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User as UserIcon,
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
  clearAllStudioData,
  createVoiceProfileDoc,
  deleteVoiceProfileDoc,
  updateUserSettings,
  updateVoiceProfileDoc,
} from '../lib/studioStore';
import type {
  ActiveAudioTrack,
  AudioFormat,
  ProfileSection,
  StudioConfig,
  SupportedLanguage,
  ThemeMode,
  UserSettings,
  VoiceProfile,
  VoiceProfileStatus,
} from '../types/studio';
import { VoiceRecorder } from './VoiceRecorder';

interface ProfileViewProps {
  userId: string;
  userSettings: UserSettings;
  studioConfig: StudioConfig;
  voices: VoiceProfile[];
  generatedCount: number;
  theme: ThemeMode;
  activeSection: ProfileSection;
  onChangeSection: (section: ProfileSection) => void;
  onSetTheme: (theme: ThemeMode) => void;
  onVoiceCreated: (voiceId: string) => void;
  onUseVoiceInGenerator: (voiceId: string) => void;
  onPlayTrack: (track: ActiveAudioTrack) => void;
}

const ANALYSIS_STEPS = [
  'Uploading voice sample securely',
  'Analyzing pitch register & vocal timbre',
  'Building personal voice DNA',
  'Synthesizing cloned preview clip',
];

const CLONE_STATUS_STEPS: { id: VoiceProfileStatus; label: string }[] = [
  { id: 'not_created', label: 'Not Created' },
  { id: 'sample_added', label: 'Sample Added' },
  { id: 'processing', label: 'Processing' },
  { id: 'ready', label: 'Ready' },
  { id: 'failed', label: 'Failed' },
];

export function ProfileView({
  userId,
  userSettings,
  studioConfig,
  voices,
  generatedCount,
  theme,
  activeSection,
  onChangeSection,
  onSetTheme,
  onVoiceCreated,
  onUseVoiceInGenerator,
  onPlayTrack,
}: ProfileViewProps) {
  const cloningPaused = !studioConfig.voiceCloningEnabled;

  // Option 1: VoiceCraft Settings state
  const [displayName, setDisplayName] = useState<string>(
    userSettings.displayName || 'VoiceCraft Creator'
  );
  const [defaultVoiceId, setDefaultVoiceId] = useState<string>(
    userSettings.defaultVoiceId || ''
  );
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>(
    userSettings.defaultLanguage || 'en'
  );
  const [defaultSpeed, setDefaultSpeed] = useState<number>(
    userSettings.defaultSpeed || 1.0
  );
  const [defaultPitch, setDefaultPitch] = useState<number>(
    userSettings.defaultPitch ?? 0
  );
  const [defaultFormat, setDefaultFormat] = useState<AudioFormat>(
    userSettings.defaultFormat || 'wav'
  );
  const [autoPlayAfterGenerate, setAutoPlayAfterGenerate] = useState<boolean>(
    userSettings.autoPlayAfterGenerate ?? true
  );
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(
    userSettings.playbackSpeed || 1.0
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Option 2: Workspace & Storage state
  const [workspaceNameInput, setWorkspaceNameInput] = useState(
    userSettings.displayName || 'VoiceCraft Creator'
  );
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // Option 3: My Voice Clone state
  const [showCloneForm, setShowCloneForm] = useState(
    voices.length === 0 && !cloningPaused
  );
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
  const [cloneStatus, setCloneStatus] = useState<VoiceProfileStatus>(
    voices.length > 0 ? 'ready' : 'not_created'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeVoiceResponse | null>(null);
  const [savingClone, setSavingClone] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(userSettings.displayName || 'VoiceCraft Creator');
    setWorkspaceNameInput(userSettings.displayName || 'VoiceCraft Creator');
    setDefaultVoiceId(userSettings.defaultVoiceId || '');
    setDefaultLanguage(userSettings.defaultLanguage || 'en');
    setDefaultSpeed(userSettings.defaultSpeed || 1.0);
    setDefaultPitch(userSettings.defaultPitch ?? 0);
    setDefaultFormat(userSettings.defaultFormat || 'wav');
    setAutoPlayAfterGenerate(userSettings.autoPlayAfterGenerate ?? true);
    setPlaybackSpeed(userSettings.playbackSpeed || 1.0);
  }, [userSettings]);

  useEffect(() => {
    if (analyzing) return;
    if (cloneError) {
      setCloneStatus('failed');
    } else if (analysisResult) {
      setCloneStatus('ready');
    } else if (sample) {
      setCloneStatus('sample_added');
    } else if (voices.length > 0) {
      setCloneStatus('ready');
    } else {
      setCloneStatus('not_created');
    }
  }, [analyzing, cloneError, analysisResult, sample, voices.length]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      await updateUserSettings({
        displayName,
        defaultVoiceId: defaultVoiceId || '',
        defaultLanguage,
        defaultSpeed,
        defaultPitch,
        defaultFormat,
        autoPlayAfterGenerate,
        playbackSpeed,
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

  const handleSaveWorkspaceName = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserSettings({ displayName: workspaceNameInput });
    setWorkspaceSaved(true);
    window.setTimeout(() => setWorkspaceSaved(false), 2500);
  };

  const handleResetWorkspace = async () => {
    setClearingCache(true);
    try {
      await clearAllStudioData();
      setConfirmClearCache(false);
    } finally {
      setClearingCache(false);
    }
  };

  const handleSampleChange = (
    nextSample: {
      blob: Blob;
      fileName: string;
      sourceType: 'microphone' | 'upload';
      durationSec: number;
    } | null
  ) => {
    setSample(nextSample);
    setCloneError(null);
    setAnalysisResult(null);
    setCloneStatus(nextSample ? 'sample_added' : voices.length > 0 ? 'ready' : 'not_created');
  };

  const handleAnalyzeClone = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloneError(null);
    if (cloningPaused) {
      setCloneStatus('failed');
      setCloneError('Voice cloning is currently paused in Studio Controls.');
      return;
    }
    if (!voiceName.trim()) {
      setCloneStatus('failed');
      setCloneError('Please enter a name for your cloned voice.');
      return;
    }
    if (!sample) {
      setCloneStatus('failed');
      setCloneError('Please record with microphone or upload MP3, WAV, or M4A audio.');
      return;
    }
    if (!ownershipChecked) {
      setCloneStatus('failed');
      setCloneError('Please verify voice ownership before cloning.');
      return;
    }

    setAnalyzing(true);
    setCloneStatus('processing');
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
      setCloneStatus('ready');
    } catch (err) {
      setCloneStatus('failed');
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
        status: 'ready',
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
      setCloneStatus('ready');
      onVoiceCreated(voiceId);
    } catch (err) {
      setCloneStatus('failed');
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
      await updateVoiceProfileDoc(voice.id, {
        previewAudioId: res.previewAudioId,
        status: 'ready',
      });
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

  const fullName = userSettings.displayName || 'VoiceCraft Creator';

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Profile Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#9333EA] text-white flex items-center justify-center text-xl font-bold shrink-0">
              {fullName.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                  {fullName}
                </h1>
                <span className="text-xs font-semibold shrink-0 text-emerald-600 dark:text-emerald-400">
                  Instant Studio
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {voices.length} voice {voices.length === 1 ? 'profile' : 'profiles'} ·{' '}
                {generatedCount} generated {generatedCount === 1 ? 'clip' : 'clips'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Studio Console</span>
            </a>
          </div>
        </div>

        {/* Profile Menu — 3 Clean Options */}
        <div
          role="tablist"
          aria-label="Profile options"
          className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'settings'}
            onClick={() => onChangeSection('settings')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${
              activeSection === 'settings'
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">VoiceCraft Settings</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Voice, language & playback
              </div>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'workspace'}
            onClick={() => onChangeSection('workspace')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${
              activeSection === 'workspace'
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
              <UserIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Workspace & Storage</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Creator profile & local data
              </div>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'clone'}
            onClick={() => onChangeSection('clone')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${
              activeSection === 'clone'
                ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                My Voice Clone ({voices.length})
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Create & manage voice profiles
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* OPTION 1: VoiceCraft Settings */}
      {activeSection === 'settings' && (
        <section>
          <form
            onSubmit={handleSavePreferences}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                VoiceCraft Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Customize your default voice, language, generation parameters, and audio playback behavior.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Default Voice & Language Preferences */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="profile-default-voice"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Default Voice Profile
                  </label>
                  <select
                    id="profile-default-voice"
                    value={defaultVoiceId}
                    onChange={(e) => setDefaultVoiceId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[44px]"
                  >
                    <option value="">Latest Cloned Voice (Auto)</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.language})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Language Preferences
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
                      Default Generation Speed
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
                      Default Pitch Offset
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
              </div>

              {/* Audio Playback & Appearance Settings */}
              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Default Audio Output Format
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

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Audio Playback Speed
                    </span>
                    <span className="font-mono tabular-nums">{playbackSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="w-full studio-slider bg-slate-200 dark:bg-slate-700"
                  />
                </div>

                <label className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 cursor-pointer">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Auto-Play Generated Audio
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Automatically start playback when speech synthesis completes.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoPlayAfterGenerate}
                    onChange={(e) => setAutoPlayAfterGenerate(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded accent-blue-600"
                  />
                </label>

                <div>
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Studio Theme
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
              </div>
            </div>

            {settingsError && (
              <p className="text-xs text-red-600 dark:text-red-400">{settingsError}</p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                {settingsSaved && (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Settings saved</span>
                  </>
                )}
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </form>
        </section>
      )}

      {/* OPTION 2: Workspace & Storage */}
      {activeSection === 'workspace' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Workspace &amp; Storage
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Instant no-login studio workspace. All your voice profiles and generated WAV/MP3 clips stay private inside this browser.
            </p>
          </div>

          <form onSubmit={handleSaveWorkspaceName} className="space-y-2">
            <label
              htmlFor="workspace-creator-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Creator Display Name
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="workspace-creator-name"
                type="text"
                maxLength={120}
                value={workspaceNameInput}
                onChange={(e) => setWorkspaceNameInput(e.target.value)}
                placeholder="VoiceCraft Creator"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
              >
                {workspaceSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Updated</span>
                  </>
                ) : (
                  <span>Update Name</span>
                )}
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Saved Voice Profiles</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {voices.length}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <AudioLines className="w-3.5 h-3.5" />
                <span>Generated Audio Library</span>
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {generatedCount} tracks
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Audio Cache Mode</span>
              </div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Browser IndexedDB (Vercel Compatible)
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Workspace ID</span>
              </div>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                {userId}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Clear saved voices and cached audio clips stored in this browser.
            </span>
            {confirmClearCache ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearCache(false)}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={clearingCache}
                  onClick={() => void handleResetWorkspace()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {clearingCache && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Reset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearCache(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Local Workspace</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* OPTION 3: My Voice Clone */}
      {activeSection === 'clone' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                My Voice Clone
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Private to your browser workspace. Record or upload an authorized sample to build your personal voice profile.
              </p>
            </div>
            <button
              type="button"
              disabled={cloningPaused}
              onClick={() => setShowCloneForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              {showCloneForm ? 'Hide Create Form' : 'Create My Voice Profile'}
            </button>
          </div>

          {/* Voice Processing Status Indicator */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Voice Processing Status
              </span>
              <span
                className={`font-semibold ${
                  cloneStatus === 'ready'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : cloneStatus === 'failed'
                    ? 'text-red-600 dark:text-red-400'
                    : cloneStatus === 'processing'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {CLONE_STATUS_STEPS.find((s) => s.id === cloneStatus)?.label}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {CLONE_STATUS_STEPS.map((step) => {
                const active = cloneStatus === step.id;
                return (
                  <div
                    key={step.id}
                    className={`px-2 py-1.5 rounded-lg text-center text-[11px] font-medium truncate border ${
                      active
                        ? step.id === 'failed'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                          : step.id === 'ready'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>

          {!studioConfig.voiceCloningEnabled && (
            <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
              Creating new voice profiles is temporarily paused in Studio Controls (/admin). Your existing voices remain available.
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
                    Voice Profile Name
                  </label>
                  <input
                    id="clone-voice-name"
                    type="text"
                    maxLength={80}
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    placeholder="e.g. My Bangla Studio Voice"
                    className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="min-w-0">
                  <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Voice Language
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

              <VoiceRecorder language={cloneLang} onSampleReady={handleSampleChange} />

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

              {analyzing && (
                <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{ANALYSIS_STEPS[stepIdx]}</span>
                  </div>
                </div>
              )}

              {analysisResult && !analyzing && (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Voice Ready</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onPlayTrack({
                          id: analysisResult.previewAudioId,
                          serverAudioId: analysisResult.previewAudioId,
                          category: 'generated',
                          title: `${voiceName || 'Cloned Voice'} — Preview`,
                          subtitle: analysisResult.analysis.pitchRegister,
                          durationSec: analysisResult.previewDurationSec,
                          waveformPeaks: analysisResult.previewWaveformPeaks,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Listen Preview
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {analysisResult.analysis.acousticSummary}
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveClonedVoice}
                      disabled={savingClone}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingClone ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Save Voice Profile
                    </button>
                  </div>
                </div>
              )}

              {!analysisResult && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={analyzing || !sample || !voiceName.trim() || !ownershipChecked}
                    className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Mic className="w-4 h-4" />
                    Clone My Voice
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Saved Voices List */}
          <div className="pt-2 space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saved Voice Profiles ({voices.length})
            </h3>
            {voices.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No personal voice profiles saved yet. Click “Create My Voice Profile” above to record or upload a sample.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {voices.map((voice) => (
                  <div
                    key={voice.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {voice.name}
                        </span>
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0 capitalize">
                          {voice.status || 'ready'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {voice.pitchRegister} · {voice.language}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePreviewExisting(voice)}
                        disabled={previewingId === voice.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {previewingId === voice.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Preview
                      </button>

                      <button
                        type="button"
                        onClick={() => onUseVoiceInGenerator(voice.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Use in Generator
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteVoice(voice)}
                        disabled={deletingId === voice.id}
                        aria-label={`Delete ${voice.name}`}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        {deletingId === voice.id ? (
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
        </section>
      )}
    </div>
  );
}
