import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { insertImportMarks } from '../crm-core/record-import-marks'
import {
  applyNormalisation,
  blocksApply,
  dedupKeyOf,
  detectImportSource,
  importContentFingerprint,
  importMappingSchema,
  importResumeDecision,
  mappingConfidence,
  orderViolations,
  proposeMapping,
  rollbackDecision,
  maskRecordForLog,
  simulateImport,
  suggestMapping,
  withRowError,
  type DispatchFailureOutcome,
  type DryRunReport,
  type ImportMapping,
  type ImportObject,
  type ImportResumeDecision,
  type ImportSourceDetection,
  type MappingConfidence,
} from '@bellum/contracts'
import { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { findImportSource, primaryObject } from './import-catalog'
import { parseDelimited } from './delimited-parser'

/**
 * L'assistant d'import (BEL-INT-602).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE RÈGLE QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `apply` REFUSE tant qu'aucune simulation n'est enregistrée. Le ticket demande
 * d'écrire ce test EN PREMIER, et il a raison : c'est la seule garde qui protège
 * une base héritée, et toutes les autres (ordre imposé, déduplication, rollback)
 * ne servent à rien si l'on peut écrire sans être passé par là.
 *
 * La simulation est FIGÉE en base et datée. Approuver un import à partir d'un
 * rapport de la semaine dernière écrirait un état que plus personne n'a en
 * tête — le même raisonnement que la prévisualisation figée des écritures ERP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un second moteur de synchronisation. Le ticket l'interdit nommément, et la
 * reprise CRM (`sync_links`, `sync_runs`, `sync_record_events`) reste seule
 * responsable de ce qui vient d'une API connectée. Ici, on lit un FICHIER que
 * quelqu'un a déposé — un chemin différent, un risque différent, et surtout un
 * utilisateur qui regarde l'écran.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name)

  /** Le plafond du §11 (« 200 000 lignes ») ramené à ce qu'un import synchrone tient. */
  private static readonly MAX_ROWS = 20_000

  /**
   * Au-delà, la simulation est trop vieille pour être approuvée.
   *
   * Une heure : assez pour relire un rapport, appeler un collègue et cliquer ;
   * trop court pour qu'un import parallèle ait changé la base sous le rapport.
   */
  private static readonly REPORT_MAX_AGE_MS = 60 * 60 * 1000

  /**
   * ⚠️ L'espace actif est PASSÉ par le contrôleur, jamais résolu ici.
   *
   * Ce n'est pas de la coquetterie d'architecture : GA-07 est au plafond, et le
   * cliquet compte les imports service → service. Le contrôleur, lui, en est
   * exempt — parce que c'est là que vit un geste d'utilisateur, et résoudre
   * « quel espace regarde cette personne » en EST un.
   */
  constructor(
    @InjectRepository(ImportSessionEntity)
    private readonly sessions: Repository<ImportSessionEntity>,
  ) {}

  /** Ouvre une session. Le choix de la source est l'étape 1 de l'assistant. */
  async create(userId: string, workspaceId: string, sourceKey: string): Promise<ImportSessionEntity> {
    const source = findImportSource(sourceKey)
    if (!source) throw new BadRequestException('Source d’import inconnue.')

    const session = this.sessions.create({
      workspace_id: workspaceId,
      created_by: userId,
      source: sourceKey,
      object_type: primaryObject(source),
      state: 'draft',
    })
    return this.sessions.save(session)
  }

  /**
   * Étapes 2 à 6 : déposer, mapper, normaliser, dédupliquer, SIMULER.
   *
   * Les cinq se font en un appel parce qu'elles portent sur le même fichier et
   * qu'aucune n'écrit. Ce qui est enregistré est le RÉSULTAT : le mapping retenu
   * et le rapport. Le fichier, lui, ne l'est pas — un CSV de prospection contient
   * des données personnelles qu'on n'a aucune raison de conserver après coup.
   */
  async simulate(
    workspaceId: string,
    sessionId: string,
    input: {
      content: string
      mapping?: unknown
      knownParents?: ReadonlySet<string>
      knownOwners?: ReadonlySet<string>
      existing?: Readonly<Record<string, string>>
    },
  ): Promise<{
    session: ImportSessionEntity
    report: DryRunReport
    proposedMapping: ImportMapping
    delimiter: string
    /** #2159.11/.13 — ce que les en-têtes du fichier laissent deviner de sa provenance. */
    detectedSource: ImportSourceDetection
    /** #2159.17/.21/.22/.24/.25/.27 — la confiance de chaque colonne RATTACHÉE, par en-tête. */
    columnConfidence: Record<string, MappingConfidence>
    /** Les colonnes IGNORÉES pour lesquelles une correspondance approchante existe — jamais rattachée d'office. */
    mappingSuggestions: Record<string, { field: string; confidence: 'medium' | 'low' }>
  }> {
    const session = await this.own(workspaceId, sessionId)
    if (session.state === 'applied') throw new ConflictException('Cet import a déjà été exécuté.')

    const source = findImportSource(session.source)
    if (!source) throw new BadRequestException('Source d’import inconnue.')

    const parsed = parseDelimited(input.content, ImportService.MAX_ROWS)
    const proposed = proposeMapping(parsed.headers, source.aliases, { object: session.object_type as ImportObject })
    // Le mapping fourni par l'utilisateur GAGNE : la proposition automatique est
    // une aide, pas une décision. C'est l'étape 3 du §7.4.
    const mapping = input.mapping ? importMappingSchema.parse(input.mapping) : proposed

    const object = session.object_type as ImportObject
    const report = simulateImport({
      object,
      headers: parsed.headers,
      rows: parsed.rows,
      mapping,
      required: source.required,
      // La comparaison contre la BASE vient du contrôleur, qui possède les
      // répertoires métier — comme les sociétés connues juste en dessous. Ce
      // commentaire affirmait déjà cette architecture ; il manquait le
      // paramètre, et `existing: {}` était écrit en dur : `updates`,
      // `overwrittenFields` et les doublons contre la base valaient toujours
      // zéro, et la simulation annonçait des créations là où l'import aurait
      // mis à jour.
      existing: input.existing ?? {},
      // Les sociétés connues, elles, VIENNENT du contrôleur : sans elles le
      // rapport promettrait des créations que l'import ne fera pas.
      ...(input.knownParents ? { knownParents: input.knownParents } : {}),
      // Les propriétaires connus, même règle : absents ⇒ on ne prétend rien.
      ...(input.knownOwners ? { knownOwners: input.knownOwners } : {}),
      truncated: parsed.truncated,
    })

    // Le journal d'import, avec les données personnelles MASQUÉES.
    //
    // Un journal part chez un tiers d'observabilité, il est conservé des mois, et
    // il est lu par des gens qui n'ont aucune raison de connaître l'adresse de
    // quelqu'un. Une ligne qui recopierait une adresse au moment d'un import de
    // masse en distribuerait dix-sept mille. Le garde-fou est nommé en toutes
    // lettres par l'évaluation de migration du paquet : « PII masquée dans logs
    // et observabilité ». La PREMIÈRE ligne suffit à diagnostiquer une
    // correspondance de colonnes ; les 2 000 suivantes n'ajoutent rien.
    const sample = parsed.rows[0]
    this.logger.log('Simulation d’import', {
      sessionId,
      source: session.source,
      rows: report.rowsRead,
      creations: report.creations,
      updates: report.updates,
      skipped: report.skipped.length,
      ignoredColumns: report.ignoredColumns,
      ...(sample ? { sample: maskRecordForLog(sample) } : {}),
    })

    session.mapping = mapping
    session.report = report
    session.report_at = new Date()
    // ⚠️ Une session qui a DÉJÀ écrit ne redescend pas à `simulated`.
    //
    // Re-simuler après une interruption est le bon geste — la base a changé,
    // 4 000 lignes y sont. Mais repasser l'état à `simulated` effacerait le seul
    // signal qui dit qu'elles y sont : le bouton « Annuler cet import »
    // disparaîtrait, et l'écran réafficherait un import « pas encore exécuté ».
    if (session.processed_rows === null || session.processed_rows === undefined) session.state = 'simulated'
    // Le nombre de lignes du fichier, pour dire « arrêté à la 4 000e sur
    // 17 000 » plutôt que « arrêté ».
    session.total_rows = parsed.rows.length
    // L'empreinte du fichier — et elle ne se RÉÉCRIT pas une fois qu'une
    // écriture a eu lieu. Sinon il suffirait de re-simuler avec un autre fichier
    // pour que la reprise saute 4 000 lignes du mauvais.
    if (session.content_fingerprint === null || session.content_fingerprint === undefined) {
      session.content_fingerprint = importContentFingerprint(input.content)
    }
    await this.sessions.save(session)

    // #2159.17/.21/.22/.24/.25/.27 — la confiance de chaque colonne RATTACHÉE
    // (haute/moyenne/basse, JAMAIS un pourcentage — doctrine), et la
    // suggestion pour celles qui ne le sont pas encore. Calculées ici, jamais
    // côté client : les alias de la source ne sortent pas de l'API
    // (`import-catalog.ts` : « on n'expose pas les alias »), donc la
    // dérivation qui les lit reste à un seul endroit (GA-26).
    const columnConfidence: Record<string, MappingConfidence> = {}
    for (const [header, field] of Object.entries(mapping.columns)) {
      const confidence = mappingConfidence(header, field, source.aliases)
      if (confidence) columnConfidence[header] = confidence
    }
    const mappingSuggestions: Record<string, { field: string; confidence: 'medium' | 'low' }> = {}
    for (const header of mapping.ignored) {
      const suggestion = suggestMapping(header, source.aliases)
      if (suggestion) mappingSuggestions[header] = suggestion
    }

    // Le séparateur DÉTECTÉ remonte. Il était calculé, testé — puis jeté ici,
    // et le contrôleur répondait `';'` en dur : l'écran ne pouvait pas dire à
    // un utilisateur que son fichier est en virgules.
    return {
      session,
      report,
      proposedMapping: proposed,
      delimiter: parsed.delimiter,
      detectedSource: detectImportSource(parsed.headers),
      columnConfidence,
      mappingSuggestions,
    }
  }

  /**
   * Étape 7 — l'écriture, et les trois refus qui la précèdent.
   *
   * Aucun de ces refus n'est esthétique :
   *  · sans simulation, on écrit à l'aveugle dans la base d'un client ;
   *  · avec un champ obligatoire absent, des lignes entières échouent EN
   *    SILENCE — c'est le mode d'échec que le §7.1 nomme explicitement ;
   *  · sans l'objet parent, toutes les associations sautent, et un contact
   *    orphelin ne se rattache plus à rien après coup.
   */
  async apply(
    workspaceId: string,
    sessionId: string,
    available: readonly ImportObject[],
  ): Promise<{ session: ImportSessionEntity; report: DryRunReport }> {
    const session = await this.own(workspaceId, sessionId)

    // LE test du ticket, écrit en premier.
    if (!session.report || !session.report_at) {
      throw new ConflictException(
        'Cet import n’a pas encore été simulé. La simulation est obligatoire : elle dit exactement ce qui sera créé, mis à jour et écrasé.',
      )
    }
    // Et le rapport doit être RÉCENT. Le docblock de ce service promet depuis le
    // premier jour qu'« approuver un import à partir d'un rapport de la semaine
    // dernière écrirait un état que plus personne n'a en tête » — la vérification
    // n'avait jamais été écrite : seule l'EXISTENCE du rapport était contrôlée,
    // jamais son ÂGE. Entre-temps, un collègue peut avoir créé les comptes que
    // le rapport annonce en création.
    const ageMs = Date.now() - new Date(session.report_at).getTime()
    if (ageMs > ImportService.REPORT_MAX_AGE_MS) {
      throw new ConflictException(
        'Cette simulation date de plus d’une heure. Relance-la : la base a pu changer depuis, et le rapport dirait des créations là où il y aurait des mises à jour.',
      )
    }
    if (session.state === 'applied') throw new ConflictException('Cet import a déjà été exécuté.')

    if (blocksApply(session.report)) {
      throw new BadRequestException(
        `Colonne obligatoire absente : ${session.report.missingRequiredColumns.join(', ')}. Corrige le fichier et relance la simulation.`,
      )
    }

    const violations = orderViolations({ importing: [session.object_type as ImportObject], available })
    if (violations.length > 0) {
      throw new BadRequestException(
        `Ces objets ont besoin d’un objet parent qui n’existe ni dans ton espace, ni dans les imports précédents : ${violations.join(', ')}. Importe les comptes d’abord — sinon les rattachements sautent.`,
      )
    }

    return { session, report: session.report }
  }

  /**
   * Écrit la session : on RELIT le fichier et on rejoue exactement le chemin de
   * la simulation.
   *
   * Le fichier est re-fourni par le client plutôt que gardé en base — un CSV de
   * prospection contient des données personnelles qu'on n'a aucune raison de
   * conserver entre deux clics. Le mapping, lui, est celui qui a été SIMULÉ :
   * changer de mapping entre la simulation et l'écriture rendrait le rapport
   * faux, et c'est justement ce rapport qui autorise l'écriture.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA REPRISE — angle mort n°6 du tome 8 §33
   * ───────────────────────────────────────────────────────────────────────────
   * Avant le 29/08/2026, une exception à la ligne 4 000 sur 17 000 remontait
   * jusqu'au contrôleur : `markApplied` n'était jamais atteint, les 4 000 lignes
   * restaient en base **sans qu'aucune colonne le dise**, l'instantané mourait
   * avec la pile — donc l'annulation devenait impossible dans le cas exact pour
   * lequel elle a été écrite — et l'écran affichait « 0 créé ».
   *
   * Trois choses, dans cet ordre : l'utilisateur SAIT où ça s'est arrêté et
   * pourquoi ; il RELANCE sans doublonner ; ce qui a été écrit N'EST PAS PERDU.
   *
   * La déduplication de reprise vaut **(session + numéro de ligne)**, vérifiée
   * par l'empreinte du fichier — jamais une ressemblance de noms : on PROPOSE
   * une fusion de doublons, on ne fusionne jamais.
   */
  async writeSession(
    userId: string,
    workspaceId: string,
    sessionId: string,
    content: string,
    writer: ImportRowWriter,
    options: { resumeFrom?: number; targetList?: { name: string } } = {},
  ): Promise<{
    created: number
    updated: number
    skippedUnknownCompany: number
    /** #2732.1 — les lignes refusées, une par une, avec leur motif. */
    rejected?: ImportRejectedRow[]
    /** L'index de la première ligne écrite par CE passage. 0 = premier essai. */
    resumedFromRow: number
    /** `null` quand tout est passé. Sinon, où et pourquoi ça s'est arrêté. */
    stopped: { atRow: number; totalRows: number; outcome: DispatchFailureOutcome; message: string } | null
    /**
     * Le rapport, à jour de ce que CETTE écriture a appris — jamais celui d'avant.
     *
     * `null` seulement si la session n'en portait déjà aucun, ce que `apply()`
     * refuse en amont : en pratique, toujours renseigné ici.
     */
    report: DryRunReport | null
    /** #3753 — la liste cible alimentée par ce passage, si elle a été demandée. */
    targetList?: ImportTargetListOutcome
  }> {
    const session = await this.own(workspaceId, sessionId)
    if (!session.mapping) throw new ConflictException('Cet import n’a pas de correspondance de colonnes enregistrée.')
    if (!content) throw new BadRequestException('Redépose le fichier : il n’est pas conservé entre deux étapes.')

    const parsed = parseDelimited(content, ImportService.MAX_ROWS)
    const fingerprint = importContentFingerprint(content)
    const decision = importResumeDecision({
      state: session.state,
      processedRows: session.processed_rows ?? null,
      failedAtRow: session.failed_at_row ?? null,
      resumeOutcome: session.resume_outcome ?? null,
      storedFingerprint: session.content_fingerprint ?? null,
      incomingFingerprint: fingerprint,
    })
    const startAt = resumePoint(decision, options.resumeFrom)

    /**
     * Une ligne ABANDONNÉE : partie sans réponse (`unknown`), et un humain a
     * choisi de ne PAS la rejouer plutôt que de risquer un doublon (`resume.
     * skipLine` côté écran). C'est la SEULE façon, aujourd'hui, qu'une ligne
     * finisse un import sans avoir été écrite ni annoncée par la simulation
     * comme écartée.
     *
     * Avant ce correctif, cette ligne ne laissait AUCUNE trace une fois
     * l'import terminé : `markApplied` ne réinitialise pas `report`, mais rien
     * n'y ajoutait cette ligne non plus — elle disparaissait entre les deux,
     * ni écrite, ni comptée en échec, ni comptée nulle part. `withRowError`
     * la range dans `errors` et retire la ligne de `creations`/`updates` pour
     * que la somme des seaux continue d'égaler `rowsRead`.
     */
    if (decision.kind === 'ask_unknown' && startAt === decision.uncertainRow + 1 && session.report) {
      session.report = withRowError(session.report, {
        row: decision.uncertainRow + 1,
        message:
          session.error ??
          'Écriture interrompue : cette ligne est partie sans confirmation et a été ignorée sur décision de l’utilisateur.',
      })
      await this.sessions.save(session)
    }

    const rows = parsed.rows.map(row => {
      const out: Record<string, unknown> = {}
      for (const [column, field] of Object.entries(session.mapping?.columns ?? {})) {
        const raw = row[column]
        if (raw === undefined || raw.trim() === '') continue
        const { value } = applyNormalisation(field, raw, session.mapping?.disabledRules ?? [])
        if (value !== null) out[field] = value
      }
      return out
    })

    // Ce qui a DÉJÀ été écrit par les passages précédents. Le remplacer perdrait
    // les 4 000 premiers objets pour l'annulation — le motif « remplacé, pas
    // fusionné » que ce dépôt a déjà payé sur `raw_analysis`.
    const carried = {
      created: session.created_count ?? 0,
      updated: session.updated_count ?? 0,
      snapshot: session.snapshot ?? [],
    }

    const input = {
      workspaceId: session.workspace_id,
      userId,
      rows,
      startAt,
      // #3753 — une liste cible n'a de sens que pour des COMPTES : jamais pour un autre objet.
      ...(options.targetList && session.object_type === 'account' ? { targetList: options.targetList } : {}),
      checkpoint: (progress: ImportWriteOutcome) => this.checkpoint(session, fingerprint, carried, progress),
    }
    // ⚠️ Exhaustif, et plus un ternaire binaire. La version d'avant écrivait
    // `writeContacts` pour TOUT ce qui n'était pas un compte : le jour où un
    // troisième objet est devenu writable, un `object_type: 'project'` qui
    // aurait contourné la garde du contrôleur aurait créé des CONTACTS, en
    // silence. La garde vit 118 lignes plus loin, dans un autre fichier ; ici,
    // c'est le compilateur qui tient la liste.
    const outcome = await writeFor(writer, session.object_type)(input)

    // #2732.1 — une ligne REFUSÉE à l'écriture rejoint le seau `errors` du rapport (numéro + motif en clair) : le
    // rapport, qui reste à l'écran, la NOMME — jamais « 0 créé » sans un mot. Même gabarit que la ligne abandonnée.
    if (outcome.rejected?.length && session.report) {
      for (const rejected of outcome.rejected) {
        session.report = withRowError(session.report, { row: rejected.row, message: rejectedRowMessage(rejected) })
      }
      await this.sessions.save(session)
    }

    const created = carried.created + outcome.created
    const updated = carried.updated + outcome.updated
    const snapshot = [...carried.snapshot, ...outcome.snapshot]
    await this.markImported(session, outcome.snapshot)

    if (outcome.failure) {
      // ⚠️ On ne JETTE pas. Une exception rendrait un 500 et effacerait le seul
      // fait qui compte : 4 000 lignes sont en base. Le refus s'écrit, il se
      // compte, et il se dit à l'écran.
      session.state = 'partial'
      // ⚠️ `applied_at` porte « le moment où cet import a ÉCRIT pour la dernière
      // fois », pas « le moment où il a fini ». C'est ce que la fenêtre
      // d'annulation mesure, et un import interrompu a écrit : sans cette date,
      // les 4 000 lignes déjà en base n'auraient aucune fenêtre pour être
      // annulées. L'état, lui, dit `partial` — les deux ne se confondent pas.
      session.applied_at = new Date()
      session.processed_rows = outcome.processedRows
      session.total_rows = parsed.rows.length
      session.failed_at_row = outcome.failure.row
      session.resume_outcome = outcome.failure.outcome
      session.content_fingerprint = session.content_fingerprint ?? fingerprint
      session.created_count = created
      session.updated_count = updated
      session.snapshot = snapshot
      session.error = outcome.failure.message
      await this.sessions.save(session)
      // ⚠️ Le message BRUT ne part pas au journal : une erreur de contrainte
      // Postgres recopie la valeur fautive (« Key (email)=(…) »), et un journal
      // part chez un tiers d'observabilité. Il est stocké en base, où seul
      // l'auteur du fichier le lit — c'est SA donnée.
      this.logger.error('Import interrompu en cours d’écriture', {
        error: new Error(`import interrompu (${outcome.failure.outcome})`),
        tags: { sessionId, outcome: outcome.failure.outcome },
        contexts: { import: { atRow: outcome.failure.row, totalRows: parsed.rows.length, created, updated } },
      })
      return {
        created,
        updated,
        skippedUnknownCompany: outcome.skippedUnknownCompany,
        ...(outcome.rejected ? { rejected: outcome.rejected } : {}),
        resumedFromRow: startAt,
        stopped: {
          atRow: outcome.failure.row,
          totalRows: parsed.rows.length,
          outcome: outcome.failure.outcome,
          message: outcome.failure.message,
        },
        report: session.report,
        ...(outcome.targetList ? { targetList: outcome.targetList } : {}),
      }
    }

    await this.markApplied(workspaceId, sessionId, {
      created,
      updated,
      snapshot,
      processedRows: parsed.rows.length,
      totalRows: parsed.rows.length,
      fingerprint,
    })
    return {
      created,
      updated,
      skippedUnknownCompany: outcome.skippedUnknownCompany,
      ...(outcome.rejected ? { rejected: outcome.rejected } : {}),
      resumedFromRow: startAt,
      stopped: null,
      report: session.report,
      ...(outcome.targetList ? { targetList: outcome.targetList } : {}),
    }
  }

  /**
   * #AM.10 (#4051.10) — « Importé de <outil> le <date> » sur chaque fiche compte / contact écrite ou complétée par
   * ce passage, dans l'historique existant (`record_import_marks`, GA-26). Le réimport ne remplace rien : la trace
   * s'AJOUTE. Best-effort : une trace manquée ne fait jamais échouer un import dont les lignes sont écrites.
   */
  private async markImported(session: ImportSessionEntity, snapshot: readonly ImportSnapshot[]): Promise<void> {
    const entityType =
      session.object_type === 'account' || session.object_type === 'contact' ? session.object_type : null
    const db = this.sessions.manager
    if (!entityType || !db || snapshot.length === 0) return
    try {
      await insertImportMarks(db, {
        workspaceId: session.workspace_id,
        entityType,
        entityIds: [...new Set(snapshot.map(entry => entry.id))],
        sourceKind: 'tool',
        sourceLabel: session.source,
      })
    } catch (error) {
      this.logger.warn('Trace d’import non écrite', { error, tags: { sessionId: session.id } })
    }
  }

  /**
   * Le point de reprise, écrit PENDANT l'écriture.
   *
   * Un point de reprise posé uniquement à la fin ne survit à rien : c'est
   * précisément la fin qui n'arrive pas.
   *
   * ⚠️ Un échec de ce `save()` ne fait pas échouer l'import — les lignes, elles,
   * SONT écrites, et les perdre de vue serait pire. Il est journalisé à
   * `error` (donc remonté), parce qu'un point de reprise qui rate en silence
   * ramène exactement au défaut que ce chemin corrige.
   */
  private async checkpoint(
    session: ImportSessionEntity,
    fingerprint: string,
    carried: { created: number; updated: number; snapshot: ImportSnapshot[] },
    progress: ImportWriteOutcome,
  ): Promise<void> {
    try {
      session.state = 'partial'
      session.processed_rows = progress.processedRows
      session.created_count = carried.created + progress.created
      session.updated_count = carried.updated + progress.updated
      session.snapshot = [...carried.snapshot, ...progress.snapshot]
      session.content_fingerprint = session.content_fingerprint ?? fingerprint
      await this.sessions.save(session)
    } catch (error) {
      this.logger.error('Point de reprise d’import non enregistré', {
        error,
        tags: { sessionId: session.id },
        contexts: { import: { processedRows: progress.processedRows } },
      })
    }
  }

  /** Marque la session exécutée, avec l'instantané qui rendra l'annulation possible. */
  async markApplied(
    workspaceId: string,
    sessionId: string,
    outcome: {
      created: number
      updated: number
      snapshot: ImportSnapshot[]
      processedRows: number
      totalRows: number
      fingerprint: string
    },
  ): Promise<void> {
    // `save()` et non `update()` : TypeORM ne sait pas décrire une colonne
    // `jsonb` porteuse d'un tableau d'objets libres dans un `update`, et forcer
    // le type par une conversion reviendrait à éteindre le contrôle sur la seule
    // donnée qui rendra l'annulation possible.
    //
    // ⚠️ La lecture est SCOPÉE à l'espace. Elle ne l'était pas : un
    // `findOne({ where: { id } })` nu marquait « exécutée » n'importe quelle
    // session portant cet identifiant, y compris celle d'un autre espace.
    const session = await this.sessions.findOne({ where: { id: sessionId, workspace_id: workspaceId } })
    if (!session) return
    session.state = 'applied'
    session.applied_at = new Date()
    session.created_count = outcome.created
    session.updated_count = outcome.updated
    session.snapshot = outcome.snapshot
    // Le point de reprise est CLOS : tout le fichier est passé. Le laisser
    // renseigné ferait croire à une interruption sur une session complète.
    session.processed_rows = outcome.processedRows
    session.total_rows = outcome.totalRows
    session.failed_at_row = null
    session.resume_outcome = null
    session.error = null
    session.content_fingerprint = session.content_fingerprint ?? outcome.fingerprint
    await this.sessions.save(session)
  }

  /**
   * L'annulation (§7.7), et sa règle centrale.
   *
   * **Un objet touché par un humain après l'import n'est JAMAIS annulé.** Il est
   * LISTÉ et laissé. Annuler une correction faite à la main est la seule chose
   * qu'un rollback ne doit pas pouvoir faire : elle est invisible — personne ne
   * relit un rapport d'annulation — et irréversible, puisque la correction n'est
   * nulle part ailleurs.
   */
  async planRollback(
    workspaceId: string,
    sessionId: string,
    touched: Readonly<Record<string, { updatedAt: Date | null; lastWriteBy: 'human' | 'connector' | null }>>,
    now = new Date(),
  ): Promise<{ revert: string[]; kept: string[]; windowClosed: boolean }> {
    const session = await this.own(workspaceId, sessionId)
    // ⚠️ Un import INTERROMPU s'annule aussi, et c'est le cas qui compte le plus.
    // Avant le 29/08/2026, `state !== 'applied'` refusait exactement la session
    // qui avait laissé 4 000 lignes derrière elle : la seule garde du scénario
    // « un import détruit trois ans de données CRM » était inatteignable dans le
    // cas pour lequel elle a été écrite.
    if ((session.state !== 'applied' && session.state !== 'partial') || !session.applied_at) {
      throw new ConflictException('Cet import n’a rien écrit : il n’y a rien à annuler.')
    }

    const revert: string[] = []
    const kept: string[] = []
    let windowClosed = false

    for (const entry of session.snapshot ?? []) {
      const state = touched[entry.id]
      const decision = rollbackDecision({
        importedAt: session.applied_at,
        now,
        updatedAt: state?.updatedAt ?? null,
        lastWriteBy: state?.lastWriteBy ?? null,
      })
      if (decision === 'window_closed') {
        windowClosed = true
        continue
      }
      if (decision === 'keep_touched') kept.push(entry.id)
      else revert.push(entry.id)
    }

    return { revert, kept, windowClosed }
  }

  /** La session, telle qu'elle est, scopée à l'espace. Sert à l'annulation :
   *  l'instantané et l'objet ne se devinent pas. */
  async sessionFor(workspaceId: string, sessionId: string): Promise<ImportSessionEntity> {
    return this.own(workspaceId, sessionId)
  }

  /** ⚠️ Scopé à l'espace : un identifiant nu annulerait la session d'un autre espace. */
  async markRolledBack(workspaceId: string, sessionId: string): Promise<void> {
    await this.sessions.update(
      { id: sessionId, workspace_id: workspaceId },
      { state: 'rolled_back', rolled_back_at: new Date() },
    )
  }

  /** L'historique des imports de l'espace — l'instantané reste consultable au-delà de la fenêtre. */
  async list(workspaceId: string): Promise<ImportSessionEntity[]> {
    return this.sessions.find({ where: { workspace_id: workspaceId }, order: { created_at: 'DESC' }, take: 50 })
  }

  /** La session, scopée à l'espace de l'appelant. Un id absent se refuse AVANT la lecture. */
  private async own(workspaceId: string, sessionId: string): Promise<ImportSessionEntity> {
    // TypeORM IGNORE une condition `undefined` : `findOne({ where: { id: undefined } })`
    // rendrait la première ligne venue. Le refus vient donc avant la requête.
    if (!sessionId) throw new NotFoundException('Session d’import introuvable.')
    const session = await this.sessions.findOne({ where: { id: sessionId, workspace_id: workspaceId } })
    if (!session) throw new NotFoundException('Session d’import introuvable.')
    return session
  }

  /** La clé de dédup d'une ligne — exposée pour que l'appelant interroge SA base. */
  static dedupKey(object: ImportObject, row: Readonly<Record<string, unknown>>): string | null {
    return dedupKeyOf(object, row)
  }
}

