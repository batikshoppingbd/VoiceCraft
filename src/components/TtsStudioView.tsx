import {
  AudioLines,
  Download,
  Loader2,
  Mic,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGenerateTts, triggerAuthorizedDownload } from '../lib/api';
import {
  createGeneratedAudioDoc,
  createPresetVoiceProfileDoc,
  recordAudioDownload,
} from '../lib/studioStore';
import type {
  ActiveAudioTrack,
  AudioFormat,
  StudioConfig,
  SupportedLanguage,
  UserSettings,
  VoiceProfile,
} from '../types/studio';

interface TtsStudioViewProps {
  userId: string;
  userSettings: UserSettings;
  studioConfig: StudioConfig;
  voices: VoiceProfile[];
  selectedVoiceId: string | null;
  onSelectVoiceId: (id: string) => void;
  onGoSettings: () => void;
  onGeneratedSuccess: () => void;
  onPlayTrack: (track: ActiveAudioTrack) => void;
}

const SAMPLE_SCRIPTS: Record<SupportedLanguage, { label: string; title: string; text: string }[]> = {
  en: [
    {
      label: 'Podcast Intro',
      title: 'Podcast Episode Intro',
      text: 'Welcome back to today’s briefing. In this episode, we explore how personal voice models preserve natural human warmth and bilingual fluency.',
    },
    {
      label: 'Product Narration',
      title: 'Product Narration Script',
      text: 'Built for creators who value clarity, precision, and privacy. Every syllable is synthesized directly from your calibrated vocal profile.',
    },
  ],
  bn: [
    {
      label: 'বাংলা সংবাদ পাঠ',
      title: 'বাংলা সংবাদ শিরোনাম',
      text: 'শুভ সকাল। আজকের বিশেষ প্রতিবেদনে আমরা দেখব কীভাবে কৃত্রিম বুদ্ধিমত্তা ব্যবহার করে নিজের কণ্ঠেই সাবলীল বাংলা অডিও তৈরি করা যায়।',
    },
    {
      label: 'গল্প ও বর্ণনা',
      title: 'শরতের বিকেল গল্প',
      text: 'শরতের বিকেলে নদীর পাড়ে বাতাসের মৃদু শব্দ শোনা যাচ্ছিল। ঠিক সেই মুহূর্তেই আমাদের নতুন যাত্রা শুরু হলো।',
    },
  ],
  bilingual: [
    {
      label: 'English + বাংলা Mix',
      title: 'Bilingual Studio Update',
      text: 'Good morning everyone! আজকে আমরা আমাদের নতুন VoiceCraft Studio প্রজেক্ট নিয়ে কথা বলব, যেখানে Bangla এবং English দুই ভাষাই সমানভাবে কাজ করে।',
    },
  ],
};

