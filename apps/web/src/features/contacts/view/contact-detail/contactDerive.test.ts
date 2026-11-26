import type { Contact } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import {
  contactScore,
  contactScoreView,
  decisionRoleProvenance,
  hasStaleEmployer,
  deriveLauraBrief,
  formatLauraBriefForCopy,
  ROLE_SCORE,
  scoreLabel,
} from './contactDerive'

/**
 * GA-298 — LOT 4 (perf). `GET /contacts/account/:id` (`findByAccountForHttp`)
 * a arrêté de servir `contact_score` / `contact_score_breakdown` : mesuré le
 * 12/09/2026, 1 048 Ko sur 2 027 lignes (THALES, 25 % du poids de la réponse)
 * qu'aucun consommateur de cette route n'affichait — le score EXPLIQUÉ ne vit
 * que sur la fiche contact (`GET /contacts/:id`, indépendante, inchangée).
 *
 * Ce fichier ne teste PAS un écran de l'onglet Contacts (aucun n'appelle
 * `contactScoreView` — voir le tableau de recette du lot) : il fixe le
 * contrat que `findByAccountForHttp` s'appuie dessus pour retirer le score
 * sans mentir. `contactScoreView`/`contactScore` savaient DÉJÀ dégrader
 * proprement une décomposition absente (la liste globale, `GET /contacts`,
 * ne l'a jamais eue) — ces tests le nomment explicitement pour ce lot, pour
 * qu'un futur retrait de `contact_score` lui-même se heurte à un rouge ici
 * plutôt que sur la fiche.
 */
describe('contactDerive — dégradation sans contact_score_breakdown (LOT 4)', () => {
  it('contactScoreView retombe sur le score simple quand la décomposition est absente', () => {
    const contact = {
      id: 'c1',
      account_id: 'a1',
      full_name: 'Claire Martin',
      decision_role: 'technical',
      contact_score: 72,
      // Pas de `contact_score_breakdown` — la forme que `findByAccountForHttp`
      // envoie désormais.
    } as unknown as Contact

    expect(contactScoreView(contact)).toEqual({ total: 72, breakdown: null })
  })

  it('contactScore retombe sur l’approximation par rôle quand contact_score est ABSENT (pas seulement 0)', () => {
    const contact = {
      id: 'c1',
      account_id: 'a1',
      full_name: 'Claire Martin',
      decision_role: 'technical',
      // Ni `contact_score` ni `contact_score_breakdown` — un contact qui
      // n'a jamais traversé `scoreContacts` (ex. `findAllForUser`, ou tout
      // futur appelant qui n'a que cette forme).
    } as unknown as Contact

    expect(contactScore(contact)).toBe(ROLE_SCORE.technical)
  })

  it('une décomposition VIDE (tableau à longueur 0) est traitée comme absente, pas comme un score nul', () => {
    const contact = {
      id: 'c1',
      account_id: 'a1',
      full_name: 'Claire Martin',
      decision_role: 'economic',
      contact_score: 78,
      contact_score_breakdown: [],
    } as unknown as Contact

    expect(contactScoreView(contact)).toEqual({ total: 78, breakdown: null })
  })
})

/**
 * #3692 — le bloc « Pourquoi ce contact compte » sépare les FAITS (poste réel,
 * points-clés, premier lien documenté) des HYPOTHÈSES (rôle probable, motif de
 * contact produit par le modèle) : copiés dans un brief, ils restent distincts.
 * Aucune motivation personnelle, aucune ambition/peur : le bloc ne lit jamais
 * `career_levers` / `implicit_fears`.
 */
