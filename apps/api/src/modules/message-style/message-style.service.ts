import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  analyzeMessageStyleImport,
  checkMessageStyleTemplateTransition,
  compareMessageStyleLayers,
  computeMessageStyleUsageStats,
  hasPermission,
  isLearnableStyleSignal,
  noGoMessageRefusal,
  type CreateMessageStyleImport,
  type CreateMessageStyleRuleProposal,
  type CreateMessageStyleTemplate,
  type MessageStyleImportResult,
  type MessageStylePreviewCompareRequest,
  type MessageStylePreviewResult,
  type MessageStyleRuleProposal,
  type MessageStyleRuleProposalDecision,
  type MessageStyleTemplate,
  type MessageStyleTemplateStatus,
  type MessageStyleUsageStats,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'
import { MessageStyleTemplateEntity } from '../../database/entities/message-style-template.entity'
import { MessageStyleRuleProposalEntity } from '../../database/entities/message-style-rule-proposal.entity'
import { MessageStyleImportEntity } from '../../database/entities/message-style-import.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { IaClient, type IaEnvelope } from '../ia/ia.client'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { pickTemplateByScope, type MessageStyleScopeTarget } from './message-style-scope'

/**
 * #2369.11 — seuls ces canaux génèrent un exemple réel (`Channel` littéral de
 * `apps/ia/app/routers/message.py`) : `manual` (vocabulaire plus large de
 * `OUTREACH_MESSAGE_CHANNELS`, réutilisé par le canal du style, #2369.9) n'a
 * pas de générateur — un aperçu dessus serait un 422 deviné en `text`, jamais
 * une génération réelle. #2204.40 : `recommendation` a un appelant
 * (le composer) et un générateur — elle s'aperçoit. Théo B C5.A24 : `voicemail`, `sms` et `whatsapp` n'en ont plus.
 */
const MESSAGE_STYLE_PREVIEW_SUPPORTED_CHANNELS: ReadonlySet<string> = new Set([
  'email',
  'linkedin',
  'phone',
  'recommendation',
  // #2370 — chacun a désormais sa règle de forme et un appelant (le composer) : ils s'aperçoivent.
  'task',
  'introduction_request',
  'partner_message',
  'follow_up_email',
  'profile_push',
  'linkedin_connection_note',
])

/**
 * #2369.11 — la même génération pour chaque couche, seule la CONSIGNE change :
 * l'angle libre du commercial (`context`, déjà lu par le composer) porte
 * désormais aussi le style à respecter, quand la couche en a un — jamais un
 * second canal de paramètres qui dirait la même chose autrement (GA-26) : le
 * moteur IA (`derive_message_brief`) ne connaît qu'UN texte d'angle.
 */
export function composeMessageStylePreviewContext(
  base: string | undefined,
  template: MessageStyleTemplate | null,
): string | undefined {
  if (!template) return base
  const style =
    template.forbidden.length > 0
      ? `Style à respecter — persona : ${template.persona}. Jamais : ${template.forbidden.join(', ')}.`
      : `Style à respecter — persona : ${template.persona}.`
  // #2947 (#2204.60/.61/.63) — pitch, ton et signature DÉCLARÉS rejoignent la
  // même consigne ; non déclarés, aucune ligne (consigne byte-identique).
  const declared = [
    template.pitch ? `Pitch à mettre en avant : ${template.pitch}.` : null,
    template.tone ? `Ton : ${template.tone}.` : null,
    template.signature ? `Signature à recopier telle quelle en fin de message : ${template.signature}` : null,
  ].filter((part): part is string => part !== null)
  const line = declared.length > 0 ? `${style}\n${declared.join('\n')}` : style
  return base ? `${base}\n\n${line}` : line
}

function messageTextFromEnvelope(envelope: IaEnvelope): string {
  const data = envelope.data ?? {}
  const subject = typeof data.subject === 'string' ? data.subject.trim() : ''
  const body = typeof data.body === 'string' ? data.body.trim() : ''
  return subject ? `${subject}\n\n${body}` : body
}

/**
 * #2369.12 — les quatre taux par style, en une requête groupée : `modified`
 * relit EXACTEMENT le signal déjà posé par `OutreachMessageService.toDtos`
 * (`kind = 'user_edit'`, jamais un second calcul de « modifié ») ;
 * `unsubscribed` relit `email_suppressions` (`reason = 'unsubscribe'`, la
 * VRAIE désinscription — bounce/complaint n'en sont pas) via l'e-mail du
 * contact, la seule clé que porte cette table.
 */
