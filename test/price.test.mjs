import assert from 'node:assert/strict'
import { messageCost } from '../lib/index.js'

// 2026-10-18 is a Sunday: valley price for Flash = 1 CNY/M in, 4 CNY/M out.
const VALLEY = Date.UTC(2026, 9, 18, 4, 0, 0) // 12:00 Beijing
assert.equal(messageCost('deepseek-flash', { inputTokens: 1_000_000 }, VALLEY), 1)
assert.equal(messageCost('deepseek-flash', { cacheReadTokens: 1_000_000 }, VALLEY), 0.02)
assert.equal(messageCost('deepseek-flash', { outputTokens: 1_000_000 }, VALLEY), 4)

// 2026-10-21 is a Wednesday 10:00 Beijing: peak price doubles.
const PEAK = Date.UTC(2026, 9, 21, 2, 0, 0)
assert.equal(messageCost('deepseek-flash', { inputTokens: 1_000_000 }, PEAK), 2)

// Pro is 3x Flash on the miss rate.
assert.equal(messageCost('deepseek-v4-pro', { inputTokens: 1_000_000 }, VALLEY), 4.5)

// Unknown models fall back to the Flash table.
assert.equal(messageCost('some-custom-model', { inputTokens: 1_000_000 }, VALLEY), 1)

console.log('price tests passed')
