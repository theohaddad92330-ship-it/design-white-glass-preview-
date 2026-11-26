import { z } from 'zod'

/**
 * #2565 — CRÉER la facture VALIDÉE dans l'outil de gestion branché par le
 * client. Retour CLIENT de François Thomas, call bêta du 17/09/2026 : « créer
 * des factures depuis Bellum qui sont sur Odoo ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS MOTS DISTINCTS, ET C'EST LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `invoice-readiness.js` s'arrête à PRÉPARÉE (`state: 'ready'`) : un mois sans
 * bloqueur, un montant préparatoire. Ce fichier commence APRÈS. Une facture y
 * est CRÉÉE (`created` — la demande existe, rien n'est parti), puis ENVOYÉE
 * (`sent` — l'appel est parti, la réponse n'est pas encore là), et seulement
 * FACTURÉE (`invoiced`) quand le connecteur a RÉPONDU avec succès et une
 * référence. « préparée » ≠ « créée » ≠ « envoyée », et « facturé » ne s'écrit
 * QUE sur preuve du connecteur (doctrine, `CLAUDE.md` § Doctrine, décision du
 * 18/09/2026 — revirement partiel de #2197 : Bellum SUIT le financier, il ne
 * COMPTABILISE pas — aucune facture légale n'est émise PAR Bellum).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN TIMEOUT N'EST PAS UN ÉCHEC
 * ─────────────────────────────────────────────────────────────────────────────
 * `failed` — la connexion n'a jamais été établie, ou le distant a répondu par
 * un refus : REJOUABLE, une nouvelle demande peut repartir.
 * `unknown` — la requête est PARTIE et la réponse s'est perdue : une facture ne
 * se dépose pas deux fois sans qu'on le sache. ARRÊTE la reprise — aucun geste
 * automatique ne repart d'un `unknown`, seul un humain qui a vérifié dans
 * l'outil connecté peut trancher (voir `InvoiceConnectorWriteService.send`,
 * `apps/api/src/modules/delivery/invoice-connector-write.service.ts`).
 * Classification confiée à `dispatchFailureOutcome` (`dispatch-failure.js`) —
 * le SEUL calcul du dépôt qui sait distinguer les deux, déjà éprouvé sur le
 * routeur d'actions et l'ERP (`ats-write.service.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni `provider`, ni un nom d'éditeur : comme `crm-write-request.ts` avant lui,
 * la vue exposée à l'écran ne porte JAMAIS l'identifiant technique de l'outil.
 * Le nom affiché arrive par INJECTION (`connectedClientTools`, `tool-naming.js`),
 * jamais écrit en dur ici ni dans un libellé.
 */

/** Les trois états intermédiaires, dans l'ordre où ils s'écrivent, et les deux
 *  issues d'un envoi qui n'a pas confirmé. Liste FERMÉE. */
export const INVOICE_CONNECTOR_WRITE_STATES = ['created', 'sent', 'invoiced', 'failed', 'unknown'] as const
export const invoiceConnectorWriteStateSchema = z.enum(INVOICE_CONNECTOR_WRITE_STATES)
export type InvoiceConnectorWriteState = (typeof INVOICE_CONNECTOR_WRITE_STATES)[number]

/** États TERMINAUX qui autorisent une NOUVELLE tentative : `failed` seul.
 *  `unknown` et `invoiced` ne le sont pas — l'un attend un humain, l'autre est fait. */
export function invoiceConnectorWriteIsReplayable(state: InvoiceConnectorWriteState): boolean {
  return state === 'failed'
}

/**
 * #2418.2 — LES TROIS ÉTATS DU DOCUMENT, À CÔTÉ DES QUATRE D'ENCAISSEMENT.
 *
 * DÉCISION LOUIS 21/09/2026 : oui pour « acceptée », « rejetée », « avoir
 * émis » — comme états du DOCUMENT dans l'outil du client. Liste FERMÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS AXES QUI NE SE MÊLENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. {@link INVOICE_CONNECTOR_WRITE_STATES} — où en est NOTRE écriture.
 *  2. Celui-ci — où en est le DOCUMENT chez le client.
 *  3. Les quatre statuts d'ENCAISSEMENT (`paid` / `overdue` / `disputed` /
 *     `pending`, `collections.ts`) — dérivés, jamais stockés.
 *
 * Les confondre reviendrait à dire qu'une facture acceptée est payée, ou qu'un
 * avoir est un litige. Trois questions, trois réponses.
 *
 * ⚠️ LE CINQUIÈME STATUT D'ENCAISSEMENT RESTE REFUSÉ — pas de `partially_paid`
 * ici ni ailleurs (`c72_encaissement_reste_du_nomme`, ratifié #2419.4) : un
 * règlement partiel ne sort pas de sa file, c'est le MONTANT qui porte
 * l'information neuve. Ces trois états-ci ne sont pas une porte dérobée pour
 * l'y faire entrer — ils répondent à une AUTRE question.
 *
 * ⚠️ « avoir émis » (`credited`) est un état du document CHEZ LE CLIENT, pas une
 * écriture comptable : Bellum SUIT le financier, il ne COMPTABILISE pas
 * (#2564). Aucun avoir n'est émis PAR Bellum.
 */
