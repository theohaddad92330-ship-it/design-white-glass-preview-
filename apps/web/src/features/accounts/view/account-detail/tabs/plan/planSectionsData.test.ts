import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { readStrategicVerdict } from '../useAccountOverviewData'
import { buildPlanSections, PLAN_SECTION_KEYS } from './planSectionsData'
import { buildPlanViewData, type PlanRecord } from './planViewData'

/**
 * #2123.12-.19 — le plan a des SECTIONS NOMMÉES, dans un ordre fixe.
 *
 * Le plan était une pile de cartes dont l'ordre venait du fichier : le
 * commercial ne savait pas ce qu'il devait lire d'abord, ni ce qui manquait.
 */
const raw = (over: Record<string, unknown> = {}): PlanRecord => ({
  action_plan: { strategy: 'Entrer par la DSI sur la refonte du SI RH.' },
  angles: [
    {
      title: 'Refonte SI RH',
      entry_point: 'Le DSI, via son besoin de pilotage',
      offer: 'Deux profils data sur le socle RH',
      estimated_deal_size: '180 k€',
      recommended: true,
    },
  ],
  plan: {
    nextActions: [
      { id: 'a1', chantier: 'contacts', label: 'Rappeler le DSI', why: 'Deux postes ouverts', horizon: '7j' },
      { id: 'a2', chantier: 'messages', label: 'Écrire au DRH', why: 'Sponsor budget', horizon: '7j' },
      { id: 'a3', chantier: 'signaux', label: 'Suivre le marché public', why: 'Appel d’offres', horizon: '30j' },
      { id: 'a4', chantier: 'compte', label: 'Cartographier le SI', why: 'Périmètre inconnu', horizon: '60j' },
      { id: 'a5', chantier: 'expansion', label: 'Ouvrir la filiale', why: 'Même DSI', horizon: '90j' },
    ],
  },
  ...over,
})

const sections = (over: Record<string, unknown> = {}) => buildPlanSections(buildPlanViewData(raw(over)))
const byKey = (key: string, over: Record<string, unknown> = {}) => sections(over).find(s => s.key === key)

