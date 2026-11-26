import { Body, Controller, Get, HttpCode, Logger, Post, Put, UseGuards } from '@nestjs/common'
import type { z } from 'zod'
import {
  ESN_ANSWER_OPTIONS,
  ONBOARDING_MAX_MULTI,
  PREFILLABLE_ANSWER_KEYS,
  PREFILL_MAX_CANDIDATES,
  esnAnswersSchema,
  applyFieldUpdates,
  esnPrefillResponseSchema,
  isAnswerFilled,
} from '@bellum/contracts'
import type {
  AnswerMetaMap,
  CompanySuggestion,
  EsnAnswers,
  EsnPrefillResponse,
  EsnProfileCorrectionRequest,
  EsnProfileWorkspaceMeta,
  FieldSource,
  MarketEsnViewRead,
  PrefillCandidate,
  PrefilledField,
  ProfileContextResponse,
  ResolvedPortfolio,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { IaClient } from '../ia/ia.client'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ProfileContextService } from '../profile-context/profile-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CreateEsnProfileCorrectionRequestDto } from './dto/create-esn-profile-correction-request.dto'
import { PrefillEsnProfileDto } from './dto/prefill-esn-profile.dto'
import { RegenerateProfileContextSectionDto } from './dto/regenerate-profile-context-section.dto'
import { ConfirmAnswerDto } from './dto/confirm-answer.dto'
import { SkipQuestionDto } from './dto/skip-question.dto'
import { UpdateEsnProfileDto } from './dto/update-esn-profile.dto'
import { UpdateOfferPortfolioDto } from './dto/update-offer-portfolio.dto'
import { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'
import { EsnProfileService } from './esn-profile.service'
import { OfferPortfolioService } from './offer-portfolio.service'

/** Per-answer Zod shape, used to re-check a prefilled value against the SAME
 *  schema the write path (`PUT /esn-profile`) will enforce — array caps, enums
 *  and nullability included. `z.ZodType<unknown>` keeps `safeParse` honest
 *  (`data: unknown`) instead of leaking `any`. */
const ANSWER_SHAPES: Record<string, z.ZodType<unknown>> = esnAnswersSchema.shape

/** Closed value catalog, widened for lookup by an untrusted string key. */
const ANSWER_CATALOG: Record<string, readonly string[] | undefined> = ESN_ANSWER_OPTIONS

/** The empty proposal — the onboarding falls back to the manual questionnaire. */
function emptyPrefill(): EsnPrefillResponse {
  return { matched: false, company: null, fields: {}, candidates: [], ambiguous: false }
}

/** #2626.2 — une PREMIÈRE sélection, pas une recherche complète : cinq cartes
 *  au plus, le temps d'un aperçu avant la génération longue. */
const FIRST_SELECTION_LIMIT = 5

/**
 * Defensive pass on the homonym list the IA proposes.
 *
 * A candidate without a SIREN cannot be re-submitted (the front pins the SIREN
 * to skip the disambiguation), so it is dropped rather than rendered as an
 * unclickable row. The list is capped server-side too: the cap is a product
 * rule, and the API does not take the IA's word for how many rows a human
 * should arbitrate between.
 */
function sanitizeCandidates(candidates: PrefillCandidate[]): PrefillCandidate[] {
  return candidates.filter(c => /^\d{9}$/.test(c.siren) && c.name.trim().length > 0).slice(0, PREFILL_MAX_CANDIDATES)
}

/** True when `candidate` survives the answer schema for `key`. Schemas that end
 *  in `.catch(null)` (offer_domain) "succeed" by degrading an unknown value to
 *  null — that is a rejection here, not an acceptance. */
function isAcceptedAnswer(key: string, candidate: string | string[]): boolean {
  const shape = ANSWER_SHAPES[key]
  if (!shape) return false
  const result = shape.safeParse(candidate)
  return result.success && isAnswerFilled(result.data as string | string[] | null)
}

/**
 * Restricts one prefilled value to what the product actually allows, or returns
 * `null` to drop the field. Order matters: catalog first (drops fabricated
 * options), then the answer schema (types, enums, multi-select caps).
 */
function sanitizeAnswerValue(key: string, value: string | string[]): string | string[] | null {
  const allowed = ANSWER_CATALOG[key]
  let candidate: string | string[] = value
  if (allowed) {
    if (Array.isArray(candidate)) candidate = candidate.filter(option => allowed.includes(option))
    else if (!allowed.includes(candidate)) return null
  }
  if (Array.isArray(candidate) && candidate.length === 0) return null
  if (isAcceptedAnswer(key, candidate)) return candidate
  // Only remaining legitimate failure: an over-filled multi-select. Keep the
  // first N rather than losing the whole (grounded) answer.
  if (Array.isArray(candidate)) {
    const capped = candidate.slice(0, ONBOARDING_MAX_MULTI)
    if (capped.length > 0 && isAcceptedAnswer(key, capped)) return capped
  }
  return null
}

/**
 * Defensive server-side re-validation of the IA's proposal. Iterating
 * {@link PREFILLABLE_ANSWER_KEYS} (rather than the payload's own keys) drops
 * `sales_team_size` / `main_sales_pain` and any unknown key by construction:
 * those two have no public source / belong to the member, so proposing them
 * would be fabricated data.
 *
 * The API never trusts an upstream service for something that ends up in the
 * database — even though the IA validates too.
 */
function sanitizePrefilledFields(fields: Record<string, PrefilledField>): Record<string, PrefilledField> {
  const sanitized: Record<string, PrefilledField> = {}
  for (const key of PREFILLABLE_ANSWER_KEYS) {
    const field = fields[key]
    if (!field) continue
    const value = sanitizeAnswerValue(key, field.value)
    if (value === null) continue
    sanitized[key] = { ...field, value }
  }
  return sanitized
}

/**
 * #2028.6 / #2028.7 — NE PROPOSE QUE CE QUI N'ÉCRASE RIEN.
 *
 * Le prefill n'écrit rien, et ce n'est pas suffisant : ce qu'il PROPOSE revient
 * avec son badge « d'après le registre », par-dessus une valeur que quelqu'un a
 * corrigée à la main. Sur le chemin de reconfiguration (#2022), la session est
 * neuve — la protection en mémoire d'`applyPrefill` (`onboardingStore.ts`) ne
 * couvre pas ce cas, et c'est précisément le cas où la donnée publique a eu le
 * temps de changer.
 *
 * L'arbitrage n'est pas réécrit ici : `applyFieldUpdates` (contrats) est le
 * même arbitre que toute autre écriture de champ du dépôt.
 *
 * ⚠️ POURQUOI `human` POUR L'EXISTANT. Une réponse présente dans `esn_profiles`
 * y est arrivée par un geste de la personne : elle l'a tapée, ou elle a
 * CONFIRMÉ une suggestion — et le clic EST la décision (D9). La traiter en
 * `pipeline` (le défaut `UNKNOWN_PROVENANCE_SOURCE`) laisserait le registre
 * repasser devant, ce qui est exactement ce que ces deux points refusent.
 *
 * ⚠️ Un BLANC ne protège rien (`decideFieldWrite`, « le champ est vide côté
 * base : il n'y a rien à protéger ») — une question restée vide n'est pas une
 * correction, et un nouveau venu doit garder son préremplissage.
 *
 * #2028.7 — ET PAS EN SILENCE. La fonction rend AUSSI les clés qu'elle a
 * protégées, parce que « le registre n'a rien trouvé » et « le registre a été
 * écarté pour ne pas défaire une correction » se ressemblent exactement vus
 * d'ici : dans les deux cas la clé est absente de la réponse. Seuls les refus
 * qui protègent quelque chose (`lower_authority`) sont rendus — une valeur
 * publique redevenue identique à la réponse est refusée elle aussi
 * (`unchanged`), mais elle n'a défendu aucune correction, et la tracer noierait
 * le signal sous le cas le plus fréquent.
 */
function keepWhatNeverOverwrites(
  fields: Record<string, PrefilledField>,
  current: EsnAnswers | null,
): { kept: Record<string, PrefilledField>; protectedKeys: string[] } {
  if (!current) return { kept: fields, protectedKeys: [] }
  const incoming: Record<string, unknown> = {}
  const currentSources: Record<string, FieldSource> = {}
  for (const [key, field] of Object.entries(fields)) {
    incoming[key] = field.value
    currentSources[key] = 'human'
  }
  const { accepted, rejected } = applyFieldUpdates({
    incoming,
    incomingSource: 'pipeline',
    current: current as unknown as Record<string, unknown>,
    currentSources,
  })
  const kept: Record<string, PrefilledField> = {}
  for (const key of Object.keys(accepted)) {
    const field = fields[key]
    if (field) kept[key] = field
  }
  const protectedKeys = rejected.filter(r => r.reason === 'lower_authority').map(r => r.field)
  return { kept, protectedKeys }
}

@Controller('esn-profile')
// `WorkspacePermissionGuard` monté le 29/08/2026 : les deux routes du
// portefeuille d'offre déclaraient `team:manage` depuis le 24/08 sans que
// personne ne le lise — tout membre de l'espace lisait et écrivait le profil
// de la SOCIÉTÉ. Le décorateur pose une métadonnée ; sans son guard, il est
// décoratif. GA-05 bis tient désormais la paire.
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class EsnProfileController {
  private readonly logger = new Logger(EsnProfileController.name)

  constructor(
    private readonly esnProfile: EsnProfileService,
    private readonly offerPortfolio: OfferPortfolioService,
    private readonly profileContext: ProfileContextService,
    private readonly ia: IaClient,
    /**
     * #1636 — LE DERNIER PARAMÈTRE, et c'est délibéré : `esn-profile.controller.spec.ts`
     * construit ce contrôleur POSITIONNELLEMENT. Un paramètre inséré au milieu
     * décalerait ses quatre arguments sans que rien ne jette — la façade
     * répondrait juste avec le mauvais service.
     *
     * ⚠️ Un service d'un module VOISIN, importé dans un `.controller.ts` :
     * c'est la couche que §3.2 désigne pour ça, et le SEUL endroit hors
     * `*.module.ts` que GA-07 laisse passer (`module-boundaries.spec.ts` :
     * « les `*.controller.ts` sont la couche où l'appelant est connu »).
     * `companies.controller.ts` injecte le même service pour la même raison.
     */
    private readonly marketMemory: MarketMemoryService,
    /**
     * #2018.7 — le service de signalement, EN DERNIER (même raison que
     * `marketMemory` juste au-dessus) : `esn-profile.controller.spec.ts`
     * construit ce contrôleur POSITIONNELLEMENT.
     */
    private readonly correctionRequests: EsnProfileCorrectionRequestService,
  ) {}

  @Get()
  async getMine(@CurrentUser() user: CurrentUserPayload): Promise<EsnAnswers> {
    const answers = await this.esnProfile.getAnswers(user.userId)
    return answers
  }

  /**
   * #2006.22 — le statut PAR CLÉ (confirmé / proposé / corrigé / inconnu),
   * séparé de `GET /esn-profile` plutôt que d'élargir sa forme : `EsnAnswers`
   * reste consommé tel quel par tous ses lecteurs actuels (analyse, chat,
   * discover, messages), et cette route est UNIQUEMENT lue par l'écran des
   * réponses (Réglages › Profil) qui a besoin du statut.
   */
  @Get('answer-status')
  async getAnswerStatus(@CurrentUser() user: CurrentUserPayload): Promise<AnswerMetaMap> {
    return this.esnProfile.getAnswerMeta(user.userId)
  }

  /** How the caller's ESN profile is shared inside their workspace (canonical
   *  company profile vs personal overlay) — powers the Réglages › Profil split. */
  @Get('workspace')
  async getWorkspaceMeta(@CurrentUser() user: CurrentUserPayload): Promise<EsnProfileWorkspaceMeta> {
    return this.esnProfile.getWorkspaceMeta(user.userId)
  }

  /**
   * #1636 — CE QUE LA MÉMOIRE MARCHÉ OBSERVE DE L'ENTREPRISE DE L'ESPACE.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI LE FRONT N'ENVOIE PAS LE NOM
   * ───────────────────────────────────────────────────────────────────────────
   * `GET /companies/market-preview` existe et prendrait un nom en paramètre —
   * l'écran aurait pu l'appeler avec `answers.esn_name` sans une ligne d'API.
   * Deux raisons de ne pas le faire, et la seconde est la vraie :
   *
   * · **Le serveur résout le profil, jamais le client** (`EsnProfileReader` :
   *   « le front envoie uniquement l'intention utilisateur et les identifiants ;
   *   le backend résout le profil »). Un écran qui choisit lui-même QUELLE
   *   entreprise interroger devient un second chemin de résolution, et deux
   *   chemins divergent au premier profil partagé qui change de nom.
   * · **La preview n'a pas la bonne forme** : elle regarde une entreprise comme
   *   un CLIENT et ne porte ni destinations ni nom d'entreprise rapprochée —
   *   c'est-à-dire ni le contenu que #1636 demande, ni ce qui rend le
   *   rapprochement par nom vérifiable par l'utilisateur.
   *
   * ⚠️ **`undeclared` n'est PAS `insufficient`.** Sans nom d'entreprise on n'a
   * RIEN cherché : annoncer « pas suffisamment couverte » ferait porter à la
   * mémoire marché un silence qui vient du profil. C'est le défaut « un écran
   * qui lit ce qui MANQUE sans lire l'INTERRUPTEUR annonce une panne au repos ».
   *
   * ⚠️ **Aucun `country` n'est passé**, alors que l'espace en porte un
   * (`workspaces.market`). C'est le SEUL départage supplémentaire que le corpus
   * permet, et il ne peut qu'AJOUTER des rapprochements — l'omettre laisse deux
   * homonymes `ambiguous`, donc muets, ce qui est la réponse sûre pour un bloc
   * qui dit « ton entreprise ». Le jour où le profil ESN portera un pays SAISI
   * (et non déduit du marché de facturation), il aura sa place ici.
   */
  @Get('market-memory')
  // D39 — une LECTURE d'espace, marquée comme telle (GA-05). Elle n'écrit rien,
  // ne débite aucun crédit, ne sort pas de l'espace, et il n'existe aucune
  // permission qui décrive « lire le profil de sa propre société » : la fermer
  // derrière une permission d'ÉCRITURE en priverait `viewer` et `tech_admin`,
  // qui lisent déjà `GET /esn-profile` juste au-dessus.
  @WorkspaceRead()
  async getMarketMemory(@CurrentUser() user: CurrentUserPayload): Promise<MarketEsnViewRead> {
    const answers = await this.esnProfile.getAnswers(user.userId)
    const name = answers.esn_name?.trim() ?? ''
    if (name.length === 0) return { status: 'undeclared' }
    return this.marketMemory.esnViewFor({ ref: 'workspace-esn', name })
  }

  /**
   * Propose a prefilled questionnaire from the ESN name typed at onboarding.
   *
   * WRITES NOTHING — the user must be able to review and correct before anything
   * is persisted, and an existing profile must never be overwritten by a guess.
   * The front saves the accepted answers through `PUT /esn-profile`.
   *
   * Always 200: when the IA is down, slow or answers something malformed, the
   * caller gets an empty proposal and the manual questionnaire keeps working.
   */
  @Post('prefill')
  @HttpCode(200)
  async prefill(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PrefillEsnProfileDto,
  ): Promise<EsnPrefillResponse> {
    try {
      // #2640.1 — l'e-mail du commercial CONNECTÉ (jamais saisi par lui) pour
      // départager le site retenu par un domaine pro, avant le premier
      // résultat nommé.
      const raw = await this.ia.prefillEsnProfile({ name: dto.name, siren: dto.siren ?? null, email: user.email })
      const parsed = esnPrefillResponseSchema.safeParse(raw)
      if (!parsed.success) {
        this.logger.error('ESN prefill: malformed IA response — falling back to the manual questionnaire', {
          error: parsed.error,
          tags: { 'prefill.error': 'malformed_response' },
          user: { id: user.userId },
        })
        return emptyPrefill()
      }
      const candidates = sanitizeCandidates(parsed.data.candidates)
      // #2028.6 / #2028.7 — ce que la personne a déjà répondu, pour ne pas le
      // lui reproposer. Lu AVANT de composer la réponse : la décision est prise
      // sur les réponses de l'ESPACE (`getAnswers` résout la fiche canonique
      // + l'overlay personnel), donc une correction de l'owner protège aussi
      // les membres.
      const current = await this.currentAnswersOrNull(user.userId)
      // An "ambiguous" verdict with nothing left to arbitrate would trap the user
      // on an empty list: degrade to the plain "no match" path, which always
      // offers the manual questionnaire.
      const ambiguous = parsed.data.ambiguous && candidates.length > 0
      // Nothing is ever proposed alongside an unresolved identity.
      const arbitrated = ambiguous
        ? { kept: {}, protectedKeys: [] }
        : keepWhatNeverOverwrites(sanitizePrefilledFields(parsed.data.fields), current)
      // #2028.7 — le refus est DIT. Les clés seulement : la trace prouve qu'une
      // correction a tenu, elle ne recopie pas ce que la personne a écrit.
      if (arbitrated.protectedKeys.length > 0) {
        this.logger.log('ESN prefill : une correction déjà saisie n’est pas reproposée', {
          tags: {
            'prefill.protected_fields': arbitrated.protectedKeys.join(','),
            'prefill.protected_count': arbitrated.protectedKeys.length,
          },
          user: { id: user.userId },
        })
      }
      return {
        matched: parsed.data.matched && !ambiguous,
        company: ambiguous ? null : parsed.data.company,
        fields: arbitrated.kept,
        candidates,
        ambiguous,
      }
    } catch (err) {
      this.logger.error('ESN prefill failed — falling back to the manual questionnaire', {
        error: err,
        tags: { 'prefill.error': 'ia_unavailable' },
        user: { id: user.userId },
      })
      return emptyPrefill()
    }
  }

  /**
   * #2028.6 / #2028.7 — les réponses déjà données, ou `null` quand on n'a pas
   * pu les lire.
   *
   * ⚠️ `null` n'est PAS « profil vierge », et c'est toute la différence : lire
   * l'absence comme un vide reviendrait à autoriser le registre à reproposer
   * par-dessus une correction dont on vient juste d'échouer à lire l'existence.
   * On garde donc le comportement d'AVANT (la proposition complète — le prefill
   * n'écrit rien, le badge et le geste de confirmation décident), et on le DIT
   * dans le journal plutôt que de le taire.
   */
  private async currentAnswersOrNull(userId: string): Promise<EsnAnswers | null> {
    try {
      return (await this.esnProfile.getAnswers(userId)) ?? null
    } catch (error) {
      this.logger.error('ESN prefill: profil illisible — la protection anti-écrasement ne peut pas s’appliquer', {
        error,
        tags: { 'prefill.error': 'current_answers_unreadable' },
        user: { id: userId },
      })
      return null
    }
  }

  /**
   * #2626.2 — une première sélection de comptes RÉELS, à la fin du Temps 1
   * (écran de relecture), avant le lancement de la génération longue (3-6
   * min). Ce n'est pas une nouvelle recherche : c'est la raison tangible
   * d'avoir répondu, avant même que l'audit ne tourne.
   *
   * Dérivée du PREMIER secteur ciblé déjà répondu (`target_sectors`, l'une des
   * 10 clés `TEMPS1_REQUIRED_KEYS`) via le MÊME moteur de découverte que
   * « comptes similaires à explorer » (`AccountsService.listSimilarCompaniesToExplore`,
   * `IaClient.discoverCompanies`) — jamais un second chemin de recherche.
   *
   * Toujours 200, jamais de donnée devinée : un profil pas encore assez
   * rempli ou une découverte en échec rendent tous deux une liste vide plutôt
   * qu'une supposition — l'écran n'affiche alors rien (GA-18/19 : une valeur
   * absente ne s'affiche jamais « 0 »), il ne ment pas en zéro.
   */
  @Get('first-selection')
  @HttpCode(200)
  async firstSelection(@CurrentUser() user: CurrentUserPayload): Promise<{ suggestions: CompanySuggestion[] }> {
    const answers = await this.currentAnswersOrNull(user.userId)
    const seed = answers?.target_sectors?.[0]?.trim()
    if (!seed) return { suggestions: [] }
    try {
      const result = await this.ia.discoverCompanies(seed, FIRST_SELECTION_LIMIT, {
        timeoutMs: 12_000,
        maxAttempts: 1,
      })
      return { suggestions: (result.suggestions ?? []).slice(0, FIRST_SELECTION_LIMIT) }
    } catch (error) {
      this.logger.warn('ESN first selection: découverte indisponible — rendue vide plutôt que devinée', {
        error,
        tags: { 'first_selection.error': 'discovery_unavailable' },
        user: { id: user.userId },
      })
      return { suggestions: [] }
    }
  }

  @Put()
  async updateMine(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateEsnProfileDto): Promise<EsnAnswers> {
    const answers = await this.esnProfile.upsertAnswers(user.userId, dto)
    // D9 — la réédition d'un champ depuis Réglages › Profil. Cette route édite
    // UN écran de réponses d'un seul geste : elle n'a pas de sous-étapes, donc
    // #2022.7 ne la concerne pas et son comportement ne change pas.
    // ⚠️ Depuis #2022.7, c'est le SEUL déclencheur de ce chemin :
    // `upsertAnswers` n'en lance plus (la génération du questionnaire part de
    // sa complétion). Le retirer ici couperait la régénération de cet écran.
    await this.profileContext.triggerGeneration(user.userId, answers, { reedited: true })
    return answers
  }

  /**
   * #2007.11 — noter qu'une question du questionnaire a été PASSÉE
   * (`ProfileQuestionnaireDialog.tsx`, bouton « passer »), nommément : ni une
   * valeur `null`, ni une absence muette qui se lirait comme « pas encore
   * répondu » au lieu de « refusée sciemment pour l'instant ». `@Post`, pas
   * `@Put` : ce geste AJOUTE une clé, il ne remplace jamais le profil.
   */
  @Post('skip-question')
  @HttpCode(200)
  @RequirePermission('records:write')
  async skipQuestion(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SkipQuestionDto,
  ): Promise<{ skippedQuestionKeys: string[] }> {
    const skippedQuestionKeys = await this.esnProfile.skipQuestion(user.userId, dto.key)
    return { skippedQuestionKeys }
  }

  /**
   * #4425.4 — « Confirmer » une réponse sans la réécrire (voir
   * {@link EsnProfileService.confirmAnswer}). `@Post` : ce geste ajoute un
   * statut, il ne remplace jamais le profil. Le verrou de rôle (membre d'un
   * espace partagé sur un champ d'entreprise) vit dans le service.
   */
  @Post('confirm-answer')
  @HttpCode(200)
  @RequirePermission('records:write')
  async confirmAnswer(@CurrentUser() user: CurrentUserPayload, @Body() dto: ConfirmAnswerDto): Promise<AnswerMetaMap> {
    return this.esnProfile.confirmAnswer(user.userId, dto.key)
  }

  @Post('regenerate-context')
  @HttpCode(202)
  async regenerate(@CurrentUser() user: CurrentUserPayload): Promise<EsnAnswers> {
    const answers = await this.esnProfile.regenerateProfileContext(user.userId)
    return answers
  }

  /**
   * #2908 (#2010.16 / #2011.10) — « Régénérer cette section » : voir
   * {@link ProfileContextService.regenerateSection} pour la doctrine.
   * `@HttpCode(200)`, pas `202` comme `regenerate-context` ci-dessus : cette
   * route ATTEND le résultat (pas de suivi par socket pour une section seule)
   * et rend le contexte déjà à jour.
   */
  @Post('regenerate-context-section')
  @HttpCode(200)
  @RequirePermission('records:write')
  async regenerateSection(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegenerateProfileContextSectionDto,
  ): Promise<ProfileContextResponse> {
    return this.esnProfile.regenerateProfileContextSection(user.userId, dto.section)
  }

  /**
   * Le portefeuille d'offre de la société (addendum Stelya §5).
   *
   * Séparé du questionnaire à dessein : ce sont des POLITIQUES (secteurs
   * d'application, sites visés, lexique, réutilisation des retours), pas des
   * réponses. Les mêler aux réponses aurait fait porter au parcours
   * d'onboarding des réglages qui s'éditent une fois par an.
   *
   * La réponse porte `source` : un écran doit pouvoir dire « rien n'est encore
   * configuré » plutôt qu'afficher des défauts comme un choix.
   *
   * `team:manage` en LECTURE aussi, et c'est délibéré : c'est le profil de la
   * société, au même titre que l'équipe et les sièges. Le produit, lui, ne
   * passe pas par ici — analyses et prompts lisent le portefeuille côté serveur
   * via {@link OfferPortfolioService}, sans HTTP ni rôle à faire valoir.
   */
  @Get('offer-portfolio')
  @RequirePermission('team:manage')
  async getOfferPortfolio(@CurrentUser() user: CurrentUserPayload): Promise<ResolvedPortfolio> {
    return this.offerPortfolio.read(user.userId)
  }

  /** Écriture PARTIELLE : ce qui n'est pas dans le corps n'est pas touché. */
  @Put('offer-portfolio')
  @RequirePermission('team:manage')
  async putOfferPortfolio(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateOfferPortfolioDto,
  ): Promise<ResolvedPortfolio> {
    return this.offerPortfolio.write(user.userId, dto)
  }

  /**
   * #2018.7 — signaler une information d'entreprise fausse, SANS l'écraser.
   *
   * N'ÉCRIT JAMAIS `esn_profiles` : voir {@link EsnProfileCorrectionRequestService},
   * qui n'injecte aucun dépôt du profil. La correction reste le geste de qui a
   * `team:manage`, sur `PUT /esn-profile` ci-dessus.
   *
   * `profile:report` (pas `team:manage`) : ouvert à qui NE PEUT PAS écrire le
   * profil canonique — c'est tout le sens du point. `viewer` en reste exclu
   * (strictement lecture seule, refusé sur toute mutation).
   */
  @Post('correction-requests')
  @HttpCode(201)
  @RequirePermission('profile:report')
  async reportCorrection(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEsnProfileCorrectionRequestDto,
  ): Promise<EsnProfileCorrectionRequest> {
    return this.correctionRequests.create(user.userId, dto)
  }
}
