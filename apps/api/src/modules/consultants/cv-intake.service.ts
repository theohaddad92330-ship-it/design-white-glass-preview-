import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { isErasedConsultantIdentity } from './consultant-erasure.service'
import { Repository } from 'typeorm'
import {
  CV_NOT_A_CV_MESSAGE,
  CV_TEXT_MAX_CHARS,
  CV_UPLOAD_MAX_BYTES,
  classifyCvExtractFailure,
  cvOriginalMimeType,
  cvOriginalStoragePath,
  decideCvBatchFileAction,
  extractCvEmail,
  extractCvPhone,
  hasIdentitySignal,
  incomingCvIsMoreRecent,
  isRecognizedCvExtension,
  hasSpreadsheetExtension,
  looksTabularText,
  readExperienceKeys,
  resolveTalentIdentityState,
  sniffCvFileKind,
  summariseConsultantCsvImport,
  type ConsultantCsvImportOutcome,
  type ConsultantCsvImportReport,
  type CvBatchFileOutcome,
  type CvIntakeInput,
  type CvIntakeStepId,
  type TalentDuplicateMatch,
  type TalentIdentityCandidate,
  type TalentIdentityState,
} from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { readExtractedText, readExtractionPartial, readFailureDetail } from '../ia/document-extraction-envelope'
import { IaClient } from '../ia/ia.client'
import { StorageClient } from '../storage/storage.client'
import { parseConsultantCsv } from './csv-import'
import { CvAutoParseService } from './cv-auto-parse.service'
import { TalentIdentityService, type TalentCandidateIndex } from './talent-identity.service'
import { insertImportMarks } from '../crm-core/record-import-marks'

/** Incident boucle API (05/10/2026) — le contexte d'un lot d'imports
 *  automatiques : le vivier, lu et indexé une fois pour tout le lot. */
export type CvIntakeAutomaticBatch = { identities: TalentCandidateIndex }

/** Ce que rend un dépôt : une fiche créée, une fiche complétée, ou une question. */
type CvIntakeOutcome =
  | { outcome: 'duplicates'; duplicates: TalentDuplicateMatch[]; state: TalentIdentityState }
  | { outcome: 'created'; consultantId: string; extractedChars: number; state: 'new' }
  | { outcome: 'updated'; consultantId: string; extractedChars: number; state: 'updated' }

/**
 * Le dépôt d'un CV (PDF 3 §3.3).
 *
 * Le vivier ne savait recevoir que du texte COLLÉ : déposer un CV supposait de
 * l'ouvrir, tout sélectionner, copier. L'extraction existait pourtant déjà côté
 * IA pour l'ingestion documentaire — elle n'était branchée sur rien du côté
 * talent.
 *
 * Le pipeline du §3.3, dans son ordre, et l'ordre EST la règle :
 *
 *   dépôt → extraction → **doublon AVANT toute écriture** → fiche `needs_review`
 *
 * La déduplication passe avant l'écriture parce qu'après, c'est trop tard : une
 * fiche créée en double se découvre trois mois plus tard, quand deux personnes
 * ont poussé le même profil chez le même client.
 *
 * Deux règles d'honnêteté :
 *
 *  - un fichier illisible produit une erreur NOMMÉE et **rien n'est écrit** —
 *    ni fiche vide, ni document sans texte. Le §13.2 l'exige : « fichier
 *    corrompu → erreur nommée, fichier conservé, aucun crédit débité » ;
 *  - une fiche née d'une extraction naît `needs_review`, JAMAIS `qualified`.
 */