/** Ce qui permettra d'annuler : l'identifiant, et les valeurs d'AVANT. */
export type ImportSnapshot = { id: string; created: boolean; fields: Record<string, unknown> }

/**
 * Ce qu'un passage d'écriture rend — y compris quand il s'est arrêté en route.
 *
 * `processedRows` est un index ABSOLU dans le fichier, pas un compte relatif au
 * point de départ : c'est lui qui devient le point de reprise, et un compte
 * relatif ferait recommencer 4 000 lignes plus tôt à chaque reprise.
 */
type ImportRejectedReason =
  'missing_company' | 'unknown_company' | 'missing_label' | 'end_before_start' | 'already_exists'

/** Le motif d'une ligne refusée, en clair — celui que l'écran montre à côté de son numéro de ligne. */
export function rejectedRowMessage(rejected: ImportRejectedRow): string {
  const who = rejected.detail ? ` (${rejected.detail})` : ''
  switch (rejected.reason) {
    case 'missing_company':
      return 'Ligne refusée : aucune société n’est indiquée.'
    case 'unknown_company':
      return `Ligne refusée${who} : cette société n’existe pas encore dans ton espace — importe les comptes d’abord.`
    case 'missing_label':
      return `Ligne refusée${who} : l’intitulé de la mission (rôle ou poste) manque.`
    case 'end_before_start':
      return `Ligne refusée${who} : la fin de mission précède son début.`
    case 'already_exists':
      return `Ligne refusée${who} : cette mission existe déjà (même société, même rôle, mêmes dates).`
  }
}

