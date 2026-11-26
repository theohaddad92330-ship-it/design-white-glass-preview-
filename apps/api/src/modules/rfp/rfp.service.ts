import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import {
  assessRfpActionability,
  bidDecisionSchema,
  computeRfpCompliance,
  computeRfpImportPreviewIndicators,
  esnAnswersToProfileData,
  findRfpSimilarityDuplicate,
  rfpReferenceKey,
  RFP_DEAL_VALUE_UNKNOWN,
  RFP_DOCUMENT_READINESS_CONFIRMED,
  RFP_EXTRACTION_CATEGORIES,
  RFP_OWNER_ASSIGNED_CONFIRMED,
  type BidDecision,
  type ConfirmRfpImport,
  type CreateRfpRequest,
  type RfpActionabilityAssessment,
  type RfpCompliance,
  type RfpDocumentExtraction,
  type RfpDocumentInput,
  type RfpDuplicateCandidate,
  type RfpDuplicateMatch,
  type RfpExtractedField,
  type RfpExtractionCategory,
  type RfpExtractionConfidence,
  type RfpExtractionStatus,
  type RfpFailedDocument,
  type RfpImportDraft,
  type RfpImportPreview,
  type RfpOwnerRole,
  type RfpRequirement,
  type RfpRequirementKind,
  type RfpRequirementWeight,
  type RfpSourceDocumentFilesResponse,
  type RfpSourceFormat,
  type SignedDownload,
  type UpdateRfpRequirement,
  type AddRfpRequirementComment,
  type AssignRfpSectionOwner,
  withAnswerVersion,
} from '@bellum/contracts'
import { RfpEntity } from '../../database/entities/rfp.entity'
import { RfpSourceDocumentEntity } from '../../database/entities/rfp-source-document.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { demoRfpAnalysis, demoRfpDraft } from '../demo/demo-scripts'
import { EsnProfileService } from '../esn-profile/esn-profile.service'
import { IaClient } from '../ia/ia.client'
import { StorageService, toStoredFile } from '../storage/storage.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #2957 (#2179.7-.12) — une ligne de `list()` : le dossier sans ses exigences
 * (même discipline que `RfpSummary` côté web), plus les DEUX comptes réels
 * dont les cartes de résumé de la page d'entrée ont besoin.
 */
type RfpListItem = Omit<RfpEntity, 'requirements'> & {
  mandatoryUnanswered: number
  toValidateCount: number
  /** #2179.25 — le total d'exigences extraites, pour la colonne « exigences »
   *  de la vue table. Même fonction pure que `mandatoryUnanswered` ci-dessus. */
  requirementsCount: number
  /** #2179.26 — le total d'obligatoires, pour la colonne « couverture »
   *  (`mandatoryTotal - mandatoryUnanswered` validées). */
  mandatoryTotal: number
}

/**
 * RFP/RFQ Studio (addendum final p66-68).
 *
 * Le service tient trois gestes, dans cet ordre : importer, décider, rédiger.
 * L'ordre est la partie qui compte — rédiger avant de décider est ce qui fait
 * répondre à des appels d'offres perdus d'avance, en y laissant trois jours
 * d'avant-vente.
 *
 * Il ne fabrique JAMAIS une exigence ni une réponse : l'extraction vient du
 * document, la rédaction vient de sources approuvées, et l'absence de source
 * produit « à produire » avec un propriétaire nommé. La matrice de conformité
 * (partagée, `computeRfpCompliance`) compte ce qui manque et bloque l'export —
 * elle ne fait pas confiance au modèle pour l'avoir dit.
 */
@Injectable()
export class RfpService {
  private readonly logger = new Logger(RfpService.name)

  constructor(
    @InjectRepository(RfpEntity)
    private readonly rfps: Repository<RfpEntity>,
    @InjectRepository(RfpSourceDocumentEntity)
    private readonly sourceDocuments: Repository<RfpSourceDocumentEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly ia: IaClient,
    private readonly esnProfile: EsnProfileService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Les dossiers de l'espace, les plus urgents d'abord.
   *
   * #2957 (#2179.7-.12) — les cartes de résumé de la page d'entrée ont besoin
   * d'un compte réel par dossier (exigences obligatoires sans réponse
   * validée, réponses en attente de validation), pas seulement du statut.
   * `requirements` traverse `computeRfpCompliance` — la MÊME fonction pure
   * que `findOne` — puis ressort de la ligne : la liste reste sans le détail
   * des exigences, comme avant ce lot.
   */
  async list(userId: string): Promise<{ rfps: RfpListItem[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.rfps.find({
      where: { workspace_id: workspaceId },
      // Une échéance proche passe avant un import récent : c'est l'ordre dans
      // lequel un responsable d'avant-vente lit sa liste.
      order: { due_at: 'ASC', created_at: 'DESC' },
      take: 100,
      select: [
        'id',
        'title',
        'issuer',
        'status',
        'due_at',
        'lots',
        'account_id',
        'created_at',
        'updated_at',
        'requirements',
      ],
    })
    const rfps = rows.map(({ requirements, ...row }) => {
      const compliance = computeRfpCompliance(requirements ?? [])
      // #2179.11 — « à valider » couvre une réponse déjà écrite mais pas
      // encore relue par un humain : `drafted` (rédigée par Laura) et
      // `to_validate` (#2181.20) portent toutes deux cette attente.
      const toValidateCount = (requirements ?? []).filter(
        r => r.answer_status === 'drafted' || r.answer_status === 'to_validate',
      ).length
      return {
        ...row,
        mandatoryUnanswered: compliance.mandatoryUnanswered,
        toValidateCount,
        requirementsCount: compliance.total,
        mandatoryTotal: compliance.mandatory,
      }
    })
    return { rfps }
  }

  /** Un dossier complet, avec sa matrice de conformité recalculée à la lecture. */
  async findOne(
    userId: string,
    id: string,
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance; actionability: RfpActionabilityAssessment }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')
    // Recalculée, jamais stockée : une conformité figée en base mentirait dès
    // qu'une exigence change d'état.
    return {
      rfp,
      compliance: computeRfpCompliance(rfp.requirements ?? []),
      // #2056.14 — un AO reçu n'est pas une opportunité traitable. `retour`
      // reste `null` (non mesuré) : aucune colonne ne le porte encore —
      // reporter `null` est honnête, jamais un `false` fabriqué. `economie`
      // (#2056.11) et `responsable` (#2057.10) sont désormais câblés.
      actionability: await this.actionabilityOf(userId, rfp),
    }
  }

