import type { AdminDocsProvider, PendingSignature, UnpaidInvoice } from '@bellum/contracts'

/**
 * Normaliser ce que rendent quatre outils administratifs.
 *
 * Deux ont un contrat public et vérifiable (Yousign v3, Qonto v2). Les deux
 * autres — DocuSign et Tiime — demandent un compte et une application déclarée
 * avant de montrer leur documentation. Plutôt que de refuser la moitié de la
 * fonctionnalité, on applique la règle retenue pour Kaspr et FullEnrich : on ne
 * devine pas les noms de champs, on lit par la FORME et on accepte de ne rien
 * trouver.
 *
 * Un point mérite d'être écrit, parce qu'il est spécifique à l'argent : **les
 * montants sont lus en CENTIMES**. Un montant en flottant qui traverse deux
 * conversions affiche un jour 1 999,99 € là où la facture dit 2 000 €, et
 * personne ne sait plus qui a tort. Quand un fournisseur rend des euros, on
 * convertit une seule fois, ici.
 *
 * Et une règle qui vaut pour toutes les dates : **un retard inconnu vaut `null`,
 * jamais zéro**. « 0 jour de retard » se lit « elle vient d'échoir » ; la vérité
 * peut être « on ne sait pas quand elle échoit ».
 */

const DAY_MS = 86_400_000

const str = (value: unknown): string | null => {
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function isoOf(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber) && raw.trim() !== '') {
    const ms = asNumber < 1e11 ? asNumber * 1000 : asNumber
    return new Date(ms).toISOString()
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

/** Jours écoulés depuis `iso`. `null` quand la date est illisible. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((now.getTime() - parsed) / DAY_MS))
}

/** Jours de RETARD : négatif si l'échéance est à venir. `null` si inconnue. */
export function daysOverdue(dueIso: string | null, now: Date): number | null {
  if (!dueIso) return null
  const parsed = Date.parse(dueIso)
  if (Number.isNaN(parsed)) return null
  return Math.floor((now.getTime() - parsed) / DAY_MS)
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

/** Le premier champ non vide parmi plusieurs noms possibles. */
function firstOf(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = str(row[key])
    if (value) return value
  }
  return null
}

/**
 * Un montant en centimes.
 *
 * Les fournisseurs alternent entre centimes entiers et euros décimaux. On
 * privilégie le champ explicitement nommé en centimes ; à défaut on convertit,
 * une seule fois, en arrondissant AU CENTIME — pas en tronquant : une facture de
 * 1 999,995 € ne doit pas s'afficher un centime en dessous de ce qui sera payé.
 */
export function amountInCents(row: Record<string, unknown>): number | null {
  const cents = row['amount_cents'] ?? row['amountCents'] ?? row['total_amount_cents']
  if (cents != null && cents !== '') {
    const parsed = Number(cents)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  const units = row['amount'] ?? row['total_amount'] ?? row['total']
  const parsedUnits = Number(typeof units === 'object' ? asRecord(units)['value'] : units)
  if (Number.isFinite(parsedUnits)) return Math.round(parsedUnits * 100)
  return null
}

/** Une demande de signature en attente, quelle que soit sa forme d'origine. */
export function normalizeSignature(provider: AdminDocsProvider, raw: unknown, now: Date): PendingSignature | null {
  const row = asRecord(raw)
  const id = firstOf(row, ['id', 'envelopeId', 'signature_request_id', 'uuid'])
  if (!id) return null

  const sentAt = isoOf(row['created_at'] ?? row['createdDateTime'] ?? row['sentDateTime'] ?? row['sent_at'])
  // Le signataire vit tantôt à plat, tantôt dans une liste. On prend le premier
  // nommé — et `null` plutôt qu'un « destinataire » générique qui n'aide personne.
  const signers = Array.isArray(row['signers']) ? (row['signers'] as unknown[]) : []
  const firstSigner = signers.length > 0 ? asRecord(signers[0]) : {}
  const signerInfo = asRecord(firstSigner['info'] ?? firstSigner)
  const signer =
    firstOf(row, ['signer', 'recipient']) ??
    [str(signerInfo['first_name']), str(signerInfo['last_name'])].filter(Boolean).join(' ') ??
    null

  return {
    id,
    provider,
    title: firstOf(row, ['name', 'title', 'emailSubject', 'subject']),
    signer: signer || str(signerInfo['email']),
    sentAt,
    daysWaiting: daysSince(sentAt, now),
  }
}

/** Une facture non réglée. */
export function normalizeInvoice(provider: AdminDocsProvider, raw: unknown, now: Date): UnpaidInvoice | null {
  const row = asRecord(raw)
  const id = firstOf(row, ['id', 'invoice_id', 'uuid', 'number'])
  if (!id) return null

  const dueAt = isoOf(row['due_date'] ?? row['dueDate'] ?? row['payment_due_date'])
  const client = asRecord(row['client'] ?? row['customer'])
  const currencyValue = row['currency'] ?? asRecord(row['total_amount'])['currency']

  return {
    id,
    provider,
    reference: firstOf(row, ['number', 'invoice_number', 'reference']),
    client: firstOf(row, ['client_name', 'customer_name']) ?? firstOf(client, ['name', 'company_name']),
    amountCents: amountInCents(row),
    currency: str(currencyValue),
    dueAt,
    daysOverdue: daysOverdue(dueAt, now),
  }
}

/**
 * Trouve la liste d'enregistrements dans une réponse de forme inconnue.
 *
 * Les quatre fournisseurs l'appellent différemment — `data`, `items`,
 * `invoices`, `envelopes`, ou la racine elle-même. Chercher la première liste
 * d'objets évite d'écrire quatre parseurs qui divergeraient.
 */
export function harvestList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const root = asRecord(payload)
  for (const value of Object.values(root)) {
    if (Array.isArray(value) && value.some(item => item && typeof item === 'object')) return value
  }
  return []
}