@Injectable()
export class CvIntakeService {
  private readonly logger = new Logger(CvIntakeService.name)

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ConsultantDocumentEntity)
    private readonly documents: Repository<ConsultantDocumentEntity>,
    private readonly ia: IaClient,
    /** #2327 — la matière de la comparaison et la mémoire des décisions. */
    private readonly identity: TalentIdentityService,
    /** c88 (04/10/2026) — la lecture automatique des CV créés par import.
     *  Optionnelle : un test ou un contexte sans file reste byte-identique. */
    @Optional() private readonly autoParse?: CvAutoParseService,
    /** #4034.2 — le magasin de l'ORIGINAL. Optionnel : absent, chemin d'avant. */
    @Optional() private readonly storage?: StorageClient,
  ) {}

  /**
   * Les talents existants qui pourraient être la personne qu'on dépose.
   *
   * Lecture seule, appelée AVANT l'écriture. Le tri et les raisons viennent de
   * la fonction pure : le service ne fait que fournir la matière.
   */
  async findDuplicates(
    workspaceId: string,
    candidate: { fullName: string; email: string | null; phone: string | null },
  ): Promise<TalentDuplicateMatch[]> {
    // #2327.6 — le dernier employeur n'est plus forcé à `null` des DEUX côtés :
    // le vivier arrive avec l'employeur CONNU (le partenaire qui porte la
    // personne), ses documents, ses expériences et ses identifiants externes.
    // Le candidat saisi n'a pas d'employeur — c'est écrit, pas simulé.
    return this.identity.findForCandidate(workspaceId, {
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      lastEmployer: null,
    })
  }

  /**
   * Dépose un CV et crée la fiche — ou s'arrête sur un doublon.
   *
   * Rend `{ duplicates }` sans rien écrire quand une correspondance existe et
   * que l'utilisateur ne l'a pas encore écartée : la décision « ce n'est pas la
   * même personne » est une affirmation, et elle doit venir de quelqu'un.
   */
  async intake(workspaceId: string, userId: string, input: CvIntakeInput): Promise<CvIntakeOutcome> {
    const bytes = Buffer.from(input.fileB64, 'base64')
    if (bytes.byteLength === 0) throw new BadRequestException('Fichier vide ou encodage invalide.')
    if (bytes.byteLength > CV_UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `Ce fichier dépasse ${Math.round(CV_UPLOAD_MAX_BYTES / (1024 * 1024))} Mo. Au-delà, ce n’est plus un CV — dépose la version texte.`,
      )
    }

    // M2.3 (Meyer 20/10) — un tableur n'est pas un CV : refusé AVANT toute extraction, rien n'est écrit.
    if (hasSpreadsheetExtension(input.filename)) throw new UnprocessableEntityException(CV_NOT_A_CV_MESSAGE)

    const candidateName = input.fullName?.trim() ?? ''
    // #2327.9 — l'empreinte du FICHIER : le même CV sous deux noms se reconnaît
    // sans le relire. Le binaire, lui, n'est toujours pas gardé.
    const contentSha256 = createHash('sha256').update(bytes).digest('hex')
    const candidate: TalentIdentityCandidate = {
      fullName: candidateName || null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      lastEmployer: null,
      documentHashes: [contentSha256],
    }

    // #2327.17 — « mettre à jour une fiche » : le CV rejoint une fiche
    // existante. La fiche est vérifiée AVANT l'extraction : un identifiant d'un
    // autre espace ne fait travailler personne.
    if (input.attachToTalentId) {
      const target = await this.consultants.findOne({
        where: { id: input.attachToTalentId, workspace_id: workspaceId },
      })
      if (!target) throw new NotFoundException('Talent introuvable')
      const { text, partial } = await this.extract(input)
      this.assertNotTabular(text)
      const experienceKeys = readExperienceKeys(text)
      const document = await this.saveDocument(workspaceId, userId, target.id, input, bytes, text, {
        contentSha256,
        experienceKeys,
        partial,
      })
      // #3935.16 (Louis 15/10/2026) — un CV ré-importé REMPLACE ET COMPLÈTE la fiche : il devient sa
      // matière et elle est RELUE depuis lui. L'ancien CV n'est pas perdu : il reste un document de la
      // fiche (archivé, consultable — `GET /talents/:id/documents`). La relecture n'écrit que ce que le
      // nouveau CV porte (un champ absent garde sa valeur) et jamais au-dessus d'un champ `human`.
      // _Ancien texte_ : ~~« Un CV déjà là n'est JAMAIS remplacé — les versions se gardent. »~~
      if (text.trim()) {
        target.cv_text = text
        // #2542.3 — le signal suit le texte qu'il qualifie : la fiche ne
        // peut pas dire « lecture complète » d'un texte qui ne l'était pas.
        target.cv_extraction_partial = partial
        await this.consultants.save(target)
        await this.autoParse?.enqueue(workspaceId, userId, target.id)
      }
      const matches = await this.identity.findForCandidate(workspaceId, { ...candidate, experienceKeys })
      const reason = matches.find(match => match.talentId === target.id)?.reason ?? null
      await this.identity.rememberAttached(workspaceId, userId, target.id, document.id, reason)
      return { outcome: 'updated', consultantId: target.id, extractedChars: text.length, state: 'updated' }
    }

    // La déduplication PRÉCÈDE l'extraction quand on a déjà de quoi comparer :
    // inutile de faire travailler le service d'extraction pour une fiche qu'on
    // ne créera pas. L'empreinte du fichier est TOUJOURS comparable.
    if (!input.createDespiteDuplicates) {
      const duplicates = await this.identity.findForCandidate(workspaceId, candidate)
      if (duplicates.length > 0) {
        return { outcome: 'duplicates', duplicates, state: resolveTalentIdentityState(duplicates) }
      }
    }

    const { text, partial } = await this.extract(input)
    this.assertNotTabular(text)
    // #2327.7 — les expériences ne se lisent qu'APRÈS extraction. Un CV
    // anonymisé n'a ni nom ni adresse : ses expériences sont la seule matière.
    const experienceKeys = readExperienceKeys(text)
    const withExperiences: TalentIdentityCandidate = { ...candidate, experienceKeys }
    if (!input.createDespiteDuplicates && experienceKeys.length > 0) {
      const duplicates = await this.identity.findForCandidate(workspaceId, withExperiences)
      if (duplicates.length > 0) {
        return { outcome: 'duplicates', duplicates, state: resolveTalentIdentityState(duplicates) }
      }
    }
    // M2.3 (Meyer 20/10) — une lecture sans nom, sans coordonnée et sans expérience, et démesurée pour un CV, ne crée
    // PAS de fiche : elle le dit. (La relecture des blocs est asynchrone — ces signaux sont ceux que le dépôt a en main.)
    if (
      !candidateName &&
      !extractCvEmail(text) &&
      !extractCvPhone(text) &&
      experienceKeys.length === 0 &&
      text.length > CV_TEXT_MAX_CHARS
    ) {
      throw new UnprocessableEntityException(CV_NOT_A_CV_MESSAGE)
    }
    const dismissedIds = input.dismissedTalentIds ?? []
    const dismissed =
      input.createDespiteDuplicates && dismissedIds.length > 0
        ? (await this.identity.findForCandidate(workspaceId, withExperiences)).filter(match =>
            dismissedIds.includes(match.talentId),
          )
        : []

    // #3781 — une personne EFFACÉE (RGPD art. 17) ne revient pas par un dépôt de
    // CV : l'empreinte posée à l'effacement répond avant toute écriture.
    if (
      await isErasedConsultantIdentity(this.consultants.manager, workspaceId, {
        full_name: candidateName || null,
        email: input.email ?? null,
        public_profile_url: null,
      })
    ) {
      throw new ConflictException(
        'Cette personne a demandé l’effacement de ses données : sa fiche ne peut pas être recréée.',
      )
    }

    const consultant = await this.consultants.save(
      this.consultants.create({
        workspace_id: workspaceId,
        user_id: userId,
        // Le nom fourni fait foi. Sinon la fiche naît SANS NOM (D366).
        //
        // ⚠️ Le repli sur le nom de fichier a été retiré ici. Il tenait sur un
        // raisonnement qui s'est révélé faux à l'usage : « le parsing le
        // corrigera, et une fiche `CV_2024_v3` se repère à l'œil ». Mesuré le
        // 30/08/2026 : le parsing ne corrigeait RIEN — l'étape de relecture
        // écartait explicitement le bloc `identity` — et l'écran de dépôt
        // n'envoie jamais `fullName`, si bien que `candidateName` était TOUJOURS
        // vide. Conséquence : **toute** fiche née d'un CV portait le nom de son
        // fichier, et le repli « temporaire » était l'état permanent.
        //
        // Un nom de fichier est une valeur de REMPLISSAGE, et le dépôt
        // s'interdit les valeurs de remplissage : « un champ illisible vaut
        // `null`, jamais une valeur de remplissage ».
        //
        // Le fichier n'est pas perdu pour autant : son nom est écrit juste en
        // dessous, dans `consultant_documents.filename`, où il DIT ce qu'il est
        // — et c'est ce que l'écran affiche sous « Nom non renseigné ».
        full_name: candidateName || null,
        kind: input.kind ?? 'candidate',
        source: 'cv',
        email: input.email ?? null,
        phone: input.phone ?? null,
        cv_text: text,
        // #2542.3 — le texte n'a peut-être pas été lu en entier ; la fiche le
        // dit dès sa naissance, pas seulement le document source.
        cv_extraction_partial: partial,
        // L'invariant du §3.3 : une fiche née d'une extraction n'est jamais
        // qualifiée d'office.
        review_status: 'needs_review',
        qualified_at: null,
      }),
    )

    await this.saveDocument(workspaceId, userId, consultant.id, input, bytes, text, {
      contentSha256,
      experienceKeys,
      partial,
    })
    // #2327.12 — « ce n'est pas la même personne » est une AFFIRMATION : elle
    // est mémorisée pour chaque fiche écartée, et la paire ne revient plus.
    await this.identity.rememberKeptSeparate(workspaceId, userId, consultant.id, dismissed)
    // #3952 (recette prod 09/10, réserve) — le dépôt INTERACTIF (ce chemin) ne
    // mettait PAS la fiche en lecture automatique, à la différence de
    // `intakeAutomatic` (c88) : une fiche née d'un dépôt unitaire restait
    // nom/intitulé « Non renseigné » tant qu'un humain n'ouvrait pas la revue
    // à la main. « Tous les CV sont lus automatiquement, toujours » (#3947)
    // vaut pour ce chemin aussi — même geste, même file, ne lève jamais.
    await this.autoParse?.enqueue(workspaceId, userId, consultant.id)

    return { outcome: 'created', consultantId: consultant.id, extractedChars: text.length, state: 'new' }
  }

  /**
   * Le dépôt AUTOMATIQUE — sans humain devant l'écran pendant qu'il tourne
   * (#2568.1 pièce jointe de messagerie, #2569.1 archive ZIP).
   *
   * Reprend EXACTEMENT le pipeline du dépôt interactif — extraction, doublon,
   * document — mais ne s'arrête jamais sur une ambiguïté : `decideCvBatchFileAction`
   * (#2569.3) tranche à sa place, entre auto-validation et exception isolée.
   * Aucune seconde route d'ingestion : c'est la même classe, le même
   * `extract`, le même `saveDocument`.
   *
   * Ne lance JAMAIS — un fichier illisible sur trois cents ne doit pas
   * emporter les autres (même règle que `cvBatch.ts` côté navigateur) : chaque
   * échec rend son issue.
   */
  /**
   * Incident boucle API (05/10/2026) — le contexte d'un LOT d'imports
   * automatiques : le vivier lu et indexé UNE fois, passé ensuite à chaque
   * `intakeAutomatic` du lot.
   */
  async openAutomaticBatch(workspaceId: string): Promise<CvIntakeAutomaticBatch> {
    return { identities: await this.identity.openCandidateIndex(workspaceId) }
  }

  /**
   * #4051 — la décision est portée par `decideIntakeAutomatic` (ci-dessous) ; ici seulement la trace « Importé le
   * <date> depuis <fichier> » sur la fiche créée, complétée ou isolée — jamais pour un fichier ignoré ou échoué.
   */
  async intakeAutomatic(
    workspaceId: string,
    userId: string,
    input: { filename: string; fileB64: string; capturedAt: Date | null },
    batch?: CvIntakeAutomaticBatch,
  ): Promise<CvBatchFileOutcome> {
    const outcome = await this.decideIntakeAutomatic(workspaceId, userId, input, batch)
    if (outcome.status === 'created' || outcome.status === 'auto_updated' || outcome.status === 'exception') {
      try {
        await insertImportMarks(this.consultants.manager, {
          workspaceId,
          entityType: 'consultant',
          entityIds: [outcome.consultantId],
          sourceKind: 'file',
          sourceLabel: input.filename,
        })
      } catch (error) {
        this.logger.warn(`Trace d'import non écrite (consultant): ${(error as Error).message}`)
      }
    }
    return outcome
  }

  private async decideIntakeAutomatic(
    workspaceId: string,
    userId: string,
    input: { filename: string; fileB64: string; capturedAt: Date | null },
    batch?: CvIntakeAutomaticBatch,
  ): Promise<CvBatchFileOutcome> {
    // #2326.12 (épopée #2794/#2905, lot V11) — les DIX étapes NOMMÉES
    // (`CV_INTAKE_STEPS`, `@bellum/contracts`), poussées AU MOMENT RÉEL où
    // chacune est franchie — jamais une liste à côté du code. Une sortie
    // anticipée garde une trace COURTE : elle dit exactement où le fichier
    // s'est arrêté, jamais plus.
    const steps: CvIntakeStepId[] = []

    // #3065 (lot 2) — un fichier qui n'est pas un CV (csv, xlsx, zip imbriqué,
    // sans extension reconnue) n'est jamais envoyé à l'extraction : ce n'est
    // pas un échec, c'est hors périmètre — le rapport le NOMME plutôt que de
    // le compter comme une erreur, et ça ne coûte rien.
    //
    // #3303 — sauf si les OCTETS disent CV malgré une extension absente ou
    // perdue (un export WeTransfer renomme parfois un fichier) : `apps/ia`
    // (`document_text.py`, `_looks_like_pdf`/`_office_kind`) sniffe déjà les
    // octets À L'EXTRACTION, indépendamment du nom transmis — ce qui manquait
    // était seulement de laisser le fichier ATTEINDRE cette étape plutôt que
    // de l'écarter ici sur la seule extension.
    steps.push('format_check')
    const bytes = Buffer.from(input.fileB64, 'base64')
    const hasRecognizedExtension = isRecognizedCvExtension(input.filename)
    if (!hasRecognizedExtension && !sniffCvFileKind(bytes)) {
      const ext = input.filename.includes('.') ? input.filename.slice(input.filename.lastIndexOf('.')) : ''
      const reason = ext
        ? `Ce n’est pas un CV (extension ${ext}) — ignoré, pas compté comme une erreur.`
        : 'Ce n’est pas un CV (aucune extension reconnue) — ignoré, pas compté comme une erreur.'
      return { status: 'ignored', file: input.filename, reason, steps }
    }

    steps.push('decode')
    if (bytes.byteLength === 0) {
      const reason = 'Fichier vide ou encodage invalide.'
      return { status: 'failed', file: input.filename, reason, category: classifyCvExtractFailure(reason), steps }
    }
    if (bytes.byteLength > CV_UPLOAD_MAX_BYTES) return { status: 'too_big', file: input.filename, steps }

    const contentSha256 = createHash('sha256').update(bytes).digest('hex')

    let text: string
    let partial: boolean
    steps.push('extract_text')
    try {
      ;({ text, partial } = await this.extract(input))
    } catch (error) {
      // Même règle que `cvBatch.ts` côté navigateur : le MOTIF du serveur
      // remonte tel quel — « probablement un scan » — plutôt qu'un message
      // générique qui ferait redéposer le même fichier sans savoir pourquoi.
      // #2183.41 — cette même raison est aussi CLASSÉE : « scans » devient une
      // catégorie structurée du rapport de fin, plus un texte libre parmi
      // d'autres.
      const reason = error instanceof Error && error.message ? error.message : 'Échec inconnu'
      return { status: 'failed', file: input.filename, reason, category: classifyCvExtractFailure(reason), steps }
    }

    steps.push('read_identity_signals')
    const experienceKeys = readExperienceKeys(text)
    // #2569.2 — lecture DÉTERMINISTE, jamais un modèle : c'est la seule matière
    // d'identité disponible sans humain pour la taper. Jamais de nom déduit
    // (D366), jamais une disponibilité, un TJM ou un consentement (interdits
    // du lot N). ⚠️ D366 est LEVÉE le 04/10/2026 pour la lecture automatique
    // par le MODÈLE (c88, mise en file plus bas, provenance `model`, fiche à
    // revoir) — pas pour cette lecture-ci, qui reste déterministe.
    const email = extractCvEmail(text)
    const phone = extractCvPhone(text)
    const candidate: TalentIdentityCandidate = {
      fullName: null,
      email,
      phone,
      lastEmployer: null,
      documentHashes: [contentSha256],
      experienceKeys,
    }
    steps.push('match_identity')
    // 05/10/2026 — en lot, l'index du lot ; seul, la relecture du vivier.
    const matches = batch
      ? batch.identities.find(candidate)
      : await this.identity.findForCandidate(workspaceId, candidate)
    steps.push('resolve_state')
    const rawState = resolveTalentIdentityState(matches)
    // #2183.13 — LE PALIER DE CONFIANCE À LA CRÉATION : `new` sur zéro signal
    // d'identité (ni nom — jamais déduit en lot —, ni e-mail, ni téléphone, ni
    // expérience lue) n'est pas « aucune ressemblance », c'est l'absence de
    // matière comparée. Rejoint la revue humaine comme n'importe quelle autre
    // ambiguïté — aucun statut inventé, aucune fiche perdue (#2184, critère 6).
    const state: TalentIdentityState = rawState === 'new' && !hasIdentitySignal(candidate) ? 'ambiguous' : rawState
    steps.push('decide_action')
    const decision = decideCvBatchFileAction(state, matches)

    if (decision.action === 'auto_update') {
      const target = await this.consultants.findOne({ where: { id: decision.talentId, workspace_id: workspaceId } })
      if (!target) {
        const reason = 'Fiche rapprochée introuvable — import ignoré.'
        return { status: 'failed', file: input.filename, reason, category: classifyCvExtractFailure(reason), steps }
      }
      steps.push('write_record')
      steps.push('save_document')
      const document = await this.saveDocument(
        workspaceId,
        userId,
        target.id,
        input,
        bytes,
        text,
        { contentSha256, experienceKeys, partial },
        input.capturedAt,
      )
      // #2569.2 — la donnée la plus récente gagne : un CV plus ANCIEN ne remplace pas le texte.
      // #3935.16 (Louis 15/10/2026, renversement daté) — une fiche qu'un HUMAIN a touchée est désormais
      // RELUE elle aussi : la correction humaine est gardée CHAMP PAR CHAMP par la relecture
      // (`applyFields`, provenance `human`), plus en gelant toute la fiche.
      // _Ancien texte_ : ~~« une fiche qu'un HUMAIN a touchée n'est plus rouverte par un import automatique »~~
      const contentReplaced = !target.cv_text || incomingCvIsMoreRecent(target.cv_captured_at, input.capturedAt)
      if (contentReplaced) {
        target.cv_text = text
        target.cv_captured_at = input.capturedAt
        // #2542.3 — même règle que le dépôt interactif : le signal suit le
        // texte qu'il remplace, pas l'ancien état de la fiche.
        target.cv_extraction_partial = partial
        await this.consultants.save(target)
        // c97 — le texte neuf est RELU (même file que la création) ; la lecture
        // n'écrase jamais un champ `human` (`applyFields`).
        await this.autoParse?.enqueue(workspaceId, userId, target.id)
      }
      const reason = matches.find(match => match.talentId === target.id)?.reason ?? null
      await this.identity.rememberAttached(workspaceId, userId, target.id, document.id, reason)
      batch?.identities.remember(target.id, { documentHashes: [contentSha256], experienceKeys })
      steps.push('classify_outcome')
      return {
        status: 'auto_updated',
        file: input.filename,
        consultantId: target.id,
        contentReplaced,
        matchedOn: reason,
        steps,
      }
    }

    // #3781.1 — une personne EFFACÉE (RGPD art. 17) ne revient pas par un lot
    // (ZIP/messagerie) non plus : seul le dépôt interactif (`intake`) portait
    // cette garde. `auto_update` n'écrit PAS de nouvelle fiche (ci-dessus) : la
    // garde ne vaut que pour la CRÉATION, ici et dans `importCsv`.
    if (
      await isErasedConsultantIdentity(this.consultants.manager, workspaceId, {
        full_name: null,
        email,
        public_profile_url: null,
      })
    ) {
      const reason = 'Cette personne a demandé l’effacement de ses données : sa fiche ne peut pas être recréée.'
      return { status: 'failed', file: input.filename, reason, category: classifyCvExtractFailure(reason), steps }
    }

    // `create` et `exception` créent tous deux la fiche : « aucun profil perdu
    // silencieusement » (#2184, critère 6). Seul le RAPPORT distingue les deux
    // — l'exception se retrouve, isolée, via l'écran d'identité existant
    // (`GET /:id/identity`) puisque ses champs sont ceux qui l'ont produite.
    steps.push('write_record')
    const consultant = await this.consultants.save(
      this.consultants.create({
        workspace_id: workspaceId,
        user_id: userId,
        full_name: null,
        kind: 'candidate',
        source: 'cv',
        email,
        phone,
        cv_text: text,
        cv_captured_at: input.capturedAt,
        cv_extraction_partial: partial,
        review_status: 'needs_review',
        qualified_at: null,
      }),
    )
    steps.push('save_document')
    await this.saveDocument(
      workspaceId,
      userId,
      consultant.id,
      input,
      bytes,
      text,
      { contentSha256, experienceKeys, partial },
      input.capturedAt,
    )
    batch?.identities.remember(consultant.id, { email, phone, documentHashes: [contentSha256], experienceKeys })
    // c88 (04/10/2026, import ZIP de 688 CV) — la fiche part en LECTURE
    // AUTOMATIQUE : nom, intitulé, compétences… écrits par le modèle en
    // provenance `model`, la fiche restant `needs_review`. Hors de ce service
    // (un job par fiche) : l'import ne patiente jamais derrière un modèle, et
    // une file indisponible ne le fait pas échouer (`enqueue` ne lève pas).
    await this.autoParse?.enqueue(workspaceId, userId, consultant.id)
    steps.push('classify_outcome')
    if (decision.action === 'exception') {
      const conflicts = matches.find(match => match.talentId === decision.talentId)?.conflicts ?? []
      return {
        status: 'exception',
        file: input.filename,
        consultantId: consultant.id,
        state: decision.state,
        conflicts,
        steps,
      }
    }
    return { status: 'created', file: input.filename, consultantId: consultant.id, steps }
  }

  /**
   * #2183.5 — import CSV d'un lot de consultants.
   *
   * Même service, même `identity` que le dépôt de CV : pas de seconde route
   * d'ingestion. La lecture (`parseConsultantCsv`) écarte déjà ce qui n'est
   * pas exploitable ou répété DANS le fichier ; ici, chaque ligne restante
   * est comparée au vivier EXISTANT — une ressemblance, quelle qu'elle soit,
   * ARRÊTE la ligne (même règle que le dépôt interactif `intake`, plus stricte
   * que `intakeAutomatic` qui, lui, a un texte de CV à comparer). Jamais de
   * fusion silencieuse : la ligne est nommée « doublon », pas écrite.
   */
  async importCsv(workspaceId: string, userId: string, content: string): Promise<ConsultantCsvImportReport> {
    const preview = parseConsultantCsv(content)
    const outcomes: ConsultantCsvImportOutcome[] = preview.skipped.map(skip => ({
      status: 'skipped',
      line: skip.line,
      reason: skip.reason,
    }))

    for (const row of preview.consultants) {
      const line = row.line
      const candidate: TalentIdentityCandidate = {
        fullName: row.fullName || null,
        email: row.email,
        phone: row.phone,
        lastEmployer: null,
        documentHashes: [],
      }
      const matches = await this.identity.findForCandidate(workspaceId, candidate)
      if (matches.length > 0) {
        outcomes.push({
          status: 'duplicate',
          line,
          matched: matches.map(match => match.fullName ?? this.unnamedMatch),
        })
        continue
      }

      // #3781.1 — même garde que le dépôt de CV et la création manuelle : une
      // ligne reproduisant une personne EFFACÉE (RGPD art. 17) ARRÊTE la ligne.
      if (
        await isErasedConsultantIdentity(this.consultants.manager, workspaceId, {
          full_name: row.fullName || null,
          email: row.email,
          public_profile_url: null,
        })
      ) {
        outcomes.push({ status: 'erased', line })
        continue
      }

      const consultant = await this.consultants.save(
        this.consultants.create({
          workspace_id: workspaceId,
          user_id: userId,
          full_name: row.fullName || null,
          title: row.title,
          email: row.email,
          phone: row.phone,
          kind: 'candidate',
          source: 'csv',
          review_status: 'needs_review',
          qualified_at: null,
        }),
      )
      outcomes.push({ status: 'created', line, consultantId: consultant.id })
    }

    outcomes.sort((a, b) => a.line - b.line)
    return {
      total: preview.consultants.length + preview.skipped.length,
      summary: summariseConsultantCsvImport(outcomes),
      outcomes,
      mappedColumns: preview.mappedColumns,
      ignoredColumns: preview.ignoredColumns,
      truncated: preview.truncated,
    }
  }

  /** Une fiche sans nom l'écran le dit plutôt que de rendre une chaîne vide. */
  private readonly unnamedMatch = 'Sans nom'

  /** M2.3 (Meyer 20/10) — le contenu a la forme d'un tableau délimité : refusé, rien n'est écrit. */
  private assertNotTabular(text: string): void {
    if (looksTabularText(text)) throw new UnprocessableEntityException(CV_NOT_A_CV_MESSAGE)
  }

  /** L'extraction, ou une erreur NOMMÉE — rien n'est écrit sans texte. */
  private async extract(input: CvIntakeInput): Promise<{ text: string; partial: boolean }> {
    // #2542.1 — mesuré pendant le call client de Ludovic Marx : un dossier de
    // compétences restait « en analyse » sans qu'aucune erreur ne remonte.
    // Seule l'ABSENCE de texte dans l'enveloppe était nommée ; un rejet de
    // l'appel lui-même (service IA injoignable, timeout du client HTTP après
    // ses trois tentatives) remontait tel quel — une exception technique
    // brute, sans cause nommée, jusqu'à un 500 générique. Un document jamais
    // traité ne reste jamais « en analyse » : il se termine, toujours, avec
    // une raison qu'on peut lire et un geste à faire (réessayer).
    //
    // #2569.1 — `intakeAutomatic` (import ZIP/messagerie) appelle `extract`
    // avec `{ filename, fileB64, capturedAt }`, un sous-ensemble de
    // `CvIntakeInput` : structurellement compatible (les champs manquants ont
    // tous un `.default()` ou sont `.optional()` dans `cvIntakeSchema`), donc
    // aucune signature dédiée n'est nécessaire.
    let envelope: unknown
    try {
      envelope = await this.ia.cvExtract({ fileB64: input.fileB64, filename: input.filename })
    } catch (error) {
      this.logger.warn(`CV intake: le service d'extraction n'a pas répondu pour ${input.filename}`, { error })
      throw new ServiceUnavailableException(
        'Le service d’extraction est indisponible pour le moment. Réessaie dans un instant — le fichier n’est pas perdu.',
      )
    }
    // Import ZIP de 2 329 CV (05/10/2026) — un PDF peut rendre un octet nul
    // dans son texte, et Postgres refuse `\u0000` dans tout `text` (`invalid
    // byte sequence for encoding "UTF8": 0x00`). Retiré ici, au seul point
    // d'entrée du texte : `cv_text` et `extracted_text` en héritent tous deux.
    // eslint-disable-next-line no-control-regex
    const text = readExtractedText(envelope)?.replace(/\u0000/g, '')
    if (!text) {
      // Rien n'est écrit : ni fiche vide, ni document sans texte. Le motif
      // remonte tel quel — « aucun texte » sans raison enverrait l'utilisateur
      // redéposer le même scan.
      const detail = readFailureDetail(envelope)
      this.logger.warn(`CV intake failed to extract text from ${input.filename}: ${detail ?? 'unknown reason'}`)
      throw new UnprocessableEntityException(
        detail ??
          'Aucun texte n’a pu être extrait de ce fichier — c’est souvent un CV scanné. Saisis-le à la main, le fichier n’est pas perdu.',
      )
    }
    // #2542.3 — mesuré en suivant la chaîne du #2542 : le service IA sait déjà
    // dire qu'une page n'a pas pu être lue (#1954.16/.30), et le rend
    // maintenant dans sa réponse (`apps/ia/app/routers/cv.py`). Le lire ici
    // est ce qui fait survivre le signal jusqu'à l'écran de revue — sinon un
    // document lu à moitié se présente comme un succès plein, exactement ce
    // que « non mesuré n'est jamais 0 » (GA-18/GA-19) interdit.
    return { text, partial: readExtractionPartial(envelope) }
  }

  private async saveDocument(
    workspaceId: string,
    userId: string,
    consultantId: string,
    input: { filename: string },
    bytes: Buffer,
    text: string,
    identity: { contentSha256: string; experienceKeys: string[]; partial: boolean },
    /** #2569.2 — la date RÉELLE du document ; `null` pour un dépôt manuel, dont
     *  on ne connaît pas la date d'origine. */
    capturedAt: Date | null = null,
  ): Promise<ConsultantDocumentEntity> {
    // #4034.2 — le type se lit dans les octets (puis l'extension) : c'est lui
    // qui décide, à l'écran, entre aperçu en cadre et « Télécharger l'original ».
    const mimeType = cvOriginalMimeType(input.filename, bytes)
    const document = await this.documents.save(
      this.documents.create({
        consultant_id: consultantId,
        workspace_id: workspaceId,
        kind: 'cv',
        filename: input.filename,
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
        extracted_text: text,
        uploaded_by: userId,
        content_sha256: identity.contentSha256,
        captured_at: capturedAt,
        experience_keys: identity.experienceKeys,
        extraction_partial: identity.partial,
      }),
    )
    await this.keepOriginal(workspaceId, document, input.filename, bytes, mimeType)
    return document
  }

  /**
   * #4034.2 — l'ORIGINAL du CV, rangé dans le seau PRIVÉ sous
   * `<workspace_id>/cv/<document_id>/<nom>`. Tous les chemins d'import passent
   * ici (dépôt unitaire, nouvelle version jointe, ZIP en ligne et volumineux,
   * pièce jointe de messagerie) : un seul point d'écriture.
   *
   * Un échec de stockage n'est PAS un échec d'import : le texte est déjà lu et
   * écrit, la fiche existe — l'aperçu dira « original non conservé ». Le
   * journal nomme le DOCUMENT, jamais le fichier (son nom porte souvent celui
   * de la personne).
   */
  private async keepOriginal(
    workspaceId: string,
    document: ConsultantDocumentEntity,
    filename: string,
    bytes: Buffer,
    mimeType: string,
  ): Promise<void> {
    if (!this.storage) return
    const path = cvOriginalStoragePath(workspaceId, document.id, filename)
    try {
      await this.storage.put(path, bytes, mimeType)
    } catch {
      this.logger.warn(`#4034 — original non conservé pour le document ${document.id} (stockage indisponible)`)
      return
    }
    try {
      await this.documents.update({ id: document.id, workspace_id: workspaceId }, { storage_path: path })
      document.storage_path = path
    } catch {
      // Un objet que plus aucune ligne ne désigne serait une donnée personnelle
      // orpheline : il repart aussitôt.
      this.logger.warn(`#4034 — chemin de l'original non écrit pour le document ${document.id}`)
      await this.storage.remove([path])
    }
  }
}
