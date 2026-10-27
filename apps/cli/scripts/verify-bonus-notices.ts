import assert from 'node:assert/strict'
import type { AccountBonusBatch } from '@deepseek-ai/dsh-deepseek-account'
import { WhaleCouponStore } from '../src/dsh-adapter/oauth/bonus.js'

const batch = (orderId: string, overrides: Record<string, unknown> = {}): AccountBonusBatch => ({
  accountId: 'account-1' as AccountBonusBatch['accountId'],
  bonuses: [{
    orderId: orderId as AccountBonusBatch['bonuses'][number]['orderId'],
    campaign: 'dsh_login_bonus',
    amount: '6.00',
    currency: 'CNY',
    expiresAt: '2099-10-06T12:15:00Z',
    message: 'Server copy',
    ...overrides,
  }],
})

const store = new WhaleCouponStore()
let changes = 0
const unsubscribe = store.subscribe(() => { changes += 1 })
const acknowledgements: string[] = []
const account = {
  getUnnotifiedBonuses: async () => batch('grant-1'),
  ackBonusNotified: async (_accountId: unknown, orderId: string) => {
    acknowledgements.push(orderId)
    return true
  },
}
await store.refresh(account as never)
assert.equal(store.getSnapshot()?.amount, '6.00')
assert.equal(changes, 1)
store.shown('grant-1' as never)
store.shown('grant-1' as never)
await Promise.resolve()
assert.deepEqual(acknowledgements, ['grant-1'], 'display must acknowledge only once')
await store.refresh(account as never)
assert.equal(store.getSnapshot(), null, 'acknowledged grant must not reopen')
unsubscribe()

const queued = new WhaleCouponStore()
const first = batch('first')
const second = batch('second')
await queued.refresh({
  getUnnotifiedBonuses: async () => ({
    accountId: first.accountId,
    bonuses: [...first.bonuses, ...second.bonuses],
  }),
  ackBonusNotified: async () => true,
} as never)
assert.equal(queued.getSnapshot()?.orderId, first.bonuses[0]?.orderId)
queued.dismiss(first.bonuses[0]!.orderId)
await new Promise(resolve => setImmediate(resolve))
assert.equal(queued.getSnapshot()?.orderId, second.bonuses[0]?.orderId,
  'dismissing one grant must advance to the next unnotified grant')

for (const invalid of [
  { campaign: 'other_campaign' },
  { amount: { untrusted: true } },
  { currency: 'unknown' },
  { expiresAt: '2000-01-01T00:00:00Z' },
]) {
  const candidate = new WhaleCouponStore()
  await candidate.refresh({
    getUnnotifiedBonuses: async () => batch('invalid', invalid),
    ackBonusNotified: async () => true,
  } as never)
  assert.equal(candidate.getSnapshot(), null, 'invalid or expired grant must be ignored')
}

let resolvePending!: (value: AccountBonusBatch) => void
const pending = new Promise<AccountBonusBatch>(resolve => { resolvePending = resolve })
const stale = new WhaleCouponStore()
const request = stale.refresh({
  getUnnotifiedBonuses: async () => pending,
  ackBonusNotified: async () => true,
} as never)
stale.clear()
resolvePending(batch('stale'))
await request
assert.equal(stale.getSnapshot(), null, 'logout must invalidate an in-flight lookup')

await stale.refresh({
  getUnnotifiedBonuses: async () => { throw new Error('offline') },
  ackBonusNotified: async () => true,
} as never)
assert.equal(stale.getSnapshot(), null, 'lookup failure must not reject the login')

console.log('verify:bonus-notices OK (display, acknowledgement, queue, validation, logout race, offline)')
