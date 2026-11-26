import { describe, expect, it } from 'vitest'
import { missionOfProject } from './project-mission'

const mission = (over: Partial<{ id: string; label: string; opportunity_id: string | null }>) => ({
  id: 'm-1',
  label: 'Mission Roche — squad data',
  opportunity_id: 'p-1',
  ...over,
})

// #4291.8 — le projet gagné NOMME sa mission : le lien est `mission.opportunity_id`, jamais un rapprochement de noms.
describe('missionOfProject', () => {
  it('rend la mission dont opportunity_id est CE projet', () => {
    expect(missionOfProject('p-1', [mission({ id: 'm-0', opportunity_id: 'p-9' }), mission({})])).toEqual({
      id: 'm-1',
      label: 'Mission Roche — squad data',
    })
  })

  it('sait dire NON : une mission du même client mais d’un autre projet ne se rattache pas', () => {
    expect(missionOfProject('p-1', [mission({ opportunity_id: 'p-2' })])).toBeNull()
  })

  it('sait dire NON : mission sans projet d’origine, ou liste absente', () => {
    expect(missionOfProject('p-1', [mission({ opportunity_id: null })])).toBeNull()
    expect(missionOfProject('p-1', undefined)).toBeNull()
  })

  it('un libellé vide ne fait pas un lien', () => {
    expect(missionOfProject('p-1', [mission({ label: '  ' })])).toBeNull()
  })
})
