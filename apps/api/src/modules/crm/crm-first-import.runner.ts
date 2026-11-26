import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  CRM_INCREMENTAL_SYNC,
  CRM_PROVIDER_READ_SCOPE,
  type CrmFirstImportObject,
  type CrmFirstImportObjectState,
  type CrmFirstImportState,
  type SyncEntityType,
  type SyncOutcome,
} from '@bellum/contracts'
import { CRM_FIRST_IMPORT_DEADLINE_MS, type CrmFirstImportJobData } from '../crm-first-import/crm-first-import.queue'
import {
  CRM_MIRROR_SYNC,
  type CrmMirrorEntity,
  type CrmMirrorSync,
  type CrmMirrorSyncResult,
} from '../crm-mirror/crm-mirror.port'
import { CrmImportService } from './crm-import.service'
import { CrmReadSyncService } from './crm-read-sync.service'
import { hubspotCompanySource, hubspotContactSource } from './crm-sources'
import { CrmService } from './crm.service'

/** Passages enchaînés par objet : la borne de volume (1 000 fiches par passage), pas de qualité. */
const MAX_PASSES = 20
const PASS_LIMIT = 1000

const PROVIDER_LABEL: Readonly<Record<string, string>> = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  pipedrive: 'Pipedrive',
  attio: 'Attio',
  odoo: 'Odoo',
  zoho: 'Zoho CRM',
}

/** Les fiches (comptes, contacts) se reprennent par le curseur ; le reste par le miroir. */
const RECORD_OBJECTS: ReadonlyArray<{ object: CrmFirstImportObject; entity: SyncEntityType }> = [
  { object: 'accounts', entity: 'account' },
  { object: 'contacts', entity: 'contact' },
]
const MIRROR_OBJECTS: ReadonlyArray<{ object: CrmFirstImportObject; entity: CrmMirrorEntity }> = [
  { object: 'deals', entity: 'deals' },
  { object: 'activities', entity: 'activities' },
  { object: 'owners', entity: 'owners' },
]

type ReportProgress = (state: CrmFirstImportState) => Promise<void>

/** Un jeton refusé ou périmé se dit « reconnecte <CRM> », jamais un échec muet. */
function isTokenFailure(message: string): boolean {
  return /token|jeton|unauthori[sz]ed|\b401\b|\b403\b|expir|reconnect|invalid_grant|session/i.test(message)
}

/**
 * SYNC-B — le travail du job « première reprise » : comptes puis contacts par la synchro réelle (ce qui pose
 * les curseurs et lève `first_import_pending`), puis affaires / activités / propriétaires par le miroir s'il
 * est fourni. Une correction humaine n'est jamais écrasée (l'écart est compté par `CrmImportService`) et
 * RIEN n'est écrit vers le CRM.
 */
@Injectable()
export class CrmFirstImportRunner {
  private readonly logger = new Logger(CrmFirstImportRunner.name)

  constructor(
    private readonly readSync: CrmReadSyncService,
    private readonly imports: CrmImportService,
    private readonly crm: CrmService,
    @Optional() @Inject(CRM_MIRROR_SYNC) private readonly mirror?: CrmMirrorSync,
  ) {}

