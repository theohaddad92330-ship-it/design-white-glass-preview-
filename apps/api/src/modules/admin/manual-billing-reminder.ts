import { toneForReminder, isDisputeOpen, type ReminderTone } from '@bellum/contracts'
import { PAYMENT_TERM_DAYS, addDays, daysBetween } from './manual-billing-schedule'

/**
 * PRÉPARER une relance sur une facture en retard d'un client sur facture (#1655).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER NE SAIT PAS ENVOYER, ET CE N'EST PAS UNE CONVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le copilote n'envoie jamais d'e-mail : il prépare, le commercial envoie. Ses
 * outils de proposition n'ont AUCUN chemin d'écriture — ce n'est pas une
 * convention, c'est l'absence de code. » (doctrine, CLAUDE.md). La même règle
 * vaut ici, et de la même façon : ce module rend une CHAÎNE DE CARACTÈRES. Il
 * n'importe aucun transport, n'ouvre aucune socket, ne connaît le nom d'aucun
 * fournisseur de messagerie. Une garde le mesure sur le TEXTE du lot entier
 * (`manual-billing-reminder-no-send.spec.ts`) plutôt que sur ce commentaire :
 * une règle qui n'est pas gardée redevient une opinion en trois semaines.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉUTILISE PLUTÔT QUE DE LE RÉINVENTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le produit client répond DÉJÀ à « une relance d'encaissement est-elle due, et
 * sur quel ton ? » (`invoice-readiness.reminderDue`, `reminder-channel`). Trois
 * pièces sont donc importées, jamais recopiées :
 *
 *  - `toneForReminder` / `ReminderTone` — les TROIS tons (`neutral` / `firm` /
 *    `escalate`) et leur rang. Un réglage vit à un seul endroit (GA-26) : un
 *    second vocabulaire de tons dans le back-office aurait divergé du produit à
 *    la première évolution.
 *  - `isDisputeOpen` — LA dérivation « un litige court-il ? ». Trois
 *    `Boolean(disputedAt) && !disputeResolvedAt` recopiés à la main divergent le
 *    jour où l'un des trois oublie la seconde moitié.
 *  - `PAYMENT_TERM_DAYS` — les trente jours du module de facturation. Il est LU,
 *    jamais redéfini : c'est lui qui fait qu'une cellule du calendrier devient
 *    « en retard », et une relance qui compterait autrement dirait « pas encore
 *    dû » sur une case déjà rouge.
 *
 * ⚠️ CE QU'IL NE RÉUTILISE PAS, ET POURQUOI. `PAYMENT_REMINDER_SCHEDULE_DAYS`
 * (7 / 15 / 30) est la cadence du produit CLIENT : elle compte à partir d'une
 * échéance de règlement SAISIE par un humain sur la facture. Ici il n'y a pas de
 * colonne d'échéance : elle se DÉRIVE (`period_start + PAYMENT_TERM_DAYS`), donc
 * elle est déjà l'hypothèse la plus généreuse possible. Attendre sept jours de
 * plus avant le premier rappel courtois placerait celui-ci trente-sept jours
 * après le début de la période. #1655 demande J+3, et c'est le bon chiffre sur
 * ce pivot-là — exactement la raison pour laquelle le dépôt a déjà SÉPARÉ la
 * cadence de relevé de la cadence d'encaissement le 30/08 : « deux relances qui
 * n'ont ni le même pivot ni le même destinataire n'ont pas la même bonne
 * cadence ».
 *
 * Tout est pur : `today` est un paramètre, jamais `new Date()`.
 */

/**
 * Les trois échelons, en jours APRÈS l'échéance de règlement (#1655).
 *
 * Trois, et pas un de plus : au-delà, ce n'est plus une cadence, c'est du
 * harcèlement, et le sujet remonte à un humain. C'est la même borne que le
 * produit client, et elle se LIT ici (`.length`) plutôt que de se recopier.
 */
export const MANUAL_BILLING_REMINDER_SCHEDULE_DAYS = [3, 15, 30] as const

/** Le rang maximal atteignable. Lu dans la cadence, jamais écrit « 3 ». */
export const MANUAL_BILLING_MAX_REMINDERS = MANUAL_BILLING_REMINDER_SCHEDULE_DAYS.length

