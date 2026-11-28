import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  buildWavBuffer,
  computeWaveformPeaks,
  encodePcmToMp3,
  parseWavBuffer,
  processSpeedAndPitch,
} from './audioProcessor.js';

export type SupportedLanguage = 'en' | 'bn' | 'bilingual';
export type BaseVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface VoiceAnalysisResult {
  voiceDetected: boolean;
  rejectionReason?: string;
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
}

export interface SynthesisResult {
  wavBuffer: Buffer;
  mp3Buffer?: Buffer;
  durationSec: number;
  waveformPeaks: number[];
}

function getGenAiClient(): GoogleGenAI {
  const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const locationHint =
      process.env.VERCEL === '1'
        ? 'Vercel Project Settings > Environment Variables (then Redeploy)'
        : 'Settings > Secrets';
    throw new Error(
      `GEMINI_API_KEY is not configured. Add your Gemini API key in ${locationHint} to enable AI voice analysis and speech synthesis.`
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class VoiceInputValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err || 'Gemini request failed');
  let extracted = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
    if (parsed?.error?.message) {
      extracted = parsed.error.message;
    }
  } catch {
    // raw wasn't JSON
  }

  const lower = extracted.toLowerCase();
  if (
    lower.includes('unable to process input') ||
    lower.includes('empty, corrupted, or malformed') ||
    lower.includes('unsupported audio') ||
    lower.includes('invalid audio')
  ) {
    return new VoiceInputValidationError(
      422,
      'This audio sample could not be decoded (empty, silent, or unsupported codec). Please record with your microphone or upload a clear WAV, MP3, or M4A recording.'
    );
  }

  return err instanceof Error ? new Error(extracted) : new Error(extracted);
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('econnreset')
  );
}

function detectAudioMimeFromBuffer(
  buffer: Buffer,
  clientMimeType: string,
  fileName: string
): string {
  if (!buffer || buffer.length < 512) {
    throw new VoiceInputValidationError(
      400,
      'The uploaded audio sample is empty or too short. Please record or upload at least 2 seconds of speech.'
    );
  }

  // 1. Inspect magic bytes first so mislabeled extensions/MIME types never send invalid container bytes
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return 'audio/wav';
  }
  if (buffer.toString('ascii', 0, 3) === 'ID3') {
    return 'audio/mp3';
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    // ADTS AAC frame sync (0xFF 0xF1 / 0xFF 0xF9)
    return 'audio/aac';
  }
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    // MPEG-1/2/2.5 Layer III frame sync
    return 'audio/mp3';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'audio/mp4';
  }
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  if (buffer.toString('ascii', 0, 4) === 'fLaC') {
    return 'audio/flac';
  }
  if (
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'audio/webm';
  }

  // 2. Fallback to explicit audio mime/extension only if known (never blindly default to audio/wav)
  const lower = (clientMimeType || '').toLowerCase();
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (lower.includes('mpeg') || lower.includes('mp3') || ext === 'mp3') return 'audio/mp3';
  if (lower.includes('mp4') || lower.includes('m4a') || ext === 'm4a') return 'audio/mp4';
  if (lower.includes('webm') || ext === 'webm') return 'audio/webm';
  if (lower.includes('ogg') || lower.includes('opus') || ext === 'ogg' || ext === 'opus') return 'audio/ogg';
  if (lower.includes('aac') || ext === 'aac') return 'audio/aac';
  if (lower.includes('flac') || ext === 'flac') return 'audio/flac';

  throw new VoiceInputValidationError(
    400,
    'The uploaded audio file is corrupted or in an unrecognized format. Please record via microphone or upload a valid WAV, MP3, or M4A file.'
  );
}

