import {
  handleGenerateTtsRequest,
  validateWorkspaceClientId,
} from '../../server/studioHandlers.js';
import { type ApiRequest, type ApiResponse, sendApiError } from '../_utils.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const uid = validateWorkspaceClientId(req.headers['x-studio-client-id']);
    const body =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : {};
    const result = await handleGenerateTtsRequest({ uid, body });
    res.status(200).json(result);
  } catch (err) {
    sendApiError(res, err, 'Speech synthesis failed.');
  }
}
