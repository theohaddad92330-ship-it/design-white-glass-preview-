import { describe, expect, it } from 'vitest'
import type { ContactLifecycleTally } from '@bellum/contracts'
import { buildContactFunnel, countRelevantContacts, tallyContactLifecycle } from './contactFunnel'

/** Le funnel n'est `null` que sans agrégat serveur — cas testé à part. */
function funnelOf(t: ContactLifecycleTally) {
  const funnel = buildContactFunnel(t)
  if (!funnel) throw new Error('un agrégat présent doit produire un funnel')
  return funnel
}

/** Les 7 buckets, tous à 0 sauf ceux passés — les états sont EXCLUSIFS côté serveur. */
function tally(partial: Partial<ContactLifecycleTally>): ContactLifecycleTally {
  return {
    detecte: 0,
    identite_verifiee: 0,
    qualifie: 0,
    enrichi: 0,
    actionnable: 0,
    historique: 0,
    rejete: 0,
    ...partial,
  }
}

describe('buildContactFunnel', () => {
  it('cumule les états : un contact actionnable a franchi toutes les étapes avant', () => {
    const funnel = funnelOf(tally({ detecte: 68, identite_verifiee: 64, qualifie: 52, enrichi: 21, actionnable: 9 }))

    expect(funnel.stages.map(s => [s.key, s.count])).toEqual([
      ['detecte', 214],
      ['identite_verifiee', 146],
      ['qualifie', 82],
      ['enrichi', 30],
      ['actionnable', 9],
    ])
  })

  it('la première étape ignore les états terminaux — ils ne sont pas « détectés puis perdus »', () => {
    const funnel = funnelOf(tally({ detecte: 10, historique: 3, rejete: 2 }))

    expect(funnel.stages[0].count).toBe(10)
    expect(funnel.discarded).toBe(5)
  })

  // #2309.1 (clôture #2934) — les 2 étapes terminales, nommées à part : avec
  // les 5 `stages`, ce sont les 7 états du cycle de vie, tous nommés.
  it('#2309.1 — nomme les 2 étapes terminales séparément, avec leur couverture', () => {
    const funnel = funnelOf(tally({ detecte: 10, historique: 3, rejete: 2 }))

    expect(funnel.exitBranches.map(b => [b.key, b.count])).toEqual([
      ['historique', 3],
      ['rejete', 2],
    ])
    // Couverture sur la POPULATION COMPLÈTE (10 + 3 + 2 = 15), pas le funnel seul.
    expect(funnel.exitBranches[0].share).toBeCloseTo(3 / 15)
    expect(funnel.exitBranches[1].share).toBeCloseTo(2 / 15)
  })

  it('#2309.1 — les 2 étapes terminales sont gratuites, comme le reste hors enrichissement', () => {
    const funnel = funnelOf(tally({ detecte: 10, historique: 3, rejete: 2 }))
    expect(funnel.exitBranches.every(b => b.cost === 'free')).toBe(true)
  })

  it('#2309.1 — sans état terminal, les 2 branches restent à zéro (jamais une couverture inventée)', () => {
    const funnel = funnelOf(tally({ detecte: 10 }))
    expect(funnel.exitBranches.every(b => b.count === 0 && b.share === 0)).toBe(true)
  })

  it('chaque étape porte sa part du total, pour la barre de progression', () => {
    const funnel = funnelOf(tally({ detecte: 50, actionnable: 50 }))

    expect(funnel.stages[0].share).toBe(1)
    expect(funnel.stages[4].share).toBe(0.5)
  })

  it('un funnel vide reste lisible : aucune division par zéro', () => {
    const funnel = funnelOf(tally({}))

    expect(funnel.total).toBe(0)
    expect(funnel.discarded).toBe(0)
    expect(funnel.stages.every(s => s.count === 0 && s.share === 0)).toBe(true)
  })

  it('sans agrégat serveur, pas de funnel — plutôt rien qu’un chiffre faux', () => {
    expect(buildContactFunnel(undefined)).toBeNull()
  })

  it('un funnel qui ne franchit jamais la 1re étape est signalé comme bloqué', () => {
    // 40 détectés, 0 actionnable : le stock existe mais rien n’est joignable.
    const funnel = funnelOf(tally({ detecte: 40 }))

    expect(funnel.total).toBe(40)
    expect(funnel.stages.at(-1)?.count).toBe(0)
  })

  // #2309.8 — le seul coût réel de ce funnel est de révéler une coordonnée
  // (`enrichi`, `CREDIT_WEIGHTS.contact_enrichment`) : recherche, vérification
  // d'identité, qualification et préparation de message sont gratuites.
  it('#2309.8 — seule l’étape « enrichi » porte un coût, les autres sont gratuites', () => {
    const funnel = funnelOf(tally({ detecte: 68, identite_verifiee: 64, qualifie: 52, enrichi: 21, actionnable: 9 }))

    expect(funnel.stages.map(s => [s.key, s.cost])).toEqual([
      ['detecte', 'free'],
      ['identite_verifiee', 'free'],
      ['qualifie', 'free'],
      ['enrichi', 'perContact'],
      ['actionnable', 'free'],
    ])
  })
})

