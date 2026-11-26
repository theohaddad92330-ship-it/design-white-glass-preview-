/**
 * GA-338 — un dialogue ou un tiroir ne dit plus « Close » en français.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉE
 * ─────────────────────────────────────────────────────────────────────────
 * #1797 avait posé le mécanisme sans finir la famille : `DialogContent`
 * (`packages/ui/src/components/dialog.tsx`) acceptait déjà un `closeLabel`,
 * mais avec un défaut anglais « Close » — « pour ne pas rendre la prop
 * obligatoire sur les appelants existants ». Résultat mesuré sur
 * `origin/main` : 70 fichiers montent un `DialogContent` et UN SEUL passait
 * `closeLabel` ; `SheetContent` (`packages/ui/src/components/sheet.tsx`)
 * n'avait même pas la prop, et écrivait « Close » EN DUR dans son
 * `sr-only`. Environ quatre-vingt-quatorze croix de fermeture s'annonçaient
 * donc en anglais au lecteur d'écran, dans un produit dont la langue par
 * défaut est le français. Invisible à l'œil — le libellé est `sr-only` —
 * c'est exactement pour ça qu'il a survécu.
 *
 * Ce lot a traduit les appelants restants et retiré le défaut anglais des
 * deux composants (`closeLabel` est obligatoire sur `DialogContent`, et sur
 * `SheetContent` sauf quand `hideClose` est vrai — la croix ne s'y rend pas
 * du tout). Cette garde tient l'acquis : elle refuse qu'un nouvel appelant
 * revienne en arrière, soit en omettant `closeLabel`, soit en y écrivant un
 * littéral non traduit (`closeLabel="Close"` compilerait très bien).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE, ET CE QU'ELLE NE MESURE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Comme GA-32 (`accessible-names.test.ts`), l'extracteur de balise suit la
 * profondeur des accolades pour ne pas se couper à la flèche d'un
 * `onClick={() => …}`. Un `closeLabel={t('common:actions.close')}` compte
 * comme traduit ; un `closeLabel="Fermer"` ou `closeLabel='Close'` — une
 * chaîne entre guillemets collée directement après le `=`, sans accolade —
 * compte comme codé en dur, même s'il est en français : `packages/ui` n'a
 * pas d'i18n, donc un littéral ne suivra jamais un changement de langue.
 *
 * Un `<SheetContent hideClose>` est exempté : sans `hideClose`, la croix ne
 * se rend pas, et un nom qu'on ne lirait jamais mentirait pour rien — c'est
 * la même règle que le type l'impose déjà côté compilation.
 *
 * Les fichiers de TEST (`.test.tsx`) sont hors corpus, comme dans GA-32 :
 * un témoin (`FeedbackWidget.test.tsx` rend un `SheetContent` nu pour tester
 * autre chose — le compteur de tiroirs ouverts) ne doit pas compter comme un
 * appelant produit.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/**
 * Rend la balise ouvrante qui CONTIENT l'index donné — du `<` qui la commence
 * au `>` qui la ferme à profondeur d'accolades nulle. Copié de GA-32 : c'est
 * ce suivi de profondeur qui manquait à sa première version.
 */
function enclosingTag(source: string, index: number): string {
  const start = source.lastIndexOf('<', index)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return source.slice(start, i + 1)
  }
  return source.slice(start)
}

const TAG_NAMES = ['DialogContent', 'SheetContent'] as const

/** Chaque balise `<DialogContent …>` / `<SheetContent …>` du corpus. */
function closingTags(files: string[]): { file: string; tagName: (typeof TAG_NAMES)[number]; tag: string }[] {
  const out: { file: string; tagName: (typeof TAG_NAMES)[number]; tag: string }[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const tagName of TAG_NAMES) {
      const opener = `<${tagName}`
      let at = source.indexOf(opener)
      while (at !== -1) {
        const after = source[at + opener.length]
        if (after === undefined || !/[A-Za-z0-9_]/.test(after)) {
          out.push({ file: file.replace(/.*\/src\//, 'src/'), tagName, tag: enclosingTag(source, at + 1) })
        }
        at = source.indexOf(opener, at + 1)
      }
    }
  }
  return out
}

const HAS_CLOSE_LABEL = /closeLabel=/
const HARDCODED_CLOSE_LABEL = /closeLabel=["']/
const HIDES_CLOSE = /\bhideClose\b/

/** `null` quand la balise est en règle, sinon la raison du reproche. */
function offenseReason(tagName: string, tag: string): string | null {
  if (tagName === 'SheetContent' && HIDES_CLOSE.test(tag)) return null
  if (!HAS_CLOSE_LABEL.test(tag)) return 'sans closeLabel'
  if (HARDCODED_CLOSE_LABEL.test(tag)) return 'closeLabel codé en dur, pas traduit'
  return null
}

describe('GA-338 — un dialogue ou un tiroir ferme dans la langue de l’app', () => {
  const files = sourceFiles(SRC)

  it('aucun DialogContent ni SheetContent sans libellé de fermeture traduit', () => {
    const offenders = closingTags(files)
      .map(({ file, tagName, tag }) => {
        const reason = offenseReason(tagName, tag)
        return reason ? `${file} → ${tagName} (${reason}) : ${tag.slice(0, 80).replace(/\s+/g, ' ')}` : null
      })
      .filter((line): line is string => line !== null)
    expect(offenders, `dialogues/tiroirs sans libellé traduit :\n${offenders.join('\n')}`).toEqual([])
  })

  it('la garde LIT bien des DialogContent/SheetContent — sinon son zéro serait une panne, pas une mesure', () => {
    // Contrôle positif : sans lui, retirer les deux composants du dépôt
    // rendrait cette garde verte pour toujours.
    expect(closingTags(files).length).toBeGreaterThan(60)
  })

  it('elle sait dire NON — un appelant sans closeLabel, et un littéral non traduit, sont REPROCHÉS', () => {
    const missing = '<DialogContent className="max-w-lg">'
    const hardcoded = '<SheetContent side="right" closeLabel=\'Close\'>'
    expect(offenseReason('DialogContent', missing)).toBe('sans closeLabel')
    expect(offenseReason('SheetContent', hardcoded)).toBe('closeLabel codé en dur, pas traduit')
  })

  it("n'attrape pas ce qu'elle ne vise pas — les cas légitimes voisins", () => {
    // Le cas normal : une interpolation, y compris avec une flèche dedans,
    // le piège qui avait fait mentir la première version de GA-32.
    const translated =
      '<DialogContent closeLabel={t(\'common:actions.close\')} onKeyDown={e => handleKeyDown(e)} className="max-w-lg">'
    expect(offenseReason('DialogContent', translated)).toBeNull()

    // Un tiroir dont la croix ne se rend pas du tout n'a rien à traduire.
    const hidden = '<SheetContent hideClose side="right" className="p-0">'
    expect(offenseReason('SheetContent', hidden)).toBeNull()

    // Un fichier de test qui rend un SheetContent nu pour tester autre chose
    // (le compteur de tiroirs ouverts, GA-205) est hors corpus : il n'est
    // jamais lu par `sourceFiles`.
    const testWitness = files.find(f => f.endsWith('FeedbackWidget.test.tsx'))
    expect(testWitness).toBeUndefined()
  })
})
