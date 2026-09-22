import { createHash, timingSafeEqual } from 'node:crypto';

export function authorized(header, secret) {
    if (!secret || !header) return false;
    const a = Buffer.from(header);
    const b = Buffer.from('Bearer ' + secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

export function revenueEvent(event, now = Date.now()) {
    if (!event || event.environment !== 'PRODUCTION' || !['RC_BILLING', 'STRIPE'].includes(event.store)) return null;
    if (!event.entitlement_ids?.includes('roster') || event.is_family_share || event.period_type === 'TRIAL') return null;
    const refund = event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT';
    if (!refund && !['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL'].includes(event.type)) return null;
    const amount = event.price_in_purchased_currency;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0 || (!refund && amount < 0)) return null;
    if (!/^[A-Z]{3}$/.test(event.currency || '') || !event.transaction_id || !event.product_id || !event.id) return null;
    const timestamp = refund ? event.event_timestamp_ms : event.purchased_at_ms;
    // GA cannot reliably accept events older than 72h. Never relabel old
    // payments as today's revenue; reconcile those in RevenueCat/Stripe.
    if (!Number.isSafeInteger(timestamp) || timestamp < now - 72 * 3600000 || timestamp > now + 3600000) return null;
    const transaction = event.store + ':' + event.transaction_id;
    return {
        name: refund ? 'refund' : 'purchase', timestamp: Math.min(timestamp, now),
        key: createHash('sha256').update(refund ? 'refund:' + event.id : transaction).digest('hex'),
        params: { transaction_id: transaction, value: Math.abs(amount), currency: event.currency,
            payment_provider: 'revenuecat', purchase_type: refund ? 'refund' : event.type === 'RENEWAL' ? 'renewal' : 'initial',
            items: [{ item_id: event.product_id, item_name: 'Speech Count Pro', price: Math.abs(amount), quantity: 1 }] },
    };
}

export function payloadFor(revenue, analytics, now = Date.now()) {
    if (analytics?.consentVersion !== 'purchase-v1' || !analytics?.enabled || !/^\d+\.\d+$/.test(analytics.clientId || '')) return null;
    const params = { ...revenue.params, platform: 'web' };
    if (analytics.experimentId === 'web_default_plan_v1' && ['monthly', 'lifetime'].includes(analytics.variantId)) {
        params.experiment_id = analytics.experimentId;
        params.variant_id = analytics.variantId;
    }
    // Renewals/refunds weeks later must not be attached to an old checkout session.
    if (revenue.params.purchase_type === 'initial' && /^\d+$/.test(analytics.sessionId || '') &&
        Math.abs(revenue.timestamp - analytics.updatedAt) < 24 * 3600000 &&
        now - Number(analytics.sessionId) * 1000 < 24 * 3600000) {
        params.session_id = Number(analytics.sessionId);
        params.engagement_time_msec = 1;
    }
    return { client_id: analytics.clientId, timestamp_micros: revenue.timestamp * 1000,
        consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
        events: [{ name: revenue.name, params }] };
}

// Conditional writes serialize parallel deliveries. A crashed delivery can
// retry after the lease expires. Stable transaction_id also deduplicates GA
// purchases if the process dies after GA accepts but before we mark sent.
export async function deliver(revenue, payload, receipts, send, now = Date.now()) {
    const found = await receipts.getWithMetadata(revenue.key, { type: 'json' });
    if (found?.data.status === 'sent') return 'duplicate';
    if (found?.data.until > now) throw new Error('Delivery in progress');
    const claim = await receipts.setJSON(revenue.key, { status: 'sending', until: now + 60000 },
        found ? { onlyIfMatch: found.etag } : { onlyIfNew: true });
    if (!claim.modified) throw new Error('Delivery in progress');
    await send(payload);
    await receipts.setJSON(revenue.key, { status: 'sent', sentAt: now }, { onlyIfMatch: claim.etag });
    return 'sent';
}
