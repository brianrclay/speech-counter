import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized, revenueEvent, payloadFor, deliver } from '../netlify/functions/lib/revenue-analytics.mjs';

const now = Date.now();
const event = { id: 'event-1', type: 'INITIAL_PURCHASE', environment: 'PRODUCTION', store: 'RC_BILLING',
    entitlement_ids: ['roster'], transaction_id: 'txn-1', product_id: 'monthly', currency: 'USD',
    price_in_purchased_currency: 2.99, purchased_at_ms: now, event_timestamp_ms: now };
const analytics = { enabled: true, clientId: '123.456', sessionId: String(Math.floor(now / 1000)), updatedAt: now };

test('only authenticated web payments with complete revenue data qualify', () => {
    assert.equal(authorized('Bearer abc', 'abc'), true);
    assert.equal(authorized('Bearer abc', ''), false);
    assert.equal(authorized('abc', 'abc'), false);
    for (const changes of [{ environment: 'SANDBOX' }, { store: 'APP_STORE' }, { store: 'PROMOTIONAL' },
        { period_type: 'TRIAL' }, { price_in_purchased_currency: 0 }, { price_in_purchased_currency: null },
        { price_in_purchased_currency: -2.99 }, { transaction_id: null }, { currency: null },
        { type: 'INVOICE_ISSUANCE' }, { type: 'BILLING_ISSUE' }, { type: 'TRANSFER' },
        { purchased_at_ms: now - 73 * 3600000 }, { entitlement_ids: ['other'] }]) {
        assert.equal(revenueEvent({ ...event, ...changes }, now), null, JSON.stringify(changes));
    }
    const revenue = revenueEvent(event, now);
    assert.equal(revenue.params.value, 2.99);
    assert.equal(revenue.params.transaction_id, 'RC_BILLING:txn-1');
});

test('renewals have separate transaction IDs; cancellation is not a refund', () => {
    assert.equal(revenueEvent({ ...event, type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' }, now), null);
    const refund = revenueEvent({ ...event, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price_in_purchased_currency: -2.99 }, now);
    assert.equal(refund.name, 'refund');
    assert.equal(refund.params.value, 2.99);
    assert.equal(refund.params.transaction_id, revenueEvent(event, now).params.transaction_id);
    const renewal = revenueEvent({ ...event, type: 'RENEWAL', transaction_id: 'txn-2' }, now);
    assert.notEqual(renewal.key, revenueEvent(event, now).key);
    assert.equal(renewal.params.purchase_type, 'renewal');
});

test('honors missing consent and does not send PII or stale session attribution', () => {
    const revenue = revenueEvent(event, now);
    assert.equal(payloadFor(revenue, null, now), null);
    assert.equal(payloadFor(revenue, { ...analytics, enabled: false }, now), null);
    const payload = payloadFor(revenue, { ...analytics, email: 'private@example.com', userId: 'private' }, now);
    assert.equal(payload.events[0].params.session_id, Number(analytics.sessionId));
    assert.ok(!JSON.stringify(payload).includes('private'));
    const renewal = revenueEvent({ ...event, type: 'RENEWAL' }, now);
    assert.equal(payloadFor(renewal, analytics, now).events[0].params.session_id, undefined);
    assert.equal(payloadFor(revenue, { ...analytics, updatedAt: now - 2 * 86400000 }, now).events[0].params.session_id, undefined);
});

function receiptsStore() {
    const data = new Map(); let version = 0;
    return {
        async getWithMetadata(key) { return data.get(key) || null; },
        async setJSON(key, value, options) {
            const prev = data.get(key);
            if ((options?.onlyIfNew && prev) || (options?.onlyIfMatch && options.onlyIfMatch !== prev?.etag)) return { modified: false };
            const etag = String(++version);
            data.set(key, { data: value, etag });
            return { modified: true, etag };
        },
    };
}

test('parallel webhook deliveries send once; acknowledged retries are ignored', async () => {
    const receipts = receiptsStore(); const revenue = revenueEvent(event, now); let sent = 0;
    const send = async () => { sent += 1; };
    await Promise.allSettled([deliver(revenue, {}, receipts, send, now), deliver(revenue, {}, receipts, send, now)]);
    assert.equal(sent, 1);
    assert.equal(await deliver(revenue, {}, receipts, send, now), 'duplicate');
    assert.equal(sent, 1);
});

test('a failed delivery remains retryable after its lease expires', async () => {
    const receipts = receiptsStore(); const revenue = revenueEvent(event, now); let sent = 0;
    await assert.rejects(deliver(revenue, {}, receipts, async () => { throw new Error('offline'); }, now));
    await assert.rejects(deliver(revenue, {}, receipts, async () => { sent++; }, now + 1000));
    assert.equal(await deliver(revenue, {}, receipts, async () => { sent++; }, now + 61000), 'sent');
    assert.equal(sent, 1);
});