export function TtsStudioView({
  userId,
  userSettings,
  studioConfig,
  voices,
  selectedVoiceId,
  onSelectVoiceId,
  onGoSettings,
  onGeneratedSuccess,
  onPlayTrack,
}: TtsStudioViewProps) {
  const activeVoice =
    voices.find((v) => v.id === selectedVoiceId) || voices[0] || null;
  const maxTextLength = studioConfig.maxTextLength || 5000;
  const generatorPaused = !studioConfig.ttsEnabled;

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>(
    userSettings.defaultLanguage || studioConfig.defaultLanguage || 'en'
  );
  const [speed, setSpeed] = useState<number>(userSettings.defaultSpeed || 1.0);
  const [pitch, setPitch] = useState<number>(userSettings.defaultPitch ?? 0);
  const [format, setFormat] = useState<AudioFormat>(
    userSettings.defaultFormat || studioConfig.defaultFormat || 'wav'
  );
  const [styleOverride, setStyleOverride] = useState('');

  const [generating, setGenerating] = useState(false);
  const [creatingPreset, setCreatingPreset] = useState(false);
  const [progressStage, setProgressStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<{
    generatedAudioId: string;
    serverAudioId: string;
    durationSec: number;
    wavSizeBytes: number;
    mp3SizeBytes: number;
    voiceName: string;
    language: SupportedLanguage;
    title: string;
  } | null>(null);
  const [exportingFormat, setExportingFormat] = useState<AudioFormat | null>(null);

  useEffect(() => {
    if (activeVoice) {
      setSpeed(activeVoice.defaultSpeed);
      setPitch(activeVoice.defaultPitch);
      setLanguage(activeVoice.language);
    } else {
      setSpeed(userSettings.defaultSpeed);
      setPitch(userSettings.defaultPitch);
      setLanguage(userSettings.defaultLanguage);
      setFormat(userSettings.defaultFormat);
    }
  }, [activeVoice?.id, userSettings.defaultFormat]);

  const handleGenerate = async () => {
    setError(null);
    if (generatorPaused) {
      setError('Speech generation is currently paused by the administrator.');
      return;
    }
    if (!activeVoice) {
      setError('Please create a voice profile under Profile → My Voice Clone first.');
      return;
    }
    const trimmedText = text.trim();
    if (!trimmedText) {
      setError('Enter English or Bangla text to convert into speech.');
      return;
    }
    if (trimmedText.length > maxTextLength) {
      setError(`Text exceeds the current limit of ${maxTextLength.toLocaleString()} characters.`);
      return;
    }

    const derivedTitle =
      title.trim() ||
      trimmedText.split(/[\n.।!?]/)[0].trim().slice(0, 60) ||
      `${activeVoice.name} Audio`;

    setGenerating(true);
    setProgressStage('Preparing cloned voice profile...');

    const stageTimer = window.setTimeout(() => {
      setProgressStage('Synthesizing natural speech & applying speed/pitch...');
    }, 1200);

    try {
      const tts = await apiGenerateTts({
        text: trimmedText,
        language,
        baseVoiceName: activeVoice.baseVoiceName,
        voiceStylePrompt: activeVoice.voiceStylePrompt,
        speed,
        pitch,
        styleOverride: styleOverride.trim() || undefined,
        format,
      });

      setProgressStage('Saving audio to Home library...');
      const generatedAudioId = await createGeneratedAudioDoc({
        userId,
        voiceId: activeVoice.id,
        voiceName: activeVoice.name,
        title: derivedTitle,
        text: trimmedText,
        language,
        speed,
        pitch,
        styleOverride: styleOverride.trim() || undefined,
        serverAudioId: tts.serverAudioId,
        durationSec: tts.durationSec,
        format: tts.format,
        fileSizeBytes: tts.fileSizeBytes,
      });

      setLastGenerated({
        generatedAudioId,
        serverAudioId: tts.serverAudioId,
        durationSec: tts.durationSec,
        wavSizeBytes: tts.wavSizeBytes,
        mp3SizeBytes: tts.mp3SizeBytes,
        voiceName: activeVoice.name,
        language,
        title: derivedTitle,
      });

      onPlayTrack({
        id: generatedAudioId,
        serverAudioId: tts.serverAudioId,
        category: 'generated',
        title: derivedTitle,
        subtitle: `${activeVoice.name} · ${language === 'bn' ? 'বাংলা' : language === 'bilingual' ? 'Bilingual' : 'English'}`,
        durationSec: tts.durationSec,
        waveformPeaks: tts.waveformPeaks,
        generatedAudioId,
        language,
        voiceName: activeVoice.name,
        textSnippet: derivedTitle,
      });

      onGeneratedSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speech synthesis failed.');
    } finally {
      window.clearTimeout(stageTimer);
      setGenerating(false);
      setProgressStage('');
    }
  };

  const handleQuickExport = async (targetFmt: AudioFormat) => {
    if (!lastGenerated || exportingFormat) return;
    setExportingFormat(targetFmt);
    setError(null);
    try {
      const size = await triggerAuthorizedDownload({
        category: 'generated',
        audioId: lastGenerated.serverAudioId,
        format: targetFmt,
        downloadFileName: `${lastGenerated.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'voicecraft'}.${targetFmt}`,
      });
      await recordAudioDownload({
        userId,
        generatedAudioId: lastGenerated.generatedAudioId,
        serverAudioId: lastGenerated.serverAudioId,
        voiceName: lastGenerated.voiceName,
        textSnippet: lastGenerated.title,
        language: lastGenerated.language,
        format: targetFmt,
        fileSizeBytes: size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleUsePresetVoice = async () => {
    setCreatingPreset(true);
    setError(null);
    try {
      const id = await createPresetVoiceProfileDoc(userSettings.defaultLanguage || 'en');
      onSelectVoiceId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add preset voice.');
    } finally {
      setCreatingPreset(false);
    }
  };

  if (voices.length === 0) {
    return (
      <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
          <Mic className="w-6 h-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
          Choose or clone a voice to start
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Clone your personal voice under Profile → My Voice Clone, or load a ready-to-use AI Studio voice right away.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={onGoSettings}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <User className="w-4 h-4" />
            Open Profile & My Voice Clone
          </button>
          <button
            type="button"
            onClick={() => void handleUsePresetVoice()}
            disabled={creatingPreset}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[44px]"
          >
            {creatingPreset ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            )}
            Use Preset AI Voice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
          Generate Speech
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pick a voice, write Bangla or English text, and generate natural speech.
        </p>
      </div>

      {!studioConfig.ttsEnabled && (
        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
          Voice generation is temporarily paused in Studio Controls (/admin).
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        {/* Script & Voice Card */}
        <div className="lg:col-span-7 min-w-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          {/* Voice Selector right at top */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="studio-voice-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cloned Voice
              </label>
              <button
                type="button"
                onClick={onGoSettings}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Clone New
              </button>
            </div>
            <select
              id="studio-voice-select"
              value={activeVoice?.id || ''}
              onChange={(e) => onSelectVoiceId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 min-h-[44px]"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            {activeVoice && (
              <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <AudioLines className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">{activeVoice.pitchRegister}</span>
              </div>
            )}
          </div>

          {/* Audio Title */}
          <div>
            <label
              htmlFor="audio-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Audio Title
            </label>
            <input
              id="audio-title"
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning Bangla Intro, Product Demo..."
              className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Language & Sample Scripts */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'bn', label: 'বাংলা' },
                  { id: 'bilingual', label: 'Bilingual' },
                ] as const
              ).map((langOpt) => (
                <button
                  key={langOpt.id}
                  type="button"
                  onClick={() => setLanguage(langOpt.id)}
                  className={`px-2 py-2 text-xs font-medium rounded-lg transition-colors truncate min-h-[38px] ${
                    language === langOpt.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {langOpt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {SAMPLE_SCRIPTS[language].map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setTitle(sample.title);
                    setText(sample.text);
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Script Textarea */}
          <div>
            <textarea
              rows={5}
              maxLength={maxTextLength}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                language === 'bn'
                  ? 'এখানে আপনার বাংলা লেখা লিখুন...'
                  : language === 'bilingual'
                  ? 'Type English, বাংলা, or mixed text here...'
                  : 'Type or paste your text here...'
              }
              className="w-full p-3.5 text-base leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y min-h-[140px]"
            />

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              <span className="font-mono tabular-nums">
                {text.length} / {maxTextLength.toLocaleString()} chars
              </span>
              {text.length > 0 && (
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Voice Parameters, Export Format & Primary Generate Action */}
        <div className="lg:col-span-5 min-w-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">Speed</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full studio-slider bg-slate-200 dark:bg-slate-700"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">Pitch</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {pitch > 0 ? `+${pitch.toFixed(1)}` : pitch.toFixed(1)} st
                </span>
              </div>
              <input
                type="range"
                min={-6}
                max={6}
                step={0.5}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="w-full studio-slider bg-slate-200 dark:bg-slate-700"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="delivery-style"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Speaking Style (Optional)
            </label>
            <input
              id="delivery-style"
              type="text"
              maxLength={300}
              value={styleOverride}
              onChange={(e) => setStyleOverride(e.target.value)}
              placeholder="e.g. Warm storytelling, energetic, calm"
              className="w-full px-3.5 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Output Format
            </span>
            <div className="grid grid-cols-2 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setFormat('wav')}
                className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                  format === 'wav'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                WAV (Lossless)
              </button>
              <button
                type="button"
                onClick={() => setFormat('mp3')}
                className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                  format === 'mp3'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                MP3 (192kbps)
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !text.trim() || generatorPaused}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Generate Voice</span>
                </>
              )}
            </button>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {generating ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium block text-center">
                  {progressStage}
                </span>
              ) : lastGenerated ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                    Saved to Home ({lastGenerated.durationSec}s)
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickExport('wav')}
                      disabled={exportingFormat !== null}
                      className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      WAV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickExport('mp3')}
                      disabled={exportingFormat !== null}
                      className="inline-flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      MP3
                    </button>
                  </div>
                </div>
              ) : (
                <span className="block text-center">
                  Saved automatically to Home after generation.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
