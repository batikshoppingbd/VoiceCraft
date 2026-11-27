import { verifyAuthenticatedUser } from '../../../server/studioHandlers.js';
import { type ApiRequest, type ApiResponse, sendApiError } from '../../_utils.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    await verifyAuthenticatedUser(req.headers);
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
