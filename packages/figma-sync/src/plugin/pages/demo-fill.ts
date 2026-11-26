import demoJson from '../../../generated/demo.json'
import type { DemoSet } from '../../extract/demo'
import { columnLabel } from '../../spec/types'
import type { TableColumn } from '../../spec/types'

/**
 * Les maquettes remplies par le JEU DE DÉMONSTRATION (défaut B, 25/09/2026 : « Compte exemple 1 » et
 * « — » partout). Une spec pose un EMPLACEMENT (« Compte exemple 1 », une ligne de « — ») ; le rendu
 * le remplace par les fiches réelles de `generated/demo.json` — les six comptes, leurs interlocuteurs,
 * le vivier, les missions et factures du client d'exemple. Une colonne que le jeu ne connaît pas garde
 * sa valeur de spec (« — » = non mesuré), jamais une valeur devinée ; aucune probabilité.
 */

const DEMO = demoJson as DemoSet

type Entity = 'account' | 'contact' | 'consultant' | 'mission' | 'member'

/** « Compte exemple 1 », « Talent exemple 2 », « Membre exemple »… → l'entité et son rang (0 par défaut). */
const PLACEHOLDER = /^(Compte|Entreprise|Client|Contact|Talent|Consultant|Mission|Membre) exemple(?: (\d+))?$/

const ENTITY: Record<string, Entity> = {
  Compte: 'account',
  Entreprise: 'account',
  Client: 'account',
  Contact: 'contact',
  Talent: 'consultant',
  Consultant: 'consultant',
  Mission: 'mission',
  Membre: 'member',
}

const fr = (iso: string | null): string | null => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null)
const euros = (n: number | null): string | null => (n === null ? null : `${n.toLocaleString('fr-FR')} €`)
const days = (n: number | null): string | null => (n === null ? null : n <= 0 ? 'Aujourd’hui' : `J-${n}`)

const STATUS: Record<string, string> = {
  watching: 'En observation',
  inbox: 'À trier',
  customer: 'Client',
  active: 'En cours',
  paid: 'Encaissée',
  pending: 'À échéance',
  overdue: 'En retard',
  disputed: 'Contestée',
}
const ROLE: Record<string, string> = {
  economic: 'Décideur économique',
  technical: 'Décideur technique',
  influencer: 'Influenceur',
  user: 'Utilisateur',
  champion: 'Relais',
  gatekeeper: 'Filtre',
}
const AVAILABILITY: Record<string, string> = {
  immediate: 'Immédiate',
  sous_1_mois: 'Sous 1 mois',
  sous_3_mois: 'Sous 3 mois',
  inconnu: 'Non renseignée',
}
const label = (map: Record<string, string>, v: string | null): string | null => (v ? (map[v] ?? v) : null)

