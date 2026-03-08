import { describe, expect, it } from 'vitest'
import { ActionPolicy } from './ActionPolicy'

describe('ActionPolicy', () => {
  it('allows whitelisted actions', () => {
    const policy = new ActionPolicy()

    const result = policy.evaluate('create_database')

    expect(result).toEqual({ allowed: true })
  })

  it('rejects non-whitelisted actions', () => {
    const policy = new ActionPolicy()

    const result = policy.evaluate('exec_shell')

    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not whitelisted')
  })
})
