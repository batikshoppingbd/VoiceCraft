import type { Timestamp } from 'firebase/firestore';

export type SupportedLanguage = 'en' | 'bn' | 'bilingual';
export type AudioFormat = 'wav' | 'mp3';
export type BaseVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
export type ThemeMode = 'light' | 'dark';
export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export type StudioTab = 'home' | 'generate' | 'settings';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  status: UserStatus;
  defaultLanguage: SupportedLanguage;
  defaultSpeed: number;
  defaultPitch: number;
  defaultFormat: AudioFormat;
  themePreference: ThemeMode;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StudioConfig {
  ttsEnabled: boolean;
  voiceCloningEnabled: boolean;
  maxTextLength: number;
  defaultLanguage: SupportedLanguage;
  defaultFormat: AudioFormat;
  announcement?: string;
  updatedBy: string;
  updatedAt?: Timestamp;
}

export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  language: SupportedLanguage;
  sourceType: 'microphone' | 'upload';
  sampleAudioId: string;
  sampleMimeType: string;
  sampleDurationSec: number;
  sampleTranscript: string;
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
  verifiedAt: Timestamp;
  previewAudioId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  downloadedAt: Timestamp;
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