/** Une ligne du fichier qui n'a PAS été écrite : son numéro (1 = première ligne de données), son motif, sa société. */
export type ImportRejectedRow = { row: number; reason: ImportRejectedReason; detail: string | null }

export type ImportWriteOutcome = {
  created: number
  updated: number
  skippedUnknownCompany: number
  /** #2732.1 — les lignes REFUSÉES, une par une, avec leur motif : jamais un silence. Absent = aucune. */
  rejected?: ImportRejectedRow[]
  snapshot: ImportSnapshot[]
  processedRows: number
  /** `null` quand tout est passé. La ligne, et ce qu'on sait de son sort. */
  failure: { row: number; outcome: DispatchFailureOutcome; message: string } | null
  /** #3753 — la liste cible que ce passage a alimentée, quand elle a été demandée. */
  targetList?: ImportTargetListOutcome
}

/**
 * #3753 — ce que la liste cible d'un import de comptes a reçu.
 * `nearDuplicates` : même nom qu'un compte existant, AUTRE domaine — proposés à
 * l'écran, jamais fusionnés.
 */
export type ImportTargetListOutcome = {
  id: string
  name: string
  added: number
  attachedToExisting: number
  nearDuplicates: { company: string; existingAccountId: string; newAccountId: string }[]
}

/**
 * Ce que le service attend d'un écrivain de lignes.
 *
 * Duck-typé plutôt qu'injecté : `ImportService` ne dépend d'aucun repository
 * métier, et le cliquet GA-07 compte les imports service → service.
 */
