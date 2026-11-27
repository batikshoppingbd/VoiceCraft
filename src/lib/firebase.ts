import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AudioFormat,
  BaseVoiceName,
  GeneratedAudio,
  StudioConfig,
  SupportedLanguage,
  ThemeMode,
  UserProfile,
  UserRole,
  UserStatus,
  VoiceProfile,
} from '../types/studio';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'mdrashidulislamid20@gmail.com';

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  ttsEnabled: true,
  voiceCloningEnabled: true,
  maxTextLength: 5000,
  defaultLanguage: 'en',
  defaultFormat: 'wav',
  announcement: '',
  updatedBy: 'system',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export function getWorkspaceId(): string {
  return auth.currentUser?.uid || 'unauthenticated';
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
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
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
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
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

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export async function getAuthIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google first.');
  }
  return user.getIdToken();
}

export function generateSafeId(prefix: string): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  return `${prefix}_${raw}`;
}

async function getDocWithOfflineRetry(ref: ReturnType<typeof doc>) {
  try {
    return await getDoc(ref);
  } catch (firstErr) {
    if (
      firstErr instanceof Error &&
      (firstErr.message.includes('offline') || firstErr.message.includes('unavailable'))
    ) {
      await new Promise((r) => setTimeout(r, 1200));
      return await getDoc(ref);
    }
    throw firstErr;
  }
}

export async function ensureAuthenticatedUserProfile(
  firebaseUser: User
): Promise<{ profile: UserProfile; isAdmin: boolean }> {
  const uid = firebaseUser.uid;
  const email = (firebaseUser.email || '').trim();
  const displayName =
    (firebaseUser.displayName || email.split('@')[0] || 'VoiceCraft User').slice(0, 120);
  const photoURL = firebaseUser.photoURL ? firebaseUser.photoURL.slice(0, 512) : undefined;
  const isBootstrappedEmail =
    firebaseUser.emailVerified && email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  const userRef = doc(db, 'users', uid);
  const adminRef = doc(db, 'admins', uid);
  const setupRef = doc(db, 'systemConfig', 'adminSetup');

  try {
    const existingUserSnap = await getDocWithOfflineRetry(userRef);

    if (existingUserSnap.exists()) {
      const profile = existingUserSnap.data() as UserProfile;
      let hasAdminDoc = false;
      try {
        const adminSnap = await getDocWithOfflineRetry(adminRef);
        hasAdminDoc = adminSnap.exists();
      } catch {
        hasAdminDoc = false;
      }

      if (isBootstrappedEmail && !hasAdminDoc) {
        await setDoc(adminRef, {
          uid,
          email,
          grantedBy: 'bootstrapped_owner',
          createdAt: serverTimestamp(),
        });
        hasAdminDoc = true;
      }

      return {
        profile,
        isAdmin: isBootstrappedEmail || hasAdminDoc || profile.role === 'admin',
      };
    }

    // New user registration: check if first-user admin lock is unclaimed
    const setupSnap = await getDocWithOfflineRetry(setupRef);
    const shouldClaimFirstAdmin = !setupSnap.exists();
    const assignedRole: UserRole =
      shouldClaimFirstAdmin || isBootstrappedEmail ? 'admin' : 'user';

    const userPayload: Record<string, unknown> = {
      uid,
      email,
      displayName,
      role: assignedRole,
      status: 'active',
      defaultLanguage: 'en',
      defaultSpeed: 1.0,
      defaultPitch: 0,
      defaultFormat: 'wav',
      themePreference: 'light',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) {
      userPayload.photoURL = photoURL;
    }

    const batch = writeBatch(db);
    if (shouldClaimFirstAdmin) {
      batch.set(setupRef, {
        claimed: true,
        claimedAt: serverTimestamp(),
      });
    }
    if (assignedRole === 'admin') {
      batch.set(adminRef, {
        uid,
        email,
        grantedBy: shouldClaimFirstAdmin ? 'first_user_bootstrap' : 'bootstrapped_owner',
        createdAt: serverTimestamp(),
      });
    }
    batch.set(userRef, userPayload);
    await batch.commit();

    const createdSnap = await getDocWithOfflineRetry(userRef);
    return {
      profile: createdSnap.data() as UserProfile,
      isAdmin: assignedRole === 'admin',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export function subscribeStudioConfig(
  onUpdate: (config: StudioConfig) => void
): () => void {
  const ref = doc(db, 'systemConfig', 'studio');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Partial<StudioConfig>;
        onUpdate({
          ttsEnabled: data.ttsEnabled ?? true,
          voiceCloningEnabled: data.voiceCloningEnabled ?? true,
          maxTextLength: data.maxTextLength ?? 5000,
          defaultLanguage: data.defaultLanguage ?? 'en',
          defaultFormat: data.defaultFormat ?? 'wav',
          announcement: data.announcement || '',
          updatedBy: data.updatedBy || 'admin',
          updatedAt: data.updatedAt,
        });
      } else {
        onUpdate(DEFAULT_STUDIO_CONFIG);
      }
    },
    (err) => {
      console.warn('Studio config read notice:', err.message);
      onUpdate(DEFAULT_STUDIO_CONFIG);
    }
  );
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
      payload.displayName = updates.displayName.trim().slice(0, 120) || 'VoiceCraft User';
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

// ---------------- Admin Operations ----------------

export async function adminFetchUsers(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function adminSetUserStatus(
  targetUid: string,
  nextStatus: UserStatus
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminSetUserAdminRole(
  targetUser: UserProfile,
  makeAdmin: boolean,
  grantedByUid: string
): Promise<void> {
  const path = `users/${targetUser.uid}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', targetUser.uid), {
      role: makeAdmin ? 'admin' : 'user',
      updatedAt: serverTimestamp(),
    });
    if (makeAdmin) {
      batch.set(doc(db, 'admins', targetUser.uid), {
        uid: targetUser.uid,
        email: targetUser.email,
        grantedBy: grantedByUid,
        createdAt: serverTimestamp(),
      });
    } else {
      batch.delete(doc(db, 'admins', targetUser.uid));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminSaveStudioConfig(
  config: Omit<StudioConfig, 'updatedAt' | 'updatedBy'>,
  adminUid: string
): Promise<void> {
  const path = 'systemConfig/studio';
  try {
    const payload: Record<string, unknown> = {
      ttsEnabled: Boolean(config.ttsEnabled),
      voiceCloningEnabled: Boolean(config.voiceCloningEnabled),
      maxTextLength: Math.max(200, Math.min(5000, Math.round(config.maxTextLength))),
      defaultLanguage: config.defaultLanguage,
      defaultFormat: config.defaultFormat,
      updatedBy: adminUid.slice(0, 128),
      updatedAt: serverTimestamp(),
    };
    if (config.announcement && config.announcement.trim()) {
      payload.announcement = config.announcement.trim().slice(0, 300);
    }
    await setDoc(doc(db, 'systemConfig', 'studio'), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminFetchAllVoices(): Promise<VoiceProfile[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'voiceProfiles'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map((d) => d.data() as VoiceProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'voiceProfiles');
  }
}

export async function adminFetchAllAudios(): Promise<GeneratedAudio[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'generatedAudios'), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map((d) => d.data() as GeneratedAudio);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'generatedAudios');
  }
}

// ---------------- Studio Entity CRUD ----------------

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
    const cleanTitle = (
      params.title.trim() ||
      params.text.trim().slice(0, 60) ||
      'Generated Audio'
    ).slice(0, 120);
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
