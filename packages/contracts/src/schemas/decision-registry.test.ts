import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_DECISION_NUMBERS_AT_FREEZE,
  DECISION_SCOPES,
  KNOWN_AMBIGUOUS_DECISIONS,
  citeDecision,
  isAmbiguousDecision,
} from './decision-registry.js'

/**
 * GA-40 — un numéro de décision ne devient pas ambigu en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Vingt-cinq numéros désignent déjà deux décisions différentes selon le tracker
 * qu'on ouvre. On ne renumérote pas — ces numéros vivent dans des commits et
 * des commentaires — donc la seule chose qui puisse encore être protégée est
 * que le compte n'AUGMENTE pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE RECALCULE AU LIEU DE LIRE UNE LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une liste recopiée à la main vieillit, et c'est exactement le défaut que ce
 * chantier passe sa journée à corriger. Elle relit donc `agent_docs/` à chaque
 * exécution et compare les LIBELLÉS : deux trackers qui citent la même décision
 * ne comptent pas ; deux trackers qui donnent au même numéro des libellés
 * différents comptent.
 */

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
const AGENT_DOCS = join(REPO_ROOT, 'agent_docs')

/** Ressemblance grossière entre deux libellés. Suffisante pour distinguer
 *  « Board Missions : 6 ou 12 colonnes » d'un « Run fantôme » — c'est tout ce
 *  qu'on lui demande. */
function similar(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? [])
  const [x, y] = [words(a), words(b)]
  if (x.size === 0 || y.size === 0) return a.toLowerCase() === b.toLowerCase()
  const shared = [...x].filter(word => y.has(word)).length
  return shared / Math.min(x.size, y.size) > 0.5
}

/**
 * Une ligne dont le « libellé » n'est qu'un mot de statut — `| D7 | **TRANCHÉE** | … |`.
 *
 * ⚠️ Ajouté le 30/08/2026, et c'est une CORRECTION de mesure, pas un
 * assouplissement. Cette garde compare des LIBELLÉS pour savoir si un numéro
 * nomme deux décisions différentes. Depuis que `decisions-aout-2026.md` porte une
 * table de statut (GA-116), ses vingt-deux lignes offraient au parseur le mot
 * « TRANCHÉE » comme libellé de D7 — donc un second libellé, donc une fausse
 * ambiguïté. Un statut ne nomme aucune décision : il n'entre pas dans la
 * comparaison. Mesuré : sans ce filtre le compte passait de 25 à 36 ; avec, il
 * revient exactement aux mêmes 25, aux mêmes numéros. Le test
 * « le filtre de statut ne masque que des statuts » le prouve.
 */
const STATUS_ONLY = /^\*{0,2}(TRANCHÉE|PARTIELLE|OUVERTE|SUPPLANTÉE)\*{0,2}$/

/** Les définitions de décision trouvées dans les trackers : `| D42 | libellé |`. */
function decisionDefinitions(includeStatusRows = false): Map<string, { file: string; label: string }[]> {
  const found = new Map<string, { file: string; label: string }[]>()
  for (const name of readdirSync(AGENT_DOCS)) {
    if (!name.endsWith('.md')) continue
    for (const line of readFileSync(join(AGENT_DOCS, name), 'utf8').split('\n')) {
      const match = /^\|\s*\*{0,2}(D\d{1,3})\*{0,2}\s*\|\s*([^|]{6,120}?)\s*\|/.exec(line)
      if (!match) continue
      const label = (match[2] as string).replace(/\s+/g, ' ')
      if (!includeStatusRows && STATUS_ONLY.test(label)) continue
      const rows = found.get(match[1] as string) ?? []
      rows.push({ file: name, label })
      found.set(match[1] as string, rows)
    }
  }
  return found
}

