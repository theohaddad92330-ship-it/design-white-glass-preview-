import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DEFAULT_PARK_REASONS,
  DEFAULT_UNSTAFFABLE_REASONS,
  DEFAULT_STAGE_LABELS,
  EDITABLE_CATALOGUES,
  PIPELINE_STAGES,
  SUBMISSION_OUTCOME_REASONS,
  catalogueDeletion,
  type Catalogue,
  type CatalogueKey,
  type CatalogueValue,
} from '@bellum/contracts'
import { AccountParkReasonEntity } from '../../database/entities/account-park-reason.entity'
import { LossReasonEntity } from '../../database/entities/loss-reason.entity'
import { NeedUnstaffableReasonEntity } from '../../database/entities/need-unstaffable-reason.entity'
import { skillReferential } from '../consultants/skill-referential'

/**
 * Ce qu'une ligne de catalogue éditable porte, dans les trois tables.
 *
 * Les trois entités ont chacune leurs colonnes ; celles-ci sont les seules que
 * l'ajout et le retrait lisent ou écrivent. Le jour où l'une des trois perdrait
 * `archived`, le compilateur le dirait ici — ce qu'un `as never` ne pouvait pas
 * faire.
 */
type CatalogueRow = {
  id: string
  workspace_id: string
  label: string
  archived: boolean
  created_at: Date
}

/**
 * Les huit catalogues d'un espace (PDF 2 §11.3, ticket BEL-CRM-105).
 *
 * L'usage est compté PAR VALEUR, dans la même requête que la lecture. Sans ce
 * chiffre, désactiver revient à tirer au sort : personne ne sait si
 * « concurrent installé » sert deux fois ou deux cents.
 *
 * Le comptage passe par du SQL brut plutôt que par les dépôts des autres
 * domaines : compter des projets perdus n'est pas une raison d'aller chercher
 * le service des projets (règle §3.2), et une jointure de comptage n'a pas
 * besoin d'entités.
 */
@Injectable()
export class CataloguesService {
  private readonly logger = new Logger(CataloguesService.name)

  constructor(
    @InjectRepository(LossReasonEntity)
    private readonly lossReasons: Repository<LossReasonEntity>,
    @InjectRepository(AccountParkReasonEntity)
    private readonly parkReasons: Repository<AccountParkReasonEntity>,
    @InjectRepository(NeedUnstaffableReasonEntity)
    private readonly unstaffableReasons: Repository<NeedUnstaffableReasonEntity>,
  ) {}

  async list(workspaceId: string, locale: 'fr' | 'en'): Promise<{ items: Catalogue[] }> {
    // Chaque bloc est lu SÉPARÉMENT et TOLÉRAMMENT. Un `Promise.all` de six
    // requêtes fait tomber la réponse entière dès que l'une jette — c'est ce
    // qui a rendu tout l'écran vide en production sur une seule colonne mal
    // nommée. Une source illisible rend un catalogue vide ; les cinq autres
    // s'affichent. Même règle que la couche zéro : une analyse ne tombe jamais
    // parce qu'une source était indisponible.
    const [loss, park, unstaffable, stages, outcomes, offers] = await Promise.all([
      this.safely('loss_reasons', workspaceId, () => this.lossReasonValues(workspaceId)),
      this.safely('account_park_reasons', workspaceId, () => this.parkReasonValues(workspaceId)),
      this.safely('need_unstaffable_reasons', workspaceId, () => this.unstaffableValues(workspaceId)),
      this.safely('pipeline_stage_labels', workspaceId, () => this.stageLabelValues(workspaceId, locale)),
      this.safely('submission_outcome_reasons', workspaceId, () => this.outcomeReasonValues(workspaceId)),
      this.safely('offers', workspaceId, () => this.offerValues(workspaceId)),
    ])

    return {
      items: [
        { key: 'loss_reasons', editable: 'editable', values: loss },
        { key: 'account_park_reasons', editable: 'editable', values: park },
        { key: 'need_unstaffable_reasons', editable: 'editable', values: unstaffable },
        // Les libellés d'étapes se RENOMMENT (endpoint dédié) mais la liste ne
        // s'allonge pas : le nombre, l'ordre et le caractère gagnant/perdant des
        // cinq étapes sont figés (arbitrage n°6 du 16/08).
        { key: 'pipeline_stage_labels', editable: 'closed', values: stages },
        { key: 'submission_outcome_reasons', editable: 'closed', values: outcomes },
        { key: 'normalised_skills', editable: 'closed', values: this.skillValues() },
        { key: 'offers', editable: 'closed', values: offers },
        // Les champs personnalisés ont leur propre écran, avec leur borne de dix.
        // Les recopier ici en donnerait deux vérités.
        { key: 'custom_fields', editable: 'closed', values: [] },
      ],
    }
  }

  /** Lit un bloc sans laisser son échec emporter l'écran. Le warning porte le
   *  NOM du catalogue : « l'écran est vide » ne désigne aucune requête. */
  private async safely(
    key: CatalogueKey,
    workspaceId: string,
    read: () => Promise<CatalogueValue[]>,
  ): Promise<CatalogueValue[]> {
    try {
      return await read()
    } catch (cause) {
      this.logger.warn(`catalogue ${key} illisible`, { error: cause, workspaceId })
      return []
    }
  }

