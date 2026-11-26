import { INTEGRATION_SYNC_JOB_OPTIONS, integrationSyncJobId } from './integration-sync.queue'

// #4591 — BullMQ IGNORE un `add` dont le jobId existe déjà, même terminé (les jobs restent 24 h / 7 j dans Redis).
// Avec un jobId (espace + connecteur) seul, la deuxième synchro d'un connecteur n'était jamais enfilée : son run
// restait « En attente… » pour toujours. Le jobId porte donc le run.
describe('integrationSyncJobId (#4591)', () => {
  it('deux runs du même connecteur dans le même espace ne partagent JAMAIS leur jobId', () => {
    expect(integrationSyncJobId('ws-1', 'pipedrive', 'run-1')).not.toBe(
      integrationSyncJobId('ws-1', 'pipedrive', 'run-2'),
    )
  })

  it('ne contient aucun « : » (séparateur de clés Redis de BullMQ)', () => {
    expect(integrationSyncJobId('ws-1', 'pipedrive', 'run-1')).not.toContain(':')
  })

  it('les jobs terminés sont bien conservés (la clé ne peut donc plus faire garde à elle seule)', () => {
    expect(INTEGRATION_SYNC_JOB_OPTIONS.removeOnComplete).toBeDefined()
  })
})
