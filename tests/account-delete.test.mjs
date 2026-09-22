import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount } from '../netlify/functions/account-delete.mjs';
import { authenticate, issueToken, resolveAccount, emailKey } from '../netlify/functions/lib/common.mjs';
process.env.AUTH_SECRET = 'isolated-unit-test-secret';
class MemoryStore {
    records = new Map();
    rev = 0;
    async get(key) { return structuredClone(this.records.get(key)?.data || null); }
    async getWithMetadata(key) { return structuredClone(this.records.get(key) || null); }
    async setJSON(key, data, options = {}) {
        const current = this.records.get(key);
        if ((options.onlyIfNew && current) || (options.onlyIfMatch && options.onlyIfMatch !== current?.etag)) return { modified: false };
        const etag = String(++this.rev);
        this.records.set(key, { data: structuredClone(data), etag });
        return { modified: true, etag };
    }
    async delete(key) { this.records.delete(key); }
}
async function fixture() {
    const s = { accounts: new MemoryStore(), rosters: new MemoryStore(), codes: new MemoryStore() };
    const email = 'disposable@example.com';
    const { account } = await resolveAccount(email, s);
    account.premium = { active: true, willRenew: true };
    await s.accounts.setJSON(account.userId, account);
    await s.rosters.setJSON(account.userId, { students: [{ name: 'Test student' }] });
    await s.codes.setJSON(emailKey(email), { digest: 'test' });
    const claims = { userId: account.userId, email, issuedAt: Date.now() };
    const req = new Request('https://example.com', { headers: { authorization: 'Bearer ' + issueToken(account.userId, email) } });
    return { s, claims, req };
}
test('renewing accounts can delete; personal data is erased and old tokens are revoked', async () => {
    const { s, claims, req } = await fixture();
    await authenticate(req, s);
    await deleteAccount(claims, s);
    const tombstone = await s.accounts.get(claims.userId);
    assert.deepEqual(Object.keys(tombstone).sort(), ['deletedAt', 'tokensValidAfter', 'userId']);
    assert.equal(await s.accounts.get(emailKey(claims.email)), null);
    assert.equal(await s.rosters.get(claims.userId), null);
    assert.equal(await s.codes.get(emailKey(claims.email)), null);
    await assert.rejects(authenticate(req, s), { status: 401 });
});
test('signing up after deletion creates a new account; old retry leaves it untouched', async () => {
    const { s, claims } = await fixture();
    await deleteAccount(claims, s);
    const { account } = await resolveAccount(claims.email, s);
    assert.notEqual(account.userId, claims.userId);
    await s.codes.setJSON(emailKey(claims.email), { digest: 'new-code' });
    await deleteAccount(claims, s);
    assert.equal((await s.accounts.get(emailKey(claims.email))).userId, account.userId);
    assert.equal((await s.codes.get(emailKey(claims.email))).digest, 'new-code');
});
test('partial deletion fails closed, then retries finish cleanup', async () => {
    const { s, claims, req } = await fixture();
    const remove = s.rosters.delete.bind(s.rosters);
    s.rosters.delete = async () => { throw new Error('storage unavailable'); };
    await assert.rejects(deleteAccount(claims, s), /storage unavailable/);
    await assert.rejects(authenticate(req, s), { status: 401 });
    await assert.rejects(resolveAccount(claims.email, s), { status: 503 });
    s.rosters.delete = remove;
    await deleteAccount(claims, s);
    assert.equal(await s.rosters.get(claims.userId), null);
    assert.notEqual((await resolveAccount(claims.email, s)).account.userId, claims.userId);
});
test('revoked live sessions cannot delete an account', async () => {
    const { s, claims } = await fixture();
    const account = await s.accounts.get(claims.userId);
    await s.accounts.setJSON(claims.userId, { ...account, tokensValidAfter: claims.issuedAt + 1 });
    await assert.rejects(deleteAccount(claims, s), { status: 401 });
    assert.equal((await s.accounts.get(claims.userId)).email, claims.email);
});