  /**
   * #2179.36 — pose `need_id` une fois pour toutes. Appelée par le contrôleur
   * juste après la SEULE écriture de besoin (#2571.2) : un second appel à
   * `POST :id/need` trouve la colonne déjà remplie et se refuse avant
   * d'écrire un second `project_needs` pour le même dossier.
   */
  async markNeedCreated(userId: string, id: string, needId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.rfps.update({ id, workspace_id: workspaceId }, { need_id: needId })
  }

  /** #2056.14 — les cinq vérifications, à partir de ce qui est RÉELLEMENT mesuré. */
  private async actionabilityOf(userId: string, rfp: RfpEntity): Promise<RfpActionabilityAssessment> {
    const profileData = await this.safeProfile(userId)
    const readiness = profileData['rfpDocumentReadiness']
    // #2056.11 — un MONTANT nommé confirme l'axe ; « Je ne sais pas » (déclaré)
    // ET l'absence de réponse refusent l'axe tous les deux (jamais un `true`
    // fabriqué sur un silence).
    const dealValue = profileData['rfpDealValue']
    // #2057.10 — l'owner : seule la réponse EXPLICITE confirme l'axe.
    const ownerAssignment = profileData['rfpOwnerAssignment']
    return assessRfpActionability({
      briefAvailable: (rfp.requirements?.length ?? 0) > 0,
      clientResponsive: null,
      economicsKnown: typeof dealValue === 'string' ? dealValue !== RFP_DEAL_VALUE_UNKNOWN : null,
      capacityConfirmed: typeof readiness === 'string' ? readiness === RFP_DOCUMENT_READINESS_CONFIRMED : null,
      ownerAssigned: typeof ownerAssignment === 'string' ? ownerAssignment === RFP_OWNER_ASSIGNED_CONFIRMED : null,
    })
  }

