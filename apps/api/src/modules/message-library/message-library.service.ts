import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  confirmMessageClaim,
  hasPermission,
  renderVerbatim,
  selectApprovedTemplate,
  selectBehaviorExamples,
  type MessageLibraryBehaviorSelection,
  type CreateMessageLibraryEntry,
  type ContentVisibility,
  type MessageLibraryEntry,
  type MessageLibraryRenderResult,
  type MessageLibrarySelectionCriteria,
  type MessageLibrarySelectionTrace,
  type WorkspaceRole,
} from '@bellum/contracts'
import { MessageLibraryEntryEntity } from '../../database/entities/message-library-entry.entity'
import { MessageLibraryTraceEntity } from '../../database/entities/message-library-trace.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { ALL_IMPORTED_SEQUENCES, BEHAVIOR_EXAMPLES_3443 } from './message-library.seed-data'

export type MessageLibraryCtx = {
  readonly userId: string
  readonly workspaceId: string
  readonly role: WorkspaceRole
}

function toDto(row: MessageLibraryEntryEntity): MessageLibraryEntry {
  return {
    id: row.id,
    title: row.title,
    text: row.body,
    origin: row.origin,
    sourceDocument: row.source_document,
    version: row.version,
    date: row.entry_date.toISOString(),
    channel: row.channel,
    scenarioId: row.scenario_id,
    persona: row.persona,
    decisionRole: row.decision_role,
    stage: row.stage,
    route: row.route,
    step: row.step,
    objective: row.objective,
    expectedVariables: row.expected_variables,
    mandatoryFacts: row.mandatory_facts,
    factConfirmations: row.fact_confirmations ?? [],
    claims: row.claims,
    status: row.status,
    mode: row.mode,
    usageConstraints: row.usage_constraints,
    // #4158.30 — partagé / personnel, son auteur, sa dernière mise à jour.
    visibility: row.visibility ?? 'team',
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : undefined,
  }
}

/**
 * #4158.30 — ce que `ctx.userId` peut lire : les exemples partagés de l'espace et SES exemples
 * personnels. L'exemple personnel d'un collègue ne fait aucune ligne — ni dans la liste, ni dans la
 * sélection (il ne sert donc jamais à rédiger pour un autre), ni par son identifiant.
 */
function visibleWhere(ctx: { workspaceId: string; userId: string }, id?: string) {
  const idPart = id ? { id } : {}
  return [
    { ...workspaceScopeWhere(ctx.workspaceId), ...idPart, visibility: 'team' as const },
    { ...workspaceScopeWhere(ctx.workspaceId), ...idPart, created_by: ctx.userId },
  ]
}

/**
 * #3427 — la surface d'accès à la bibliothèque d'exemples commerciaux.
 * Sélection et rendu délèguent ENTIÈREMENT à `@bellum/contracts` — ce
 * service ne redevine ni la règle absolue ni la sélection structurée.
 */
@Injectable()
export class MessageLibraryService {
  constructor(
    @InjectRepository(MessageLibraryEntryEntity)
    private readonly entries: Repository<MessageLibraryEntryEntity>,
    @Optional()
    @InjectRepository(MessageLibraryTraceEntity)
    private readonly traces?: Repository<MessageLibraryTraceEntity>,
  ) {}

  private readonly logger = new Logger(MessageLibraryService.name)

  /**
   * #3446.10 — la trace d'une production : un échec d'écriture est journalisé,
   * jamais propagé (la sélection reste la réponse ; la trace est le registre).
   */
  private async recordTrace(
    ctx: MessageLibraryCtx,
    trace: Omit<MessageLibraryTraceEntity, 'id' | 'workspace_id' | 'user_id' | 'created_at'>,
  ): Promise<void> {
    if (!this.traces) return
    try {
      await this.traces.save(this.traces.create({ ...trace, workspace_id: ctx.workspaceId, user_id: ctx.userId }))
    } catch (error) {
      this.logger.warn(`trace de bibliothèque non écrite : ${error instanceof Error ? error.message : 'erreur'}`)
    }
  }

  /** #3446.10 — les traces de l'espace, la plus récente d'abord (plafonnées). */
  async listTraces(ctx: MessageLibraryCtx, limit = 100): Promise<MessageLibraryTraceEntity[]> {
    if (!this.traces) return []
    return this.traces.find({
      where: workspaceScopeWhere(ctx.workspaceId),
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    })
  }