/**
 * Le NOM de l'événement émis quand une relance est consignée.
 *
 * ⚠️ Le contrat avec le journal d'actions unique (#1666). Ce lot ne construit
 * PAS un second journal : il persiste l'historique sur la facture elle-même
 * (`manual_billing_invoices.reminders`) et émet cet événement, sous
 * `tags['admin.op']`. #1666 s'y branche sans que ce fichier ait à connaître son
 * existence.
 */
export const BILLING_REMINDER_LOGGED_EVENT = 'billing.reminder.logged'

/** Une relance déjà consignée : quand, par qui, sur quel ton. */
export interface LoggedReminder {
  /** Horodatage ISO 8601 de la consignation. */
  at: string
  /** L'opérateur qui a envoyé la relance — l'adresse authentifiée (#1668). */
  by: string
  tone: ReminderTone
  /** Le rang au moment de l'envoi (1, 2 ou 3). */
  index: number
}

/** La facture, telle que la préparation la lit. */
export interface InvoiceForReminder {
  id: string
  /** La référence émise dans l'outil comptable. `null` = jamais saisie. */
  reference: string | null
  /** Le montant RÉELLEMENT facturé. `null` = inconnu — jamais `0`. */
  amountCents: number | null
  currency: string | null
  periodStart: string
  periodEnd: string
  paid: boolean
  /** Quand le litige a été DÉCLARÉ. `null` = aucun litige déclaré. */
  disputedAt: string | null
  /** Quand il a été LEVÉ. `null` pendant qu'il court. */
  disputeResolvedAt: string | null
  /** Les relances déjà consignées, de la plus ancienne à la plus récente. */
  reminders: readonly LoggedReminder[]
}

/** Le client, tel que la préparation le nomme. */
export interface ClientForReminder {
  workspaceName: string
  /** À qui la facture est faite, quand ce n'est pas simplement l'ESN. */
  billedToName: string | null
  /** L'adresse de facturation. `null` = jamais saisie — la relance se refuse. */
  billingEmail: string | null
}

/**
 * Pourquoi aucune relance n'est proposée. Chacun se DIT à l'écran : un panneau
 * vide se lit « il n'y a rien à faire », alors que la cadence a été suspendue,
 * ou qu'il manque une donnée que l'opérateur peut saisir en dix secondes.
 */
type ReminderRefusalReason =
  /** Aucune facture n'est enregistrée pour cette période — on ne réclame pas le
   *  paiement d'un document qui n'existe pas. */
  | 'no_invoice'
  /** Elle est encaissée. On ne relance pas un client qui a payé. */
  | 'already_paid'
  /** ⚠️ LE refus de #1655 : un litige COURT. */
  | 'dispute_open'
  /** Trois relances ont été consignées. Le silence après trois est un sujet de
   *  management, pas de cadence. */
  | 'cadence_exhausted'
  /** L'échéance n'est pas encore dépassée du nombre de jours du rang suivant. */
  | 'not_overdue_yet'
  /** Il manque une donnée dont la relance ne peut pas se passer. */
  | 'incomplete'

export interface ReminderRefusal {
  prepared: false
  reason: ReminderRefusalReason
  /**
   * La facture concernée quand il y en a une — `null` pour `no_invoice`.
   *
   * ⚠️ Elle voyage AVEC le refus, et pas seulement avec la préparation : le
   * geste inverse du litige (« lever le litige ») porte sur cette facture-là, et
   * l'écran n'a aucun autre moyen de la désigner. Sans elle, il faudrait
   * redemander la même période à l'API pour retrouver un identifiant qu'elle
   * venait de lire — un aller-retour pour une donnée déjà en main.
   */
  invoiceId: string | null
  /**
   * Ce qui manque, nommé, quand `reason === 'incomplete'`. Vide sinon — jamais
   * une phrase de remplissage.
   */
  missing: string[]
  /** L'échéance dérivée, quand une facture existe. Sert à dire « due le … ». */
  dueOn: string | null
  /** Le motif du litige, quand c'est lui qui refuse. Ce que le client REPROCHE. */
  disputeReason: string | null
}

