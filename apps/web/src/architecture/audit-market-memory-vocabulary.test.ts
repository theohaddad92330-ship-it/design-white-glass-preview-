import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2090.42 / #2090.43 — LE VOCABULAIRE DE LA CARTE MÉMOIRE MARCHÉ DE L'AUDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROTÈGE, ET OÙ
 * ─────────────────────────────────────────────────────────────────────────
 * `AuditMarketMemory.tsx` (`features/commercial-audit/`) affiche des comptes
 * du corpus mémoire marché DANS L'AUDIT. Le retour fixe un vocabulaire
 * OBLIGATOIRE (« Compatible », « Observé », « À qualifier ») et un vocabulaire
 * INTERDIT (« Recrute », « Besoin ouvert », « Client certain », « Fournisseur
 * en place », « Externalise aujourd'hui ») — le même risque que GA-259 (un
 * libellé de couverture qui se lit comme un fait de marché), appliqué ici au
 * NOM d'un compte plutôt qu'à un taux : dire « Orange recrute » à partir d'une
 * pile observée serait une affirmation sur ce que fait réellement le marché,
 * jamais mesurée.
 *
 * ⚠️ Cette garde est DISTINCTE de `market-coverage-is-not-outsourcing.test.ts`
 * (GA-259, scope `features/market-memory/`) : cette dernière ne lit PAS
 * `features/commercial-audit/` ni `i18n/locales/<lang>/commercialAudit.json` — un
 * taux ou un libellé écrit ici échappe à sa lecture (#2085.21, cité dans le
 * registre). D'où une garde dédiée, plutôt qu'une extension du scope de
 * GA-259 qui aurait mélangé deux blocs de couverture différents.
 */

const WEB_SRC = join(__dirname, '..')
const COMPONENT = join(WEB_SRC, 'features', 'commercial-audit', 'components', 'AuditMarketMemory.tsx')
const FR_LABELS = join(WEB_SRC, 'i18n', 'locales', 'fr', 'commercialAudit.json')
const EN_LABELS = join(WEB_SRC, 'i18n', 'locales', 'en', 'commercialAudit.json')

/** Des racines, pas des phrases entières : « recrutement » est la même faute
 *  que « recrute ». Les deux formules composées restent des phrases — les
 *  neutraliser en racine attraperait trop (« client » et « fournisseur »
 *  sont des mots parfaitement légitimes ailleurs sur cette même carte). */
const FORBIDDEN_ROOTS: readonly string[] = [
  'recrut',
  'besoin ouvert',
  'client certain',
  'fournisseur en place',
  'externalise aujourd',
]

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

describe('vocabulaire de la mémoire marché dans l’audit — la garde LIT vraiment quelque chose', () => {
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
    expect(forbiddenRootFound('Cette entreprise recrute massivement')).toBe('recrut')
    expect(forbiddenRootFound('Un poste ouvert : recrutement en cours')).toBe('recrut')
  })

  it('attrape les quatre autres formulations interdites, mot pour mot, apostrophe typographique comprise', () => {
    expect(forbiddenRootFound('Un besoin ouvert chez ce compte')).toBe('besoin ouvert')
    expect(forbiddenRootFound('Client certain sur ce dossier')).toBe('client certain')
    expect(forbiddenRootFound('Fournisseur en place depuis 2024')).toBe('fournisseur en place')
    // La racine s'arrête AVANT l'apostrophe : elle attrape les deux graphies.
    expect(forbiddenRootFound('Externalise aujourd’hui sa DSI')).toBe('externalise aujourd')
    expect(forbiddenRootFound("Externalise aujourd'hui sa DSI")).toBe('externalise aujourd')
  })
})

describe('elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('laisse « client » et « fournisseur » seuls — des mots légitimes sur cette carte', () => {
    expect(forbiddenRootFound('Le compatible marché de ce client')).toBeNull()
    expect(forbiddenRootFound('Fournisseur observé dans le corpus')).toBeNull()
  })

  it('laisse le vocabulaire OBLIGATOIRE de la carte, qui ne recoupe aucune racine interdite', () => {
    expect(forbiddenRootFound('Compatible · Observé · À qualifier')).toBeNull()
  })

  it('ne prend pas un COMMENTAIRE pour un libellé', () => {
    const commentaire = "// jamais dire qu'une entreprise recrute\n const label = 'Compatible'"
    expect(forbiddenRootFound(stripComments(commentaire))).toBeNull()
  })
})

describe('le vocabulaire de la carte respecte l’obligatoire et l’interdit', () => {
  it('le catalogue FR ET EN portent le vocabulaire OBLIGATOIRE (Compatible / Observé / À qualifier)', () => {
    const fr = labelValues(FR_LABELS).join(' | ')
    expect(fr).toContain('Compatible')
    expect(fr).toContain('Observé')
    expect(fr).toContain('À qualifier')

    const en = labelValues(EN_LABELS).join(' | ')
    expect(en).toContain('Compatible')
    expect(en.toLowerCase()).toContain('observed')
    expect(en).toContain('To qualify')
  })

  it('aucun libellé du catalogue FR ni EN ne porte le vocabulaire INTERDIT', () => {
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

  it('le composant lui-même ne l’écrit pas non plus, commentaires retirés', () => {
    const root = forbiddenRootFound(stripComments(readFileSync(COMPONENT, 'utf8')))
    expect(root).toBeNull()
  })
})
