import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  dispatchFailureOutcome,
  invoiceConnectorWriteIsReplayable,
  invoiceDocumentStatusFromConnector,
  type InvoiceReadiness,
} from '@bellum/contracts'
import { InvoiceConnectorWriteRequestEntity } from '../../database/entities/invoice-connector-write-request.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { buildInvoiceConnectorPreview } from './invoice-connector-write-preview'
import {
  INVOICE_CONNECTOR_PORT,
  type InvoiceConnectorPayload,
  type InvoiceConnectorPort,
} from './invoice-connector.port'

/** #2565.10 — le mois TEL QUE L'ÉCRAN LE LIT (`InvoiceReadinessService.list`),
 *  résolu par le contrôleur. Seuls les champs que la porte lit.
 *
 *  #2418.3 — `poNumber`/`ownerName` en plus : déjà calculés par
 *  `InvoiceReadinessService.list`, jamais lus jusqu'ici par cette porte. */
type AssessedMonth = Pick<
  InvoiceReadiness,
  'state' | 'blockers' | 'days' | 'preparedAmountCents' | 'missionLabel' | 'accountName' | 'poNumber' | 'ownerName'
> & { dailyRateCents?: number | null }

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Erreur inconnue.'
}

/**
 * #2565 — LA PORTE : créer une facture PRÉPARÉE dans l'outil de gestion
 * branché par le client, après validation explicite, et rendre compte
 * honnêtement de ce qui s'est réellement passé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE COMPTE, ET C'EST LUI QUI PORTE LA DOCTRINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. La feuille de temps se vérifie AVANT la création — pas après (retour
 *    François Thomas, 17/09/2026) : `month.state !== 'ready'` refuse tout,
 *    RIEN n'est créé. #2565.10 — `month` est le calcul de l'ÉCRAN, passé par
 *    le contrôleur ; la colonne `invoice_readiness.state` qu'on lisait avant
 *    n'est jamais écrite à `'ready'` (seulement `'invoiced'`/`'blocked'`), et
 *    la porte refusait donc TOUT mois prêt.
 * 2. Un outil non connecté refuse aussi AVANT création.
 * 3. La dernière tentative pour ce (mission, mois) décide : `unknown` bloque
 *    tout net (un humain doit vérifier dans l'outil connecté) ; `created`/`sent`
 *    signale une tentative déjà en cours ; `invoiced` est terminal ; seul
 *    `failed` — rien n'est jamais parti — autorise une tentative NEUVE.
 * 4. Le clic EST la décision (geste utilisateur) : la demande est créée puis
 *    immédiatement envoyée, sans file d'attente séparée — contrairement à la
 *    porte ERP (`AtsWriteService`), qui exige un second responsable, une
 *    facture préparée a déjà été relue par celui qui clique « Valider ».
 * 5. `state: 'invoiced'` ne s'écrit QUE dans la branche `outcome.ok === true` —
 *    la seule ligne de ce fichier qui l'écrit. Toute autre issue — `failed`,
 *    `unknown`, ou une exception classée par `dispatchFailureOutcome` — laisse
 *    le mois exactement où `invoice-readiness` l'a laissé.
 */
@Injectable()
export class InvoiceConnectorWriteService {
  private readonly logger = new Logger(InvoiceConnectorWriteService.name)

  constructor(
    @InjectRepository(InvoiceConnectorWriteRequestEntity)
    private readonly requests: Repository<InvoiceConnectorWriteRequestEntity>,
    // #2418.3 — la devise et les conditions de règlement : schéma PARTAGÉ
    // (GA-07, même raison que `CrmConnectionEntity` juste au-dessus dans le
    // module), jamais le SERVICE `StaffingService` d'un autre module.
    @InjectRepository(MissionCommercialTermsEntity)
    private readonly commercialTerms: Repository<MissionCommercialTermsEntity>,
    @Inject(INVOICE_CONNECTOR_PORT)
    private readonly connector: InvoiceConnectorPort,
  ) {}

