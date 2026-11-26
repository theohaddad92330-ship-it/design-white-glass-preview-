import { describe, expect, it } from 'vitest'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { isAttachableProject } from './attachable-projects'

const row = (over: Record<string, unknown>) =>
  ({ id: 'p', kind: 'pain', stage: 'detected', source: null, ...over }) as unknown as ProjectReadinessRow

describe('#4469 — isAttachableProject', () => {
  it('un signal ou une offre déduits d’un compte ne sont pas des projets', () => {
    expect(isAttachableProject(row({ kind: 'signal' }))).toBe(false)
    expect(isAttachableProject(row({ kind: 'signal', stage: 'qualified' }))).toBe(false)
  })

  it('une détection jamais travaillée, encore à l’entrée du pipe, n’est pas un projet', () => {
    expect(isAttachableProject(row({ kind: 'pain', stage: 'detected' }))).toBe(false)
    expect(isAttachableProject(row({ kind: 'implication', stage: 'potential' }))).toBe(false)
  })

  it('une détection travaillée (porteur) ou qualifiée est un projet', () => {
    expect(isAttachableProject(row({ kind: 'pain', owner_id: 'u1' }))).toBe(true)
    expect(isAttachableProject(row({ kind: 'challenge', stage: 'qualified' }))).toBe(true)
  })

  it('une affaire saisie à la main ou importée est un projet', () => {
    expect(isAttachableProject(row({ kind: 'manual' }))).toBe(true)
    expect(isAttachableProject(row({ kind: 'imported' }))).toBe(true)
  })
})
