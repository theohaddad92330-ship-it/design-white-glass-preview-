import type { AtsExportRow } from '@bellum/contracts'

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — le CSV du vivier ENTIER,
 * construit EN TÂCHE DE FOND (le job), à partir de la même ligne que l'export
 * ATS (`AtsExportRow`, `toAtsExportRow`) — aucune seconde forme de fiche.
 *
 * Mêmes trois règles que `adv-export.ts` et `readiness-export.ts` : ce
 * fichier peut s'ouvrir dans un tableur français —
 *  1. point-virgule, jamais une virgule ;
 *  2. une valeur ABSENTE reste une cellule VIDE — `tjm: null` n'écrit jamais « 0 » ;
 *  3. tout est cité, une virgule ou un guillemet dans un nom ne casse pas la ligne.
 *
 * Fonction PURE, réutilisable sans dépendance TypeORM — le worker lui passe
 * les lignes déjà lues.
 */
const COLUMNS = [
  'Identifiant',
  'Prénom',
  'Nom',
  'E-mail',
  'Téléphone',
  'Rôle',
  'Séniorité',
  'Disponibilité',
  'Disponible à partir de',
  'TJM',
  "Nature d'engagement",
  'Source',
] as const

// Le BOM, en ÉCHAPPEMENT et jamais collé tel quel (même règle que
// `outgoing-payments-export.ts`) : un U+FEFF littéral dans le source est un
// espace invisible que le linter refuse (`no-irregular-whitespace`).
const BOM = '﻿'

function cell(value: string | number | null): string {
  if (value === null) return ''
  return `"${String(value).replace(/"/g, '""')}"`
}

export function consultantExportRowsToCsv(rows: readonly AtsExportRow[]): string {
  const lines = [COLUMNS.map(column => cell(column)).join(';')]
  for (const row of rows) {
    lines.push(
      [
        cell(row.consultantId),
        cell(row.firstName),
        cell(row.lastName),
        cell(row.email),
        cell(row.phone),
        cell(row.title),
        cell(row.seniority),
        cell(row.availability),
        cell(row.availableFrom),
        cell(row.tjm),
        cell(row.engagementKind),
        cell(row.source),
      ].join(';'),
    )
  }
  return `${BOM}${lines.join('\r\n')}`
}
