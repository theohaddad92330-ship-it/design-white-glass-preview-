import { describe, expect, it } from 'vitest'
import { openNeedRowSchema } from './open-needs.js'
import { projectNeedSchema } from './project.js'

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET.
 *
 * Le test central n'est pas « le champ accepte `null` » — c'est que les DEUX
 * cas tiennent dans le même contrat :
 *
 *  · un besoin SANS projet passe, parce que la majorité des missions d'ESN ne
 *    produisent aucun signal public (retour bêta du 17/09/2026) ;
 *  · un besoin AVEC projet passe EXACTEMENT comme avant — c'est le contrôle de
 *    non-régression, et il vaut autant que le premier ;
 *  · un besoin SANS COMPTE est REFUSÉ. C'est l'invariant qui remplace celui
 *    qu'on retire de `project_id` : on ne remplace pas une contrainte par rien.
 */
const NEED_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

function need(over: Record<string, unknown> = {}) {
  return {
    id: NEED_ID,
    project_id: PROJECT_ID,
    account_id: ACCOUNT_ID,
    title: 'Architecte plateforme',
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    status: 'to_qualify',
    deadline_at: null,
    created_at: '2026-09-18T08:00:00.000Z',
    updated_at: '2026-09-18T08:00:00.000Z',
    ...over,
  }
}

function openNeedRow(over: Record<string, unknown> = {}) {
  return {
    id: NEED_ID,
    title: 'Architecte plateforme',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: PROJECT_ID,
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: ACCOUNT_ID,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  }
}

describe('projectNeedSchema — le projet devient optionnel, le compte devient requis', () => {
  it('un besoin SANS projet passe : `project_id` vaut `null` et c’est un état valide', () => {
    const parsed = projectNeedSchema.parse(need({ project_id: null }))
    expect(parsed.project_id).toBeNull()
    expect(parsed.account_id).toBe(ACCOUNT_ID)
  })

  it('un besoin AVEC projet passe exactement comme avant — la non-régression', () => {
    expect(projectNeedSchema.parse(need()).project_id).toBe(PROJECT_ID)
  })

  it('un besoin SANS COMPTE est REFUSÉ — l’invariant qui remplace `project_id NOT NULL`', () => {
    const { account_id: _omitted, ...withoutAccount } = need()
    expect(projectNeedSchema.safeParse(withoutAccount).success).toBe(false)
    expect(projectNeedSchema.safeParse(need({ account_id: null })).success).toBe(false)
  })

  it('le compte est un identifiant, pas une chaîne libre — la garde sait dire NON', () => {
    expect(projectNeedSchema.safeParse(need({ account_id: 'ACME' })).success).toBe(false)
    expect(projectNeedSchema.safeParse(need({ project_id: 'le projet' })).success).toBe(false)
  })
})

describe('openNeedRowSchema — la ligne du board porte un besoin sans projet', () => {
  it('sans projet, les trois champs du projet sont ABSENTS ensemble, jamais « 0 » ni une étiquette vide', () => {
    const parsed = openNeedRowSchema.parse(openNeedRow({ project_id: null, project_label: null, project_stage: null }))
    expect(parsed.project_id).toBeNull()
    expect(parsed.project_label).toBeNull()
    expect(parsed.project_stage).toBeNull()
  })

  it('avec projet, la ligne est inchangée — la non-régression du board', () => {
    const parsed = openNeedRowSchema.parse(openNeedRow())
    expect(parsed.project_id).toBe(PROJECT_ID)
    expect(parsed.project_label).toBe('Plateforme')
    expect(parsed.project_stage).toBe('qualified')
  })

  it('le COMPTE ne peut plus manquer sur une ligne du board — c’est par lui qu’on la rejoint', () => {
    expect(openNeedRowSchema.safeParse(openNeedRow({ account_id: null })).success).toBe(false)
  })

  it('une étape de projet inventée reste refusée — la garde n’attrape pas ce qu’elle ne vise pas', () => {
    expect(openNeedRowSchema.safeParse(openNeedRow({ project_stage: 'en_cours' })).success).toBe(false)
  })
})
