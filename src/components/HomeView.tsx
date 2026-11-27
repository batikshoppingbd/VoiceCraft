import {
  AudioLines,
  Calendar,
  Download,
  Loader2,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { apiDeleteAudioFile, triggerAuthorizedDownload } from '../lib/api';
import { deleteGeneratedAudioDoc, recordAudioDownload } from '../lib/firebase';
import type {
  ActiveAudioTrack,
  AudioFormat,
  GeneratedAudio,
  SupportedLanguage,
} from '../types/studio';

interface HomeViewProps {
  userId: string;
  generatedAudios: GeneratedAudio[];
  activeTrackId: string | null;
  onPlayTrack: (track: ActiveAudioTrack) => void;
  onGoGenerate: () => void;
  defaultFormat: AudioFormat;
}

function formatGeneratedDate(ts: { toDate?: () => Date } | undefined): string {
  if (!ts?.toDate) return 'Just now';
  return ts.toDate().toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLangLabel(lang: SupportedLanguage): string {
  if (lang === 'bn') return 'বাংলা';
  if (lang === 'bilingual') return 'Bilingual';
  return 'English';
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HomeView({
  userId,
  generatedAudios,
  activeTrackId,
  onPlayTrack,
  onGoGenerate,
  defaultFormat,
}: HomeViewProps) {
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | SupportedLanguage>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = generatedAudios.filter((item) => {
    const matchesLang = langFilter === 'all' || item.language === langFilter;
    const titleStr = (item.title || item.text).toLowerCase();
    const matchesQuery =
      !q ||
      titleStr.includes(q) ||
      item.voiceName.toLowerCase().includes(q) ||
      item.text.toLowerCase().includes(q);
    return matchesLang && matchesQuery;
  });

  const handleDownload = async (item: GeneratedAudio, format: AudioFormat) => {
    const key = `${item.id}-${format}`;
    setBusyKey(key);
    setError(null);
    try {
      const baseSlug = (item.title || item.voiceName || 'voicecraft')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const size = await triggerAuthorizedDownload({
        category: 'generated',
        audioId: item.serverAudioId,
        format,
        downloadFileName: `${baseSlug || 'voicecraft-audio'}.${format}`,
      });
      await recordAudioDownload({
        userId,
        generatedAudioId: item.id,
        serverAudioId: item.serverAudioId,
        voiceName: item.voiceName,
        textSnippet: (item.title || item.text).slice(0, 180),
        language: item.language,
        format,
        fileSizeBytes: size,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (item: GeneratedAudio) => {
    setBusyKey(`del-${item.id}`);
    setError(null);
    try {
      await deleteGeneratedAudioDoc(item.id);
      await apiDeleteAudioFile('generated', item.serverAudioId).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete audio.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
            Generated Voices
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            All your generated speech tracks with title, creation date, and instant download.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoGenerate}
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Generate Voice
        </button>
      </div>

      {/* Search & Language Filter */}
      {generatedAudios.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, text, or voice..."
              className="w-full pl-10 pr-4 py-2.5 text-base sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-4 sm:inline-grid w-full sm:w-auto gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'en', label: 'English' },
                { id: 'bn', label: 'বাংলা' },
                { id: 'bilingual', label: 'Both' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLangFilter(tab.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors truncate ${
                  langFilter === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {generatedAudios.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <AudioLines className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              No generated voices yet
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tap the <span className="font-semibold text-blue-600 dark:text-blue-400">+</span>{' '}
              button below to generate speech, or open Settings to clone your personal voice first.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoGenerate}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Generate First Voice
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No generated voice tracks match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const isCurrent = activeTrackId === item.id;
            const displayTitle = item.title?.trim() || item.text.slice(0, 64);

            return (
              <article
                key={item.id}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isCurrent
                    ? 'border-blue-500 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      onPlayTrack({
                        id: item.id,
                        serverAudioId: item.serverAudioId,
                        category: 'generated',
                        title: displayTitle,
                        subtitle: `${item.voiceName} · ${formatLangLabel(item.language)}`,
                        durationSec: item.durationSec,
                        generatedAudioId: item.id,
                        language: item.language,
                        voiceName: item.voiceName,
                        textSnippet: displayTitle,
                      })
                    }
                    aria-label={isCurrent ? `Playing ${displayTitle}` : `Play ${displayTitle}`}
                    className="w-11 h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center shrink-0 transition-colors"
                  >
                    {isCurrent ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {displayTitle}
                    </h2>

                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.text}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatGeneratedDate(item.createdAt)}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.voiceName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatLangLabel(item.language)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{item.durationSec}s</span>
                    </div>
                  </div>
                </div>

                {/* Action Row: Primary Download + Format Switch + Delete */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(item, defaultFormat)}
                      disabled={busyKey !== null}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      {busyKey === `${item.id}-${defaultFormat}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Download {defaultFormat.toUpperCase()}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(item, defaultFormat === 'mp3' ? 'wav' : 'mp3')
                      }
                      disabled={busyKey !== null}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[40px] text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      {busyKey === `${item.id}-${defaultFormat === 'mp3' ? 'wav' : 'mp3'}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      {defaultFormat === 'mp3' ? 'WAV' : 'MP3'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                      {formatFileSize(item.fileSizeBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={busyKey !== null}
                      aria-label={`Delete ${displayTitle}`}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      {busyKey === `del-${item.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