function ambiguousNumbers(includeStatusRows = false): string[] {
  const out: string[] = []
  for (const [number, rows] of decisionDefinitions(includeStatusRows)) {
    const distinct: string[] = []
    for (const { label } of rows) {
      if (!distinct.some(seen => similar(label, seen))) distinct.push(label)
    }
    if (distinct.length > 1) out.push(number)
  }
  return out.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

describe('GA-40 — les numéros de décision', () => {
  it('lit un corpus non vide', () => {
    // Sans cette assertion, un chemin cassé ferait passer la garde au vert sur
    // zéro tracker — et le cliquet ne garderait plus rien.
    const definitions = decisionDefinitions()
    expect(definitions.size).toBeGreaterThan(50)
    expect(existsSync(AGENT_DOCS)).toBe(true)
  })

  it('le nombre de numéros ambigus ne remonte pas', () => {
    const ambiguous = ambiguousNumbers()
    expect(ambiguous.length).toBeLessThanOrEqual(AMBIGUOUS_DECISION_NUMBERS_AT_FREEZE)
  })

  it('le filtre de statut ne masque QUE des statuts', () => {
    // Un filtre qui retirerait une vraie ambiguïté rendrait le cliquet
    // décoratif. Preuve qu'il est narrow : tout numéro que le filtre écarte est
    // un numéro dont il ne reste QUE des lignes de statut — donc aucune
    // définition perdue. On lit aussi les lignes de statut pour prouver qu'elles
    // existent : sans elles, le filtre ne filtrerait rien et ce test serait
    // vert sur du vide.
    const withStatus = decisionDefinitions(true)
    const withoutStatus = decisionDefinitions(false)
    const statusRows = [...withStatus].flatMap(([number, rows]) =>
      rows
        .filter(row => /^\*{0,2}(TRANCHÉE|PARTIELLE|OUVERTE|SUPPLANTÉE)\*{0,2}$/.test(row.label))
        .map(row => `${number}@${row.file}`),
    )
    expect(statusRows.length).toBeGreaterThan(15)

    // Ce que le filtre laisse passer doit être EXACTEMENT ce qui n'est pas un
    // statut — comparé par valeur, jamais par identité d'objet : les deux appels
    // construisent des objets distincts, et `includes` sur des références aurait
    // rendu ce test vert quoi qu'il arrive.
    const key = (rows: { file: string; label: string }[]) => rows.map(row => `${row.file}::${row.label}`).sort()
    for (const [number, rows] of withStatus) {
      const kept = withoutStatus.get(number) ?? []
      expect(key(kept)).toEqual(key(rows.filter(row => !STATUS_ONLY.test(row.label))))
    }
  })

  it('la garde sait dire NON — elle en trouve réellement, et beaucoup', () => {
    // Preuve qu'elle mesure : si la détection tombait en panne, le test
    // précédent passerait au vert pour toujours.
    expect(ambiguousNumbers().length).toBeGreaterThan(10)
  })

  it('chaque chantier déclaré a son tracker sur le disque', () => {
    const missing = DECISION_SCOPES.filter(entry => !existsSync(join(REPO_ROOT, entry.tracker))).map(
      entry => entry.tracker,
    )
    expect(missing).toEqual([])
  })

  it('la liste indicative ne cite que des numéros réellement ambigus', () => {
    // Elle a le droit d'être incomplète — la garde recalcule — mais pas de
    // désigner un numéro qui ne pose aucun problème : ce serait une fausse
    // alerte permanente.
    const measured = new Set(ambiguousNumbers())
    const invented = KNOWN_AMBIGUOUS_DECISIONS.filter(number => !measured.has(number))
    expect(invented).toEqual([])
  })

  it('une citation nomme son chantier', () => {
    expect(citeDecision('tome1', 70)).toBe('D70 (tome1)')
    expect(isAmbiguousDecision(70)).toBe(true)
    // Et un numéro sans histoire reste citable seul.
    expect(isAmbiguousDecision(88)).toBe(false)
  })
})
