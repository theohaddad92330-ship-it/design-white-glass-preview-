import type { TimelineEvent, TimelineEventKind } from '@bellum/contracts'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * La timeline unifiée d'un compte (addendum final p59-60 — CRM-lite).
 *
 * Les objets existaient déjà, chacun avec son écran : les actions dans le
 * journal, les besoins dans l'écran Besoins, les exécutions dans le centre
 * d'actions. Ce qui manquait, c'est la seule vue qui répond à la question qu'un
 * commercial pose vraiment devant un compte : « qu'est-ce qui s'est passé ici,
 * dans l'ordre ? »
 *
 * Sans elle, reconstituer un historique demandait d'ouvrir trois écrans et de
 * recoller des dates de tête — et c'est exactement ce qu'on fait avant un
 * rendez-vous, au pire moment.
 *
 * Trois principes :
 *
 *   - **Aucune donnée nouvelle.** Le service ne produit rien : il fusionne ce que
 *     trois tables portent déjà. Un événement qui n'existe pas ailleurs n'apparaît
 *     pas ici.
 *   - **Une seule échelle de temps.** Tous les événements portent une date réelle.
 *     Une entrée sans date est ÉCARTÉE plutôt que placée « aujourd'hui » — la
 *     dater faussement casserait la seule chose que la vue promet, l'ordre.
 *   - **Le périmètre du lecteur.** Tout est scopé au workspace de l'appelant,
 *     comme partout ailleurs.
 */

// Le type vit dans `@bellum/contracts` : l'écran le lit de l'autre côté du fil,
// et deux déclarations homonymes divergeraient au premier champ ajouté.

/** Combien d'événements au plus. Une timeline n'est pas un export : au-delà,
 *  personne ne lit, et la requête devient chère sur un compte ancien. */
const TIMELINE_MAX = 200

@Injectable()
export class AccountTimelineService {
  private readonly logger = new Logger(AccountTimelineService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    @InjectRepository(ProjectEntity)
    private readonly opportunities: Repository<ProjectEntity>,
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activities: Repository<ActivityEntity>,
  ) {}

