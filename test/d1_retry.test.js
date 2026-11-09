import { describe, it, expect } from 'vitest'
import { D1 } from '../d1.js'

// A binding whose first `failures` calls reject with `message`, then answer the row.
function flakyBinding(message, failures) {
  let calls = 0
  return {
    calls: () => calls,
    prepare() {
      return {
        bind() {
          return {
            async first() {
              calls++
              if (calls <= failures) throw new Error(message)
              return { id: 'x' }
            },
          }
        },
      }
    },
  }
}

describe('D1.retry', () => {
  it('retries the storage timeout reset D1 sends today', async () => {
    const binding = flakyBinding(
      'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.',
      2,
    )
    const d1 = new D1(binding)
    const row = await d1.get('things', 'x')
    expect(row).toEqual({ id: 'x' })
    expect(binding.calls()).toBe(3)
  })

  it('still retries the older storage reset message', () => {
    const d1 = new D1({})
    expect(d1.shouldRetry(new Error('D1_ERROR: D1 DB storage caused object to be reset'), 1)).toBe(true)
  })

  it('does not retry an overloaded database or an ordinary error', () => {
    const d1 = new D1({})
    expect(
      d1.shouldRetry(
        new Error('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window'),
        1,
      ),
    ).toBe(false)
    expect(d1.shouldRetry(new Error('D1_ERROR: no such table: things'), 1)).toBe(false)
  })

  it('gives up after five attempts', async () => {
    const binding = flakyBinding('D1 DB storage operation exceeded timeout which caused object to be reset.', 99)
    const d1 = new D1(binding)
    await expect(d1.get('things', 'x')).rejects.toThrow('caused object to be reset')
    expect(binding.calls()).toBe(6)
  })
})
