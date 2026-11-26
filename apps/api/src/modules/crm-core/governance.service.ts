import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import {
  CUSTOM_FIELDS_MAX_PER_ENTITY,
  SAVED_VIEW_ALERT_CHANNELS,
  SAVED_VIEW_ALERT_FREQUENCIES,
  SAVED_VIEWS_MAX_PER_SCOPE,
  buildTriggerEvent,
  customFieldKey,
  duplicatePairKey,
  validateCustomValue,
  type CreateCustomFieldInput,
  type CreateSavedViewInput,
  type CustomFieldDef,
  type CustomFieldEntity,
  type CustomFieldType,
  type DecideDuplicateInput,
  type DuplicatePairView,
  type AutoMergedPairView,
  isAutoMergeable,
  type SavedView,
  type SavedViewAlertChannel,
  type SavedViewAlertFrequency,
  type SavedViewScope,
  SAVED_VIEW_RESULT_TYPES,
  type SavedViewResultType,
  discoverAlertSourceKindsOf,
  newItemsSince,
  type DiscoverAlertEventKind,
  DISCOVER_ALERT_EVENT_KINDS,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { CustomFieldDefEntity } from '../../database/entities/custom-field-def.entity'
import { CustomFieldValueEntity } from '../../database/entities/custom-field-value.entity'
import { DuplicatePairEntity } from '../../database/entities/duplicate-pair.entity'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { returnedRows } from '../../database/returned-rows'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'

/**
 * La GOUVERNANCE du CRM natif — vues, champs personnalisés, doublons.
 *
 * Trois bornes assumées, chacune contre une dérive connue :
 *
 * 1. **Vingt vues par écran et par personne.** Au-delà, on ne choisit plus : on
 *    refait le filtre à la main, ce que la fonctionnalité était censée éviter.
 * 2. **Dix champs personnalisés par objet.** Un système illimité produit, en un
 *    an, quarante colonnes non documentées dont douze disent la même chose — et
 *    plus aucun rapport n'est possible. Dix force à arbitrer.
 * 3. **Aucune fusion automatique.** On PROPOSE, l'humain décide, et la décision
 *    est enregistrée pour que la même paire ne revienne pas indéfiniment.
 */
/**
 * #2151.6 / .12 — une valeur illisible retombe sur l'état qui N'AGIT PAS.
 *
 * Une ligne écrite avant la migration porte `null` ; une ligne écrite par une
 * version future pourrait porter un mot que cette version ne connaît pas. Dans
 * les deux cas, la réponse est « manuelle, aucun canal » — ce que la vue a
 * toujours FAIT. Deviner « quotidienne » lui inventerait une alerte, et une
 * alerte inventée se lit comme un fait par celui qui la reçoit.
 */
function toAlertFrequency(value: string | null | undefined): SavedViewAlertFrequency {
  return SAVED_VIEW_ALERT_FREQUENCIES.includes(value as SavedViewAlertFrequency)
    ? (value as SavedViewAlertFrequency)
    : 'manual'
}

function toAlertChannel(value: string | null | undefined): SavedViewAlertChannel | null {
  return SAVED_VIEW_ALERT_CHANNELS.includes(value as SavedViewAlertChannel) ? (value as SavedViewAlertChannel) : null
}

/**
 * #2151.5 — une valeur illisible n'est pas « des comptes » : elle est NON
 * QUALIFIÉE, comme une colonne vide. Retomber sur le premier type ferait lire
 * un choix là où il n'y en a pas.
 */
function toResultType(value: string | null | undefined): SavedViewResultType | null {
  return SAVED_VIEW_RESULT_TYPES.includes(value as SavedViewResultType) ? (value as SavedViewResultType) : null
}

/** Ne garde que les genres que le contrat connaît — une valeur de base plus
 *  ancienne que le code ne doit pas faire planter une liste. */
function toEventKinds(values: unknown): DiscoverAlertEventKind[] {
  if (!Array.isArray(values)) return []
  return values.filter((value): value is DiscoverAlertEventKind =>
    (DISCOVER_ALERT_EVENT_KINDS as ReadonlyArray<string>).includes(value as string),
  )
}

/**
 * #2151.8 / #2151.9 — ce que CHAQUE périmètre de Découvrir a vu passer depuis
 * sa dernière exécution : combien, et de quelles NATURES de source.
 *
 * ⚠️ UNE requête pour toute la liste, jamais une par ligne : vingt périmètres
 * feraient vingt allers-retours pour afficher une colonne.
 *
 * ⚠️ La jointure porte `e.workspace_id = v.workspace_id` — le cloisonnement est
 * écrit DANS la jointure, pas seulement dans le `WHERE` de la vue.
 *
 * ⚠️ `v.last_run_at IS NOT NULL` est dans la condition de jointure : un
 * périmètre jamais rejoué ne compte RIEN, et `newItemsSince` rend alors `null`.
 * Compter « depuis toujours » lui afficherait un nombre qui ne veut rien dire.
 */
const DISCOVER_VIEW_EVENTS_QUERY = `
  SELECT v.id AS view_id,
         COUNT(e.id)::int AS event_count,
         COALESCE(ARRAY_AGG(DISTINCT e.kind) FILTER (WHERE e.kind IS NOT NULL), '{}') AS kinds
    FROM saved_views v
    LEFT JOIN discover_alert_events e
      ON e.workspace_id = v.workspace_id
     AND (e.saved_view_id IS NULL OR e.saved_view_id = v.id)
     AND v.last_run_at IS NOT NULL
     AND e.occurred_at >= v.last_run_at
   WHERE v.workspace_id = $1 AND v.scope = 'discover'
   GROUP BY v.id
`

type DiscoverViewEventsRow = { view_id: string; event_count: number; kinds: string[] | null }

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name)

  constructor(
    @InjectRepository(SavedViewEntity) private readonly views: Repository<SavedViewEntity>,
    @InjectRepository(CustomFieldDefEntity) private readonly defs: Repository<CustomFieldDefEntity>,
    @InjectRepository(CustomFieldValueEntity) private readonly values: Repository<CustomFieldValueEntity>,
    @InjectRepository(DuplicatePairEntity) private readonly duplicates: Repository<DuplicatePairEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // #2875 (#2402.1, #2402.9) — APPENDÉ EN FIN, optionnel : sans lui, la
    // proposition de doublons continue exactement comme avant, simplement
    // sans écrire au registre canonique.
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {}

  // ───────────────────────────── vues sauvegardées ─────────────────────────

  /** Les vues visibles : les miennes, plus celles partagées par l'espace. */
  async listViews(userId: string, scope: SavedViewScope): Promise<SavedView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.views.manager.query<
      (SavedViewEntity & { first_name: string | null; last_name: string | null; email: string | null })[]
    >(
      `SELECT v.*, p.first_name, p.last_name, p.email
         FROM saved_views v
         LEFT JOIN profiles p ON p.user_id = v.owner_id
        WHERE v.workspace_id = $1 AND v.scope = $2 AND (v.owner_id = $3 OR v.shared = true)
        ORDER BY v.shared DESC, v.name ASC`,
      [workspaceId, scope, userId],
    )

    // #2151.8 / #2151.9 — lus SEULEMENT pour Découvrir : les autres écrans
    // n'ont pas d'alerte, et leur faire payer une jointure serait gratuit.
    const eventsByView = new Map<string, DiscoverViewEventsRow>()
    if (scope === 'discover') {
      try {
        const eventRows = await this.views.manager.query<DiscoverViewEventsRow[]>(DISCOVER_VIEW_EVENTS_QUERY, [
          workspaceId,
        ])
        for (const eventRow of eventRows) eventsByView.set(eventRow.view_id, eventRow)
      } catch {
        // Une lecture d'événements en échec ne fait pas tomber la liste des
        // périmètres : `newItems` redevient `null` (« non mesuré »), jamais 0.
        eventsByView.clear()
      }
    }

    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        scope: row.scope as SavedViewScope,
        name: row.name,
        filters: row.filters ?? {},
        objective: row.objective ?? null,
        shared: row.shared,
        // #2151.6 / .12 — une ligne écrite avant cette migration n'a ni cadence
        // ni canal : elle retombe sur « manuelle, aucune alerte », qui est ce
        // qu'elle a toujours FAIT. Deviner « quotidienne » lui en inventerait une.
        alertFrequency: toAlertFrequency(row.alert_frequency),
        alertChannel: toAlertChannel(row.alert_channel),
        // #2151.7 — jamais rejouée = `null`, JAMAIS `created_at` : enregistrer
        // n'est pas exécuter, et confondre les deux invente une exécution.
        lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
        // #2151.5 — ce que le périmètre ramène ; `null` = non qualifié.
        resultType: toResultType(row.result_type),
        // #2151.8 — `null` tant qu'il n'a JAMAIS été rejoué : « on n'a pas
        // regardé » et « on a regardé, il n'y a rien » sont deux phrases.
        newItems: newItemsSince(eventsByView.get(row.id)?.event_count ?? 0, row.last_run_at ?? null),
        // #2151.9 — la NATURE des sources, jamais l'éditeur. Vide = source non
        // qualifiée, ce qui n'est pas « aucune source ».
        sourceKinds: [...discoverAlertSourceKindsOf(toEventKinds(eventsByView.get(row.id)?.kinds))],
        ownerId: row.owner_id,
        ownerName: full || row.email || null,
        createdAt: new Date(row.created_at).toISOString(),
      }
    })
  }

  async createView(userId: string, input: CreateSavedViewInput): Promise<SavedView> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mine = await this.views.count({
      where: { workspace_id: workspaceId, owner_id: userId, scope: input.scope },
    })
    if (mine >= SAVED_VIEWS_MAX_PER_SCOPE) {
      throw new BadRequestException(
        `Tu as déjà ${SAVED_VIEWS_MAX_PER_SCOPE} vues sur cet écran — au-delà on ne choisit plus, on refait le filtre à la main. Supprimes-en une.`,
      )
    }

    const saved = await this.views.save(
      this.views.create({
        workspace_id: workspaceId,
        owner_id: userId,
        scope: input.scope,
        name: input.name,
        filters: input.filters,
        shared: input.shared,
        objective: input.objective,
        alert_frequency: input.alertFrequency,
        alert_channel: input.alertChannel,
        // #2151.5 — ce que le périmètre ramène, tel que l'écran l'a dit.
        result_type: input.resultType,
        // LE CONSENTEMENT, DATÉ — 15/09/2026, décision 7 de Louis.
        //
        // Choisir un canal ICI est le geste par lequel quelqu'un demande à être
        // prévenu ; c'est donc ici, et nulle part ailleurs, que la date s'écrit.
        // Elle est ce qui rend le consentement démontrable : le dépôt sait déjà
        // dire qu'une case vaut `true` (des lignes `weekly_digest = true`
        // viennent d'un `DEFAULT` Postgres, pas d'un geste), il ne sait pas dire
        // QUAND ni COMMENT. `isQualifiedOutboundConsent` la relit avant tout
        // envoi, et `null` y vaut refus.
        alert_consent_at: input.alertChannel ? new Date() : null,
      }),
    )
    const list = await this.listViews(userId, input.scope)
    return (
      list.find(view => view.id === saved.id) ?? {
        id: saved.id,
        scope: input.scope,
        name: input.name,
        filters: input.filters,
        objective: input.objective,
        shared: input.shared,
        alertFrequency: input.alertFrequency,
        alertChannel: input.alertChannel,
        resultType: input.resultType,
        // Une vue qui vient de naître n'a jamais été rejouée — donc ni nouveaux
        // éléments MESURÉS (`null`, jamais 0), ni source qualifiée.
        newItems: null,
        sourceKinds: [],
        // Une vue qui vient de naître n'a jamais été rejouée.
        lastRunAt: null,
        ownerId: userId,
        ownerName: null,
        createdAt: new Date().toISOString(),
      }
    )
  }

  /** Seul le propriétaire retire sa vue — y compris une vue partagée. */
  async removeView(userId: string, viewId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.views.delete({ id: viewId, workspace_id: workspaceId, owner_id: userId })
    if (!result.affected) throw new NotFoundException('Vue introuvable, ou elle ne t’appartient pas')
  }

  /**
   * #3873 — UN CLIC SUR « REJOUER » EST UNE EXÉCUTION.
   *
   * `last_run_at` n'avait qu'un seul écrivain avant ce lot : le cron des
   * alertes. Le geste manuel (« Rejouer » dans la colonne de gauche de
   * Découvrir) relançait bien la recherche côté client, mais ne le disait
   * jamais au serveur — la carte annonçait « Jamais rejouée » indéfiniment,
   * même juste après le clic. Mêmes visibilité que la lecture (`listViews`) :
   * sa propre vue, ou une vue partagée de l'espace.
   */
  async markRun(userId: string, viewId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = returnedRows<{ id: string }>(
      await this.views.manager.query(
        `UPDATE saved_views SET last_run_at = now()
         WHERE id = $1 AND workspace_id = $2 AND (owner_id = $3 OR shared = true)
         RETURNING id`,
        [viewId, workspaceId, userId],
      ),
    )
    if (rows.length === 0) throw new NotFoundException('Vue introuvable, ou tu n’y as pas accès')
  }

  // ─────────────────────────── champs personnalisés ────────────────────────

  async listFields(userId: string, entityType: CustomFieldEntity): Promise<CustomFieldDef[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.defs.find({
      where: { workspace_id: workspaceId, entity_type: entityType },
      order: { created_at: 'ASC' },
    })
    return rows.map(toFieldWire)
  }

  /**
   * Crée un champ personnalisé.
   *
   * Deux refus explicites : la borne de dix, et la clé déjà prise. Réutiliser
   * une clé ferait deux colonnes du même nom dans un export, et personne ne
   * saurait laquelle lire.
   */
  async createField(userId: string, input: CreateCustomFieldInput): Promise<CustomFieldDef> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const active = await this.defs.count({
      where: { workspace_id: workspaceId, entity_type: input.entityType, archived: false },
    })
    if (active >= CUSTOM_FIELDS_MAX_PER_ENTITY) {
      throw new BadRequestException(
        `Dix champs personnalisés au maximum par objet. Au-delà, la base porte des colonnes que personne ne documente et plus aucun rapport n'est lisible — archive-en un avant d'en ajouter.`,
      )
    }

    const key = customFieldKey(input.label)
    if (!key) throw new BadRequestException('Ce libellé ne produit aucune clé exploitable')

    const rows = await this.defs.manager.query<{ id: string }[]>(
      `INSERT INTO custom_field_defs (workspace_id, entity_type, key, label, type, options)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, entity_type, key) DO NOTHING
       RETURNING id`,
      [workspaceId, input.entityType, key, input.label, input.type, input.options],
    )
    if (rows.length === 0) {
      throw new BadRequestException(
        `Un champ « ${input.label} » existe déjà sur cet objet — deux colonnes du même nom dans un export sont illisibles.`,
      )
    }

    const saved = await this.defs.findOne({ where: { id: rows[0]?.id } })
    if (!saved) throw new NotFoundException('Champ introuvable')
    return toFieldWire(saved)
  }

  /**
   * Archive un champ. Ses VALEURS restent : effacer la définition rendrait
   * illisibles des données vieilles de trois ans, et « on ne sait plus ce que
   * c'était » n'est pas un état acceptable pour une base.
   */
  async archiveField(userId: string, fieldId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.defs.update({ id: fieldId, workspace_id: workspaceId }, { archived: true })
    if (!result.affected) throw new NotFoundException('Champ introuvable')
  }

  /** Les valeurs personnalisées d'un enregistrement, par clé. */
  async readValues(userId: string, entityId: string): Promise<Record<string, unknown>> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.values.manager.query<{ key: string; value: unknown }[]>(
      `SELECT d.key, v.value
         FROM custom_field_values v
         JOIN custom_field_defs d ON d.id = v.field_id
        WHERE v.workspace_id = $1 AND v.entity_id = $2`,
      [workspaceId, entityId],
    )
    return Object.fromEntries(rows.map(row => [row.key, row.value]))
  }

  /**
   * Écrit une valeur, après validation contre la définition.
   *
   * Le refus NOMME le champ : « valeur invalide » sur un formulaire à dix champs
   * oblige à chercher lequel.
   */
  async writeValue(userId: string, fieldId: string, entityId: string, value: unknown): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const def = await this.defs.findOne({ where: { id: fieldId, workspace_id: workspaceId } })
    if (!def) throw new NotFoundException('Champ introuvable')
    if (def.archived) throw new BadRequestException(`« ${def.label} » est archivé et n'accepte plus de saisie`)

    const problem = validateCustomValue(
      { type: def.type as CustomFieldType, options: def.options ?? [], label: def.label },
      value,
    )
    if (problem) throw new BadRequestException(problem)

    await this.values.manager.query(
      `INSERT INTO custom_field_values (workspace_id, field_id, entity_id, value, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (field_id, entity_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [workspaceId, fieldId, entityId, JSON.stringify(value ?? null)],
    )
  }

  // ────────────────────────────── doublons ─────────────────────────────────

  /** L'espace actif de l'utilisateur (le balayage à la lecture en a besoin). */
  async activeWorkspaceId(userId: string): Promise<string> {
    return (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
  }

  /** Les paires EN ATTENTE, les plus sûres d'abord. */
  async listDuplicates(userId: string, limit = 50): Promise<DuplicatePairView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.duplicates.manager.query<
      (DuplicatePairEntity & {
        left_label: string | null
        right_label: string | null
        first_name: string | null
        last_name: string | null
        email: string | null
      })[]
    >(
      `SELECT d.*, COALESCE(lc.full_name, la.company_name) AS left_label,
              COALESCE(rc.full_name, ra.company_name) AS right_label,
              p.first_name, p.last_name, p.email
         FROM duplicate_pairs d
         LEFT JOIN contacts lc ON lc.id = d.left_id
         LEFT JOIN contacts rc ON rc.id = d.right_id
         LEFT JOIN accounts la ON la.id = d.left_id AND d.entity_type = 'account'
         LEFT JOIN accounts ra ON ra.id = d.right_id AND d.entity_type = 'account'
         LEFT JOIN profiles p ON p.user_id = d.decided_by
        WHERE d.workspace_id = $1 AND d.decision = 'pending'
        ORDER BY d.confidence DESC
        LIMIT $2`,
      [workspaceId, limit],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        entityType: row.entity_type as DuplicatePairView['entityType'],
        leftId: row.left_id,
        leftLabel: row.left_label,
        rightId: row.right_id,
        rightLabel: row.right_label,
        reason: row.reason,
        confidence: Number(row.confidence),
        decision: row.decision as DuplicatePairView['decision'],
        decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : null,
        decidedByName: full || row.email || null,
      }
    })
  }

  /**
   * Enregistre des paires proposées.
   *
   * `DO NOTHING` sur la clé : une paire déjà DÉCIDÉE ne réapparaît pas. Sans ça,
   * chaque passage de détection ressusciterait ce qui a été écarté, et la liste
   * ne se viderait jamais — donc personne ne l'ouvrirait.
   *
   * #2875/#2402.1 — deuxième émetteur migré vers le registre canonique
   * (`packages/contracts/schemas/trigger-event.ts`), après
   * `interventions.sweeper.ts`. Un `TriggerEvent` n'est construit QUE sur une
   * insertion RÉELLE (jamais sur `DO NOTHING` : une paire déjà connue n'est pas
   * un signal neuf), et sa construction est protégée séparément — un bug dans
   * cette tranche ne doit jamais empêcher la proposition réelle, qui reste le
   * comportement qui prime.
   *
   * `buildTriggerEvent` reste l'UNIQUE point de construction (#2402.2,
   * dédoublonnage 27/09) : l'événement construit ici est le MÊME objet à la
   * fois journalisé et passé à `TriggerRegistryService.record`, qui ne fait
   * que le persister — plus de second calcul indépendant côté registre.
   */
  async proposeDuplicates(
    workspaceId: string,
    pairs: readonly {
      entityType: 'account' | 'contact'
      leftId: string
      rightId: string
      reason: string
      confidence: number
    }[],
  ): Promise<number> {
    let inserted = 0
    for (const pair of pairs) {
      const rows = await this.duplicates.manager.query<{ id: string }[]>(
        `INSERT INTO duplicate_pairs (workspace_id, entity_type, pair_key, left_id, right_id, reason, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, entity_type, pair_key) DO NOTHING
         RETURNING id`,
        [
          workspaceId,
          pair.entityType,
          duplicatePairKey(pair.leftId, pair.rightId),
          pair.leftId,
          pair.rightId,
          pair.reason,
          pair.confidence,
        ],
      )
      if (rows.length > 0) {
        inserted += 1
        try {
          const event = buildTriggerEvent({
            type: 'duplicate_pair_detected',
            source: 'governance',
            subjectType: pair.entityType,
            subjectId: rows[0].id,
            workspaceId,
            ownerId: null,
            evidence: pair.reason,
            confidence: 'estimee',
            now: new Date(),
          })
          this.logger.log(`Événement canonique « ${event.type} »`, { dedupeKey: event.dedupeKey })
          // #2875 (#2402.1, #2402.9, dédoublonnage 27/09) — le PREMIER émetteur
          // migré au registre canonique persiste le MÊME événement, jamais un
          // second calcul : `TriggerRegistryService.record` délègue, il ne
          // construit rien. S'AJOUTE à `duplicate_pairs` ci-dessus, ne le
          // remplace pas — best-effort, hors du chemin critique.
          // #2875 — une paire = un fait : clé non datée, à dessein.
          void this.triggers?.recordOnceByDedupeKey(event, 'crm-core/governance.service')
        } catch (error) {
          this.logger.error('Événement canonique « duplicate_pair_detected » en échec', { error })
        }
      }
    }
    return inserted
  }

  /**
   * #4016 L6 — LA FUSION AUTOMATIQUE (décision Louis 11/10/2026).
   *
   * ⚠️⚠️ RENVERSEMENT DATÉ de `c37_fusion_doublons` (« on propose, on ne
   * fusionne jamais »), pour les paires CERTAINES seulement (≥ 0,99,
   * `isAutoMergeable`). Trois promesses, chacune tenue par la forme de
   * l'écriture plutôt que par une consigne :
   *
   *  - **dans BellumAI seulement** : la requête ne touche que `contacts` et
   *    `duplicate_pairs`. Le CRM du client n'est ni lu ni écrit ici — une
   *    écriture CRM garde son go (doctrine « une écriture CRM passe par une
   *    porte »).
   *  - **réversible** : la fiche absorbée n'est pas effacée ; elle est mise de
   *    côté (`deleted_at`, la suppression réversible T0) et pointe vers la
   *    survivante (`merged_into_id`). {@link undoAutoMerge} remet les deux à
   *    NULL.
   *  - **journalisée** : la ligne `duplicate_pairs` (décision `auto_merged`,
   *    `absorbed_id`, `decided_at`) EST le journal — écrite dans la MÊME
   *    instruction que la mise de côté, jamais l'une sans l'autre.
   *
   * Une paire déjà connue (proposée, tranchée, fusionnée) ne fusionne rien : un
   * humain qui a dit « ce ne sont pas les mêmes » gagne toujours. Une fiche
   * déjà mise de côté, ou une survivante disparue, non plus.
   */
  async autoMergeContacts(
    workspaceId: string,
    pairs: readonly {
      leftId: string
      rightId: string
      keptId: string
      absorbedId: string
      reason: string
      confidence: number
    }[],
  ): Promise<number> {
    let merged = 0
    for (const pair of pairs) {
      // La ceinture ET les bretelles : le balayeur ne passe que des paires
      // certaines, mais un futur appelant ne doit pas pouvoir fusionner à 0,95.
      if (!isAutoMergeable(pair.confidence)) continue
      // La survivante doit EXISTER dans l'espace, et ne pas être elle-même mise
      // de côté — lue par `ContactEntity`, jamais par un SQL brut de plus (GA-405).
      const keptAlive = await this.duplicates.manager.getRepository(ContactEntity).count({
        where: { id: pair.keptId, workspace_id: workspaceId, deleted_at: IsNull() },
      })
      if (keptAlive === 0) continue
      const pairKey = duplicatePairKey(pair.leftId, pair.rightId)
      const rows = await this.duplicates.manager.query<{ id: string }[]>(
        `WITH absorbed AS (
           UPDATE contacts
              SET deleted_at = now(), merged_into_id = $2
            WHERE id = $3
              AND workspace_id = $1
              AND deleted_at IS NULL
              AND merged_into_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM duplicate_pairs known
                 WHERE known.workspace_id = $1 AND known.entity_type = 'contact' AND known.pair_key = $4
              )
           RETURNING id
         )
         INSERT INTO duplicate_pairs
           (workspace_id, entity_type, pair_key, left_id, right_id, reason, confidence,
            decision, decided_at, absorbed_id)
         SELECT $1, 'contact', $4, $5, $6, $7, $8, 'auto_merged', now(), absorbed.id
           FROM absorbed
         ON CONFLICT (workspace_id, entity_type, pair_key) DO NOTHING
         RETURNING id`,
        [workspaceId, pair.keptId, pair.absorbedId, pairKey, pair.leftId, pair.rightId, pair.reason, pair.confidence],
      )
      if (rows.length > 0) merged += 1
    }
    return merged
  }

  /**
   * #4016 L6 (décision Louis 15/10/2026) — ⚠️ RENVERSEMENT PARTIEL daté de
   * « on propose une fusion, on ne fusionne jamais » : deux COMPTES du même
   * espace au SIREN IDENTIQUE se fusionnent seuls. Le SIREN est la seule clé de
   * compte assez certaine ; un nom, même identique, reste une proposition.
   *
   * Mêmes promesses que {@link autoMergeContacts} : dans Bellum seulement
   * (`accounts`, `duplicate_pairs`) ; le compte absorbé est ARCHIVÉ — jamais
   * supprimé — et pointe vers la survivante (`merged_into_id`, `merged_at`,
   * statut d'avant gardé : le détachement existant le remet) ; la paire EST le
   * journal (`auto_merged`, `absorbed_id`), écrite dans la MÊME instruction. Une
   * paire déjà connue (tranchée par un humain) ne fusionne rien : la correction
   * humaine gagne. #4016.61 : les contacts du compte absorbé REJOIGNENT le
   * survivant (entité d'accueil `subsidiary`, comme `absorbAccount`), sauf un
   * homonyme déjà présent ; `undoAutoMerge` les rend, avec le statut d'avant.
   */
  async autoMergeAccounts(
    workspaceId: string,
    pairs: readonly {
      leftId: string
      rightId: string
      keptId: string
      absorbedId: string
      reason: string
      confidence: number
    }[],
  ): Promise<number> {
    let merged = 0
    for (const pair of pairs) {
      if (!isAutoMergeable(pair.confidence)) continue
      const pairKey = duplicatePairKey(pair.leftId, pair.rightId)
      // #4016.61 — la MÊME instruction : l'entité d'accueil (le repère des contacts qui bougent, lu par le
      // détachement), le compte archivé, les contacts déplacés (sauf un homonyme déjà chez le survivant : la
      // fiche la plus renseignée reste, comme `planAbsorb`) et la paire-journal. Tout passe ou rien.
      const eligible = `a.id = $3
              AND a.workspace_id = $1
              AND a.merged_into_id IS NULL
              AND COALESCE(a.status, '') <> 'archived'
              AND EXISTS (SELECT 1 FROM accounts k WHERE k.id = $2 AND k.workspace_id = $1 AND k.merged_into_id IS NULL)
              AND NOT EXISTS (
                SELECT 1 FROM duplicate_pairs known
                 WHERE known.workspace_id = $1 AND known.entity_type = 'account' AND known.pair_key = $4
              )`
      const rows = await this.duplicates.manager.query<{ id: string }[]>(
        `WITH host AS (
           INSERT INTO account_entities (workspace_id, account_id, name, kind, siren, domain)
           SELECT $1, $2, a.company_name, 'subsidiary', a.siren, a.website
             FROM accounts a
            WHERE ${eligible}
           RETURNING id
         ), absorbed AS (
           UPDATE accounts a
              SET merged_previous_status = COALESCE(a.merged_previous_status, a.status),
                  merged_previous_commercial_status = COALESCE(a.merged_previous_commercial_status, a.commercial_status),
                  status = 'archived',
                  commercial_status = 'archived',
                  merged_into_id = $2,
                  merged_at = now(),
                  merged_entity_id = (SELECT id FROM host)
            WHERE ${eligible}
           RETURNING a.id
         ), moved AS (
           UPDATE contacts c
              SET account_id = $2, entity_id = (SELECT id FROM host)
            WHERE c.workspace_id = $1
              AND c.account_id IN (SELECT id FROM absorbed)
              AND bellum_normalize_name(c.full_name) IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM contacts kept
                 WHERE kept.account_id = $2
                   AND bellum_normalize_name(kept.full_name) = bellum_normalize_name(c.full_name)
              )
           RETURNING c.id
         )
         INSERT INTO duplicate_pairs
           (workspace_id, entity_type, pair_key, left_id, right_id, reason, confidence,
            decision, decided_at, absorbed_id)
         SELECT $1, 'account', $4, $5, $6, $7, $8, 'auto_merged', now(), absorbed.id
           FROM absorbed
         ON CONFLICT (workspace_id, entity_type, pair_key) DO NOTHING
         RETURNING id`,
        [workspaceId, pair.keptId, pair.absorbedId, pairKey, pair.leftId, pair.rightId, pair.reason, pair.confidence],
      )
      if (rows.length > 0) merged += 1
    }
    return merged
  }

  /** #4016 L6 — les fusions automatiques EN VIGUEUR, les plus récentes d'abord. */
  async listAutoMerged(userId: string, limit = 50): Promise<AutoMergedPairView[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.duplicates.manager.query<
      {
        id: string
        entity_type: string
        kept_id: string
        absorbed_id: string
        reason: string
        confidence: string | number
        decided_at: Date | string
      }[]
    >(
      `SELECT d.id, d.entity_type, d.absorbed_id, d.reason, d.confidence, d.decided_at,
              CASE WHEN d.absorbed_id = d.left_id THEN d.right_id ELSE d.left_id END AS kept_id
         FROM duplicate_pairs d
        WHERE d.workspace_id = $1 AND d.decision = 'auto_merged' AND d.absorbed_id IS NOT NULL
        ORDER BY d.decided_at DESC
        LIMIT $2`,
      [workspaceId, limit],
    )
    if (!rows.length) return []
    // Les NOMS se lisent par `ContactEntity` (GA-405) — la fiche absorbée comprise,
    // mise de côté par une simple colonne (`deleted_at`), jamais filtrée ici.
    const ids = [...new Set(rows.flatMap(row => [row.kept_id, row.absorbed_id]))]
    const contacts = await this.duplicates.manager.getRepository(ContactEntity).find({
      where: { id: In(ids), workspace_id: workspaceId },
      select: ['id', 'full_name'],
    })
    const nameOf = new Map(contacts.map(contact => [contact.id, contact.full_name?.trim() || null]))
    // #4016.61 — une fusion de COMPTES se nomme par sa raison sociale, jamais par un identifiant.
    if (rows.some(row => row.entity_type === 'account')) {
      const accounts = await this.duplicates.manager.query<{ id: string; company_name: string | null }[]>(
        `SELECT id, company_name FROM accounts WHERE id = ANY($1::uuid[]) AND workspace_id = $2`,
        [ids, workspaceId],
      )
      for (const account of accounts ?? []) nameOf.set(account.id, account.company_name?.trim() || null)
    }
    return rows.map(row => ({
      id: row.id,
      entityType: row.entity_type as AutoMergedPairView['entityType'],
      keptId: row.kept_id,
      keptLabel: nameOf.get(row.kept_id) ?? null,
      absorbedId: row.absorbed_id,
      absorbedLabel: nameOf.get(row.absorbed_id) ?? null,
      reason: row.reason,
      confidence: Number(row.confidence),
      mergedAt: new Date(row.decided_at).toISOString(),
    }))
  }

  /**
   * #4016 L6 — ANNULER une fusion automatique. La fiche absorbée revient (ses
   * deux colonnes de mise de côté à NULL) et la paire devient `dismissed` —
   * « ce ne sont pas les mêmes », la correction humaine qui gagne toujours :
   * elle ne sera plus jamais ni proposée ni refusionnée. Le journal garde qui a
   * annulé et quand (`undone_at`/`undone_by`).
   *
   * UNE instruction : la paire et la fiche bougent ensemble ou pas du tout. Une
   * fiche que quelqu'un a rattachée AILLEURS depuis n'est pas arrachée à sa
   * nouvelle place (`merged_into_id = kept_id`).
   */
  async undoAutoMerge(userId: string, pairId: string): Promise<{ restored: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // #4016.61 — la fusion de COMPTES a son propre retour : contacts, statut d'avant, lien.
    const kind = await this.duplicates.manager.query<{ entity_type: string }[]>(
      `SELECT entity_type FROM duplicate_pairs WHERE id = $1 AND workspace_id = $2 AND decision = 'auto_merged'`,
      [pairId, workspaceId],
    )
    if (kind?.[0]?.entity_type === 'account') return this.undoAutoMergedAccounts(workspaceId, userId, pairId)
    const rows = await this.duplicates.manager.query<{ undone: number; restored: number }[]>(
      `WITH pair AS (
         UPDATE duplicate_pairs
            SET decision = 'dismissed', decided_at = now(), decided_by = $3, undone_at = now(), undone_by = $3
          WHERE id = $1 AND workspace_id = $2 AND decision = 'auto_merged' AND entity_type = 'contact'
         RETURNING absorbed_id, CASE WHEN absorbed_id = left_id THEN right_id ELSE left_id END AS kept_id
       ), restored AS (
         UPDATE contacts c
            SET deleted_at = NULL, merged_into_id = NULL
           FROM pair
          WHERE c.id = pair.absorbed_id AND c.workspace_id = $2 AND c.merged_into_id = pair.kept_id
         RETURNING c.id
       )
       SELECT (SELECT count(*) FROM pair)::int AS undone, (SELECT count(*) FROM restored)::int AS restored`,
      [pairId, workspaceId, userId],
    )
    if (!rows[0]?.undone) throw new NotFoundException('Fusion introuvable')
    return { restored: (rows[0]?.restored ?? 0) > 0 }
  }

  /**
   * #4016.61 — ANNULER une fusion de COMPTES (même SIREN). Le compte absorbé retrouve le statut ENREGISTRÉ avant
   * la fusion (jamais un statut choisi), ses contacts reviennent de l'entité d'accueil — sauf un homonyme
   * arrivé depuis —, le lien est effacé et la paire devient `dismissed` : plus jamais proposée ni refusionnée.
   * Un compte rattaché AILLEURS depuis, ou fusionné avant que l'état d'avant soit gardé, n'est pas touché.
   * UNE instruction, puis l'entité d'accueil retirée seulement si plus rien n'y est rangé.
   */
  private async undoAutoMergedAccounts(
    workspaceId: string,
    userId: string,
    pairId: string,
  ): Promise<{ restored: boolean }> {
    const rows = await this.duplicates.manager.query<{ undone: number; restored: number; host_id: string | null }[]>(
      `WITH pair AS (
         UPDATE duplicate_pairs
            SET decision = 'dismissed', decided_at = now(), decided_by = $3, undone_at = now(), undone_by = $3
          WHERE id = $1 AND workspace_id = $2 AND decision = 'auto_merged' AND entity_type = 'account'
         RETURNING absorbed_id, CASE WHEN absorbed_id = left_id THEN right_id ELSE left_id END AS kept_id
       ), returned AS (
         UPDATE contacts c
            SET account_id = pair.absorbed_id, entity_id = NULL
           FROM pair, accounts ab
          WHERE ab.id = pair.absorbed_id AND ab.merged_into_id = pair.kept_id
            AND ab.merged_entity_id IS NOT NULL AND c.entity_id = ab.merged_entity_id
            AND c.workspace_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM contacts home
               WHERE home.account_id = pair.absorbed_id
                 AND bellum_normalize_name(home.full_name) = bellum_normalize_name(c.full_name)
            )
         RETURNING c.id
       ), restored AS (
         UPDATE accounts a
            SET status = a.merged_previous_status,
                commercial_status = a.merged_previous_commercial_status,
                merged_into_id = NULL, merged_at = NULL, merged_by = NULL,
                merged_previous_status = NULL, merged_previous_commercial_status = NULL,
                merged_entity_id = NULL
           FROM pair
          WHERE a.id = pair.absorbed_id AND a.workspace_id = $2
            AND a.merged_into_id = pair.kept_id AND a.merged_previous_status IS NOT NULL
         RETURNING a.id
       )
       SELECT (SELECT count(*) FROM pair)::int AS undone,
              (SELECT count(*) FROM restored)::int AS restored,
              (SELECT ab.merged_entity_id FROM accounts ab WHERE ab.id = (SELECT absorbed_id FROM pair)) AS host_id`,
      [pairId, workspaceId, userId],
    )
    if (!rows[0]?.undone) throw new NotFoundException('Fusion introuvable')
    const hostId = rows[0]?.host_id ?? null
    if (hostId) {
      await this.duplicates.manager.query(
        `DELETE FROM account_entities e
          WHERE e.id = $1 AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.entity_id = e.id)`,
        [hostId],
      )
    }
    return { restored: (rows[0]?.restored ?? 0) > 0 }
  }

  /**
   * Enregistre la décision d'un humain.
   *
   * `merged` veut dire « quelqu'un a fusionné, à la main, dans son CRM ». Bellum
   * n'écrit rien dans le CRM : c'est irréversible côté CRM, et un faux positif
   * détruit l'historique d'un vrai client. (La fusion automatique ≥ 0,99, dans
   * Bellum seulement, est {@link autoMergeContacts} — jamais ce geste.)
   */
  async decideDuplicate(userId: string, pairId: string, input: DecideDuplicateInput): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.duplicates.update(
      { id: pairId, workspace_id: workspaceId },
      { decision: input.decision, decided_at: new Date(), decided_by: userId },
    )
    if (!result.affected) throw new NotFoundException('Paire introuvable')
  }
}

function toFieldWire(row: CustomFieldDefEntity): CustomFieldDef {
  return {
    id: row.id,
    entityType: row.entity_type as CustomFieldEntity,
    key: row.key,
    label: row.label,
    type: row.type as CustomFieldType,
    options: row.options ?? [],
    archived: row.archived,
    createdAt: new Date(row.created_at).toISOString(),
  }
}
