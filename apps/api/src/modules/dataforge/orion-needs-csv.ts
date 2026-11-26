import { createHash } from 'node:crypto'
import {
  detectRadarTechnologies,
  normalizeDataforgeNeedStatus,
  type DataforgeNeedSourceFile,
  type DataforgeNeedStatus,
} from '@bellum/contracts'
import { splitCsvLine } from '../contacts/csv-import'
import { textOrNull } from './dataforge-csv'
import { valueOrPlaceholderNull } from './orion-csv'

/**
 * #4281.1 / #4282.5 — parseur PUR des besoins historiques du pack ORION V12
 * (`2_RELATIONNEL/24_MISSIONS_BESOINS.csv`, 1 336 lignes, et
 * `25_PIPELINE_CRM_*.csv`), jusqu'ici jamais ingérés (`agent_docs/orion-v12-2026-08-31.md` §5).
 *
 * Décision Louis 19/10 n°17 : « toutes les données ont de la valeur » — chaque
 * colonne est gardée. Ce qui a un SENS pour l'analyse et Laura (statut, date,
 * TJM, prescripteur, lieu, technologies) est TYPÉ ; tout le reste part brut
 * dans `payload`, et une valeur typée illisible y garde son texte d'origine.
 *
 * L'en-tête réel n'est jamais commité (personnes réelles) : il est lu par
 * ALIAS, et `describeOrionNeedHeader` dit à l'opérateur, à l'ingestion, quelle
 * colonne a nourri quel champ — une colonne inattendue se VOIT, elle ne tombe
 * pas en silence (le défaut des 18 colonnes V10).
 */

type OrionParsedRow<T> = { kind: 'row'; row: T } | { kind: 'rejected'; reason: string }

export interface OrionNeedRecord {
  needId: string
  sourceFile: DataforgeNeedSourceFile
  /** `DF-XXXX` — `null` quand la ligne n'est rattachée à aucun compte du pack (jointure partielle). */
  accountSourceId: string | null
  entreprise: string | null
  title: string | null
  description: string | null
  domain: string | null
  status: DataforgeNeedStatus
  statusRaw: string | null
  /** ISO `AAAA-MM-JJ`, ou `null` — jamais une date devinée. */
  needDate: string | null
  startDate: string | null
  endDate: string | null
  /** Seulement s'il est écrit — jamais estimé. */
  tjmEur: number | null
  prescriberName: string | null
  prescriberTitle: string | null
  prescriberLastSeen: string | null
  location: string | null
  /** Codes de la liste fermée du radar (`RADAR_TECHNOLOGIES`) lus dans intitulé + description + domaine. */
  technologies: string[]
  payload: Record<string, string>
}

type NeedField =
  | 'needId'
  | 'accountSourceId'
  | 'entreprise'
  | 'title'
  | 'description'
  | 'domain'
  | 'statusRaw'
  | 'needDate'
  | 'startDate'
  | 'endDate'
  | 'tjm'
  | 'prescriberTitle'
  | 'prescriberLastSeen'
  | 'prescriberName'
  | 'location'

/** Alias REPLIÉS (minuscules, sans accent, `_`). L'ordre compte : la fonction avant le nom. */
const FIELD_ALIASES: readonly (readonly [NeedField, readonly string[]])[] = [
  [
    'needId',
    ['besoin_id', 'need_id', 'mission_id', 'opportunite_id', 'opportunity_id', 'id_besoin', 'id_mission', 'id'],
  ],
  ['accountSourceId', ['account_id', 'df_id', 'compte_id', 'bellum_account_source_id']],
  ['entreprise', ['entreprise', 'client', 'compte', 'company', 'account_name', 'societe']],
  [
    'title',
    [
      'intitule_mission',
      'intitule',
      'titre',
      'besoin',
      'mission',
      'poste',
      'title',
      'libelle',
      'objet',
      'intitule_besoin',
    ],
  ],
  ['description', ['description', 'detail', 'details', 'contexte', 'commentaire', 'commentaires', 'notes']],
  ['domain', ['domaine', 'domain_code', 'domaine_code', 'competence', 'competences', 'technologie', 'techno', 'stack']],
  ['statusRaw', ['statut_mission', 'statut', 'status', 'etat', 'resultat', 'issue', 'stage', 'etape']],
  [
    'needDate',
    [
      'date_diffusion',
      'date',
      'date_besoin',
      'date_creation',
      'date_ouverture',
      'date_demande',
      'created_at',
      'date_ajout',
    ],
  ],
  ['startDate', ['date_debut', 'debut', 'start_date']],
  ['endDate', ['date_fin', 'fin', 'end_date']],
  ['tjm', ['tjm', 'tjm_eur', 'tjm_observe', 'taux_journalier', 'prix_jour', 'daily_rate']],
  [
    'prescriberTitle',
    ['fonction_prescripteur', 'prescripteur_fonction', 'prescripteur_poste', 'poste_prescripteur', 'contact_fonction'],
  ],
  ['prescriberLastSeen', ['prescripteur_vu_le', 'date_contact', 'derniere_interaction', 'last_contact']],
  ['prescriberName', ['prescripteur', 'prescripteur_nom', 'prescriber', 'demandeur', 'interlocuteur']],
  ['location', ['lieu', 'ville', 'localisation', 'location']],
]

const V4_HEADERLESS_LAYOUT: readonly (readonly [NeedField, string])[] = [
  ['statusRaw', 'Unnamed: 1'],
  ['tjm', 'Unnamed: 4'],
  ['title', 'Unnamed: 5'],
  ['entreprise', 'Unnamed: 7'],
  ['needDate', 'Unnamed: 8'],
]

