import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CREDIT_WEIGHTS } from '@bellum/contracts'

/**
 * GA-210 — le coût du planificateur d'enrichissement vient de CREDIT_WEIGHTS,
 * jamais d'un nombre recopié dans le code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le site a déjà annoncé « 1 crédit » pour une analyse débitée 8
 * (`apps/website/src/messages-credit-truth.test.ts`) — la garde qui l'empêche
 * IMPORTE `CREDIT_WEIGHTS` au lieu de recopier le nombre. Le planificateur
 * d'enrichissement de l'organigramme (§11 FINAL) porte le MÊME risque, sous une
 * autre forme : la maquette `05_planificateur_enrichissement.png` affiche
 * « 50 contacts ≈ 6 crédits » — un chiffre DÉCORATIF de maquette, jamais
 * recalculé. Un développeur pressé qui recopierait ce « 6 » directement dans
 * `org-enrichment-planner.service.ts` produirait EXACTEMENT le défaut du site :
 * un coût affiché qui ne correspond à aucun débit réel (ici, `targeted_refresh`
 * plafonné à 3 crédits par vague, jamais 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur le code SOURCE (commentaires et chaînes retirés) des deux fichiers qui
 * calculent ou débitent un coût du planificateur :
 *  1. `creditCostOf` est IMPORTÉ depuis `@bellum/contracts` — et ce nom résolu
 *     réellement (`CREDIT_WEIGHTS.targeted_refresh` existe, n'est pas halluciné) ;
 *  2. `creditCostOf` est APPELÉ au moins une fois — l'import seul ne suffirait
 *     pas, un import inutilisé à côté d'un nombre recopié tromperait un lecteur
 *     pressé ;
 *  3. AUCUNE propriété dont le nom contient « credit » ou « cost » ne reçoit un
 *     LITTÉRAL numérique en affectation directe (`estimatedCredits: 6`,
 *     `creditsDebited = 6`) — un tel littéral ne peut être QUE recopié, jamais
 *     calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle LIT quelque chose → vérifie que les deux fichiers existent, ne sont
 *    pas vides, et que `creditCostOf` s'y appelle un nombre de fois cohérent
 *    avec ce qui est mesuré en dur ci-dessous (pas un `> 0` complaisant) ;
 *  · elle SAIT DIRE NON → soumise à un extrait de code fabriqué qui recopie
 *    « 6 » comme le ferait la maquette, elle le détecte et NOMME la ligne.
 */

const ANALYSIS_DIR = join(__dirname, '..', 'modules', 'analysis')
const PLANNER_FILE = join(ANALYSIS_DIR, 'org-enrichment-planner.service.ts')
const TARGETING_FILE = join(ANALYSIS_DIR, 'org-enrichment-targeting.ts')

/** Retire commentaires et chaînes — même technique que GA-49 (web), portée
 *  ici : sans elle, un commentaire citant « 6 crédits » ferait mentir la garde
 *  dans un sens ou dans l'autre. */
function stripNonCode(src: string): string {
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const char = src[i] as string
    const next = src[i + 1]
    if (char === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      out.push(' '.repeat(stop - i))
      i = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      for (const c of src.slice(i, stop)) out.push(c === '\n' ? '\n' : ' ')
      i = stop
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== char) {
        if (src[j] === '\\') j += 1
        j += 1
      }
      const stop = Math.min(j + 1, src.length)
      for (const c of src.slice(i, stop)) out.push(c === '\n' ? '\n' : ' ')
      i = stop
      continue
    }
    out.push(char)
    i += 1
  }
  return out.join('')
}

/**
 * Un littéral numérique affecté directement à une clé « credit… » ou
 * « cost… ». EXCLUT délibérément `let x = 0` / `const x = 0` — l'amorce d'un
 * accumulateur (`let credits = 0; …; credits += creditCostOf(...)`) n'est pas
 * un chiffre recopié, c'est zéro AVANT calcul. Un littéral NON-ZÉRO à cette
 * même position (`let credits = 6`) resterait détecté — c'est lui, le risque.
 */
