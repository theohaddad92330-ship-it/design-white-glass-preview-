import { describe, expect, it } from 'vitest'
import type { LegalSignal, RegistryAnnouncement } from '@bellum/contracts'
import { groupClosureNotices, mergeLegalNotices } from './legalNotices'

// #3916.1 — recette prod R4b (73cd6104b3) : une annonce légale « Modifications
// diverses » (09/08) s'affichait sans lien vers l'annonce BODACC.
describe('mergeLegalNotices — #3916.1, le lien ne se perd pas au doublon', () => {
  it('reprend le lien du registre quand la même annonce, figée par l’analyse, n’en portait aucun', () => {
    const fromAnalysis: LegalSignal[] = [
      { type: 'Modifications diverses', precision: null, label: null, date: '2026-08-09', tribunal: null, url: null },
    ]
    const fromRegistry: RegistryAnnouncement[] = [
      {
        source: 'bodacc',
        kind: 'modification',
        type: 'Modifications diverses',
        date: '2026-08-09',
        url: 'https://www.bodacc.fr/annonce/exemple',
        tribunal: null,
      },
    ]

    const rows = mergeLegalNotices(fromAnalysis, fromRegistry)

    expect(rows).toHaveLength(1)
    expect(rows[0].url).toBe('https://www.bodacc.fr/annonce/exemple')
  })
})

// #3916 — recette R25 prod (EDF) : « pas de section annonces légales, seulement une phrase
// + lien dans Ce que Bellum ajoute ». L'annonce vivait dans `recent_signals` (source_kind
// bodacc, lien vérifié), que ni `legal_signals` ni le registre ne portaient.
describe('mergeLegalNotices — #3916 R25, l’annonce BODACC portée par recent_signals', () => {
  const bodaccSignal = {
    signal: 'Changement de dirigeant (annonce légale)',
    date: '2026-10-12',
    source: 'BODACC',
    source_kind: 'bodacc',
    url: 'https://www.bodacc.fr/annonce/edf-1',
  }

  it('devient une ligne datée avec son lien', () => {
    const rows = mergeLegalNotices(undefined, undefined, [bodaccSignal])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      type: 'Changement de dirigeant (annonce légale)',
      date: '2026-10-12',
      url: 'https://www.bodacc.fr/annonce/edf-1',
      source: 'bodacc',
    })
  })

  it('ne double pas une annonce déjà lue par le registre (même lien)', () => {
    const registry: RegistryAnnouncement[] = [
      {
        source: 'bodacc',
        kind: 'executive_change',
        type: 'Changement de dirigeant',
        date: '2026-10-12',
        url: 'https://www.bodacc.fr/annonce/edf-1',
        tribunal: null,
      },
    ]
    expect(mergeLegalNotices(undefined, registry, [bodaccSignal])).toHaveLength(1)
  })

  it('sait dire NON : un signal de presse, ou un signal BODACC sans lien vérifiable, n’est pas une annonce légale', () => {
    const press = {
      signal: 'EDF lève des fonds',
      date: '2026-10-01',
      source_kind: 'press',
      url: 'https://www.lemonde.fr/x',
    }
    const noLink = { signal: 'Dépôt des comptes', date: '2026-10-01', source_kind: 'bodacc' }
    expect(mergeLegalNotices(undefined, undefined, [press, noLink])).toHaveLength(0)
  })
})

// #3915.decp — un marché public attribué lu en continu va à la carte des marchés, jamais aux annonces légales.
describe('mergeLegalNotices — #3915.decp', () => {
  it('sait dire NON : un marché attribué n’est pas une annonce légale', () => {
    const award: RegistryAnnouncement = {
      source: 'decp',
      kind: 'award_won',
      type: 'Expertise DATA-IA',
      date: '2026-09-01',
      url: null,
      tribunal: null,
      counterpart: 'Ministère',
    }
    expect(mergeLegalNotices(undefined, [award])).toEqual([])
  })
})

// #3921.11 (R41) — 80 lignes « établissement fermé » identiques : une ligne dépliable au-delà du seuil.
describe('groupClosureNotices — #3921.11', () => {
  const closure = (day: string) => ({
    type: 'établissement fermé',
    date: day,
    url: null,
    tribunal: null,
    severity: 'info' as const,
    source: 'sirene' as const,
  })
  const other = {
    type: 'Dépôt des comptes',
    date: '2026-06-01',
    url: null,
    tribunal: null,
    severity: 'info' as const,
    source: 'bodacc' as const,
  }

  it('SAIT DIRE NON puis OUI : sous le seuil rien ne bouge ; au-delà, UNE ligne qui garde chaque fermeture', () => {
    const few = [closure('2020-01-01'), closure('2021-01-01'), other]
    expect(groupClosureNotices(few)).toEqual(few)
    const many = [...Array.from({ length: 80 }, (_, i) => closure(`20${10 + (i % 10)}-0${1 + (i % 9)}-01`)), other]
    const grouped = groupClosureNotices(many)
    expect(grouped).toHaveLength(2)
    expect(grouped[0]!.members).toHaveLength(80)
    expect(grouped.some(row => row === other)).toBe(true)
    expect(grouped[0]!.url).toBeNull()
  })
})
