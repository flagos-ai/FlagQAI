import type { BalanceResult } from './adapter/ports/channel-catalog.js'

export type { BalanceResult, BalanceInfo } from './adapter/ports/channel-catalog.js'

export interface BalanceQueryOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
}

export const DEEPSEEK_BALANCE_ENDPOINT = 'https://api.deepseek.com/user/balance'

type BalanceRow = { currency: string; total: number; granted: number; toppedUp: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function balanceAmount(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : undefined
}

function parseBalance(value: unknown): { isAvailable: boolean; balances: BalanceRow[] } | undefined {
  if (!isRecord(value) || typeof value.is_available !== 'boolean' || !Array.isArray(value.balance_infos)) return undefined
  const balances: BalanceRow[] = []
  for (const row of value.balance_infos) {
    if (!isRecord(row) || typeof row.currency !== 'string' || row.currency.trim() === '') return undefined
    const total = balanceAmount(row.total_balance)
    const granted = balanceAmount(row.granted_balance)
    const toppedUp = balanceAmount(row.topped_up_balance)
    if (total === undefined || granted === undefined || toppedUp === undefined) return undefined
    balances.push({ currency: row.currency, total, granted, toppedUp })
  }
  return { isAvailable: value.is_available, balances }
}

/** Query the official balance endpoint without exposing the API key in results. */
export async function fetchBalance(apiKey: string, options: BalanceQueryOptions = {}): Promise<BalanceResult> {
  if (apiKey.trim() === '') return { ok: false, reason: 'no-key' }

  const url = options.baseUrl === undefined
    ? DEEPSEEK_BALANCE_ENDPOINT
    : `${options.baseUrl.replace(/\/+$/, '')}/user/balance`
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : 8_000
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('Balance request timed out'))
    }, timeoutMs)
  })

  const request = async (): Promise<BalanceResult> => {
    let response: Response
    try {
      response = await (options.fetchImpl ?? fetch)(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      })
    } catch {
      return { ok: false, reason: 'network' }
    }

    if (!response.ok) {
      return { ok: false, reason: response.status === 401 ? 'unauthorized' : 'http', status: response.status }
    }

    try {
      const parsed = parseBalance(await response.json() as unknown)
      return parsed === undefined ? { ok: false, reason: 'invalid' } : { ok: true, ...parsed }
    } catch {
      return { ok: false, reason: 'invalid' }
    }
  }

  try {
    return await Promise.race([request(), deadline])
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
