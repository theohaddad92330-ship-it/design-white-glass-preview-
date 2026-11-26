import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { HYGIENE_CHECKS, type HygieneCheck } from '@bellum/contracts'
import { DataHygieneService } from './data-hygiene.service'

/**
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien » (PDF 8 §6.3).
 *
 * Le §6.3 fait de la destination une PROPRIÉTÉ de l'indicateur, pas un confort :
 * un compte affiché sans qu'on puisse ouvrir la liste transforme une liste de
 * travail en reproche. Cette garde vérifie que chaque destination existe
 * vraiment côté web.
 *
 * C'est le même défaut que celui de `briefing-routes.spec.ts` : une destination
 * est une CHAÎNE côté serveur et un fichier de route côté web. Deux dépôts
 * logiques, aucun lien — et le routeur ne se plaint pas, il rend « Page
 * introuvable », ce qui est son bon comportement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE VOYAIT PAS, ET POURQUOI ELLE A ÉTÉ ÉLARGIE (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle était VERTE pendant que `unresolved_duplicates` — qui compte
 * `duplicate_pairs` — pointait sur `/team`, c'est-à-dire sur les comptes
 * couverts par plusieurs commerciaux : un objet qui n'a rien à voir avec une
 * paire de doublons. La route existait, donc la garde disait oui.
 *
 * C'est une garde à moitié borgne, exactement le motif que le dépôt connaît :
 * elle vérifiait l'EXISTENCE de la destination, jamais sa SÉMANTIQUE. Un lien
 * qui ouvre un écran vivant sur une population étrangère est pire qu'un lien
 * mort — le lien mort se voit, celui-là se croit.
 *
 * La règle est donc écrite en entier : **un contrôle qui compte des objets doit
 * mener à l'écran qui montre CES objets**. Elle se vérifie en partant du fichier
 * de ROUTE et en suivant ses imports locaux jusqu'à l'endroit où la population
 * est LUE. Si la destination change et que le nouvel écran ne lit pas cette
 * population, la garde rougit.
 */

const WEB_SRC = join(__dirname, '..', '..', '..', '..', 'web', 'src')

function readWebRoutePaths(): string[] {
  const source = readFileSync(join(WEB_SRC, 'routeTree.gen.ts'), 'utf8')
  const start = source.indexOf('export interface FileRoutesByTo {')
  const end = source.indexOf('export interface FileRoutesById {')
  expect(start).toBeGreaterThan(-1)
  const block = source.slice(start, end)
  return [...block.matchAll(/^\s*'([^']+)':/gm)].map(match => match[1] as string)
}

/** Les destinations réellement émises, lues sur le service lui-même. */
function declaredLinks(): Record<string, string> {
  const source = readFileSync(join(__dirname, 'data-hygiene.service.ts'), 'utf8')
  const start = source.indexOf('const LINKS: Record<HygieneCheck, string> = {')
  expect(start).toBeGreaterThan(-1)
  const block = source.slice(start, source.indexOf('}', start))
  return Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map(match => [match[1], match[2]]))
}

/**
 * CE QUE CHAQUE CONTRÔLE COMPTE, ET CE QUI PROUVE QUE LA DESTINATION LE MONTRE.
 *
 * La preuve n'est pas un nom d'écran — un écran se renomme, se scinde, se
 * déplace — mais la LECTURE de la population : le hook qui va chercher les
 * objets comptés. Un écran qui ne l'appelle pas ne les montre pas, quel que soit
 * son titre.
 *
 * Chaque ligne se lit contre la requête du service, juste à côté :
 * `unresolved_duplicates` compte `duplicate_pairs`, et `useDuplicates` est le
 * seul lecteur de `duplicate_pairs` côté web.
 */
const DESTINATION_READS: Record<HygieneCheck, RegExp> = {
  accounts_without_next_action: /\buseAccounts\b/,
  contacts_without_email: /\buseContacts\b/,
  projects_without_amount: /\buseProjects\b/,
  missions_without_end_date: /\buseMissions\b/,
  needs_without_skills: /\buseOpenNeeds\b/,
  talents_unknown_availability: /\busePoolSegment\b/,
  unresolved_duplicates: /\buseDuplicates\b/,
  missions_without_cost: /\buseInvoiceReadiness\b/,
  // #2126.59 — même destination que `contacts_without_email` : la fiche
  // flaggée reste une fiche de `/contacts`, pas un écran séparé.
  contacts_flagged_incorrect: /\buseContacts\b/,
}

