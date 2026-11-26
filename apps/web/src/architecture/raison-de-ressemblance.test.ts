import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-260 — #1576 / #1632 — UNE RAISON DE RESSEMBLANCE NOMME UN COMPTE, ET NE
 * DIT JAMAIS « STACK PROCHE ».
 *
 * Numéro vérifié à l'intégration le 08/09/2026 : GA-259
 * (`market-coverage-is-not-outsourcing.test.ts`) était le plus haut existant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET QUI L'A ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * #1632, mot pour mot : « Ne pas appeler : "stack proche". » Et le libellé qu'il
 * prescrit à la place : « Environnement technologique proche de Thales : Java,
 * C++, Python » — le compte de RÉFÉRENCE nommé, les technologies LISTÉES.
 *
 * Ce n'est pas une préférence de style. « Stack proche » ne dit pas ce qui
 * rapproche deux comptes : ni de quel compte on parle, ni sur quoi. C'est très
 * exactement le défaut que les deux retours signalent — trois cartes qui portent
 * la même phrase creuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE, ALORS QUE DES TESTS DE COMPOSANT EXISTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un libellé se réécrit à la main, dans un fichier de traduction, par quelqu'un
 * qui n'a jamais lu #1632 — et aucun test de rendu ne tombe si les deux langues
 * bougent ensemble. C'est le mode de disparition normal d'une règle de
 * vocabulaire.
 *
 * ⚠️ **Une garde protège une règle, elle ne se contente pas d'en interdire le
 * contraire** (leçon de GA-259). Elle vérifie donc AUSSI que le libellé prescrit
 * EXISTE, dans les deux langues, avec ses deux interpolations.
 */

const WEB_SRC = join(__dirname, '..')
const FR = join(WEB_SRC, 'i18n', 'locales', 'fr', 'accounts.json')
const EN = join(WEB_SRC, 'i18n', 'locales', 'en', 'accounts.json')
const FEATURE_FILES = [
  join(WEB_SRC, 'features', 'accounts', 'view', 'accounts-list', 'SimilarAccountContainer.tsx'),
  join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'sections', 'AccountSimilarContainer.tsx'),
  join(WEB_SRC, 'features', 'accounts', 'model', 'similarHeadline.ts'),
]

/**
 * Le VOISIN LÉGITIME — le témoin de la troisième preuve.
 *
 * `similarProximity.ts` parle de proximité, de critères et de score sur toute sa
 * longueur, et c'est sa raison d'être : il traduit `score_similarity` en un
 * NIVEAU nommé, ce qui est précisément la règle « jamais un score nu » appliquée.
 * Une garde qui l'attraperait serait trop gourmande.
 */
const LEGITIMATE_NEIGHBOUR = join(WEB_SRC, 'features', 'accounts', 'model', 'similarProximity.ts')

/** Retire les commentaires AVANT de lire — une garde ne lit pas sa propre
 *  justification (les fichiers ci-dessus CITENT l'expression interdite pour
 *  expliquer pourquoi elle l'est). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Toutes les valeurs de chaînes d'un catalogue, à plat. */
function labelValues(path: string): string[] {
  const out: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      out.push(node)
      return
    }
    if (node && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(JSON.parse(readFileSync(path, 'utf8')))
  return out
}

/** Les deux formulations interdites, dans les deux langues. */
const FORBIDDEN = [/stack\s+proche/i, /close\s+stack/i, /stack\s+match/i]

describe('GA-260 — la garde LIT quelque chose', () => {
  it('trouve les catalogues et les fichiers qu’elle surveille', () => {
    for (const path of [FR, EN, LEGITIMATE_NEIGHBOUR, ...FEATURE_FILES]) {
      expect(existsSync(path), `corpus manquant : ${path}`).toBe(true)
    }
    // Un catalogue vide passerait tous les interdits sans rien prouver.
    expect(labelValues(FR).length).toBeGreaterThan(50)
    expect(labelValues(EN).length).toBeGreaterThan(50)
  })
})

describe('GA-260 — l’INTERDIT : jamais « stack proche »', () => {
  it('aucun libellé, dans aucune des deux langues, n’emploie l’expression', () => {
    for (const [langue, path] of [
      ['fr', FR],
      ['en', EN],
    ] as const) {
      for (const value of labelValues(path)) {
        for (const pattern of FORBIDDEN) {
          expect(pattern.test(value), `libellé ${langue} interdit par #1632 : « ${value} »`).toBe(false)
        }
      }
    }
  })

  it('aucun composant de la ressemblance ne l’écrit en dur', () => {
    for (const path of FEATURE_FILES) {
      const source = stripComments(readFileSync(path, 'utf8'))
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(source), `${path} emploie une expression interdite par #1632`).toBe(false)
      }
    }
  })

  it('n’attrape PAS le voisin légitime — la troisième preuve', () => {
    const source = stripComments(readFileSync(LEGITIMATE_NEIGHBOUR, 'utf8'))
    // Il parle de proximité et de score sur toute sa longueur, et il doit rester
    // vert : la garde vise une EXPRESSION, pas un champ lexical.
    expect(source).toMatch(/similarProximity|SimilarProximity|score/i)
    for (const pattern of FORBIDDEN) expect(pattern.test(source)).toBe(false)
  })
})

describe('GA-260 — la PREUVE POSITIVE : le libellé prescrit existe et NOMME', () => {
  const headlineKeys = ['similarHeadlineTwin', 'similarHeadlineTech', 'similarHeadlineSector'] as const

  it('les trois raisons existent dans les DEUX langues', () => {
    for (const path of [FR, EN]) {
      const sidebar = JSON.parse(readFileSync(path, 'utf8')).sidebar as Record<string, string>
      for (const key of headlineKeys) {
        expect(typeof sidebar[key], `${key} manquant dans ${path}`).toBe('string')
      }
    }
  })

  it('chaque raison NOMME le compte de référence, en gras', () => {
    for (const path of [FR, EN]) {
      const sidebar = JSON.parse(readFileSync(path, 'utf8')).sidebar as Record<string, string>
      for (const key of headlineKeys) {
        // `<account>{{account}}</account>` : l'interpolation ET la balise de mise
        // en gras. Sans la balise, le nom se noie dans la phrase ; sans
        // l'interpolation, la phrase ne nomme personne — le défaut d'origine.
        expect(sidebar[key], `${key} (${path}) doit nommer le compte de référence`).toMatch(
          /<account>\{\{account\}\}<\/account>/,
        )
      }
    }
  })

  it('la raison technologique LISTE les technologies, elle ne les résume pas', () => {
    for (const path of [FR, EN]) {
      const sidebar = JSON.parse(readFileSync(path, 'utf8')).sidebar as Record<string, string>
      expect(sidebar.similarHeadlineTech).toMatch(/\{\{technologies\}\}/)
    }
  })

  it('le composant REND les trois clés — un libellé que rien n’affiche ne garde rien', () => {
    const card = readFileSync(FEATURE_FILES[0]!, 'utf8')
    for (const key of headlineKeys) {
      expect(card, `${key} n'est rendu nulle part`).toContain(`sidebar.${key}`)
    }
  })
})
