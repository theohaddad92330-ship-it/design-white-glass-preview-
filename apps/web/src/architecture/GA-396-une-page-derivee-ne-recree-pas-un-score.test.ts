import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-396 — #2143.26 (épopée #2924) : « une page dérivée ne recrée jamais sa
 * propre liste/statut/score/historique. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA TROUVAILLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────
 * En écrivant cette garde, `BadgeColorScore.ts` (aperçu de compte) recopiait
 * ses quatre couleurs de verdict EN DUR plutôt que de lire la source unique
 * (`ACCOUNT_VERDICT_COLOR`, `account-score.ts`) — et avait DÉRIVÉ : `NO-GO`
 * valait `#FF5E57` à cet endroit, `#EF4444` à la source. Trois écrans dérivés
 * (`AccountVerdictSummary`, `ScoreSummaryCard`, `BellumReadCard`) pouvaient
 * donc rendre un anneau d'une teinte différente du badge canonique pour le
 * MÊME verdict — exactement la « deuxième page qui recrée un score » que le
 * point interdit. Corrigé dans le même lot : `BadgeColorScore.ts` lit
 * maintenant `ACCOUNT_VERDICT_COLOR` (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET CE QU'ELLE NE VÉRIFIE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle cherche, dans TOUT `apps/web/src` hors `account-score.ts` lui-même,
 * un objet qui porte les QUATRE clés `GO`/`PRUDENT`/`NO-GO`/`EXPLORER`
 * associées CHACUNE à une valeur `#RRGGBB` littérale — la forme exacte d'une
 * seconde table de couleurs de verdict. Une valeur qui LIT
 * `ACCOUNT_VERDICT_COLOR` (comme `BadgeColorScore.ts` désormais) n'est pas
 * une recréation, elle passe.
 *
 * Elle ne vérifie PAS qu'aucune page ne recrée une LISTE ou un HISTORIQUE
 * (le reste du point #2143.26) — un texte libre `.tsx` ne dit pas de façon
 * fiable « ceci est UNE liste du dossier » sans un marqueur structurel que le
 * dépôt ne porte pas encore ; se limiter à un test qu'on peut vraiment tenir
 * (les quatre couleurs de verdict, une forme précise et grep-able) vaut mieux
 * qu'une garde qui prétend couvrir tout le point et n'en tient qu'un bout.
 */

const WEB_SRC = join(__dirname, '..')
const CANONICAL_FILE = 'account-score.ts'
const HEX = /#[0-9a-fA-F]{6}/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (
      ['.ts', '.tsx'].includes(extname(entry.name)) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    )
      out.push(path)
  }
  return out
}

/** Une seconde table de couleurs de verdict : les 4 clés, valeurs HEX littérales. */
function recreatesVerdictColorTable(code: string): boolean {
  const keys = ['GO', 'PRUDENT', "'NO-GO'", 'EXPLORER']
  if (!keys.every(key => code.includes(key))) return false
  // Chaque clé doit être suivie, à une distance raisonnable, d'une valeur HEX
  // littérale — sinon un fichier qui mentionne juste les quatre mots (une
  // légende, une doc) serait attrapé à tort.
  return keys.every(key => {
    const at = code.indexOf(key)
    return HEX.test(code.slice(at, at + 80))
  })
}

describe('#2143.26 — une page dérivée ne recrée pas la table de couleurs du verdict (GA-396)', () => {
  it('sait dire NON — et n’attrape pas une lecture de la source canonique', () => {
    const recreated = `const X = { GO: '#22C55E', PRUDENT: '#F59E0B', 'NO-GO': '#EF4444', EXPLORER: '#6366F1' }`
    expect(recreatesVerdictColorTable(recreated)).toBe(true)

    const reads = `const X = { GO: ACCOUNT_VERDICT_COLOR.GO, PRUDENT: ACCOUNT_VERDICT_COLOR.PRUDENT, 'NO-GO': ACCOUNT_VERDICT_COLOR['NO-GO'], EXPLORER: ACCOUNT_VERDICT_COLOR.EXPLORER }`
    expect(recreatesVerdictColorTable(reads)).toBe(false)

    const unrelated = `const words = ['GO', 'PRUDENT', "'NO-GO'", 'EXPLORER']`
    expect(recreatesVerdictColorTable(unrelated)).toBe(false)
  })

  it('aucun fichier hors account-score.ts ne recrée la table de couleurs du verdict', () => {
    const offenders = sourceFiles(WEB_SRC)
      .filter(path => !path.endsWith(CANONICAL_FILE))
      .filter(path => recreatesVerdictColorTable(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })
})
