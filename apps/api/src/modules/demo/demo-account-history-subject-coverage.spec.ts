import type { UserActionEntity } from '../../database/entities/user-action.entity'
import { createMockRepository } from '../../database/test-utils'
import { AccountTimelineService } from '../accounts/account-timeline.service'
import { DEMO_USER_ACTIONS } from './demo-dataset'

/**
 * #3938.1 (lot I06) — « Marqué comme envoyé ne suffit pas, il faut voir ce
 * qu'on a envoyé » : la recette prod du 09/10 n'a pu le prouver faute de cas
 * (Sanofi n'a aucun e-mail ni aucune action ajoutée à la main).
 *
 * La salle démo porte le cas, en lecture seule : les gestes « Message copié »
 * de Société Générale et de SNCF. Aucun e-mail n'« part » d'une salle de démo
 * (voir `email_sent_at`, `demo-coverage.ts`) : la trace démontrable est la
 * copie, avec son OBJET réel. Ce test lit le vrai semis et le vrai service :
 * un objet retiré du semis, ou un fil qui cesse de le montrer, le fait échouer.
 */
describe('#3938.1 — l’historique d’un compte démo montre l’objet de ce qui a été préparé', () => {
  const copied = DEMO_USER_ACTIONS.filter(action => action.action_type === 'message_copied')

  it('chaque message copié du semis porte un objet non vide, jamais le corps', () => {
    expect(copied.length).toBeGreaterThanOrEqual(3)
    for (const action of copied) {
      const subject = action.metadata['subject']
      expect(typeof subject).toBe('string')
      expect((subject as string).trim().length).toBeGreaterThan(0)
      expect(action.metadata).not.toHaveProperty('body')
    }
  })

  it('le fil du compte rend cet objet sous « Message copié », pour Société Générale', async () => {
    const userActions = createMockRepository<UserActionEntity>()
    const sg = copied.filter(action => action.company === 'Société Générale')
    expect(sg.length).toBeGreaterThanOrEqual(1)
    userActions.find.mockResolvedValue(
      sg.map((action, index) => ({
        id: `demo-${index}`,
        created_at: new Date(Date.now() - action.hours_ago * 3_600_000),
        action_type: action.action_type,
        metadata: action.metadata,
        contact_id: null,
      })) as never,
    )
    const empty = createMockRepository<never>()
    empty.find.mockResolvedValue([])
    const accounts = createMockRepository<never>()
    accounts.findOne.mockResolvedValue({ id: 'acc-sg' })
    const service = new AccountTimelineService(
      accounts as never,
      userActions as never,
      empty as never,
      empty as never,
      empty as never,
    )
    const { events } = await service.forAccount('acc-sg', 'ws-demo')
    const details = events.map(event => event.detail)
    for (const action of sg) expect(details).toContain(action.metadata['subject'])
  })
})
