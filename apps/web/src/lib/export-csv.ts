import { isEnrichmentForbiddenField } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { toCsv } from '@/lib/csv'
import type { DataExitGrant } from '@/lib/data-exit'
import { contactProvenanceKind } from '@/features/contacts/lib/contactProvenance'

type ExportRow = Record<string, unknown>

type ExportColumn = {
  /** Le nom du champ exporté — c'est lui que le catalogue interdit lit (#2297.54). */
  key: string
  header: () => string
  value: (contact: ExportRow) => string
  /** #2297.52 — une colonne ENRICHIE porte sa colonne de source juste après elle. */
  enriched?: true
}

const text = (key: string) => (contact: ExportRow) => (contact[key] as string) || ''

const CONTACT_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: 'full_name', header: () => i18n.t('exports:csv.headers.name'), value: text('full_name') },
  { key: 'title', header: () => i18n.t('exports:csv.headers.title'), value: text('title') },
  { key: 'company_name', header: () => i18n.t('exports:csv.headers.company'), value: text('company_name') },
  { key: 'entity', header: () => i18n.t('exports:csv.headers.entity'), value: text('entity') },
  { key: 'decision_role', header: () => i18n.t('exports:csv.headers.role'), value: text('decision_role') },
  {
    key: 'priority',
    header: () => i18n.t('exports:csv.headers.priority'),
    value: contact => String(contact.priority || ''),
  },
  { key: 'email', header: () => i18n.t('exports:csv.headers.email'), value: text('email'), enriched: true },
  { key: 'phone', header: () => i18n.t('exports:csv.headers.phone'), value: text('phone'), enriched: true },
  { key: 'linkedin_url', header: () => 'LinkedIn', value: text('linkedin_url'), enriched: true },
  { key: 'user_status', header: () => i18n.t('exports:csv.headers.status'), value: text('user_status') },
]

/**
 * #2297.52 — la source d'une valeur enrichie, dite par sa FAMILLE (outil
 * connecté, source publique, modèle, saisie) — la table de `contactProvenance`
 * et les libellés de la primitive `Provenance`, jamais recopiés (GA-26). Le
 * nom d'un fournisseur ne sort jamais (doctrine : nos fournisseurs ne se
 * nomment pas). Une cellule vide ne cite rien ; une source inconnue se NOMME.
 */
function enrichedSource(contact: ExportRow, value: string): string {
  if (!value) return ''
  const source = typeof contact.source === 'string' ? contact.source : ''
  const kind = source ? contactProvenanceKind(source) : null
  return kind ? i18n.t(`common:provenance.${kind}`) : i18n.t('common:provenance.unknownSource')
}

export function generateCSV(contacts: Record<string, unknown>[]): string {
  // #2297.54 / #2297.52 — une colonne du catalogue des champs interdits ne
  // s'exporte jamais, même si quelqu'un l'ajoute à la liste ci-dessus. Les
  // coordonnées ARCHIVÉES par la rétention (#2297.51) n'y sont pas non plus :
  // l'API ne les rend plus, la cellule reste vide.
  const columns = CONTACT_EXPORT_COLUMNS.filter(column => !isEnrichmentForbiddenField(column.key))

  const headers = columns.flatMap(column =>
    column.enriched
      ? [column.header(), i18n.t('exports:csv.headers.sourceOf', { column: column.header() })]
      : [column.header()],
  )

  const rows = contacts.map(contact =>
    columns.flatMap(column => {
      const value = column.value(contact)
      return column.enriched ? [value, enrichedSource(contact, value)] : [value]
    }),
  )

  return toCsv([headers, ...rows])
}

/**
 * Le SEUL endroit où un CSV devient un fichier (garde
 * `a-csv-leaves-only-through-the-workspace-rule`). #2081.14 — il exige la
 * preuve que la règle d'espace laisse sortir les données (`useDataExit`,
 * `@/lib/data-exit`) : un écran qui ne la lit pas ne peut pas l'appeler.
 */
export function downloadCSV(csv: string, filename: string, _grant: DataExitGrant) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * #4016 L11 — le jumeau JSON de {@link downloadCSV} : même preuve exigée
 * (`DataExitGrant`), parce qu'un fichier JSON est une sortie de données au même
 * titre qu'un CSV.
 */
export function downloadJSON(json: string, filename: string, _grant: DataExitGrant) {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
