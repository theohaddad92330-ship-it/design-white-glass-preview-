import { describe, expect, it } from 'vitest'
import type { MesureOuAbsence, ProductEventFamily } from '@/lib/product-analytics'
import {
  estInstrumente,
  etatDe,
  libelleEspaces,
  libelleEtat,
  libelleEvenement,
  libelleInstrumentation,
  resumerInstrumentation,
} from './product-instrumentation.logic'

/**
 * #1682/#1683-#1688 — LE FILET du diagnostic d'instrumentation de `/produit`.
 *
 * Trois familles de preuve, comme le reste des gardes du dépôt : la mesure LIT
 * quelque chose (un corpus non vide), elle sait dire NON (un cas qui casse
 * vraiment le zéro qu'on refuse), et elle n'attrape pas ce qu'elle ne vise pas
 * (un ZÉRO VRAI, mesuré, reste distinct d'une absence).
 */

function famille(event: ProductEventFamily['event'], instrumented: boolean): ProductEventFamily {
  return { event, instrumented }
}

const NEUF_NATURES: ProductEventFamily['event'][] = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
]

describe('resumerInstrumentation — l’état de l’instrumentation, avant tout chiffre', () => {
  it('LIT quelque chose — neuf familles produisent un résumé sur neuf', () => {
    const toutesEteintes = NEUF_NATURES.map(event => famille(event, false))
    const resume = resumerInstrumentation(toutesEteintes)
    expect(resume.total).toBe(9)
    expect(resume.instrumentees).toBe(0)
    expect(resume.nonInstrumentees).toHaveLength(9)
  })

  it('0 des 9 natures instrumentées — la phrase exacte que l’écran doit annoncer en premier', () => {
    const toutesEteintes = NEUF_NATURES.map(event => famille(event, false))
    const resume = resumerInstrumentation(toutesEteintes)
    expect(libelleInstrumentation(resume)).toBe('0 des 9 natures d’événement sont instrumentées')
  })

  it('l’état RÉEL mesuré le 09/09/2026 — deux instrumentées, sept non', () => {
    const etatReel = NEUF_NATURES.map(event => famille(event, event === 'screen_viewed' || event === 'screen_left'))
    const resume = resumerInstrumentation(etatReel)
    expect(resume.instrumentees).toBe(2)
    expect(resume.nonInstrumentees).toHaveLength(7)
    expect(resume.nonInstrumentees).not.toContain('screen_viewed')
    expect(resume.nonInstrumentees).not.toContain('screen_left')
    expect(libelleInstrumentation(resume)).toBe('2 des 9 natures d’événement sont instrumentées')
  })

  it('la liste des natures manquantes est NOMMÉE, jamais un compte seul', () => {
    const etatReel = NEUF_NATURES.map(event => famille(event, event === 'screen_viewed'))
    const resume = resumerInstrumentation(etatReel)
    const libelles = resume.nonInstrumentees.map(libelleEvenement)
    expect(libelles).toContain('Action démarrée')
    expect(libelles).toContain('Recherche effectuée')
    expect(libelles).toContain('Erreur affichée')
    expect(libelles).toHaveLength(8)
  })

  it('sait dire NON — neuf instrumentées ne rendent aucune nature manquante', () => {
    const toutesAllumees = NEUF_NATURES.map(event => famille(event, true))
    const resume = resumerInstrumentation(toutesAllumees)
    expect(resume.nonInstrumentees).toEqual([])
    expect(libelleInstrumentation(resume)).toBe('9 des 9 natures d’événement sont instrumentées')
  })
})

