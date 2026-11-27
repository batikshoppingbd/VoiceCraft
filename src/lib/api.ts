import {
  base64ToBlob,
  deleteAudioBlobFromCache,
  resolveCachedAudio,
  saveAudioBlobToCache,
} from './audioCache';
import { getAuthIdToken, getWorkspaceId } from './firebase';
import type {
  AudioFormat,
  BaseVoiceName,
  SupportedLanguage,
} from '../types/studio';

export interface AnalyzeVoiceResponse {
  sampleAudioId: string;
  sampleMimeType: string;
  previewAudioId: string;
  previewDurationSec: number;
  previewWaveformPeaks: number[];
  previewWavBase64?: string;
  analysis: {
    voiceDetected: boolean;
    transcript: string;
    detectedLanguage: SupportedLanguage;
    estimatedDurationSec: number;
    baseVoiceName: BaseVoiceName;
    pitchRegister: string;
    speakingTempo: string;
    timbreProfile: string;
    acousticSummary: string;
    voiceStylePrompt: string;
    suggestedSpeed: number;
    suggestedPitch: number;
  };
}

export interface GenerateTtsResponse {
  serverAudioId: string;
  durationSec: number;
  format: AudioFormat;
  fileSizeBytes: number;
  wavSizeBytes: number;
  mp3SizeBytes: number;
  waveformPeaks: number[];
  wavBase64?: string;
  mp3Base64?: string;
}

export interface AdminEngineStatus {
  geminiConfigured: boolean;
  runtime: 'vercel' | 'node';
  modelAnalysis: string;
  modelTts: string;
}

async function getAuthHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const idToken = await getAuthIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
    'X-Studio-Client-Id': getWorkspaceId(),
    ...extra,
  };
}

