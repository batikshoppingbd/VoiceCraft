import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { encodePcmToMp3, parseWavBuffer } from './server/audioProcessor.js';
import {
  getAdminEngineStatus,
  handleAnalyzeVoiceRequest,
  handleGenerateTtsRequest,
  handlePreviewVoiceRequest,
  HttpError,
  resolveSafeUserFile,
  SAFE_ID_REGEX,
  validateWorkspaceClientId,
} from './server/studioHandlers.js';

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const STORAGE_ROOT = path.resolve(ROOT_DIR, 'storage');

// Ensure base storage root exists
fs.mkdirSync(STORAGE_ROOT, { recursive: true });

interface WorkspaceRequest extends Request {
  uid?: string;
}

function findExistingUserAudioFile(
  uid: string,
  category: 'samples' | 'generated',
  audioId: string
): { filePath: string; ext: string } | null {
  if (!SAFE_ID_REGEX.test(uid) || uid.length < 12 || !SAFE_ID_REGEX.test(audioId)) {
    return null;
  }
  const userCategoryDir = path.resolve(STORAGE_ROOT, uid, category);
  if (!fs.existsSync(userCategoryDir)) return null;
  const exts = ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'aac', 'flac', 'opus'];
  for (const ext of exts) {
    const candidate = path.resolve(userCategoryDir, `${audioId}.${ext}`);
    if (candidate.startsWith(userCategoryDir + path.sep) && fs.existsSync(candidate)) {
      return { filePath: candidate, ext };
    }
  }
  return null;
}

