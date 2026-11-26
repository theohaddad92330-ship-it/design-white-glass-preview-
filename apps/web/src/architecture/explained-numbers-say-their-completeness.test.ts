import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA — « EXPLIQUE-MOI CE CHIFFRE » NE PROMET RIEN QU'IL NE TIENNE (PDF 6 §5.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE PROTÉGÉE, ET ELLE EXISTAIT AVANT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux moitiés, et la seconde est celle qu'on retire en premier quand on est
 * pressé :
 *
 *  1. **un chiffre qui ne sait pas expliquer son calcul n'affiche pas le geste.**
 *     Un bouton qui ouvre un panneau vide se clique UNE fois, et l'utilisateur
 *     apprend que le geste ne sert à rien — y compris là où il servait ;
 *  2. **la ligne COMPLÉTUDE est obligatoire.** C'est la différence entre « la
 *     marge est de 28 % » et « la marge est de 28 % sur les 9 missions qui
 *     portent un coût chargé, 4 n'en ont pas ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'invente pas une règle : le type `NumberExplanation` rend déjà
 * `completeness` obligatoire, et `canExplainNumber` est déjà le seul juge du
 * geste. Elle vérifie que les DEUX restent branchés — qu'aucun écran ne monte le
 * bouton en court-circuitant le juge, et qu'aucun constructeur ne fabrique une
 * explication sans passer par la primitive de complétude.
 *
 * C'est exactement le défaut n°1 du dépôt appliqué à ce lot : « du code juste,
 * calculé, testé, que personne n'appelle » — ici, un juge que le bouton ne
 * consulterait plus.
 */

const WEB_SRC = join(__dirname, '..')
const TRIGGER = join(WEB_SRC, 'components', 'explain', 'ExplainedNumber.tsx')
const PANEL = join(WEB_SRC, 'components', 'explain', 'ExplainPanel.tsx')
const BUILDERS = join(WEB_SRC, 'components', 'explain', 'explanations.ts')

/**
 * Les écrans RÉELLEMENT dotés du geste, déclarés.
 *
 * ⚠️ Chaque chemin est vérifié sur le disque (leçon GA-38) : un registre qui
 * pointe à côté est un registre qui ne garde rien, et il reste vert pour
 * toujours.
 */
const WIRED_SCREENS: readonly string[] = [join(WEB_SRC, 'features', 'pilotage', 'view', 'FinancePanel.tsx')]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('le geste « explique » — ses trois pièces restent branchées', () => {
  it('la garde LIT quelque chose — les trois fichiers existent', () => {
    // Le faux zéro silencieux : sur des chemins inexistants, `readFileSync`
    // lèverait, mais un filtre mal écrit rendrait une liste vide et TOUT
    // passerait. On l'affirme donc explicitement.
    for (const file of [TRIGGER, PANEL, BUILDERS, ...WIRED_SCREENS]) {
      expect(existsSync(file), `chemin déclaré introuvable : ${file}`).toBe(true)
    }
    expect(WIRED_SCREENS.length).toBeGreaterThan(0)
  })

  it('le déclencheur CONSULTE le juge — il ne décide pas lui-même', () => {
    const source = stripComments(readFileSync(TRIGGER, 'utf8'))
    // ⚠️ L'APPEL, et non le seul nom. Une première version cherchait
    // `canExplainNumber` n'importe où : l'IMPORT à lui seul la satisfaisait, et
    // retirer l'appel de garde laissait la garde VERTE. Mesuré en cassant
    // volontairement le composant, ce qui est le seul moyen de le voir.
    expect(source).toMatch(/canExplainNumber\(/)
    // Et il rend l'enfant TEL QUEL quand il n'y a rien à expliquer : un geste
    // absent ne doit pas déplacer le chiffre.
    expect(source).toMatch(/return <>\{children\}<\/>/)
  })

  it('le déclencheur est un BOUTON — ce qui se clique se tabule (GA-35)', () => {
    const source = stripComments(readFileSync(TRIGGER, 'utf8'))
    expect(source).toContain('<button')
    expect(source).toContain('type="button"')
    // Un bouton sans texte porte un nom (GA-32).
    expect(source).toContain('aria-label')
    // Cible tactile en pointeur grossier (GA-30).
    expect(source).toMatch(/coarse:min-h-11/)
  })

  it('le panneau DÉLÈGUE la complétude — il ne recompose pas la phrase', () => {
    const source = stripComments(readFileSync(PANEL, 'utf8'))
    expect(source).toContain('<Completeness')
    // La part ne se recalcule pas ici : `deriveCompleteness` la porte, et deux
    // chemins qui refont la même division divergent (l'un arrondit, l'autre pas).
    expect(source).not.toMatch(/\*\s*100/)
    expect(source).not.toMatch(/Math\.round/)
  })

  it('le panneau rend les SIX lignes du §5.1, et pas cinq', () => {
    const source = stripComments(readFileSync(PANEL, 'utf8'))
    for (const row of ['formula', 'calculation', 'source', 'completeness', 'threshold', 'decision']) {
      expect(source, `ligne manquante : ${row}`).toContain(`rows.${row}`)
    }
  })

  it('CHAQUE constructeur pose une complétude — aucune explication nue', () => {
    const source = stripComments(readFileSync(BUILDERS, 'utf8'))
    const builders = source.match(/export function \w+Explanation\b/g) ?? []
    // Témoin positif : le détecteur voit bien les constructeurs. Sans lui, une
    // expression régulière fautive rendrait ce test vert pour toujours.
    expect(builders.length).toBeGreaterThanOrEqual(4)
    // Autant de `completeness:` que de constructeurs : chacun en pose une.
    const completeness = source.match(/completeness:\s*\{/g) ?? []
    expect(completeness.length).toBe(builders.length)
  })

  it('AUCUN constructeur ne fabrique un total à partir de rien', () => {
    // ⚠️ Le défaut que ça évite : `total: counted` écrirait « calculé sur toute
    // la population » sur un échantillon, ce qui est la promesse INVERSE de
    // celle de la primitive.
    const source = stripComments(readFileSync(BUILDERS, 'utf8'))
    expect(source).not.toMatch(/total:\s*counted\b/)
    expect(source).not.toMatch(/total:\s*0\b/)
  })

  it('SAIT DIRE NON : un écran qui monterait le bouton sans le juge se verrait', () => {
    // Le témoin négatif du détecteur ci-dessus. Sans lui, un `stripComments`
    // trop gourmand ou une regex fautive rendrait la garde muette.
    const withoutJudge = stripComments(`
      export function Bad() {
        return <button type="button">{value}</button>
      }
    `)
    expect(withoutJudge).not.toContain('canExplainNumber')
    expect(withoutJudge).toContain('<button')
  })

  it('chaque écran câblé passe par `ExplainedNumber` et jamais par le panneau nu', () => {
    for (const file of WIRED_SCREENS) {
      const source = stripComments(readFileSync(file, 'utf8'))
      expect(source, `${file} ne monte pas le geste`).toContain('ExplainedNumber')
      // Monter `ExplainPanel` directement court-circuiterait `canExplainNumber`
      // et rouvrirait le panneau vide que ce lot ferme.
      expect(source, `${file} monte le panneau sans son juge`).not.toContain('<ExplainPanel')
    }
  })
})
