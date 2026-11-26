import { describe, expect, it } from 'vitest'
import { accountPlanFreshness, lastAnalyzedDate, planGeneratedDate } from './lastAnalyzed'

/**
 * « Dernière analyse » montrait ``created_at`` — la date de CRÉATION du compte.
 * Un dossier ré-analysé aujourd'hui lisait donc « il y a 5 jours » et invitait à
 * relancer (une relance coûte un crédit). La vraie date vient désormais de
 * ``last_analyzed_at`` = ``MAX(analysis_runs.completed_at)``.
 */
describe('lastAnalyzedDate — la date bouge à la re-analyse, jamais de date inventée', () => {
  const CREATED = '2026-07-15T09:00:00.000Z'
  const RECOMPLETED = '2026-07-20T14:30:00.000Z'

  // LE test demandé : un compte ré-analysé montre la NOUVELLE date de complétion,
  // pas sa date de création d'origine.
  it('un compte ré-analysé montre la date de complétion du run, pas created_at', () => {
    const date = lastAnalyzedDate({ last_analyzed_at: RECOMPLETED, created_at: CREATED, status: 'completed' })

    expect(date).toBe(RECOMPLETED)
    expect(date).not.toBe(CREATED)
  })

  // Legacy : compte terminé antérieur au suivi des runs → aucun MAX. On retombe
  // sur created_at (exactement ce qui est affiché aujourd'hui — aucune régression,
  // et c'est une vraie date pour ce compte, pas une invention).
  it('un compte legacy completed sans run retombe sur created_at', () => {
    const date = lastAnalyzedDate({ last_analyzed_at: null, created_at: CREATED, status: 'completed' })

    expect(date).toBe(CREATED)
  })

  it('champ absent (API antérieure) = même repli legacy', () => {
    const date = lastAnalyzedDate({ created_at: CREATED, status: 'completed' })

    expect(date).toBe(CREATED)
  })

  // Ne JAMAIS présenter une date de création comme une date d'analyse pour un run
  // qui n'a jamais abouti.
  it.each(['analyzing', 'error', 'canceled', 'inbox'])(
    'un compte « %s » sans run terminé renvoie null (→ « — »), jamais created_at',
    status => {
      const date = lastAnalyzedDate({ last_analyzed_at: null, created_at: CREATED, status })

      expect(date).toBeNull()
    },
  )

  // Un run en vol (completed_at NULL) n'est jamais compté comme dernière analyse :
  // côté serveur il est exclu, donc last_analyzed_at reste null → repli legacy sur
  // created_at UNIQUEMENT si le compte est déjà `completed` d'un run précédent.
  it('un compte en cours d’analyse (analyzing) n’affiche pas created_at comme analyse', () => {
    expect(lastAnalyzedDate({ last_analyzed_at: null, created_at: CREATED, status: 'analyzing' })).toBeNull()
  })
})

// #3420 (recette 03/10) — « Âge du plan inconnu » à côté de « Analyse actualisée il y a 14 minutes » :
// le plan et le hero lisent la MÊME date (`lastAnalyzedDate`), jamais deux dérivations.
describe('accountPlanFreshness — même date que le hero', () => {
  const now = new Date('2026-10-03T10:00:00.000Z')
  it('un dossier terminé sans run enregistré a un âge de plan (repli created_at), pas « inconnu »', () => {
    expect(
      accountPlanFreshness(
        { last_analyzed_at: null, created_at: '2026-10-03T09:46:00.000Z', status: 'completed' },
        now,
      ),
    ).toBe('frais')
  })
  it('un dossier jamais analysé reste « inconnu »', () => {
    expect(
      accountPlanFreshness({ last_analyzed_at: null, created_at: '2026-10-03T09:46:00.000Z', status: 'pending' }, now),
    ).toBe('inconnu')
  })
})

// #3278.b (recette R39, EDF) — « Calculé le 12/10 » ne bougeait pas après « Laisser Bellum décider » :
// `last_analyzed_at` = MAX(analysis_runs.completed_at), et une re-planification n'écrit aucun run.
// La date du PLAN est celle de sa propre écriture (`strategy_collected_at`, posée à chaque `savePlan`).
describe('planGeneratedDate — #3278.b', () => {
  const base = { created_at: '2026-07-15T09:00:00.000Z', status: 'completed' }

  it('un plan re-planifié date de son calcul, pas du dernier run d’analyse', () => {
    expect(
      planGeneratedDate({
        ...base,
        last_analyzed_at: '2026-10-12T10:00:00.000Z',
        strategy_collected_at: '2026-10-16T08:30:00.000Z',
      }),
    ).toBe('2026-10-16T08:30:00.000Z')
  })

  it('sans date de collecte du segment : retombe sur la date d’analyse (rien d’inventé)', () => {
    expect(planGeneratedDate({ ...base, last_analyzed_at: '2026-10-12T10:00:00.000Z' })).toBe(
      '2026-10-12T10:00:00.000Z',
    )
    expect(planGeneratedDate({ ...base, status: 'inbox', last_analyzed_at: null })).toBeNull()
  })
})