  /** La dernière tentative connue pour ce mois — c'est elle, et elle seule,
   *  qui décide si une nouvelle demande peut partir. Publique : c'est aussi ce
   *  que l'écran lit pour afficher l'état courant. */
  async latest(
    workspaceId: string,
    missionId: string,
    periodMonth: string,
  ): Promise<InvoiceConnectorWriteRequestEntity | null> {
    const rows = await this.requests.find({
      where: { workspace_id: workspaceId, mission_id: missionId, period_month: periodMonth },
    })
    if (rows.length === 0) return null
    return [...rows].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null
  }

  async send(input: {
    workspaceId: string
    userId: string
    missionId: string
    periodMonth: string
    /** `null` = aucun outil de gestion connecté — résolu par l'appelant
     *  (le contrôleur, où l'orchestration inter-domaines vit légitimement,
     *  GA-07) via `connectedClientTools`. */
    provider: string | null
    /** #2565.10 — le mois tel que l'écran le lit ; `null` = la mission
     *  n'apparaît pas sur ce mois. Jamais relu ici depuis une colonne. */
    month: AssessedMonth | null
  }): Promise<InvoiceConnectorWriteRequestEntity> {
    if (!input.provider) {
      throw new ConflictException(
        'Aucun outil de gestion connecté : rien ne peut partir. Connecte-le dans Réglages › Intégrations.',
      )
    }

    // #2565.2 — AVANT, pas après : la feuille de temps (et tout autre
    // bloqueur) se vérifie avant même de créer la demande.
    const readiness = input.month
    if (!readiness || readiness.state !== 'ready') {
      const blockers = readiness?.blockers ?? []
      throw new ConflictException(
        blockers.length > 0
          ? `Ce mois n'est pas prêt à facturer : ${blockers.join(', ')}.`
          : "Ce mois n'est pas prêt à facturer.",
      )
    }

    const previous = await this.latest(input.workspaceId, input.missionId, input.periodMonth)
    if (previous) {
      if (previous.state === 'unknown') {
        throw new ConflictException(
          'Une tentative précédente est SANS RÉPONSE du connecteur — elle ne se rejoue pas automatiquement. ' +
            'Vérifie directement dans ton outil de gestion, puis répare à la main.',
        )
      }
      if (previous.state === 'created' || previous.state === 'sent') {
        throw new ConflictException('Une écriture est déjà en cours pour ce mois.')
      }
      if (previous.state === 'invoiced') {
        // #2565.10 — l'outil a RÉPONDU avec une référence : c'est un BROUILLON
        // déposé chez lui (Bellum n'émet aucune facture), pas une facture émise.
        throw new ConflictException(
          `Un brouillon de facture est déjà déposé pour ce mois dans ton outil — référence ${previous.invoice_reference}.`,
        )
      }
      if (!invoiceConnectorWriteIsReplayable(previous.state)) {
        // Filet : toute future valeur d'état non couverte explicitement
        // ci-dessus reste bloquée par défaut plutôt que rejouée par erreur.
        throw new ConflictException('Cette écriture ne peut pas repartir depuis ici.')
      }
    }

    // #2565.10 — ce que l'écran a PRÉVISUALISÉ, et rien d'autre : le compte (le
    // client à retrouver chez l'outil), les jours et le TJM (la ligne), le
    // montant préparé (HT). Un champ absent voyage `null` — l'adaptateur le
    // refuse nommément, il ne le remplace jamais par un défaut.
    const payload: InvoiceConnectorPayload = {
      missionId: input.missionId,
      periodMonth: input.periodMonth,
      preparedAmountCents: readiness.preparedAmountCents,
      missionLabel: readiness.missionLabel,
      accountName: readiness.accountName,
      days: readiness.days,
      dailyRateCents: readiness.dailyRateCents ?? null,
    }

    // #2418.3 — la devise et les conditions de règlement : PAS sur
    // `InvoiceReadiness` (`invoice-readiness.service.ts` ne les lit pas),
    // lues ICI, directement sur le schéma partagé. `null` = table absente
    // pour cette mission (aucune condition commerciale saisie) — jamais une
    // devise ou un délai deviné.
    const terms = await this.commercialTerms.findOne({ where: { mission_id: input.missionId } })

    const created = await this.requests.save(
      this.requests.create({
        workspace_id: input.workspaceId,
        mission_id: input.missionId,
        period_month: input.periodMonth,
        requested_by: input.userId,
        provider: input.provider,
        payload,
        // #2565.10 — le mois de l'écran porte le libellé et le compte : la
        // prévisualisation FIGÉE les garde (ils restaient `null` quand on ne
        // lisait que `invoice_readiness`). `null` = « non renseigné ».
        // #2418.3 — élargie : la ligne (jours × TJM), le bon de commande, le
        // chargé d'affaires (tous trois déjà calculés par la porte de
        // readiness), la devise et les conditions de règlement (lues
        // ci-dessus). Additif : les quatre champs déjà là ne bougent pas.
        preview: buildInvoiceConnectorPreview({
          missionLabel: readiness.missionLabel,
          accountName: readiness.accountName,
          periodMonth: input.periodMonth,
          preparedAmountCents: readiness.preparedAmountCents,
          days: readiness.days,
          dailyRateCents: readiness.dailyRateCents ?? null,
          poNumber: readiness.poNumber ?? null,
          ownerName: readiness.ownerName ?? null,
          currency: terms?.currency ?? null,
          paymentTermsDays: terms?.payment_terms_days ?? null,
          paymentTermsBasis: terms?.payment_terms_basis ?? null,
        }),
        state: 'created',
      }),
    )

    // ENVOYÉE — l'appel va partir. Persisté AVANT l'appel : si le process
    // meurt entre les deux, la ligne reste `sent` et bloque une reprise
    // automatique, exactement comme `unknown` (voir `latest()` ci-dessus).
    await this.requests.update({ id: created.id }, { state: 'sent' })

    let outcome: Awaited<ReturnType<InvoiceConnectorPort['createInvoice']>>
    try {
      outcome = await this.connector.createInvoice({
        provider: input.provider,
        workspaceId: input.workspaceId,
        payload,
      })
    } catch (error) {
      const classified = dispatchFailureOutcome(error)
      this.logger.warn('Écriture facture — le connecteur a levé une exception', {
        requestId: created.id,
        classified,
      })
      outcome = { ok: false, outcome: classified, detail: errorMessage(error) }
    }

    if (outcome.ok) {
      // #2418.2 — l'état du DOCUMENT chez le client (« acceptée », « rejetée »,
      // « avoir émis ») n'entre que par cette porte, et seulement si le
      // connecteur en a rendu la preuve complète. `invoiceDocumentStatusFromConnector`
      // rend `null` dès qu'il manque la référence ou la date du constat : un
      // état sans sa preuve ne s'écrit pas, il n'existe pas (contrainte
      // `…_document_evidence_check`, garde GA-377). Aucune déduction depuis
      // `state`, depuis un encaissement ou depuis un délai.
      const document = invoiceDocumentStatusFromConnector(outcome.document ?? {})
      const documentColumns = {
        document_state: document?.state ?? null,
        document_state_reference: document?.reference ?? null,
        document_state_at: document ? new Date(document.observedAt) : null,
      }
      await this.requests.update(
        { id: created.id },
        { state: 'invoiced', invoice_reference: outcome.reference, detail: null, ...documentColumns },
      )
      return {
        ...created,
        state: 'invoiced',
        invoice_reference: outcome.reference,
        detail: null,
        ...documentColumns,
      }
    }

    if (outcome.outcome === 'unknown') {
      this.logger.warn('Écriture facture SANS RÉPONSE — cette demande ne sera pas rejouée automatiquement', {
        requestId: created.id,
      })
    }
    await this.requests.update({ id: created.id }, { state: outcome.outcome, detail: outcome.detail })
    return { ...created, state: outcome.outcome, detail: outcome.detail }
  }
}
