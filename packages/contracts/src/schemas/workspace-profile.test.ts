import { describe, expect, it } from 'vitest'
import {
  FORFAIT_SECOND_PLAN_ROUTES,
  needFramingOf,
  hasFunctionalSpecialization,
  needRequiresStaffing,
  orderNavForWorkspaceProfile,
  workspaceProfileOf,
} from './workspace-profile.js'
import { esnAnswersSchema } from './onboarding.js'
import { WORKSPACE_PROFILE_ANSWER_FIELDS } from './onboarding/answers-profil-espace.js'

// #4270 (18/10) — le profil d'espace « forfait / conseil ».

const SIDEBAR = [
  '/briefing',
  '/accounts',
  '/projects',
  '/projects/needs',
  '/missions',
  '/actions',
  '/team',
  '/pilotage',
]
const route = (item: string): string => item

describe('#4270.1 — la réponse du profil d’espace', () => {
  it('lit `forfait_conseil`, et rend null sur absence ou valeur inconnue (jamais un profil deviné)', () => {
    expect(workspaceProfileOf({ workspace_profile: 'forfait_conseil' })).toBe('forfait_conseil')
    expect(workspaceProfileOf({ workspace_profile: 'staffing' })).toBe('staffing')
    expect(workspaceProfileOf({ workspace_profile: null })).toBeNull()
    expect(workspaceProfileOf({})).toBeNull()
    expect(workspaceProfileOf(null)).toBeNull()
    expect(workspaceProfileOf({ workspace_profile: 'regie' })).toBeNull()
  })

  it('voyage dans le schéma des réponses ; une valeur illisible dégrade en null sans casser le profil', () => {
    expect(WORKSPACE_PROFILE_ANSWER_FIELDS.workspace_profile.parse('n’importe quoi')).toBeNull()
    const parsed = esnAnswersSchema.partial().parse({ workspace_profile: 'forfait_conseil' })
    expect(parsed.workspace_profile).toBe('forfait_conseil')
  })
})

describe('#4270.2 — le staffing passe au second plan, rien n’est masqué (c76)', () => {
  it('sans profil, ou en staffing : la MÊME liste, à l’octet près (même référence)', () => {
    expect(orderNavForWorkspaceProfile(SIDEBAR, null, route)).toBe(SIDEBAR)
    expect(orderNavForWorkspaceProfile(SIDEBAR, 'staffing', route)).toBe(SIDEBAR)
  })

  it('en forfait : les entrées de staffing descendent avant la queue équipe / pilotage', () => {
    expect(orderNavForWorkspaceProfile(SIDEBAR, 'forfait_conseil', route)).toEqual([
      '/briefing',
      '/accounts',
      '/projects',
      '/missions',
      '/actions',
      '/projects/needs',
      '/team',
      '/pilotage',
    ])
  })

  it('les mêmes entrées, chacune une fois — l’ordre seul change', () => {
    const ordered = orderNavForWorkspaceProfile(SIDEBAR, 'forfait_conseil', route)
    expect([...ordered].sort()).toEqual([...SIDEBAR].sort())
  })

  it('les onglets du pilotage : le staffing passe derrière les autres, sans queue à respecter', () => {
    const tabs = ['/pilotage', '/pilotage/pipe', '/pilotage/staffing', '/pilotage/finance']
    expect(orderNavForWorkspaceProfile(tabs, 'forfait_conseil', route)).toEqual([
      '/pilotage',
      '/pilotage/pipe',
      '/pilotage/finance',
      '/pilotage/staffing',
    ])
  })

  it('n’attrape pas ce qu’il ne vise pas : une liste sans staffing reste la même', () => {
    const list = ['/briefing', '/accounts', '/missions']
    expect(orderNavForWorkspaceProfile(list, 'forfait_conseil', route)).toBe(list)
    expect(FORFAIT_SECOND_PLAN_ROUTES).toContain('/consultants')
  })
})

describe('#4270.3 — un besoin se lit comme un projet à cadrer', () => {
  it('relit périmètre, sponsor, budget sur les champs existants', () => {
    expect(
      needFramingOf({ context: ' Refonte du SI paie ', decision_maker_contact_id: 'c-1', budget_cents: '12000000' }),
    ).toEqual({ scope: 'Refonte du SI paie', sponsorContactId: 'c-1', budgetCents: '12000000' })
  })

  it('absent ≠ « 0 » : rien de renseigné reste null, un texte blanc aussi', () => {
    expect(needFramingOf({})).toEqual({ scope: null, sponsorContactId: null, budgetCents: null })
    expect(needFramingOf({ context: '   ', budget_cents: null }).scope).toBeNull()
    // Un budget à zéro DÉCLARÉ reste un budget déclaré — jamais confondu avec une absence.
    expect(needFramingOf({ budget_cents: 0 }).budgetCents).toBe('0')
  })
})

describe('#4270.4 — un forfait encadré ne demande pas de staffing', () => {
  it('sait dire NON : un besoin staffé ou au mode inconnu garde ses portes', () => {
    expect(needRequiresStaffing({ delivery_mode: 'staffed' })).toBe(true)
    expect(needRequiresStaffing({ delivery_mode: null })).toBe(true)
    expect(needRequiresStaffing({})).toBe(true)
  })

  it('un besoin encadré n’exige aucun consultant', () => {
    expect(needRequiresStaffing({ delivery_mode: 'supervised' })).toBe(false)
  })
})

// #4422.3 — la spécialisation fonctionnelle d'un espace au forfait/conseil.
describe('hasFunctionalSpecialization — #4422.3', () => {
  it('forfait + un seul métier (supply chain) → spécialisé, même sur plusieurs codes du groupe', () => {
    expect(
      hasFunctionalSpecialization({
        workspace_profile: 'forfait_conseil',
        offer_domains: ['SUPPLY_CHAIN_SOP', 'LOGISTICS_TRANSPORT_OPS', 'PROCUREMENT_SRM'],
      }),
    ).toBe(true)
  })

  it('forfait + plusieurs métiers → non spécialisé', () => {
    expect(
      hasFunctionalSpecialization({
        workspace_profile: 'forfait_conseil',
        offer_domains: ['SUPPLY_CHAIN_SOP', 'TREASURY_WC'],
      }),
    ).toBe(false)
  })

  it('régie (staffing ou aucun profil) → jamais spécialisé, même avec un seul métier', () => {
    expect(hasFunctionalSpecialization({ workspace_profile: 'staffing', offer_domains: ['SUPPLY_CHAIN_SOP'] })).toBe(
      false,
    )
    expect(hasFunctionalSpecialization({ offer_domains: ['SUPPLY_CHAIN_SOP'] })).toBe(false)
    expect(hasFunctionalSpecialization(null)).toBe(false)
  })

  it('forfait sans métier déclaré → non spécialisé (on ne devine pas)', () => {
    expect(hasFunctionalSpecialization({ workspace_profile: 'forfait_conseil', offer_domains: [] })).toBe(false)
    expect(hasFunctionalSpecialization({ workspace_profile: 'forfait_conseil', offer_domains: ['INCONNU'] })).toBe(
      false,
    )
  })
})
