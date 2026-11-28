import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import multer from 'multer';
import { HttpError } from '../server/studioHandlers.js';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  };
}

export interface ApiResponse extends ServerResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
}

const vercelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024 + 256 * 1024, // ~4.25 MB safe for Vercel serverless body limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.mp3', '.wav', '.m4a', '.aac', '.webm', '.ogg', '.opus', '.flac'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isAudioMime =
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/webm' ||
      file.mimetype === 'application/octet-stream';
    if (isAudioMime || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format. Please upload MP3, WAV, M4A, AAC, OGG, or WebM audio.'));
    }
  },
}).single('audio');

export function runMultipartAudioUpload(req: ApiRequest, res: ApiResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    vercelUpload(req as never, res as never, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function sendApiError(res: ApiResponse, err: unknown, fallback: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Audio sample is too large (max 4 MB). Please upload a compressed MP3/M4A or record 6–30s with the microphone.'
        : `Upload error: ${err.message}`;
    res.status(400).json({ error: msg });
    return;
  }
  if (err instanceof Error && err.message.includes('Unsupported audio format')) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('Vercel API error:', err);
  res.status(500).json({
    error: err instanceof Error ? err.message : fallback,
  });
}
