import {
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fetchAuthorizedAudioBlob, triggerAuthorizedDownload } from '../lib/api';
import { recordAudioDownload } from '../lib/firebase';
import type { ActiveAudioTrack, AudioFormat } from '../types/studio';

interface StudioAudioPlayerProps {
  track: ActiveAudioTrack | null;
  userId: string;
  onClose?: () => void;
  compact?: boolean;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function StudioAudioPlayer({
  track,
  userId,
  onClose,
  compact = false,
}: StudioAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<AudioFormat | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadTrack() {
      if (!track) return;
      setLoading(true);
      setError(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(track.durationSec || 0);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      try {
        const blob = await fetchAuthorizedAudioBlob(track.category, track.serverAudioId);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
          try {
            await audioRef.current.play();
            setIsPlaying(true);
          } catch {
            // Autoplay might wait for direct click on some browsers
            setIsPlaying(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load audio stream.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTrack();

    return () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [track?.id, track?.serverAudioId, track?.category, reloadNonce]);

  if (!track) return null;

  const rawPeaks =
    track.waveformPeaks && track.waveformPeaks.length > 0
      ? track.waveformPeaks
      : Array.from({ length: 48 }, (_, i) =>
          Number((0.25 + 0.6 * Math.abs(Math.sin(i * 0.42 + 0.7))).toFixed(2))
        );

  // Downsample to 28 crisp bars in compact dock so bars & timecode never overflow 360px viewports
  const targetBarCount = compact ? 28 : 40;
  const peaks =
    rawPeaks.length <= targetBarCount
      ? rawPeaks
      : Array.from({ length: targetBarCount }, (_, i) => {
          const idx = Math.min(
            rawPeaks.length - 1,
            Math.floor((i * rawPeaks.length) / targetBarCount)
          );
          return rawPeaks[idx];
        });

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || loading) return;
    if (error && !objectUrlRef.current) {
      setReloadNonce((n) => n + 1);
      return;
    }
    if (el.paused) {
      try {
        await el.play();
        setIsPlaying(true);
      } catch {
        setError('Playback blocked by browser audio policy.');
      }
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const seekToRatio = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    el.currentTime = clamped * duration;
    setCurrentTime(el.currentTime);
  };

  const skipBy = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(duration || el.duration || 0, el.currentTime + delta));
    setCurrentTime(el.currentTime);
  };

  const toggleMute = () => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const handleDownload = async (format: AudioFormat) => {
    if (downloadingFormat) return;
    setDownloadingFormat(format);
    setError(null);
    try {
      const safeName = (track.title || 'voicecraft-audio')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const fileSizeBytes = await triggerAuthorizedDownload({
        category: track.category,
        audioId: track.serverAudioId,
        format,
        downloadFileName: `${safeName || 'voicecraft'}.${format}`,
      });

      if (track.generatedAudioId && track.language && track.voiceName) {
        await recordAudioDownload({
          userId,
          generatedAudioId: track.generatedAudioId,
          serverAudioId: track.serverAudioId,
          voiceName: track.voiceName,
          textSnippet: track.textSnippet || track.title,
          language: track.language,
          format,
          fileSizeBytes,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div
      className={`w-full max-w-full overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 ${
        compact ? 'rounded-2xl p-3' : 'rounded-2xl p-4 sm:p-5'
      }`}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {compact ? (
        <div className="space-y-2 min-w-0">
          {/* Row 1: Play + Title/Subtitle + Export WAV/MP3 + Close */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={togglePlay}
              disabled={loading}
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
              className="w-10 h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center transition-colors shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {track.title}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {track.subtitle}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {track.category === 'generated' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDownload('wav')}
                    disabled={downloadingFormat !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {downloadingFormat === 'wav' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    <span>WAV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload('mp3')}
                    disabled={downloadingFormat !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-[11px] font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors"
                  >
                    {downloadingFormat === 'mp3' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    <span>MP3</span>
                  </button>
                </>
              )}

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close player"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Timecodes + Compact Waveform Scrubber + Desktop Transport */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => skipBy(-5)}
              aria-label="Rewind 5 seconds"
              className="hidden sm:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
              {formatTimecode(currentTime)}
            </span>

            <div
              role="slider"
              tabIndex={0}
              aria-label="Audio playback progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seekToRatio((e.clientX - rect.left) / rect.width);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') skipBy(2);
                if (e.key === 'ArrowLeft') skipBy(-2);
              }}
              className="flex-1 min-w-0 h-7 flex items-center gap-[2px] cursor-pointer px-0.5 select-none overflow-hidden"
            >
              {peaks.map((peak, idx) => {
                const barRatio = idx / peaks.length;
                const active = barRatio <= progressRatio;
                return (
                  <div
                    key={idx}
                    style={{ height: `${Math.max(20, Math.round(peak * 100))}%` }}
                    className={`flex-1 min-w-[2px] rounded-full transition-colors ${
                      active
                        ? 'bg-blue-600 dark:bg-blue-400'
                        : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
                    }`}
                  />
                );
              })}
            </div>

            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
              {formatTimecode(duration)}
            </span>

            <button
              type="button"
              onClick={() => skipBy(5)}
              aria-label="Forward 5 seconds"
              className="hidden sm:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="hidden sm:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 min-w-0">
          {/* Track Info + Transport */}
          <div className="flex items-center gap-3 min-w-0 lg:w-72 shrink-0">
            <button
              type="button"
              onClick={togglePlay}
              disabled={loading}
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
              className="w-11 h-11 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center transition-colors shrink-0"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {track.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {track.subtitle}
              </div>
            </div>
          </div>

          {/* Interactive Waveform Scrub Bar */}
          <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => skipBy(-5)}
              aria-label="Rewind 5 seconds"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div
              role="slider"
              tabIndex={0}
              aria-label="Audio playback progress"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seekToRatio((e.clientX - rect.left) / rect.width);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') skipBy(2);
                if (e.key === 'ArrowLeft') skipBy(-2);
              }}
              className="flex-1 min-w-0 h-10 flex items-center gap-[2px] cursor-pointer px-1 select-none overflow-hidden"
            >
              {peaks.map((peak, idx) => {
                const barRatio = idx / peaks.length;
                const active = barRatio <= progressRatio;
                return (
                  <div
                    key={idx}
                    style={{ height: `${Math.max(16, Math.round(peak * 100))}%` }}
                    className={`flex-1 min-w-[2px] rounded-full transition-colors ${
                      active
                        ? 'bg-blue-600 dark:bg-blue-400'
                        : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
                    }`}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => skipBy(5)}
              aria-label="Forward 5 seconds"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
              {formatTimecode(currentTime)} / {formatTimecode(duration)}
            </span>
          </div>

          {/* Actions: Volume + Export WAV / MP3 + Close */}
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {track.category === 'generated' && (
              <>
                <button
                  type="button"
                  onClick={() => handleDownload('wav')}
                  disabled={downloadingFormat !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {downloadingFormat === 'wav' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  WAV
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('mp3')}
                  disabled={downloadingFormat !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  {downloadingFormat === 'mp3' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  MP3
                </button>
              </>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close player"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-red-600 dark:text-red-400">
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="font-semibold underline shrink-0 hover:text-red-700 dark:hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
