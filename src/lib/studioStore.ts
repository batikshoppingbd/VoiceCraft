import type {
  AudioFormat,
  BaseVoiceName,
  DownloadedAudio,
  GeneratedAudio,
  StudioConfig,
  SupportedLanguage,
  ThemeMode,
  UserSettings,
  VoiceProfile,
  VoiceProfileStatus,
} from '../types/studio';
import { deleteAudioBlobFromCache } from './audioCache';

const WORKSPACE_ID_KEY = 'voicecraft_workspace_id';
const STUDIO_STATE_KEY = 'voicecraft_studio_state_v1';

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  ttsEnabled: true,
  voiceCloningEnabled: true,
  maxTextLength: 5000,
  defaultLanguage: 'en',
  defaultFormat: 'wav',
  announcement: '',
  updatedAt: Date.now(),
};

interface PersistedStudioState {
  settings: UserSettings;
  studioConfig: StudioConfig;
  voices: VoiceProfile[];
  generatedAudios: GeneratedAudio[];
  downloadedAudios: DownloadedAudio[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let memoryWorkspaceId: string | null = null;
let memoryState: PersistedStudioState | null = null;

export function getWorkspaceId(): string {
  if (memoryWorkspaceId) return memoryWorkspaceId;
  try {
    const existing = window.localStorage.getItem(WORKSPACE_ID_KEY);
    if (existing && /^[a-zA-Z0-9_\-]{12,128}$/.test(existing)) {
      memoryWorkspaceId = existing;
      return existing;
    }
    const created = `ws_${crypto.randomUUID().replace(/-/g, '')}`;
    window.localStorage.setItem(WORKSPACE_ID_KEY, created);
    memoryWorkspaceId = created;
    return created;
  } catch {
    memoryWorkspaceId = `ws_${crypto.randomUUID().replace(/-/g, '')}`;
    return memoryWorkspaceId;
  }
}

export function generateSafeId(prefix: string): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return `${prefix}_${raw}`;
}

export function createDefaultUserSettings(uid = getWorkspaceId()): UserSettings {
  return {
    uid,
    displayName: 'VoiceCraft Creator',
    defaultLanguage: 'en',
    defaultSpeed: 1.0,
    defaultPitch: 0,
    defaultFormat: 'wav',
    autoPlayAfterGenerate: true,
    playbackSpeed: 1.0,
    themePreference: 'light',
    updatedAt: Date.now(),
  };
}

function createInitialState(): PersistedStudioState {
  const uid = getWorkspaceId();
  return {
    settings: createDefaultUserSettings(uid),
    studioConfig: { ...DEFAULT_STUDIO_CONFIG },
    voices: [],
    generatedAudios: [],
    downloadedAudios: [],
  };
}

function readState(): PersistedStudioState {
  if (memoryState) return memoryState;
  try {
    const raw = window.localStorage.getItem(STUDIO_STATE_KEY);
    if (!raw) {
      const fresh = createInitialState();
      memoryState = fresh;
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedStudioState>;
    const uid = getWorkspaceId();
    const state: PersistedStudioState = {
      settings: {
        ...createDefaultUserSettings(uid),
        ...(parsed.settings || {}),
        uid,
      },
      studioConfig: {
        ...DEFAULT_STUDIO_CONFIG,
        ...(parsed.studioConfig || {}),
      },
      voices: Array.isArray(parsed.voices) ? parsed.voices : [],
      generatedAudios: Array.isArray(parsed.generatedAudios) ? parsed.generatedAudios : [],
      downloadedAudios: Array.isArray(parsed.downloadedAudios) ? parsed.downloadedAudios : [],
    };
    memoryState = state;
    return state;
  } catch {
    const fresh = createInitialState();
    memoryState = fresh;
    return fresh;
  }
}

function writeState(next: PersistedStudioState): void {
  memoryState = next;
  try {
    window.localStorage.setItem(STUDIO_STATE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal in private mode or quota edge cases
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribeAll(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STUDIO_STATE_KEY) {
      memoryState = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function loadUserSettings(): UserSettings {
  return readState().settings;
}

export function subscribeUserSettings(onUpdate: (settings: UserSettings) => void): () => void {
  onUpdate(readState().settings);
  return subscribeAll(() => {
    onUpdate(readState().settings);
  });
}

export async function updateUserSettings(
  updates: Partial<{
    displayName: string;
    defaultVoiceId: string;
    defaultLanguage: SupportedLanguage;
    defaultSpeed: number;
    defaultPitch: number;
    defaultFormat: AudioFormat;
    autoPlayAfterGenerate: boolean;
    playbackSpeed: number;
    themePreference: ThemeMode;
  }>
): Promise<void> {
  const current = readState();
  const nextSettings: UserSettings = {
    ...current.settings,
    updatedAt: Date.now(),
  };

  if (updates.displayName !== undefined) {
    nextSettings.displayName =
      updates.displayName.trim().slice(0, 120) || 'VoiceCraft Creator';
  }
  if (updates.defaultVoiceId !== undefined) {
    const cleaned = updates.defaultVoiceId.trim().slice(0, 128);
    nextSettings.defaultVoiceId = cleaned || undefined;
  }
  if (updates.defaultLanguage !== undefined) {
    nextSettings.defaultLanguage = updates.defaultLanguage;
  }
  if (updates.defaultSpeed !== undefined) {
    nextSettings.defaultSpeed = Math.max(0.5, Math.min(2.0, Number(updates.defaultSpeed)));
  }
  if (updates.defaultPitch !== undefined) {
    nextSettings.defaultPitch = Math.max(-6, Math.min(6, Number(updates.defaultPitch)));
  }
  if (updates.defaultFormat !== undefined) {
    nextSettings.defaultFormat = updates.defaultFormat;
  }
  if (updates.autoPlayAfterGenerate !== undefined) {
    nextSettings.autoPlayAfterGenerate = Boolean(updates.autoPlayAfterGenerate);
  }
  if (updates.playbackSpeed !== undefined) {
    nextSettings.playbackSpeed = Math.max(0.5, Math.min(2.0, Number(updates.playbackSpeed)));
  }
  if (updates.themePreference !== undefined) {
    nextSettings.themePreference = updates.themePreference;
  }

  writeState({
    ...current,
    settings: nextSettings,
  });
}

export function loadStudioConfig(): StudioConfig {
  return readState().studioConfig;
}

export function subscribeStudioConfig(onUpdate: (config: StudioConfig) => void): () => void {
  onUpdate(readState().studioConfig);
  return subscribeAll(() => {
    onUpdate(readState().studioConfig);
  });
}

export async function saveStudioConfig(
  config: Omit<StudioConfig, 'updatedAt'>
): Promise<void> {
  const current = readState();
  writeState({
    ...current,
    studioConfig: {
      ttsEnabled: Boolean(config.ttsEnabled),
      voiceCloningEnabled: Boolean(config.voiceCloningEnabled),
      maxTextLength: Math.max(200, Math.min(5000, Math.round(config.maxTextLength))),
      defaultLanguage: config.defaultLanguage,
      defaultFormat: config.defaultFormat,
      announcement: config.announcement?.trim().slice(0, 300) || '',
      updatedAt: Date.now(),
    },
  });
}

export function subscribeVoices(onUpdate: (voices: VoiceProfile[]) => void): () => void {
  const getSorted = () =>
    [...readState().voices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  onUpdate(getSorted());
  return subscribeAll(() => {
    onUpdate(getSorted());
  });
}

export function subscribeGeneratedAudios(
  onUpdate: (audios: GeneratedAudio[]) => void
): () => void {
  const getSorted = () =>
    [...readState().generatedAudios].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  onUpdate(getSorted());
  return subscribeAll(() => {
    onUpdate(getSorted());
  });
}

export function fetchAllVoices(): VoiceProfile[] {
  return [...readState().voices].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function fetchAllAudios(): GeneratedAudio[] {
  return [...readState().generatedAudios].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function createVoiceProfileDoc(params: {
  userId: string;
  name: string;
  status?: VoiceProfileStatus;
  language: SupportedLanguage;
  sourceType: 'microphone' | 'upload' | 'preset';
  sampleAudioId?: string;
  sampleMimeType?: string;
  sampleDurationSec?: number;
  sampleTranscript?: string;
  baseVoiceName: BaseVoiceName;
  voiceStylePrompt: string;
  acousticSummary: string;
  pitchRegister: string;
  speakingTempo: string;
  timbreProfile: string;
  defaultSpeed: number;
  defaultPitch: number;
  consentStatement: string;
  previewAudioId?: string;
}): Promise<string> {
  const voiceId = generateSafeId('vp');
  const now = Date.now();
  const profile: VoiceProfile = {
    id: voiceId,
    userId: params.userId,
    name: params.name.trim().slice(0, 80),
    status: params.status || 'ready',
    language: params.language,
    sourceType: params.sourceType,
    sampleAudioId: params.sampleAudioId,
    sampleMimeType: params.sampleMimeType?.slice(0, 64),
    sampleDurationSec: params.sampleDurationSec
      ? Math.max(0.5, Math.min(600, Number(params.sampleDurationSec)))
      : undefined,
    sampleTranscript: params.sampleTranscript?.slice(0, 2000),
    baseVoiceName: params.baseVoiceName,
    voiceStylePrompt: params.voiceStylePrompt.slice(0, 1500),
    acousticSummary: params.acousticSummary.slice(0, 600),
    pitchRegister: params.pitchRegister.slice(0, 80),
    speakingTempo: params.speakingTempo.slice(0, 80),
    timbreProfile: params.timbreProfile.slice(0, 120),
    defaultSpeed: Math.max(0.5, Math.min(2.0, Number(params.defaultSpeed) || 1.0)),
    defaultPitch: Math.max(-6, Math.min(6, Number(params.defaultPitch) || 0)),
    ownershipVerified: true,
    consentStatement: params.consentStatement.trim().slice(0, 300),
    previewAudioId: params.previewAudioId,
    createdAt: now,
    updatedAt: now,
  };

  const current = readState();
  writeState({
    ...current,
    voices: [profile, ...current.voices],
  });
  return voiceId;
}

export async function createPresetVoiceProfileDoc(
  language: SupportedLanguage = 'en'
): Promise<string> {
  const userId = getWorkspaceId();
  const isBn = language === 'bn';
  return createVoiceProfileDoc({
    userId,
    name: isBn ? 'Studio Bangla Voice' : 'Studio Narrator Voice',
    status: 'ready',
    language,
    sourceType: 'preset',
    baseVoiceName: isBn ? 'Kore' : 'Fenrir',
    voiceStylePrompt: isBn
      ? 'Warm, fluent, expressive Bengali narrator voice with clear articulation and natural conversational rhythm.'
      : 'Warm, articulate studio narrator voice with balanced midrange resonance and crisp diction.',
    acousticSummary: 'Built-in VoiceCraft Studio preset calibrated for instant speech generation.',
    pitchRegister: isBn ? 'Clear Alto (~205 Hz)' : 'Warm Baritone (~128 Hz)',
    speakingTempo: 'Natural Conversational (~135 WPM)',
    timbreProfile: 'Balanced studio warmth',
    defaultSpeed: 1.0,
    defaultPitch: 0,
    consentStatement: 'Built-in VoiceCraft AI studio voice preset.',
  });
}

export async function updateVoiceProfileDoc(
  voiceId: string,
  updates: Partial<{
    name: string;
    status: VoiceProfileStatus;
    language: SupportedLanguage;
    defaultSpeed: number;
    defaultPitch: number;
    voiceStylePrompt: string;
    previewAudioId: string;
  }>
): Promise<void> {
  const current = readState();
  const nextVoices = current.voices.map((v) => {
    if (v.id !== voiceId) return v;
    return {
      ...v,
      ...(updates.name !== undefined ? { name: updates.name.trim().slice(0, 80) } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.language !== undefined ? { language: updates.language } : {}),
      ...(updates.defaultSpeed !== undefined
        ? { defaultSpeed: Math.max(0.5, Math.min(2.0, Number(updates.defaultSpeed))) }
        : {}),
      ...(updates.defaultPitch !== undefined
        ? { defaultPitch: Math.max(-6, Math.min(6, Number(updates.defaultPitch))) }
        : {}),
      ...(updates.voiceStylePrompt !== undefined
        ? { voiceStylePrompt: updates.voiceStylePrompt.trim().slice(0, 1500) }
        : {}),
      ...(updates.previewAudioId !== undefined ? { previewAudioId: updates.previewAudioId } : {}),
      updatedAt: Date.now(),
    };
  });
  writeState({
    ...current,
    voices: nextVoices,
  });
}

export async function deleteVoiceProfileDoc(voiceId: string): Promise<void> {
  const current = readState();
  writeState({
    ...current,
    voices: current.voices.filter((v) => v.id !== voiceId),
  });
}

export async function createGeneratedAudioDoc(params: {
  userId: string;
  voiceId: string;
  voiceName: string;
  title: string;
  text: string;
  language: SupportedLanguage;
  speed: number;
  pitch: number;
  styleOverride?: string;
  serverAudioId: string;
  durationSec: number;
  format: AudioFormat;
  fileSizeBytes: number;
}): Promise<string> {
  const audioId = generateSafeId('ga');
  const now = Date.now();
  const cleanTitle = (
    params.title.trim() ||
    params.text.trim().slice(0, 60) ||
    'Generated Audio'
  ).slice(0, 120);

  const entry: GeneratedAudio = {
    id: audioId,
    userId: params.userId,
    voiceId: params.voiceId,
    voiceName: params.voiceName.slice(0, 80),
    title: cleanTitle,
    text: params.text.slice(0, 5000),
    language: params.language,
    speed: Math.max(0.5, Math.min(2.0, Number(params.speed))),
    pitch: Math.max(-6, Math.min(6, Number(params.pitch))),
    styleOverride: params.styleOverride?.trim().slice(0, 300) || undefined,
    serverAudioId: params.serverAudioId,
    durationSec: Math.max(0, Math.min(1800, Number(params.durationSec))),
    format: params.format,
    fileSizeBytes: Math.max(1, Math.min(52428800, Math.round(params.fileSizeBytes))),
    downloadCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const current = readState();
  writeState({
    ...current,
    generatedAudios: [entry, ...current.generatedAudios],
  });
  return audioId;
}

export async function recordAudioDownload(params: {
  userId: string;
  generatedAudioId?: string;
  serverAudioId: string;
  voiceName: string;
  textSnippet: string;
  language: SupportedLanguage;
  format: AudioFormat;
  fileSizeBytes: number;
}): Promise<void> {
  if (!params.generatedAudioId) return;
  const downloadId = generateSafeId('dl');
  const now = Date.now();
  const current = readState();

  const dlRecord: DownloadedAudio = {
    id: downloadId,
    userId: params.userId,
    generatedAudioId: params.generatedAudioId,
    serverAudioId: params.serverAudioId,
    voiceName: params.voiceName.slice(0, 80),
    textSnippet: (params.textSnippet || 'Generated Speech').slice(0, 200),
    language: params.language,
    format: params.format,
    fileSizeBytes: Math.max(1, Math.min(52428800, Math.round(params.fileSizeBytes))),
    downloadedAt: now,
  };

  const nextAudios = current.generatedAudios.map((item) =>
    item.id === params.generatedAudioId
      ? { ...item, downloadCount: (item.downloadCount || 0) + 1, updatedAt: now }
      : item
  );

  writeState({
    ...current,
    generatedAudios: nextAudios,
    downloadedAudios: [dlRecord, ...current.downloadedAudios].slice(0, 100),
  });
}

export async function deleteGeneratedAudioDoc(audioId: string): Promise<void> {
  const current = readState();
  writeState({
    ...current,
    generatedAudios: current.generatedAudios.filter((a) => a.id !== audioId),
  });
}

export async function clearAllStudioData(): Promise<void> {
  const current = readState();
  for (const v of current.voices) {
    if (v.sampleAudioId) {
      await deleteAudioBlobFromCache('samples', v.sampleAudioId);
    }
    if (v.previewAudioId) {
      await deleteAudioBlobFromCache('generated', v.previewAudioId);
    }
  }
  for (const a of current.generatedAudios) {
    await deleteAudioBlobFromCache('generated', a.serverAudioId);
  }
  const fresh = createInitialState();
  fresh.settings = {
    ...fresh.settings,
    themePreference: current.settings.themePreference,
  };
  writeState(fresh);
}
