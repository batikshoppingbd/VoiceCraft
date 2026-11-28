export type SupportedLanguage = 'en' | 'bn' | 'bilingual';
export type AudioFormat = 'wav' | 'mp3';
export type BaseVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
export type ThemeMode = 'light' | 'dark';
export type VoiceProfileStatus =
  | 'not_created'
  | 'sample_added'
  | 'processing'
  | 'ready'
  | 'failed';

export type StudioTab = 'home' | 'generate' | 'profile';
export type ProfileSection = 'settings' | 'workspace' | 'clone';

export interface UserSettings {
  uid: string;
  displayName: string;
  defaultVoiceId?: string;
  defaultLanguage: SupportedLanguage;
  defaultSpeed: number;
  defaultPitch: number;
  defaultFormat: AudioFormat;
  autoPlayAfterGenerate: boolean;
  playbackSpeed: number;
  themePreference: ThemeMode;
  updatedAt: number;
}

export interface StudioConfig {
  ttsEnabled: boolean;
  voiceCloningEnabled: boolean;
  maxTextLength: number;
  defaultLanguage: SupportedLanguage;
  defaultFormat: AudioFormat;
  announcement?: string;
  updatedAt: number;
}

export interface VoiceProfile {
  id: string;
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
  ownershipVerified: boolean;
  consentStatement: string;
  previewAudioId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GeneratedAudio {
  id: string;
  userId: string;
  voiceId: string;
  voiceName: string;
  title?: string;
  text: string;
  language: SupportedLanguage;
  speed: number;
  pitch: number;
  styleOverride?: string;
  serverAudioId: string;
  durationSec: number;
  format: AudioFormat;
  fileSizeBytes: number;
  downloadCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadedAudio {
  id: string;
  userId: string;
  generatedAudioId: string;
  serverAudioId: string;
  voiceName: string;
  textSnippet: string;
  language: SupportedLanguage;
  format: AudioFormat;
  fileSizeBytes: number;
  downloadedAt: number;
}

export interface ActiveAudioTrack {
  id: string;
  serverAudioId: string;
  category: 'samples' | 'generated';
  title: string;
  subtitle: string;
  durationSec: number;
  waveformPeaks?: number[];
  generatedAudioId?: string;
  language?: SupportedLanguage;
  voiceName?: string;
  textSnippet?: string;
}
