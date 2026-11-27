import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { encodePcmToMp3, parseWavBuffer } from './server/audioProcessor.js';
import {
  analyzeVoiceSample,
  BaseVoiceName,
  SupportedLanguage,
  synthesizeClonedSpeech,
} from './server/geminiVoiceEngine.js';

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const STORAGE_ROOT = path.resolve(ROOT_DIR, 'storage');

// Ensure base storage root exists
fs.mkdirSync(STORAGE_ROOT, { recursive: true });

interface WorkspaceRequest extends Request {
  uid?: string;
}

const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

function resolveSafeUserFile(
  uid: string,
  category: 'samples' | 'generated',
  fileName: string
): string {
  if (!SAFE_ID_REGEX.test(uid) || uid.length < 12) {
    throw new Error('Invalid workspace identifier.');
  }
  if (!SAFE_FILENAME_REGEX.test(fileName)) {
    throw new Error('Invalid audio identifier.');
  }
  const userCategoryDir = path.resolve(STORAGE_ROOT, uid, category);
  fs.mkdirSync(userCategoryDir, { recursive: true });
  const targetPath = path.resolve(userCategoryDir, fileName);
  if (!targetPath.startsWith(userCategoryDir + path.sep)) {
    throw new Error('Path traversal rejected.');
  }
  return targetPath;
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
  const exts = ['wav', 'mp3', 'm4a', 'webm', 'ogg'];
  for (const ext of exts) {
    const candidate = path.resolve(userCategoryDir, `${audioId}.${ext}`);
    if (candidate.startsWith(userCategoryDir + path.sep) && fs.existsSync(candidate)) {
      return { filePath: candidate, ext };
    }
  }
  return null;
}

function requireWorkspaceClient(
  req: WorkspaceRequest,
  res: Response,
  next: NextFunction
): void {
  const clientId = String(req.headers['x-studio-client-id'] || '').trim();
  if (!clientId || clientId.length < 12 || clientId.length > 128 || !SAFE_ID_REGEX.test(clientId)) {
    res.status(400).json({ error: 'Valid workspace identifier is required.' });
    return;
  }
  req.uid = clientId;
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.mp3', '.wav', '.m4a', '.webm', '.ogg'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isAudioMime =
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/webm' ||
      file.mimetype === 'application/octet-stream';
    if (isAudioMime || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format. Please upload MP3, WAV, M4A, or WebM audio.'));
    }
  },
});

function inferExtension(mimeType: string, originalName: string): string {
  const ext = path.extname(originalName || '').toLowerCase().replace('.', '');
  if (['mp3', 'wav', 'm4a', 'webm', 'ogg'].includes(ext)) return ext;
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('webm')) return 'webm';
  return 'wav';
}

function isValidLanguage(val: unknown): val is SupportedLanguage {
  return val === 'en' || val === 'bn' || val === 'bilingual';
}