describe('deriveLauraBrief (#3692)', () => {
  function contact(extra: Record<string, unknown>): Contact {
    return {
      id: 'c1',
      account_id: 'a1',
      full_name: 'Amina Benali',
      decision_role: null,
      ...extra,
    } as unknown as Contact
  }

  it('le poste réel et les points-clés sont des faits ; le motif du modèle est une hypothèse', () => {
    const brief = deriveLauraBrief(
      contact({
        title: 'DSI',
        entity: 'Groupe Acme',
        key_points: ['Prise de poste récente'],
        why_contact: 'Pilote la refonte du SI.',
      }),
    )
    expect(brief.facts).toEqual(['DSI — Groupe Acme', 'Prise de poste récente'])
    expect(brief.hypotheses).toEqual(['Pilote la refonte du SI.'])
  })

  it('le rôle de décision est une hypothèse (jamais un fait) et « unknown » ne pose rien', () => {
    expect(deriveLauraBrief(contact({ decision_role: 'economic' })).roleLabel).toBe('Décideur économique')
    expect(deriveLauraBrief(contact({ decision_role: 'unknown' })).roleLabel).toBeNull()
    expect(deriveLauraBrief(contact({ decision_role: 'economic' })).facts).toEqual([])
  })

  it('le premier lien connu est un fait, au plus 4 faits', () => {
    const brief = deriveLauraBrief(
      contact({
        title: 'DSI',
        key_points: ['A', 'B', 'C'],
        relations: [{ name: 'Julien Roche', title: 'DG', tier: 1 }],
      }),
    )
    expect(brief.facts).toEqual(['DSI', 'A', 'B', 'Julien Roche — DG'])
  })

  it('ne lit jamais les leviers de carrière ni les craintes (aucun trait psychologique)', () => {
    const brief = deriveLauraBrief(
      contact({ career_levers: ['Ambition de devenir DG'], implicit_fears: ['Peur de l’échec'], key_points: [] }),
    )
    expect(JSON.stringify(brief)).not.toMatch(/Ambition|Peur/)
  })

  it('le narratif long reste en détail replié, sans dupliquer le motif', () => {
    const brief = deriveLauraBrief(contact({ why_contact: 'Motif', profile_summary: 'Parcours' }))
    expect(brief.detail).toEqual(['Parcours'])
    expect(brief.hypotheses).toEqual(['Motif'])
  })

  it('une personne mal documentée : rien d’inventé, la vérification utile se nomme', () => {
    const brief = deriveLauraBrief(contact({}))
    expect(brief.facts).toEqual([])
    expect(brief.hypotheses).toEqual([])
    expect(brief.isThin).toBe(true)
  })

  it('l’employeur obsolète est une réserve déterminante', () => {
    const brief = deriveLauraBrief(
      contact({ contact_score_breakdown: [{ key: 'freshness', evaluated: true, points: 1, max: 10 }] }),
    )
    expect(brief.employerStale).toBe(true)
  })

  it('le texte de copie sépare « Faits » et « À vérifier »', () => {
    const brief = deriveLauraBrief(contact({ title: 'DSI', why_contact: 'Motif' }))
    expect(formatLauraBriefForCopy(brief, { facts: 'Faits', hypotheses: 'À vérifier' })).toBe(
      'Faits\n- DSI\n\nÀ vérifier\n- Motif',
    )
  })
})

describe('decisionRoleProvenance (#3400.5 — retour bêta #3400)', () => {
  it('préfère la provenance PAR CHAMP (field_provenance.decisionRole) quand elle existe', () => {
    const c = {
      decision_role: 'champion',
      field_provenance: { decisionRole: { source: 'human', observedAt: '2026-09-20T10:00:00.000Z' } },
      source: 'apollo',
      created_at: '2026-01-01T00:00:00.000Z',
    } as unknown as Contact
    expect(decisionRoleProvenance(c)).toEqual({ source: 'human', observedAt: '2026-09-20T10:00:00.000Z' })
  })

  it('retombe sur la source/date du contact quand aucune provenance par champ n’a été journalisée', () => {
    const c = {
      decision_role: 'technical',
      field_provenance: undefined,
      source: 'apollo',
      created_at: '2026-01-01T00:00:00.000Z',
    } as unknown as Contact
    expect(decisionRoleProvenance(c)).toEqual({ source: 'connector', observedAt: '2026-01-01T00:00:00.000Z' })
  })

  it('rend null sans rôle — rien à dater (GA-18/19)', () => {
    const c = { decision_role: null, source: 'apollo' } as unknown as Contact
    expect(decisionRoleProvenance(c)).toBeNull()
  })
})

// #3487.2 — « Top contact 84 » à côté de « employeur obsolète 1/10 » : le score
// seul ne dit pas que la personne a quitté la cible.
describe('contactDerive — employeur obsolète (#3487.2)', () => {
  const crit = (key: string, points: number, evaluated = true) => ({ key, points, max: 10, proof: 'x', evaluated })

  it('hasStaleEmployer lit le critère de fraîcheur effondré à 1 point', () => {
    expect(hasStaleEmployer([crit('role', 30), crit('freshness', 1)])).toBe(true)
  })

  it('une fraîcheur normale, absente ou non évaluée ne déclenche rien', () => {
    expect(hasStaleEmployer([crit('freshness', 5)])).toBe(false)
    expect(hasStaleEmployer([crit('freshness', 1, false)])).toBe(false)
    expect(hasStaleEmployer([crit('role', 30)])).toBe(false)
    expect(hasStaleEmployer(null)).toBe(false)
  })

  it('scoreLabel(84) reste « Top contact » ; avec employeur obsolète il ne peut pas l’être', () => {
    expect(scoreLabel(84)).toBe(i18n.t('contacts:score.top'))
    expect(scoreLabel(84, { employerStale: true })).toBe(i18n.t('contacts:score.toVerify'))
    expect(scoreLabel(45, { employerStale: true })).toBe(i18n.t('contacts:score.toVerify'))
    expect(scoreLabel(20, { employerStale: true })).toBe(i18n.t('contacts:score.secondary'))
  })
})
