import {
  getAdminEngineStatus,
  verifyAuthenticatedUser,
} from '../../server/studioHandlers.js';
import { type ApiRequest, type ApiResponse, sendApiError } from '../_utils.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    await verifyAuthenticatedUser(req.headers);
    res.status(200).json(getAdminEngineStatus());
  } catch (err) {
    sendApiError(res, err, 'Failed to read engine status.');
  }
}
