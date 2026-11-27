import { FileAudio, Mic, Square, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SupportedLanguage } from '../types/studio';

interface VoiceRecorderProps {
  language: SupportedLanguage;
  onSampleReady: (sample: {
    blob: Blob;
    fileName: string;
    sourceType: 'microphone' | 'upload';
    durationSec: number;
  } | null) => void;
}

const READING_PROMPTS: Record<SupportedLanguage, string> = {
  en: 'Hello, I am recording my personal voice sample for VoiceCraft Studio. I confirm this is my own voice, and I authorize creating a private speech profile.',
  bn: 'হ্যালো, আমি ভয়েসক্রাফ্ট স্টুডিওর জন্য আমার নিজের কণ্ঠের নমুনা রেকর্ড করছি। আমি নিশ্চিত করছি যে এটি আমার নিজস্ব কণ্ঠস্বর এবং আমি ব্যক্তিগত ভয়েস প্রোফাইল তৈরির অনুমতি দিচ্ছি।',
  bilingual:
    'Hello, this is my personal voice sample for VoiceCraft Studio. আমি বাংলা এবং ইংরেজি দুই ভাষাতেই স্বাভাবিকভাবে কথা বলার জন্য এই ভয়েস প্রোফাইলটি তৈরি করছি।',
};

export function VoiceRecorder({ language, onSampleReady }: VoiceRecorderProps) {
  const [captureMode, setCaptureMode] = useState<'microphone' | 'upload'>('microphone');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileLabel, setSelectedFileLabel] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const animRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    return () => {
      stopTimersAndStreams();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  const stopTimersAndStreams = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      window.cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const clearCurrentSample = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFileLabel(null);
    setElapsedSec(0);
    elapsedRef.current = 0;
    onSampleReady(null);
  };

  const startRecording = async () => {
    setMicError(null);
    clearCurrentSample();

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Microphone recording is unavailable in this browser. Please upload an audio file instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const ext = finalMime.includes('mp4') ? 'm4a' : finalMime.includes('ogg') ? 'ogg' : 'webm';
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setSelectedFileLabel(`Mic recording (${elapsedRef.current}s)`);
        onSampleReady({
          blob,
          fileName: `mic-sample.${ext}`,
          sourceType: 'microphone',
          durationSec: Math.max(1, elapsedRef.current),
        });
        stopTimersAndStreams();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      elapsedRef.current = 0;
      setElapsedSec(0);

      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSec(elapsedRef.current);
        if (elapsedRef.current >= 90) {
          stopRecording();
        }
      }, 1000);

      // Live frequency meter
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const drawMeter = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const bars = 24;
        const gap = 4;
        const barWidth = (canvas.width - gap * (bars - 1)) / bars;

        for (let i = 0; i < bars; i++) {
          const val = dataArray[i] / 255;
          const barH = Math.max(4, val * (canvas.height - 6));
          const x = i * (barWidth + gap);
          const y = (canvas.height - barH) / 2;
          ctx.fillStyle = val > 0.65 ? '#2563eb' : '#64748b';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, 3);
          ctx.fill();
        }
        animRef.current = window.requestAnimationFrame(drawMeter);
      };
      drawMeter();
    } catch (err) {
      stopTimersAndStreams();
      setIsRecording(false);
      setMicError(
        err instanceof Error
          ? `Microphone permission denied or unavailable: ${err.message}`
          : 'Could not access microphone.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    setMicError(null);
    const validExt = /\.(mp3|wav|m4a|webm|ogg)$/i.test(file.name);
    if (!validExt && !file.type.startsWith('audio/')) {
      setMicError('Unsupported format. Upload an MP3, WAV, M4A, or WebM audio file.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMicError('Audio sample must be under 4 MB. Use a shorter clip (6–30s) or MP3/M4A format.');
      return;
    }

    clearCurrentSample();
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFileLabel(`${file.name} (${(file.size / 1024).toFixed(0)} KB)`);

    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const dur = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 10;
      onSampleReady({
        blob: file,
        fileName: file.name,
        sourceType: 'upload',
        durationSec: Math.max(1, dur),
      });
    };
    probe.onerror = () => {
      onSampleReady({
        blob: file,
        fileName: file.name,
        sourceType: 'upload',
        durationSec: 10,
      });
    };
  };

  return (
    <div className="w-full min-w-0 space-y-3.5">
      {/* Full-width 2-column mode selector so it never overflows narrow mobile screens */}
      <div className="grid grid-cols-2 w-full gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setCaptureMode('microphone')}
          className={`min-h-[40px] px-2.5 py-2 text-xs font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0 ${
            captureMode === 'microphone'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Mic className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Record Mic</span>
        </button>
        <button
          type="button"
          onClick={() => setCaptureMode('upload')}
          className={`min-h-[40px] px-2.5 py-2 text-xs font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0 ${
            captureMode === 'upload'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Upload Audio</span>
        </button>
      </div>

      {captureMode === 'microphone' ? (
        <div className="w-full min-w-0 rounded-xl p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3.5">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Suggested Calibration Script (8–20 seconds)
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              “{READING_PROMPTS[language]}”
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
              >
                <Mic className="w-4 h-4 shrink-0" />
                <span>{previewUrl ? 'Re-record Voice' : 'Start Recording'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
              >
                <Square className="w-4 h-4 fill-current shrink-0" />
                <span>Stop ({elapsedSec}s)</span>
              </button>
            )}

            <div className="flex-1 min-w-0 min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center px-3 py-2 overflow-hidden">
              {isRecording ? (
                <canvas ref={canvasRef} width={300} height={36} className="w-full h-9" />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                  {selectedFileLabel
                    ? `Captured: ${selectedFileLabel}`
                    : 'Quiet room recommended (6–30s clear speech).'}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFilePicked(e.dataTransfer.files?.[0]);
          }}
          className={`w-full min-w-0 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/50 dark:bg-slate-950'
          }`}
        >
          <input
            type="file"
            accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
            className="sr-only"
            onChange={(e) => handleFilePicked(e.target.files?.[0])}
          />
          <FileAudio className="w-7 h-7 text-slate-400 dark:text-slate-500 mb-2" />
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Tap to upload voice sample
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            MP3, WAV, M4A, or WebM · Max 4 MB
          </div>
        </label>
      )}

      {micError && (
        <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {micError}
        </div>
      )}

      {previewUrl && !isRecording && (
        <div className="w-full min-w-0 flex flex-col gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
              {selectedFileLabel}
            </span>
            <button
              type="button"
              onClick={clearCurrentSample}
              aria-label="Discard voice sample"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
          <audio controls src={previewUrl} className="w-full h-9 max-w-full" />
        </div>
      )}
    </div>
  );
}
