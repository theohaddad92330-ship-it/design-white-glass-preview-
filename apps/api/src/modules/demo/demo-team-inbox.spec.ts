import { TEAM_NOTIFICATION_TYPES } from '@bellum/contracts'
import { DEMO_COLLEAGUES } from './demo-dataset'
import { buildDemoTeamInboxRows } from './demo-team-inbox'

const ACCOUNTS = new Map([
  ['SNCF', 'acc-sncf'],
  ['Société Générale', 'acc-sg'],
  ['Groupe BPCE', 'acc-bpce'],
])

// #4158.14 — la boîte d'équipe de la salle de démonstration (craft rule n°9).
describe('buildDemoTeamInboxRows', () => {
  it('montre les trois gestes de collègue : assignation, délégation, mention', () => {
    const types = new Set(buildDemoTeamInboxRows(ACCOUNTS).map(row => row.type))
    expect(types).toEqual(new Set(['account_assigned', 'action_delegated', 'team_mention']))
    for (const type of types) expect(TEAM_NOTIFICATION_TYPES).toContain(type)
  })

  it('laisse du non lu (le compteur de la cloche se voit) ET du lu', () => {
    const rows = buildDemoTeamInboxRows(ACCOUNTS)
    expect(rows.some(row => !row.read)).toBe(true)
    expect(rows.some(row => row.read)).toBe(true)
  })

  it('chaque auteur est un collègue fictif nommé en clair dans le titre', () => {
    for (const row of buildDemoTeamInboxRows(ACCOUNTS)) {
      const author = DEMO_COLLEAGUES.find(colleague => colleague.userId === row.actorUserId)
      expect(author).toBeDefined()
      expect(row.title).toContain(`${author!.first_name} ${author!.last_name}`)
    }
  })

  it('un lien n’est écrit que vers un compte qui existe dans la salle — jamais deviné', () => {
    const rows = buildDemoTeamInboxRows(new Map([['SNCF', 'acc-sncf']]))
    const assignedBpce = rows.find(row => row.title.includes('Groupe BPCE'))
    expect(assignedBpce?.link).toBeNull()
    expect(rows.find(row => row.title.includes('SNCF'))?.link).toBe('/accounts/acc-sncf')
  })
})