  /**
   * Importe et analyse un appel d'offres — un document, ou plusieurs regroupés
   * dans un même dossier (#2180.2 détection, #2180.4 regroupement).
   *
   * Le texte peut arriver déjà extrait (le web le fait quand il peut) ou en
   * fichier brut, extrait côté IA — même raison que l'ingestion RAG : lire un
   * `.docx` en UTF-8 côté navigateur produit du mojibake.
   *
   * Chaque document est analysé SÉPARÉMENT (l'IA ne reçoit qu'un texte à la
   * fois, exactement comme en mono-document) puis les résultats sont
   * REGROUPÉS ici. Un document par appel plutôt qu'un texte concaténé : c'est
   * ce qui permet de savoir ensuite QUEL document a produit QUELLE exigence
   * (`RfpRequirement.source_document`), sans deviner une frontière dans un
   * texte fusionné.
   */
  async create(userId: string, input: CreateRfpRequest): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { draft, failedDocuments } = await this.analyse(userId, input)
    // #2180.53 — `create` garde son contrat D'AVANT, strict : une écriture
    // directe (hors du couple preview/confirm qui sait montrer et reprendre
    // un échec partiel) refuse un dossier incomplet plutôt que d'en persister
    // un silencieusement amputé d'un document.
    if (failedDocuments.length > 0) {
      throw new BadRequestException(
        `${failedDocuments.length} document(s) n’ont pas pu être analysés (${failedDocuments
          .map(failed => failed.fileName ?? 'document')
          .join(', ')}). Utilisez la prévisualisation (/rfp/preview) pour exclure ou corriger le document en échec.`,
      )
    }
    // #2957 (#2180.54) — un import DIRECT tient encore les octets bruts en
    // main (pas de couple preview/confirm ici) : ils voyagent jusqu'à
    // `persistDraft` pour être rangés, exactement comme `confirm` le fait
    // avec ce que le client resaisit.
    return this.persistDraft(userId, draft, null, documentsOf(input))
  }

  /**
   * #2180.5 — la MÊME analyse que `create`, mais RIEN n'est écrit : `preview`
   * rend ce que la confirmation créerait, avec les six indicateurs de l'écran
   * (#2180.41-46) et le doublon éventuel (#2180.40). C'est `confirm`
   * (#2180.6), juste en dessous, qui écrit — exactement ce brouillon, jamais
   * une ré-analyse qui pourrait diverger de ce que l'utilisateur a vu et validé.
   */
  async preview(userId: string, input: CreateRfpRequest): Promise<RfpImportPreview> {
    const { draft, failedDocuments } = await this.analyse(userId, input)
    return {
      draft,
      indicators: computeRfpImportPreviewIndicators(draft),
      duplicateOf: await this.findDuplicate(userId, draft),
      failedDocuments,
    }
  }

  /**
   * #2180.36-40 — le doublon proposé : d'abord le hash EXACT (#2180.40,
   * inchangé), sinon une SIMILARITÉ réelle (#2180.36-38, ce lot) sur les
   * dossiers de CET espace. Scopée par `workspace_id` (GA-43) — un doublon ne
   * se détecte jamais entre espaces concurrents. `null` = aucune des deux
   * recherches n'a rien trouvé, un fait réellement vérifié, pas « non mesuré ».
   */
  private async findDuplicate(
    userId: string,
    draft: Pick<RfpImportDraft, 'document_hash' | 'title' | 'issuer' | 'due_at' | 'reference'>,
  ): Promise<RfpDuplicateMatch | null> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const hashMatch = await this.rfps.findOne({
      where: { workspace_id: workspaceId, document_hash: draft.document_hash },
      select: ['id', 'title'],
    })
    if (hashMatch) return { id: hashMatch.id, title: hashMatch.title, matchedOn: ['hash'] }

    // Les dossiers les plus récents d'abord : un doublon RÉEL est le
    // commercial qui réimporte par erreur l'appel d'offres d'hier, pas celui
    // d'il y a deux ans — et la liste doit rester bornée.
    const recent = await this.rfps.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: 200,
      select: ['id', 'title', 'issuer', 'due_at', 'reference'],
    })
    // #2957 (#2180.39) — la RÉFÉRENCE de consultation : un critère EXACT (après
    // normalisation), suffisant SEUL — deux dossiers qui portent le même numéro
    // de consultation sont le même appel d'offres, quel que soit leur titre.
    const referenceKey = rfpReferenceKey(draft.reference)
    if (referenceKey) {
      const sameReference = recent.find(existing => rfpReferenceKey(existing.reference) === referenceKey)
      if (sameReference) return { id: sameReference.id, title: sameReference.title, matchedOn: ['reference'] }
    }
    const candidates: RfpDuplicateCandidate[] = recent.map(existing => ({
      id: existing.id,
      title: existing.title,
      issuer: existing.issuer,
      due_at: existing.due_at ? existing.due_at.toISOString() : null,
    }))
    return findRfpSimilarityDuplicate({ title: draft.title, issuer: draft.issuer, due_at: draft.due_at }, candidates)
  }

  /**
   * #2180.6 — la SEULE écriture d'un import prévisualisé. Le brouillon vient
   * tel quel de `preview` (#2180.47 « Confirmer » et #2180.51 « Créer comme
   * brouillon » partagent cette même écriture, voir le contrat) : aucune
   * analyse n'est relancée ici.
   */
  async confirm(userId: string, input: ConfirmRfpImport): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    return this.persistDraft(userId, input.draft, input.sourceNeedId ?? null, input.sourceDocuments ?? [])
  }

  /**
   * Lit et analyse un ou plusieurs documents — un dossier COMPLET, mais pas
   * encore écrit. Partagée par `create` (écriture immédiate) et `preview`
   * (écriture différée après validation humaine, #2180.5/.6) : la
   * prévisualisation doit montrer EXACTEMENT ce qui serait créé.
   *
   * Le texte peut arriver déjà extrait (le web le fait quand il peut) ou en
   * fichier brut, extrait côté IA — même raison que l'ingestion RAG : lire un
   * `.docx` en UTF-8 côté navigateur produit du mojibake.
   *
   * Chaque document est analysé SÉPARÉMENT (l'IA ne reçoit qu'un texte à la
   * fois, exactement comme en mono-document) puis les résultats sont
   * REGROUPÉS ici. Un document par appel plutôt qu'un texte concaténé : c'est
   * ce qui permet de savoir ensuite QUEL document a produit QUELLE exigence
   * (`RfpRequirement.source_document`), sans deviner une frontière dans un
   * texte fusionné.
   *
   * #2180.53 — INTERROMPABLE ET REPRENABLE : `Promise.allSettled` (jamais
   * `Promise.all`) fait que l'échec d'UN document (timeout, document
   * illisible) ne perd JAMAIS le travail déjà fait sur les autres. Seul un
   * échec TOTAL (aucun document exploitable) fait encore échouer l'appel —
   * il n'y aurait rien à montrer. `failedDocuments` nomme le reste : c'est ce
   * qui permet à l'humain de reprendre (exclure le document en échec,
   * #2180.49, ou relancer) sans redéposer ce qui a déjà réussi.
   */
  private async analyse(
    userId: string,
    input: CreateRfpRequest,
  ): Promise<{ draft: RfpImportDraft; failedDocuments: RfpFailedDocument[] }> {
    const documents = documentsOf(input)
    if (documents.length === 0 || documents.some(document => !document.text && !document.fileBase64)) {
      throw new BadRequestException('Fournissez le texte de l’appel d’offres ou son fichier.')
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const accountName = input.accountId ? await this.resolveAccountName(input.accountId, workspaceId) : undefined
    const profileData = await this.safeProfile(userId)

    // En démonstration, l'analyse est SCRIPTÉE : le visiteur fait le geste
    // — coller, cliquer — et l'écran se remplit, mais aucun modèle n'est appelé
    // depuis un lien public. Voir `demo-scripts.ts` pour la règle complète.
    const isDemo = await this.workspaceContext.isDemoWorkspace(userId)
    const settled = await Promise.allSettled(
      documents.map(document =>
        isDemo
          ? Promise.resolve(demoRfpAnalysis(input.title))
          : this.ia.rfpAnalyse({
              ...(document.text ? { text: document.text } : {}),
              ...(document.fileBase64 ? { fileBase64: document.fileBase64 } : {}),
              ...(document.fileName ? { fileName: document.fileName } : {}),
              profileData,
              ...(accountName ? { accountName } : {}),
            }),
      ),
    )

    const succeeded: { document: RfpDocumentInput; analysed: RfpAnalysisResult }[] = []
    const failedDocuments: RfpFailedDocument[] = []
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        succeeded.push({ document: documents[index], analysed: outcome.value })
      } else {
        failedDocuments.push({
          fileName: documents[index].fileName ?? null,
          reason: outcome.reason instanceof Error ? outcome.reason.message : 'Analyse indisponible.',
        })
      }
    })

    if (succeeded.length === 0) {
      // Rien d'exploitable : pas de preview possible sur du vide. La
      // première raison suffit à orienter la reprise (même document en
      // mono-document, premier échec en multi-document).
      throw new BadRequestException(failedDocuments[0]?.reason ?? 'Analyse indisponible.')
    }

    const analyses = succeeded.map(entry => entry.analysed)
    const requirements = succeeded.flatMap(({ document, analysed }) =>
      this.normaliseRequirements(analysed.requirements, randomUUID(), document.fileName ?? null),
    )
    const dueAt = parseDate(firstTruthy(analyses.map(analysed => analysed.dueAt)))
    const draft: RfpImportDraft = {
      account_id: input.accountId ?? null,
      // Le titre du commercial gagne sur celui extrait : c'est lui qui
      // retrouvera son dossier dans une liste.
      title: input.title.trim() || firstTruthy(analyses.map(analysed => analysed.title)) || 'Appel d’offres',
      issuer: firstTruthy(analyses.map(analysed => analysed.issuer)) ?? null,
      // #2957 (#2180.39) — même règle que l'émetteur : le premier document qui
      // la porte, telle qu'écrite (bornée à la taille de la colonne).
      reference: normaliseReference(firstTruthy(analyses.map(analysed => analysed.reference))),
      source_format: sourceFormatOf(documents[0]),
      due_at: dueAt ? dueAt.toISOString() : null,
      // Le premier document qui PORTE un champ gagne — déterministe, dans
      // l'ordre d'envoi. Une fusion « le plus complet » ou « le plus récent »
      // supposerait un ordre de confiance entre documents qu'on n'a pas.
      lots: firstTruthy(analyses.map(analysed => (analysed.lots?.length ? analysed.lots : undefined))) ?? [],
      source_text: mergeSourceText(
        succeeded.map(entry => entry.document),
        analyses,
      ),
      // #2180.4 — AUCUNE décision bid/no-bid FABRIQUÉE par fusion : au-delà
      // d'un document EXPLOITÉ, chaque analyse ne porte que sur SA PROPRE
      // lecture, partielle. Une décision unique demanderait une lecture
      // COMBINÉE que le modèle n'a pas faite ici. Tranché sans Louis (#2957) :
      // `null` (dossier « analysé », decision à trancher manuellement) plutôt
      // qu'une synthèse inventée entre documents. Comptée sur les documents
      // RÉUSSIS : un document en échec ne doit pas priver l'unique document
      // exploité de sa décision individuelle.
      decision: succeeded.length > 1 ? null : normaliseDecision(analyses[0]?.decision),
      requirements,
      document_hash: documentHashOf(documents),
      // #2957 (#2180.9-.26) — la structure DOSSIER, reparentée depuis chaque
      // document RÉUSSI (même filtre que `requirements` ci-dessus : un
      // document en échec ne prive pas le dossier de ce que les autres ont
      // livré). Fusion au PREMIER document qui a une valeur pour CETTE
      // catégorie — même règle que titre/émetteur/échéance plus haut, jamais
      // un ordre de confiance qu'on n'a pas.
      document_extraction: mergeDocumentExtractions(
        succeeded.map(({ document, analysed }) =>
          normaliseDocumentExtraction(
            analysed.documentExtraction,
            documents.length > 1 ? (document.fileName ?? null) : null,
          ),
        ),
      ),
    }
    return { draft, failedDocuments }
  }

  /**
   * L'UNIQUE écriture d'un dossier RFP, qu'elle vienne d'un import direct
   * (`create`) ou d'une confirmation après preview (`confirm`, #2180.6).
   * Analysé, pas décidé : le bid/no-bid est une PROPOSITION que l'humain
   * tranche. Passer directement en `bid` reviendrait à décider pour lui.
   */
  private async persistDraft(
    userId: string,
    draft: RfpImportDraft,
    sourceNeedId: string | null = null,
    sourceDocuments: readonly RfpDocumentInput[] = [],
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.save(
      this.rfps.create({
        workspace_id: workspaceId,
        user_id: userId,
        account_id: draft.account_id,
        title: draft.title,
        issuer: draft.issuer,
        source_format: draft.source_format,
        status: 'analysed',
        due_at: parseDate(draft.due_at),
        lots: draft.lots,
        source_text: draft.source_text,
        decision: draft.decision,
        requirements: draft.requirements,
        document_hash: draft.document_hash,
        document_extraction: draft.document_extraction,
        reference: draft.reference ?? null,
        need_id: sourceNeedId,
      }),
    )
    this.logger.log('RFP importé', {
      tags: {
        'rfp.requirements': String(draft.requirements.length),
        'rfp.verdict': (draft.decision as BidDecision | null)?.verdict ?? 'none',
      },
    })
    await this.storeSourceDocuments(workspaceId, userId, rfp.id, sourceDocuments)
    return { rfp, compliance: computeRfpCompliance(draft.requirements) }
  }

  /**
   * #2957 (#2180.54) — conserve les fichiers BRUTS du dossier qui vient
   * d'être créé, un par un.
   *
   * Un document texte collé (pas de `fileBase64`) n'a rien à conserver — la
   * doctrine ne fabrique pas un fichier depuis un texte. `position` suit
   * l'ordre de dépôt, le même que `RfpRequirement.source_document` (qui,
   * lui, désigne un document par son NOM, pas par sa position).
   *
   * ⚠️ Un échec de dépôt (quota d'espace dépassé, type refusé) est LOGUÉ,
   * jamais remonté : le dossier lui-même vient d'être écrit avec succès
   * (l'analyse, les exigences, la décision) — le perdre parce qu'un fichier
   * annexe n'a pas pu être rangé ferait perdre du travail réel pour une
   * conséquence secondaire. Le dossier reste alors sans fichier conservé,
   * comme avant ce lot.
   */
  private async storeSourceDocuments(
    workspaceId: string,
    userId: string,
    rfpId: string,
    documents: readonly RfpDocumentInput[],
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)
    let position = 0
    for (const document of documents) {
      if (!document.fileBase64) continue
      const fileName = document.fileName?.trim() || `document-${position + 1}.pdf`
      try {
        const stored = await this.storage.put({
          workspaceId,
          domain: 'rfp_source_document',
          fileName,
          contentType: 'application/octet-stream',
          fileB64: document.fileBase64,
          uploadedBy: userId,
          today,
        })
        await this.sourceDocuments.save(
          this.sourceDocuments.create({
            workspace_id: workspaceId,
            rfp_id: rfpId,
            storage_object_id: stored.id,
            position,
          }),
        )
      } catch (error) {
        this.logger.warn(`Fichier source non conservé (${fileName}) : ${(error as Error).message}`)
      }
      position += 1
    }
  }

  /**
   * #2957 (#2180.54) — ce que le stockage porte pour CE dossier : les mêmes
   * deux moitiés que `NeedDocumentFilesResponse` (fichier RÉFÉRENCÉ vs
   * fichier CONSERVÉ), à la différence près qu'ici toute ligne de
   * `rfp_source_documents` référence forcément un fichier (voir le docblock
   * de la migration — `ON DELETE CASCADE`, jamais de ligne orpheline).
   */
  async listSourceDocuments(userId: string, rfpId: string): Promise<RfpSourceDocumentFilesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id: rfpId, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')
    const joins = await this.sourceDocuments.find({
      where: { workspace_id: workspaceId, rfp_id: rfpId },
      order: { position: 'ASC' },
    })
    const objects = await this.storage.byIds(
      workspaceId,
      joins.map(join => join.storage_object_id),
    )
    const files = joins
      .map(join => {
        const record = objects.get(join.storage_object_id)
        // Un objet référencé mais introuvable est SAUTÉ, jamais inventé — le
        // cas d'un fichier emporté par la purge de rétention (`storage_objects`
        // ne garde alors plus la ligne, mais un balayage encore en cours
        // pourrait laisser un instant cet état).
        return record ? toStoredFile(record, rfpSourceDocumentDownloadPath(rfpId, join.storage_object_id)) : null
      })
      .filter((file): file is NonNullable<typeof file> => file !== null)
    return { files, usedBytes: await this.storage.usedBytes(workspaceId), quotaBytes: this.storage.quotaBytes() }
  }

  /**
   * #2957 (#2180.54) — OUVRE un fichier source : une URL signée qui vit cinq
   * minutes, jamais une URL gardée. Bornée par le dossier ET par l'espace :
   * un identifiant deviné ne trouve rien tant qu'il n'est pas RÉFÉRENCÉ par
   * ce dossier précis (même garde que `downloadNeedDocument`,
   * `projects.controller.ts`).
   */
  async downloadSourceDocument(userId: string, rfpId: string, objectId: string): Promise<SignedDownload> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id: rfpId, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')
    const join = await this.sourceDocuments.findOne({
      where: { workspace_id: workspaceId, rfp_id: rfpId, storage_object_id: objectId },
    })
    if (!join) throw new NotFoundException('Ce document n’a pas de fichier stocké ici.')
    return this.storage.signedUrlFor(workspaceId, objectId)
  }

  /** L'humain tranche le bid/no-bid. La proposition de l'IA reste dans `decision`. */
  async decide(userId: string, id: string, verdict: 'bid' | 'no_bid'): Promise<{ rfp: RfpEntity }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')
    rfp.status = verdict
    await this.rfps.save(rfp)
    return { rfp }
  }

  /**
   * #2957 (#2181.47) — « Marquer soumis ». Un geste DÉCLARATIF, comme
   * `decide` juste au-dessus : le commercial dit avoir déposé la réponse sur
   * la plateforme de l'acheteur, exactement comme il dit avoir envoyé un
   * e-mail ailleurs dans le produit (doctrine « "Fait" ne porte jamais de
   * preuve d'envoi ») — Laura ne soumet jamais elle-même.
   *
   * Refusé tant que le dossier n'est pas passé par `bid` : marquer soumis un
   * dossier jamais décidé, ou explicitement `no_bid`, écrirait un état que
   * plus rien ne soutient. Idempotent sur un dossier déjà `submitted` — un
   * second clic (double-onglet, retour arrière) ne réécrit rien.
   */
  async markSubmitted(userId: string, id: string): Promise<{ rfp: RfpEntity }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')
    if (rfp.status === 'submitted') return { rfp }
    if (rfp.status !== 'bid') {
      throw new BadRequestException('Un dossier ne peut être marqué soumis qu’après la décision « on y va ».')
    }
    rfp.status = 'submitted'
    await this.rfps.save(rfp)
    return { rfp }
  }

  /**
   * Met à jour UNE exigence : son poids, son propriétaire, l'état de sa réponse.
   *
   * `validated` est refusé sans source. C'est le garde-fou qui compte : valider
   * une réponse sans savoir d'où elle vient est exactement ce qui produit un
   * engagement contractuel inventé, découvert en audit.
   */
  async updateRequirement(
    userId: string,
    id: string,
    requirementId: string,
    patch: UpdateRfpRequirement,
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')

    const index = (rfp.requirements ?? []).findIndex(requirement => requirement.id === requirementId)
    if (index === -1) throw new NotFoundException('Exigence introuvable.')

    // #2957 (#2181.16) — une réponse réécrite garde l'ancienne en `versions`.
    const merged: RfpRequirement = withAnswerVersion(
      rfp.requirements[index],
      { ...rfp.requirements[index], ...stripUndefined(patch) },
      userId,
      new Date(),
    )
    if (merged.answer_status === 'validated' && !merged.answer_source?.trim()) {
      throw new BadRequestException('Une réponse ne peut pas être validée sans sa source.')
    }
    rfp.requirements = [...rfp.requirements]
    rfp.requirements[index] = merged
    await this.rfps.save(rfp)
    return { rfp, compliance: computeRfpCompliance(rfp.requirements) }
  }

  /**
   * Fait rédiger la réponse à UNE exigence à partir des sources approuvées.
   *
   * Une exigence par appel, délibérément : rédiger quarante réponses d'un coup
   * rend impossible de dire laquelle repose sur quelle source, et la traçabilité
   * est toute la valeur du studio. Un `to_produce` en retour n'est pas un échec —
   * c'est l'information la plus utile de l'écran.
   */
  async draft(
    userId: string,
    id: string,
    requirementId: string,
    approvedSources: { title: string; content: string }[],
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')

    const index = (rfp.requirements ?? []).findIndex(requirement => requirement.id === requirementId)
    if (index === -1) throw new NotFoundException('Exigence introuvable.')

    const drafted = (await this.workspaceContext.isDemoWorkspace(userId))
      ? demoRfpDraft()
      : await this.ia.rfpDraft({
          requirement: rfp.requirements[index],
          approvedSources,
        })

    const current = rfp.requirements[index]
    rfp.requirements = [...rfp.requirements]
    // #2957 (#2181.16) — « Rédiger » par-dessus une réponse existante l'archive.
    rfp.requirements[index] = withAnswerVersion(
      current,
      {
        ...current,
        // On ne promeut JAMAIS à `validated` ici : c'est un humain qui valide.
        answer_status: drafted.status === 'drafted' ? 'drafted' : 'to_produce',
        answer_text: drafted.answer ?? null,
        answer_source: drafted.source ?? null,
        owner_role: normaliseOwner(drafted.ownerRole) ?? current.owner_role,
        risk: drafted.missing ?? current.risk,
      },
      userId,
      new Date(),
    )
    await this.rfps.save(rfp)
    return { rfp, compliance: computeRfpCompliance(rfp.requirements) }
  }

  /**
   * #2957 (#2181.40) — « Attribuer une section » : le même rôle sur TOUTES les
   * exigences d'une section, en une écriture. Une section qui ne porte aucune
   * exigence se refuse plutôt que de répondre « fait » sur rien.
   */
  async assignSectionOwner(
    userId: string,
    id: string,
    input: AssignRfpSectionOwner,
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')

    const target = input.section?.trim() || null
    const inSection = (requirement: RfpRequirement) => (requirement.section?.trim() || null) === target
    if (!(rfp.requirements ?? []).some(inSection)) throw new NotFoundException('Section introuvable.')

    rfp.requirements = rfp.requirements.map(requirement =>
      inSection(requirement) ? { ...requirement, owner_role: input.owner_role } : requirement,
    )
    await this.rfps.save(rfp)
    return { rfp, compliance: computeRfpCompliance(rfp.requirements) }
  }

  /**
   * #2957 (#2181.15) — un commentaire d'équipe sur UNE exigence. Auteur et
   * date posés ICI, jamais reçus du client ; les commentaires précédents ne
   * sont jamais réécrits (ajout à la suite).
   */
  async addRequirementComment(
    userId: string,
    id: string,
    requirementId: string,
    input: AddRfpRequirementComment,
  ): Promise<{ rfp: RfpEntity; compliance: RfpCompliance }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rfp = await this.rfps.findOne({ where: { id, workspace_id: workspaceId } })
    if (!rfp) throw new NotFoundException('Appel d’offres introuvable.')

    const index = (rfp.requirements ?? []).findIndex(requirement => requirement.id === requirementId)
    if (index === -1) throw new NotFoundException('Exigence introuvable.')

    const current = rfp.requirements[index]
    rfp.requirements = [...rfp.requirements]
    rfp.requirements[index] = {
      ...current,
      comments: [
        ...(current.comments ?? []),
        { id: randomUUID(), author_id: userId, body: input.body, created_at: new Date().toISOString() },
      ],
    }
    await this.rfps.save(rfp)
    return { rfp, compliance: computeRfpCompliance(rfp.requirements) }
  }

  /** Nom du compte rattaché, dans le périmètre de l'appelant. */
  private async resolveAccountName(accountId: string, workspaceId: string): Promise<string | undefined> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: ['company_name'],
    })
    return account?.company_name ?? undefined
  }

  /** Le profil ESN, ou `{}` — un profil manquant ne doit pas bloquer un import.
   *  Le bid/no-bid sera simplement moins tranché, ce qui est honnête : sans
   *  savoir ce que l'ESN sait faire, on ne peut pas juger du fit. */
  private async safeProfile(userId: string): Promise<Record<string, unknown>> {
    try {
      // Passe par le résolveur de profil (portefeuille d'offre compris) plutôt
      // que de remapper à la main : un appelant qui remappe est un appelant qui
      // raisonnera dans un autre prisme que ses voisins le jour où le mapping
      // gagne un champ.
      return (await this.esnProfile.resolveProfileData(userId)) as unknown as Record<string, unknown>
    } catch (error) {
      this.logger.warn('Profil ESN indisponible pour l’analyse RFP', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }

  /**
   * Normalise les exigences renvoyées par le modèle.
   *
   * Toute valeur inconnue retombe sur la position la plus PRUDENTE : un poids
   * qu'on ne reconnaît pas devient `ambiguous` (donc une question au client), et
   * non `informative` — qui ferait disparaître l'exigence des manques.
   */
  private normaliseRequirements(raw: unknown, rfpId: string, sourceDocument: string | null): RfpRequirement[] {
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item): RfpRequirement | null => {
        const text = typeof item['text'] === 'string' ? item['text'].trim() : ''
        if (!text) return null
        return {
          id: randomUUID(),
          rfp_id: rfpId,
          section: typeof item['section'] === 'string' ? item['section'].slice(0, 300) : null,
          text: text.slice(0, 4000),
          weight: normaliseWeight(item['weight']),
          kind: normaliseKind(item['kind']),
          owner_role: normaliseOwner(item['ownerRole']) ?? 'sales',
          answer_status: 'to_produce' as const,
          answer_source: null,
          answer_text: null,
          risk: typeof item['risk'] === 'string' ? item['risk'].slice(0, 1000) : null,
          // #2180.27 — `null` en mono-document (rien à distinguer), le nom du
          // document en multi-document (#2180.2 / #2180.4).
          source_document: sourceDocument,
        }
      })
      .filter((requirement): requirement is RfpRequirement => requirement !== null)
  }
}

