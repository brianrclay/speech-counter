import { getStore } from '@netlify/blobs';
import { endpoint, json, verifyToken } from './lib/common.mjs';

export const config = { path: '/api/account-delete' };

export default endpoint(async (req) => {
    const { userId } = verifyToken(req);
    await getStore({ name: 'rosters', consistency: 'strong' }).delete(userId);
    return json(req, 200, { ok: true });
});
