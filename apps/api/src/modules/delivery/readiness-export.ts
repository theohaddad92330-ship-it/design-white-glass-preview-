import type { InvoiceReadiness } from '@bellum/contracts'
import { asDay } from '../../common/day'

/**
 * L'export de la vue « prêt à facturer » (§8, exigence 129).
 *
 * Ce fichier part chez un comptable, souvent par mail, et il est ouvert dans un
 * tableur français. Trois règles en découlent, toutes apprises sur les exports
 * bureautiques du 03/08 :
 *
 *  1. **Le séparateur est le point-virgule**, et un BOM ouvre le fichier — sans
 *     eux, Excel en français range toute la ligne dans la première colonne, et
 *     le destinataire conclut que l'export est cassé.
 *  2. **Les montants sortent en euros avec une virgule**, jamais en centimes :
 *     « 1050000 » dans une colonne « montant » se lit comme un million.
 *  3. **Une valeur absente reste une cellule VIDE.** Écrire « N/A » ou « 0 » y
 *     met une donnée, et quelqu'un finira par facturer un « 0 ».
 */

const COLUMNS = [
  'Compte',
  'Mission',
  'Mois',
  'État',
  'Bloqueurs',
  'Jours',
  'Montant préparatoire (€)',
  'Référence facture',
  'Échéance',
  // #2197.41 — QUI a déclaré ce mois facturé, quand `État` vaut
  // `invoiced_declared`. Vide sur toute autre ligne — jamais un nom deviné.
  'Déclaré par',
] as const

/** Une cellule CSV : les guillemets sont doublés, et tout est cité. Un nom de
 *  compte contenant un point-virgule casserait sinon la ligne entière. */
function cell(value: string | null): string {
  if (value === null) return ''
  return `"${value.replace(/"/g, '""')}"`
}

/** Des centimes vers un montant lisible dans un tableur français. */
function euros(cents: number | null): string | null {
  if (cents === null) return null
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function readinessToCsv(rows: readonly InvoiceReadiness[]): string {
  const lines = [COLUMNS.map(column => cell(column)).join(';')]
  for (const row of rows) {
    lines.push(
      [
        cell(row.accountName),
        cell(row.missionLabel),
        cell(row.periodMonth.slice(0, 7)),
        cell(row.state),
        // Les bloqueurs sont joints par une virgule DANS une cellule citée :
        // une colonne par bloqueur produirait un fichier à géométrie variable.
        cell(row.blockers.length > 0 ? row.blockers.join(', ') : null),
        cell(row.days === null ? null : String(row.days).replace('.', ',')),
        cell(euros(row.preparedAmountCents)),
        cell(row.invoiceReference),
        // `dueOn` porte une colonne `date`. Le parseur de `pg-date.ts` la rend
        // désormais en chaîne, mais l'export ne doit pas TOMBER si une valeur
        // entre par une autre porte : `asDay` accepte les deux formes et rend
        // un jour, jamais « Invalid Date ». C'est ce 500-là qui a été mesuré en
        // production le 01/09/2026.
        cell(asDay(row.dueOn)),
        cell(row.invoicedByName ?? null),
      ].join(';'),
    )
  }
  // Le BOM en tête (U+FEFF), écrit en SÉQUENCE D'ÉCHAPPEMENT et jamais en
  // caractère littéral. C'est lui — et lui seul — qui fait ouvrir le fichier en
  // UTF-8 par un Excel français : sans lui, le comptable lit « RÃ©fÃ©rence » et
  // conclut que l'export est cassé alors que la donnée est juste. Écrit en
  // clair, il est invisible dans un éditeur et se supprime par accident ;
  // `\uFEFF` produit exactement le même octet et se VOIT. Ne pas le retirer.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/**
 * #2198.45 — L'export de l'écran « encaissements » (§8, exigence 129 côté
 * ENCAISSÉ, pas préparatoire). Mêmes trois règles que `readinessToCsv`
 * ci-dessus (point-virgule, BOM, virgule décimale, cellule vide plutôt que
 * « 0 »/« N/A »).
 *
 * ⚠️ Colonnes BRUTES, jamais un statut/retard RECALCULÉ ici : ces dérivations
 * vivent dans `collections.ts` côté web et nulle part ailleurs (« deux
 * chemins qui referaient le même retard divergeraient »). Un comptable qui
 * ouvre ce fichier compare une échéance à aujourd'hui lui-même ; ce fichier ne
 * lui invente pas un mot pour ça.
 */
const COLLECTIONS_COLUMNS = [
  'Compte',
  'Interlocuteur',
  'Mission',
  'Mois',
  'État',
  'Montant facturé (€)',
  'Montant réglé (€)',
  'Échéance',
  'Relances envoyées',
  'Dernière relance',
  'Litige ouvert le',
  'Litige levé le',
  'Motif du litige',
  'Déclaré par',
] as const

export function collectionsToCsv(rows: readonly InvoiceReadiness[]): string {
  const lines = [COLLECTIONS_COLUMNS.map(column => cell(column)).join(';')]
  for (const row of rows) {
    lines.push(
      [
        cell(row.accountName),
        cell(row.billingContactName ?? null),
        cell(row.missionLabel),
        cell(row.periodMonth.slice(0, 7)),
        cell(row.state),
        cell(euros(row.invoicedAmountCents)),
        cell(euros(row.paidAmountCents)),
        cell(asDay(row.dueOn)),
        cell(String(row.remindersSent)),
        cell(asDay(row.lastReminderAt)),
        cell(asDay(row.disputedAt)),
        cell(asDay(row.disputeResolvedAt)),
        cell(row.disputeReason),
        cell(row.invoicedByName ?? null),
      ].join(';'),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
