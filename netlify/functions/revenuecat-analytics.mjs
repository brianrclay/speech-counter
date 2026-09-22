import { getStore } from '@netlify/blobs';
import { stores } from './lib/common.mjs';
import { authorized, revenueEvent, payloadFor, deliver } from './lib/revenue-analytics.mjs';

export const config = { path: '/api/revenuecat-analytics' };

export default async (req, context) => {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    if (context.deploy.context !== 'production') return new Response('Disabled outside production', { status: 403 });
    if (!authorized(req.headers.get('authorization'), Netlify.env.get('RC_ANALYTICS_WEBHOOK_SECRET'))) {
        return new Response('Unauthorized', { status: 401 });
    }
    let event;
    try { ({ event } = await req.json()); } catch (_) { return new Response('Invalid JSON', { status: 400 }); }
    if (event?.type === 'TEST') return Response.json({ ok: true, test: true });
    const revenue = revenueEvent(event);
    if (!revenue) return Response.json({ ignored: true });
    try {
        const { accounts } = stores(context);
        const ids = [...new Set([event.app_user_id, event.original_app_user_id, ...(event.aliases || [])])]
            .filter((id) => /^u_[a-f0-9]{32}$/.test(id)).slice(0, 30);
        const matches = await Promise.all(ids.map((id) => accounts.get(id, { type: 'json' })));
        const eligible = matches.filter((account) => account && !account.deletedAt && account.analytics);
        // An opt-out on any linked account takes precedence over an older opt-in.
        if (eligible.some((account) => !account.analytics.enabled)) return Response.json({ ignored: true });
        const account = eligible.sort((a, b) => b.analytics.updatedAt - a.analytics.updatedAt)[0];
        const payload = payloadFor(revenue, account?.analytics);
        if (!payload) return Response.json({ ignored: true });
        const measurementId = Netlify.env.get('GA4_MEASUREMENT_ID');
        const apiSecret = Netlify.env.get('GA4_API_SECRET');
        if (!/^G-[A-Z0-9]+$/.test(measurementId || '') || !apiSecret) throw new Error('Analytics not configured');
        const receipts = getStore({ name: 'analytics-receipts', consistency: 'strong' });
        const result = await deliver(revenue, payload, receipts, async (body) => {
            const url = new URL('https://www.google-analytics.com/mp/collect');
            url.searchParams.set('measurement_id', measurementId);
            url.searchParams.set('api_secret', apiSecret);
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
            if (!response.ok) throw new Error('Analytics delivery failed');
        });
        return Response.json({ ok: true, result });
    } catch (_) {
        // Never log webhook bodies, account information, or credential URLs.
        return new Response('Analytics delivery unavailable; retry', { status: 503 });
    }
};
