import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards, ConflictException } from '@nestjs/common'
import {
  WRITABLE_IMPORT_OBJECTS,
  importApplySchema,
  isWritableImportObject,
  importDryRunSchema,
  isReadableImportFormat,
  type DryRunReport,
  type ImportMapping,
  type ImportObject,
  type ImportSourceDetection,
  type MappingConfidence,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { IMPORT_CATALOG, receivableFields } from './import-catalog'
import { ImportWriterService } from './import-writer.service'
import { ImportService, type ImportRejectedRow, type ImportTargetListOutcome } from './import.service'
import { RestitutionService } from './restitution.service'

/**
 * L'assistant d'import — `/import/*` (BEL-INT-602).
 *
 * Trois routes, et l'ordre entre elles EST la fonctionnalité : on choisit une
 * source, on simule, et alors seulement on écrit. `apply` refuse tant que la
 * simulation n'est pas enregistrée — c'est la seule garde qui protège une base
 * héritée, et le ticket demande d'écrire son test en premier.
 *
 * Permission `data:export` : la même que l'import en masse de contacts existant.
 * Reprendre une base est un geste d'administration, pas de prospection.
 */

/** Un identifiant de session qui n'en est pas un ne va pas jusqu'a la base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Controller('import')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
@RequirePermission('data:export')
export class ImportController {
  /**
   * ⚠️ L'espace actif se résout ICI et se passe au service.
   *
   * GA-07 est au plafond, et le cliquet compte les imports service → service.
   * Le contrôleur en est exempt — parce que c'est là que vit un geste
   * d'utilisateur, et « quel espace regarde cette personne » en est un.
   */
  constructor(
    private readonly imports: ImportService,
    private readonly writer: ImportWriterService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly restitution: RestitutionService,
  ) {}

  private async workspaceOf(userId: string): Promise<string> {
    return (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
  }

  /**
   * Les propriétaires reconnus de l'espace — nom complet ET adresse, en
   * minuscules, parce qu'un ancien CRM exporte l'un ou l'autre selon la colonne.
   *
   * Une lecture en échec rend `undefined`, pas un ensemble vide : un ensemble
   * vide ferait écarter TOUTES les lignes portant un propriétaire, et refuser un
   * import de 17 000 lignes parce qu'une requête a raté serait pire que de
   * laisser passer un propriétaire inconnu.
   */
  private async knownOwnerKeys(userId: string): Promise<Set<string> | undefined> {
    try {
      const members = await this.workspaceContext.listMembers(userId)
      const keys = new Set<string>()
      for (const member of members) {
        if (member.email) keys.add(member.email.trim().toLowerCase())
        if (member.fullName) keys.add(member.fullName.trim().toLowerCase())
      }
      return keys.size > 0 ? keys : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Étape 1 — le catalogue des sources.
   *
   * Chaque carte dit ce qu'elle IMPORTE et ce qu'elle N'IMPORTE PAS. La seconde
   * moitié est celle qui évite les mauvaises surprises : quelqu'un qui croit
   * importer ses pièces jointes ne le découvre pas trois semaines plus tard.
   */
  @Get('sources')
  sources() {
    return IMPORT_CATALOG.map(source => ({
      key: source.key,
      objects: source.objects,
      format: source.format,
      // Le format est-il lu aujourd'hui ? Sans ce champ, quatre cartes
      // affichaient un badge XLSX ou ZIP au-dessus d'un dépôt qui les refuse.
      readable: isReadableImportFormat(source.format),
      tier: source.tier,
      imports: source.imports,
      skips: source.skips,
      howTo: source.howTo,
      required: source.required,
      // Les champs auxquels une colonne peut être rattachée : c'est ce dont
      // l'étape 3 (« Corriger ») a besoin pour offrir un choix, et il n'y a
      // qu'ici qu'on le sait. Sans lui, l'écran ne pouvait que SUBIR la
      // proposition automatique — c'est pourquoi il la jetait.
      fields: receivableFields(source),
    }))
  }

  /**
   * #2080.3/.4/.6/.7/.8 — les cinq blocs de la restitution, mesures ou nommes
   * « non mesure ».
   *
   * `sessionId` est FACULTATIF, et son absence a un sens precis : sans lot, le
   * bloc « donnees manquantes » n'a rien a compter. Il rend alors `null`, pas
   * zero — un zero dirait « ton import est complet », ce qui serait faux.
   *
   * ⚠️ D58 — l'agenda lu est celui de la personne CONNECTEE, jamais celui d'un
   * autre membre de l'espace : `user.userId` et rien d'autre traverse.
   */
  @Get('restitution')
  async restitutionSummary(@CurrentUser() user: CurrentUserPayload, @Query('sessionId') sessionId?: string) {
    const clean = typeof sessionId === 'string' && UUID.test(sessionId) ? sessionId : undefined
    return this.restitution.summary(user.userId, await this.workspaceOf(user.userId), clean)
  }

  @Get('sessions')
  async list(@CurrentUser() user: CurrentUserPayload) {
    return this.imports.list(await this.workspaceOf(user.userId))
  }

  @Post('sessions')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: { source: string }) {
    return this.imports.create(user.userId, await this.workspaceOf(user.userId), body.source)
  }

  /** Étapes 2 à 6 : déposer, mapper, normaliser, dédupliquer, SIMULER. Rien n'est écrit. */
  @Post('sessions/:id/dry-run')
  @HttpCode(200)
  async dryRun(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{
    report: DryRunReport
    proposedMapping: ImportMapping
    delimiter: string
    detectedSource: ImportSourceDetection
    columnConfidence: Record<string, MappingConfidence>
    mappingSuggestions: Record<string, { field: string; confidence: 'medium' | 'low' }>
  }> {
    const input = importDryRunSchema.parse(body)
    const workspaceId = await this.workspaceOf(user.userId)
    // Les sociétés déjà connues : c'est ce qui rend la simulation FIDÈLE. Sans
    // elles, elle annonce des créations que l'écriture écartera.
    const knownParents = await this.writer.knownCompanyKeys(workspaceId)
    // Ce que la base contient DÉJÀ, pour que le rapport distingue une création
    // d'une mise à jour. Sans cette ligne, la simulation ne comparait à rien.
    const session = await this.imports.sessionFor(workspaceId, id)
    const existing = await this.writer.existingKeys(workspaceId, session.object_type as ImportObject)
    // Qui travaille ici. Sans cette liste, `unknown_owner` était déclaré,
    // traduit, et jamais émis : une reprise d'ancien CRM attribuait des fiches à
    // des gens partis depuis des années, et un portefeuille orphelin ne remonte
    // dans aucune vue.
    const knownOwners = await this.knownOwnerKeys(user.userId)
    const { report, proposedMapping, delimiter, detectedSource, columnConfidence, mappingSuggestions } =
      await this.imports.simulate(workspaceId, id, {
        ...input,
        knownParents,
        knownOwners,
        existing,
      })
    return { report, proposedMapping, delimiter, detectedSource, columnConfidence, mappingSuggestions }
  }

  /**
   * L'ANNULATION — la garde du scénario n°3 du PDF 9 : « un import détruit
   * trois ans de données CRM ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ELLE EXISTAIT SUR LE PAPIER
   * ─────────────────────────────────────────────────────────────────────────
   * `planRollback`, `markRolledBack` et `rollbackDecision` étaient écrits,
   * testés et documentés depuis le 21/08 — **et n'avaient ni route, ni bouton,
   * ni appelant.** La garde du scénario le plus grave du document était du code
   * mort : elle ne protégeait rien le jour où un import se passe mal.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE NE FAIT PAS
   * ─────────────────────────────────────────────────────────────────────────
   * Un objet touché par un HUMAIN après l'import n'est jamais annulé : il est
   * listé et laissé. Annuler une correction faite à la main est la seule chose
   * qu'un rollback ne doit pas pouvoir faire — elle est invisible et elle
   * n'existe nulle part ailleurs.
   *
   * Et rien n'est SUPPRIMÉ : un compte créé par l'import est archivé. Effacer
   * serait irréversible, et l'annulation d'une annulation n'existe pas.
   *
   * L'orchestration vit dans le contrôleur parce qu'elle traverse la session,
   * l'état courant des objets et l'écriture — le cliquet GA-07 l'exempte, et
   * c'est la sortie qu'il nomme lui-même.
   */
  @Post('sessions/:id/rollback')
  @HttpCode(200)
  @RequirePermission('records:write')
  async rollback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<{
    reverted: number
    keptTouched: number
    archived: number
    leftInPlace: number
    windowClosed: boolean
  }> {
    const workspaceId = await this.workspaceOf(user.userId)
    const session = await this.imports.sessionFor(workspaceId, id)
    // Seuls les comptes et les contacts s'écrivent — donc seuls eux s'annulent.
    // Un autre objet n'a jamais rien écrit : le dire vaut mieux qu'un succès muet.
    const object = session.object_type
    // ⚠️ La MÊME liste que l'écriture : un objet qui écrit doit pouvoir
    // s'annuler. La version d'avant nommait les deux objets à la main, et elle
    // aurait refusé d'annuler un import de projets QUI ÉCRIT — le pire des deux
    // mondes, puisque c'est précisément quand ça écrit qu'on veut le filet.
    if (!isWritableImportObject(object)) {
      throw new ConflictException(`L’import de ${object} n’écrit rien : il n’y a rien à annuler.`)
    }
    const snapshot = session.snapshot ?? []
    const ids = snapshot.map(entry => entry.id)

    const state = await this.writer.currentStateOf(object, ids)
    const plan = await this.imports.planRollback(workspaceId, id, state)
    const outcome = await this.writer.revert({ object, snapshot, ids: plan.revert })
    await this.imports.markRolledBack(workspaceId, id)

    return {
      reverted: outcome.restored,
      // Comptés à part, jamais tus : « 12 annulés » sans dire que 3 ont été
      // laissés ferait croire à une annulation complète.
      keptTouched: plan.kept.length,
      archived: outcome.archived,
      leftInPlace: outcome.leftInPlace,
      windowClosed: plan.windowClosed,
    }
  }

  /**
   * Étape 7 — l'écriture, après les trois refus.
   *
   * Comptes et contacts s'écrivent. Les autres objets se SIMULENT et refusent
   * l'écriture par leur nom : rendre un succès muet serait exactement le
   * « livré mais jamais appelé » que ce dépôt traque, et personne ne
   * s'apercevrait que rien n'a bougé.
   */
  @Post('sessions/:id/apply')
  @HttpCode(200)
  async apply(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<{
    created: number
    updated: number
    skippedUnknownCompany: number
    rejected?: ImportRejectedRow[]
    report: DryRunReport
    written: boolean
    reason: string | null
    /** L'index de la première ligne écrite par CE passage. 0 = premier essai. */
    resumedFromRow: number
    /** `null` quand tout est passé. Sinon, où et pourquoi ça s'est arrêté. */
    stopped: { atRow: number; totalRows: number; outcome: 'failed' | 'unknown'; message: string } | null
    /** #3753 — la liste cible alimentée, quand elle a été demandée (comptes). */
    targetList?: ImportTargetListOutcome
  }> {
    // Ce corps était TYPÉ et non VALIDÉ — ce qui ne borne rien à l'exécution :
    // `content` y porte le même fichier que la simulation, donc le même
    // plafond, sinon la borne de `dry-run` se contourne par l'étape suivante.
    const body = importApplySchema.parse(rawBody ?? {})
    const workspaceId = await this.workspaceOf(user.userId)
    const { session, report } = await this.imports.apply(workspaceId, id, body.available ?? [])

    // Un objet dont l'écriture n'est pas branchée est refusé PAR SON NOM. Rendre
    // un succès muet serait exactement le « livré mais jamais appelé » que ce
    // dépôt traque — et personne ne s'apercevrait que rien n'a été écrit.
    if (!ImportWriterService.WRITABLE.includes(session.object_type as ImportObject)) {
      return {
        created: 0,
        updated: 0,
        skippedUnknownCompany: 0,
        report,
        written: false,
        // ⚠️ La seconde phrase est DÉRIVÉE de la liste, pas recopiée : elle
        // disait « les comptes et les contacts » et l'aurait dit encore le jour
        // où un troisième objet est devenu writable.
        reason: `La reprise des ${session.object_type} se simule mais ne s’écrit pas encore. ${writableSentence()}`,
        resumedFromRow: 0,
        stopped: null,
      }
    }

    // `resumeFrom` n'est LU que sur une session dont la dernière ligne est
    // partie sans réponse — « un timeout n'est pas un échec ». Le SERVICE n'y
    // accepte alors que deux valeurs, la ligne incertaine ou la suivante :
    // c'est lui qui connaît le point d'arrêt, donc lui qui refuse. Un entier
    // libre accepté ici laisserait sauter 3 000 lignes par une requête forgée.
    const resume = {
      ...(body.resumeFrom === undefined ? {} : { resumeFrom: body.resumeFrom }),
      // #3753 — « créer une liste cible » : comptes seulement, aucune analyse lancée.
      ...(body.targetList ? { targetList: body.targetList } : {}),
    }
    const outcome = await this.imports.writeSession(
      user.userId,
      workspaceId,
      id,
      body.content ?? '',
      this.writer,
      resume,
    )
    // `outcome.report`, pas le `report` fetché plus haut : l'écriture a pu y
    // ajouter une ligne ABANDONNÉE (`errors`), et le rendre AVANT cet ajout
    // renverrait un rapport que la base ne porte déjà plus. `?? report` est un
    // filet qui ne joue jamais en pratique — `apply()` a déjà refusé plus haut
    // toute session sans rapport enregistré.
    return { ...outcome, report: outcome.report ?? report, written: true, reason: null }
  }
}

/**
 * « Les comptes, les contacts et les projets, eux, s'importent. »
 *
 * Écrite depuis la liste, jamais recopiée : la phrase d'avant nommait deux
 * objets et serait restée fausse le jour du troisième — exactement le motif
 * « un compte périmé dans une phrase » que ce dépôt paie régulièrement.
 */
function writableSentence(): string {
  const noms: Record<string, string> = {
    account: 'les comptes',
    contact: 'les contacts',
    project: 'les projets',
    need: 'les besoins',
    talent: 'les talents',
    mission: 'les missions',
  }
  const listés = WRITABLE_IMPORT_OBJECTS.map(objet => noms[objet] ?? objet)
  const dernier = listés[listés.length - 1]
  const tête = listés.slice(0, -1).join(', ')
  return `${tête ? `${tête} et ${dernier}` : dernier}, eux, s’importent.`
}
