import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ACCOUNT_FIELD_COLUMNS } from '../crm-core/record-fields'
import {
  ANALYSIS_ACCOUNT_FACTS_SOURCE,
  PREVIOUS_ANALYSIS_FIELDS,
  analysisFactsWire,
  knownContactsFromMissions,
  renderPreviousAnalysis,
  type AnalysisAccountFact,
  type AnalysisAccountFactsSource,
  type AnalysisKnownContact,
} from './analysis-facts-inputs'

const MISSIONS_READ_MAX = 100

type RunScope = { workspaceId: string; accountId: string; userId: string }

/**
 * #4070 — LES LECTURES QUE LE LANCEMENT D'UNE ANALYSE AJOUTE AU JOB.
 *
 * Quatre intrants, tous BEST-EFFORT : une lecture qui échoue est journalisée et
 * le lancement part SANS elle — un dossier payé ne tombe jamais pour un
 * enrichissement, et une famille en panne n'en efface pas une autre. Chaque
 * méthode rend `undefined` / `[]` quand il n'y a rien : la clé est alors omise
 * du job et du wire, le run est byte-identique à avant le lot.
 *
 *  - {@link accountFacts} : les faits du socle (#4069.1) par le jeton
 *    {@link ANALYSIS_ACCOUNT_FACTS_SOURCE} — le lecteur UNIQUE, jamais un
 *    second (GA-07 : ce service ne connaît pas `AccountFactsService`) ;
 *  - {@link missionContacts} : les interlocuteurs de missions passées (.3) ;
 *  - {@link previousAnalysis} : l'analyse précédente et ses corrections
 *    humaines (.4) — la correction gagne toujours, côté IA.
 *
 * Cloisonnement : CHAQUE requête porte `workspace_id = $1` ET le compte.
 */
@Injectable()
export class AnalysisFactsInputsService {
  private readonly logger = new Logger(AnalysisFactsInputsService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @Optional()
    @InjectRepository(FieldProvenanceEntity)
    private readonly provenance?: Repository<FieldProvenanceEntity>,
    @Optional() @Inject(ANALYSIS_ACCOUNT_FACTS_SOURCE) private readonly source?: AnalysisAccountFactsSource,
    // Les interlocuteurs de missions passées se lisent par les ENTITÉS (GA-405 : aucune lecture
    // brute de `contacts` de plus) — d'abord les missions du compte, puis les contacts désignés.
    @Optional() @InjectRepository(MissionEntity) private readonly missions?: Repository<MissionEntity>,
    @Optional() @InjectRepository(ContactEntity) private readonly contacts?: Repository<ContactEntity>,
  ) {}

  async accountFacts(args: RunScope): Promise<{ accountFacts?: AnalysisAccountFact[]; lostDealRex?: string }> {
    if (!this.source) return {}
    const [facts, lostDealRex] = await Promise.all([
      this.source.facts(args).catch(error => this.skipped('faits du compte', error, null)),
      this.source
        .lostDealRex({ workspaceId: args.workspaceId, accountId: args.accountId })
        .catch(error => this.skipped('motifs de perte', error, null)),
    ])
    const wire = facts ? analysisFactsWire(facts) : []
    return {
      ...(wire.length > 0 ? { accountFacts: wire } : {}),
      ...(lostDealRex ? { lostDealRex } : {}),
    }
  }

  /** Le contact chez le client qui encadre le consultant ou valide le relevé, par mission. */
  async missionContacts(args: RunScope): Promise<AnalysisKnownContact[]> {
    if (!this.missions || !this.contacts) return []
    try {
      const missions = await this.missions.find({
        where: { workspace_id: args.workspaceId, account_id: args.accountId },
        select: ['id', 'client_manager_contact_id', 'cra_contact_id', 'started_on', 'created_at'],
        order: { created_at: 'DESC' },
        take: MISSIONS_READ_MAX,
      })
      // La mission la plus récente d'un contact le date : on garde la première rencontrée (tri décroissant).
      const dated = new Map<string, Pick<MissionEntity, 'started_on' | 'created_at'>>()
      for (const mission of missions) {
        for (const id of [mission.client_manager_contact_id, mission.cra_contact_id]) {
          if (id && !dated.has(id)) dated.set(id, mission)
        }
      }
      if (dated.size === 0) return []
      const people = await this.contacts.find({
        where: { id: In([...dated.keys()]), workspace_id: args.workspaceId },
        select: ['id', 'full_name', 'title'],
      })
      return knownContactsFromMissions(
        people.map(person => ({
          full_name: person.full_name,
          title: person.title,
          started_on: dated.get(person.id)?.started_on ?? null,
          created_at: dated.get(person.id)?.created_at ?? null,
        })),
      )
    } catch (error) {
      return this.skipped('interlocuteurs de missions', error, [])
    }
  }

  /** `undefined` = première analyse, ou rien de lisible : aucun bloc. */
  async previousAnalysis(args: RunScope & { now?: Date }): Promise<string | undefined> {
    try {
      const columns = PREVIOUS_ANALYSIS_FIELDS.map(
        key => ACCOUNT_FIELD_COLUMNS[key as keyof typeof ACCOUNT_FIELD_COLUMNS],
      )
      const account = await this.accounts.findOne({
        where: { id: args.accountId, workspace_id: args.workspaceId },
        select: ['id', 'raw_analysis', ...columns] as (keyof AccountEntity)[],
      })
      if (!account) return undefined
      const row = account as unknown as Record<string, unknown>
      const raw = (row['raw_analysis'] ?? {}) as Record<string, unknown>

      const human = new Map<string, Date | string | null>()
      if (this.provenance) {
        const rows = await this.provenance.find({ where: { entity_type: 'account', entity_id: args.accountId } })
        for (const p of rows) if (p.source === 'human') human.set(p.field, p.observed_at ?? null)
      }

      const [latest] = await this.accounts.manager.query<Array<{ at: Date | string | null }>>(
        // « Terminée » seulement : un run en vol n'a rien analysé, et `created_at` n'est pas une analyse.
        `SELECT MAX(completed_at) AS at FROM analysis_runs WHERE account_id = $1 AND status = 'completed'`,
        [args.accountId],
      )

      const angles = Array.isArray(raw['angles'])
        ? (raw['angles'] as unknown[]).flatMap(a =>
            typeof a === 'string'
              ? [a]
              : a && typeof a === 'object'
                ? [String((a as { angle?: unknown }).angle ?? '')]
                : [],
          )
        : []
      const text = renderPreviousAnalysis(
        {
          analyzedAt: latest?.at ?? null,
          businessDescription: typeof raw['businessDescription'] === 'string' ? raw['businessDescription'] : null,
          angles,
          fields: PREVIOUS_ANALYSIS_FIELDS.map(key => {
            const value = row[ACCOUNT_FIELD_COLUMNS[key as keyof typeof ACCOUNT_FIELD_COLUMNS]]
            return {
              key,
              value: value === null || value === undefined ? null : String(value),
              humanCorrectedAt: human.has(key) ? (human.get(key) ?? null) : null,
            }
          }),
        },
        args.now,
      )
      return text ?? undefined
    } catch (error) {
      return this.skipped('analyse précédente', error, undefined)
    }
  }

  private skipped<T>(what: string, error: unknown, fallback: T): T {
    this.logger.warn(`Lecture « ${what} » impossible — le run part sans`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}
