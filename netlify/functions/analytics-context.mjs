import { endpoint, json, fail, stores, authenticate, saveAccount } from './lib/common.mjs';

export const config = { path: '/api/analytics-context' };

export default endpoint(async (req, context) => {
    if (context.deploy.context !== 'production') return json(req, 200, { ignored: true });
    const body = await req.json();
    if (typeof body.enabled !== 'boolean') throw fail(400, 'Invalid analytics preference');
    if (body.enabled && (!/^\d{1,20}\.\d{1,20}$/.test(body.clientId || '') || !/^\d{0,20}$/.test(body.sessionId || ''))) {
        throw fail(400, 'Invalid analytics identifiers');
    }
    const s = stores(context);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const auth = await authenticate(req, s);
        if (body.enabled && auth.account.analytics?.enabled === false && body.explicitPreference !== true) {
            return json(req, 200, { ok: true, enabled: false });
        }
        // Account deletion removes this alongside all other account fields.
        auth.account.analytics = body.enabled
            ? { enabled: true, clientId: body.clientId, sessionId: body.sessionId || null, updatedAt: Date.now() }
            : { enabled: false, updatedAt: Date.now() };
        if (await saveAccount(auth.account, s, auth.etag)) return json(req, 200, { ok: true });
    }
    throw fail(503, 'Could not save analytics preference. Try again');
});
