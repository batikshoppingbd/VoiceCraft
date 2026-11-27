import { Mp3Encoder } from '@breezystack/lamejs';

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Int16Array;
  durationSec: number;
}

/**
 * Parses a standard 16-bit PCM WAV buffer into metadata and Int16 samples.
 */
export function parseWavBuffer(buffer: Buffer): ParsedWav {
  if (buffer.length < 44) {
    throw new Error('Audio buffer is too small to be a valid WAV file.');
  }
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV header.');
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1 || dataSize <= 0) {
    throw new Error('WAV file contains no audio data chunk.');
  }

  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}-bit.`);
  }

  const totalSamples = Math.floor(dataSize / 2);
  const rawPcm = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    rawPcm[i] = buffer.readInt16LE(dataOffset + i * 2);
  }

  // Downmix stereo to mono if needed for uniform processing
  let pcm = rawPcm;
  if (channels > 1) {
    const monoLength = Math.floor(totalSamples / channels);
    const mono = new Int16Array(monoLength);
    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += rawPcm[i * channels + ch];
      }
      mono[i] = Math.round(sum / channels);
    }
    pcm = mono;
    channels = 1;
  }

  const durationSec = Number((pcm.length / sampleRate).toFixed(2));
  return { sampleRate, channels, bitsPerSample, pcm, durationSec };
}

/**
 * Wraps Int16 mono PCM into a standard 44-byte RIFF WAV buffer.
 */
export function buildWavBuffer(pcm: Int16Array, sampleRate: number): Buffer {
  const dataByteLength = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);
  buffer.write('RIFF', 0, 4, 'ascii');
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8, 4, 'ascii');
  buffer.write('fmt ', 12, 4, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20);  // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36, 4, 'ascii');
  buffer.writeUInt32LE(dataByteLength, 40);

  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(pcm[i], 44 + i * 2);
  }
  return buffer;
}

/**
 * WSOLA (Waveform Similarity Overlap-Add) time-scale modification.
 * Preserves pitch while scaling duration by `stretchFactor` (>1 = longer, <1 = shorter).
 */
function wsolaTimeStretch(input: Int16Array, sampleRate: number, stretchFactor: number): Float32Array {
  if (Math.abs(stretchFactor - 1.0) < 0.005 || input.length < 2048) {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = input[i];
    return out;
  }

  const winSize = Math.round(sampleRate * 0.032); // 32ms Hann window (~768 samples at 24kHz)
  const ha = Math.floor(winSize / 2); // Synthesis hop (50% overlap)
  const searchRadius = Math.round(sampleRate * 0.008); // +/- 8ms cross-correlation search

  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  const expectedOutLen = Math.max(winSize, Math.round(input.length * stretchFactor));
  const output = new Float32Array(expectedOutLen + winSize);
  const norm = new Float32Array(expectedOutLen + winSize);

  // Copy first window directly
  for (let i = 0; i < Math.min(winSize, input.length); i++) {
    output[i] += input[i] * hann[i];
    norm[i] += hann[i];
  }

  let outPos = ha;
  while (outPos + winSize < expectedOutLen) {
    const nominalInPos = Math.round(outPos / stretchFactor);
    if (nominalInPos + winSize >= input.length) break;

    // Cross-correlate overlap region with existing output tail to find optimal alignment
    const minOffset = Math.max(0, nominalInPos - searchRadius);
    const maxOffset = Math.min(input.length - winSize - 1, nominalInPos + searchRadius);

    let bestOffset = Math.max(0, Math.min(input.length - winSize - 1, nominalInPos));
    let bestCorr = -Infinity;

    // Step by 2 samples for fast, accurate correlation
    for (let cand = minOffset; cand <= maxOffset; cand += 2) {
      let corr = 0;
      let energy = 1e-6;
      for (let j = 0; j < ha; j += 2) {
        const outSample = output[outPos + j];
        const inSample = input[cand + j];
        corr += outSample * inSample;
        energy += inSample * inSample;
      }
      const normalizedCorr = corr / Math.sqrt(energy);
      if (normalizedCorr > bestCorr) {
        bestCorr = normalizedCorr;
        bestOffset = cand;
      }
    }

    for (let i = 0; i < winSize; i++) {
      output[outPos + i] += input[bestOffset + i] * hann[i];
      norm[outPos + i] += hann[i];
    }

    outPos += ha;
  }

  const result = new Float32Array(expectedOutLen);
  for (let i = 0; i < expectedOutLen; i++) {
    result[i] = norm[i] > 1e-4 ? output[i] / norm[i] : 0;
  }
  return result;
}

/**
 * Applies independent speed (0.5..2.0x) and pitch (-6..+6 semitones) DSP to 16-bit mono PCM.
 */
export function processSpeedAndPitch(
  pcm: Int16Array,
  sampleRate: number,
  speed: number,
  pitchSemitones: number
): Int16Array {
  const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
  const clampedPitch = Math.max(-6, Math.min(6, pitchSemitones));

  if (Math.abs(clampedSpeed - 1.0) < 0.01 && Math.abs(clampedPitch) < 0.05) {
    return pcm;
  }

  const pitchFactor = Math.pow(2, clampedPitch / 12);
  // First time-stretch by (pitchFactor / speed), then resample at step `pitchFactor`
  // Resulting duration = 1 / speed, resulting pitch = pitchFactor
  const stretchFactor = pitchFactor / clampedSpeed;
  const stretched = wsolaTimeStretch(pcm, sampleRate, stretchFactor);

  if (Math.abs(pitchFactor - 1.0) < 0.005) {
    const out = new Int16Array(stretched.length);
    for (let i = 0; i < stretched.length; i++) {
      out[i] = Math.max(-32768, Math.min(32767, Math.round(stretched[i])));
    }
    return out;
  }

  const resampledLength = Math.max(1, Math.floor(stretched.length / pitchFactor));
  const out = new Int16Array(resampledLength);
  for (let i = 0; i < resampledLength; i++) {
    const srcIdx = i * pitchFactor;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(stretched.length - 1, i0 + 1);
    const frac = srcIdx - i0;
    const sample = stretched[i0] * (1 - frac) + stretched[i1] * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(sample)));
  }
  return out;
}

/**
 * Encodes 16-bit mono PCM into an MP3 Buffer using @breezystack/lamejs.
 */
export function encodePcmToMp3(pcm: Int16Array, sampleRate: number, kbps = 192): Buffer {
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const blockSize = 1152;
  const mp3Chunks: Buffer[] = [];

  for (let i = 0; i < pcm.length; i += blockSize) {
    const slice = pcm.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(slice);
    if (encoded.length > 0) {
      mp3Chunks.push(Buffer.from(encoded));
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(Buffer.from(flushed));
  }

  return Buffer.concat(mp3Chunks);
}

/**
 * Computes normalized RMS waveform peaks (0..1) for studio audio player visualization.
 */
export function computeWaveformPeaks(pcm: Int16Array, barCount = 64): number[] {
  if (pcm.length === 0) return new Array(barCount).fill(0.1);
  const step = Math.max(1, Math.floor(pcm.length / barCount));
  const rawPeaks: number[] = [];
  let maxPeak = 1e-6;

  for (let b = 0; b < barCount; b++) {
    const start = b * step;
    const end = Math.min(pcm.length, start + step);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const abs = Math.abs(pcm[i]) / 32768;
      if (abs > peak) peak = abs;
    }
    rawPeaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  return rawPeaks.map((p) => Number(Math.max(0.08, Math.min(1, p / maxPeak)).toFixed(3)));
}
