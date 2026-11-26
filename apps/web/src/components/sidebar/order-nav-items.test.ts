import { describe, expect, it } from 'vitest'
import { PLATFORM_SECTIONS } from './items'
import { orderNavItems } from './order-nav-items'

// #4270.2 (18/10) — en espace forfait / conseil, le staffing passe au second plan
// de la barre latérale ; rien n'est masqué ni supprimé (c76).

const workspace = PLATFORM_SECTIONS[0]!
const routes = (section: typeof workspace | undefined): string[] => (section?.items ?? []).map(item => String(item.to))

describe('#4270.2 — orderNavItems, sur la VRAIE barre', () => {
  // #4344 / #4349 (Louis 19/10/2026) — Talents = le Vivier seul : l'entrée Staffing de la barre est
  // `/consultants` ; #4351.1 — Missions s'ouvre sur `/missions/planification`.
  it('lit un corpus non vide qui contient bien l’entrée Staffing', () => {
    expect(routes(workspace)).toContain('/consultants')
  })

  it('sans profil, ou en staffing : la même section, à l’octet près', () => {
    expect(orderNavItems(workspace, null)).toBe(workspace)
    expect(orderNavItems(workspace, 'staffing')).toBe(workspace)
  })

  // #4492.2 (PR 12C) — Pilotage n'est plus une entrée de premier niveau (sous-entrée de Ma journée).
  it('en forfait : Staffing passe derrière Missions et Actions', () => {
    const ordered = routes(orderNavItems(workspace, 'forfait_conseil'))
    const at = (route: string): number => ordered.indexOf(route)
    expect(at('/consultants')).toBeGreaterThan(at('/missions/planification'))
    expect(at('/consultants')).toBeGreaterThan(at('/actions'))
    // Les affaires (les projets) passent DEVANT le staffing.
    expect(at('/projects')).toBeLessThan(at('/consultants'))
  })

  it('les mêmes entrées, chacune une fois — l’ordre seul change', () => {
    expect([...routes(orderNavItems(workspace, 'forfait_conseil'))].sort()).toEqual([...routes(workspace)].sort())
  })

  it('une section absente reste absente', () => {
    expect(orderNavItems(undefined, 'forfait_conseil')).toBeUndefined()
  })
})
