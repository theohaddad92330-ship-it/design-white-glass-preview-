import { MISSING_INVOICE_FIELD, type InvoiceConnectorWritePreviewLine } from '@bellum/contracts'

/**
 * #2565 — la prévisualisation FIGÉE d'une écriture chez le connecteur. Pure,
 * comme `outbound-write-preview.ts` (CRM) et `ats-write-preview.ts` (ERP)
 * avant elle : le calcul qui décide ce qui se lit ne doit pas exiger une base.
 *
 * #2418.3 — élargie aux champs ADDITIFS utiles à PRÉPARER la facture : la
 * ligne (jours × TJM, déjà dans le `payload` envoyé au connecteur mais
 * jamais montrée ici), le bon de commande et le chargé d'affaires (déjà
 * calculés par `InvoiceReadinessService`, jamais passés jusqu'ici), la
 * devise et les conditions de règlement (`mission_commercial_terms`, lues
 * par l'appelant — ce fichier reste pur). Rien n'est renommé : les quatre
 * champs déjà là (Mission/Compte/Mois couvert/Montant préparatoire) gardent
 * exactement leur libellé et leur position.
 *
 * Volontairement HORS de ce fichier : `taxes` (aucun taux de TVA n'existe
 * pour une facture CLIENT dans ce dépôt — seul `expense-report.ts` en suit
 * un, pour une note de frais FOURNISSEUR, un autre domaine) et `échéance`
 * (l'échéance RÉELLE d'une facture, `invoice-readiness.ts` `dueOn`, ne se
 * connaît qu'après émission — la CONDITION qui la produira est ce que
 * « Conditions de règlement » montre ici). Un champ sans source ne s'invente
 * pas (doctrine, jamais de donnée fictive).
 */

function render(value: string | null | undefined): string {
  return value === null || value === undefined || value === '' ? MISSING_INVOICE_FIELD : value
}

function renderCents(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return MISSING_INVOICE_FIELD
  const cents = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(cents)) return MISSING_INVOICE_FIELD
  return `${(cents / 100).toFixed(2)} €`
}

/** La LIGNE — jours × TJM, comme l'écran la prévisualise déjà
 *  (`readiness.connector.lineValue`, `MissionDetailTabs.tsx`). Les deux
 *  termes ou aucun : un jour connu sans TJM (ou l'inverse) ne devient jamais
 *  un calcul à moitié deviné. */
function renderLine(days: number | null | undefined, dailyRateCents: number | string | null | undefined): string {
  if (days === null || days === undefined) return MISSING_INVOICE_FIELD
  const rate = renderCents(dailyRateCents)
  if (rate === MISSING_INVOICE_FIELD) return MISSING_INVOICE_FIELD
  return `${days} j × ${rate}`
}

/** Même vocabulaire que `accountMissions.json` (`basis.invoice_date` /
 *  `basis.end_of_month`) — ce fichier reste hors i18n comme ses voisins
 *  (`ats-write-preview.ts`) : un texte FIGÉ, pas un libellé d'écran. */
function paymentTermsBasisLabel(basis: string | null | undefined): string | null {
  if (basis === 'invoice_date') return 'date de facture'
  if (basis === 'end_of_month') return 'fin de mois'
  return null
}

function renderPaymentTerms(days: number | null | undefined, basis: string | null | undefined): string {
  if (days === null || days === undefined) return MISSING_INVOICE_FIELD
  const basisLabel = paymentTermsBasisLabel(basis)
  return basisLabel ? `${days} jours (${basisLabel})` : `${days} jours`
}

export function buildInvoiceConnectorPreview(input: {
  missionLabel: string | null
  accountName: string | null
  periodMonth: string
  preparedAmountCents: number | string | null
  /** #2418.3 — la ligne : jours puis TJM, déjà dans le `payload`, jamais
   *  montrée avant ce lot. */
  days?: number | null
  dailyRateCents?: number | string | null
  /** #2418.3 — déjà calculé par `InvoiceReadinessService` (`poNumber`),
   *  jamais passé jusqu'ici. */
  poNumber?: string | null
  /** #2418.3 — le CHARGÉ D'AFFAIRES (`InvoiceReadiness.ownerName`). */
  ownerName?: string | null
  /** #2418.3 — `mission_commercial_terms.currency` (#2420), ISO 4217. */
  currency?: string | null
  /** #2418.3 — `mission_commercial_terms.payment_terms_days`/`_basis`. */
  paymentTermsDays?: number | null
  paymentTermsBasis?: string | null
}): InvoiceConnectorWritePreviewLine[] {
  return [
    { field: 'Mission', value: render(input.missionLabel) },
    { field: 'Compte', value: render(input.accountName) },
    { field: 'Mois couvert', value: input.periodMonth },
    { field: 'Ligne', value: renderLine(input.days, input.dailyRateCents) },
    { field: 'Montant préparatoire', value: renderCents(input.preparedAmountCents) },
    { field: 'Bon de commande', value: render(input.poNumber) },
    { field: 'Devise', value: render(input.currency) },
    { field: 'Conditions de règlement', value: renderPaymentTerms(input.paymentTermsDays, input.paymentTermsBasis) },
    { field: 'Chargé d’affaires', value: render(input.ownerName) },
  ]
}