export async function analyzeVoiceSample(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName: string;
  declaredLanguage: SupportedLanguage;
  consentPhrase: string;
}): Promise<VoiceAnalysisResult> {
  const ai = getGenAiClient();
  const normalizedMime = detectAudioMimeFromBuffer(
    params.audioBuffer,
    params.mimeType,
    params.fileName
  );

  // Validate WAV header and verify non-silent audio when WAV container is detected
  let wavDuration: number | null = null;
  if (normalizedMime === 'audio/wav') {
    let parsed;
    try {
      parsed = parseWavBuffer(params.audioBuffer);
      wavDuration = parsed.durationSec;
    } catch {
      throw new VoiceInputValidationError(
        400,
        'This WAV file appears corrupted or uses an unsupported encoding. Please re-record with the microphone or upload a standard PCM WAV/MP3 file.'
      );
    }
    if (parsed.durationSec < 1.0 || parsed.pcm.length < 8000) {
      throw new VoiceInputValidationError(
        400,
        'Audio sample is too short (minimum 1.5 seconds of clear speech required).'
      );
    }
    let maxAbs = 0;
    const stride = Math.max(1, Math.floor(parsed.pcm.length / 4000));
    for (let i = 0; i < parsed.pcm.length; i += stride) {
      const a = Math.abs(parsed.pcm[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs < 60) {
      throw new VoiceInputValidationError(
        400,
        'The recorded audio contains only silence. Check your microphone input and speak clearly for 6–15 seconds.'
      );
    }
  }

  const audioPart = {
    inlineData: {
      mimeType: normalizedMime,
      data: params.audioBuffer.toString('base64'),
    },
  };

  const prompt = `Analyze this uploaded personal voice recording carefully for AI voice cloning profile creation.
User declared primary language: ${params.declaredLanguage}.
User ownership consent statement: "${params.consentPhrase}".

Perform these steps on the actual audio signal:
1. Verify whether clear human speech is present (set voiceDetected=false only if silent, pure static/noise, or music without speech, and explain why in rejectionReason).
2. Transcribe the spoken speech verbatim in its original script (English or Bangla/Bengali script, or mixed).
3. Detect the spoken language ('en', 'bn', or 'bilingual').
4. Estimate the audio duration in seconds (at least 1).
5. Select the single closest acoustic base voice timbre from these exact 5 neural voices:
   - 'Charon': Deep, grounded, authoritative male baritone
   - 'Fenrir': Rich, warm, expressive mid-low male tenor/baritone
   - 'Puck': Bright, energetic, clear higher-pitched male/youthful voice
   - 'Kore': Warm, balanced, natural expressive female alto
   - 'Zephyr': Crisp, airy, articulate bright female soprano/mezzo
6. Describe the speaker's acoustic profile accurately:
   - pitchRegister (e.g. "Warm Baritone (~118 Hz)" or "Clear Alto (~205 Hz)")
   - speakingTempo (e.g. "Measured Conversational (~132 WPM)")
   - timbreProfile (concise description of resonance, breathiness, warmth, consonant crispness)
   - acousticSummary (1-2 crisp sentences summarizing vocal character)
   - voiceStylePrompt: A detailed, specific Voice Design persona instruction (40-120 words) that guides a neural TTS model to reproduce this speaker's vocal weight, phrasing rhythm, emotional warmth, pause habits, resonance, and English/Bangla pronunciation style.
   - suggestedPitch: recommended semitone offset (-4.0 to +4.0, 0 if base voice matches well) to align pitch closely with the recorded speaker.
   - suggestedSpeed: recommended speaking rate multiplier (0.85 to 1.15, 1.0 if standard).`;

  const buildAnalyzeRequest = (model: string) =>
    ai.models.generateContent({
      model,
      contents: { parts: [audioPart, { text: prompt }] },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            voiceDetected: { type: Type.BOOLEAN },
            rejectionReason: { type: Type.STRING },
            transcript: { type: Type.STRING },
            detectedLanguage: { type: Type.STRING, enum: ['en', 'bn', 'bilingual'] },
            estimatedDurationSec: { type: Type.NUMBER },
            baseVoiceName: {
              type: Type.STRING,
              enum: ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'],
            },
            pitchRegister: { type: Type.STRING },
            speakingTempo: { type: Type.STRING },
            timbreProfile: { type: Type.STRING },
            acousticSummary: { type: Type.STRING },
            voiceStylePrompt: { type: Type.STRING },
            suggestedSpeed: { type: Type.NUMBER },
            suggestedPitch: { type: Type.NUMBER },
          },
          required: [
            'voiceDetected',
            'transcript',
            'detectedLanguage',
            'estimatedDurationSec',
            'baseVoiceName',
            'pitchRegister',
            'speakingTempo',
            'timbreProfile',
            'acousticSummary',
            'voiceStylePrompt',
            'suggestedSpeed',
            'suggestedPitch',
          ],
        },
      },
    });

  let response;
  try {
    response = await buildAnalyzeRequest('gemini-4-hydrogen');
  } catch (err) {
    if (!isTransientGeminiError(err)) {
      throw formatGeminiError(err);
    }
    await new Promise((r) => setTimeout(r, 1200));
    try {
      response = await buildAnalyzeRequest('gemini-3.1-flash-lite');
    } catch (retryErr) {
      throw formatGeminiError(retryErr);
    }
  }

  const rawText = (response.text ?? '{}').trim();
  let parsed: VoiceAnalysisResult;
  try {
    parsed = JSON.parse(rawText) as VoiceAnalysisResult;
  } catch {
    throw new Error('Voice analysis returned an unreadable response. Please try a clearer audio sample.');
  }

  if (wavDuration && wavDuration > 0) {
    parsed.estimatedDurationSec = wavDuration;
  } else {
    parsed.estimatedDurationSec = Math.max(1, Number((parsed.estimatedDurationSec || 5).toFixed(1)));
  }

  parsed.suggestedSpeed = Math.max(0.75, Math.min(1.35, Number((parsed.suggestedSpeed || 1.0).toFixed(2))));
  parsed.suggestedPitch = Math.max(-6, Math.min(6, Number((parsed.suggestedPitch || 0).toFixed(1))));
  parsed.pitchRegister = (parsed.pitchRegister || 'Natural Register').slice(0, 80);
  parsed.speakingTempo = (parsed.speakingTempo || 'Conversational Tempo').slice(0, 80);
  parsed.timbreProfile = (parsed.timbreProfile || 'Balanced vocal timbre').slice(0, 120);
  if (!parsed.voiceStylePrompt || parsed.voiceStylePrompt.trim().length < 10) {
    parsed.voiceStylePrompt =
      'Natural, expressive personal voice with warm conversational pacing and crisp articulation.';
  }

  return parsed;
}