export interface PreparedReminder {
  prepared: true
  invoiceId: string
  /** Le rang de CETTE relance : 1, 2 ou 3. */
  index: number
  /** Le ton retenu. */
  tone: ReminderTone
  /** Le ton que la cadence proposait. Égal à `tone` quand rien n'a été forcé. */
  toneSuggested: ReminderTone
  /** L'opérateur a-t-il choisi un autre ton que celui de la cadence ? */
  toneOverridden: boolean
  /** L'échéance de règlement DÉRIVÉE (`period_start` + `PAYMENT_TERM_DAYS`). */
  dueOn: string
  /** Jours écoulés depuis l'échéance. Toujours ≥ le seuil du rang. */
  overdueDays: number
  /** Le jour où CETTE relance est devenue due. */
  dueSince: string
  /** À qui l'opérateur enverra le message. Jamais deviné. */
  recipientEmail: string
  subject: string
  body: string
  /**
   * La mention légale du troisième rang, ou `null`. Elle n'est jamais
   * paraphrasée : voir {@link MENTION_LEGALE}.
   */
  legalNotice: string | null
  /** Les relances déjà consignées, pour que l'écran montre l'historique. */
  history: readonly LoggedReminder[]
}

/**
 * ⚠️ LA MENTION LÉGALE N'EST PAS INVENTÉE — ELLE EST CITÉE.
 *
 * Le taux et l'indemnité forfaitaire ont une valeur légale précise, et un
 * montant faux dans une relance client est un risque réel. Ce texte est celui
 * que BellumAI publie DÉJÀ dans ses propres conditions générales de vente,
 * `apps/website/src/app/[locale]/cgv/page.tsx` (§ « Prix et paiement ») —
 * repris à l'identique, jamais reformulé, pour que la relance ne puisse pas
 * promettre autre chose que le contrat qu'elle applique.
 *
 * ⚠️ AUCUN MONTANT DE PÉNALITÉ N'EST CALCULÉ. Le taux est « trois fois le taux
 * d'intérêt légal », et ce taux légal change deux fois par an ; il n'est écrit
 * nulle part dans ce dépôt. Le multiplier par un montant produirait un chiffre
 * inventé avec l'autorité d'une facture. La relance ÉNONCE la règle, elle ne
 * chiffre pas la somme.
 */
const MENTION_LEGALE =
  'Toute somme non payée à sa date d’exigibilité produit de plein droit des intérêts de retard ' +
  'au taux prévu par l’article L. 441-10 du Code de commerce, soit trois fois le taux d’intérêt ' +
  'légal, sans qu’une mise en demeure soit nécessaire. Une indemnité forfaitaire de quarante ' +
  'euros pour frais de recouvrement est également exigible de plein droit, conformément à ' +
  'l’article D. 441-5 du même Code.'

/** `YYYY-MM-DD` → `JJ/MM/AAAA`. Sans horloge : la chaîne se réécrit, elle ne se parse pas. */
function jour(day: string): string {
  const [y, m, d] = day.split('-')
  return y && m && d ? `${d}/${m}/${y}` : day
}

/**
 * Un montant en centimes → « 1 190,00 € ».
 *
 * `Intl` avec une locale FIXE (`fr-FR`) : ce texte part chez un client français,
 * il ne suit pas la langue de l'opérateur.
 */
function argent(cents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100)
}

/**
 * L'échéance de règlement d'une facture.
 *
 * ⚠️ DÉRIVÉE, et c'est ce qui la rend juste : `manual_billing_invoices` ne porte
 * aucune colonne d'échéance, et en inventer une serait un fait faux écrit avec
 * l'autorité d'une base. Les trente jours sont ceux du module de facturation
 * (`PAYMENT_TERM_DAYS`), lus et non redéfinis — c'est le même seuil qui fait
 * passer la cellule du calendrier en « en retard ».
 */
function dueOnOf(invoice: Pick<InvoiceForReminder, 'periodStart'>): string {
  return addDays(invoice.periodStart, PAYMENT_TERM_DAYS)
}

function refuse(
  reason: ReminderRefusalReason,
  extra: Partial<Pick<ReminderRefusal, 'invoiceId' | 'missing' | 'dueOn' | 'disputeReason'>> = {},
): ReminderRefusal {
  return {
    prepared: false,
    reason,
    invoiceId: extra.invoiceId ?? null,
    missing: extra.missing ?? [],
    dueOn: extra.dueOn ?? null,
    disputeReason: extra.disputeReason ?? null,
  }
}

/**
 * La relance à préparer sur une facture, ou le refus qui dit pourquoi il n'y en
 * a pas.
 *
 * `invoice` vaut `null` quand AUCUNE facture ne couvre la période : la cellule
 * est rouge parce que rien n'a été émis, et réclamer le paiement d'un document
 * qui n'existe pas est pire qu'un silence.
 *
 * `requestedTone` est le ton choisi par l'opérateur. Absent, c'est la cadence
 * qui décide ({@link toneForReminder}). Le résultat porte TOUJOURS les deux, pour
 * que l'écran puisse dire « ton forcé » plutôt que de laisser croire que la
 * cadence a changé d'avis.
 */
