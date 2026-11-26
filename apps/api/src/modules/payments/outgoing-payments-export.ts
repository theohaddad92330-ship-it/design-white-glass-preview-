import { paymentOverdueDays, type OutgoingPayment } from '@bellum/contracts'

/**
 * L'export du mois, en CSV.
 *
 * Il part chez un comptable ou un office manager : point-virgule, BOM, montants
 * en euros. **Aucune ligne n'est recalculée ici** — le retard vient de
 * `paymentOverdueDays`, la même fonction que l'écran, parce qu'un export qui
 * produirait des chiffres différents de l'écran ferait douter des deux.
 *
 * ⚠️ Une valeur absente sort VIDE, jamais `0` ni `0,00 €`. Un tableur qui reçoit
 * `0` dans une colonne de montant fait une somme, et cette somme est fausse —
 * c'est le même défaut qu'à l'écran, en pire : personne ne relit un CSV pour
 * vérifier qu'un zéro voulait dire « on ne sait pas ».
 *
 * ⚠️ Aucune colonne bancaire. Le fichier ne porte ni IBAN, ni BIC, ni domiciliation :
 * ce n'est pas un fichier de virement, et l'ouvrir dans un outil bancaire ne
 * produirait rien. Bellum SUIT le paiement, il ne le déclenche pas.
 */
const HEADERS = [
  'Consultant',
  'Métier',
  'Client',
  'Mission',
  'Mois',
  'Relevé validé le',
  'Jours',
  'Facture du sous-traitant',
  'Montant dû (€)',
  'Montant payé (€)',
  'Statut du paiement',
  'Date de paiement prévue',
  'Date de paiement réelle',
  'Retard (jours)',
  'Relances',
] as const

/**
 * Le BOM, en ÉCHAPPEMENT et jamais collé tel quel.
 *
 * Un U+FEFF littéral dans le source est un espace invisible : le linter le
 * refuse, et une fusion de branches le perdrait sans que personne ne le voie —
 * jusqu'à ce qu'un tableur rouvre « Salomé » en « SalomÃ© ».
 */
const BOM = '\uFEFF'

export function outgoingPaymentsToCsv(items: readonly OutgoingPayment[], now: Date = new Date()): string {
  const lines = [HEADERS.join(';')]
  for (const item of items) {
    const overdue = item.paidOn ? null : paymentOverdueDays(item.scheduledOn, now)
    lines.push(
      [
        cell(item.consultantName),
        cell(item.consultantTitle),
        cell(item.accountName),
        cell(item.missionLabel),
        cell(item.periodMonth.slice(0, 7)),
        cell(item.timesheetValidatedAt?.slice(0, 10) ?? null),
        // `null` ≠ 0 : aucun relevé n'est pas « zéro jour travaillé ».
        cell(item.timesheetDays === null ? null : String(item.timesheetDays)),
        cell(item.supplierInvoiceReference),
        euros(item.payableAmountCents),
        euros(item.settledAmountCents),
        cell(item.status),
        cell(item.scheduledOn),
        cell(item.paidOn),
        // Un retard négatif ou nul n'est pas un retard : la case reste vide
        // plutôt que d'annoncer « -10 jours », qui ne se lit pas.
        cell(overdue !== null && overdue > 0 ? String(overdue) : null),
        // `0` est ici une VRAIE valeur : aucune relance n'a été consignée.
        cell(String(item.remindersSent)),
      ].join(';'),
    )
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** Un champ, échappé pour le point-virgule. `null` sort VIDE. */
function cell(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Des centimes en euros, virgule décimale.
 *
 * ⚠️ `null` sort VIDE et jamais `0,00` — une colonne de montants qu'un tableur
 * additionne ne doit contenir que des montants CONNUS.
 */
function euros(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toFixed(2).replace('.', ',')
}