export async function synthesizeClonedSpeech(params: {
  text: string;
  language: SupportedLanguage;
  baseVoiceName: BaseVoiceName;
  voiceStylePrompt: string;
  speed: number;
  pitch: number;
  styleOverride?: string;
  includeMp3?: boolean;
}): Promise<SynthesisResult> {
  const ai = getGenAiClient();

  const languageDirective =
    params.language === 'bn'
      ? 'Speak in natural, fluent Bengali (Bangla) with authentic Dhaka/Kolkata native pronunciation, clear vowels, and natural phrasing.'
      : params.language === 'bilingual'
      ? 'Speak fluently across English and Bengali (Bangla), handling code-switching naturally with authentic pronunciation in both languages.'
      : 'Speak in natural, fluent English with authentic phrasing and crisp articulation.';

  const pacingNote =
    params.speed > 1.15
      ? 'Maintain brisk, energetic pacing.'
      : params.speed < 0.85
      ? 'Maintain deliberate, unhurried pacing.'
      : 'Maintain natural conversational pacing.';

  const combinedStyle = [
    params.voiceStylePrompt,
    languageDirective,
    pacingNote,
    params.styleOverride?.trim() ? `Delivery direction: ${params.styleOverride.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 1200);

  const buildTtsRequest = () =>
    ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: params.text,
              speechMetadata: {
                style: combinedStyle,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: params.baseVoiceName,
            },
          },
        },
      },
    });

  let response;
  try {
    response = await buildTtsRequest();
  } catch (err) {
    if (!isTransientGeminiError(err)) {
      throw formatGeminiError(err);
    }
    await new Promise((r) => setTimeout(r, 1200));
    try {
      response = await buildTtsRequest();
    } catch (retryErr) {
      throw formatGeminiError(retryErr);
    }
  }

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Speech synthesis did not return audio data. Please check your input text and try again.');
  }

  const rawWavBuffer = Buffer.from(base64Audio, 'base64');
  const parsedWav = parseWavBuffer(rawWavBuffer);

  // Apply real DSP speed & pitch adjustment if modified from 1.0x / 0 st
  const processedPcm = processSpeedAndPitch(
    parsedWav.pcm,
    parsedWav.sampleRate,
    params.speed,
    params.pitch
  );

  const finalWavBuffer =
    processedPcm === parsedWav.pcm
      ? rawWavBuffer
      : buildWavBuffer(processedPcm, parsedWav.sampleRate);

  const durationSec = Number((processedPcm.length / parsedWav.sampleRate).toFixed(2));
  const waveformPeaks = computeWaveformPeaks(processedPcm, 64);

  let mp3Buffer: Buffer | undefined;
  if (params.includeMp3) {
    mp3Buffer = encodePcmToMp3(processedPcm, parsedWav.sampleRate, 192);
  }

  return {
    wavBuffer: finalWavBuffer,
    mp3Buffer,
    durationSec,
    waveformPeaks,
  };
}
