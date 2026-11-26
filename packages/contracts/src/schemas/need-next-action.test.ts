import { describe, expect, it } from 'vitest'
import { NEED_NEXT_ACTIONS, needNextAction } from './need-next-action.js'
import type { OpenNeedRow } from './open-needs.js'

/**
 * La prochaine action d'un besoin (I-35).
 *
 * Ce qui se teste : l'ORDRE (une seule action s'affiche, elle doit être la plus
 * bloquante), et le refus de deviner quand rien ne se lit.
 *
 * ⚠️ Trois branches demandées par la source ne sont PAS testées ici parce
 * qu'elles ne sont pas livrées — voir le refus documenté en tête de
 * `need-next-action.ts` : « relancer le client », « relancer le rapprochement »
 * et « créer la mission » supposent chacune un champ que `OpenNeedRow` ne porte
 * pas (la date d'envoi d'une shortlist, l'issue d'un positionnement), et ce
 * champ vit dans `submissions`, une table que ce fichier ne joint pas.
 */
const NOW = new Date('2026-08-27T10:00:00.000Z')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [{ name: 'kubernetes', required: true }],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'open',
    status_reason: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: '22222222-2222-4222-8222-222222222222',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

describe('needNextAction — l’ordre va du plus BLOQUANT au plus avancé', () => {
  it('typer les compétences passe avant tout : sans elles le matching ne part pas', () => {
    // Le dire après « aucun profil présenté » enverrait quelqu'un chercher dans
    // un vivier qui ne sera de toute façon pas interrogé.
    const row = need({ skills: [], deadline_at: '2026-01-01T00:00:00.000Z', shortlist_count: 0 })
    expect(needNextAction(row, NOW)).toBe('type_skills')
  })

  it('une échéance dépassée passe avant le matching', () => {
    expect(needNextAction(need({ deadline_at: '2026-08-01T00:00:00.000Z' }), NOW)).toBe('decide_expired')
  })

  it('#3348 — un démarrage dépassé passe avant le matching, même sans échéance déclarée', () => {
    expect(needNextAction(need({ start_on: '2026-08-01T00:00:00.000Z' }), NOW)).toBe('decide_stale_start')
  })

  it('#3348 — une échéance dépassée l’emporte sur un démarrage dépassé (le plus bloquant d’abord)', () => {
    expect(
      needNextAction(need({ deadline_at: '2026-08-01T00:00:00.000Z', start_on: '2026-07-01T00:00:00.000Z' }), NOW),
    ).toBe('decide_expired')
  })

  it('un besoin déclaré NON staffable demande une réponse au client, pas un matching', () => {
    expect(needNextAction(need({ staffable: 'no' }), NOW)).toBe('answer_unstaffable')
  })

  it('sans shortlist, le geste est de matcher', () => {
    expect(needNextAction(need(), NOW)).toBe('run_matching')
  })

  it('avec une shortlist ET un TJM cible, le geste est de l’envoyer', () => {
    expect(needNextAction(need({ shortlist_count: 3, target_tjm_cents: 65000 }), NOW)).toBe('send_shortlist')
  })

  it('avec une shortlist mais SANS TJM cible, le geste est de le saisir avant d’envoyer', () => {
    // Un recruteur qui présente un profil a besoin du prix de vente pour
    // négocier (doctrine `c54_tarif_cible`) : mieux vaut le demander avant
    // d'envoyer la shortlist que de découvrir le trou pendant la négociation.
    expect(needNextAction(need({ shortlist_count: 3, target_tjm_cents: null }), NOW)).toBe('set_target_rate')
  })
})

describe('needNextAction — ce qu’elle REFUSE de dire', () => {
  it('ne dit rien sur un besoin qui ne circule plus', () => {
    // « Relancer le client » affiché sur tout ce qu'on ne sait pas classer est
    // le bruit exact qui fait cesser de lire une colonne.
    for (const status of ['won', 'lost', 'cancelled', 'staffed', 'on_hold'] as const) {
      expect(needNextAction(need({ status }), NOW)).toBeNull()
    }
  })

  it('ne déclenche RIEN sur une échéance illisible', () => {
    // Mieux vaut se taire que pousser à trancher sur une date qu'on n'a pas su lire.
    expect(needNextAction(need({ deadline_at: 'pas une date' }), NOW)).toBe('run_matching')
  })

  it('une échéance à venir ne déclenche rien', () => {
    expect(needNextAction(need({ deadline_at: '2026-12-01T00:00:00.000Z' }), NOW)).toBe('run_matching')
  })

  it('ne dépend PAS de l’horloge — `now` est un paramètre', () => {
    const row = need({ deadline_at: '2026-08-15T00:00:00.000Z' })
    expect(needNextAction(row, new Date('2026-08-10T00:00:00.000Z'))).toBe('run_matching')
    expect(needNextAction(row, new Date('2026-08-20T00:00:00.000Z'))).toBe('decide_expired')
  })

  it('les sept actions sont exhaustives et distinctes', () => {
    expect(new Set(NEED_NEXT_ACTIONS).size).toBe(NEED_NEXT_ACTIONS.length)
    expect(NEED_NEXT_ACTIONS).toHaveLength(7)
  })
})