const USAGE_BY_STYLE_SQL = `
  SELECT
    m.message_style_template_id AS template_id,
    m.message_style_template_version AS template_version,
    COUNT(*)::int AS total,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM outreach_message_versions v WHERE v.message_id = m.id AND v.kind = 'user_edit'
      )
    )::int AS modified,
    COUNT(*) FILTER (
      WHERE m.status IN ('approved', 'scheduled', 'sending', 'sent', 'delivered', 'bounced', 'replied', 'copied_manual')
    )::int AS validated,
    COUNT(*) FILTER (WHERE m.status = 'replied')::int AS responded,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM contacts c
        JOIN email_suppressions s ON s.workspace_id = m.workspace_id AND s.email = c.email AND s.reason = 'unsubscribe'
        WHERE c.id = m.contact_id
      )
    )::int AS unsubscribed
  FROM outreach_messages m
  WHERE m.workspace_id = $1 AND m.message_style_template_id IS NOT NULL
  GROUP BY m.message_style_template_id, m.message_style_template_version
`

/** Qui agit, dans quel espace, avec quel rôle — résolu par le contrôleur. */
export type MessageStyleCtx = { userId: string; workspaceId: string; role: WorkspaceRole }

/**
 * #2369.9/.10/.13/.7/.8 (épopée #2768) — le socle serveur de la mémoire de
 * style : l'objet Template et son cycle de vie, la garde d'apprentissage, et
 * la proposition de règle qui ne durcit jamais seule.
 *
 * #2369.6 (LOT j1 26/09) — `scope`/`businessUnitId`/`conversationId` à la
 * création, résolution par priorité fixe dans `resolveMessageStyleTemplate`
 * (`@bellum/contracts`) : cette couche persiste, elle ne redevine pas l'ordre.
 *
 * #2369.11 (reste) — le comparatif générique/espace/utilisateur/finale
 * réutilise l'appel de génération EXISTANT (`IaClient.generateMessage`, le
 * composer), jamais un second chemin IA. #2369.12 (reste) — les quatre taux
 * d'usage PAR STYLE, jamais par personne (GA-240/241).
 *
 * Restent HORS de ce service (#2369.1/.2/.3/.4/.5/.14) : les sources de
 * style admises, l'import pour apprentissage, l'analyse préalable, la
 * restitution « je conserve / je ne reproduis pas / je propose », et le
 * NO-GO de #2369.14.
 */
@Injectable()
export class MessageStyleService {
  constructor(
    @InjectRepository(MessageStyleTemplateEntity)
    private readonly templates: Repository<MessageStyleTemplateEntity>,
    @InjectRepository(MessageStyleRuleProposalEntity)
    private readonly proposals: Repository<MessageStyleRuleProposalEntity>,
    @InjectRepository(MessageStyleImportEntity)
    private readonly imports: Repository<MessageStyleImportEntity>,
    @InjectRepository(OutreachMessageEntity)
    private readonly outreachMessages: Repository<OutreachMessageEntity>,
    private readonly ia: IaClient,
    private readonly esnProfile: EsnProfileReader,
  ) {}

