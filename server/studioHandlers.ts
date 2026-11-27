import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeVoiceSample,
  BaseVoiceName,
  SupportedLanguage,
  synthesizeClonedSpeech,
} from './geminiVoiceEngine.js';

export const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

const ENABLE_LOCAL_DISK_STORAGE = process.env.VERCEL !== '1';
const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function validateWorkspaceClientId(rawHeader: unknown): string {
  const clientId = String(rawHeader || '').trim();
  if (
    !clientId ||
    clientId.length < 12 ||
    clientId.length > 128 ||
    !SAFE_ID_REGEX.test(clientId)
  ) {
    throw new HttpError(400, 'Valid workspace identifier is required.');
  }
  return clientId;
}

export function resolveSafeUserFile(
  uid: string,
  category: 'samples' | 'generated',
  fileName: string
): string {
  if (!SAFE_ID_REGEX.test(uid) || uid.length < 12) {
    throw new HttpError(400, 'Invalid workspace identifier.');
  }
  if (!SAFE_FILENAME_REGEX.test(fileName)) {
    throw new HttpError(400, 'Invalid audio identifier.');
  }
  const userCategoryDir = path.resolve(STORAGE_ROOT, uid, category);
  fs.mkdirSync(userCategoryDir, { recursive: true });
  const targetPath = path.resolve(userCategoryDir, fileName);
  if (!targetPath.startsWith(userCategoryDir + path.sep)) {
    throw new HttpError(403, 'Path traversal rejected.');
  }
  return targetPath;
}

function tryWriteLocalFile(
  uid: string,
  category: 'samples' | 'generated',
  fileName: string,
  data: Buffer
): void {
  if (!ENABLE_LOCAL_DISK_STORAGE) return;
  try {
    const filePath = resolveSafeUserFile(uid, category, fileName);
    fs.writeFileSync(filePath, data);
  } catch {
    // Ignore local disk write errors in read-only serverless environments
  }
}

