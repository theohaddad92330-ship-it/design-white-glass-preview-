/**
 * GA-108 — un quotient ne ment jamais sur zéro, ni au calcul ni à l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET D'OÙ ELLE VIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur absente ne s'affiche JAMAIS “0” » est dans le dépôt depuis des
 * mois, et elle est tenue au calcul : un taux sans dénominateur vaut `null`.
 * Cette garde ferme le trou d'à côté, mesuré en recette live sur la PRODUCTION
 * le 30/08/2026, écran `/pilotage`, carte « Qualité Bellum » :
 *
 *     Taux de correction   0 %
 *     Éléments corrigés    12
 *
 * Douze corrections ne font pas un taux nul. Le dénominateur était bien là
 * (2 500 contacts environ), le quotient valait 0,48 % — et il ressortait à `0`
 * parce que la dérivation ARRONDISSAIT au centième avant de le rendre, puis
 * l'écran arrondissait une seconde fois à l'entier. Deux arrondis, et un zéro
 * qu'aucune mesure n'avait produit, affiché avec l'autorité d'une mesure.
 *
 * Deux énoncés, donc, et ils sont distincts :
 *
 *  1. **arrondir est une décision d'AFFICHAGE.** Une dérivation qui arrondit
 *     détruit l'information avant que quiconque ait pu choisir quoi en faire ;
 *  2. **« 0 % » est une affirmation** — « rien, pas une seule fois ». Elle est
 *     réservée au taux réellement nul. Un taux non nul qui s'arrondirait à zéro
 *     s'écrit « < 1 % ».
 *
 * ⚠️ Et le refus symétrique compte autant : « 0 réponse sur 300 emails » DOIT
 * rester « 0 % ». Écrire « non mesuré » à la place d'un vrai zéro ment tout
 * autant, et efface exactement le décrochage que la chaîne existe pour crier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE — ET CE QU'ELLE NE SAIT PAS LIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre choses, dont deux par EXÉCUTION du vrai code (une garde qui ne lit que
 * des expressions régulières se contente de la forme) :
 *   1. la dérivation `measuredRate` est définie une SEULE fois, et elle
 *      n'arrondit pas ;
 *   2. elle se comporte comme la règle le dit — sur les cas exacts de la recette ;
 *   3. le formateur d'écran distingue « 0 % » de « < 1 % » ;
 *   4. aucun écran du pilotage ne refait un pourcentage à la main.
 *
 * Ce qu'elle NE vérifie PAS : **elle ne sait pas reconnaître une division dans
 * du code.** `a / b` ne se distingue d'aucune autre division par une expression
 * régulière honnête. Un écran neuf qui calculerait son propre taux passera donc
 * ici. Ce que la garde empêche, c'est qu'on DÉBRANCHE la dérivation partagée là
 * où elle est posée, qu'on lui remette un arrondi, ou qu'on recopie le
 * formatage ailleurs dans le pilotage.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { measuredRate } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { formatRate } from '@/features/pilotage/view/chain-reading'

const WEB_SRC = join(__dirname, '..')
const CONTRACTS_SRC = join(WEB_SRC, '..', '..', '..', 'packages', 'contracts', 'src')
const PILOTAGE = join(WEB_SRC, 'features', 'pilotage')

/** Le seul endroit du pilotage qui a le droit d'écrire un pourcentage. */
const FORMATTER = join(PILOTAGE, 'view', 'chain-reading.ts')

/** Le pourcentage écrit à la main : `Math.round(quelque chose * 100)`. */
const HAND_ROLLED_PERCENT = /Math\.round\([^)]*\*\s*100\)/

