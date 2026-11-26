import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  createShortlistSchema,
  matchWeightsSchema,
  normaliseMatchWeights,
  updateMatchWeightsSchema,
  type MatchExplanation,
  type NeedAutoMatch,
  shiftLocalDays,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../../auth/jwt.guard'
import { PlanFeatureGuard } from '../../plan-features/plan-feature.guard'
import { RequireFeature } from '../../plan-features/require-feature.decorator'
import { RequirePermission } from '../../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../../workspace/workspace-permission.guard'
import { can, SHORTLIST_MAX } from '@bellum/contracts'
import { MatchingService } from './matching.service'
import { AutoNeedMatchingService } from './auto-need-matching.service'
import { ShortlistService } from './shortlist.service'
import { submissionPreflight, type PreparableAction } from './submission-preflight'
import { calibrate } from './calibration'
import { SubmissionsService } from '../submissions.service'
import { DecisionGatesService } from '../../decision-gates/decision-gates.service'
import { CvStudioService } from '../cv-studio.service'
import { TasksService } from '../../tasks/tasks.service'
import {
  clientMessageBody,
  clientMessageSubject,
  topStrengths,
  unprovenFromMatch,
  type PitchProfile,
} from './client-pitch'
import { InverseMatchingService } from './inverse-matching.service'
import { ReverseMarketService } from './reverse-market.service'
import { ReverseMarketDismissalService } from './reverse-market-dismissal.service'
import { explanationMarkdown, toExplanation } from './explanation'

export class UpdateMatchWeightsDto extends createZodDto(updateMatchWeightsSchema) {}
export class CreateShortlistDto extends createZodDto(createShortlistSchema) {}

/** #2968 — le corps de « Masquer » / « Restaurer » : un seul champ, le libellé tel que rendu par l'écran. */
const reverseMarketDismissalBodySchema = z.object({ companyName: z.string().trim().min(1).max(200) })
export class ReverseMarketDismissalDto extends createZodDto(reverseMarketDismissalBodySchema) {}

/**
 * Le matching besoin ↔ vivier (PDF 4, tickets BEL-MTC-301, 303, 304).
 *
 * Coût : ZÉRO crédit. Le matching interne est le geste qu'on veut voir répété ;
 * le facturer le tuerait, et c'est un arbitrage assumé plutôt qu'un oubli.
 *
 * Permission `records:write` : elle recouvre exactement ce que le §16.1 demande
 * (recruiter et sales, pas viewer, pas finance). Un matching écrit d'ailleurs
 * réellement — son journal est une obligation de conformité, pas un effet de
 * bord.
 */
@Controller()
@RequireFeature('talent_pool')
@UseGuards(JwtGuard, PlanFeatureGuard, WorkspacePermissionGuard)
export class MatchingController {
  constructor(
    private readonly matching: MatchingService,
    private readonly inverse: InverseMatchingService,
    private readonly reverseMarket$: ReverseMarketService,
    private readonly reverseMarketDismissals: ReverseMarketDismissalService,
    private readonly shortlists: ShortlistService,
    private readonly submissions: SubmissionsService,
    private readonly gates: DecisionGatesService,
    private readonly studio: CvStudioService,
    private readonly tasks: TasksService,
    private readonly workspaceContext: WorkspaceContextService,
    // #2916 / #2399.2 (c93) — `@Optional()` EN FIN de liste : les specs qui
    // construisent ce contrôleur par position restent valides.
    @Optional() private readonly autoMatching?: AutoNeedMatchingService,
  ) {}

