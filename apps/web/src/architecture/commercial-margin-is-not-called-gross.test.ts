/**
 * #2575 — « marge brute » désignait en réalité la marge COMMERCIALE.
 *
 * Le chiffre rendu par `GET delivery/finance/margin` (`aggregateMargin`,
 * packages/contracts/src/schemas/revenue.ts:174) est un niveau COMMERCIAL :
 * Σ(TJM vente × jours) − Σ(coût chargé × jours), sur Σ(TJM vente × jours).
 * Le moteur (`mission-margin-engine.ts:200`) nomme trois niveaux distincts —
 * `commercial` / `gross` / `contribution` — et sa marge BRUTE retire EN PLUS
 * la sous-traitance au forfait, les frais de mission, les factures fournisseur
 * et la commission partenaire (mission-margin-engine.ts:373-420). Les deux
 * écrans qui affichaient `aggregateMargin` sous le mot « brute »/« gross »
 * disaient donc un nombre plus favorable que la réalité, sous le mauvais nom.
 *
 * Décision de Louis (18/09/2026) : on renomme le libellé, on NE TOUCHE PAS au
 * calcul ni au seuil d'alerte. Cette garde vérifie que le renommage tient et
 * qu'il ne dérive pas :
 *  1. les libellés qui portent `aggregateMargin` (tuile de suivi de mission,
 *     bloc `finance.margin` du pilotage) ne disent plus « brute »/« gross » —
 *     ni dans la valeur affichée, ni dans le nom de la clé ;
 *  2. les libellés qui portent RÉELLEMENT le niveau brut du moteur
 *     (missions.json → `engine.levels.gross`) continuent de le dire — ce
 *     sont eux qui ont raison, la garde ne doit pas les attraper aussi.
 *
 * Elle lit le contenu réel des fichiers de traduction via `@/i18n/resources`
 * (le même import que la garde de parité FR/EN, `i18n/parity.test.ts`),
 * jamais une regex sur le disque : un import qui ne pointe plus vers le bon
 * fichier resterait invisible autrement.
 */
import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'

const SAYS_GROSS_OR_BRUTE = /\b(brute|gross)\b/i

function flattenStrings(tree: Record<string, unknown>, prefix = ''): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.push([path, value])
    else if (value && typeof value === 'object') out.push(...flattenStrings(value as Record<string, unknown>, path))
  }
  return out
}

describe('#2575 — le libellé d’aggregateMargin ne dit plus « brute »/« gross »', () => {
  it.each(['fr', 'en'] as const)(
    'la tuile de suivi de mission (missionTracking.tiles, %s) ne dit plus « brute »/« gross »',
    lang => {
      const missionTracking = resources[lang].missionTracking as unknown as { tiles: Record<string, string> }
      const tiles = missionTracking.tiles

      expect(tiles.commercialMargin, `missionTracking.tiles.commercialMargin manque en ${lang}`).toBeDefined()
      expect(tiles.commercialMarginFor, `missionTracking.tiles.commercialMarginFor manque en ${lang}`).toBeDefined()
      expect(tiles.commercialMargin).not.toMatch(SAYS_GROSS_OR_BRUTE)
      expect(tiles.commercialMarginFor).not.toMatch(SAYS_GROSS_OR_BRUTE)

      // La CLÉ elle-même ne dit plus "gross" — sinon le défaut revit dans le
      // code au tour suivant, sous un libellé qui dit « commerciale ».
      expect(Object.keys(tiles)).not.toContain('grossMargin')
      expect(Object.keys(tiles)).not.toContain('grossMarginFor')
    },
  )

  it.each(['fr', 'en'] as const)(
    'les libellés finance.margin.* du pilotage (aggregateMargin, %s) ne disent pas « brute »/« gross »',
    lang => {
      const pilotage = resources[lang].pilotage as unknown as { finance: { margin: Record<string, unknown> } }
      const flat = flattenStrings(pilotage.finance.margin)

      // Preuve que la garde LIT quelque chose : un corpus vide serait vert
      // pour rien (mesuré : six gardes vertes-pour-rien en deux jours).
      expect(flat.length, `finance.margin est vide en ${lang} — la garde ne lit rien`).toBeGreaterThan(0)

      for (const [key, value] of flat) {
        expect(value, `finance.margin.${key} (${lang}) dit encore « brute »/« gross »`).not.toMatch(SAYS_GROSS_OR_BRUTE)
      }
    },
  )

  it('témoin légitime : missions.json (le niveau BRUT du moteur) continue de dire « brute »/« gross »', () => {
    // Ce cas ne doit JAMAIS être attrapé par cette garde : le moteur nomme
    // vraiment trois niveaux, et son niveau `gross` retire des postes en plus
    // du niveau commercial. S'il cessait de dire « brute », ce serait une
    // régression inverse — quelqu'un aurait blanchi le mot partout à la fois.
    const fr = resources.fr.missions as unknown as {
      finance: { engine: { levels: { gross: string }; deductions: string } }
    }
    const en = resources.en.missions as unknown as {
      finance: { engine: { levels: { gross: string } } }
    }

    expect(fr.finance.engine.levels.gross).toMatch(SAYS_GROSS_OR_BRUTE)
    expect(fr.finance.engine.deductions).toMatch(SAYS_GROSS_OR_BRUTE)
    expect(en.finance.engine.levels.gross).toMatch(SAYS_GROSS_OR_BRUTE)
  })
})
