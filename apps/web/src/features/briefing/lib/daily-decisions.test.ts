import { describe, expect, it } from 'vitest'
import type { BriefingAction, BriefingActionKind } from '@bellum/contracts'
import { categoryOrderForRole, classifyDailyDecisions, detectDispersion, roleForReadAs } from './daily-decisions'

/**
 * BEL-SC-227.1-.5 / .24 / .26 (#3256) — LES TROIS DÉCISIONS DU JOUR.
 *
 * `classifyDailyDecisions` ne recalcule PAS le classement : elle LIT
 * `briefingActionUrgencyTier` (#2389.6, déjà servi par le serveur via
 * `kind`/`expiresAt`) et range son verdict dans une des trois catégories du
 * ticket — urgent/important protègent déjà l'existant, opportunité crée déjà
 * le mouvement suivant, administratif est déjà « à traiter sans écraser le
 * commercial », la même intention que « simplifier ». Un second classement
 * aurait recréé le doublon que #3249 (règle 4) interdit.
 */

type Card = Pick<BriefingAction, 'id' | 'kind' | 'priority' | 'expiresAt'>

function card(kind: BriefingActionKind, priority: number, id = `${kind}-${priority}`): Card {
  return { id, kind, priority, expiresAt: null }
}

const NOW = new Date('2026-09-29T08:00:00.000Z')

describe('classifyDailyDecisions', () => {
  it('rend au plus une décision par catégorie — jamais sept priorités équivalentes (règle BEL-SC-227.20)', () => {
    const actions = [
      card('conflict', 1),
      card('mission_end', 2),
      card('account', 3),
      card('need_stale', 4),
      card('task', 5),
      card('account_no_owner', 6),
    ] as BriefingAction[]
    const decisions = classifyDailyDecisions(actions, NOW, null)
    expect(decisions.length).toBeLessThanOrEqual(3)
    expect(new Set(decisions.map(d => d.category)).size).toBe(decisions.length)
  })

  it('choisit, dans chaque catégorie, la carte du RANG le plus haut — jamais un second tri', () => {
    const actions = [card('account', 2), card('need_stale', 1)] as BriefingAction[]
    const decisions = classifyDailyDecisions(actions, NOW, null)
    expect(decisions).toEqual([{ category: 'nextMove', action: actions[1] }])
  })

  it('urgent/important protègent le business existant (BEL-SC-227.2)', () => {
    const decisions = classifyDailyDecisions([card('mission_end', 1)] as BriefingAction[], NOW, null)
    expect(decisions).toEqual([{ category: 'protect', action: expect.objectContaining({ kind: 'mission_end' }) }])
  })

  it('opportunité crée le prochain mouvement commercial (BEL-SC-227.3)', () => {
    const decisions = classifyDailyDecisions([card('account', 1)] as BriefingAction[], NOW, null)
    expect(decisions).toEqual([{ category: 'nextMove', action: expect.objectContaining({ kind: 'account' }) }])
  })

  it('administratif simplifie le système (BEL-SC-227.4)', () => {
    const decisions = classifyDailyDecisions([card('task', 1)] as BriefingAction[], NOW, null)
    expect(decisions).toEqual([{ category: 'simplify', action: expect.objectContaining({ kind: 'task' }) }])
  })

  it('une catégorie SANS candidat ne fait AUCUNE ligne — jamais une décision inventée', () => {
    const decisions = classifyDailyDecisions([card('account', 1)] as BriefingAction[], NOW, null)
    expect(decisions.map(d => d.category)).toEqual(['nextMove'])
  })

  it('sans rôle connu, l’ordre par défaut est protéger → mouvement → simplifier', () => {
    const actions = [card('mission_end', 1), card('account', 2), card('task', 3)] as BriefingAction[]
    const decisions = classifyDailyDecisions(actions, NOW, null)
    expect(decisions.map(d => d.category)).toEqual(['protect', 'nextMove', 'simplify'])
  })

  it('le rôle change l’ORDRE des décisions, jamais leur CONTENU (doctrine CLAUDE.md, BEL-SC-227.5/.26)', () => {
    const actions = [card('mission_end', 1), card('account', 2), card('task', 3)] as BriefingAction[]
    const founder = classifyDailyDecisions(actions, NOW, 'Fondateur / CEO')
    const developer = classifyDailyDecisions(actions, NOW, 'Business Developer')

    // Même CONTENU : les deux rôles voient les trois mêmes décisions.
    expect(new Set(founder.map(d => d.action.id))).toEqual(new Set(developer.map(d => d.action.id)))
    // ORDRE différent : le fondateur protège d'abord, le développeur ouvre d'abord une porte.
    expect(founder.map(d => d.category)).toEqual(['protect', 'nextMove', 'simplify'])
    expect(developer.map(d => d.category)).toEqual(['nextMove', 'protect', 'simplify'])
  })

  it('un rôle inconnu du catalogue retombe sur l’ordre par défaut, jamais une erreur', () => {
    const decisions = classifyDailyDecisions([card('mission_end', 1)] as BriefingAction[], NOW, 'Titre non catalogué')
    expect(decisions).toEqual([{ category: 'protect', action: expect.objectContaining({ kind: 'mission_end' }) }])
  })
})

describe('detectDispersion (BEL-SC-227.24)', () => {
  it('pas de dispersion sous le seuil', () => {
    const actions = [card('task', 1), card('account_no_owner', 2)] as BriefingAction[]
    expect(detectDispersion(actions, NOW)).toBe(false)
  })

  it('la dispersion se mesure sur les sujets ADMINISTRATIFS ouverts en même temps, jamais un seuil sur du texte', () => {
    const actions = [
      card('task', 1),
      card('account_no_owner', 2),
      card('project_no_next_action', 3),
    ] as BriefingAction[]
    expect(detectDispersion(actions, NOW)).toBe(true)
  })

  it('les sujets urgents/opportunité ne comptent pas dans la dispersion', () => {
    const actions = [card('mission_end', 1), card('account', 2), card('need_stale', 3)] as BriefingAction[]
    expect(detectDispersion(actions, NOW)).toBe(false)
  })
})

// #3414 (recette prod 01/10) — « Lire comme » Dirigeant donnait la même tête que Commercial :
// les décisions ne lisaient que le rôle DÉCLARÉ, jamais le rôle choisi par le sélecteur.
describe('roleForReadAs (#3414)', () => {
  it('Dirigeant ouvre sur ce qui protège ; Commercial sur le prochain mouvement : les têtes DIFFÈRENT', () => {
    const owner = categoryOrderForRole(roleForReadAs('owner', null))
    const sales = categoryOrderForRole(roleForReadAs('sales', null))
    expect(owner[0]).toBe('protect')
    expect(sales[0]).toBe('nextMove')
  })

  it('l’ORDRE change, jamais le contenu : mêmes catégories, chacune une fois', () => {
    for (const role of ['owner', 'admin', 'sales', 'recruiter'] as const) {
      expect([...categoryOrderForRole(roleForReadAs(role, null))].sort()).toEqual(['nextMove', 'protect', 'simplify'])
    }
  })

  it('sait dire NON : sans lecture choisie, le rôle déclaré fait foi, inchangé', () => {
    expect(roleForReadAs(null, 'Business Developer')).toBe('Business Developer')
    expect(roleForReadAs(null, null)).toBeNull()
  })
})
