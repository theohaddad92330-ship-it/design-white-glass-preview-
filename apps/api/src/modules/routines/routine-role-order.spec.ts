import {
  KNOWN_WORKSPACE_ROLES,
  ROUTINE_KEYS,
  familyOfRoutine,
  orderRoutinesForRole,
  readingFamilies,
  routineReadingOf,
  type RoutineFamily,
} from './routine-role-order'
import type { RoutineKey } from '@bellum/contracts'
import { ROUTINE_CATALOG } from './routine-catalog'

/**
 * #2399.8 (épopée #2843) — la garde de l'ordonnancement des routines par
 * rôle. Elle tient la moitié qui compte : c'est un ORDRE, jamais un filtre.
 * Même patron que `briefing-role-order.spec.ts` (#1936.11).
 */

const READINGS = ['sales', 'recruiter', 'manager', 'finance', 'executive'] as const

const routine = (key: RoutineKey) => ({ key })

describe('#2399.8 — les routines varient selon le rôle', () => {
  it('lit un corpus non vide : les rôles de l’espace et les clés du catalogue', () => {
    expect(KNOWN_WORKSPACE_ROLES.length).toBeGreaterThanOrEqual(7)
    expect(ROUTINE_KEYS.length).toBeGreaterThanOrEqual(40)
  })

  it('chaque clé du catalogue a une famille — aucune ne tombe dans un trou', () => {
    for (const key of ROUTINE_KEYS) {
      const family = familyOfRoutine(key)
      expect(family).toBeDefined()
    }
  })

  it('chaque rôle connu a une lecture — aucun ne tombe dans un trou', () => {
    for (const role of KNOWN_WORKSPACE_ROLES) {
      expect(READINGS).toContain(routineReadingOf(role))
    }
    // Un rôle non lu (profil incomplet, résolution en échec) garde l'ordre d'avant.
    expect(routineReadingOf(null)).toBe('sales')
  })

  it('AUCUNE lecture ne filtre : les six familles, chacune exactement une fois', () => {
    const allFamilies: RoutineFamily[] = ['commercial', 'recruiter', 'manager', 'adv', 'delivery', 'general']
    for (const reading of READINGS) {
      const families = readingFamilies(reading)
      expect([...families].sort()).toEqual([...allFamilies].sort())
      expect(new Set(families).size).toBe(families.length)
    }
  })

  it('réordonne SANS jamais perdre ou dupliquer une routine, pour chaque rôle connu', () => {
    const items = ROUTINE_KEYS.map(routine)
    for (const role of KNOWN_WORKSPACE_ROLES) {
      const ordered = orderRoutinesForRole(items, role, item => item.key)
      expect(ordered).toHaveLength(items.length)
      expect([...ordered.map(item => item.key)].sort()).toEqual([...items.map(item => item.key)].sort())
    }
  })

  it('un commercial ouvre sur ses relances, pas sur l’hygiène CRM du manager', () => {
    const items = [routine('crm_hygiene'), routine('no_reply_follow_up'), routine('daily_briefing')]
    expect(orderRoutinesForRole(items, 'sales', item => item.key).map(item => item.key)).toEqual([
      'no_reply_follow_up',
      'daily_briefing',
      'crm_hygiene',
    ])
  })

  it('un manager ouvre sur ses écarts — hygiène CRM et marge — avant les relances commerciales', () => {
    const items = [routine('no_reply_follow_up'), routine('margin_alert'), routine('daily_briefing')]
    expect(orderRoutinesForRole(items, 'sales_ops', item => item.key).map(item => item.key)).toEqual([
      'margin_alert',
      'daily_briefing',
      'no_reply_follow_up',
    ])
  })

  it('un recruteur ouvre sur le vivier, pas sur la facturation', () => {
    const items = [routine('invoice_readiness'), routine('cv_intake'), routine('daily_briefing')]
    expect(orderRoutinesForRole(items, 'recruiter', item => item.key).map(item => item.key)).toEqual([
      'cv_intake',
      'daily_briefing',
      'invoice_readiness',
    ])
  })

  it('le tri est STABLE : deux routines de la même famille gardent l’ordre du catalogue', () => {
    const items = [routine('meeting_prep'), routine('no_reply_follow_up'), routine('positive_replies')]
    expect(orderRoutinesForRole(items, 'sales', item => item.key).map(item => item.key)).toEqual([
      'meeting_prep',
      'no_reply_follow_up',
      'positive_replies',
    ])
  })
})

/**
 * #2843.29 (c76_role_reordonne_jamais_ne_filtre) — le rôle ET le type d'espace
 * changent l'ORDRE des routines proposées, jamais leur présence. La famille vit
 * dans le catalogue (`roles[0]`), à UN seul endroit (GA-26).
 */
describe('#2843.29 — rôle et type d’espace réordonnent, ne filtrent jamais', () => {
  const items = ROUTINE_KEYS.map(routine)
  const keysOf = (list: readonly { key: RoutineKey }[]) => list.map(item => item.key)

  it('la famille de chaque routine est le premier rôle déclaré au catalogue', () => {
    for (const definition of ROUTINE_CATALOG) expect(familyOfRoutine(definition.key)).toBe(definition.roles[0])
  })

  it('un rôle différent voit le MÊME ensemble dans un ordre différent', () => {
    const sales = keysOf(orderRoutinesForRole(items, 'sales', item => item.key))
    const recruiter = keysOf(orderRoutinesForRole(items, 'recruiter', item => item.key))
    expect([...recruiter].sort()).toEqual([...sales].sort())
    expect(recruiter).not.toEqual(sales)
  })

  it('un espace au forfait voit le MÊME ensemble, les routines propres au staffing plus bas', () => {
    const staffing = keysOf(orderRoutinesForRole(items, 'recruiter', item => item.key, 'staffing'))
    const forfait = keysOf(orderRoutinesForRole(items, 'recruiter', item => item.key, 'forfait_conseil'))
    expect([...forfait].sort()).toEqual([...staffing].sort())
    expect(forfait).not.toEqual(staffing)
    // Dans la famille recruteur, une routine pertinente au forfait passe avant une routine propre au staffing.
    const recruiterFamily = forfait.filter(key => familyOfRoutine(key) === 'recruiter')
    const firstStaffingOnly = recruiterFamily.findIndex(key => !profilesOf(key).includes('forfait_conseil'))
    const lastShared = recruiterFamily.map(key => profilesOf(key).includes('forfait_conseil')).lastIndexOf(true)
    expect(firstStaffingOnly).toBeGreaterThan(lastShared)
  })

  it('sans profil connu, l’ordre est celui du rôle seul (aucune supposition sur l’espace)', () => {
    expect(keysOf(orderRoutinesForRole(items, 'sales', item => item.key, null))).toEqual(
      keysOf(orderRoutinesForRole(items, 'sales', item => item.key)),
    )
  })
})

function profilesOf(key: RoutineKey) {
  return ROUTINE_CATALOG.find(definition => definition.key === key)?.workspaceProfiles ?? []
}