function tryDeleteLocalFile(
  uid: string,
  category: 'samples' | 'generated',
  fileName: string
): void {
  if (!ENABLE_LOCAL_DISK_STORAGE) return;
  try {
    const filePath = resolveSafeUserFile(uid, category, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

export function inferExtension(mimeType: string, originalName: string): string {
  const ext = path.extname(originalName || '').toLowerCase().replace('.', '');
  if (['mp3', 'wav', 'm4a', 'webm', 'ogg'].includes(ext)) return ext;
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  return 'wav';
}

export function isValidLanguage(val: unknown): val is SupportedLanguage {
  return val === 'en' || val === 'bn' || val === 'bilingual';
}

export function isValidBaseVoice(val: unknown): val is BaseVoiceName {
  return (
    val === 'Puck' ||
    val === 'Charon' ||
    val === 'Kore' ||
    val === 'Fenrir' ||
    val === 'Zephyr'
  );
}

export async function handleAnalyzeVoiceRequest(params: {
  uid: string;
  file?: { buffer: Buffer; mimetype: string; originalname: string };
  body: Record<string, unknown>;
}) {
  const { uid, file, body } = params;
  if (!file || file.buffer.length < 1024) {
    throw new HttpError(
      400,
      'Please record or upload a clear voice sample (at least 2 seconds of speech).'
    );
  }

  const ownershipAccepted = String(body.ownershipAccepted) === 'true';
  const consentStatement = String(body.consentStatement || '').trim();
  if (!ownershipAccepted || consentStatement.length < 10) {
    throw new HttpError(
      400,
      'Voice ownership verification is required. Confirm that this is your own voice or that you hold explicit permission.'
    );
  }

  const declaredLanguage: SupportedLanguage = isValidLanguage(body.language)
    ? body.language
    : 'en';
  const customName = String(body.voiceName || '').trim().slice(0, 80);

  const sampleAudioId = `smp_${crypto.randomUUID().replace(/-/g, '')}`;
  const ext = inferExtension(file.mimetype, file.originalname);
  tryWriteLocalFile(uid, 'samples', `${sampleAudioId}.${ext}`, file.buffer);

  let analysis;
  try {
    analysis = await analyzeVoiceSample({
      audioBuffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      declaredLanguage,
      consentPhrase: consentStatement,
    });
  } catch (err) {
    tryDeleteLocalFile(uid, 'samples', `${sampleAudioId}.${ext}`);
    throw err;
  }

  if (!analysis.voiceDetected) {
    tryDeleteLocalFile(uid, 'samples', `${sampleAudioId}.${ext}`);
    throw new HttpError(
      422,
      analysis.rejectionReason ||
        'No clear human speech was detected in this recording. Please record in a quiet environment.'
    );
  }

  const previewAudioId = `prv_${crypto.randomUUID().replace(/-/g, '')}`;
  const previewText =
    declaredLanguage === 'bn'
      ? `হ্যালো, এটি আমার ব্যক্তিগত এআই ভয়েস প্রোফাইল${customName ? ` "${customName}"` : ''}। ভয়েস ক্লোনিং সফলভাবে সম্পন্ন হয়েছে।`
      : declaredLanguage === 'bilingual'
      ? `Hello! This is my cloned personal voice${customName ? ` "${customName}"` : ''}. আমি বাংলা এবং ইংরেজি দুই ভাষাতেই স্বাভাবিকভাবে কথা বলতে পারি।`
      : `Hello! This is my personal cloned voice profile${customName ? ` "${customName}"` : ''}. Voice analysis and neural synthesis calibration are complete.`;

  const previewSynthesis = await synthesizeClonedSpeech({
    text: previewText,
    language: declaredLanguage,
    baseVoiceName: analysis.baseVoiceName,
    voiceStylePrompt: analysis.voiceStylePrompt,
    speed: analysis.suggestedSpeed,
    pitch: analysis.suggestedPitch,
    includeMp3: false,
  });

  tryWriteLocalFile(uid, 'generated', `${previewAudioId}.wav`, previewSynthesis.wavBuffer);

  return {
    sampleAudioId,
    sampleMimeType: file.mimetype || `audio/${ext}`,
    previewAudioId,
    previewDurationSec: previewSynthesis.durationSec,
    previewWaveformPeaks: previewSynthesis.waveformPeaks,
    previewWavBase64: previewSynthesis.wavBuffer.toString('base64'),
    analysis,
  };
}

export async function handlePreviewVoiceRequest(params: {
  uid: string;
  body: Record<string, unknown>;
}) {
  const { uid, body } = params;
  const { voiceName, language, baseVoiceName, voiceStylePrompt, speed, pitch } = body;

  if (!isValidBaseVoice(baseVoiceName) || typeof voiceStylePrompt !== 'string') {
    throw new HttpError(400, 'Invalid voice profile parameters.');
  }

  const lang: SupportedLanguage = isValidLanguage(language) ? language : 'en';
  const safeName = String(voiceName || 'My Voice').trim().slice(0, 80);
  const previewText =
    lang === 'bn'
      ? `নমস্কার ও সালাম! আমি ${safeName}। আপনার যেকোনো বাংলা লেখা এখন আমার কণ্ঠে শুনতে পারবেন।`
      : lang === 'bilingual'
      ? `Hi, I am ${safeName}. আমি বাংলা এবং ইংরেজি উভয় ভাষাতেই স্পষ্টভাবে কথা বলতে পারি।`
      : `Hi, I am ${safeName}. Ready to convert your scripts into natural, studio-grade speech.`;

  const result = await synthesizeClonedSpeech({
    text: previewText,
    language: lang,
    baseVoiceName,
    voiceStylePrompt: voiceStylePrompt.slice(0, 1500),
    speed: Number(speed) || 1.0,
    pitch: Number(pitch) || 0,
    includeMp3: false,
  });

  const previewAudioId = `prv_${crypto.randomUUID().replace(/-/g, '')}`;
  tryWriteLocalFile(uid, 'generated', `${previewAudioId}.wav`, result.wavBuffer);

  return {
    previewAudioId,
    durationSec: result.durationSec,
    waveformPeaks: result.waveformPeaks,
    fileSizeBytes: result.wavBuffer.length,
    previewWavBase64: result.wavBuffer.toString('base64'),
  };
}

export async function handleGenerateTtsRequest(params: {
  uid: string;
  body: Record<string, unknown>;
}) {
  const { uid, body } = params;
  const {
    text,
    language,
    baseVoiceName,
    voiceStylePrompt,
    speed,
    pitch,
    styleOverride,
    format,
  } = body;

  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText || cleanText.length > 5000) {
    throw new HttpError(
      400,
      'Please enter between 1 and 5,000 characters of text to synthesize.'
    );
  }
  if (!isValidBaseVoice(baseVoiceName) || typeof voiceStylePrompt !== 'string') {
    throw new HttpError(400, 'Selected voice profile is invalid.');
  }

  const lang: SupportedLanguage = isValidLanguage(language) ? language : 'en';
  const targetFormat = format === 'mp3' ? 'mp3' : 'wav';
  const safeSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
  const safePitch = Math.max(-6, Math.min(6, Number(pitch) || 0));

  const result = await synthesizeClonedSpeech({
    text: cleanText,
    language: lang,
    baseVoiceName,
    voiceStylePrompt: voiceStylePrompt.slice(0, 1500),
    speed: safeSpeed,
    pitch: safePitch,
    styleOverride:
      typeof styleOverride === 'string' ? styleOverride.slice(0, 300) : undefined,
    includeMp3: true,
  });

  const serverAudioId = `tts_${crypto.randomUUID().replace(/-/g, '')}`;
  tryWriteLocalFile(uid, 'generated', `${serverAudioId}.wav`, result.wavBuffer);
  if (result.mp3Buffer) {
    tryWriteLocalFile(uid, 'generated', `${serverAudioId}.mp3`, result.mp3Buffer);
  }

  const primarySize =
    targetFormat === 'mp3' && result.mp3Buffer
      ? result.mp3Buffer.length
      : result.wavBuffer.length;

  // Keep combined JSON payload safely under Vercel's 4.5 MB response limit (~2.8 MB raw => ~3.75 MB base64)
  const mp3Len = result.mp3Buffer?.length || 0;
  const includeMp3Base64 = Boolean(result.mp3Buffer && mp3Len <= 2_800_000);
  const mp3Base64 = includeMp3Base64 ? result.mp3Buffer!.toString('base64') : undefined;

  const remainingRawBudget = 2_800_000 - (includeMp3Base64 ? mp3Len : 0);
  const wavBase64 =
    result.wavBuffer.length <= remainingRawBudget
      ? result.wavBuffer.toString('base64')
      : undefined;

  return {
    serverAudioId,
    durationSec: result.durationSec,
    format: targetFormat,
    fileSizeBytes: primarySize,
    wavSizeBytes: result.wavBuffer.length,
    mp3SizeBytes: result.mp3Buffer?.length || primarySize,
    waveformPeaks: result.waveformPeaks,
    wavBase64,
    mp3Base64,
  };
}