  async add(workspaceId: string, key: CatalogueKey, label: string): Promise<CatalogueValue> {
    const repo = this.repoFor(key)
    const trimmed = label.trim()
    const clash = await repo
      .createQueryBuilder('value')
      .where('value.workspace_id = :workspaceId', { workspaceId })
      .andWhere('lower(value.label) = lower(:label)', { label: trimmed })
      .getOne()
    // Deux valeurs du même nom rendraient le compteur d'usage faux des deux
    // côtés, et le sélecteur illisible.
    if (clash) throw new BadRequestException('Cette valeur existe déjà dans ce catalogue.')

    const saved = await repo.save(repo.create({ workspace_id: workspaceId, label: trimmed, archived: false }))
    return { id: saved.id, label: saved.label, usage: 0, archived: false }
  }

  /**
   * Retire une valeur : SUPPRIMÉE si personne ne l'utilise, DÉSACTIVÉE sinon.
   *
   * La décision est prise par une fonction pure et la réponse dit laquelle des
   * deux a eu lieu — l'utilisateur qui a cliqué « supprimer » et qui voit la
   * valeur rester doit comprendre pourquoi, sinon il reclique.
   */
  async remove(workspaceId: string, key: CatalogueKey, id: string): Promise<{ outcome: 'delete' | 'archive' }> {
    const repo = this.repoFor(key)
    const row = await repo.findOne({ where: { id, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Valeur introuvable dans cet espace.')

    const usage = await this.usageOf(workspaceId, key, row.label)
    const outcome = catalogueDeletion({ usage })
    if (outcome === 'delete') await repo.delete({ id })
    else await repo.update({ id }, { archived: true })
    return { outcome }
  }

  /**
   * Le dépôt du catalogue demandé, vu par ce que les deux gestes d'écriture
   * ci-dessus touchent RÉELLEMENT — et rien de plus.
   *
   * Le type de retour était `Repository<A | B | C>`, qui n'accepte aucun des
   * trois : un dépôt TypeORM n'est pas covariant dans son entité, et les trois
   * ne sont pas la même (`loss_reasons` porte un `sort_order` que les deux
   * autres n'ont pas). D'où les trois `as never` — qui éteignaient au passage
   * le typage de tout ce que l'appelant fait du dépôt, `repo.create({ … })`
   * compris. Nommer la forme COMMUNE dit la même chose et la garde vérifiable.
   */
  private repoFor(key: CatalogueKey): Repository<CatalogueRow> {
    if (!EDITABLE_CATALOGUES.includes(key)) {
      throw new BadRequestException('Ce catalogue n’est pas éditable depuis cet espace.')
    }
    if (key === 'loss_reasons') return this.lossReasons
    if (key === 'account_park_reasons') return this.parkReasons
    return this.unstaffableReasons
  }

  private async usageOf(workspaceId: string, key: CatalogueKey, label: string): Promise<number> {
    const [{ count }] = await this.countQuery(workspaceId, key, label)
    return Number(count ?? 0)
  }

  private countQuery(workspaceId: string, key: CatalogueKey, label: string): Promise<{ count: string }[]> {
    const manager = this.lossReasons.manager
    if (key === 'loss_reasons') {
      return manager.query(
        `SELECT COUNT(*)::text AS count FROM opportunities WHERE workspace_id = $1 AND lower(loss_reason) = lower($2)`,
        [workspaceId, label],
      )
    }
    if (key === 'account_park_reasons') {
      return manager.query(
        `SELECT COUNT(*)::text AS count FROM accounts WHERE workspace_id = $1 AND lower(gate_reason) = lower($2)`,
        [workspaceId, label],
      )
    }
    return manager.query(
      `SELECT COUNT(*)::text AS count FROM project_needs WHERE workspace_id = $1 AND lower(staffable_reason) = lower($2)`,
      [workspaceId, label],
    )
  }

  private async lossReasonValues(workspaceId: string): Promise<CatalogueValue[]> {
    const rows = await this.lossReasons.find({ where: { workspace_id: workspaceId }, order: { created_at: 'ASC' } })
    const counts = await this.lossReasons.manager.query<{ label: string; count: string }[]>(
      `SELECT lower(loss_reason) AS label, COUNT(*)::text AS count
         FROM opportunities WHERE workspace_id = $1 AND loss_reason IS NOT NULL
        GROUP BY lower(loss_reason)`,
      [workspaceId],
    )
    return this.merge(rows, counts)
  }

  private async parkReasonValues(workspaceId: string): Promise<CatalogueValue[]> {
    const rows = await this.parkReasons.find({ where: { workspace_id: workspaceId }, order: { created_at: 'ASC' } })
    const counts = await this.parkReasons.manager.query<{ label: string; count: string }[]>(
      `SELECT lower(gate_reason) AS label, COUNT(*)::text AS count
         FROM accounts WHERE workspace_id = $1 AND gate_reason IS NOT NULL
        GROUP BY lower(gate_reason)`,
      [workspaceId],
    )
    return this.merge(rows, counts)
  }

  private async unstaffableValues(workspaceId: string): Promise<CatalogueValue[]> {
    const rows = await this.unstaffableReasons.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'ASC' },
    })
    const counts = await this.unstaffableReasons.manager.query<{ label: string; count: string }[]>(
      `SELECT lower(staffable_reason) AS label, COUNT(*)::text AS count
         FROM project_needs WHERE workspace_id = $1 AND staffable_reason IS NOT NULL
        GROUP BY lower(staffable_reason)`,
      [workspaceId],
    )
    return this.merge(rows, counts)
  }