function isValidBaseVoice(val: unknown): val is BaseVoiceName {
  return (
    val === 'Puck' ||
    val === 'Charon' ||
    val === 'Kore' ||
    val === 'Fenrir' ||
    val === 'Zephyr'
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'voicecraft-studio' });
  });

  // 1. Analyze uploaded/recorded voice sample & build cloned voice profile + preview clip
  app.post(
    '/api/voices/analyze',
    requireWorkspaceClient,
    upload.single('audio'),
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const file = req.file;
        if (!file || file.buffer.length < 1024) {
          res.status(400).json({
            error: 'Please record or upload a clear voice sample (at least 2 seconds of speech).',
          });
          return;
        }

        const ownershipAccepted = req.body.ownershipAccepted === 'true';
        const consentStatement = String(req.body.consentStatement || '').trim();
        if (!ownershipAccepted || consentStatement.length < 10) {
          res.status(400).json({
            error:
              'Voice ownership verification is required. Confirm that this is your own voice or that you hold explicit permission.',
          });
          return;
        }

        const declaredLanguage: SupportedLanguage = isValidLanguage(req.body.language)
          ? req.body.language
          : 'en';
        const customName = String(req.body.voiceName || '').trim().slice(0, 80);

        const sampleAudioId = `smp_${crypto.randomUUID().replace(/-/g, '')}`;
        const ext = inferExtension(file.mimetype, file.originalname);
        const samplePath = resolveSafeUserFile(uid, 'samples', `${sampleAudioId}.${ext}`);
        fs.writeFileSync(samplePath, file.buffer);

        const analysis = await analyzeVoiceSample({
          audioBuffer: file.buffer,
          mimeType: file.mimetype,
          fileName: file.originalname,
          declaredLanguage,
          consentPhrase: consentStatement,
        });

        if (!analysis.voiceDetected) {
          // Delete invalid sample
          if (fs.existsSync(samplePath)) fs.unlinkSync(samplePath);
          res.status(422).json({
            error:
              analysis.rejectionReason ||
              'No clear human speech was detected in this recording. Please record in a quiet environment.',
          });
          return;
        }

        // Synthesize an immediate cloned voice preview clip so the user can audition their clone
        const previewAudioId = `prv_${crypto.randomUUID().replace(/-/g, '')}`;
        const previewText =
          declaredLanguage === 'bn'
            ? `হ্যালো, এটি আমার ব্যক্তিগত এআই ভয়েস প্রোফাইল${customName ? ` "${customName}"` : ''}। ভয়েস ক্লোনিং সফলভাবে সম্পন্ন হয়েছে।`
            : declaredLanguage === 'bilingual'
            ? `Hello! This is my cloned personal voice${customName ? ` "${customName}"` : ''}. আমি বাংলা এবং ইংরেজি দুই ভাষাতেই স্বাভাবিকভাবে কথা বলতে পারি।`
            : `Hello! This is my personal cloned voice profile${customName ? ` "${customName}"` : ''}. Voice analysis and neural synthesis calibration are complete.`;

        const previewSynthesis = await synthesizeClonedSpeech({
          text: previewText,
          language: declaredLanguage,
          baseVoiceName: analysis.baseVoiceName,
          voiceStylePrompt: analysis.voiceStylePrompt,
          speed: analysis.suggestedSpeed,
          pitch: analysis.suggestedPitch,
          includeMp3: false,
        });

        const previewPath = resolveSafeUserFile(uid, 'generated', `${previewAudioId}.wav`);
        fs.writeFileSync(previewPath, previewSynthesis.wavBuffer);

        res.json({
          sampleAudioId,
          sampleMimeType: file.mimetype || `audio/${ext}`,
          previewAudioId,
          previewDurationSec: previewSynthesis.durationSec,
          previewWaveformPeaks: previewSynthesis.waveformPeaks,
          analysis,
        });
      } catch (err) {
        console.error('Voice analysis error:', err);
        const message =
          err instanceof Error ? err.message : 'Failed to analyze voice sample.';
        res.status(500).json({ error: message });
      }
    }
  );

  // 2. Generate/regenerate preview clip for an existing cloned voice profile
  app.post(
    '/api/voices/preview',
    requireWorkspaceClient,
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const { voiceName, language, baseVoiceName, voiceStylePrompt, speed, pitch } = req.body;

        if (!isValidBaseVoice(baseVoiceName) || typeof voiceStylePrompt !== 'string') {
          res.status(400).json({ error: 'Invalid voice profile parameters.' });
          return;
        }

        const lang: SupportedLanguage = isValidLanguage(language) ? language : 'en';
        const safeName = String(voiceName || 'My Voice').trim().slice(0, 80);
        const previewText =
          lang === 'bn'
            ? `নমস্কার ও সালাম! আমি ${safeName}। আপনার যেকোনো বাংলা লেখা এখন আমার কণ্ঠে শুনতে পারবেন।`
            : lang === 'bilingual'
            ? `Hi, I am ${safeName}. আমি বাংলা এবং ইংরেজি উভয় ভাষাতেই স্পষ্টভাবে কথা বলতে পারি।`
            : `Hi, I am ${safeName}. Ready to convert your scripts into natural, studio-grade speech.`;

        const result = await synthesizeClonedSpeech({
          text: previewText,
          language: lang,
          baseVoiceName,
          voiceStylePrompt: voiceStylePrompt.slice(0, 1500),
          speed: Number(speed) || 1.0,
          pitch: Number(pitch) || 0,
          includeMp3: false,
        });

        const previewAudioId = `prv_${crypto.randomUUID().replace(/-/g, '')}`;
        const previewPath = resolveSafeUserFile(uid, 'generated', `${previewAudioId}.wav`);
        fs.writeFileSync(previewPath, result.wavBuffer);

        res.json({
          previewAudioId,
          durationSec: result.durationSec,
          waveformPeaks: result.waveformPeaks,
          fileSizeBytes: result.wavBuffer.length,
        });
      } catch (err) {
        console.error('Voice preview error:', err);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to generate voice preview.',
        });
      }
    }
  );

  // 3. Text-to-Speech synthesis using the selected cloned voice profile
  app.post(
    '/api/tts/generate',
    requireWorkspaceClient,
    async (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const {
          text,
          language,
          baseVoiceName,
          voiceStylePrompt,
          speed,
          pitch,
          styleOverride,
          format,
        } = req.body;

        const cleanText = typeof text === 'string' ? text.trim() : '';
        if (!cleanText || cleanText.length > 5000) {
          res.status(400).json({
            error: 'Please enter between 1 and 5,000 characters of text to synthesize.',
          });
          return;
        }
        if (!isValidBaseVoice(baseVoiceName) || typeof voiceStylePrompt !== 'string') {
          res.status(400).json({ error: 'Selected voice profile is invalid.' });
          return;
        }

        const lang: SupportedLanguage = isValidLanguage(language) ? language : 'en';
        const targetFormat = format === 'mp3' ? 'mp3' : 'wav';
        const safeSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0));
        const safePitch = Math.max(-6, Math.min(6, Number(pitch) || 0));

        const result = await synthesizeClonedSpeech({
          text: cleanText,
          language: lang,
          baseVoiceName,
          voiceStylePrompt: voiceStylePrompt.slice(0, 1500),
          speed: safeSpeed,
          pitch: safePitch,
          styleOverride: typeof styleOverride === 'string' ? styleOverride.slice(0, 300) : undefined,
          includeMp3: true,
        });

        const serverAudioId = `tts_${crypto.randomUUID().replace(/-/g, '')}`;
        // Store canonical WAV for lossless playback and instant WAV/MP3 export
        const wavPath = resolveSafeUserFile(uid, 'generated', `${serverAudioId}.wav`);
        fs.writeFileSync(wavPath, result.wavBuffer);

        if (result.mp3Buffer) {
          const mp3Path = resolveSafeUserFile(uid, 'generated', `${serverAudioId}.mp3`);
          fs.writeFileSync(mp3Path, result.mp3Buffer);
        }

        const primarySize =
          targetFormat === 'mp3' && result.mp3Buffer
            ? result.mp3Buffer.length
            : result.wavBuffer.length;

        res.json({
          serverAudioId,
          durationSec: result.durationSec,
          format: targetFormat,
          fileSizeBytes: primarySize,
          wavSizeBytes: result.wavBuffer.length,
          mp3SizeBytes: result.mp3Buffer?.length || primarySize,
          waveformPeaks: result.waveformPeaks,
        });
      } catch (err) {
        console.error('TTS generation error:', err);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Speech synthesis failed.',
        });
      }
    }
  );

  // 4. Authenticated audio stream & WAV/MP3 export endpoint
  app.get(
    '/api/audio/:category/:audioId',
    requireWorkspaceClient,
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
          res.status(404).json({ error: 'Audio file not found in your account.' });
          return;
        }

        const mimeMap: Record<string, string> = {
          wav: 'audio/wav',
          mp3: 'audio/mpeg',
          m4a: 'audio/mp4',
          webm: 'audio/webm',
          ogg: 'audio/ogg',
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
    requireWorkspaceClient,
    (req: WorkspaceRequest, res: Response) => {
      try {
        const uid = req.uid!;
        const category = req.params.category;
        const audioId = req.params.audioId;
        if ((category !== 'samples' && category !== 'generated') || !SAFE_ID_REGEX.test(audioId)) {
          res.status(400).json({ error: 'Invalid audio parameters.' });
          return;
        }
        const exts = ['wav', 'mp3', 'm4a', 'webm', 'ogg'];
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