/**
 * #2180.2 — les documents DÉTECTÉS pour cet import : soit `documents` (deux ou
 * plus, #2180.4), soit repli sur `text`/`fileBase64` — le mono-document
 * d'avant, à l'identique. Ne VALIDE rien : `create` refuse ensuite un document
 * sans texte ni fichier, au même endroit qu'avant pour le mono-document.
 */
function documentsOf(input: CreateRfpRequest): RfpDocumentInput[] {
  if (input.documents && input.documents.length > 0) return input.documents
  if (input.text || input.fileBase64) {
    return [{ text: input.text, fileBase64: input.fileBase64, fileName: input.fileName }]
  }
  return []
}

/** La première valeur qui existe VRAIMENT, dans l'ordre d'envoi — jamais une
 *  fusion qui suppose un ordre de confiance entre documents qu'on n'a pas. */
function firstTruthy<T>(values: readonly (T | null | undefined)[]): T | undefined {
  return values.find((value): value is T => Boolean(value))
}

/**
 * #2180.40 — hash SHA-256 du contenu BRUT déposé (le fichier en base64, ou le
 * texte collé à défaut), dans l'ordre d'envoi des documents. Jamais du texte
 * EXTRAIT par le modèle : celui-ci peut légèrement dériver d'un appel à
 * l'autre sur un document identique (reformulation, troncature d'un
 * paragraphe ambigu), ce qui romprait la détection de doublon sans qu'aucun
 * contenu n'ait réellement changé.
 */
