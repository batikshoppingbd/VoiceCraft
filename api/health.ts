import type { ApiRequest, ApiResponse } from './_utils.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }
  res.status(200).json({ status: 'ok', service: 'voicecraft-studio', runtime: 'vercel' });
}