function foldColumn(column: string): string {
  return column
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Quelle colonne nourrit quel champ, et lesquelles restent brutes — imprimé par le script d'ingestion. */
export function describeOrionNeedHeader(header: readonly string[]): {
  mapped: Partial<Record<NeedField, string>>
  keptRaw: string[]
  fallbacks: Partial<Record<NeedField, string[]>>
} {
  const mapped: Partial<Record<NeedField, string>> = {}
  const used = new Set<string>()
  // L'alias le plus SPÉCIFIQUE gagne (« Intitulé Mission » avant « Titre »), quel que soit l'ordre des colonnes.
  for (const [field, aliases] of FIELD_ALIASES) {
    for (const alias of aliases) {
      const column = header.find(candidate => !used.has(candidate) && foldColumn(candidate) === alias)
      if (column !== undefined) {
        mapped[field] = column
        used.add(column)
        break
      }
    }
  }
  /**
   * Les AUTRES colonnes qui portent le même champ (pack V12 : « Titre » rempli quand « Intitulé Mission » est vide) :
   * lues en repli, et gardées brutes dans `payload` — une valeur n'est jamais perdue.
   */
  const fallbacks: Partial<Record<NeedField, string[]>> = {}
  for (const [field, aliases] of FIELD_ALIASES) {
    const others = header.filter(column => !used.has(column) && aliases.includes(foldColumn(column)))
    if (others.length > 0) fallbacks[field] = others
  }
  // Bloc V4 du pack V12 collé SANS en-tête : ses colonnes s'appellent « Unnamed: n », lues par position (vérifié sur les
  // 176 lignes du 04/11 : statut, identifiant, candidats, TJM, intitulé, intermédiaire, client, date).
  for (const [field, column] of V4_HEADERLESS_LAYOUT) {
    if (header.includes(column) && !used.has(column)) fallbacks[field] = [...(fallbacks[field] ?? []), column]
  }
  return { mapped, keptRaw: header.filter(column => !used.has(column)), fallbacks }
}

/** `AAAA-MM-JJ…` ou `JJ/MM/AAAA` (ou `JJ-MM-AAAA`) → ISO ; tout le reste → `null`. */
function isoDateOrNull(value: string | null): string | null {
  if (value === null) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value)
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : fr ? [fr[3], fr[2], fr[1]] : [null, null, null]
  if (!year || !month || !day) return null
  const candidate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const parsed = new Date(`${candidate}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate ? null : candidate
}

function tjmOrNull(value: string | null): number | null {
  if (value === null) return null
  const cleaned = value.replace(/[€\s]|eur(os?)?|\/j(our)?|ht/gi, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const amount = Number(cleaned)
  return amount > 0 ? amount : null
}

export function parseOrionNeedRecord(
  header: readonly string[],
  record: string,
  sourceFile: DataforgeNeedSourceFile,
): OrionParsedRow<OrionNeedRecord> {
  const cells = splitCsvLine(record, ';')
  if (cells.length !== header.length) {
    return { kind: 'rejected', reason: `colonnes: ${cells.length} au lieu de ${header.length}` }
  }
  const row: Record<string, string> = {}
  header.forEach((column, index) => {
    row[column] = cells[index] ?? ''
  })
  const { mapped, keptRaw, fallbacks } = describeOrionNeedHeader(header)
  const payload: Record<string, string> = {}
  for (const column of keptRaw) {
    if ((row[column] ?? '').trim().length > 0) payload[column] = row[column] ?? ''
  }
  const text = (field: NeedField): string | null => {
    const column = mapped[field]
    const primary = column === undefined ? null : valueOrPlaceholderNull(row[column])
    if (primary !== null) return primary
    for (const other of fallbacks[field] ?? []) {
      const value = valueOrPlaceholderNull(row[other])
      if (value !== null) return value
    }
    return null
  }
  /** Une valeur typée que la conversion n'a pas su lire garde son texte brut dans `payload`. */
  const keepRawWhenNull = <T>(field: NeedField, value: T | null): T | null => {
    const column = mapped[field]
    if (value === null && column !== undefined && textOrNull(row[column]) !== null) payload[column] = row[column] ?? ''
    return value
  }

  const title = text('title')
  const description = text('description')
  const declaredId = text('needId')
  if (title === null && description === null) {
    return { kind: 'rejected', reason: `besoin sans intitulé ni description (${declaredId ?? 'sans identifiant'})` }
  }
  const domain = text('domain')
  const statusRaw = text('statusRaw')

  return {
    kind: 'row',
    row: {
      needId: declaredId ?? `${sourceFile}:${createHash('sha256').update(record).digest('hex').slice(0, 24)}`,
      sourceFile,
      accountSourceId: text('accountSourceId'),
      entreprise: text('entreprise'),
      title,
      description,
      domain,
      status: normalizeDataforgeNeedStatus(statusRaw),
      statusRaw,
      needDate: keepRawWhenNull('needDate', isoDateOrNull(text('needDate'))),
      startDate: keepRawWhenNull('startDate', isoDateOrNull(text('startDate'))),
      endDate: keepRawWhenNull('endDate', isoDateOrNull(text('endDate'))),
      tjmEur: keepRawWhenNull('tjm', tjmOrNull(text('tjm'))),
      prescriberName: text('prescriberName'),
      prescriberTitle: text('prescriberTitle'),
      prescriberLastSeen: keepRawWhenNull('prescriberLastSeen', isoDateOrNull(text('prescriberLastSeen'))),
      location: text('location'),
      technologies: detectRadarTechnologies([title, description, domain].filter(Boolean).join(' ')),
      payload,
    },
  }
}
