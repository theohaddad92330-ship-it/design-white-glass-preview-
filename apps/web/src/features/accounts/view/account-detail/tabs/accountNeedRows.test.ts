import type { ProjectReadRow } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { isConfirmedNeedRow } from './accountNeedRows'

const row = (kind: string, stage: string) => ({ kind, stage }) as Pick<ProjectReadRow, 'kind' | 'stage'>

describe('isConfirmedNeedRow — la frontière signal / besoin du dossier (#3423.10)', () => {
  it('une ligne confirmée qui n’est pas un signal est un besoin', () => {
    expect(isConfirmedNeedRow(row('project', 'confirmed'))).toBe(true)
  })
  it('un signal n’est jamais un besoin, même au stade confirmé', () => {
    expect(isConfirmedNeedRow(row('signal', 'confirmed'))).toBe(false)
  })
  it('une ligne non confirmée n’est pas un besoin', () => {
    expect(isConfirmedNeedRow(row('project', 'detected'))).toBe(false)
  })
})
