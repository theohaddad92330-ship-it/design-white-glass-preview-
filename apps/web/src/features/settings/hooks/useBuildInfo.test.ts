import { describe, expect, it } from 'vitest'
import { commitFromBuildId } from './useBuildInfo'

describe('commitFromBuildId (Théo P0 — parité release)', () => {
  it('extracts the git SHA from a build id', () => {
    expect(commitFromBuildId('26.07.15-ts1784100000+gitab12cd34ef')).toBe('ab12cd34ef')
  })

  it('returns null when there is no git segment (e.g. dev build)', () => {
    expect(commitFromBuildId('dev')).toBeNull()
    expect(commitFromBuildId('26.07.15-ts1784100000')).toBeNull()
  })
})
