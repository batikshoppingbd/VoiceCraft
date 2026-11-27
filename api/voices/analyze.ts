import {
  handleAnalyzeVoiceRequest,
  validateWorkspaceClientId,
} from '../../server/studioHandlers.js';
import {
  type ApiRequest,
  type ApiResponse,
  runMultipartAudioUpload,
  sendApiError,
} from '../_utils.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const uid = validateWorkspaceClientId(req.headers['x-studio-client-id']);
    await runMultipartAudioUpload(req, res);
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const result = await handleAnalyzeVoiceRequest({
      uid,
      file: req.file,
      body,
    });
    res.status(200).json(result);
  } catch (err) {
    sendApiError(res, err, 'Failed to analyze voice sample.');
  }
}
