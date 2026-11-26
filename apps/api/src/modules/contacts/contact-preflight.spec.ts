import { compileContactPreflight } from '@bellum/contracts'
import { contactPreflightFacts, type PreflightContactRow } from './contact-preflight'

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10) — les FAITS du contrôle
 * avant action, lus avec les portes qui existent déjà : la porte d'éligibilité
 * (`filterEligibleContacts`) pour le périmètre du compte, `contact-score.ts`
 * pour l'employeur rapporté par une source. Aucun second moteur ici.
 */

const ID = '00000000-0000-4000-9000-000000000001'
const RAW_WITH_NOISE = {
  entities_exhaustive: [
    { name: 'Filiale Bruit', relevance: 'noise' },
    { name: 'SNCF Connect & Tech', relevance: 'core' },
  ],
}

function row(patch: Partial<PreflightContactRow> = {}): PreflightContactRow {
  return {
    id: ID,
    full_name: 'Claire Martin',
    title: 'Directrice des achats',
    entity: 'SNCF Connect & Tech',
    source: 'apollo',
    raw_data: null,
    account_id: 'acc-1',
    hidden: false,
    excluded_at: null,
    lifecycle_state: null,
    recommendation_authorized_reason: null,
    ...patch,
  }
}

const ACCOUNT = { company_name: 'SNCF', raw_analysis: RAW_WITH_NOISE }

function facts(contact: PreflightContactRow, overrides: Partial<Parameters<typeof contactPreflightFacts>[0]> = {}) {
  return contactPreflightFacts({
    contact,
    account: ACCOUNT,
    accountContacts: [contact],
    flaggedIncorrectContactIds: new Set(),
    fieldSources: {},
    ...overrides,
  })
}

describe('contactPreflightFacts — périmètre du compte (la porte d’éligibilité, relue telle quelle)', () => {
  it('dans le périmètre cartographié → évalué, aucune exclusion', () => {
    expect(facts(row()).accountScope).toEqual({ state: 'evaluated', exclusion: null, entity: 'SNCF Connect & Tech' })
  })

  it('entité marquée bruit → `entity_mismatch`', () => {
    expect(facts(row({ entity: 'Filiale Bruit' })).accountScope).toEqual({
      state: 'evaluated',
      exclusion: 'entity_mismatch',
      entity: 'Filiale Bruit',
    })
  })

  it('une correction humaine gagne : la levée posée sur la fiche fait taire la porte', () => {
    const lifted = row({ entity: 'Filiale Bruit', recommendation_authorized_reason: 'entity_mismatch' })
    expect(facts(lifted).accountScope).toEqual({ state: 'evaluated', exclusion: null, entity: 'Filiale Bruit' })
  })

  it('un homonyme dans le même compte → `homonym_conflict`', () => {
    const me = row()
    const twin = row({ id: '00000000-0000-4000-9000-000000000002' })
    expect(facts(me, { accountContacts: [me, twin] }).accountScope).toMatchObject({ exclusion: 'homonym_conflict' })
  })

  it('sait dire NON — sans compte, sans cartographie, sans entité : « non évaluable », jamais « dans le périmètre »', () => {
    expect(facts(row({ account_id: null }), { account: null }).accountScope).toEqual({
      state: 'unknown',
      reason: 'no_account',
    })
    expect(facts(row(), { account: { company_name: 'SNCF', raw_analysis: null } }).accountScope).toEqual({
      state: 'unknown',
      reason: 'no_account_scope_mapped',
    })
    expect(facts(row({ entity: 'N/A' })).accountScope).toEqual({ state: 'unknown', reason: 'no_contact_entity' })
  })
})

describe('contactPreflightFacts — poste et entreprise selon la source', () => {
  const movedAway = {
    apolloDetails: { employmentHistory: [{ organization: 'Capgemini', title: 'Consultante', current: true }] },
  }
  const sameEmployerOtherTitle = {
    apolloDetails: { employmentHistory: [{ organization: 'SNCF', title: 'Responsable RH', current: true }] },
  }

  it('la source rapporte un autre employeur → l’écart, et la fiche n’a pas été saisie à la main', () => {
    expect(facts(row({ raw_data: movedAway })).employer).toEqual({
      recordValue: 'SNCF Connect & Tech',
      sourceValue: 'Capgemini',
      recordKeptByHuman: false,
    })
  })

  it('une fiche saisie à la main (ou une entité corrigée à la main) GARDE la main — l’écart reste nommé', () => {
    expect(facts(row({ raw_data: movedAway, source: 'manual' })).employer?.recordKeptByHuman).toBe(true)
    expect(facts(row({ raw_data: movedAway }), { fieldSources: { entity: 'human' } }).employer?.recordKeptByHuman).toBe(
      true,
    )
  })

  it('le poste rapporté par la source part au contrôle avec qui le garde', () => {
    expect(facts(row({ raw_data: sameEmployerOtherTitle }), { fieldSources: { title: 'human' } }).title).toEqual({
      recordValue: 'Directrice des achats',
      sourceValue: 'Responsable RH',
      recordKeptByHuman: true,
    })
  })

  it('sans profil de source : ni employeur ni poste à comparer', () => {
    const result = facts(row())
    expect(result.employer).toBeNull()
    expect(result.title).toBeNull()
  })

  it('bout en bout avec le compilateur partagé : une ligne par écart, rien de tranché', () => {
    const preflight = compileContactPreflight({
      contactId: ID,
      action: 'export_crm',
      conflicts: [],
      ...facts(row({ entity: 'Filiale Bruit', raw_data: sameEmployerOtherTitle })),
    })
    expect(preflight.items.map(item => item.kind)).toEqual(['title_differs', 'out_of_account_scope'])
    expect(preflight.status).toBe('differences')
  })
})
