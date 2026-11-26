import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-412 — UNE ESTIMATION SE BADGE, TOUJOURS (#4016 L4, décision Louis 11/10/2026,
 * `c95_estimation_badgee`).
 *
 * Louis a levé « jamais de donnée fictive » pour les ESTIMATIONS, à une
 * condition : elles sont toujours badgées « estimé », et jamais prises pour une
 * preuve. Cette garde tient la moitié ÉCRAN de la règle (la moitié données —
 * `inferred` jamais une preuve, jamais par-dessus une valeur humaine — est
 * tenue par `provenance.test.ts` et `email-estimate.service.spec.ts`).
 *
 * DEUX RÈGLES
 *  A. Un composant qui AFFICHE une estimation — il lit `email_estimated_at`, ou
 *     compare une ORIGINE de rattachement à `'inferred'` — rend `<EstimatedBadge`. Une adresse
 *     estimée ou un N+1 probable affichés sans badge, c'est exactement l'ancienne
 *     interdiction (« donnée fictive ») qui revient.
 *  B. Le badge n'a qu'UNE forme (GA-26) : les clés `estimate.*` ne se lisent que
 *     dans `EstimatedBadge.tsx`. Un second badge « estimé » composé à la main
 *     serait un second vocabulaire — et le troisième oublierait le badge.
 *
 * Elle sait dire NON, elle LIT quelque chose, et elle n'attrape pas ce qu'elle
 * ne vise pas (voir les trois blocs en bas).
 */

const WEB_SRC = join(__dirname, '..')
const PRIMITIVE = join(WEB_SRC, 'components', 'primitives', 'EstimatedBadge.tsx')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'architecture' ? [] : walk(path)
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : []
  })
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

type Source = { file: string; code: string }