function documentHashOf(documents: readonly RfpDocumentInput[]): string {
  const hash = createHash('sha256')
  for (const document of documents) hash.update((document.fileBase64 ?? document.text ?? '') + '\u0000')
  return hash.digest('hex')
}

/**
 * Le texte source, pour re-analyse et audit. Mono-document : identique à
 * avant (`input.text ?? analysed.sourceText ?? null`). Multi-document : les
 * textes sont CONCATÉNÉS avec le nom du document en repère — jamais fusionnés
 * sans trace de leur origine.
 */
function mergeSourceText(documents: RfpDocumentInput[], analyses: readonly RfpAnalysisResult[]): string | null {
  const parts = documents
    .map((document, index) => {
      const text = document.text ?? analyses[index]?.sourceText ?? null
      if (!text) return null
      return documents.length === 1 ? text : `--- ${document.fileName ?? `Document ${index + 1}`} ---\n${text}`
    })
    .filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * La décision, ramenée à la forme que l'écran sait lire.
 *
 * Elle arrive d'un MODÈLE : rien ne garantit qu'elle porte `redFlags`,
 * `questions` ou `conditions`. Elle était pourtant stockée telle quelle, puis
 * rendue telle quelle, et l'écran fait `items.length` dessus — un tableau
 * manquant remplace donc tout le dossier par « Une erreur inattendue est
 * survenue ». Vu en production le 03/08 : c'est une réponse scriptée qui l'a
 * révélé, mais un modèle qui omet une clé produit exactement le même écran.
 *
 * `bidDecisionSchema` porte déjà les `.default([])` qu'il faut. On le fait
 * simplement TOURNER — au lieu d'un `as`, qui affirmait la forme sans jamais la
 * vérifier. Une décision franchement illisible devient `null` : pas de décision
 * vaut mieux qu'un dossier qu'on ne peut pas ouvrir.
 */
function normaliseDecision(raw: unknown): BidDecision | null {
  if (raw == null || typeof raw !== 'object') return null
  // Les champs absents sont COMPLÉTÉS avant la validation, pas après : `fit` et
  // `capacity` sont « nullable » mais requis au contrat, si bien qu'un modèle
  // qui n'en cite qu'un ferait tomber la décision entière. Perdre un bid/no-bid
  // argumenté parce qu'il manque un chiffre serait un mauvais échange.
  const parsed = bidDecisionSchema.safeParse({
    fit: null,
    capacity: null,
    conditions: [],
    questions: [],
    redFlags: [],
    ...(raw as Record<string, unknown>),
  })
  return parsed.success ? parsed.data : null
}

/**
 * #2957 (#2180.9-.26) — normalise CE que le modèle a rendu pour UN document,
 * catégorie par catégorie. Toute catégorie absente, mal formée, ou dont le
 * `status` n'est pas reconnu devient `not_found` — la position la plus
 * PRUDENTE, même logique que `normaliseWeight` (un poids inconnu devient
 * `ambiguous`, jamais un poids qui efface l'exigence). `contradiction` n'est
 * JAMAIS accepté d'un modèle qui ne voit qu'UN document : retombé sur
 * `to_verify` plutôt que sur une contradiction qu'aucune comparaison réelle
 * n'a établie.
 */
function normaliseDocumentExtraction(raw: unknown, sourceDocument: string | null): RfpDocumentExtraction | null {
  if (raw == null || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const fields: Partial<RfpDocumentExtraction> = {}
  for (const category of RFP_EXTRACTION_CATEGORIES) {
    const field = normaliseExtractedField(record[category], sourceDocument)
    if (field) fields[category] = field
  }
  return Object.keys(fields).length > 0 ? (fields as RfpDocumentExtraction) : null
}

const EXTRACTION_STATUSES: RfpExtractionStatus[] = ['found', 'to_verify', 'not_found', 'contradiction']
const EXTRACTION_CONFIDENCES: RfpExtractionConfidence[] = ['high', 'medium', 'low']

function normaliseExtractedField(raw: unknown, sourceDocument: string | null): RfpExtractedField | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const item = raw as Record<string, unknown>
  const rawStatus = EXTRACTION_STATUSES.find(status => status === item['status']) ?? 'not_found'
  // Un seul document est lu à la fois ici : une "contradiction" rendue par le
  // modèle malgré la consigne n'a rien à comparer — dégradée en `to_verify`
  // plutôt que d'afficher une contradiction jamais réellement établie.
  const status: RfpExtractionStatus = rawStatus === 'contradiction' ? 'to_verify' : rawStatus
  const value = typeof item['value'] === 'string' ? item['value'].trim().slice(0, 4000) : ''
  return {
    // `null` dès que le statut n'est pas `found`/`to_verify` — jamais une
    // valeur devinée pour combler un champ que le modèle a dit ne pas avoir.
    value: status !== 'not_found' && value ? value : null,
    source_document: status !== 'not_found' && value ? sourceDocument : null,
    page: typeof item['page'] === 'string' && item['page'].trim() ? item['page'].trim().slice(0, 100) : null,
    confidence: EXTRACTION_CONFIDENCES.find(confidence => confidence === item['confidence']) ?? null,
    status,
  }
}

/** Normalise une valeur extraite pour la COMPARER entre documents — jamais
 *  pour l'afficher. Espaces et casse ne font pas une contradiction. */
function normalisedForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * #2957 — fusionne l'extraction de PLUSIEURS documents RÉUSSIS, catégorie par
 * catégorie.
 *
 * #2180.35/.44 — avant de prendre une valeur, les documents qui en ont une
 * (`status !== 'not_found'`) sont désormais COMPARÉS entre eux : au moins
 * deux valeurs distinctes (après normalisation espaces/casse) sur la MÊME
 * catégorie sont une contradiction RÉELLEMENT établie — `status:
 * 'contradiction'`, `value`/`source_document`/`page`/`confidence` à `null`
 * comme pour `not_found`, parce qu'aucune des deux lectures n'est plus vraie
 * que l'autre et qu'en choisir une serait la donnée inventée que ce dépôt
 * refuse (doctrine). Sans désaccord, le PREMIER document qui a une valeur
 * gagne — même règle déterministe que titre/émetteur/échéance (`firstTruthy`)
 * plus haut, jamais un ordre de confiance entre documents qu'on n'a pas. Une
 * catégorie que TOUS les documents disent `not_found` reste `not_found`, sur
 * le premier document qui l'a dit.
 */
function mergeDocumentExtractions(
  extractions: readonly (RfpDocumentExtraction | null)[],
): RfpDocumentExtraction | null {
  const present = extractions.filter((extraction): extraction is RfpDocumentExtraction => extraction !== null)
  if (present.length === 0) return null

  const merged: Partial<RfpDocumentExtraction> = {}
  for (const category of RFP_EXTRACTION_CATEGORIES) {
    const withValue = present
      .map(extraction => extraction[category])
      .filter(
        (field): field is RfpExtractedField => field != null && field.status !== 'not_found' && field.value != null,
      )

    const distinctValues = new Set(withValue.map(field => normalisedForComparison(field.value as string)))

    if (distinctValues.size > 1) {
      merged[category] = { value: null, source_document: null, page: null, confidence: null, status: 'contradiction' }
      continue
    }

    const fallback = present.find(extraction => extraction[category])
    const field = withValue[0] ?? fallback?.[category]
    if (field) merged[category] = field
  }
  return Object.keys(merged).length > 0 ? (merged as RfpDocumentExtraction) : null
}

const WEIGHTS: RfpRequirementWeight[] = ['mandatory', 'desirable', 'informative', 'ambiguous']
const KINDS: RfpRequirementKind[] = [
  'technical',
  'security',
  'delivery',
  'financial',
  'contractual',
  'csr',
  'team',
  'other',
]
const OWNERS: RfpOwnerRole[] = ['sales', 'expert', 'hr', 'legal', 'security', 'finance']

/** Poids reconnu, ou `ambiguous` — la position prudente, qui garde l'exigence
 *  dans les manques et la transforme en question au client. */
function normaliseWeight(value: unknown): RfpRequirementWeight {
  return WEIGHTS.find(weight => weight === value) ?? 'ambiguous'
}

function normaliseKind(value: unknown): RfpRequirementKind {
  return KINDS.find(kind => kind === value) ?? 'other'
}

function normaliseOwner(value: unknown): RfpOwnerRole | undefined {
  return OWNERS.find(owner => owner === value)
}

/** Le format du PREMIER document, pour la traçabilité de l'extraction. */
function sourceFormatOf(input: RfpDocumentInput): RfpSourceFormat {
  if (!input.fileBase64) return 'pasted'
  const name = (input.fileName ?? '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.xlsx')) return 'xlsx'
  return 'text'
}

