import type { RagZipIngestJobStatus, RagZipIngestReport } from '@bellum/contracts'

/** Entre deux relectures du statut — une archive prend de quelques secondes à quelques minutes. */
export const INGEST_ZIP_POLL_MS = 2000
/** Garde-fou : au-delà, le suivi s'arrête — l'archive continue côté serveur, jamais un faux échec. */
export const INGEST_ZIP_MAX_POLLS = 900

export class IngestZipInterruptedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'IngestZipInterruptedError'
  }
}

/**
 * #3623.11 / #3666.10 — `POST ingest/zip` rend un identifiant, plus le rapport :
 * on SUIT le statut jusqu'à son terme. `completed` / `partial` rendent le rapport
 * par entrée (même forme qu'avant : les appelants n'ont rien à changer) ;
 * `interrupted` lève avec la raison NOMMÉE du serveur ; `unknown` n'est jamais
 * deviné en succès.
 */
export async function followIngestZipJob(
  fetchStatus: () => Promise<RagZipIngestJobStatus>,
  options: {
    onStatus?: (status: RagZipIngestJobStatus) => void
    wait?: (ms: number) => Promise<void>
    maxPolls?: number
  } = {},
): Promise<RagZipIngestReport> {
  const wait = options.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const maxPolls = options.maxPolls ?? INGEST_ZIP_MAX_POLLS
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const status = await fetchStatus()
    options.onStatus?.(status)
    if (status.status === 'completed' || status.status === 'partial') {
      if (!status.report) throw new IngestZipInterruptedError('Le serveur n’a pas rendu le rapport de l’archive.')
      return status.report
    }
    if (status.status === 'interrupted') {
      throw new IngestZipInterruptedError(status.reason ?? 'L’import de l’archive a été interrompu.')
    }
    if (status.status === 'unknown') {
      throw new IngestZipInterruptedError('Cette archive n’est plus suivie par le serveur. Dépose-la de nouveau.')
    }
    await wait(INGEST_ZIP_POLL_MS)
  }
  throw new IngestZipInterruptedError('Le suivi de l’archive a expiré — elle continue peut-être côté serveur.')
}