  /**
   * La timeline d'un compte, récent d'abord.
   *
   * Les trois lectures sont parallèles et INDÉPENDANTES : si l'une échoue, les
   * autres remontent quand même. Une timeline partielle et datée vaut mieux
   * qu'une page d'erreur — c'est la vue qu'on ouvre avant un rendez-vous.
   */
  async forAccount(accountId: string, workspaceId: string): Promise<{ events: TimelineEvent[] }> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: ['id'],
    })
    if (!account) throw new NotFoundException('Compte introuvable dans votre espace de travail.')

    const [actions, opportunities, runs, lookups] = await Promise.all([
      this.safe(() => this.actionEvents(accountId, workspaceId), 'actions'),
      this.safe(() => this.opportunityEvents(accountId), 'opportunities'),
      this.safe(() => this.workflowEvents(accountId, workspaceId), 'workflows'),
      this.safe(() => this.crmLookupEvents(accountId, workspaceId), 'crm_lookups'),
    ])

    const events = [...actions, ...opportunities, ...runs, ...lookups]
      // Tri sur la date RÉELLE, décroissant. C'est la seule chose que la vue
      // promet, et c'est ce qui la rend utilisable avant un rendez-vous.
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, TIMELINE_MAX)
    return { events }
  }

  /** Les gestes du commercial et les événements système, depuis le journal. */
  private async actionEvents(accountId: string, workspaceId: string): Promise<TimelineEvent[]> {
    const rows = await this.userActions.find({
      where: { account_id: accountId, workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: TIMELINE_MAX,
    })
    return rows.flatMap(row => {
      const at = isoOrNull(row.created_at)
      if (!at) return []
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      return [
        {
          id: `action:${row.id}`,
          kind: 'action' as const,
          at,
          label: text(metadata['label']) ?? row.action_type,
          // #3416.4b — le libellé anglais déjà stocké au journal, quand il existe.
          ...labelEnOf(metadata),
          // #3938.1 — « marqué comme envoyé ne suffit pas, il faut voir ce
          // qu'on a envoyé » (SKAIZen, 22/09). `recordEmailSent` stocke le
          // SUJET depuis #3699.5 — jamais le corps, qui reste hors de ce
          // journal — et il n'atteignait jamais l'écran : repli sur `subject`
          // seulement quand le journal ne porte pas de `detail` explicite.
          detail: text(metadata['detail']) ?? text(metadata['subject']),
          type: row.action_type,
          contactId: row.contact_id,
          // #2117.24 — seulement pour un changement de statut commercial :
          // les autres événements gardent exactement leur forme d'avant.
          ...transitionOf(row.action_type, metadata),
        },
      ]
    })
  }

  /**
   * Les besoins et signaux, à leur date de PREMIÈRE détection.
   *
   * Pas à `updated_at` : une opportunité re-touchée hier remonterait en tête et
   * ferait croire à un fait nouveau. La timeline raconte quand les choses sont
   * ARRIVÉES.
   */
  private async opportunityEvents(accountId: string): Promise<TimelineEvent[]> {
    const rows = await this.opportunities.find({
      where: { account_id: accountId },
      order: { first_detected_at: 'DESC' },
      take: TIMELINE_MAX,
    })
    return rows.flatMap(row => {
      const at = isoOrNull(row.first_detected_at)
      if (!at) return []
      return [
        {
          id: `opportunity:${row.id}`,
          kind: 'opportunity' as const,
          at,
          label: row.label,
          detail: row.detail ?? null,
          // L'ÉTAPE plutôt que la nature brute : c'est ce qui rend la
          // progression lisible dans le fil. Depuis le pivot Projet elle se lit
          // directement sur la ligne — la traduction « cycle stocké → stade
          // affiché » a disparu avec le second vocabulaire qui la rendait
          // nécessaire.
          type: row.stage,
          contactId: null,
        },
      ]
    })
  }

  /** Les exécutions gouvernées, à leur date de fin — ou de création si elles
   *  n'ont pas encore fini (un run en cours est un événement de la timeline). */
  private async workflowEvents(accountId: string, workspaceId: string): Promise<TimelineEvent[]> {
    const rows = await this.runs.find({
      where: { account_id: accountId, workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: TIMELINE_MAX,
    })
    return rows.flatMap(row => {
      const at = isoOrNull(row.finished_at) ?? isoOrNull(row.created_at)
      if (!at) return []
      const steps = row.steps ?? []
      const done = steps.filter(step => step.outcome === 'done').length
      return [
        {
          id: `workflow:${row.id}`,
          kind: 'workflow' as const,
          at,
          label: row.definition_key,
          // #3532 — aucune phrase française figée ici : le compteur voyage
          // STRUCTURÉ (l'écran le traduit FR/EN) et il est absent — jamais
          // « 0/0 » — quand l'exécution n'a aucune étape.
          detail: null,
          steps: steps.length > 0 ? { done, total: steps.length } : null,
          type: row.status,
          contactId: row.contact_id,
        },
      ]
    })
  }

  /**
   * #3505 — « Laura a consulté ton CRM » : le GESTE de lecture, un par consultation.
   *
   * `ActivitiesService.recordCrmLookup` l'écrit dans `activities` (`kind: 'crm_lookup'`) ; ni le
   * journal d'actions ni les exécutions ne le portent, d'où l'absence en prod comme en démo. Le
   * libellé voyage comme un CODE (`label === type`) : l'écran le traduit FR/EN, et le regroupe
   * (`collapseTimelineEvents`) en une ligne « × N » par jour. Jamais le corps : il n'y en a pas.
   */
  private async crmLookupEvents(accountId: string, workspaceId: string): Promise<TimelineEvent[]> {
    const rows = await this.activities.find({
      where: { account_id: accountId, workspace_id: workspaceId, kind: 'crm_lookup' },
      order: { occurred_at: 'DESC' },
      take: TIMELINE_MAX,
    })
    return rows.flatMap(row => {
      const at = isoOrNull(row.occurred_at)
      if (!at) return []
      return [
        {
          id: `activity:${row.id}`,
          kind: 'action' as const,
          at,
          label: 'crm_lookup',
          detail: null,
          type: 'crm_lookup',
          contactId: row.contact_id,
        },
      ]
    })
  }

  /**
   * Exécute une lecture en avalant son échec.
   *
   * Best-effort par contrat : la timeline s'ouvre avant un rendez-vous, et une
   * source indisponible ne doit pas la remplacer par une page d'erreur. Le trou
   * est journalisé — pas masqué pour l'exploitation, seulement pour le lecteur.
   */
  private async safe(read: () => Promise<TimelineEvent[]>, source: string): Promise<TimelineEvent[]> {
    try {
      return await read()
    } catch (error) {
      this.logger.warn('Timeline : source indisponible', {
        error: error instanceof Error ? error.message : String(error),
        tags: { 'timeline.source': source },
      })
      return []
    }
  }
}

/** Chaîne non vide, ou `null` — jamais « undefined » interpolé dans un libellé. */
function labelEnOf(metadata: Record<string, unknown>): { labelEn?: string } {
  const labelEn = text(metadata['label_en'])
  return labelEn ? { labelEn } : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** ISO-8601 d'une date réelle, ou `null`. Une date illisible ne devient JAMAIS
 *  maintenant : la dater faussement casserait l'ordre, seule promesse de la vue. */
function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export { WorkspaceContextService }

/**
 * #2117.24 — la transition d'un changement de statut commercial, lue dans ses
 * métadonnées. Rien pour tout autre type : la clé n'apparaît pas du tout.
 */
function transitionOf(
  type: string,
  metadata: Record<string, unknown>,
): { transition?: { from: string | null; to: string } } {
  if (type !== 'commercial_status_changed') return {}
  const to = text(metadata['to'])
  return to ? { transition: { from: text(metadata['from']), to } } : {}
}
