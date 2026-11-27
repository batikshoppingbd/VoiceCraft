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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets to enable AI voice analysis and speech synthesis.'
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

function normalizeGeminiMimeType(mimeType: string, fileName: string): string {
  const lower = (mimeType || '').toLowerCase();
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (lower.includes('wav') || ext === 'wav') return 'audio/wav';
  if (lower.includes('mpeg') || lower.includes('mp3') || ext === 'mp3') return 'audio/mp3';
  if (lower.includes('mp4') || lower.includes('m4a') || ext === 'm4a') return 'audio/mp4';
  if (lower.includes('webm') || ext === 'webm') return 'audio/webm';
  if (lower.includes('ogg') || ext === 'ogg') return 'audio/ogg';
  return 'audio/wav';
}

export async function analyzeVoiceSample(params: {
  audioBuffer: Buffer;
  mimeType: string;
  fileName: string;
  declaredLanguage: SupportedLanguage;
  consentPhrase: string;
}): Promise<VoiceAnalysisResult> {
  const ai = getGenAiClient();
  const normalizedMime = normalizeGeminiMimeType(params.mimeType, params.fileName);

  // Measure exact duration if WAV
  let wavDuration: number | null = null;
  if (normalizedMime === 'audio/wav') {
    try {
      const parsed = parseWavBuffer(params.audioBuffer);
      wavDuration = parsed.durationSec;
    } catch {
      // Ignore if non-standard WAV header; Gemini still inspects audio bytes
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
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

  const response = await ai.models.generateContent({
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
