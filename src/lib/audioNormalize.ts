const TARGET_SAMPLE_RATE = 16000;

export interface NormalizedAudioResult {
  blob: Blob;
  durationSec: number;
  peakAmplitude: number;
}

/**
 * Downsamples mono Float32 PCM to 16 kHz and writes a standard 16-bit RIFF WAV Blob.
 * Caps duration at maxDurationSec (default 45s => <= 1.44 MB) so uploads stay fast and
 * well below Vercel's 4.5 MB serverless request body limit.
 */
export function encodeMonoWavBlob(
  samples: Float32Array,
  sourceSampleRate: number,
  maxDurationSec = 45
): NormalizedAudioResult {
  const safeRate = Math.max(8000, Math.min(192000, sourceSampleRate || TARGET_SAMPLE_RATE));
  const maxSourceSamples = Math.min(samples.length, Math.floor(safeRate * maxDurationSec));
  const ratio = safeRate / TARGET_SAMPLE_RATE;
  const targetLength = Math.max(1, Math.floor(maxSourceSamples / ratio));

  const pcm = new Int16Array(targetLength);
  let peakAmplitude = 0;

  for (let i = 0; i < targetLength; i++) {
    let val = 0;
    if (ratio >= 1.5) {
      // Box average across the decimation window to prevent aliasing
      const start = Math.floor(i * ratio);
      const end = Math.min(maxSourceSamples, Math.max(start + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
      }
      val = sum / (end - start);
    } else {
      const srcIdx = i * ratio;
      const i0 = Math.min(maxSourceSamples - 1, Math.floor(srcIdx));
      const i1 = Math.min(maxSourceSamples - 1, i0 + 1);
      const frac = srcIdx - i0;
      val = samples[i0] * (1 - frac) + samples[i1] * frac;
    }

    const clamped = Math.max(-1, Math.min(1, val));
    const abs = Math.abs(clamped);
    if (abs > peakAmplitude) peakAmplitude = abs;
    pcm[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }

  const dataByteLength = pcm.length * 2;
  const wavBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(wavBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(44 + i * 2, pcm[i], true);
  }

  return {
    blob: new Blob([wavBuffer], { type: 'audio/wav' }),
    durationSec: Number((pcm.length / TARGET_SAMPLE_RATE).toFixed(2)),
    peakAmplitude,
  };
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Decodes an uploaded or recorded Blob using Web Audio API and normalizes it to 16 kHz mono WAV.
 */
export async function decodeAndNormalizeAudioBlob(
  blob: Blob,
  maxDurationSec = 45
): Promise<NormalizedAudioResult> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Browser audio decoder is unavailable.');
  }

  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength < 44) {
    throw new Error('Audio data is empty or incomplete.');
  }

  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.duration <= 0) {
      throw new Error('Decoded audio stream is empty.');
    }

    const channelCount = Math.max(1, audioBuffer.numberOfChannels);
    const mono = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < channelCount; ch++) {
      const chData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) {
        mono[i] += chData[i] / channelCount;
      }
    }

    return encodeMonoWavBlob(mono, audioBuffer.sampleRate, maxDurationSec);
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close().catch(() => undefined);
    }
  }
}

/**
 * Checks leading magic bytes to reject non-audio or truncated/corrupt files before uploading.
 */
export async function hasRecognizedAudioSignature(blob: Blob): Promise<boolean> {
  if (blob.size < 512) return false;
  const headerBuf = await blob.slice(0, 32).arrayBuffer();
  const bytes = new Uint8Array(headerBuf);

  // RIFF....WAVE
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return true;
  }
  // ID3 tag (MP3)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // Raw MP3 MPEG sync or ADTS AAC sync
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  // MP4 / M4A ftyp box
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true;
  // OggS
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true;
  // fLaC
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return true;
  // WebM / Matroska EBML
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;

  return false;
}
