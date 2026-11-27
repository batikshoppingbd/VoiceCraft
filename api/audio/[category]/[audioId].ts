import { validateWorkspaceClientId } from '../../../server/studioHandlers.js';
import { type ApiRequest, type ApiResponse, sendApiError } from '../../_utils.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  try {
    validateWorkspaceClientId(req.headers['x-studio-client-id']);
    if (req.method === 'DELETE') {
      res.status(200).json({ deleted: true });
      return;
    }
    res.status(404).json({
      error: 'This audio clip is only stored in the original browser where it was generated.',
    });
  } catch (err) {
    sendApiError(res, err, 'Audio lookup failed.');
  }
}
