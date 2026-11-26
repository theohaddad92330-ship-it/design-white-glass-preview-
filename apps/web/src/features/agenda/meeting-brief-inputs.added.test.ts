import { describe, expect, it } from 'vitest'
import { buildMeetingBrief, type MeetingBriefBlockKey } from '@bellum/contracts'
import { buildMeetingBriefInputs, type BriefContact } from './meeting-brief-inputs'

/**
 * #2319.30-.38 — les cinq rubriques ajoutées au brief d'avant rendez-vous :
 * trois faits utiles, les limites, les fiches liées, les risques, et ce qui
 * reste à vérifier. Chacune dit d'où elle vient, ou se tait.
 */

const ines: BriefContact = {
  id: 'c1',
  full_name: 'Inès Morel',
  email: 'ines.morel@nova.example',
  title: 'DSI',
  entity: null,
  decision_role: 'economic',
  updated_at: '2026-08-29T06:00:00.000Z',
}

function inputsOf(over: Partial<Parameters<typeof buildMeetingBriefInputs>[0]> = {}) {
  return buildMeetingBriefInputs({
    contact: ines,
    activities: null,
    signals: null,
    stakes: [],
    consultants: null,
    objections: [],
    language: 'fr-FR',
    ...over,
  })
}

function keys(blocks: ReturnType<typeof buildMeetingBriefInputs>): MeetingBriefBlockKey[] {
  return buildMeetingBrief(blocks).map(block => block.key)
}

describe('#2319.30 · TROIS FAITS UTILES', () => {
  const facts = [
    { label: 'Secteur : logistique', kind: 'account_analysis' as const, date: '2026-08-01T00:00:00.000Z' },
    { label: 'Effectif : 1 200', kind: 'account_analysis' as const, date: '2026-09-01T00:00:00.000Z' },
    { label: 'CA : 300 M€', kind: 'registry' as const, date: '2026-07-01T00:00:00.000Z' },
    { label: 'Siège : Lyon', kind: 'registry' as const, date: '2026-06-01T00:00:00.000Z' },
    { label: 'Fait sans date', kind: 'press' as const, date: null },
  ]

  it('en garde TROIS, les plus récents, datés et sourcés', () => {
    const block = inputsOf({ facts }).find(item => item.key === 'facts')
    expect(block?.lines).toEqual(['Effectif : 1 200', 'Secteur : logistique', 'CA : 300 M€'])
    expect(block?.ground).toEqual({
      kind: 'sourced',
      sources: ['account_analysis', 'registry'],
      observedAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('un fait sans date n’est pas un fait — seul, le bloc se retire', () => {
    expect(keys(inputsOf({ facts: facts.slice(4) }))).not.toContain('facts')
    expect(keys(inputsOf({ facts: null }))).not.toContain('facts')
  })
})

describe('#2319.31 · LIMITES', () => {
  it('nomme ce que le brief n’a pas pu lire, comme un CALCUL — pas une source', () => {
    const block = inputsOf({ limits: ['Historique illisible'] }).find(item => item.key === 'limits')
    expect(block?.lines).toEqual(['Historique illisible'])
    expect(block?.ground).toEqual({ kind: 'derived', from: ['brief_coverage'] })
  })

  it('aucune limite ⇒ aucun bloc', () => {
    expect(keys(inputsOf({ limits: [] }))).not.toContain('limits')
  })
})

describe('#2319.33 · OPPORTUNITÉS, BESOINS, MISSIONS LIÉS', () => {
  it('liste les fiches de l’espace, la plus récente d’abord, datées par leur dernière écriture', () => {
    const block = inputsOf({
      linked: [
        { kindLabel: 'Mission', label: 'Socle data', date: '2026-09-02T00:00:00.000Z' },
        { kindLabel: 'Opportunité', label: 'Migration cloud', date: '2026-09-10T00:00:00.000Z' },
      ],
    }).find(item => item.key === 'linked')
    expect(block?.lines).toEqual(['Opportunité · Migration cloud', 'Mission · Socle data'])
    expect(block?.ground).toEqual({ kind: 'sourced', sources: ['workspace'], observedAt: '2026-09-10T00:00:00.000Z' })
  })

  it('illisible (null) ou vide : le bloc se retire', () => {
    expect(keys(inputsOf({ linked: null }))).not.toContain('linked')
    expect(keys(inputsOf({ linked: [] }))).not.toContain('linked')
  })
})

describe('#2319.34 · RISQUES', () => {
  it('un fait de fiche daté, et sa lecture PROBABLE', () => {
    const block = inputsOf({
      risks: [{ label: 'J. Ferry — bloqueur identifié', date: '2026-08-20T00:00:00.000Z' }],
    }).find(item => item.key === 'risks')
    expect(block?.lines).toEqual(['J. Ferry — bloqueur identifié'])
    expect(block?.ground).toEqual({
      kind: 'mixed',
      sources: ['contact_record'],
      observedAt: '2026-08-20T00:00:00.000Z',
      probable: ['risk'],
    })
  })

  it('un risque sans date se tait', () => {
    expect(keys(inputsOf({ risks: [{ label: 'Sans date', date: null }] }))).not.toContain('risks')
  })
})

describe('#2319.38 · CE QUI RESTE À VÉRIFIER', () => {
  it('est toujours DÉDUIT — c’est sa nature', () => {
    const block = inputsOf({ toVerify: ['Rôle d’Inès Morel : décideuse budgétaire probable'] }).find(
      item => item.key === 'to_verify',
    )
    expect(block?.ground).toEqual({ kind: 'inferred' })
  })

  it('rien à vérifier ⇒ aucun bloc', () => {
    expect(keys(inputsOf({ toVerify: [] }))).not.toContain('to_verify')
  })
})