export function prepareReminder(input: {
  invoice: InvoiceForReminder | null
  client: ClientForReminder
  /** Le motif du litige, quand il y en a un. Affiché tel quel dans le refus. */
  disputeReason?: string | null
  today: string
  requestedTone?: ReminderTone | null
}): PreparedReminder | ReminderRefusal {
  const { invoice, client, today } = input

  // 1. Rien à relancer : aucune facture n'est enregistrée pour cette période.
  if (!invoice) return refuse('no_invoice')

  const dueOn = dueOnOf(invoice)

  // 2. Encaissée.
  if (invoice.paid) return refuse('already_paid', { invoiceId: invoice.id, dueOn })

  // 3. ⚠️ LE REFUS DE #1655. Un litige OUVERT arrête la cadence — et il passe
  //    avant tout le reste, y compris avant « pas encore dû » et avant les
  //    données manquantes : des refus vrais en même temps, un seul est
  //    actionnable, et remplir un champ pendant qu'un litige court ne
  //    redémarrerait rien. Le client sait très bien qu'il n'a pas payé : il
  //    refuse de payer, et lui redemander tous les sept jours est la façon la
  //    plus sûre de le durcir.
  if (isDisputeOpen(invoice)) {
    return refuse('dispute_open', { invoiceId: invoice.id, dueOn, disputeReason: input.disputeReason ?? null })
  }

  // 4. Trois relances consignées : le sujet remonte à un humain.
  const index = invoice.reminders.length + 1
  const suggested = toneForReminder(index)
  if (!suggested || index > MANUAL_BILLING_MAX_REMINDERS)
    return refuse('cadence_exhausted', { invoiceId: invoice.id, dueOn })

  // 5. Pas encore due. Le seuil se lit dans la cadence, au rang courant.
  const threshold = MANUAL_BILLING_REMINDER_SCHEDULE_DAYS[invoice.reminders.length]
  const overdueDays = daysBetween(dueOn, today)
  if (threshold === undefined || overdueDays < threshold)
    return refuse('not_overdue_yet', { invoiceId: invoice.id, dueOn })

  // 6. Ce qui manque se NOMME, et tout en une fois : la relance ne se prépare
  //    pas avec un blanc, et l'opérateur ne découvre pas les trous un par un.
  const missing: string[] = []
  if (!invoice.reference?.trim()) missing.push('la référence de la facture')
  if (invoice.amountCents === null || invoice.currency === null) missing.push('le montant facturé')
  if (!client.billingEmail?.trim()) missing.push('l’adresse de facturation du client')
  if (missing.length > 0) return refuse('incomplete', { invoiceId: invoice.id, missing, dueOn })

  // À partir d'ici, tout est mesuré : rien n'est deviné, rien n'est laissé vide.
  const reference = invoice.reference?.trim() as string
  const montant = argent(invoice.amountCents as number, invoice.currency as string)
  const tone = input.requestedTone ?? suggested
  const destinataire = client.billingEmail?.trim() as string

  return {
    prepared: true,
    invoiceId: invoice.id,
    index,
    tone,
    toneSuggested: suggested,
    toneOverridden: tone !== suggested,
    dueOn,
    overdueDays,
    dueSince: addDays(dueOn, threshold),
    recipientEmail: destinataire,
    subject: sujet(tone, reference, montant, overdueDays),
    body: corps({ tone, reference, montant, invoice, client, dueOn, overdueDays }),
    legalNotice: tone === 'escalate' ? MENTION_LEGALE : null,
    history: invoice.reminders,
  }
}

/** À qui la facture est faite : le destinataire nommé, sinon l'ESN. */
function nomDuClient(client: ClientForReminder): string {
  return client.billedToName?.trim() || client.workspaceName
}

function sujet(tone: ReminderTone, reference: string, montant: string, overdueDays: number): string {
  if (tone === 'neutral') return `Facture ${reference} — ${montant} — rappel`
  if (tone === 'firm') return `Facture ${reference} — ${montant} — ${overdueDays} jours de retard`
  return `Facture ${reference} — ${montant} — troisième relance`
}