/** Ce qui désigne un écran qui AFFICHE une estimation : une adresse estimée, un rattachement inféré, une séniorité déduite des années (L4.3). */
// RV4-E-FIX 4295.21 — un prior de la base de référence (`intelligenceEstimateKind(`) ou une ESN déduite
// (`row.estimateSource`) sont des estimations au même titre.
const DISPLAYS_AN_ESTIMATE =
  /email_estimated_at|origin\s*===\s*'inferred'|displayedSeniority\(|intelligenceEstimateKind\(|row\.estimateSource/

/** A — affiche une estimation sans le badge. */
function unbadgedEstimates(sources: readonly Source[]): string[] {
  return sources
    .filter(({ file }) => file.endsWith('.tsx'))
    .filter(({ code }) => DISPLAYS_AN_ESTIMATE.test(code))
    .filter(({ code }) => !code.includes('<EstimatedBadge'))
    .map(({ file }) => file)
}

/** B — lit les libellés du badge hors de la primitive. */
function secondBadgeVocabulary(sources: readonly Source[]): string[] {
  return sources
    .filter(({ file }) => !file.endsWith('EstimatedBadge.tsx'))
    .filter(({ code }) => /['"`](common:)?estimate\.(kind|label|nuance|verifiedOn|notEvidence)/.test(code))
    .map(({ file }) => file)
}

const CORPUS: Source[] = walk(WEB_SRC).map(path => ({
  file: relative(WEB_SRC, path),
  code: stripComments(readFileSync(path, 'utf8')),
}))

describe('GA-412 — la garde LIT quelque chose', () => {
  it('le corpus est non vide, et contient des écrans qui affichent une estimation', () => {
    expect(CORPUS.length).toBeGreaterThan(500)
    const readers = CORPUS.filter(({ code }) => DISPLAYS_AN_ESTIMATE.test(code))
    expect(readers.length).toBeGreaterThanOrEqual(4)
    // L4.3 — la séniorité déduite des années est lue par au moins un écran.
    expect(CORPUS.some(({ code }) => /displayedSeniority\(/.test(code))).toBe(true)
    expect(readFileSync(PRIMITIVE, 'utf8')).toContain("t('estimate.label')")
  })
})

describe('GA-412 — aucune estimation affichée sans son badge', () => {
  it('A — chaque écran qui affiche une estimation rend <EstimatedBadge', () => {
    expect(unbadgedEstimates(CORPUS)).toEqual([])
  })

  it('B — le badge n’a qu’une forme : les libellés `estimate.*` ne vivent que dans la primitive', () => {
    expect(secondBadgeVocabulary(CORPUS)).toEqual([])
  })
})

describe('GA-412 — C : un seul mot visible pour une valeur déduite (#4295.17/.18)', () => {
  const messages = (lang: string) =>
    JSON.parse(readFileSync(join(WEB_SRC, 'i18n', 'locales', lang, 'common.json'), 'utf8')).estimate as Record<
      string,
      unknown
    >

  it('les catalogues FR et EN ne portent qu’UN libellé visible (`estimate.label`), aucun libellé par forme', () => {
    for (const lang of ['fr', 'en']) {
      const estimate = messages(lang)
      expect(typeof estimate['label']).toBe('string')
      expect(estimate['kind']).toBeUndefined()
    }
    expect(messages('fr')['label']).toBe('estimé')
  })

  it('la primitive n’imprime que ce libellé : la forme ne choisit pas le mot visible', () => {
    const source = stripComments(readFileSync(PRIMITIVE, 'utf8'))
    expect(source).not.toMatch(/estimate\.kind/)
    expect(source).toMatch(/\{label\}/)
  })
})

describe('GA-412 — elle sait dire NON', () => {
  it('rougit sur une adresse estimée rendue sans badge', () => {
    expect(
      unbadgedEstimates([{ file: 'x/Row.tsx', code: 'return <a>{c.email}</a>; const d = c.email_estimated_at' }]),
    ).toEqual(['x/Row.tsx'])
  })

  it('rougit sur un N+1 inféré rendu sans badge', () => {
    expect(
      unbadgedEstimates([
        { file: 'x/Card.tsx', code: "{r.origin === 'inferred' ? t('focal.reportsToInferred') : null}" },
      ]),
    ).toEqual(['x/Card.tsx'])
  })

  it('rougit sur une séniorité déduite des années rendue sans badge (L4.3)', () => {
    expect(
      unbadgedEstimates([{ file: 'x/Seniority.tsx', code: 'const { value } = displayedSeniority(row); return value' }]),
    ).toEqual(['x/Seniority.tsx'])
  })

  it('rougit sur un prior de la base de référence rendu sans badge (RV4-E-FIX 4295.21)', () => {
    expect(
      unbadgedEstimates([
        { file: 'x/Reco.tsx', code: "const kind = intelligenceEstimateKind(r.provenance.source, 'hypothesis')" },
      ]),
    ).toEqual(['x/Reco.tsx'])
    expect(unbadgedEstimates([{ file: 'x/Esn.tsx', code: 'return row.estimateSource ? <b/> : null' }])).toEqual([
      'x/Esn.tsx',
    ])
  })

  it('rougit sur un second badge « estimé » composé à la main', () => {
    expect(secondBadgeVocabulary([{ file: 'x/Other.tsx', code: "t('common:estimate.kind.estimated')" }])).toEqual([
      'x/Other.tsx',
    ])
  })
})

describe('GA-412 — elle n’attrape PAS ce qu’elle ne vise pas', () => {
  it('laisse passer un écran qui porte le badge, et une dérivation `.ts` qui ne rend rien', () => {
    expect(
      unbadgedEstimates([
        {
          file: 'x/Row.tsx',
          code: 'c.email_estimated_at ? <EstimatedBadge verifiedAt={c.email_estimated_at} /> : null',
        },
        { file: 'x/data.ts', code: "origin: 'inferred' as const; if (o === 'inferred') return 1" },
      ]),
    ).toEqual([])
  })

  it('laisse passer la présence de SITE « lue par le modèle » (#2966), un autre vocabulaire, déjà nommé à l’écran', () => {
    expect(
      unbadgedEstimates([
        {
          file: 'x/SitesTable.tsx',
          code: "{row.source === 'inferred' && <Badge>{t('accountSites:table.inferred')}</Badge>}",
        },
      ]),
    ).toEqual([])
  })

  it('laisse passer un commentaire qui CITE la règle', () => {
    const code = stripComments("/* une adresse email_estimated_at sans badge === 'inferred' */ const x = 1")
    expect(unbadgedEstimates([{ file: 'x/Doc.tsx', code }])).toEqual([])
  })
})
