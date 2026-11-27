import { getWorkspaceId } from './firebase';
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
}

function extractFriendlyErrorMessage(rawMessage: string, status: number): string {
  const trimmed = rawMessage.trim();
  if (!trimmed) return `Request failed (${status})`;
  // Extract nested Gemini JSON error message if present
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

  const res = await fetch('/api/voices/analyze', {
    method: 'POST',
    headers: {
      'X-Studio-Client-Id': getWorkspaceId(),
    },
    body: formData,
  });

  return parseJsonResponse<AnalyzeVoiceResponse>(res);
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
}> {
  const res = await fetch('/api/voices/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Studio-Client-Id': getWorkspaceId(),
    },
    body: JSON.stringify(params),
  });
  return parseJsonResponse(res);
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
  const res = await fetch('/api/tts/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Studio-Client-Id': getWorkspaceId(),
    },
    body: JSON.stringify(params),
  });
  return parseJsonResponse<GenerateTtsResponse>(res);
}

export async function fetchAuthorizedAudioBlob(
  category: 'samples' | 'generated',
  audioId: string,
  format?: AudioFormat
): Promise<Blob> {
  const query = format ? `?format=${format}` : '';
  const url = `/api/audio/${category}/${audioId}${query}`;
  const headers = {
    'X-Studio-Client-Id': getWorkspaceId(),
  };

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
  return res.blob();
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
  await fetch(`/api/audio/${category}/${audioId}`, {
    method: 'DELETE',
    headers: {
      'X-Studio-Client-Id': getWorkspaceId(),
    },
  });
}
