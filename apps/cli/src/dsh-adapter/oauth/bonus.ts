import type {
  AccountBonusBatch,
  AccountBonusNotification,
  AccountBonusOrderId,
  AccountClientMetadata,
  AccountUserId,
} from '@deepseek-ai/dsh-deepseek-account'
import { deepSeekClientMetadata } from './deepseek.js'

export interface WhaleCouponNotice {
  readonly accountId: AccountUserId
  readonly orderId: AccountBonusOrderId
  readonly amount: string
  readonly currency: 'CNY' | 'USD'
  readonly expiresAt: string
}

interface BonusAccount {
  getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null>
  ackBonusNotified(
    accountId: AccountUserId,
    orderId: AccountBonusOrderId,
    client: AccountClientMetadata,
  ): Promise<boolean>
}

/** Owns the one pending login-bonus prompt shown by the local TUI. */
export class WhaleCouponStore {
  private readonly listeners = new Set<() => void>()
  private readonly seen = new Set<string>()
  private notice: WhaleCouponNotice | null = null
  private account: BonusAccount | undefined
  private generation = 0

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly getSnapshot = (): WhaleCouponNotice | null => this.notice

  async refresh(account: BonusAccount): Promise<void> {
    const generation = ++this.generation
    this.account = account
    let batch: AccountBonusBatch | null
    try {
      batch = await account.getUnnotifiedBonuses(deepSeekClientMetadata())
    } catch {
      // A notification lookup is best effort and must not reject the login.
      return
    }
    if (generation !== this.generation || this.account !== account) return

    const grant = batch?.bonuses.find((bonus): bonus is AccountBonusNotification & {
      readonly amount: string
      readonly currency: 'CNY' | 'USD'
    } => bonus.campaign === 'dsh_login_bonus'
      && typeof bonus.amount === 'string'
      && /^\d+(?:\.\d+)?$/u.test(bonus.amount)
      && (bonus.currency === 'CNY' || bonus.currency === 'USD')
      && (bonus.expiresAt === '' || Date.parse(bonus.expiresAt) > Date.now())
      && !this.seen.has(`${batch.accountId}:${bonus.orderId}`))
    const next: WhaleCouponNotice | null = grant === undefined || batch === null ? null : {
      accountId: batch.accountId,
      orderId: grant.orderId,
      amount: grant.amount,
      currency: grant.currency,
      expiresAt: grant.expiresAt,
    }
    if (sameNotice(this.notice, next)) return
    this.notice = next
    this.emit()
  }

  shown(orderId: AccountBonusOrderId): void {
    const notice = this.notice
    const account = this.account
    if (notice === null || notice.orderId !== orderId || account === undefined) return
    const key = `${notice.accountId}:${orderId}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const generation = this.generation
    void account.ackBonusNotified(notice.accountId, orderId, deepSeekClientMetadata())
      .then(accepted => {
        if (!accepted && this.generation === generation) this.seen.delete(key)
      })
      .catch(() => {
        if (this.generation === generation) this.seen.delete(key)
      })
  }

  dismiss(orderId: AccountBonusOrderId): void {
    if (this.notice?.orderId !== orderId) return
    this.shown(orderId)
    const account = this.account
    this.seen.add(`${this.notice.accountId}:${orderId}`)
    this.notice = null
    this.emit()
    if (account !== undefined) void this.refresh(account)
  }

  clear(): void {
    this.generation += 1
    this.account = undefined
    this.seen.clear()
    if (this.notice === null) return
    this.notice = null
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function sameNotice(left: WhaleCouponNotice | null, right: WhaleCouponNotice | null): boolean {
  return left === right || (left !== null && right !== null
    && left.accountId === right.accountId && left.orderId === right.orderId
    && left.amount === right.amount && left.currency === right.currency
    && left.expiresAt === right.expiresAt)
}