  async create(ctx: MessageLibraryCtx, dto: CreateMessageLibraryEntry): Promise<MessageLibraryEntry> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Importer un exemple dans la bibliothèque demande le droit d’écriture des fiches.')
    }
    return this.insert(ctx, dto)
  }

  /** L'écriture sans contrôle de droit : réservée aux appelants qui l'ont fait (`create`) ou qui posent le contenu livré avec le produit (`seedDefaultsIfEmpty`). */
  private async insert(ctx: MessageLibraryCtx, dto: CreateMessageLibraryEntry): Promise<MessageLibraryEntry> {
    const row = await this.entries.save(
      this.entries.create({
        workspace_id: ctx.workspaceId,
        created_by: ctx.userId,
        title: dto.title,
        body: dto.text,
        origin: dto.origin,
        source_document: dto.sourceDocument,
        version: dto.version,
        entry_date: new Date(dto.date),
        channel: dto.channel,
        scenario_id: dto.scenarioId,
        persona: dto.persona,
        decision_role: dto.decisionRole,
        stage: dto.stage,
        route: dto.route,
        step: dto.step ?? null,
        objective: dto.objective,
        expected_variables: [...dto.expectedVariables],
        mandatory_facts: [...dto.mandatoryFacts],
        claims: [...dto.claims],
        status: dto.status,
        mode: dto.mode,
        usage_constraints: [...dto.usageConstraints],
        visibility: dto.visibility ?? 'team',
      }),
    )
    return toDto(row)
  }

  /**
   * #3427 — pose dans l'espace les séquences livrées avec le produit (verbatim,
   * statut et affirmations inchangés : aucune n'est activée par l'import). Une
   * entrée déjà présente (même document source + même titre) est comptée, jamais
   * dupliquée.
   */
  async importDefaults(ctx: MessageLibraryCtx): Promise<{ imported: number; alreadyThere: number }> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Importer un exemple dans la bibliothèque demande le droit d’écriture des fiches.')
    }
    return this.insertDefaults(ctx)
  }

  private async insertDefaults(ctx: MessageLibraryCtx): Promise<{ imported: number; alreadyThere: number }> {
    const existing = await this.entries.find({ where: workspaceScopeWhere(ctx.workspaceId) })
    const known = new Set(existing.map(row => `${row.source_document}\u0000${row.title}`))
    let imported = 0
    const defaults = [...ALL_IMPORTED_SEQUENCES, ...BEHAVIOR_EXAMPLES_3443]
    for (const { slug: _slug, ...dto } of defaults) {
      if (known.has(`${dto.sourceDocument}\u0000${dto.title}`)) continue
      await this.insert(ctx, dto)
      imported += 1
    }
    return { imported, alreadyThere: defaults.length - imported }
  }

  /**
   * #3437 / #3438 / #3440 — la bibliothèque d'un espace NEUF n'est jamais vide
   * quand Laura la lit : en prod (recette 02/10), « aucune séquence n'a été
   * importée » parce que le seul chemin était un bouton. Les séquences livrées
   * avec le produit sont posées à la première lecture, une seule fois — dès
   * qu'une ligne existe (importée, créée ou supprimée à la main), on ne repose
   * plus rien : un espace qui a trié sa bibliothèque ne la voit pas revenir.
   * Statut et affirmations restent ceux du texte livré : rien n'est activé en
   * plus de ce qui l'est déjà (`evaluateReadiness`).
   */
  private async seedDefaultsIfEmpty(ctx: MessageLibraryCtx): Promise<void> {
    const present = await this.entries.find({ where: workspaceScopeWhere(ctx.workspaceId), take: 1 })
    if (present.length > 0) return
    await this.insertDefaults(ctx)
  }

  async list(ctx: MessageLibraryCtx): Promise<MessageLibraryEntry[]> {
    const rows = await this.entries.find({
      where: visibleWhere(ctx),
      order: { created_at: 'DESC' },
    })
    return rows.map(toDto)
  }

  private async ownedEntry(ctx: MessageLibraryCtx, id: string): Promise<MessageLibraryEntryEntity> {
    const row = await this.entries.findOne({ where: visibleWhere(ctx, id) })
    if (!row) throw new NotFoundException('Exemple introuvable dans cet espace.')
    return row
  }

  async get(ctx: MessageLibraryCtx, id: string): Promise<MessageLibraryEntry> {
    return toDto(await this.ownedEntry(ctx, id))
  }

  /**
   * #4158.30 — l'AUTEUR partage son exemple avec l'équipe, ou le reprend en personnel. Personne d'autre
   * (`ownedEntry` rend déjà 404 pour le personnel d'un collègue). Une entrée sans auteur connu — le contenu
   * livré avec le produit, ou antérieur à la notion — reste partagée.
   */
  async setVisibility(ctx: MessageLibraryCtx, id: string, visibility: ContentVisibility): Promise<MessageLibraryEntry> {
    const row = await this.ownedEntry(ctx, id)
    if (row.created_by !== ctx.userId) {
      throw new ForbiddenException('Seul l’auteur d’un exemple peut le partager ou le reprendre en personnel.')
    }
    row.visibility = visibility
    return toDto(await this.entries.save(row))
  }

  /**
   * Sélectionne par critères STRUCTURÉS, jamais par ressemblance de texte —
   * `selectApprovedTemplate` porte la règle, la trace explique la décision.
   */
  async select(
    ctx: MessageLibraryCtx,
    criteria: MessageLibrarySelectionCriteria,
  ): Promise<MessageLibrarySelectionTrace> {
    await this.seedDefaultsIfEmpty(ctx)
    const rows = await this.entries.find({ where: visibleWhere(ctx) })
    const trace = selectApprovedTemplate(rows.map(toDto), criteria)
    const chosen = trace.selectedId ? rows.find(row => row.id === trace.selectedId) : undefined
    await this.recordTrace(ctx, {
      kind: 'verbatim',
      entry_id: chosen?.id ?? null,
      entry_version: chosen?.version ?? null,
      criteria: { ...criteria },
      injected_example_ids: [],
      rules: [...trace.reasons],
      variables: chosen ? [...chosen.expected_variables] : [],
      proofs_missing: [],
      checks: [...trace.rejected],
      decision: chosen ? 'template_selected' : 'no_template',
    })
    return trace
  }

  /** #3443 — les exemples de COMPORTEMENT (`inspiration`), mêmes critères structurés. */
  async selectBehavior(
    ctx: MessageLibraryCtx,
    criteria: MessageLibrarySelectionCriteria,
  ): Promise<MessageLibraryBehaviorSelection> {
    const rows = await this.entries.find({ where: visibleWhere(ctx) })
    const selection = selectBehaviorExamples(rows.map(toDto), criteria)
    await this.recordTrace(ctx, {
      kind: 'inspiration',
      entry_id: null,
      entry_version: null,
      criteria: { ...criteria },
      injected_example_ids: selection.examples.map(e => e.id),
      rules: [...selection.reasons],
      variables: [],
      proofs_missing: selection.examples.flatMap(e => [...e.unverifiedClaims]),
      checks: [...selection.rejected],
      decision: selection.examples.length > 0 ? 'examples_injected' : 'no_example',
    })
    return selection
  }

  /**
   * #3439.1 — un humain CONFIRME un fait obligatoire (qui, quand). Seul un fait
   * déclaré par l'entrée se confirme ; reconfirmer ne change rien (le premier
   * confirmant reste). Aucune « déconfirmation » : on archive, on ne supprime pas.
   */
  async confirmMandatoryFact(ctx: MessageLibraryCtx, id: string, fact: string): Promise<MessageLibraryEntry> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Confirmer un fait demande le droit d’écriture des fiches.')
    }
    const row = await this.ownedEntry(ctx, id)
    if (!row.mandatory_facts.includes(fact)) {
      throw new BadRequestException('Ce fait n’est pas un fait obligatoire de cet exemple.')
    }
    const current = row.fact_confirmations ?? []
    if (!current.some(c => c.fact === fact)) {
      row.fact_confirmations = [...current, { fact, confirmedBy: ctx.userId, confirmedAt: new Date().toISOString() }]
      await this.entries.save(row)
    }
    return toDto(row)
  }

  /**
   * #3437 / #3438 (recette prod 03/10) — confirmer UNE affirmation (chiffre, résultat, délai) : le geste
   * humain qui lève son blocage. `records:write`, jamais le modèle ; tracé (qui, quand) dans
   * `verifiedFactId`. Aucune « déconfirmation » : on archive, on ne supprime pas.
   */
  async confirmClaim(ctx: MessageLibraryCtx, id: string, claimIndex: number): Promise<MessageLibraryEntry> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Confirmer une affirmation demande le droit d’écriture des fiches.')
    }
    const row = await this.ownedEntry(ctx, id)
    let next: ReturnType<typeof confirmMessageClaim>
    try {
      next = confirmMessageClaim(toDto(row), claimIndex, ctx.userId, new Date().toISOString())
    } catch {
      throw new BadRequestException('Cette affirmation n’existe pas dans cet exemple.')
    }
    row.claims = [...next.claims]
    row.status = next.status
    await this.entries.save(row)
    return toDto(row)
  }

  /** #3427 — jamais de rendu sur une entrée bloquée par la règle absolue. */
  async render(
    ctx: MessageLibraryCtx,
    id: string,
    variables: Readonly<Record<string, string>>,
  ): Promise<MessageLibraryRenderResult> {
    const entry = toDto(await this.ownedEntry(ctx, id))
    const result = renderVerbatim(entry, variables)
    if (!result.ok) {
      if (result.missingVariables.length > 0) throw new BadRequestException(result.reason)
      throw new ConflictException(result.reason)
    }
    return result
  }
}
