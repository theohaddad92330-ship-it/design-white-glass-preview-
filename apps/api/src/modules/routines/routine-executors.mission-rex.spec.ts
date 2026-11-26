import { RoutineExecutors } from './routine-executors'
import type { CapitalisationService } from '../capitalisation/capitalisation.service'

/**
 * #2398.5 (LAU-FINAL-112, MISSION/DELIVERY) — le rappel de retour de mission
 * (« REX ») manquant.
 *
 * `rexForWorkspace` existe déjà (`CapitalisationService`, onglet Preuves & REX
 * d'un compte) : il calcule « REX en attente » depuis les missions FINIES sans
 * retour. Cette routine ne fait que RAPPELER ce que ce service sait déjà — elle
 * ne collecte ni n'invente aucun retour (doctrine : jamais de donnée fictive).
 */
function executorOver(capitalisation: Partial<CapitalisationService>): RoutineExecutors {
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    capitalisation as CapitalisationService,
  )
}

const NOW = new Date('2026-02-10T09:00:00.000Z')

describe('rappel de REX en attente', () => {
  it('aucun espace de travail résolu : elle se tait et le dit', async () => {
    const outcome = await executorOver({}).run('mission_rex_reminder', 'u1', NOW, '')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('Aucun espace de travail résolu')
  })

  it('rien en attente : elle se tait, et le dit comme un fait mesuré', async () => {
    const outcome = await executorOver({
      rexForWorkspace: async () => ({ pending: [], collected: [] }),
    }).run('mission_rex_reminder', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toBe('Aucun retour de mission en attente.')
  })

  it('des retours en attente : elle notifie et NOMME la mission la plus ancienne', async () => {
    const outcome = await executorOver({
      rexForWorkspace: async () => ({
        pending: [
          {
            mission_id: 'm1',
            label: 'Mission A',
            account_id: 'a1',
            account_label: 'Compte A',
            ended_on: '2026-01-20T00:00:00.000Z',
          },
          {
            mission_id: 'm2',
            label: 'Mission B',
            account_id: 'a2',
            account_label: 'Compte B',
            ended_on: '2026-01-05T00:00:00.000Z',
          },
        ],
        collected: [],
      }),
    }).run('mission_rex_reminder', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(true)
    expect(outcome.outcome).toContain('2 retour')
    expect(outcome.notification?.body).toContain('Mission B')
    expect(outcome.notification?.link).toBe('/pilotage/rex')
  })

  it('une mission sans date de fin connue ne passe jamais devant une mission datée', async () => {
    const outcome = await executorOver({
      rexForWorkspace: async () => ({
        pending: [
          { mission_id: 'm1', label: 'Mission sans date', account_id: null, account_label: null, ended_on: null },
          {
            mission_id: 'm2',
            label: 'Mission datée',
            account_id: 'a2',
            account_label: 'Compte B',
            ended_on: '2026-01-05T00:00:00.000Z',
          },
        ],
        collected: [],
      }),
    }).run('mission_rex_reminder', 'u1', NOW, 'w1')
    expect(outcome.notification?.body).toContain('Mission datée')
  })
})