describe('tallyContactLifecycle — le funnel d’UN dossier', () => {
  it('classe chaque contact dans son état, sans agrégat serveur', () => {
    const result = tallyContactLifecycle([
      // identité + rôle + joignable → actionnable
      {
        full_name: 'Marie Dupont',
        title: 'DSI',
        decision_role: 'technical',
        email: 'marie.dupont@tf1.fr',
        linkedin_url: null,
      },
      // identité + rôle, aucun canal → qualifié
      { full_name: 'Paul Martin', title: 'RSSI', decision_role: 'technical', email: null },
      // identité seule → identité vérifiée
      { full_name: 'Léa Bernard', title: 'Directrice achats', decision_role: null, email: null },
      // prénom seul, aucun canal → détecté
      { full_name: 'Karim', title: null, decision_role: null, email: null },
    ])

    expect(result).toEqual({
      detecte: 1,
      identite_verifiee: 1,
      qualifie: 1,
      enrichi: 0,
      actionnable: 1,
      historique: 0,
      rejete: 0,
    })
  })

  it('l’état persisté fait foi — comme le COALESCE serveur', () => {
    const result = tallyContactLifecycle([
      // Données complètes, mais l’état persisté dit « ex-employé » : il l’emporte,
      // sinon un contact parti serait recompté comme actionnable.
      {
        lifecycle_state: 'historique',
        full_name: 'Jean Ancien',
        title: 'DSI',
        decision_role: 'technical',
        email: 'jean@tf1.fr',
      },
    ])

    expect(result.historique).toBe(1)
    expect(result.actionnable).toBe(0)
  })

  it('aucun contact ⇒ tous les compteurs à zéro (le bandeau ne s’affichera pas)', () => {
    expect(tallyContactLifecycle([])).toEqual(tally({}))
  })
})

// #4099 (recette prod 13/10, Sanofi) — « 2610 contacts clés » face à « 16 vérifiés / 16 pertinents » :
// le résumé comptait TOUS les contacts du compte. Un contact clé est un contact PERTINENT, jamais plus
// que ce qui est qualifié.
describe('countRelevantContacts (#4099)', () => {
  const rows = (state: string, n: number) =>
    Array.from({ length: n }, () => ({ lifecycle_state: state })) as Parameters<typeof tallyContactLifecycle>[0]

  it('ne compte que les contacts qualifiés ou au-delà, jamais les simples détectés', () => {
    const contacts = [
      ...rows('detecte', 2594),
      ...rows('identite_verifiee', 0),
      ...rows('qualifie', 10),
      ...rows('enrichi', 4),
      ...rows('actionnable', 2),
      ...rows('historique', 3),
    ]
    expect(countRelevantContacts(contacts)).toBe(16)
  })

  it('reste null quand aucun contact n’est pertinent : jamais un « 0 » affiché', () => {
    expect(countRelevantContacts(rows('detecte', 40))).toBeNull()
    expect(countRelevantContacts([])).toBeNull()
  })
})