function extractFriendlyErrorMessage(rawMessage: string, status: number): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return `Request failed (${status})`;
  try {
    const inner = JSON.parse(trimmed) as { error?: { message?: string } | string };
    if (typeof inner?.error === 'string') return inner.error;
    if (inner?.error && typeof inner.error === 'object' && inner.error.message) {
      return inner.error.message;
    }
  } catch {
    // Not nested JSON
  }
  return trimmed;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 413) {
    throw new Error(
      'Audio sample is too large (max 4 MB). Please record 6–30s with the microphone or upload a smaller MP3/M4A file.'
    );
  }

  const rawText = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    rawText.trimStart().toLowerCase().startsWith('<!doctype') ||
    rawText.trimStart().toLowerCase().startsWith('<html');

  if (looksLikeHtml) {
    throw new Error(
      `The server returned an HTML page instead of audio data (HTTP ${res.status}). Please retry in a few seconds.`
    );
  }

  let parsed: unknown = null;
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status}): ${rawText.slice(0, 140)}`);
      }
      throw new Error('Server returned an invalid response format. Please try again.');
    }
  }

  if (!res.ok) {
    const errObj = parsed as { error?: string } | null;
    const rawMsg = errObj?.error || `Request failed (${res.status})`;
    throw new Error(extractFriendlyErrorMessage(rawMsg, res.status));
  }

  return parsed as T;
}

async function parseErrorResponse(res: Response): Promise<never> {
  const rawText = await res.text().catch(() => '');
  let msg = `Request failed (${res.status})`;
  try {
    const data = JSON.parse(rawText) as { error?: string };
    if (data?.error) msg = extractFriendlyErrorMessage(data.error, res.status);
  } catch {
    if (rawText && !rawText.trimStart().toLowerCase().startsWith('<')) {
      msg = rawText.slice(0, 140);
    }
  }
  throw new Error(msg);
}

export async function apiGetAdminEngineStatus(): Promise<AdminEngineStatus> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/admin/status', { headers });
  return parseJsonResponse<AdminEngineStatus>(res);
}

export async function apiAnalyzeVoiceSample(params: {
  audioBlob: Blob;
  fileName: string;
  voiceName: string;
  language: SupportedLanguage;
  ownershipAccepted: boolean;
  consentStatement: string;
}): Promise<AnalyzeVoiceResponse> {
  const formData = new FormData();
  formData.append('audio', params.audioBlob, params.fileName);
  formData.append('voiceName', params.voiceName);
  formData.append('language', params.language);
  formData.append('ownershipAccepted', String(params.ownershipAccepted));
  formData.append('consentStatement', params.consentStatement);

  const headers = await getAuthHeaders();
  const res = await fetch('/api/voices/analyze', {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await parseJsonResponse<AnalyzeVoiceResponse>(res);
  const ext = (params.fileName.split('.').pop() || 'webm').toLowerCase();
  await saveAudioBlobToCache('samples', data.sampleAudioId, ext, params.audioBlob);

  if (data.previewWavBase64) {
    const previewBlob = base64ToBlob(data.previewWavBase64, 'audio/wav');
    await saveAudioBlobToCache('generated', data.previewAudioId, 'wav', previewBlob);
  }

  return data;
}

export async function apiGenerateVoicePreview(params: {
  voiceName: string;
  language: SupportedLanguage;
  baseVoiceName: BaseVoiceName;
  voiceStylePrompt: string;
  speed: number;
  pitch: number;
}): Promise<{
  previewAudioId: string;
  durationSec: number;
  waveformPeaks: number[];
  fileSizeBytes: number;
  previewWavBase64?: string;
}> {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch('/api/voices/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse<{
    previewAudioId: string;
    durationSec: number;
    waveformPeaks: number[];
    fileSizeBytes: number;
    previewWavBase64?: string;
  }>(res);

  if (data.previewWavBase64) {
    const previewBlob = base64ToBlob(data.previewWavBase64, 'audio/wav');
    await saveAudioBlobToCache('generated', data.previewAudioId, 'wav', previewBlob);
  }

  return data;
}

export async function apiGenerateTts(params: {
  text: string;
  language: SupportedLanguage;
  baseVoiceName: BaseVoiceName;
  voiceStylePrompt: string;
  speed: number;
  pitch: number;
  styleOverride?: string;
  format: AudioFormat;
}): Promise<GenerateTtsResponse> {
  const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch('/api/tts/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse<GenerateTtsResponse>(res);

  if (data.wavBase64) {
    const wavBlob = base64ToBlob(data.wavBase64, 'audio/wav');
    await saveAudioBlobToCache('generated', data.serverAudioId, 'wav', wavBlob);
  }
  if (data.mp3Base64) {
    const mp3Blob = base64ToBlob(data.mp3Base64, 'audio/mpeg');
    await saveAudioBlobToCache('generated', data.serverAudioId, 'mp3', mp3Blob);
  }

  return data;
}

export async function fetchAuthorizedAudioBlob(
  category: 'samples' | 'generated',
  audioId: string,
  format?: AudioFormat
): Promise<Blob> {
  const cached = await resolveCachedAudio(category, audioId, format);
  if (cached) {
    return cached;
  }

  const query = format ? `?format=${format}` : '';
  const url = `/api/audio/${category}/${audioId}${query}`;
  const headers = await getAuthHeaders();

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch {
    await new Promise((r) => setTimeout(r, 600));
    try {
      res = await fetch(url, { headers });
    } catch {
      throw new Error('Could not reach audio server. Check connection and tap Retry.');
    }
  }

  if (!res.ok) return parseErrorResponse(res);
  const blob = await res.blob();
  await saveAudioBlobToCache(category, audioId, format || 'wav', blob);
  return blob;
}

export async function triggerAuthorizedDownload(params: {
  category: 'samples' | 'generated';
  audioId: string;
  format: AudioFormat;
  downloadFileName: string;
}): Promise<number> {
  const blob = await fetchAuthorizedAudioBlob(params.category, params.audioId, params.format);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.downloadFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return blob.size;
}

export async function apiDeleteAudioFile(
  category: 'samples' | 'generated',
  audioId: string
): Promise<void> {
  await deleteAudioBlobFromCache(category, audioId);
  const headers = await getAuthHeaders().catch(() => undefined);
  await fetch(`/api/audio/${category}/${audioId}`, {
    method: 'DELETE',
    headers,
  }).catch(() => undefined);
}