  async run(
    data: CrmFirstImportJobData,
    report: ReportProgress,
    now: () => number = Date.now,
  ): Promise<CrmFirstImportState> {
    const { provider } = data
    const label = PROVIDER_LABEL[provider] ?? provider
    const scope = CRM_PROVIDER_READ_SCOPE[provider]
    const wanted: CrmFirstImportObject[] = [
      ...RECORD_OBJECTS.map(entry => entry.object).filter(object => scope.includes(object)),
      ...(this.mirror ? MIRROR_OBJECTS.map(entry => entry.object).filter(object => scope.includes(object)) : []),
    ]
    const objects: CrmFirstImportObjectState[] = wanted.map(object => ({
      object,
      status: 'pending',
      count: null,
      conflicts: null,
      truncated: false,
      error: null,
    }))
    const startedAt = new Date(now()).toISOString()
    const deadline = now() + CRM_FIRST_IMPORT_DEADLINE_MS
    let reconnectNeeded = false
    let message: string | null = null

    const snapshot = (state: CrmFirstImportState['state']): CrmFirstImportState => ({
      provider,
      state,
      startedAt,
      finishedAt: state === 'running' ? null : new Date(now()).toISOString(),
      message,
      reconnectNeeded,
      objects: objects.map(entry => ({ ...entry })),
    })
    const update = async (object: CrmFirstImportObject, patch: Partial<CrmFirstImportObjectState>) => {
      const entry = objects.find(candidate => candidate.object === object)
      if (entry) Object.assign(entry, patch)
      await report(snapshot('running'))
    }
    const fail = async (object: CrmFirstImportObject, error: unknown) => {
      const raw = error instanceof Error ? error.message : String(error)
      const token = isTokenFailure(raw)
      if (token) reconnectNeeded = true
      this.logger.warn(`Première reprise ${provider}/${object} non aboutie`, { error: raw })
      await update(object, {
        status: 'failed',
        error: token ? `Reconnecte ${label} : l’accès a expiré ou a été refusé.` : raw,
      })
    }

    await report(snapshot('running'))

    for (const { object, entity } of RECORD_OBJECTS) {
      if (!wanted.includes(object)) continue
      if (now() > deadline) {
        await update(object, { status: 'failed', error: 'Délai maximal dépassé : relance la reprise.' })
        message = 'La reprise a dépassé le délai maximal.'
        continue
      }
      await update(object, { status: 'running' })
      try {
        const totals = await this.importRecords(data, entity, deadline, now, async partial =>
          update(object, {
            count: partial.created + partial.recognized,
            created: partial.created,
            recognized: partial.recognized,
            conflicts: partial.conflicts,
          }),
        )
        await update(object, {
          status: totals.unavailable ? 'failed' : 'done',
          count: totals.created + totals.recognized,
          created: totals.created,
          recognized: totals.recognized,
          conflicts: totals.conflicts,
          truncated: totals.truncated,
          error: totals.unavailable,
        })
        if (totals.unavailable && isTokenFailure(totals.unavailable)) reconnectNeeded = true
      } catch (error) {
        await fail(object, error)
      }
    }

    if (this.mirror) {
      const mirrorObjects = MIRROR_OBJECTS.filter(entry => wanted.includes(entry.object))
      for (const { object } of mirrorObjects) await update(object, { status: 'running' })
      if (mirrorObjects.length > 0) {
        try {
          const result: CrmMirrorSyncResult = await this.mirror.syncProvider({
            workspaceId: data.workspaceId,
            provider,
            mode: 'full',
          })
          for (const { object, entity } of mirrorObjects) {
            const failure = result.errors.find(item => item.entity === entity)
            if (failure) await fail(object, new Error(failure.message))
            // #4290.15 — ni compte ni erreur : le miroir n'a pas lu (connexion introuvable…). Jamais « terminé à 0 ».
            else if (result.counts[entity] === undefined)
              await update(object, { status: 'failed', count: null, error: `${object} : non lu — relance la reprise.` })
            else await update(object, { status: 'done', count: result.counts[entity] ?? null })
          }
        } catch (error) {
          for (const { object } of mirrorObjects) await fail(object, error)
        }
      }
    }

    const failed = objects.filter(entry => entry.status === 'failed')
    if (failed.length > 0 && !message) {
      message = reconnectNeeded
        ? `Reconnecte ${label} pour terminer la reprise.`
        : `${failed.map(entry => entry.object).join(', ')} : lecture non aboutie.`
    }
    // Aucun objet repris du tout = échec ; une reprise partielle est « terminée » avec ses erreurs NOMMÉES.
    const state = failed.length === objects.length && objects.length > 0 ? 'failed' : 'done'
    const final = snapshot(state)
    await report(final)
    return final
  }

  /** Enchaîne les passages d'un objet jusqu'à la fin de la lecture (bornée) et cumule. */
  private async importRecords(
    data: CrmFirstImportJobData,
    entityType: SyncEntityType,
    deadline: number,
    now: () => number,
    onPass: (partial: { created: number; recognized: number; conflicts: number }) => Promise<void>,
  ): Promise<{
    created: number
    recognized: number
    conflicts: number
    truncated: boolean
    unavailable: string | null
  }> {
    const { provider, userId } = data
    // Attio (lecture non ordonnée) : un second passage relirait la même page — un seul, tronqué DIT.
    const resumable = provider !== 'hubspot' && (CRM_INCREMENTAL_SYNC[provider]?.ordered ?? false)
    let created = 0
    let recognized = 0
    let conflicts = 0
    let truncated = false
    for (let pass = 0; pass < (resumable ? MAX_PASSES : 1); pass++) {
      if (pass > 0 && now() > deadline) break
      const outcome = await this.pass(userId, provider, entityType, pass === 0)
      created += outcome.created
      // #4290.19 — une fiche déjà dans Bellum (lien externe) est RECONNUE, mise à jour ou inchangée : une reprise
      // rejouée sur une base déjà écrite ne recrée rien et ne dit plus « 0 ».
      recognized += outcome.updated + outcome.skipped.filter(skip => skip.reason === 'unchanged').length
      conflicts += outcome.conflicts ?? 0
      truncated = outcome.truncated
      await onPass({ created, recognized, conflicts })
      if (outcome.unavailable) return { created, recognized, conflicts, truncated, unavailable: outcome.unavailable }
      if (!outcome.truncated) break
    }
    return { created, recognized, conflicts, truncated, unavailable: null }
  }

  private pass(
    userId: string,
    provider: CrmFirstImportJobData['provider'],
    entityType: SyncEntityType,
    firstPass: boolean,
  ): Promise<SyncOutcome> {
    const input = { provider, entityType, dryRun: false, limit: PASS_LIMIT } as const
    // HubSpot garde ses sources dédiées (lecture vérifiée sur un portail réel), comme `POST /crm/import`.
    // #4290.15 — le premier passage d'une reprise ignore le curseur : l'existant est rattrapé.
    if (provider !== 'hubspot') return this.readSync.run(userId, input, firstPass ? { ignoreCursor: true } : undefined)
    return entityType === 'account'
      ? this.imports.importAccounts(userId, this.imports.assertSource(hubspotCompanySource(this.crm)), input)
      : this.imports.importContacts(userId, this.imports.assertSource(hubspotContactSource(this.crm)), input)
  }
}