  private merge(
    rows: { id: string; label: string; archived: boolean }[],
    counts: { label: string; count: string }[],
  ): CatalogueValue[] {
    const byLabel = new Map(counts.map(row => [row.label, Number(row.count)]))
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      usage: byLabel.get(row.label.toLowerCase()) ?? 0,
      archived: row.archived,
    }))
  }

  private async stageLabelValues(workspaceId: string, locale: 'fr' | 'en'): Promise<CatalogueValue[]> {
    const renamed = await this.lossReasons.manager.query<{ stage: string; label: string }[]>(
      `SELECT stage, label FROM pipeline_stage_labels WHERE workspace_id = $1`,
      [workspaceId],
    )
    const overrides = new Map(renamed.map(row => [row.stage, row.label]))
    const counts = await this.lossReasons.manager.query<{ stage: string; count: string }[]>(
      `SELECT stage, COUNT(*)::text AS count FROM opportunities WHERE workspace_id = $1 GROUP BY stage`,
      [workspaceId],
    )
    const byStage = new Map(counts.map(row => [row.stage, Number(row.count)]))
    return PIPELINE_STAGES.map(stage => ({
      id: stage,
      label: overrides.get(stage) ?? DEFAULT_STAGE_LABELS[stage][locale],
      usage: byStage.get(stage) ?? 0,
      archived: false,
    }))
  }

  private async outcomeReasonValues(workspaceId: string): Promise<CatalogueValue[]> {
    const counts = await this.lossReasons.manager.query<{ outcome_reason: string; count: string }[]>(
      `SELECT outcome_reason, COUNT(*)::text AS count
         FROM submissions WHERE workspace_id = $1 AND outcome_reason IS NOT NULL
        GROUP BY outcome_reason`,
      [workspaceId],
    )
    const byReason = new Map(counts.map(row => [row.outcome_reason, Number(row.count)]))
    return SUBMISSION_OUTCOME_REASONS.map(reason => ({
      id: reason,
      label: reason,
      usage: byReason.get(reason) ?? 0,
      archived: false,
    }))
  }

  /** Le référentiel de compétences, jusqu'ici sans aucun appelant. Le montrer
   *  en lecture vaut mieux que le cacher : un utilisateur qui ne voit pas la
   *  liste croit qu'elle n'existe pas et en réinvente une à côté. */
  private skillValues(): CatalogueValue[] {
    return skillReferential().map(entry => ({
      id: entry.canonical,
      // Le libellé montre les alias : c'est ce qui évite qu'on ajoute
      // « K8s » à côté de « Kubernetes » faute de savoir qu'ils sont déjà liés.
      label: entry.aliases.length > 0 ? `${entry.canonical} (${entry.aliases.join(', ')})` : entry.canonical,
      usage: 0,
      archived: false,
    }))
  }

  /**
   * Les offres de l'ESN, telles que SON profil les déclare.
   *
   * En lecture seule : elles se saisissent dans le questionnaire de profil, et
   * deux endroits pour la même liste en donneraient deux versions.
   *
   * ⚠️ Elles vivent sur `esn_profiles.expertise_areas`, pas sur `profiles` —
   * `profiles` est la fiche de la PERSONNE, `esn_profiles` celle de
   * l'ENTREPRISE. Lire la mauvaise table faisait tomber tout l'écran en 500,
   * et pas seulement ce bloc : une requête qui jette emporte la réponse
   * entière. C'est pourquoi la lecture est désormais TOLÉRANTE — un profil
   * absent ou une forme inattendue rend une liste vide, jamais une erreur.
   */
  private async offerValues(workspaceId: string): Promise<CatalogueValue[]> {
    try {
      const rows = await this.lossReasons.manager.query<{ expertise_areas: unknown }[]>(
        `SELECT expertise_areas
           FROM esn_profiles
          WHERE workspace_id = $1 AND is_current = true
          ORDER BY is_workspace_canonical DESC, version DESC
          LIMIT 1`,
        [workspaceId],
      )
      const offers = rows[0]?.expertise_areas
      if (!Array.isArray(offers)) return []
      return offers
        .filter((offer): offer is string => typeof offer === 'string' && offer.trim().length > 0)
        .map(label => ({ id: null, label: label.trim(), usage: 0, archived: false }))
    } catch (cause) {
      this.logger.warn('offres du profil ESN illisibles', { error: cause, workspaceId })
      return []
    }
  }
}