export type ImportRowWriter = {
  writeAccounts(input: ImportWriteInput): Promise<ImportWriteOutcome>
  writeContacts(input: ImportWriteInput): Promise<ImportWriteOutcome>
  writeProjects(input: ImportWriteInput): Promise<ImportWriteOutcome>
  /** #2148.25/#2850 — le besoin, rattaché à un compte déjà connu. */
  writeNeeds(input: ImportWriteInput): Promise<ImportWriteOutcome>
  /** #2148.25/#2850 (reste, 27/09) — le vivier (`talent`), sans compte. */
  writeTalents(input: ImportWriteInput): Promise<ImportWriteOutcome>
  /** #2732.1 — la mission, rattachée à un compte déjà connu ; chaque refus nommé. */
  writeMissions(input: ImportWriteInput): Promise<ImportWriteOutcome>
}

type ImportWriteInput = {
  workspaceId: string
  userId: string
  rows: readonly Record<string, unknown>[]
  /** L'index de la première ligne à écrire. Les précédentes sont déjà en base. */
  startAt: number
  /** #3753 — créer (ou alimenter) une liste cible avec les comptes du fichier. Comptes seulement. */
  targetList?: { name: string }
  /** Appelé tous les `IMPORT_CHECKPOINT_ROWS`. Ce qu'il persiste survit à un plantage. */
  checkpoint?: (progress: ImportWriteOutcome) => Promise<void>
}

