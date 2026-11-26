import { NotificationsScheduler } from './notifications.scheduler'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'

/**
 * Les deux digests périodiques consultent la liste d'opt-out.
 *
 * Ils ne le faisaient pas : `sendNotificationEmail` part sans filtre, et le
 * transport ne rattrape rien (`mailer.service.ts` le dit — « the caller checks
 * the suppression list BEFORE calling this »). Un utilisateur désabonné
 * continuait donc de recevoir son résumé hebdomadaire et son digest de relances
 * en retard, alors que les digests de VEILLE, eux, le respectaient depuis #394.
 *
 * Deux règles portent la correction, et elles sont volontairement différentes :
 *  - seul l'E-MAIL est filtré ; la notification in-app reste délivrée, parce que
 *    se désabonner du courrier n'est pas renoncer à une fonction du produit ;
 *  - en échec de LECTURE de la liste, on envoie. Un opt-out raté se répare d'un
 *    clic ; taire par erreur les échéances de quelqu'un ne se voit pas.
 */
describe('NotificationsScheduler — liste d’opt-out sur les digests périodiques', () => {
  let prefs: MockRepository<NotificationPreferenceEntity>
  let accounts: MockRepository<AccountEntity>
  let profiles: MockRepository<ProfileEntity>
  let planItems: MockRepository<ActionPlanItemEntity>
  let notifications: { createNotification: jest.Mock }
  let mailer: { sendNotificationEmail: jest.Mock }
  let suppression: { isSuppressedForUser: jest.Mock }

  const overdue = (): ActionPlanItemEntity =>
    ({
      id: 'overdue',
      user_id: 'u1',
      account_id: 'acc-1',
      label: 'Relancer Marc',
      done: false,
      due_date: '2020-01-01',
      last_reminded_on: null,
    }) as ActionPlanItemEntity

  const build = () =>
    new NotificationsScheduler(
      prefs as never,
      accounts as never,
      profiles as never,
      planItems as never,
      notifications as never,
      mailer as never,
      { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) } as never,
      { run: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }) } as never,
      undefined as never,
      suppression as never,
    )

  beforeEach(() => {
    prefs = createMockRepository<NotificationPreferenceEntity>()
    accounts = createMockRepository<AccountEntity>()
    profiles = createMockRepository<ProfileEntity>()
    planItems = createMockRepository<ActionPlanItemEntity>()
    notifications = { createNotification: jest.fn().mockResolvedValue(undefined) }
    mailer = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) }
    suppression = { isSuppressedForUser: jest.fn().mockResolvedValue(false) }
    accounts.findOne.mockResolvedValue({ company_name: 'Doctolib' } as AccountEntity)
    profiles.findOne.mockResolvedValue({ email: 'rep@esn.fr' } as ProfileEntity)
  })

  describe('digest des relances en retard', () => {
    it('n’envoie AUCUN e-mail à une adresse désabonnée', async () => {
      suppression.isSuppressedForUser.mockResolvedValue(true)
      planItems.find.mockResolvedValueOnce([overdue()])

      await build().sendRelanceRemindersForUser('u1')

      expect(mailer.sendNotificationEmail).not.toHaveBeenCalled()
      expect(suppression.isSuppressedForUser).toHaveBeenCalledWith('u1', 'rep@esn.fr')
    })

    it('délivre quand même la notification in-app — le désabonnement porte sur le courrier, pas sur le produit', async () => {
      suppression.isSuppressedForUser.mockResolvedValue(true)
      planItems.find.mockResolvedValueOnce([overdue()])

      const count = await build().sendRelanceRemindersForUser('u1')

      expect(count).toBe(1)
      expect(notifications.createNotification).toHaveBeenCalledTimes(1)
    })

    it('envoie normalement quand l’adresse n’est pas désabonnée', async () => {
      planItems.find.mockResolvedValueOnce([overdue()])

      await build().sendRelanceRemindersForUser('u1')

      expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
      expect(mailer.sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rep@esn.fr' }))
    })

    it('envoie quand la LECTURE de la liste échoue — un opt-out raté se répare, une échéance manquée ne se voit pas', async () => {
      suppression.isSuppressedForUser.mockRejectedValue(new Error('pg down'))
      planItems.find.mockResolvedValueOnce([overdue()])

      await build().sendRelanceRemindersForUser('u1')

      expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
    })

    it('garde le comportement d’avant quand la liste n’est pas câblée — on n’invente pas un désabonnement', async () => {
      planItems.find.mockResolvedValueOnce([overdue()])
      const withoutSuppression = new NotificationsScheduler(
        prefs as never,
        accounts as never,
        profiles as never,
        planItems as never,
        notifications as never,
        mailer as never,
        { run: jest.fn() } as never,
        { run: jest.fn() } as never,
      )

      await withoutSuppression.sendRelanceRemindersForUser('u1')

      expect(mailer.sendNotificationEmail).toHaveBeenCalledTimes(1)
    })
  })
})