function requireAuthenticatedUser(
  req: WorkspaceRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    req.uid = validateWorkspaceClientId(req.headers['x-studio-client-id']);
    next();
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    const message =
      err instanceof Error ? err.message : 'Valid workspace identifier is required.';
    res.status(status).json({ error: message });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024 + 256 * 1024, // ~4.25 MB safe for serverless & local
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
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'voicecraft-studio' });
  });

  app.get('/api/admin/status', requireAuthenticatedUser, (_req, res) => {
    res.json(getAdminEngineStatus());
  });

  // 1. Analyze uploaded/recorded voice sample & build cloned voice profile + preview clip
  app.post(
    '/api/voices/analyze',
    requireAuthenticatedUser,
    upload.single('audio'),
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const result = await handleAnalyzeVoiceRequest({
          uid: req.uid!,
          file: req.file,
          body: (req.body || {}) as Record<string, unknown>,
        });
        res.json(result);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        if (status >= 500) {
          console.error('Voice analysis error:', err);
        }
        const message =
          err instanceof Error ? err.message : 'Failed to analyze voice sample.';
        res.status(status).json({ error: message });
      }
    }
  );

  // 2. Generate/regenerate preview clip for an existing cloned voice profile
  app.post(
    '/api/voices/preview',
    requireAuthenticatedUser,
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const result = await handlePreviewVoiceRequest({
          uid: req.uid!,
          body: (req.body || {}) as Record<string, unknown>,
        });
        res.json(result);
      } catch (err) {
        console.error('Voice preview error:', err);
        const status = err instanceof HttpError ? err.status : 500;
        res.status(status).json({
          error: err instanceof Error ? err.message : 'Failed to generate voice preview.',
        });
      }
    }
  );

  // 3. Text-to-Speech synthesis using the selected cloned voice profile
  app.post(
    '/api/tts/generate',
    requireAuthenticatedUser,
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const result = await handleGenerateTtsRequest({
          uid: req.uid!,
          body: (req.body || {}) as Record<string, unknown>,
        });
        res.json(result);
      } catch (err) {
        console.error('TTS generation error:', err);
        const status = err instanceof HttpError ? err.status : 500;
        res.status(status).json({
          error: err instanceof Error ? err.message : 'Speech synthesis failed.',
        });
      }
    }
  );

  // 4. Authenticated audio stream & WAV/MP3 export endpoint
  app.get(
    '/api/audio/:category/:audioId',
    requireAuthenticatedUser,
    (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const category = req.params.category;
        const audioId = req.params.audioId;
        const requestedFormat = req.query.format === 'mp3' ? 'mp3' : req.query.format === 'wav' ? 'wav' : null;
        const isDownload = req.query.download === '1';

        if (category !== 'samples' && category !== 'generated') {
          res.status(400).json({ error: 'Invalid audio category.' });
          return;
        }
        if (!SAFE_ID_REGEX.test(audioId)) {
          res.status(400).json({ error: 'Invalid audio identifier.' });
          return;
        }

        // Check if requested format file already exists
        if (requestedFormat && category === 'generated') {
          const directPath = resolveSafeUserFile(uid, 'generated', `${audioId}.${requestedFormat}`);
          if (fs.existsSync(directPath)) {
            if (isDownload) {
              res.setHeader(
                'Content-Disposition',
                `attachment; filename="voicecraft-${audioId}.${requestedFormat}"`
              );
            }
            res.type(requestedFormat === 'mp3' ? 'audio/mpeg' : 'audio/wav');
            res.sendFile(directPath);
            return;
          }

          // Convert on-demand from stored WAV if MP3 requested
          if (requestedFormat === 'mp3') {
            const wavPath = resolveSafeUserFile(uid, 'generated', `${audioId}.wav`);
            if (fs.existsSync(wavPath)) {
              const wavBuf = fs.readFileSync(wavPath);
              const parsed = parseWavBuffer(wavBuf);
              const mp3Buf = encodePcmToMp3(parsed.pcm, parsed.sampleRate, 192);
              fs.writeFileSync(directPath, mp3Buf);
              if (isDownload) {
                res.setHeader(
                  'Content-Disposition',
                  `attachment; filename="voicecraft-${audioId}.mp3"`
                );
              }
              res.type('audio/mpeg');
              res.send(mp3Buf);
              return;
            }
          }
        }

        const found = findExistingUserAudioFile(uid, category, audioId);
        if (!found) {
          res.status(404).json({ error: 'Audio file not found in this workspace.' });
          return;
        }

        const mimeMap: Record<string, string> = {
          wav: 'audio/wav',
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          webm: 'audio/webm',
          ogg: 'audio/ogg',
          aac: 'audio/aac',
          flac: 'audio/flac',
          opus: 'audio/ogg',
        };
        if (isDownload) {
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="voicecraft-${audioId}.${found.ext}"`
          );
        }
        res.type(mimeMap[found.ext] || 'audio/wav');
        res.sendFile(found.filePath);
      } catch (err) {
        console.error('Audio fetch error:', err);
        res.status(500).json({ error: 'Failed to retrieve audio file.' });
      }
    }
  );

  // 5. Authenticated delete audio file endpoint
  app.delete(
    '/api/audio/:category/:audioId',
    requireAuthenticatedUser,
    (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const category = req.params.category;
        const audioId = req.params.audioId;
        if ((category !== 'samples' && category !== 'generated') || !SAFE_ID_REGEX.test(audioId)) {
          res.status(400).json({ error: 'Invalid audio parameters.' });
          return;
        }
        const exts = ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'aac', 'flac', 'opus'];
        for (const ext of exts) {
          const p = resolveSafeUserFile(uid, category, `${audioId}.${ext}`);
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
          }
        }
        res.json({ deleted: true });
      } catch (err) {
        console.error('Audio delete error:', err);
        res.status(500).json({ error: 'Failed to delete audio file.' });
      }
    }
  );

  // Catch-all for unknown /api routes so they never fall through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Multer & general API error handler (always JSON, never HTML)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: `Upload error: ${err.message}` });
      return;
    }
    if (err instanceof Error && err.message.includes('Unsupported audio format')) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error('Unhandled API/server error:', err);
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoiceCraft Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
