import type { GridSheet } from './xlsx-grid'
import type { TextCleaner } from './table'

/**
 * Onglet COCKPIT (une page, pas un tableau) :
 *   ligne 2  titre « <COMPTE> — VOICI TOUT CE QUE JE SAIS »
 *   ligne 3  sous-titre
 *   3 lignes  bandeau de 6 indicateurs : libellé / valeur / sous-titre
 *   « CE QUE JE SAIS — EN UNE PAGE » puis `RUBRIQUE | ce qu'on sait | ce que ça veut dire`
 *   blocs graphiques : titre (1 cellule) · `Libellé | Valeur` · lignes libellé/valeur
 */

type CockpitKpi = { label: string; value: string | number; caption?: string }
type CockpitKnowledge = { rubric: string; known: string; meaning: string }
type CockpitChart = { title: string; items: { label: string; value: number }[] }
type Cockpit = {
  title: string
  subtitle: string
  kpis: CockpitKpi[]
  knowledge: CockpitKnowledge[]
  charts: CockpitChart[]
  /** Libellés de graphique laissés vides dans le classeur (rendus « Non renseigné »). */
  blankChartLabels: number
}

const WHAT_I_KNOW = 'CE QUE JE SAIS — EN UNE PAGE'
export const BLANK_LABEL = 'Non renseigné'

const ACRONYMS = new Set([
  'TVA',
  'CDI',
  'CDD',
  'IT',
  'ESN',
  'RH',
  'DSI',
  'DAF',
  'SI',
  'CRM',
  'ERP',
  'IA',
  'PME',
  'ETI',
  'UE',
  'TJM',
])

/**
 * Démo clients 04/10 : un libellé de graphique en MAJUSCULES_AVEC_UNDERSCORES (tout le token, aucun
 * espace) est un enum brut du classeur — on en fait une phrase lisible. Un libellé qui contient un
 * espace (code d'entité compris : « CIB_ALMT IT Risk & PnL ») reste tel quel.
 */
const ACCENTED: Record<string, string> = {
  METHODE: 'méthode',
  INGENIERIE: 'ingénierie',
  A: 'à',
  GENERAL: 'général',
  REGIME: 'régime',
  REGLES: 'règles',
  QUALITE: 'qualité',
  SECURITE: 'sécurité',
  DONNEES: 'données',
  ETUDE: 'étude',
}

export const humanizeChartLabel = (label: string): string => {
  if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(label)) return label
  const words = label.split('_').map(w => {
    if (ACRONYMS.has(w) || /^[A-Z]\d+$/.test(w)) return w
    return ACCENTED[w] ?? w.toLowerCase()
  })
  const first = words[0]
  words[0] = first.charAt(0).toUpperCase() + first.slice(1)
  return words.join(' ')
}

export const readCockpit = (sheet: GridSheet, clean: TextCleaner): Cockpit => {
  const rows = [...sheet.rows].sort((a, b) => a.n - b.n)
  const cols = (row: (typeof rows)[number]): [number, string][] =>
    [...row.cells.entries()].sort((a, b) => a[0] - b[0]).map(([c, v]) => [c, clean(sheet.name, v)])
  const texts = (row: (typeof rows)[number]): string[] => cols(row).map(([, v]) => v)

  const [titleRow, subtitleRow, ...rest] = rows
  if (!titleRow || !subtitleRow) throw new Error('[COCKPIT] titre ou sous-titre absent')
  const titleAt = rest.findIndex(r => texts(r).length === 1 && texts(r)[0] === WHAT_I_KNOW)
  if (titleAt < 0) throw new Error(`[COCKPIT] « ${WHAT_I_KNOW} » introuvable`)

  const kpiRows = rest.slice(0, titleAt)
  if (kpiRows.length < 2 || kpiRows.length > 3)
    throw new Error(`[COCKPIT] bandeau d'indicateurs : ${kpiRows.length} lignes (2 ou 3 attendues)`)
  const [labels, values, captions] = kpiRows.map(cols)
  const kpis: CockpitKpi[] = labels.map(([col, label]) => {
    const value = values.find(([c]) => c === col)?.[1]
    if (value === undefined) throw new Error(`[COCKPIT] indicateur « ${label} » sans valeur`)
    const caption = captions?.find(([c]) => c === col)?.[1]
    return { label, value: /^\d+$/.test(value) ? Number(value) : value, ...(caption ? { caption } : {}) }
  })

  const knowledge: CockpitKnowledge[] = []
  const charts: CockpitChart[] = []
  let blankChartLabels = 0
  let current: CockpitChart | null = null
  let inKnowledge = true
  for (const row of rest.slice(titleAt + 1)) {
    const cells = cols(row)
    const only = cells.length === 1 ? cells[0] : undefined
    if (inKnowledge) {
      if (cells.length === 3) {
        knowledge.push({ rubric: cells[0][1], known: cells[1][1], meaning: cells[2][1] })
        continue
      }
      inKnowledge = false
    }
    // titre de graphique : une seule cellule, en colonne 2 (les lignes de données ont la valeur en colonne 3)
    if (only && only[0] === 2) {
      current = { title: only[1], items: [] }
      charts.push(current)
      continue
    }
    if (!current) throw new Error(`[COCKPIT] ligne ${row.n} hors de tout bloc : ${texts(row).join(' | ')}`)
    if (cells.length === 2 && cells[0][1] === 'Libellé' && cells[1][1] === 'Valeur') continue
    const valueCell = cells.find(([c]) => c === 3)
    if (!valueCell || cells.length > 2)
      throw new Error(`[COCKPIT] ligne ${row.n} de graphique illisible : ${texts(row).join(' | ')}`)
    const value = Number(valueCell[1].replace(',', '.'))
    if (!Number.isFinite(value))
      throw new Error(`[COCKPIT] valeur non numérique « ${valueCell[1]} » (graphique « ${current.title} »)`)
    const label = cells.find(([c]) => c === 2)?.[1]
    if (label === undefined) blankChartLabels += 1
    current.items.push({ label: label === undefined ? BLANK_LABEL : humanizeChartLabel(label), value })
  }
  if (knowledge.length === 0) throw new Error('[COCKPIT] aucune rubrique « ce que je sais »')
  return {
    title: texts(titleRow)[0],
    subtitle: texts(subtitleRow)[0],
    kpis,
    knowledge,
    charts,
    blankChartLabels,
  }
}
