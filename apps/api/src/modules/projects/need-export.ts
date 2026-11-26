import type { NeedExportAudience, NeedExportLang, OpenNeedRow } from '@bellum/contracts'

/**
 * #4016 L11 — le FICHIER de l'export de masse des besoins (CSV ou JSON), à
 * reprendre dans un outil tiers. Décision Louis 11/10/2026, renversement daté
 * de `c43_actions_de_masse` — voir `packages/contracts/src/schemas/need-export.ts`.
 *
 * Mêmes trois règles que `adv-export.ts` pour le CSV (point-virgule + BOM,
 * absence = cellule VIDE, tout est cité). Le JSON garde des clés stables et
 * met `null` là où rien n'est connu — jamais un 0 qui se lirait comme une
 * valeur (GA-18 / GA-19).
 *
 * Seules des colonnes LUES de la ligne du tableau (`OpenNeedRow`) sortent :
 * aucun identifiant de personne (`owner_id`, `contact_id`), aucun texte de
 * motif interne — ce qui part chez un tiers est le besoin, pas l'équipe.
 */
const COLUMNS = {
  fr: [
    'Besoin',
    'Compte',
    'Statut',
    'Urgence',
    'Compétences',
    'Séniorité',
    'Postes',
    'TJM cible (€)',
    'Début',
    'Durée (mois)',
    'Lieu',
    'Échéance',
    'Projet',
    'Identifiant',
  ],
  // #4295.14 — les en-têtes suivent la langue de l'interface ; MÊME ordre, MÊME nombre de colonnes.
  en: [
    'Need',
    'Account',
    'Status',
    'Urgency',
    'Skills',
    'Seniority',
    'Positions',
    'Target daily rate (€)',
    'Start',
    'Duration (months)',
    'Location',
    'Deadline',
    'Project',
    'Identifier',
  ],
} as const satisfies Record<NeedExportLang, readonly string[]>

/** L'index de la colonne tarif : la même dans les deux langues (le partenaire ne la reçoit pas). */
const TJM_COLUMN_INDEX = 7

function cell(value: string | null): string {
  if (value === null) return ''
  return `"${value.replace(/"/g, '""')}"`
}

function skillsText(row: OpenNeedRow, lang: NeedExportLang): string | null {
  if (row.skills.length === 0) return null
  const optional = lang === 'en' ? 'nice to have' : 'souhaitée'
  return row.skills.map(skill => (skill.required === false ? `${skill.term} (${optional})` : skill.term)).join(', ')
}

function tjmEuros(row: OpenNeedRow): number | null {
  return row.target_tjm_cents === null ? null : Math.round(row.target_tjm_cents / 100)
}

/** Théo C projects-besoins — pour un partenaire : ni tarif ni porteur (le porteur n'a jamais été une colonne). */
export function needRowsToCsv(
  rows: readonly OpenNeedRow[],
  audience: NeedExportAudience = 'team',
  lang: NeedExportLang = 'fr',
): string {
  const partner = audience === 'partner'
  const columns = COLUMNS[lang].filter((_, index) => !(partner && index === TJM_COLUMN_INDEX))
  const lines = [columns.map(column => cell(column)).join(';')]
  for (const row of rows) {
    const tjm = tjmEuros(row)
    lines.push(
      [
        cell(row.title),
        cell(row.account_name),
        cell(row.status),
        cell(row.urgency),
        cell(skillsText(row, lang)),
        cell(row.seniority),
        cell(String(row.headcount)),
        ...(partner ? [] : [cell(tjm === null ? null : String(tjm))]),
        cell(row.start_on),
        cell(row.duration_months === null ? null : String(row.duration_months)),
        cell(row.location),
        cell(row.deadline_at),
        cell(row.project_label),
        cell(row.id),
      ].join(';'),
    )
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function needRowsToJson(
  rows: readonly OpenNeedRow[],
  now: Date = new Date(),
  audience: NeedExportAudience = 'team',
): string {
  return JSON.stringify(
    {
      exported_at: now.toISOString(),
      count: rows.length,
      needs: rows.map(row => ({
        id: row.id,
        title: row.title,
        account_id: row.account_id,
        account_name: row.account_name,
        status: row.status,
        urgency: row.urgency,
        skills: row.skills.map(skill => ({ term: skill.term, required: skill.required !== false })),
        seniority: row.seniority,
        headcount: row.headcount,
        ...(audience === 'partner' ? {} : { target_tjm_eur: tjmEuros(row) }),
        start_on: row.start_on,
        duration_months: row.duration_months,
        location: row.location,
        contract_kind: row.contract_kind,
        deadline_at: row.deadline_at,
        project_label: row.project_label,
      })),
    },
    null,
    2,
  )
}

/**
 * Les lignes dans l'ordre de la SÉLECTION. Un identifiant que l'espace ne voit
 * pas (autre espace, besoin supprimé) ne fait AUCUNE ligne — on n'affiche pas
 * ce qu'on n'a pas.
 */
export function orderLikeSelection(rows: readonly OpenNeedRow[], needIds: readonly string[]): OpenNeedRow[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  return needIds.flatMap(id => {
    const found = byId.get(id)
    return found ? [found] : []
  })
}
