import type { AudioFormat } from '../types/studio';

const DB_NAME = 'voicecraft_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';

function makeKey(
  category: 'samples' | 'generated',
  audioId: string,
  format: string
): string {
  return `${category}:${audioId}:${format}`;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open audio cache.'));
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function saveAudioBlobToCache(
  category: 'samples' | 'generated',
  audioId: string,
  format: string,
  blob: Blob
): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, makeKey(category, audioId, format));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal if browser blocks IndexedDB (e.g. private browsing restrictions)
  }
}

export async function getAudioBlobFromCache(
  category: 'samples' | 'generated',
  audioId: string,
  format: string
): Promise<Blob | null> {
  try {
    const db = await openAudioDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(makeKey(category, audioId, format));
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteAudioBlobFromCache(
  category: 'samples' | 'generated',
  audioId: string
): Promise<void> {
  try {
    const db = await openAudioDb();
    const formats = ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'raw'];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const fmt of formats) {
        store.delete(makeKey(category, audioId, fmt));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Fallback client-side WAV encoder when only MP3 is cached in IndexedDB
 * (used if a long >40s clip omitted WAV in the serverless JSON response).
 */
export async function convertAudioBlobToWav(sourceBlob: Blob): Promise<Blob> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuf = await sourceBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    const numChannels = 1;
    const sampleRate = decoded.sampleRate;
    const channelData = decoded.getChannelData(0);
    const dataBytes = channelData.length * 2;
    const wavBuf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(wavBuf);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      const clamped = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }

    return new Blob([wavBuf], { type: 'audio/wav' });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function resolveCachedAudio(
  category: 'samples' | 'generated',
  audioId: string,
  requestedFormat?: AudioFormat
): Promise<Blob | null> {
  if (category === 'samples') {
    for (const fmt of ['webm', 'wav', 'mp3', 'm4a', 'ogg', 'raw']) {
      const hit = await getAudioBlobFromCache('samples', audioId, fmt);
      if (hit) return hit;
    }
    return null;
  }

  if (requestedFormat) {
    const exact = await getAudioBlobFromCache('generated', audioId, requestedFormat);
    if (exact) return exact;
  }

  const wavHit = await getAudioBlobFromCache('generated', audioId, 'wav');
  const mp3Hit = await getAudioBlobFromCache('generated', audioId, 'mp3');

  if (!requestedFormat) {
    return wavHit || mp3Hit;
  }

  if (requestedFormat === 'wav' && mp3Hit) {
    try {
      const converted = await convertAudioBlobToWav(mp3Hit);
      await saveAudioBlobToCache('generated', audioId, 'wav', converted);
      return converted;
    } catch {
      return mp3Hit;
    }
  }

  return null;
}