describe('#2123.12-.19 — les sections du plan', () => {
  it('rend les six sections livrées, TOUJOURS dans le même ordre', () => {
    expect(sections().map(section => section.key)).toEqual([...PLAN_SECTION_KEYS])
  })

  it('#2123.11 — ouvre sur le « Verdict stratégique », avant l’objectif', () => {
    expect(PLAN_SECTION_KEYS[0]).toBe('verdict')
  })

  it('#2123.11 — le verdict est LU tel que la Synthèse le lit, jamais recalculé ici', () => {
    const [first] = buildPlanSections(buildPlanViewData(raw()), {
      verdict: 'PRUDENT',
      name: 'RÉSERVE',
      line: 'Compte à ouvrir par la DSI, sponsor à confirmer.',
    })
    // #4088 (recette 15/10) — le NOM du verdict (« RÉSERVE »), le même que la Synthèse, jamais la famille « PRUDENT ».
    expect(first).toEqual({
      key: 'verdict',
      lines: [{ label: 'RÉSERVE', value: 'Compte à ouvrir par la DSI, sponsor à confirmer.' }],
      measured: true,
    })
  })

  it('#3235 — le Plan porte le verdict NOMMÉ de la Synthèse (RÉSERVE), jamais la famille brute (PRUDENT)', () => {
    const [first] = buildPlanSections(buildPlanViewData(raw()), {
      verdict: 'PRUDENT',
      name: 'RÉSERVE',
      line: 'Compte à ouvrir par la DSI.',
    })
    expect(first?.lines).toEqual([{ label: 'RÉSERVE', value: 'Compte à ouvrir par la DSI.' }])
    const [alone] = buildPlanSections(buildPlanViewData(raw()), { verdict: 'PRUDENT', name: 'RÉSERVE', line: null })
    expect(alone?.lines).toEqual([{ value: 'RÉSERVE' }])
  })

  it('#2123.11 — un verdict sans phrase reste affiché seul, sans phrase inventée', () => {
    const [first] = buildPlanSections(buildPlanViewData(raw()), { verdict: 'GO', name: 'AGIR MAINTENANT', line: null })
    expect(first.lines).toEqual([{ value: 'AGIR MAINTENANT' }])
  })

  it('#2123.11 — sans verdict lu, la section se NOMME non produite — jamais un verdict par défaut', () => {
    expect(byKey('verdict')).toEqual({ key: 'verdict', lines: [], measured: false })
  })

  it('#2123.11 — readStrategicVerdict reprend la règle de la Synthèse : le verdict écrit gagne sur le score', () => {
    const account = (rawAnalysis: Record<string, unknown>, score: number | null) =>
      ({ priority_score: score, raw_analysis: rawAnalysis }) as unknown as Account
    expect(
      readStrategicVerdict(
        account({ evaluation: { verdict: 'EXPLORER', bellum_read: { verdict_line: 'À explorer.' } } }, 9),
      ),
    ).toEqual({ verdict: 'EXPLORER', name: 'QUALIFIER', line: 'À explorer.' })
    expect(readStrategicVerdict(account({}, null))).toEqual({ verdict: null, name: null, line: null })
    // #4088 (recette 15/10) — « RÉSERVE » en Synthèse ET en Plan d'action : un verdict PRUDENT n'est jamais nommé « PRUDENT » ici.
    expect(readStrategicVerdict(account({ evaluation: { verdict: 'PRUDENT' } }, 6)).name).toBe('RÉSERVE')
  })

  it('ouvre sur l’objectif du compte', () => {
    expect(byKey('objectif')?.lines).toEqual([{ value: 'Entrer par la DSI sur la refonte du SI RH.' }])
  })

  it('nomme le périmètre ciblé et la voie d’entrée de l’angle recommandé', () => {
    expect(byKey('perimetre')?.lines.map(line => line.value)).toEqual(['Deux profils data sur le socle RH', '180 k€'])
    expect(byKey('voieDentree')?.lines.map(line => line.value)).toEqual(['Le DSI, via son besoin de pilotage'])
  })

  it('n’affiche JAMAIS plus de trois prochaines actions, jamais quinze (#2123.34)', () => {
    const many = {
      plan: { nextActions: Array.from({ length: 15 }, (_, i) => ({ id: `a${i}`, label: `Action ${i}` })) },
    }
    expect(byKey('prochainesActions', many)?.lines).toHaveLength(3)
  })

  it('fusionne 60 et 90 jours en UN horizon — deux seaux ne sont pas un horizon (#2123.18)', () => {
    expect(byKey('horizon6090', {})?.lines.map(line => line.value)).toEqual([
      'Cartographier le SI',
      'Ouvrir la filiale',
    ])
  })

  it('dit ce qu’il ne faut PAS faire, avec sa raison (#2123.19)', () => {
    const discarded = {
      axes_ecartes: [
        { angle: 'Infogérance', raison: 'Contrat signé jusqu’en 2028', comment_reactiver: 'Au renouvellement' },
      ],
    }
    expect(byKey('aEviter', discarded)?.lines).toEqual([{ label: 'Infogérance', value: 'Contrat signé jusqu’en 2028' }])
  })

  it('NOMME une section vide au lieu de la remplir — une absence n’est ni « 0 » ni une invention', () => {
    const empty = buildPlanSections(buildPlanViewData({}))
    expect(empty.map(section => section.key)).toEqual([...PLAN_SECTION_KEYS])
    for (const section of empty) {
      expect(section.lines).toEqual([])
      expect(section.measured).toBe(false)
    }
  })

  it('une section remplie est MESURÉE', () => {
    expect(byKey('objectif')?.measured).toBe(true)
  })
})
