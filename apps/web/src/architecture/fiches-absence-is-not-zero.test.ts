import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * GA-18 / GA-19 étendues aux FICHES compte, contact et besoin — #3777 / #3680.5
 * (décision Louis 10/10 : l'audit « non mesuré » est LIMITÉ à ces trois fiches
 * et tenu par une garde, pas par un audit manuel).
 *
 * Pourquoi une garde de plus : GA-19 (`display-primitives.test.ts`) ne compte
 * que les `?? 0` des fichiers `.tsx`, en cliquet GLOBAL. Or la dérivation d'une
 * fiche vit surtout dans des `.ts` (modèles, hooks, view-data) que GA-19 ne
 * lit pas, et `|| 0` — la même absence repliée sur zéro — n'est comptée nulle
 * part. Un cliquet global laisse aussi passer un `?? 0` neuf tant qu'un autre
 * a été retiré ailleurs.
 *
 * La règle ici n'est pas un budget : sur ces trois fiches, `?? 0` / `|| 0` est
 * INTERDIT, sauf (a) un compte de tableau ou de `Map` (`.length ?? 0`,
 * `.get(…) ?? 0` — zéro élément est vrai) ou (b) une entrée de la liste blanche
 * ci-dessous, avec sa RAISON écrite. « Non mesuré » n'est jamais « 0 ».
 */

const FEATURES = join(__dirname, '..', 'features')
/** Fiche compte (et son onglet Besoins) + fiche contact. */
const FICHES = [join(FEATURES, 'accounts'), join(FEATURES, 'contacts')]

interface AllowedZero {
  readonly file: string
  readonly fragment: string
  readonly reason: string
}

const ALLOWED: readonly AllowedZero[] = [
  { file: 'watchActions.ts', fragment: 'signal.score ?? 0) >= 85', reason: 'seuil de comparaison, jamais rendu' },
  {
    file: 'focalOrgData.ts',
    fragment: 'directPeopleCount ?? 0',
    reason: 'COMPTE de personnes rattachées : zéro est vrai',
  },
  { file: 'OrgGraphViews.tsx', fragment: 'confidence ?? 0', reason: 'clé de TRI — rien n’est affiché' },
  { file: 'accountSynthesis.ts', fragment: 'row.weight ?? 0', reason: 'échelle d’un maximum, jamais rendue' },
  {
    file: 'ScoreSummaryCard.tsx',
    fragment: 'lever.weight ?? 0',
    reason: 'leviers filtrés à poids/max non nuls (provisionalScore.ts) : repli inatteignable',
  },
  {
    file: 'TabOverview.tsx',
    fragment: 'offersCount ?? 0',
    reason: 'COMPTE d’offres servant à décider quelle section afficher',
  },
  {
    file: 'CompanyPublicDataSection.tsx',
    fragment: 'public_repos ?? 0',
    reason: 'ligne rendue seulement si la valeur existe (garde `repos ?`)',
  },
  {
    file: 'CompanyPublicDataSection.tsx',
    fragment: 'active_recent_repos ?? 0',
    reason: 'ligne rendue seulement si la valeur existe (garde `active ?`)',
  },
  {
    file: 'useSiteRows.ts',
    fragment: 'totalItems ?? 0',
    reason: 'total de pagination ; l’état de chargement est porté à part (isLoading)',
  },
  {
    file: 'useContactsTotal.ts',
    fragment: 'totalItems ?? 0',
    reason: 'total de pagination ; aucun écran ne le rend nu',
  },
  { file: 'enrichBilling.ts', fragment: 'count ?? 0', reason: 'COMPTE de contacts écartés : zéro est vrai' },
  {
    file: 'accountBillingLens.ts',
    fragment: 'missingPo.get(accountId) ?? 0',
    reason: 'COMPTE (Map) : zéro mission sans bon de commande est vrai',
  },
  {
    file: 'toEngagementContact.ts',
    fragment: 'contact.priority ?? 0',
    reason: 'rang de tri de l’engagement, jamais affiché comme mesure',
  },
]

/** Les replis qui sont des COMPTES : zéro élément / zéro occurrence est vrai. */
const COUNT_IDIOMS = [/\.length \?\? 0/, /\.get\(.*\) \?\? 0/, /selectionStart \?\? 0/]

const ZERO_FALLBACK = /(\?\?|\|\|) 0(?![\d.])/

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry) || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

/** Les lignes d'un source qui replient une absence sur zéro SANS excuse. */
function unjustifiedZeroFallbacks(file: string, source: string): string[] {
  return stripComments(source)
    .split('\n')
    .filter(line => ZERO_FALLBACK.test(line))
    .filter(line => !COUNT_IDIOMS.some(idiom => idiom.test(line)))
    .filter(line => !ALLOWED.some(allowed => file.endsWith(allowed.file) && line.includes(allowed.fragment)))
    .map(line => line.trim())
}

describe('GA-18/19 étendues — fiches compte, contact, besoin : une valeur absente ne s’affiche jamais « 0 »', () => {
  const files = FICHES.flatMap(sourceFiles)

  it('aucun `?? 0` / `|| 0` sans excuse écrite dans ces fiches', () => {
    const offenders = files.flatMap(file =>
      unjustifiedZeroFallbacks(file, readFileSync(file, 'utf8')).map(line => `${relative(FEATURES, file)} : ${line}`),
    )
    expect(offenders).toEqual([])
  })

  it('la garde lit bien les fiches — un corpus vide passerait au vert pour toujours', () => {
    expect(files.length).toBeGreaterThan(150)
    expect(files.some(file => file.endsWith('TabNeeds.tsx'))).toBe(true)
    expect(files.some(file => file.endsWith('ContactDetail.tsx'))).toBe(true)
  })

  it('chaque entrée de la liste blanche pointe une ligne qui existe encore (pas de dispense périmée)', () => {
    for (const allowed of ALLOWED) {
      const hit = files.some(
        file => file.endsWith(allowed.file) && stripComments(readFileSync(file, 'utf8')).includes(allowed.fragment),
      )
      expect(hit, `${allowed.file} : « ${allowed.fragment} » n’existe plus — retire l’entrée`).toBe(true)
    }
  })

  it('sait dire NON : un coupable factice est attrapé, un compte de tableau ne l’est pas', () => {
    const guilty = 'const label = t("x", { value: result.confidence ?? 0 })\nconst alt = score || 0'
    expect(unjustifiedZeroFallbacks('Faux.tsx', guilty)).toHaveLength(2)
    const innocent =
      'const n = (items?.length ?? 0) + (counts.get(key) ?? 0)\n// result.confidence ?? 0 dans un commentaire'
    expect(unjustifiedZeroFallbacks('Faux.tsx', innocent)).toEqual([])
  })
})