/** Le CHEMIN d'une destination, sans la vue ni l'ancre. */
function pathOf(href: string): string {
  return href.split(/[?#]/)[0] ?? ''
}

/** Le fichier de route d'un chemin — `/projects/needs` ou `/accounts` (index). */
function routeFile(href: string): string | null {
  const clean = pathOf(href)
  const base = join(WEB_SRC, 'routes', ...clean.split('/').filter(Boolean))
  for (const candidate of [`${base}.tsx`, join(base, 'index.tsx'), `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Résout un import LOCAL vers un fichier réel. Le reste (paquets) est ignoré. */
function resolveImport(fromFile: string, specifier: string): string | null {
  const target = specifier.startsWith('@/')
    ? join(WEB_SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null
  if (!target) return null
  for (const candidate of [`${target}.tsx`, `${target}.ts`, join(target, 'index.tsx'), join(target, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Tout ce qu'un écran met à l'écran, en suivant ses imports locaux.
 *
 * ⚠️ La profondeur est BORNÉE. Sans borne, la fermeture transitive d'un écran
 * finit par toucher la moitié de l'application par des modules partagés, et la
 * garde répondrait « oui » à tout — c'est-à-dire qu'elle redeviendrait borgne
 * par excès au lieu de l'être par défaut. Quatre niveaux suffisent à traverser
 * route → page → panneau → hook, qui est la profondeur réelle du dépôt.
 */
function reachableSources(entry: string, maxDepth = 4): { files: string[]; source: string } {
  const seen = new Set<string>([entry])
  let frontier = [entry]
  const sources: string[] = []
  for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const file of frontier) {
      const code = readFileSync(file, 'utf8')
      sources.push(code)
      if (depth === maxDepth) continue
      for (const match of code.matchAll(/from\s+'([^']+)'/g)) {
        const resolved = resolveImport(file, match[1] as string)
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved)
          next.push(resolved)
        }
      }
    }
    frontier = next
  }
  return { files: [...seen], source: sources.join('\n') }
}

/**
 * La question de la garde, isolée pour qu'elle puisse être posée à l'envers.
 *
 * Une garde qui ne sait pas dire NON ne protège rien : la fonction est donc
 * appelée sur le câblage FAUTIF (`unresolved_duplicates → /team`, en production
 * jusqu'au 29/08/2026) dans le test du bas, et doit répondre `false`.
 */
function destinationShowsPopulation(href: string, reads: RegExp): boolean {
  const entry = routeFile(href)
  if (!entry) return false
  return reads.test(reachableSources(entry).source)
}

describe('la vue Qualité des données mène quelque part', () => {
  const routes = readWebRoutePaths()
  const links = declaredLinks()

  it('chaque contrôle déclare sa destination', () => {
    const missing = HYGIENE_CHECKS.filter(check => !links[check])
    expect(missing).toEqual([])
  })

  it('chaque destination existe dans l’arbre de routes de l’app', () => {
    // ⚠️ Une destination peut porter une VUE (`/consultants?view=reactivation`,
    // 16/09/2026) : l'arbre de routes, lui, n'en porte jamais. On compare donc
    // le CHEMIN — comme `routeFile` ci-dessous, qui coupe au même endroit. Le
    // témoin du bas prouve qu'un chemin inventé reste refusé.
    const broken = Object.entries(links).filter(([, href]) => !routes.includes(pathOf(href)))
    if (broken.length > 0) {
      throw new Error(
        [
          'Une destination de la vue Qualité n’existe pas côté web. Le routeur rendra',
          '« Page introuvable » — un indicateur qui ne mène nulle part ne sert à rien,',
          'et un lien mort est pire qu’une absence de lien.',
          '',
          ...broken.map(([check, href]) => `  · ${check} → ${href}`),
        ].join('\n'),
      )
    }
    expect(broken).toEqual([])
  })

  it('la garde lit bien quelque chose', () => {
    expect(routes.length).toBeGreaterThan(20)
    expect(Object.keys(links)).toHaveLength(HYGIENE_CHECKS.length)
    expect(DataHygieneService).toBeDefined()
  })
})

describe('…et mène à l’écran qui montre les objets COMPTÉS', () => {
  const links = declaredLinks()

  it('chaque contrôle déclare la population que sa destination doit lire', () => {
    // La table est tenue à jour avec `HYGIENE_CHECKS` : un neuvième contrôle
    // ajouté sans destination sémantique fait rougir ici, pas six mois plus tard
    // sur un écran.
    expect(Object.keys(DESTINATION_READS).sort()).toEqual([...HYGIENE_CHECKS].sort())
  })

  it('la destination de chaque contrôle LIT la population qu’il compte', () => {
    const wrong = HYGIENE_CHECKS.filter(
      check => !destinationShowsPopulation(links[check] as string, DESTINATION_READS[check]),
    )
    if (wrong.length > 0) {
      throw new Error(
        [
          'Un contrôle de qualité mène à un écran qui ne montre PAS les objets qu’il',
          'compte. C’est le défaut du 29/08/2026 : « doublons non tranchés » comptait',
          '`duplicate_pairs` et menait à `/team`, qui montre les comptes couverts par',
          'plusieurs commerciaux. La route existait, donc l’ancienne garde disait oui.',
          '',
          ...wrong.map(check => `  · ${check} → ${links[check]} n’atteint pas ${DESTINATION_READS[check]}`),
        ].join('\n'),
      )
    }
    expect(wrong).toEqual([])
  })

  it('la garde lit un corpus RÉEL — les fichiers de route, et ce qu’ils importent', () => {
    // Sans ceci, une résolution de chemin cassée rendrait un corpus vide et la
    // garde passerait au vert sur du néant. Le défaut a un nom dans ce dépôt.
    for (const check of HYGIENE_CHECKS) {
      const entry = routeFile(links[check] as string)
      expect(entry).not.toBeNull()
      const { files, source } = reachableSources(entry as string)
      expect(files.length).toBeGreaterThan(3)
      expect(source.length).toBeGreaterThan(2_000)
    }
  })

  it('elle sait dire NON — une route vivante qui ne lit aucun doublon est refusée', () => {
    // Le contrôle des doublons a pointé sur `/team` jusqu'au 29/08/2026. Depuis la refonte Théo (23/10/2026),
    // l'arbre de `/team` atteint l'administration de l'espace, qui monte la gouvernance des doublons : le
    // témoin passe sur `/billing` — la route existe, l'écran vit, et il ne lit pas une seule paire de doublons.
    expect(routeFile('/billing')).not.toBeNull()
    expect(destinationShowsPopulation('/billing', DESTINATION_READS.unresolved_duplicates)).toBe(false)
  })

  it('elle sait dire NON — une destination inexistante est refusée', () => {
    expect(destinationShowsPopulation('/ecran-qui-nexiste-pas', /\buseDuplicates\b/)).toBe(false)
  })

  it('elle sait dire NON — aucune destination ne lit TOUTES les populations', () => {
    // Le contrôle qui prouve que la borne de profondeur fait son travail : si la
    // fermeture transitive touchait la moitié de l'app, chaque destination
    // répondrait « oui » à chaque lecteur, et le test précédent serait vert par
    // accident plutôt que par justesse.
    const permissive = HYGIENE_CHECKS.filter(check =>
      Object.values(DESTINATION_READS).every(reads => destinationShowsPopulation(links[check] as string, reads)),
    )
    expect(permissive).toEqual([])
  })
})

describe('#4191 G2 — « Projets ouverts sans montant » a pour dénominateur les affaires actives du Pipe', () => {
  it('lit le MÊME prédicat SQL que `opportunities_active` de GET /crm-counters, pas un recomptage', async () => {
    const { OPPORTUNITIES_ACTIVE_FROM_SQL, OPPORTUNITIES_ACTIVE_SQL } = await import('@bellum/contracts')
    const queries: string[] = []
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql)
        return [{ n: '1', total: '15' }]
      }),
    }
    const service = new DataHygieneService(dataSource as never)
    await service.overview('ws-1')
    const sql = queries.find(q => q.includes('amount_cents IS NULL'))
    expect(sql).toBeDefined()
    expect(sql).toContain(OPPORTUNITIES_ACTIVE_FROM_SQL)
    expect(sql).toContain(OPPORTUNITIES_ACTIVE_SQL)
    // Le numérateur est pris DANS ces affaires : il n'élargit pas la population.
    expect(sql).toContain('COUNT(*) FILTER (WHERE o.amount_cents IS NULL)')
    // L'intake (détecté / potentiel) n'est PAS une affaire active du Pipe.
    expect(OPPORTUNITIES_ACTIVE_SQL).not.toContain("'detected'")
    expect(OPPORTUNITIES_ACTIVE_SQL).not.toContain("'potential'")
    expect(OPPORTUNITIES_ACTIVE_SQL).not.toContain("'won'")
  })
})
