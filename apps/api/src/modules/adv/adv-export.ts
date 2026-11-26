import { ADV_BLOCKER_ACTIONS, advAgeDays, type AdvDossier } from '@bellum/contracts'

/**
 * L'export de la file ADV.
 *
 * Mêmes trois règles que `readiness-export.ts`, et pour les mêmes raisons — ce
 * fichier part chez un gestionnaire ADV, souvent par mail, et s'ouvre dans un
 * tableur français :
 *
 *  1. **point-virgule + BOM** — sans eux, Excel range toute la ligne dans la
 *     première colonne, et le destinataire conclut que l'export est cassé ;
 *  2. **une valeur absente reste une cellule VIDE** — écrire « 0 » y met une
 *     donnée, et une ancienneté de « 0 jour » se lit « ouvert aujourd'hui » sur
 *     un dossier dont on ignore la date d'ouverture ;
 *  3. **tout est cité** — une raison sociale contenant un point-virgule
 *     casserait sinon la ligne entière.
 *
 * La colonne « Où réparer » n'est pas décorative : elle porte la même route que
 * l'écran, prise dans {@link ADV_BLOCKER_ACTIONS}. Un export qui nomme un
 * problème sans dire où on le règle se referme sans rien changer.
 */
const COLUMNS = [
  'Compte',
  'Mission',
  'Dossier',
  'État',
  'Motifs',
  'Où réparer',
  'Ouvert le',
  'Ancienneté (jours)',
  'Référence cliente',
  'Conditions de règlement (jours)',
  'Coordonnées de règlement transmises le',
  'Entité de facturation',
] as const

function cell(value: string | null): string {
  if (value === null) return ''
  return `"${value.replace(/"/g, '""')}"`
}

export function advDossiersToCsv(rows: readonly AdvDossier[], now: Date = new Date()): string {
  const lines = [COLUMNS.map(column => cell(column)).join(';')]
  for (const row of rows) {
    const age = advAgeDays(row.openedOn, now)
    lines.push(
      [
        cell(row.accountName),
        cell(row.missionLabel),
        cell(row.kind),
        cell(row.state),
        cell(row.blockers.length > 0 ? row.blockers.join(', ') : null),
        cell(
          row.blockers.length > 0 ? [...new Set(row.blockers.map(b => ADV_BLOCKER_ACTIONS[b].route))].join(' ') : null,
        ),
        cell(row.openedOn),
        // `null` reste vide : « 0 jour » se lirait « ouvert aujourd'hui ».
        cell(age === null ? null : String(age)),
        cell(row.clientBillingReference),
        cell(row.paymentTermsDays === null ? null : String(row.paymentTermsDays)),
        cell(row.paymentDetailsTransmittedAt === null ? null : row.paymentDetailsTransmittedAt.slice(0, 10)),
        cell(row.clientEntityName),
      ].join(';'),
    )
  }
  // Le BOM (U+FEFF) en SÉQUENCE D'ÉCHAPPEMENT, comme `readiness-export.ts` :
  // écrit en clair il est invisible dans un éditeur et se supprime par
  // accident, et sans lui un Excel français lit « RÃ©fÃ©rence ».
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