function hardcodedCreditLiterals(code: string): string[] {
  const re = /\b([A-Za-z_]*(?:credit|Credit|cost|Cost)[A-Za-z_]*)\s*([:=])\s*(\d+)\b/g
  const hits: string[] = []
  for (const match of code.matchAll(re)) {
    const [, name, operator, digits] = match
    if (operator === '=' && digits === '0') continue // amorce d'accumulateur, pas un coût recopié
    hits.push(`${name}: ${digits}`)
  }
  return hits
}

function callsCreditCostOf(code: string): number {
  return [...code.matchAll(/\bcreditCostOf\s*\(/g)].length
}

/** Vérifiée sur la source BRUTE, jamais sur `stripNonCode(...)` : cette
 *  dernière blanchit le CONTENU des chaînes (donc `'@bellum/contracts'`),
 *  précisément ce que ce motif doit encore pouvoir lire. */
function importsCreditCostOf(rawSource: string): boolean {
  return /import\s*\{[^}]*\bcreditCostOf\b[^}]*\}\s*from\s*['"]@bellum\/contracts['"]/.test(rawSource)
}

describe('GA-210 — le coût du planificateur vient de CREDIT_WEIGHTS, jamais recopié', () => {
  it('CREDIT_WEIGHTS.targeted_refresh existe réellement — la garde ne teste pas un nom halluciné', () => {
    expect(typeof CREDIT_WEIGHTS.targeted_refresh).toBe('number')
  })

  it('les deux fichiers du planificateur importent ET appellent creditCostOf', () => {
    const plannerRaw = readFileSync(PLANNER_FILE, 'utf8')
    expect(importsCreditCostOf(plannerRaw)).toBe(true)
    expect(callsCreditCostOf(stripNonCode(plannerRaw))).toBeGreaterThanOrEqual(2) // computeWaves + confirmWave

    const targetingCode = stripNonCode(readFileSync(TARGETING_FILE, 'utf8'))
    // Le ciblage lui-même ne facture rien — il ne DOIT PAS appeler creditCostOf,
    // sinon deux endroits calculeraient un coût (GA-26 : un réglage, un endroit).
    expect(callsCreditCostOf(targetingCode)).toBe(0)
  })

  it('aucun littéral numérique recopié sur une clé credit*/cost*, dans les deux fichiers', () => {
    const offenders = [PLANNER_FILE, TARGETING_FILE].flatMap(file => {
      const code = stripNonCode(readFileSync(file, 'utf8'))
      return hardcodedCreditLiterals(code).map(hit => `${file} → ${hit}`)
    })
    expect(offenders).toEqual([])
  })

  it('sait dire NON — le « 6 crédits » de la maquette, recopié en dur, est détecté', () => {
    const decoratedFromMockup = `
      function estimate() {
        return { estimatedCredits: 6, waveSize: 50 }
      }
    `
    expect(hardcodedCreditLiterals(stripNonCode(decoratedFromMockup))).toEqual(['estimatedCredits: 6'])
  })

  it('sait dire NON — un débit recopié en affectation est détecté aussi', () => {
    const hardcodedAssignment = `
      let creditsDebited = 6
    `
    expect(hardcodedCreditLiterals(stripNonCode(hardcodedAssignment))).toEqual(['creditsDebited: 6'])
  })

  it('n’accuse pas un calcul RÉEL — creditCostOf(...) et une variable ne sont pas des littéraux', () => {
    const real = `
      const cost = creditCostOf('targeted_refresh', { perimeterUnits: size })
      credits += cost
      return { estimatedCredits: measured(credits) }
    `
    expect(hardcodedCreditLiterals(stripNonCode(real))).toEqual([])
  })

  it('n’accuse pas un commentaire qui CITE un nombre de crédits', () => {
    const commented = `
      // sur cette maquette, 50 contacts affichaient 6 crédits (chiffre décoratif)
      const x = 1
    `
    expect(hardcodedCreditLiterals(stripNonCode(commented))).toEqual([])
  })
})
