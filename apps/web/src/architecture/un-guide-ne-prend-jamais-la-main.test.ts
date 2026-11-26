import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-371 — LE GUIDE MONTRE, IL NE PREND JAMAIS LA MAIN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET LES TROIS REPROCHES QU'ELLE REPREND
 * ─────────────────────────────────────────────────────────────────────────────
 * #2212.38 « ne bloque jamais toute l'application », #2212.39 « ne fait jamais
 * planter la page », #2212.40 « ne laisse jamais un overlay impossible à
 * fermer ». Ce sont les trois contraintes NÉGATIVES du socle, et elles disent la
 * même chose que le reproche nommé dans `ProductTourDialog.tsx:9-19` (#1787)
 * contre les visites guidées du marché : *elles volent le focus et cassent la
 * tabulation*.
 *
 * Une contrainte négative est la plus facile à croire tenue sans l'être : rien
 * ne la rappelle au moment où on ajoute une ligne. D'où cette garde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET POURQUOI C'EST DU TEXTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le module du guide et y cherche des gestes PRÉCIS qui prendraient la
 * main : déplacer le focus (`.focus()`, `autoFocus`), l'enfermer
 * (`aria-modal`, un piège de tabulation), ou capter la page entière. Un test de
 * comportement ne dirait « le focus n'a pas bougé » que sur le chemin qu'il
 * emprunte ; la lecture, elle, couvre tous les chemins du module, y compris
 * ceux que personne n'a encore écrits.
 *
 * ⚠️ Elle ne vise QUE `features/guide` : chercher `.focus()` dans tout le web
 * accuserait des dizaines de composants légitimes — un champ qui prend le focus
 * quand on ouvre un formulaire est juste. Une garde qui attrape ce qu'elle ne
 * vise pas accuse le bien.
 *
 * ⚠️ Elle retire les COMMENTAIRES avant de chercher : ce fichier-ci et le
 * docblock du spotlight parlent abondamment de « focus » pour expliquer qu'on
 * n'y touche pas. Une garde qui lit la prose accuse le bien qui s'explique.
 */

const GUIDE_MODULE = join(__dirname, '../features/guide')

/** Retire blocs et lignes de commentaire — on juge le CODE, pas son exposé. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function moduleFiles(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
      out.push({ file: full, code: stripComments(readFileSync(full, 'utf8')) })
    }
  }
  walk(GUIDE_MODULE)
  return out
}

const FILES = moduleFiles()
const SPOTLIGHT = join(GUIDE_MODULE, 'GuideSpotlight.tsx')

describe('GA-371 — le guide montre, il ne prend jamais la main', () => {
  it('a quelque chose à lire', () => {
    expect(FILES.length).toBeGreaterThan(0)
    expect(FILES.some(({ file }) => file === SPOTLIGHT)).toBe(true)
  })

  /** #1787 — « elles volent le focus ». */
  it('ne déplace jamais le focus', () => {
    const offenders = FILES.filter(({ code }) => /\.focus\(\)|autoFocus/.test(code)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  /** #1787 — « elles cassent la tabulation ». #2212.40 — jamais enfermé. */
  it('n’enferme jamais la tabulation', () => {
    const offenders = FILES.filter(({ code }) => /aria-modal|FocusTrap|focus-trap|tabIndex={-1}/.test(code)).map(
      ({ file }) => file,
    )
    expect(offenders).toEqual([])
  })

  /**
   * #2212.38 — le voile assombrit, il n'intercepte pas. Sans
   * `pointer-events-none`, une surcouche `fixed inset-0` avale TOUS les clics du
   * produit : c'est littéralement « le guide bloque l'application », et ça ne se
   * voit pas à la relecture puisque rien n'a l'air d'être ajouté.
   */
  it('laisse le produit cliquable : la surcouche ne capte rien', () => {
    const code = FILES.find(({ file }) => file === SPOTLIGHT)?.code ?? ''
    expect(code).toMatch(/pointer-events-none[^"']*fixed inset-0|fixed inset-0[^"']*pointer-events-none/)
  })

  /**
   * #2212.40 — la sortie existe, et par les DEUX chemins : la touche Échap pour
   * le clavier, un bouton étiqueté pour le pointeur. Un seul des deux laisserait
   * quelqu'un enfermé.
   */
  it('offre toujours une sortie, au clavier comme au pointeur', () => {
    const code = FILES.find(({ file }) => file === SPOTLIGHT)?.code ?? ''
    expect(code).toContain("'Escape'")
    expect(code).toMatch(/onClick=\{onClose\}/)
    expect(code).toMatch(/aria-label=\{t\('bubble\.close'\)\}/)
  })

  /**
   * #2212.39 — un guide ne fait pas planter la page. Une exception levée dans le
   * module remonterait dans un effet React et emporterait l'écran ; le socle
   * rend des verdicts (`absent`, avec sa raison), il ne lève pas.
   */
  it('ne lève jamais d’exception', () => {
    const offenders = FILES.filter(({ code }) => /\bthrow\b/.test(code)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })
})