/**
 * Le corps du message, par ton.
 *
 *  · `neutral` (rang 1) — un RAPPEL : la référence, le montant, l'échéance, et
 *    la porte de sortie (« si le règlement est déjà parti »). Un premier rappel
 *    qui accuse est un premier rappel qu'on ne relit pas.
 *  · `firm` (rang 2) — un RÉCAPITULATIF chiffré et une DEMANDE DE DATE. C'est la
 *    demande de #1655 mot pour mot, et c'est ce qui fait avancer un dossier :
 *    une date engage, « nous allons regarder » n'engage rien.
 *  · `escalate` (rang 3) — la mention des pénalités légales, CITÉE.
 */
function corps(args: {
  tone: ReminderTone
  reference: string
  montant: string
  invoice: InvoiceForReminder
  client: ClientForReminder
  dueOn: string
  overdueDays: number
}): string {
  const { tone, reference, montant, invoice, client, dueOn, overdueDays } = args
  const periode = `du ${jour(invoice.periodStart)} au ${jour(invoice.periodEnd)}`
  const lignes: string[] = ['Bonjour,', '']

  if (tone === 'neutral') {
    lignes.push(
      `Sauf erreur de notre part, la facture ${reference} (période ${periode}), d’un montant de ` +
        `${montant}, n’a pas encore été réglée. Son échéance était le ${jour(dueOn)}.`,
      '',
      'Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.',
    )
  } else if (tone === 'firm') {
    lignes.push(
      `La facture ${reference} reste impayée à ce jour, soit ${overdueDays} jours après son ` +
        `échéance du ${jour(dueOn)}.`,
      '',
      'Récapitulatif :',
      `— Client : ${nomDuClient(client)}`,
      `— Facture : ${reference}`,
      `— Période : ${periode}`,
      `— Montant : ${montant}`,
      `— Échéance : ${jour(dueOn)}`,
      ...rappelDesPrecedentes(invoice.reminders),
      '',
      'Pouvez-vous nous indiquer la date à laquelle le règlement sera effectué ?',
    )
  } else {
    // ⚠️ « Malgré nos relances des … » sur une facture jamais relancée serait un
    // blanc, ou pire, une affirmation fausse. L'escalade est atteignable au
    // rang 1 quand l'opérateur FORCE le ton : la phrase d'ouverture se choisit
    // donc sur ce qui a été RÉELLEMENT consigné, jamais sur le rang.
    const ouverture =
      invoice.reminders.length > 0
        ? `Malgré nos relances précédentes (${datesDesPrecedentes(invoice.reminders)}), la facture ${reference} `
        : `La facture ${reference} `
    lignes.push(
      `${ouverture}(période ${periode}), d’un montant de ${montant}, demeure impayée ` +
        `${overdueDays} jours après son échéance du ${jour(dueOn)}.`,
      '',
      'Nous vous demandons de procéder à son règlement sans délai.',
      '',
      MENTION_LEGALE,
    )
  }

  lignes.push('', 'Bien cordialement,')
  return lignes.join('\n')
}

/**
 * « — Relance précédente : le 12/10/2026 (ton courtois) ». Rien du tout quand il
 * n'y en a aucune : une ligne « Relance précédente : — » ferait passer une
 * absence pour une donnée.
 */
function rappelDesPrecedentes(reminders: readonly LoggedReminder[]): string[] {
  if (reminders.length === 0) return []
  return reminders.map(
    entry =>
      `— Relance n°${entry.index} : le ${jour(entry.at.slice(0, 10))} (ton ${TON_EN_TOUTES_LETTRES[entry.tone]})`,
  )
}

/** « 12/10/2026, 24/10/2026 » — les dates RÉELLES, jamais « plusieurs relances ». */
function datesDesPrecedentes(reminders: readonly LoggedReminder[]): string {
  return reminders.map(entry => jour(entry.at.slice(0, 10))).join(', ')
}

/**
 * Le nom français des trois tons du produit.
 *
 * ⚠️ Le VOCABULAIRE reste celui de `REMINDER_TONES` (`neutral` / `firm` /
 * `escalate`) : ce tableau ne fait que le TRADUIRE pour un texte qui part chez
 * un client français. Une quatrième valeur ici serait un ton que la cadence ne
 * sait pas produire — `Record<ReminderTone, …>` la refuse à la compilation.
 */
const TON_EN_TOUTES_LETTRES: Readonly<Record<ReminderTone, string>> = {
  neutral: 'courtois',
  firm: 'ferme',
  escalate: 'escalade',
}