type Row = Record<string, unknown>
/** Les colonnes que le jeu sait remplir, par entité : `[motif de l'entête, valeur]`. */
const COLUMNS: Record<Entity, [RegExp, (r: Row) => string | null][]> = {
  account: [
    [/^(compte|entreprise|client|nom|raison sociale)$/i, r => r.name as string],
    [/^score/i, r => (r.score === null ? null : `${String(r.score)}/10`)],
    [/accessibilit/i, r => `${String(r.contacts)} interlocuteurs identifiés`],
    [/derni[eè]re analyse/i, r => fr(r.lastAnalysis as string | null)],
    [/signal/i, r => r.signal as string | null],
    [/prochaine action/i, r => r.nextAction as string | null],
    [/secteur/i, r => r.sector as string],
    [/ville|localisation/i, r => r.city as string | null],
    [/effectif/i, r => r.employees as string | null],
    [/^(état|statut)/i, r => label(STATUS, r.status as string)],
    [/verdict|go/i, r => r.verdict as string | null],
  ],
  contact: [
    [/^(nom|contact|personne)$/i, r => r.name as string],
    [/entreprise|compte/i, r => r.company as string],
    [/entit/i, r => r.entity as string | null],
    [/r[ôo]le/i, r => label(ROLE, r.role as string | null)],
    [/titre|poste|fonction/i, r => r.title as string],
    [/niveau|s[ée]niorit/i, r => r.seniority as string | null],
    [/^score/i, r => (r.score === null ? null : `${String(r.score)}/100`)],
  ],
  consultant: [
    [/^(nom|consultant|talent)$/i, r => r.name as string],
    [/titre/i, r => r.title as string],
    [/comp[ée]tence|stack/i, r => (r.stack as string[]).slice(0, 3).join(' · ') || null],
    [/s[ée]niorit/i, r => r.seniority as string | null],
    [/localisation|ville/i, r => r.city as string | null],
    [/disponibilit/i, r => label(AVAILABILITY, r.availability as string | null)],
    [/tjm/i, r => euros(r.tjm as number | null)],
    [/t[ée]l[ée]travail/i, r => r.remote as string | null],
    [/contrat/i, r => (r.contract as string | null)?.toUpperCase() ?? null],
  ],
  mission: [
    [/^mission$/i, r => r.label as string],
    [/^(compte|client)$/i, r => r.client as string],
    [/^consultant$/i, r => r.consultant as string | null],
    [/^statut$/i, r => label(STATUS, r.status as string)],
    [/^(échéance|fin)$/i, r => days(r.endsInDays as number | null)],
    [/tjm|taux/i, r => euros(r.dailyRate as number | null)],
  ],
  member: [[/^(membre|porteur|qui)$/i, r => r.name as string]],
}

function rowsOf(entity: Entity): Row[] {
  if (entity === 'account') return DEMO.accounts
  if (entity === 'contact') return DEMO.contacts
  if (entity === 'consultant') return DEMO.consultants
  if (entity === 'mission') return DEMO.missions
  return [{ name: DEMO.owner }]
}

const nameOf = (entity: Entity, r: Row): string => String(entity === 'mission' ? r.label : r.name)

/** Un texte d'emplacement (« Compte exemple 2 ») → la fiche réelle de même rang ; tout autre texte inchangé. */
export function demoText(value: string): string {
  const m = PLACEHOLDER.exec(value)
  const entity = m?.[1] ? ENTITY[m[1]] : undefined
  if (!m || !entity) return value
  const rows = rowsOf(entity)
  const row = rows[(Number(m[2] ?? 1) - 1) % rows.length]
  return row ? nameOf(entity, row) : value
}

/**
 * Un tableau d'EMPLACEMENTS (une ligne « Compte exemple 1 » ou une ligne de « — ») → les fiches réelles :
 * toutes les lignes de l'entité (une page longue se montre entière, défaut J), chaque colonne connue remplie,
 * les autres gardent la valeur de la spec. Un tableau déjà réel est rendu tel quel.
 */
export function demoTable(table: { columns: TableColumn[]; rows: string[][] }): {
  columns: TableColumn[]
  rows: string[][]
} {
  const probe = table.rows
    .flat()
    .map(c => PLACEHOLDER.exec(c)?.[1])
    .find(Boolean)
  const entity = probe ? ENTITY[probe] : undefined
  if (!entity) return { columns: table.columns, rows: table.rows.map(r => r.map(demoText)) }
  const template = table.rows[0] ?? []
  const rows = rowsOf(entity).map((record, k) =>
    table.columns.map((col, c) => {
      const own = COLUMNS[entity].find(([re]) => re.test(columnLabel(col).trim()))
      const given = table.rows[k % table.rows.length]?.[c] ?? template[c] ?? '—'
      // Une autre entité citée dans la ligne (« Compte exemple 1 » d'une mission) prend son rang réel.
      const fallback = PLACEHOLDER.test(given) ? demoText(given.replace(/\d+$/, String(k + 1))) : given
      return (own ? own[1](record) : null) ?? fallback
    }),
  )
  return { columns: table.columns, rows }
}