  /** #2369.9 — naît `draft`, version 1, owner = qui l'a créé (jamais depuis le corps).
   *  #2369.6 — sans `scope` fourni, retombe sur `workspace` (comportement historique). */
  async createTemplate(ctx: MessageStyleCtx, dto: CreateMessageStyleTemplate): Promise<MessageStyleTemplate> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Créer un style de message demande le droit d’écriture des fiches.')
    }
    const row = await this.templates.save(
      this.templates.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        objective: dto.objective,
        channel: dto.channel,
        persona: dto.persona,
        status: 'draft',
        forbidden: dto.forbidden ?? [],
        version: 1,
        scope: dto.scope ?? 'workspace',
        business_unit_id: dto.businessUnitId ?? null,
        conversation_id: dto.conversationId ?? null,
        // #2947 (#2204.60/.61/.63) — déclarés ou NULL, jamais un défaut.
        pitch: dto.pitch ?? null,
        tone: dto.tone ?? null,
        signature: dto.signature ?? null,
      }),
    )
    return toTemplateDto(row)
  }

  async listTemplates(ctx: MessageStyleCtx): Promise<MessageStyleTemplate[]> {
    const rows = await this.templates.find({
      where: workspaceScopeWhere(ctx.workspaceId),
      order: { created_at: 'DESC' },
    })
    return rows.map(toTemplateDto)
  }

  async getTemplate(ctx: MessageStyleCtx, id: string): Promise<MessageStyleTemplate> {
    return toTemplateDto(await this.ownedTemplate(ctx, id))
  }

  /** #2369.10 — la machine à cinq statuts est celle du contrat, jamais redevinée ici. */
  async transitionTemplate(
    ctx: MessageStyleCtx,
    id: string,
    to: MessageStyleTemplateStatus,
  ): Promise<MessageStyleTemplate> {
    const template = await this.ownedTemplate(ctx, id)
    this.assertCanEditTemplate(ctx, template)
    const check = checkMessageStyleTemplateTransition(template.status, to)
    if (!check.ok) {
      throw new ConflictException(`Transition refusée : ${template.status} → ${to} (${check.reason}).`)
    }
    template.status = to
    await this.templates.save(template)
    return toTemplateDto(template)
  }

  /* -------------------------------- imports --------------------------------- */

  /**
   * #2369.2/.3 — importe un message pour apprentissage (sept natures, quinze
   * sources admises). #2369.4 — l'analyse préalable est PURE et déterministe
   * (`analyzeMessageStyleImport`, `@bellum/contracts`) : jamais un appel IA,
   * jamais le corps envoyé au modèle. #2369.5 — la restitution à trois volets ;
   * chaque signal `propose` devient une VRAIE proposition `pending`, via
   * {@link proposeRule} (#2369.7/.8 réutilisé, jamais une seconde écriture) —
   * #2369.13 s'applique donc aussi ici (un ton agressif isolé ne propose rien,
   * il n'atteint même pas `proposeRule`).
   */
  async importAndAnalyze(ctx: MessageStyleCtx, dto: CreateMessageStyleImport): Promise<MessageStyleImportResult> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException(
        'Importer un message pour l’apprentissage de style demande le droit d’écriture des fiches.',
      )
    }
    const analysis = analyzeMessageStyleImport(dto.rawText)
    const row = await this.imports.save(
      this.imports.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        import_kind: dto.importKind,
        source_type: dto.sourceType,
        raw_text: dto.rawText,
      }),
    )
    const proposals: MessageStyleRuleProposal[] = []
    for (const candidate of analysis.propose) {
      proposals.push(await this.proposeRule(ctx, { signal: candidate.signal, observation: candidate.observation }))
    }
    return {
      importId: row.id,
      conserve: analysis.conserve,
      neReproduitPas: analysis.neReproduitPas,
      propose: proposals,
    }
  }

  /* ---------------------------- rule proposals ----------------------------- */

  /**
   * #2369.7 — naît TOUJOURS `pending` : rien ici ne peut créer une règle déjà
   * adoptée. #2369.13 — un signal exclu (faute, donnée fausse, ton agressif
   * isolé) est refusé AVANT toute écriture.
   */
  async proposeRule(ctx: MessageStyleCtx, dto: CreateMessageStyleRuleProposal): Promise<MessageStyleRuleProposal> {
    if (!isLearnableStyleSignal(dto.signal)) {
      throw new ForbiddenException(
        'Ce choix ne devient jamais une règle : une faute, une donnée fausse ou un ton agressif isolé restent la responsabilité de qui écrit, pas une mémoire durable.',
      )
    }
    const row = await this.proposals.save(
      this.proposals.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        template_id: dto.templateId ?? null,
        signal: dto.signal,
        observation: dto.observation,
        status: 'pending',
        decided_by: null,
        decided_at: null,
      }),
    )
    return toProposalDto(row)
  }

  async listRuleProposals(ctx: MessageStyleCtx): Promise<MessageStyleRuleProposal[]> {
    const rows = await this.proposals.find({
      where: workspaceScopeWhere(ctx.workspaceId),
      order: { created_at: 'DESC' },
    })
    return rows.map(toProposalDto)
  }

  /**
   * #2369.8 — LE geste explicite qui sort une proposition de `pending`.
   * Adopter une règle vaut pour tout l'espace : ça demande `team:manage`,
   * jamais seulement d'être l'auteur de la proposition.
   */
  async decideRuleProposal(
    ctx: MessageStyleCtx,
    id: string,
    decision: MessageStyleRuleProposalDecision,
  ): Promise<MessageStyleRuleProposal> {
    if (!hasPermission(ctx.role, 'team:manage')) {
      throw new ForbiddenException(
        'Adopter ou refuser une règle de style engage tout l’espace : ce geste demande la gestion d’équipe.',
      )
    }
    const proposal = await this.ownedProposal(ctx, id)
    if (proposal.status !== 'pending') {
      throw new ConflictException('Cette proposition a déjà été décidée.')
    }
    proposal.status = decision
    proposal.decided_by = ctx.userId
    proposal.decided_at = new Date()
    await this.proposals.save(proposal)
    return toProposalDto(proposal)
  }

  /* ------------------------------ comparatif -------------------------------- */

  /**
   * #2369.11 — génère le MÊME message d'exemple sous les quatre couches
   * (`compareMessageStyleLayers`, `@bellum/contracts`). Une couche sans
   * template configuré n'appelle jamais l'IA (GA-18/19). Deux couches qui
   * pointent vers le MÊME template (souvent `workspace` et `final`) ne
   * génèrent qu'UNE fois — un appel Claude coûteux ne se répète pas pour la
   * même consigne (#2123.59).
   */
  async previewCompare(
    ctx: MessageStyleCtx,
    dto: MessageStylePreviewCompareRequest,
  ): Promise<MessageStylePreviewResult[]> {
    if (!hasPermission(ctx.role, 'records:write')) {
      throw new ForbiddenException('Comparer un aperçu de style demande le droit d’écriture des fiches.')
    }
    if (!MESSAGE_STYLE_PREVIEW_SUPPORTED_CHANNELS.has(dto.channel)) {
      throw new BadRequestException(
        `L’aperçu comparatif ne génère pas encore d’exemple sur le canal « ${dto.channel} » (email/linkedin/phone seulement).`,
      )
    }
    // #3405.3 — la garde NO-GO sur l'aperçu comparatif (il appelle le modèle
    // pour un vrai contact) : même règle, même phrase que les autres appelants.
    const accountRows = await this.outreachMessages.manager.query<
      { sprint: string | null; sprint_reason: string | null }[]
    >(
      `SELECT a.sprint, a.sprint_reason FROM contacts c JOIN accounts a ON a.id = c.account_id
        WHERE c.id = $1 AND a.workspace_id = $2 LIMIT 1`,
      [dto.contactId, ctx.workspaceId],
    )
    const refusal = noGoMessageRefusal(accountRows[0]?.sprint, accountRows[0]?.sprint_reason)
    if (refusal) throw new ConflictException(refusal)
    const rows = await this.templates.find({
      where: {
        ...workspaceScopeWhere(ctx.workspaceId),
        status: 'active',
        objective: dto.objective,
        channel: dto.channel,
      },
    })
    const layers = compareMessageStyleLayers(
      rows.map(toTemplateDto),
      { objective: dto.objective, channel: dto.channel },
      { userId: ctx.userId },
    )
    const profileData = (await this.esnProfile.resolveProfileData(ctx.userId)) as Record<string, unknown>
    const cache = new Map<string, string>()
    const results: MessageStylePreviewResult[] = []
    for (const { layer, template } of layers) {
      if (layer !== 'generic' && !template) {
        results.push({ layer, templateId: null, text: null })
        continue
      }
      const cacheKey = template?.id ?? 'generic'
      let text = cache.get(cacheKey)
      if (text === undefined) {
        const envelope = await this.ia.generateMessage({
          userId: ctx.userId,
          contactId: dto.contactId,
          channel: dto.channel,
          context: composeMessageStylePreviewContext(dto.context, template),
          profileData,
        })
        if (!envelope.success) {
          throw new BadGatewayException('La génération de l’aperçu a échoué — réessaie.')
        }
        text = messageTextFromEnvelope(envelope)
        cache.set(cacheKey, text)
      }
      results.push({ layer, templateId: template?.id ?? null, text })
    }
    return results
  }

  /**
   * #2369.12 — les quatre taux d'usage, groupés PAR STYLE (id + version),
   * jamais par personne (GA-240/241). Un style sans message relié n'a
   * simplement AUCUNE ligne ici — l'écran dit alors « non mesuré », jamais 0.
   */
  async getUsageByStyle(ctx: MessageStyleCtx): Promise<MessageStyleUsageStats[]> {
    const rows: Array<Record<string, string | number | null>> = await this.outreachMessages.manager.query(
      USAGE_BY_STYLE_SQL,
      [ctx.workspaceId],
    )
    return rows.map(row =>
      computeMessageStyleUsageStats({
        templateId: String(row.template_id),
        templateVersion: Number(row.template_version),
        total: Number(row.total),
        modified: Number(row.modified),
        validated: Number(row.validated),
        responded: Number(row.responded),
        unsubscribed: Number(row.unsubscribed),
      }),
    )
  }

  /**
   * #2204.59-.65 (épopée #2947) — appelée par la génération RÉELLE d'un message
   * (`IaProxyController.generateMessage`), jamais seulement par l'aperçu
   * comparatif (#2369.11, {@link previewCompare}). Jusqu'ici un style choisi
   * n'était qu'ESTAMPILLÉ sur le message SAUVEGARDÉ (`resolveAppliedStyle`,
   * `outreach-message.service.ts`) — le texte généré, lui, l'ignorait
   * entièrement. Même vérification que cette méthode-là : un identifiant qui
   * n'appartient pas à l'espace ou dont le statut n'est pas `active` échoue
   * clairement plutôt que de se deviner appliqué.
   */
  async resolveActiveTemplateForGeneration(ctx: MessageStyleCtx, id: string): Promise<MessageStyleTemplate> {
    const template = await this.ownedTemplate(ctx, id)
    if (template.status !== 'active') {
      throw new ConflictException(
        'Ce style n’est pas actif — seul un style « active » peut être appliqué à une génération.',
      )
    }
    return toTemplateDto(template)
  }

  /**
   * #2204.65 — SANS style choisi, le style actif le plus PROCHE s'applique (fil > équipe > personne > espace,
   * `pickTemplateByScope`). `null` : aucun style actif ne correspond — la génération part comme avant.
   */
  async resolveByScope(
    ctx: MessageStyleCtx,
    target: Omit<MessageStyleScopeTarget, 'userId'>,
  ): Promise<MessageStyleTemplate | null> {
    const rows = await this.templates.find({
      where: { ...workspaceScopeWhere(ctx.workspaceId), channel: target.channel, status: 'active' },
    })
    return pickTemplateByScope(rows.map(toTemplateDto), { ...target, userId: ctx.userId })
  }

  /* ------------------------------- interne -------------------------------- */

  private async ownedTemplate(ctx: MessageStyleCtx, id: string): Promise<MessageStyleTemplateEntity> {
    const template = await this.templates.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!template) throw new NotFoundException('Style de message introuvable.')
    return template
  }

  private async ownedProposal(ctx: MessageStyleCtx, id: string): Promise<MessageStyleRuleProposalEntity> {
    const proposal = await this.proposals.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!proposal) throw new NotFoundException('Proposition de règle introuvable.')
    return proposal
  }

  private requiredPermission(ctx: MessageStyleCtx, template: MessageStyleTemplateEntity): WorkspacePermission {
    return template.user_id === ctx.userId ? 'records:write' : 'team:manage'
  }

  private assertCanEditTemplate(ctx: MessageStyleCtx, template: MessageStyleTemplateEntity): void {
    if (!hasPermission(ctx.role, this.requiredPermission(ctx, template))) {
      throw new ForbiddenException(
        'Ce style appartient à un autre membre : sa modification demande la gestion d’équipe.',
      )
    }
  }
}

function toTemplateDto(row: MessageStyleTemplateEntity): MessageStyleTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? '',
    ownerId: row.user_id,
    objective: row.objective,
    channel: row.channel,
    persona: row.persona,
    status: row.status,
    forbidden: row.forbidden,
    version: row.version,
    scope: row.scope,
    businessUnitId: row.business_unit_id,
    conversationId: row.conversation_id,
    pitch: row.pitch ?? null,
    tone: row.tone ?? null,
    signature: row.signature ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function toProposalDto(row: MessageStyleRuleProposalEntity): MessageStyleRuleProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? '',
    templateId: row.template_id,
    proposedBy: row.user_id,
    signal: row.signal,
    observation: row.observation,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  }
}
