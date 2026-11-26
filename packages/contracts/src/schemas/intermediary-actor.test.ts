import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  accountActorBadgeKind,
  isDataSourceActor,
  isIntermediaryActor,
  KNOWN_DATA_SOURCES,
} from './intermediary-actor.js'

describe('isIntermediaryActor', () => {
  it('reconnaît un cabinet de recrutement au NAF (78.10Z)', () => {
    expect(isIntermediaryActor({ name: 'Une SSII quelconque', naf: '78.10Z' })).toBe(true)
  })

  it('reconnaît un cabinet de recrutement au NAF sans point (7830Z)', () => {
    expect(isIntermediaryActor({ name: null, naf: '7830Z' })).toBe(true)
  })

  it('reconnaît un cabinet connu par son nom quand le NAF est absent', () => {
    expect(isIntermediaryActor({ name: 'Michael Page France', naf: null })).toBe(true)
  })

  it('reconnaît une plateforme de mise en relation par son nom', () => {
    expect(isIntermediaryActor({ name: 'Collective.work', naf: '70.22Z' })).toBe(true)
  })

  it("#4746.1 — FRANCE TRAVAIL (site d'annonces) n'est pas un client final", () => {
    expect(isIntermediaryActor({ name: 'FRANCE TRAVAIL', naf: null })).toBe(true)
    expect(isIntermediaryActor({ name: 'Pôle emploi', naf: '84.13Z' })).toBe(true)
    expect(isIntermediaryActor({ name: 'Travail et Territoires', naf: null })).toBe(false)
  })

  it('ne matche pas un nom qui contient seulement une sous-chaîne (frontière de mot)', () => {
    expect(isIntermediaryActor({ name: 'Thays Conseil', naf: null })).toBe(false)
  })

  it('ne matche pas "Maltese Consulting" sur "Malt"', () => {
    expect(isIntermediaryActor({ name: 'Maltese Consulting', naf: null })).toBe(false)
  })

  it('un NAF résolu non-cabinet et un nom sans preuve rendent false, jamais deviné', () => {
    expect(isIntermediaryActor({ name: 'Une ESN quelconque', naf: '62.02A' })).toBe(false)
  })

  it('aucun signal du tout rend false', () => {
    expect(isIntermediaryActor({})).toBe(false)
  })

  it("le travail temporaire (78.20Z) n'est jamais un intermédiaire", () => {
    expect(isIntermediaryActor({ name: null, naf: '78.20Z' })).toBe(false)
  })
})

describe('isDataSourceActor / accountActorBadgeKind (#2265.5/.7)', () => {
  it('reconnaît un fournisseur de données, avec frontière de mot', () => {
    expect(isDataSourceActor({ name: 'Société.com' })).toBe(true)
    expect(isDataSourceActor({ name: 'Dun & Bradstreet France' })).toBe(true)
    expect(isDataSourceActor({ name: 'Hunters Conseil' })).toBe(false)
    expect(isDataSourceActor({ name: null })).toBe(false)
  })

  it("l'ordre des preuves : source > partenaire déclaré > intermédiaire > rien", () => {
    expect(accountActorBadgeKind({ name: 'Kompass', naf: '78.10Z', isDeclaredPartner: true })).toBe('data_source')
    expect(accountActorBadgeKind({ name: 'ALTEN', naf: '62.02A', isDeclaredPartner: true })).toBe('partner')
    expect(accountActorBadgeKind({ name: 'ALTEN', naf: '62.02A', isDeclaredPartner: false })).toBeNull()
    expect(accountActorBadgeKind({ name: 'X', naf: '78.10Z' })).toBe('intermediary')
  })

  it('la liste reste identique à celle du service IA (GA-26)', () => {
    const py = readFileSync(
      fileURLToPath(new URL('../../../../apps/ia/app/services/intermediation.py', import.meta.url)),
      'utf8',
    )
    const block = /_KNOWN_DATA_SOURCES = \(([\s\S]*?)\n\)/.exec(py)?.[1] ?? ''
    const names = [...block.matchAll(/"([^"]+)"/g)].map(m => m[1])
    expect(names.length).toBeGreaterThan(0)
    expect(names).toEqual([...KNOWN_DATA_SOURCES])
  })
})
