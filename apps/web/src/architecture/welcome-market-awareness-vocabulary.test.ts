import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2074.23 / #2074.24 / #2074.25 — LE VOCABULAIRE DE LA CARTE MARCHÉ DE
 * L'ACCUEIL (`MarketAwarenessCard.tsx`, `/welcome`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET OÙ
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour fixe un vocabulaire AUTORISÉ (« compatible », « observé », « à
 * qualifier ») et un vocabulaire INTERDIT (« recrute », « besoin ouvert »,
 * « fournisseur en place ») — le même risque que GA-259 (un libellé de
 * couverture qui se lit comme un fait de marché), appliqué ici à la carte
 * « première valeur marché » de l'onboarding plutôt qu'au bandeau de
 * couverture d'un compte. Dire « 3 environnements recrutent » à partir d'une
 * pile OBSERVÉE affirmerait ce que fait réellement le marché — jamais mesuré.
 *
 * ⚠️ Cette garde est DISTINCTE de deux autres qui portent un vocabulaire
 * voisin, sur des surfaces différentes :
 * · `market-coverage-is-not-outsourcing.test.ts` (GA-259) ne lit que
 *   `features/market-memory/` — pas `features/welcome/`.
 * · `audit-market-memory-vocabulary.test.ts` (#2090.42/.43) ne lit que
 *   `features/commercial-audit/` — pas `features/welcome/` non plus.
 * Ni l'une ni l'autre ne couvrait donc `MarketAwarenessCard.tsx` avant ce
 * lot (#2074) : une garde qui lit `features/commercial-audit/` ne PROUVE rien
 * sur `features/welcome/`, même si elle porte un nom voisin.
 *
 * L'AUTORISÉ n'est pas rendu OBLIGATOIRE ici : la carte a délibérément refusé
 * toute gradation (« CE QU'ON NE DIT PAS » dans `MarketAwarenessCard.tsx`), et
 * n'a donc pas besoin d'écrire littéralement « compatible » ou « à qualifier »
 * pour respecter la permission. Ce que la garde vérifie : le mot qu'elle
 * emploie déjà (« observé ») fait bien partie de l'autorisé, et aucun mot de
 * la liste interdite n'apparaît jamais.
 */

const WEB_SRC = join(__dirname, '..')
const COMPONENT = join(WEB_SRC, 'features', 'welcome', 'view', 'MarketAwarenessCard.tsx')
const FR_LABELS = join(WEB_SRC, 'i18n', 'locales', 'fr', 'welcome.json')
const EN_LABELS = join(WEB_SRC, 'i18n', 'locales', 'en', 'welcome.json')

/** Des racines, pas des phrases entières — même choix que la garde de l'audit :
 *  « recrutement » est la même faute que « recrute », mais neutraliser
 *  « fournisseur » ou « besoin » en racine attraperait des mots légitimes
 *  ailleurs dans ce même fichier de libellés. */
const FORBIDDEN_ROOTS: readonly string[] = ['recrut', 'besoin ouvert', 'fournisseur en place']

/** Le vocabulaire AUTORISÉ par le retour — ce test prouve qu'au moins un de
 *  ces mots est bien celui que la carte emploie, pas qu'elle les emploie tous. */
const ALLOWED_WORDS: readonly string[] = ['compatible', 'observé', 'à qualifier']

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function forbiddenRootFound(text: string): string | null {
  const folded = text.toLowerCase()
  return FORBIDDEN_ROOTS.find(root => folded.includes(root)) ?? null
}

function labelValues(path: string): string[] {
  const out: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      out.push(node)
      return
    }
    if (node && typeof node === 'object') for (const value of Object.values(node)) walk(value)
  }
  walk(JSON.parse(readFileSync(path, 'utf8')))
  return out
}

describe('vocabulaire de la carte marché à l’accueil — la garde LIT vraiment quelque chose', () => {
  it('le composant et les deux catalogues existent, et ne sont pas vides', () => {
    const frValues = labelValues(FR_LABELS)
    const enValues = labelValues(EN_LABELS)
    expect(frValues.length).toBeGreaterThan(20)
    expect(enValues.length).toBeGreaterThan(20)
    expect(readFileSync(COMPONENT, 'utf8').length).toBeGreaterThan(200)
  })
})

describe('elle sait dire NON', () => {
  it('attrape « recrute » et ses conjugaisons', () => {
    expect(forbiddenRootFound('Ces environnements recrutent massivement')).toBe('recrut')
    expect(forbiddenRootFound('Un poste ouvert : recrutement en cours')).toBe('recrut')
  })

  it('attrape les deux autres formulations interdites, mot pour mot', () => {
    expect(forbiddenRootFound('Un besoin ouvert chez ce compte')).toBe('besoin ouvert')
    expect(forbiddenRootFound('Fournisseur en place depuis 2024')).toBe('fournisseur en place')
  })
})

describe('elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('laisse « fournisseur » et « besoin » seuls — des mots légitimes hors de la phrase interdite', () => {
    expect(forbiddenRootFound('Fournisseur observé dans le corpus')).toBeNull()
    expect(forbiddenRootFound('Un besoin technique déclaré')).toBeNull()
  })

  it('laisse le vocabulaire AUTORISÉ, qui ne recoupe aucune racine interdite', () => {
    expect(forbiddenRootFound('Compatible · Observé · À qualifier')).toBeNull()
  })

  it('ne prend pas un COMMENTAIRE pour un libellé', () => {
    const commentaire = "// jamais dire qu'un environnement recrute\n const label = 'Observé'"
    expect(forbiddenRootFound(stripComments(commentaire))).toBeNull()
  })
})

describe('le vocabulaire de la carte respecte l’autorisé et l’interdit', () => {
  it('#2074.23/#2074.24 — le catalogue FR ET EN emploient au moins un mot de l’AUTORISÉ', () => {
    const fr = labelValues(FR_LABELS).join(' | ').toLowerCase()
    const en = labelValues(EN_LABELS).join(' | ').toLowerCase()
    expect(ALLOWED_WORDS.some(word => fr.includes(word))).toBe(true)
    expect(en.includes('observed') || ALLOWED_WORDS.some(word => en.includes(word))).toBe(true)
  })

  it('#2074.25 — aucun libellé du catalogue FR ni EN ne porte le vocabulaire INTERDIT', () => {
    for (const [langue, path] of [
      ['fr', FR_LABELS],
      ['en', EN_LABELS],
    ] as const) {
      const coupables = labelValues(path)
        .map(value => ({ value, root: forbiddenRootFound(value) }))
        .filter((entry): entry is { value: string; root: string } => entry.root !== null)
        .map(entry => `${langue} — « ${entry.value} » (${entry.root})`)
      expect(coupables).toEqual([])
    }
  })

  it('#2074.25 — le composant lui-même ne l’écrit pas non plus, commentaires retirés', () => {
    const root = forbiddenRootFound(stripComments(readFileSync(COMPONENT, 'utf8')))
    expect(root).toBeNull()
  })
})