/**
 * De la décision de reprise à l'index de départ — ou à un refus NOMMÉ.
 *
 * Six issues, six phrases. Elles ne sont pas des variantes d'un même « non » :
 * le geste qui les répare diffère, et une phrase générique renverrait
 * l'utilisateur au support pour chacune.
 */
function resumePoint(decision: ImportResumeDecision, resumeFrom: number | undefined): number {
  switch (decision.kind) {
    case 'start':
      return 0
    case 'resume':
      return decision.fromRow
    case 'done':
      throw new ConflictException('Cet import a déjà été exécuté.')
    case 'different_file':
      throw new ConflictException(
        'Cet import a déjà écrit une partie d’un fichier, et ce n’est pas le même fichier. Redépose exactement celui que tu avais déposé, ou ouvre un nouvel import — reprendre à la même ligne dans un autre fichier en sauterait autant, en silence.',
      )
    case 'unverifiable':
      throw new ConflictException(
        'Cet import a déjà écrit des lignes, et je ne peux pas prouver que le fichier déposé est le même. Je ne saute rien : ouvre un nouvel import.',
      )
    case 'unknown_progress':
      throw new ConflictException(
        'Cet import s’est arrêté et je ne sais pas combien de lignes ont été écrites. Ce n’est pas « aucune » : reprendre depuis le début créerait des doublons. Ouvre un nouvel import, ou annule celui-ci d’abord.',
      )
    case 'ask_unknown': {
      // « Un timeout n'est pas un échec » : la requête est partie sans réponse.
      // La rejouer la doublonne peut-être, la sauter la perd peut-être — la
      // reprise automatique s'ARRÊTE, et c'est un humain qui tranche. Deux
      // réponses possibles, pas mille : accepter un entier libre laisserait
      // sauter 3 000 lignes par une requête forgée.
      const line = decision.uncertainRow + 1
      if (resumeFrom === decision.uncertainRow || resumeFrom === decision.uncertainRow + 1) return resumeFrom
      throw new ConflictException(
        `L’import s’est arrêté sur la ligne ${line} et elle est partie sans réponse : je ne sais pas si elle a été écrite. Dis-moi quoi en faire — la réécrire (au risque d’un doublon) ou la sauter (au risque de la perdre).`,
      )
    }
  }
}

/**
 * L'écrivain d'un type d'objet — ou un refus qui NOMME ce qui manque.
 *
 * Le contrôleur refuse déjà l'`apply` d'un objet non writable ; ceci est la
 * seconde porte, et elle est là parce que la première est dans un autre
 * fichier. Un objet déclaré writable sans écrivain jette ici plutôt que de
 * tomber dans celui du voisin.
 */
function writeFor(writer: ImportRowWriter, object: string): (input: ImportWriteInput) => Promise<ImportWriteOutcome> {
  switch (object) {
    case 'account':
      return input => writer.writeAccounts(input)
    case 'contact':
      return input => writer.writeContacts(input)
    case 'project':
      return input => writer.writeProjects(input)
    case 'need':
      return input => writer.writeNeeds(input)
    case 'talent':
      return input => writer.writeTalents(input)
    case 'mission':
      return input => writer.writeMissions(input)
    default:
      throw new ConflictException(`La reprise des ${object} n’a pas d’écriture branchée.`)
  }
}