  /**
   * #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — le matching
   * AUTOMATIQUE de ce besoin, s'il y en a eu un : une LECTURE, elle n'écrit
   * rien et ne relance rien. `autoMatch: null` = l'automatisation n'a jamais
   * pris ce besoin (routine inactive à son arrivée) — l'écran n'affiche alors
   * rien. Enveloppé dans un objet : un corps `null` nu se lit mal côté client.
   */
  @Get('needs/:id/match/auto')
  @WorkspaceRead()
  async autoMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ autoMatch: NeedAutoMatch | null }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    if (!workspaceId || !this.autoMatching) return { autoMatch: null }
    return { autoMatch: await this.autoMatching.latestFor(id, workspaceId) }
  }

  @Post('needs/:id/match')
  @RequirePermission('records:write')
  async matchNeed(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const run = await this.matching.matchNeed(id, workspaceId, user.userId, {
      canReadFinance: can(role, [], 'finance:read'),
    })
    if (!run) throw new NotFoundException('Ce besoin est introuvable dans cet espace')
    return run
  }

  /**
   * Le droit à l'explication (art. 86).
   *
   * `format=md` rend un fichier téléchargeable : « exportable » veut dire qu'on
   * peut le remettre à quelqu'un, pas qu'on peut le lire à l'écran.
   */
  @Get('needs/:id/match/explain')
  @RequirePermission('data:export')
  async explain(
    @Param('id') _id: string,
    @Query('runId') runId: string,
    @Query('consultantId') consultantId: string,
    @Query('format') format: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MatchExplanation | string> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const found = await this.matching.explain(
      runId,
      consultantId,
      workspaceId,
      user.userId,
      can(role, [], 'finance:read'),
    )
    if (!found) throw new NotFoundException('Ce classement est introuvable')
    const explanation = toExplanation(found.run, found.need, found.result)
    if (format !== 'md') return explanation
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="classement-${consultantId}.md"`)
    return explanationMarkdown(explanation)
  }

  @Post('consultants/:id/match-inverse')
  @RequirePermission('records:write')
  async matchInverse(
    @Param('id') id: string,
    @Query('scope') scope: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const run = await this.inverse.matchTalent(id, workspaceId, user.userId, {
      canReadFinance: can(role, [], 'finance:read'),
      mineOnly: scope === 'mine',
    })
    if (!run) throw new NotFoundException('Ce talent est introuvable dans cet espace')
    return run
  }

  /**
   * La PROSPECTION INVERSÉE vers le marché (§6.2, BEL-ATS-010).
   *
   * La troisième et la deuxième source de besoins du §6.2 — les offres publiées
   * et les ESN qui recrutent sur la zone. La première (les besoins ouverts de
   * l'espace) reste servie par `match-inverse` ci-dessus : l'écran monte les
   * deux, ce contrôleur ne les fusionne pas.
   *
   * ⚠️ `@Get` et non `@Post` : c'est une LECTURE de relevés déjà collectés.
   * Aucun crédit, aucun appel sortant, aucune écriture — donc aucune raison
   * d'exiger `records:write`, que la route inverse demande parce qu'elle
   * journalise un run.
   */
  @Get('consultants/:id/reverse-market')
  async reverseMarket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const market = await this.reverseMarket$.forTalent(id, workspaceId, user.userId)
    if (!market) throw new NotFoundException('Ce talent est introuvable dans cet espace')
    return market
  }

  /**
   * #2968 — les entreprises MASQUÉES par l'appelant sur ce consultant.
   *
   * Lecture d'espace pure, ouverte à tout membre : masquer est un geste
   * personnel et gratuit, sans montant ni écriture sensible — même niveau de
   * garde que la lecture des états de vérification (`@WorkspaceRead`).
   */
  @Get('consultants/:id/reverse-market/dismissals')
  @WorkspaceRead()
  async reverseMarketDismissedCompanies(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ companies: string[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return { companies: await this.reverseMarketDismissals.dismissedCompanyNames(workspaceId, user.userId, id) }
  }

  /**
   * #2968 — MASQUE une entreprise d'« Environnements compatibles », pour
   * l'appelant sur ce consultant. PERSISTANT et PAR PERSONNE (même patron que
   * #2127.37) : une autre personne de l'espace continue de la voir.
   */
  @Post('consultants/:id/reverse-market/dismissals')
  @RequirePermission('records:write')
  async dismissReverseMarketCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseMarketDismissalDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ dismissed: true }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.reverseMarketDismissals.dismiss(workspaceId, user.userId, id, dto.companyName)
    return { dismissed: true }
  }

  /**
   * #2968 — DÉMASQUE une entreprise déjà masquée par l'appelant. La ligne
   * n'est jamais supprimée (doctrine « on archive, on ne supprime pas ») :
   * cette route bascule `dismissed_at`, elle ne détruit rien.
   */
  @Delete('consultants/:id/reverse-market/dismissals')
  @RequirePermission('records:write')
  async restoreReverseMarketCompany(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseMarketDismissalDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<{ dismissed: false }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.reverseMarketDismissals.restore(workspaceId, user.userId, id, dto.companyName)
    return { dismissed: false }
  }

  /* #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
   * `GET/PATCH reverse-market/settings` vivaient ici ET sur
   * `/workspaces/reverse-market-settings` : deux portes pour le même réglage.
   * Il n'en reste qu'une, `WorkspaceReverseMarketSettingsController`, sur la
   * table de production — un réglage vit à un seul endroit (GA-26). */

  /**
   * Créer une shortlist depuis un classement (§9, BEL-MTC-302).
   *
   * Le serveur REJOUE le classement plutôt que de croire les scores envoyés par
   * le navigateur : deux exécutions identiques rendant le même résultat, la
   * valeur figée est exactement celle qui était affichée — et personne ne peut
   * fabriquer une shortlist en modifiant une requête.
   */
  @Post('needs/:id/shortlists')
  @RequirePermission('records:write')
  async createShortlist(
    @Param('id') needId: string,
    @Body() body: CreateShortlistDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const canReadFinance = can(role, [], 'finance:read')
    const runId =
      body.runId ?? (await this.matching.matchNeed(needId, workspaceId, user.userId, { canReadFinance }))?.runId
    if (!runId) throw new NotFoundException('Ce besoin est introuvable dans cet espace')
    const replayed = await this.matching.replay(runId, body.consultantIds, workspaceId, user.userId, canReadFinance)
    if (!replayed) throw new NotFoundException('Ce classement est introuvable')
    const identities = await this.matching.identitiesFor(body.consultantIds, workspaceId, user.userId)
    // `match_runs.weights` est du jsonb, donc l'entité le déclare `unknown` —
    // et c'est honnête : personne ne garantit la forme d'une colonne écrite il
    // y a six mois. On la RELIT avec le schéma qui la décrit plutôt que de la
    // forcer ; une pondération illisible retombe sur les poids par défaut, ce
    // qui est exactement ce que fait `normaliseMatchWeights` ailleurs.
    const storedWeights = matchWeightsSchema.safeParse(replayed.run.weights)
    const outcome = await this.shortlists.create({
      run: {
        runId: replayed.run.id,
        need: replayed.need,
        weights: storedWeights.success ? storedWeights.data : normaliseMatchWeights({}),
        threshold: replayed.run.threshold,
        evaluatedCount: replayed.results.length,
        prefilteredCount: 0,
        truncated: false,
        recommended: replayed.results,
        borderline: [],
        excluded: [],
        notEvaluable: [],
        exclusionCounts: [],
        identities: [],
        // Une relecture d'un classement déjà tranché (des profils CHOISIS) —
        // la question du zéro résultat ne se pose plus ici.
        nextBestMove: null,
        // #2178.33/.34 — cette reconstruction sert la création de shortlist,
        // jamais l'écran du zéro résultat : rien n'a été recalculé ici.
        feedbackLearnings: [],
        createdAt: replayed.run.created_at.toISOString(),
      },
      consultantIds: body.consultantIds,
      identities,
      workspaceId,
      userId: user.userId,
      // Pas de `canReadFinance` ici, et c'est le lot D48 : ce qui se FIGE en
      // base ne dépend pas du droit de celui qui déclenche. Le TJM est un prix
      // de VENTE, lisible par tout l'espace sur la fiche du vivier
      // (`tjm` sort sans condition de `talent.service.ts`) ; le garder au
      // moment de l'écriture ne protégeait rien et détruisait le chiffre pour
      // ceux qui, eux, ont le droit de le lire.
      rates: new Map([...identities].map(([id, identity]) => [id, identity.dailyRateCents])),
    })
    if ('refused' in outcome) {
      throw new BadRequestException(
        outcome.refused === 'too_many'
          ? `Une shortlist ne porte pas plus de ${SHORTLIST_MAX} profils — au-delà, ce n'est plus une sélection.`
          : "Un des profils choisis n'appartient pas à ce classement",
      )
    }
    return outcome.shortlist
  }

  @Get('needs/:id/shortlists')
  async listShortlists(@Param('id') needId: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.shortlists.listForNeed(needId, workspaceId)
  }

  @Get('shortlists/:id')
  async getShortlist(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const shortlist = await this.shortlists.findOne(id, workspaceId)
    if (!shortlist) throw new NotFoundException('Cette shortlist est introuvable')
    return shortlist
  }

  /** Modifier une shortlist, c'est en créer une autre (§9.1). */
  @Post('shortlists/:id/duplicate')
  @RequirePermission('records:write')
  async duplicateShortlist(
    @Param('id') id: string,
    @Body() body: { keep?: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const copy = await this.shortlists.duplicate(id, workspaceId, user.userId, body?.keep)
    if (!copy) throw new NotFoundException('Cette shortlist est introuvable')
    return copy
  }

  /**
   * Ce que le positionnement ferait — annoncé AVANT (§10.1).
   *
   * Le classement est rejoué avec les critères figés du run : la préflight doit
   * dire la vérité du moment du calcul, pas celle d'un recalcul silencieux qui
   * pourrait avoir changé entre l'affichage et le clic.
   */
  @Post('needs/:id/submissions/preview')
  @RequirePermission('records:write')
  async previewSubmission(
    @Param('id') needId: string,
    @Body() body: { runId: string; consultantId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const replayed = await this.matching.replay(
      body.runId,
      [body.consultantId],
      workspaceId,
      user.userId,
      can(role, [], 'finance:read'),
    )
    const result = replayed?.results[0]
    if (!replayed || !result) throw new NotFoundException('Ce classement est introuvable')
    const context = await this.matching.submissionContext(needId, body.consultantId, workspaceId)
    if (!context) throw new NotFoundException('Ce besoin est introuvable dans cet espace')
    const candidate = (
      await this.matching.loadCandidates(workspaceId, user.userId, replayed.need, [body.consultantId])
    )[0]
    return submissionPreflight(replayed.need, result, {
      consentState: candidate?.consentState ?? 'none',
      consentExpiresAt: context.consentExpiresAt,
      availabilityCheckedAt: context.availabilityCheckedAt,
      accountConsent: context.accountConsent,
      positioningAgreement: context.positioningAgreement,
      now: new Date(),
    })
  }

  /**
   * Positionner — la porte G4.
   *
   * Déclarée au catalogue des portes depuis le socle et JAMAIS franchie : poser
   * un profil chez un client, le geste qui engage la crédibilité de l'ESN, ne
   * laissait aucune trace. Il en laisse une désormais, et elle porte ce qui
   * MANQUAIT au moment de décider — savoir six mois plus tard qu'on a poussé un
   * profil déjà refusé, sur une disponibilité non revalidée, est la seule chose
   * qui explique le résultat.
   *
   * Un consentement expiré REFUSE. Ce n'est pas un avertissement de plus :
   * proposer quelqu'un dont on n'a plus le droit de détenir les données n'est
   * pas un arbitrage commercial.
   */
  @Post('needs/:id/submissions')
  @RequirePermission('records:write')
  async positionCandidate(
    @Param('id') needId: string,
    @Body() body: { runId: string; consultantId: string; acknowledgement?: string; prepare?: PreparableAction[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const canReadFinance = can(role, [], 'finance:read')
    const replayed = await this.matching.replay(
      body.runId,
      [body.consultantId],
      workspaceId,
      user.userId,
      canReadFinance,
    )
    const result = replayed?.results[0]
    if (!replayed || !result) throw new NotFoundException('Ce classement est introuvable')
    const context = await this.matching.submissionContext(needId, body.consultantId, workspaceId)
    if (!context) throw new NotFoundException('Ce besoin est introuvable dans cet espace')
    const candidate = (
      await this.matching.loadCandidates(workspaceId, user.userId, replayed.need, [body.consultantId])
    )[0]
    const preflight = submissionPreflight(replayed.need, result, {
      consentState: candidate?.consentState ?? 'none',
      consentExpiresAt: context.consentExpiresAt,
      availabilityCheckedAt: context.availabilityCheckedAt,
      accountConsent: context.accountConsent,
      positioningAgreement: context.positioningAgreement,
      now: new Date(),
    })

    if (preflight.blocked) {
      if (workspaceId) {
        await this.gates.record(workspaceId, user.userId, {
          gate: 'submission_send',
          decision: 'refuse',
          subject: 'consultant',
          subjectId: body.consultantId,
          reason: preflight.checks.find(check => check.level === 'blocking')?.label ?? 'positionnement refusé',
          missing: preflight.missing,
        })
      }
      throw new BadRequestException(
        preflight.checks.find(check => check.level === 'blocking')?.label ?? 'Positionnement refusé',
      )
    }

    // #2558.1 — un besoin existe sans projet, mais `submissions.project_id`
    // est encore `NOT NULL` : positionner sur un besoin sans projet demande
    // d'ouvrir CETTE contrainte-là aussi, et ce n'est pas fait. On le DIT,
    // plutôt que d'inventer un projet pour faire passer l'écriture — c'est
    // exactement la donnée vide que ce lot supprime par ailleurs.
    if (context.projectId === null) {
      throw new BadRequestException(
        'Ce besoin n’est rattaché à aucun projet : le positionnement passe encore par un projet. Rattache-le à un projet pour positionner un consultant.',
      )
    }

    const submission = await this.submissions.create(user.userId, {
      projectId: context.projectId,
      consultantId: body.consultantId,
      needId,
      stage: 'shortlisted',
      proposedRateCents: null,
    })
    await this.matching.stampPushableScore(submission.id, result.pushableScore)

    if (workspaceId) {
      // `force` quand il restait des points d'attention : ce n'est ni un
      // `accept` ni une faute. Décider sans tout savoir est le quotidien du
      // commerce ; le distinguer est ce qui rend le journal relisable.
      await this.gates.record(workspaceId, user.userId, {
        gate: 'submission_send',
        decision: preflight.missing.length > 0 ? 'force' : 'accept',
        subject: 'consultant',
        subjectId: body.consultantId,
        reason:
          preflight.missing.length > 0
            ? body.acknowledgement?.trim() || `Positionné malgré : ${preflight.missing.join(', ')}`
            : undefined,
        missing: preflight.missing,
      })
    }

    return { submission, preflight, prepared: body.prepare ?? [] }
  }

  /**
   * Le dossier de compétences, composé DEPUIS le matching (§12).
   *
   * Ce qui change par rapport au studio ouvert depuis une fiche : la cible est
   * le besoin, les compétences barrées sont celles que LE CLIENT demandait et
   * que le profil ne prouve pas, et elles sont reprises mot pour mot du
   * classement. Reformuler entre les deux écrans ferait diverger ce qu'on dit en
   * interne et ce qu'on écrit au client.
   */
  @Post('needs/:id/match/dossier')
  @RequirePermission('records:write')
  async buildDossier(
    @Param('id') needId: string,
    @Body() body: { runId: string; consultantId: string; language?: 'fr' | 'en' },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const replayed = await this.matching.replay(
      body.runId,
      [body.consultantId],
      workspaceId,
      user.userId,
      can(role, [], 'finance:read'),
    )
    const result = replayed?.results[0]
    if (!replayed || !result) throw new NotFoundException('Ce classement est introuvable')
    return this.studio.generate(
      body.consultantId,
      workspaceId,
      user.userId,
      {
        versionKind: 'client',
        // La cible est PRÉ-REMPLIE et non modifiable ici : composer un dossier
        // « pour ce besoin » puis l'envoyer ailleurs est la façon la plus simple
        // d'envoyer au client A le dossier taillé pour le client B.
        needId,
        templateKey: 'default',
        language: body.language ?? 'fr',
      },
      unprovenFromMatch(result),
    )
  }

  /**
   * Le message au client, PRÉPARÉ (§12.1).
   *
   * On prépare, le commercial envoie — par le chemin d'envoi existant, qui porte
   * déjà l'opt-out et les pièces jointes réelles. Un second chemin d'envoi
   * serait un second endroit où oublier une désinscription.
   */
  @Post('needs/:id/match/client-message')
  @RequirePermission('records:write')
  async clientMessage(
    @Param('id') needId: string,
    @Body() body: { runId: string; consultantIds: string[] },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const canReadFinance = can(role, [], 'finance:read')
    const replayed = await this.matching.replay(
      body.runId,
      body.consultantIds,
      workspaceId,
      user.userId,
      canReadFinance,
    )
    if (!replayed) throw new NotFoundException('Ce classement est introuvable')
    const identities = await this.matching.identitiesFor(body.consultantIds, workspaceId, user.userId)
    const showRate = canReadFinance && (await this.matching.showsRateInClientMessage(workspaceId))
    const profiles: PitchProfile[] = replayed.results.map(result => {
      const identity = identities.get(result.consultantId)
      return {
        displayName: identity?.fullName ?? '',
        title: identity?.title ?? null,
        availability: result.axes.find(axis => axis.axis === 'availability')?.detail ?? 'disponibilité à confirmer',
        strengths: topStrengths(result),
        dailyRateCents: identity?.dailyRateCents ?? null,
      }
    })
    const recipient = await this.matching.pushRecipient(needId, workspaceId)
    return {
      recipient,
      subject: clientMessageSubject(replayed.need, profiles.length),
      body: clientMessageBody(replayed.need, profiles, { showRate, signature: null }),
      showRate,
    }
  }

  /**
   * Le dossier est PARTI : le positionnement avance, et les relances sont posées.
   *
   * J+3 et J+7 sont des TÂCHES, pas des envois automatiques. Le PDF les
   * annonçait comme existantes ; elles n'existaient pas, et le seul mécanisme du
   * dépôt était une alerte interne à J+14. Une relance qui partirait seule chez
   * un client trois jours après un envoi n'est pas ce qu'on veut installer sans
   * que personne ne l'ait demandé.
   */
  @Post('submissions/:id/sent')
  @RequirePermission('records:write')
  async markSent(
    @Param('id') submissionId: string,
    @Body() body: { accountId?: string; projectId?: string; label?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const submission = await this.submissions.advance(user.userId, submissionId, { stage: 'submitted' })
    const label = body.label?.trim() || 'ce profil'
    for (const days of [3, 7]) {
      await this.tasks.create(user.userId, {
        title: `Relancer le client sur ${label} (J+${days})`,
        dueOn: addDays(days),
        priority: 'normal',
        // #2395.8 (épopée #2871) — le seul appelant de ce chemin.
        objective: `Obtenir un retour du client sur ${label}.`,
        expectedResult: `Une réponse du client sur ${label}, positive ou négative.`,
        ...(body.projectId ? { projectId: body.projectId } : {}),
        ...(body.accountId ? { accountId: body.accountId } : {}),
      })
    }
    return submission
  }

  /**
   * La calibration (§14, BEL-MTC-305).
   *
   * Réservée à l'administration : un taux d'entretiens par tranche est un
   * indicateur de PILOTAGE, pas une information à mettre sous les yeux d'un
   * commercial pendant qu'il choisit un profil.
   */
  @Get('matching/calibration')
  @RequirePermission('team:manage')
  async calibration(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return calibrate(await this.matching.scoredSubmissions(workspaceId))
  }

  @Get('matching/weights')
  async weights(@CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const current = await this.matching.weightsFor(workspaceId)
    const versions = await this.matching.listWeightVersions(workspaceId)
    return {
      weights: current.weights,
      threshold: current.threshold,
      versions: versions.map(version => ({
        id: version.id,
        weights: version.weights,
        threshold: version.threshold,
        createdAt: version.created_at.toISOString(),
      })),
    }
  }

  /** Modifier la pondération est un geste d'ADMINISTRATION (§16.1). */
  @Put('matching/weights')
  @RequirePermission('team:manage')
  async setWeights(@Body() body: UpdateMatchWeightsDto, @CurrentUser() user: CurrentUserPayload) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    return this.matching.saveWeights(workspaceId, user.userId, body)
  }
}

/**
 * Une échéance à J+n, au format jour, sur l'horloge de celui qui la reçoit.
 *
 * ⚠️ Passait par `toISOString().slice(0, 10)` : entre minuit et 02 h 00 à Paris
 * en heure d'été, l'instant UTC est encore la veille, et une échéance à J+7
 * était donc posée à J+6. Corrigé le 01/09/2026 ; la dérivation vit désormais
 * dans `@bellum/contracts` (`shiftLocalDays`), une seule fois.
 */
function addDays(days: number): string {
  return shiftLocalDays(new Date(), days)
}