/** Un `t` de test : il rend la clé, sans i18n runtime. */
const t = (key: string, options?: Record<string, unknown>) =>
  options && 'value' in options ? `${key}:${String(options.value)}` : key

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/**
 * ⚠️ Les commentaires sont retirés AVANT tout comptage.
 *
 * Le dépôt a payé ce défaut plusieurs fois. Ici il serait certain : ce fichier,
 * `chain-reading.ts` et `measurability.ts` CITENT tous les trois la ligne
 * fautive `${Math.round(x * 100)} %` pour expliquer ce qu'ils corrigent. Sans ce
 * retrait, EXPLIQUER la règle la violerait.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const contractFiles = sourceFiles(CONTRACTS_SRC)
const pilotageFiles = sourceFiles(PILOTAGE).filter(file => !file.includes('.test.'))

describe('GA-108 — la garde LIT un corpus réel', () => {
  it('atteint le paquet de contrats et la feature pilotage', () => {
    // Un chemin relatif faux ne produit pas d'erreur : il produit zéro fichier,
    // et tout ce qui suit passerait au vert sans avoir rien lu (GA-38, GA-26).
    expect(contractFiles.length).toBeGreaterThan(50)
    expect(pilotageFiles.length).toBeGreaterThan(10)
    expect(existsSync(FORMATTER), 'le formateur de taux a disparu').toBe(true)
  })
})

describe('GA-108 — la dérivation vit à un seul endroit, et elle n’arrondit pas', () => {
  it('`measuredRate` n’est DÉFINIE qu’une fois', () => {
    const definitions = contractFiles.filter(file => /export function measuredRate\b/.test(readFileSync(file, 'utf8')))
    expect(definitions.length).toBe(1)
  })

  it('elle n’ARRONDIT pas — c’est l’écran qui arrondit', () => {
    // Le défaut exact : `Math.round((n / d) * 100) / 100` posé dans la
    // dérivation faisait ressortir 0,48 % à `0`.
    const [home] = contractFiles.filter(file => /export function measuredRate\b/.test(readFileSync(file, 'utf8')))
    const body = stripComments(readFileSync(home, 'utf8')).split('export function measuredRate')[1]?.slice(0, 600) ?? ''
    expect(body).toContain('denominator <= 0')
    expect(body).not.toMatch(/Math\.round|toFixed|toPrecision/)
  })

  it('elle se comporte comme la règle le dit — sur les cas EXACTS de la recette', () => {
    // Douze corrections sur 2 500 contacts : strictement positif, jamais zéro.
    expect(measuredRate(12, 2500)).toBeGreaterThan(0)
    // Une division par rien n'est pas une mesure.
    expect(measuredRate(0, 0)).toBeNull()
    expect(measuredRate(4, null)).toBeNull()
    // Et le refus symétrique : un vrai zéro reste un vrai zéro.
    expect(measuredRate(0, 300)).toBe(0)
  })
})

describe('GA-108 — « 0 % » reste une affirmation, pas un arrondi', () => {
  it('un taux strictement positif ne s’écrit JAMAIS « 0 % »', () => {
    for (const value of [12 / 2500, 1 / 301, 0.0001, 0.00499]) {
      expect(formatRate(value, t), String(value)).not.toBe('rate.exact:0')
    }
  })

  it('un taux VRAIMENT nul s’écrit bien « 0 % » — l’inverse serait le même défaut', () => {
    expect(formatRate(0, t)).toBe('rate.exact:0')
  })

  it('et « 100 % » ne s’écrit pas non plus sur un taux qui n’est pas plein', () => {
    expect(formatRate(0.999, t)).not.toBe('rate.exact:100')
    expect(formatRate(1, t)).toBe('rate.exact:100')
  })
})

describe('GA-108 — personne ne refait le pourcentage à la main', () => {
  const handRolled = pilotageFiles.filter(
    file => file !== FORMATTER && HAND_ROLLED_PERCENT.test(stripComments(readFileSync(file, 'utf8'))),
  )

  it('aucun écran du pilotage n’écrit son propre `Math.round(x * 100)`', () => {
    // Trois le faisaient : la chaîne commerciale, le pipeline du CRM et le taux
    // d'intercontrat. Trois copies de la même ligne, aucune ne traitant le taux
    // qui s'arrondit à zéro — et le pipeline, lui, ne l'arrondissait même pas
    // au même endroit que la chaîne.
    expect(handRolled).toEqual([])
  })

  it('le détecteur voit bien quelque chose — témoin positif sur le formateur', () => {
    // Sans ce témoin, une faute de frappe dans l'expression régulière rendrait
    // le test ci-dessus vert pour toujours.
    expect(HAND_ROLLED_PERCENT.test(stripComments(readFileSync(FORMATTER, 'utf8')))).toBe(true)
  })
})
