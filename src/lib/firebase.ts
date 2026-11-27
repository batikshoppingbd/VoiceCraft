import { initializeApp } from 'firebase/app';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  initializeFirestore,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AudioFormat,
  BaseVoiceName,
  SupportedLanguage,
  ThemeMode,
  UserProfile,
} from '../types/studio';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

const WORKSPACE_STORAGE_KEY = 'voicecraft_workspace_id';

export function getWorkspaceId(): string {
  try {
    const existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_\-]{12,128}$/.test(existing)) {
      return existing;
    }
    const created = `vcs_${crypto.randomUUID().replace(/-/g, '')}`;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, created);
    return created;
  } catch {
    return 'vcs_default_workspace_session';
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  workspaceId: string;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    workspaceId: getWorkspaceId(),
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function generateSafeId(prefix: string): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return `${prefix}_${raw}`;
}

export async function ensureWorkspaceProfile(workspaceId: string): Promise<UserProfile> {
  const path = `users/${workspaceId}`;
  const ref = doc(db, 'users', workspaceId);
  try {
    let snap;
    try {
      snap = await getDoc(ref);
    } catch (firstErr) {
      if (
        firstErr instanceof Error &&
        (firstErr.message.includes('offline') || firstErr.message.includes('unavailable'))
      ) {
        await new Promise((r) => setTimeout(r, 1200));
        snap = await getDoc(ref);
      } else {
        throw firstErr;
      }
    }

    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const baseData = {
      uid: workspaceId,
      email: '',
      displayName: 'Personal Voice Studio',
      defaultLanguage: 'en',
      defaultSpeed: 1.0,
      defaultPitch: 0,
      defaultFormat: 'wav',
      themePreference: 'light',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, baseData);
    const createdSnap = await getDoc(ref);
    return createdSnap.data() as UserProfile;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserSettings(
  uid: string,
  updates: Partial<{
    displayName: string;
    defaultLanguage: SupportedLanguage;
    defaultSpeed: number;
    defaultPitch: number;
    defaultFormat: AudioFormat;
    themePreference: ThemeMode;
  }>
) {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.displayName !== undefined) {
      payload.displayName = updates.displayName.trim().slice(0, 120) || 'Personal Voice Studio';
    }
    if (updates.defaultLanguage !== undefined) {
      payload.defaultLanguage = updates.defaultLanguage;
    }
    if (updates.defaultSpeed !== undefined) {
      payload.defaultSpeed = Math.max(0.5, Math.min(2.0, Number(updates.defaultSpeed)));
    }
    if (updates.defaultPitch !== undefined) {
      payload.defaultPitch = Math.max(-6, Math.min(6, Number(updates.defaultPitch)));
    }
    if (updates.defaultFormat !== undefined) {
      payload.defaultFormat = updates.defaultFormat;
    }
    if (updates.themePreference !== undefined) {
      payload.themePreference = updates.themePreference;
    }
    await updateDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function createVoiceProfileDoc(params: {
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
  consentStatement: string;
  previewAudioId?: string;
}): Promise<string> {
  const voiceId = generateSafeId('vp');
  const path = `voiceProfiles/${voiceId}`;
  try {
    const payload: Record<string, unknown> = {
      id: voiceId,
      userId: params.userId,
      name: params.name.trim().slice(0, 80),
      language: params.language,
      sourceType: params.sourceType,
      sampleAudioId: params.sampleAudioId,
      sampleMimeType: params.sampleMimeType.slice(0, 64),
      sampleDurationSec: Math.max(0.5, Math.min(600, Number(params.sampleDurationSec) || 5)),
      sampleTranscript: params.sampleTranscript.slice(0, 2000),
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
      verifiedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.previewAudioId) {
      payload.previewAudioId = params.previewAudioId;
    }
    await setDoc(doc(db, 'voiceProfiles', voiceId), payload);
    return voiceId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateVoiceProfileDoc(
  voiceId: string,
  updates: Partial<{
    name: string;
    language: SupportedLanguage;
    defaultSpeed: number;
    defaultPitch: number;
    voiceStylePrompt: string;
    previewAudioId: string;
  }>
) {
  const path = `voiceProfiles/${voiceId}`;
  try {
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.name !== undefined) payload.name = updates.name.trim().slice(0, 80);
    if (updates.language !== undefined) payload.language = updates.language;
    if (updates.defaultSpeed !== undefined) {
      payload.defaultSpeed = Math.max(0.5, Math.min(2.0, Number(updates.defaultSpeed)));
    }
    if (updates.defaultPitch !== undefined) {
      payload.defaultPitch = Math.max(-6, Math.min(6, Number(updates.defaultPitch)));
    }
    if (updates.voiceStylePrompt !== undefined) {
      payload.voiceStylePrompt = updates.voiceStylePrompt.trim().slice(0, 1500);
    }
    if (updates.previewAudioId !== undefined) {
      payload.previewAudioId = updates.previewAudioId;
    }
    await updateDoc(doc(db, 'voiceProfiles', voiceId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteVoiceProfileDoc(voiceId: string) {
  const path = `voiceProfiles/${voiceId}`;
  try {
    await deleteDoc(doc(db, 'voiceProfiles', voiceId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
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
  const path = `generatedAudios/${audioId}`;
  try {
    const cleanTitle = (params.title.trim() || params.text.trim().slice(0, 60) || 'Generated Audio').slice(0, 120);
    const payload: Record<string, unknown> = {
      id: audioId,
      userId: params.userId,
      voiceId: params.voiceId,
      voiceName: params.voiceName.slice(0, 80),
      title: cleanTitle,
      text: params.text.slice(0, 5000),
      language: params.language,
      speed: Math.max(0.5, Math.min(2.0, Number(params.speed))),
      pitch: Math.max(-6, Math.min(6, Number(params.pitch))),
      serverAudioId: params.serverAudioId,
      durationSec: Math.max(0, Math.min(1800, Number(params.durationSec))),
      format: params.format,
      fileSizeBytes: Math.max(1, Math.min(52428800, Math.round(params.fileSizeBytes))),
      downloadCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.styleOverride?.trim()) {
      payload.styleOverride = params.styleOverride.trim().slice(0, 300);
    }
    await setDoc(doc(db, 'generatedAudios', audioId), payload);
    return audioId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
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
}) {
  if (!params.generatedAudioId) return;
  const downloadId = generateSafeId('dl');
  const dlPath = `downloadedAudios/${downloadId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'downloadedAudios', downloadId), {
      id: downloadId,
      userId: params.userId,
      generatedAudioId: params.generatedAudioId,
      serverAudioId: params.serverAudioId,
      voiceName: params.voiceName.slice(0, 80),
      textSnippet: (params.textSnippet || 'Generated Speech').slice(0, 200),
      language: params.language,
      format: params.format,
      fileSizeBytes: Math.max(1, Math.min(52428800, Math.round(params.fileSizeBytes))),
      downloadedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'generatedAudios', params.generatedAudioId), {
      downloadCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, dlPath);
  }
}

export async function deleteGeneratedAudioDoc(audioId: string) {
  const path = `generatedAudios/${audioId}`;
  try {
    await deleteDoc(doc(db, 'generatedAudios', audioId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteDownloadedAudioDoc(downloadId: string) {
  const path = `downloadedAudios/${downloadId}`;
  try {
    await deleteDoc(doc(db, 'downloadedAudios', downloadId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