/** #2957 (#2180.54) — la PORTE d'un fichier source, jamais son chemin de
 *  stockage : voir `needDocumentDownloadPath` (`projects.controller.ts`),
 *  même discipline. */
function rfpSourceDocumentDownloadPath(rfpId: string, objectId: string): string {
  return `/rfp/${rfpId}/documents/${objectId}/download`
}

/** Date ISO valide, ou `null`. Une date illisible ne devient jamais aujourd'hui. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Retire les clés absentes d'un patch : `undefined` ne doit pas écraser une
 *  valeur existante par accident. */
function stripUndefined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>
}

/** #2957 (#2180.39) — une référence lisible, bornée à la colonne ; tout le
 *  reste (vide, non-chaîne) est `null`, jamais une valeur inventée. */
function normaliseReference(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, 200) : null
}

/** Ce que l'analyse IA rend, tel qu'on le consomme ici. */
type RfpAnalysisResult = {
  title?: string
  issuer?: string | null
  dueAt?: string | null
  reference?: string | null
  lots?: string[]
  requirements?: unknown
  // Non typé plus finement : lu par `normaliseDecision`, qui prend `unknown`
  // et ne fait jamais confiance à la forme annoncée par l'appelant.
  decision?: unknown
  sourceText?: string | null
  // #2957 — lu par `normaliseDocumentExtraction`, même discipline que `decision`.
  documentExtraction?: unknown
}