describe('etatDe / libelleEtat — trois états, jamais deux, jamais un 0 pour une absence', () => {
  it('« not_instrumented » devient « pas encore instrumenté », jamais « 0 » ni « aucun problème »', () => {
    const mesure: MesureOuAbsence<string[]> = { kind: 'not_instrumented' }
    const etat = etatDe(mesure)
    expect(etat).toEqual({ etat: 'non_instrumente' })
    const libelle = libelleEtat(etat)
    expect(libelle).toBe('pas encore instrumenté')
    expect(libelle).not.toBe('0')
    expect(libelle).not.toMatch(/^0$/)
    expect(libelle.toLowerCase()).not.toContain('aucun problème')
  })

  it('« below_threshold » devient « sous le seuil », avec le compte qui l’explique', () => {
    const mesure: MesureOuAbsence<string[]> = { kind: 'below_threshold', sessions: 3, minSessions: 5 }
    const etat = etatDe(mesure)
    expect(etat).toEqual({ etat: 'sous_le_seuil', sessions: 3, seuil: 5 })
    expect(libelleEtat(etat)).toBe('sous le seuil (3 sur 5 sessions requises)')
    expect(libelleEtat(etat)).not.toBe('0')
  })

  it('« measured » devient « mesure », et un ZÉRO VRAI (tableau vide) reste distinct des deux absences', () => {
    const mesure: MesureOuAbsence<string[]> = { kind: 'measured', sessions: 12, value: [] }
    const etat = etatDe(mesure)
    expect(etat).toEqual({ etat: 'mesure', sessions: 12, valeur: [] })
    expect(libelleEtat(etat)).toBe('mesuré')
    // Un tableau vide MESURÉ n'est ni « pas encore instrumenté » ni « sous le
    // seuil » : c'est un zéro qui a eu le temps d'être jugé.
    expect(etat.etat).not.toBe('non_instrumente')
    expect(etat.etat).not.toBe('sous_le_seuil')
  })

  it('« measured » avec une valeur non vide porte bien la valeur, pas un résumé', () => {
    const mesure: MesureOuAbsence<number[]> = { kind: 'measured', sessions: 8, value: [1, 2, 3] }
    const etat = etatDe(mesure)
    expect(etat.etat === 'mesure' && etat.valeur).toEqual([1, 2, 3])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un tableau vide « mesuré » n’est jamais confondu avec « non instrumenté »', () => {
    const mesureVide: MesureOuAbsence<string[]> = { kind: 'measured', sessions: 6, value: [] }
    const nonInstrumente: MesureOuAbsence<string[]> = { kind: 'not_instrumented' }
    expect(etatDe(mesureVide).etat).toBe('mesure')
    expect(etatDe(nonInstrumente).etat).toBe('non_instrumente')
    expect(libelleEtat(etatDe(mesureVide))).not.toBe(libelleEtat(etatDe(nonInstrumente)))
  })
})

describe('estInstrumente — un compte à 0 ne veut rien dire tant que l’émetteur n’a jamais écrit', () => {
  it('rend false quand la nature demandée n’a jamais été écrite', () => {
    const families = NEUF_NATURES.map(event => famille(event, event !== 'screen_viewed'))
    expect(estInstrumente(families, 'screen_viewed')).toBe(false)
  })

  it('rend true dès que la nature demandée a été écrite au moins une fois', () => {
    const families = NEUF_NATURES.map(event => famille(event, event === 'screen_viewed'))
    expect(estInstrumente(families, 'screen_viewed')).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — une AUTRE nature instrumentée ne compte pas pour celle-ci', () => {
    const families = NEUF_NATURES.map(event => famille(event, event === 'screen_left'))
    expect(estInstrumente(families, 'screen_viewed')).toBe(false)
  })
})

describe('libelleEspaces — jamais dérivable, jamais un 0, jamais un nom d’espace', () => {
  it('rend « non dérivable » pour la seule forme que le flux comportemental peut porter', () => {
    const libelle = libelleEspaces({ kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' })
    expect(libelle).toBe('non dérivable')
  })

  it('sait dire NON — le libellé ne contient jamais un chiffre ni le mot « espace » suivi d’un nom', () => {
    const libelle = libelleEspaces({ kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' })
    expect(libelle).not.toMatch(/\d/)
    expect(libelle.toLowerCase()).not.toContain('acme')
    expect(libelle.toLowerCase()).not.toContain('workspace')
  })
})