export const INVOICE_DOCUMENT_STATES = ['accepted', 'rejected', 'credited'] as const
export const invoiceDocumentStateSchema = z.enum(INVOICE_DOCUMENT_STATES)
export type InvoiceDocumentState = (typeof INVOICE_DOCUMENT_STATES)[number]

/**
 * L'état du document AVEC SA PREUVE — les deux ne se séparent jamais.
 *
 * #2418.2 — « ils ne s'écrivent que sur preuve du connecteur, jamais par
 * déduction ». Ce n'est pas un commentaire : `reference` n'est pas nullable, et
 * il n'existe pas de chemin qui construise cet objet sans elle
 * ({@link invoiceDocumentStatusFromConnector} est le seul).
 *
 * Même discipline que `c80_facture_se_nomme_sa_source` : « facturé » se garde,
 * sa SOURCE se nomme. Ici la source est le connecteur, et rien d'autre ne peut
 * l'être — pas de saisie humaine sur cet axe, pas de déduction à partir d'un
 * encaissement, pas de date posée par nous.
 */
export const invoiceDocumentStatusSchema = z.object({
  state: invoiceDocumentStateSchema,
  /** La référence du document chez l'outil — LA preuve. Jamais vide. */
  reference: z.string().trim().min(1),
  /** Quand l'OUTIL l'a dit, pas quand nous l'avons lu (ISO). */
  observedAt: z.string().datetime(),
})
export type InvoiceDocumentStatus = z.infer<typeof invoiceDocumentStatusSchema>

/**
 * #2418.2 — la SEULE porte par laquelle un état de document entre dans Bellum.
 *
 * Rend `null` dès qu'il manque quoi que ce soit : un état hors des trois, une
 * référence absente ou vide, une date absente ou illisible. `null` veut dire
 * « on ne sait pas », et « on ne sait pas » n'est pas « rejetée ».
 *
 * ⚠️ Elle ne DEVINE rien et ne complète rien — en particulier, elle ne pose
 * jamais l'heure courante à la place d'une date manquante : une date de constat
 * qu'on invente est une déduction déguisée, exactement ce que la décision
 * refuse. Et elle ne connaît aucun statut d'ENCAISSEMENT : `paid`,
 * `partially_paid`, `overdue` n'entrent pas ici, ce sont d'autres questions.
 */
export function invoiceDocumentStatusFromConnector(evidence: {
  state?: string | null
  reference?: string | null
  observedAt?: string | null
}): InvoiceDocumentStatus | null {
  const parsed = invoiceDocumentStatusSchema.safeParse({
    state: evidence.state,
    reference: evidence.reference,
    observedAt: evidence.observedAt,
  })
  return parsed.success ? parsed.data : null
}

export const MISSING_INVOICE_FIELD = 'non renseigné'

/** Une ligne de la prévisualisation FIGÉE — même grammaire que
 *  `outbound-write-preview.js` et `ats-write-preview.js` : un champ, une valeur. */
export const invoiceConnectorWritePreviewLineSchema = z.object({
  field: z.string(),
  value: z.string(),
})
export type InvoiceConnectorWritePreviewLine = z.infer<typeof invoiceConnectorWritePreviewLineSchema>

/**
 * La vue qu'un écran peut lire — jamais l'entité brute (elle porte
 * `provider` et la réponse complète du connecteur).
 */
export const invoiceConnectorWriteRequestViewSchema = z.object({
  id: z.string(),
  missionId: z.string().guid(),
  /** `YYYY-MM-01`, comme `invoice-readiness.periodMonth`. */
  periodMonth: z.string(),
  state: invoiceConnectorWriteStateSchema,
  /** FIGÉE au moment de la demande — jamais un recalcul. */
  preview: z.array(invoiceConnectorWritePreviewLineSchema),
  /** La référence rendue par le connecteur — QUE si `state === 'invoiced'`.
   *  `null` sinon, jamais une valeur devinée en attendant. */
  invoiceReference: z.string().nullable(),
  /** Pourquoi un `failed` ou un `unknown` — jamais la réponse brute d'un
   *  fournisseur, un texte que CE service écrit lui-même. */
  detail: z.string().nullable(),
  /**
   * #2418.2 — où en est le DOCUMENT chez le client, avec sa preuve. Un TROISIÈME
   * axe, à côté de {@link state} (où en est notre écriture) et des quatre
   * statuts d'encaissement (dérivés à l'écran, jamais stockés) — jamais mêlé à
   * l'un ni à l'autre. `null` = on ne sait pas, jamais « rejetée ».
   */
  documentStatus: invoiceDocumentStatusSchema.nullable(),
  createdAt: z.string(),
})
export type InvoiceConnectorWriteRequestView = z.infer<typeof invoiceConnectorWriteRequestViewSchema>

/** Corps de la seule route d'écriture : valider une facture PRÉPARÉE. Le clic
 *  EST la décision (geste utilisateur = auto-approuvé) — pas de second geste. */
export const sendInvoiceConnectorWriteSchema = z.object({
  missionId: z.string().guid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}-01$/, 'Format attendu : AAAA-MM-01'),
})
export type SendInvoiceConnectorWrite = z.infer<typeof sendInvoiceConnectorWriteSchema>
