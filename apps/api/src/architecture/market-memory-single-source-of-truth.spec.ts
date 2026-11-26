import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-258 — #1621.1 — une seule vérité mémoire marché : `MarketMemoryService`.
 *
 * Numéro attribué à l'intégration du 07/09/2026 : GA-256 était le plus haut
 * existant, et GA-257 a été pris le même jour par la garde jumelle du web
 * (`apps/web/src/architecture/market-memory-score-single-reader.test.ts`, qui
 * interdit de LIRE le score d'externalisation hors de son endroit calibré).
 * Les deux se complètent : celle-ci tient la porte d'ENTRÉE (par où on lit la
 * mémoire marché), celle-là tient ce qu'on a le droit d'en SORTIR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryService` (`modules/market-memory/market-memory.service.ts`) est
 * documenté comme « LA lecture de la mémoire marché — le SEUL point d'entrée » :
 * il applique le SEUIL (`MARKET_MEMORY_MIN_PATHS`), il ne rend jamais `0` pour
 * « non mesuré », et il ne jette jamais. Une surface qui interroge directement
 * une des cinq tables de la mémoire marché — en important son entité TypeORM
 * ou en écrivant son nom de table dans une requête — recalcule cette même
 * décision À CÔTÉ du service, et peut diverger de lui : pas de seuil appliqué,
 * ou un `0` rendu là où le service rendrait `null`. C'est exactement le défaut
 * que #1617 a payé sur `pathsFor`/`resolveDetailed` (deux lectures du même
 * compte désignant deux entreprises différentes) — ici, la garde empêche
 * qu'une TROISIÈME lecture apparaisse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE VISE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `companies.controller.ts` (#1586) calcule bien un nombre « mémoire marché »
 * pour départager deux homonymes — mais il le fait en appelant
 * `MarketMemoryService.resolveDetailed()` et en lisant le `MarketResolution`
 * qu'il rend, jamais en important une entité ou une table directement. Ce
 * fichier reste donc invisible à cette garde, et un test ci-dessous le PROUVE
 * sur son contenu réel plutôt que de l'affirmer.
 *
 * `sector_prior_externalization_score` (`dataforge-account-domain.entity.ts`)
 * n'a rien à voir avec la mémoire marché malgré la ressemblance de son nom :
 * la garde n'ancre ses motifs que sur les CINQ noms de classe et les CINQ
 * noms de table réels, jamais sur le mot « market » seul — un test ci-dessous
 * vérifie que le fichier DataForge ne les contient pas.
 */

const MODULES = join(__dirname, '..', 'modules')
const MARKET_MEMORY_DIR = join(MODULES, 'market-memory')
const DATAFORGE_ENTITY = join(__dirname, '..', 'database', 'entities', 'dataforge-account-domain.entity.ts')
const COMPANIES_CONTROLLER = join(MODULES, 'companies', 'companies.controller.ts')
/** #1617.4 — le fichier qui NOMME légitimement la table scopée, pour la purger. */
const DEMO_RESET = join(MODULES, 'demo', 'demo-reset.service.ts')
const MARKET_MEMORY_SERVICE = join(MARKET_MEMORY_DIR, 'market-memory.service.ts')

/** Les CINQ entités TypeORM de la mémoire marché — la liste EXHAUSTIVE.
 *
 *  ⚠️ Elle en portait QUATRE jusqu'au 09/09/2026, et `MarketCompanyAliasEntity`
 *  (#1756) est arrivée sans y entrer : la garde restait VERTE tout en cessant
 *  de voir un cinquième de son sujet. C'est le défaut qu'elle est censée
 *  empêcher, retourné contre elle — une garde qui compare à une liste écrite à
 *  la main ne voit jamais ce qui n'y est pas. Toute entité `Market*Entity`
 *  neuve s'ajoute ICI dans le même commit que sa création. */
const MARKET_MEMORY_ENTITY_NAMES = [
  'MarketCompanySignalEntity',
  'MarketCompanyStackEntity',
  'MarketEsnClientEntity',
  'MarketExEsnAtClientEntity',
  'MarketCompanyAliasEntity',
  'MarketPersonPathEntity',
  /**
   * #1617.4 — LA SIXIÈME, et la seule SCOPÉE par espace.
   *
   * Elle ne porte pas un fait de marché mais la décision d'un humain sur le
   * rapprochement d'UN de ses comptes. Elle entre pourtant ici, et pour la
   * raison exacte de cette garde : depuis #1617.4 elle a un chemin
   * d'ÉCRITURE (`MarketMemoryService.recordResolutionDecision`), et deux
   * portes d'écriture sur la même table divergeraient comme deux lectures —
   * en pire, puisqu'une seule des deux respecterait le CHECK croisé qui lie
   * la décision à la présence d'une clé.
   *
   * ⚠️ Son NOM DE TABLE n'est délibérément PAS dans la liste ci-dessous. La
   * remise à neuf de la salle de démonstration doit la nommer
   * (`DEMO_PURGE_TABLES`, `modules/demo/demo-reset.service.ts`) : une table
   * scopée qui n'est ni purgée ni gardée laisse la décision d'un visiteur dans
   * la salle du suivant, et le leak guard de la démonstration l'exige. Purger
   * une table n'est pas la LIRE — c'est justement ce que cette garde
   * distingue.
   */
  'MarketCompanyResolutionOverrideEntity',
] as const

/** Les CINQ tables PARTAGÉES — au cas où une requête SQL brute contournerait
 *  l'entité elle-même sans jamais l'importer.
 *
 *  ⚠️ `market_company_resolution_override` n'y est PAS, alors que son entité
 *  est surveillée juste au-dessus : elle est SCOPÉE, et la remise à neuf de la
 *  salle de démonstration doit la nommer pour la purger. La raison entière est
 *  écrite sur l'entité. */
const MARKET_MEMORY_TABLE_NAMES = [
  'market_company_signal',
  'market_esn_client',
  'market_company_stack',
  'market_ex_esn_at_client',
  'market_company_alias',
  'market_person_paths',
] as const

const FORBIDDEN_TOKENS: readonly string[] = [...MARKET_MEMORY_ENTITY_NAMES, ...MARKET_MEMORY_TABLE_NAMES]

/** Retire les commentaires AVANT lecture — une garde qui lit ses propres
 *  commentaires (ou une docstring qui la CITE) compare du bruit à du bruit. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Un jeton interdit trouvé dans du code réel (commentaires déjà retirés). */
function forbiddenTokenFound(source: string): string | null {
  return FORBIDDEN_TOKENS.find(token => source.includes(token)) ?? null
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** Tout le module, moins `market-memory/` lui-même — c'est SA raison d'être
 *  d'importer ces cinq entités. */
function surfacesOutsideMarketMemory(): string[] {
  return sourceFiles(MODULES).filter(file => !file.startsWith(MARKET_MEMORY_DIR + '/') && file !== MARKET_MEMORY_DIR)
}

describe('#1621.1 — une seule vérité mémoire marché', () => {
  it('lit un corpus non vide', () => {
    const files = sourceFiles(MODULES)
    expect(files.length).toBeGreaterThan(200)
    // Le module market-memory existe bien dans ce corpus — sans quoi
    // l'exclusion ci-dessous exclurait un dossier qui n'a jamais été scanné.
    expect(files.some(file => file.startsWith(MARKET_MEMORY_DIR + '/'))).toBe(true)
  })

  it('contrôle positif — le service lui-même utilise bien ses entités', () => {
    // Sans cette ligne, un jeton mal orthographié rendrait « personne ne le
    // trouve nulle part », donc « aucun coupable », donc une garde verte qui
    // n'a rien comparé.
    const source = readFileSync(MARKET_MEMORY_SERVICE, 'utf8')
    for (const name of MARKET_MEMORY_ENTITY_NAMES) {
      expect(source.includes(name)).toBe(true)
    }
  })

  it('SAIT DIRE NON — une lecture directe fautive est détectée', () => {
    const fautif = `
      import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'

      @Injectable()
      export class RogueService {
        constructor(@InjectRepository(MarketCompanySignalEntity) private readonly signals: Repository<MarketCompanySignalEntity>) {}
        async count(companyKey: string) {
          return this.signals.findOne({ where: { companyKey } })
        }
      }
    `
    expect(forbiddenTokenFound(stripComments(fautif))).toBe('MarketCompanySignalEntity')

    const fautifSql = `
      const rows = await this.dataSource.query('select paths_total from market_company_signal where company_key = $1', [key])
    `
    expect(forbiddenTokenFound(stripComments(fautifSql))).toBe('market_company_signal')
  })

  it("n'attrape pas ce qu'elle ne vise pas — deux témoins de code légitime", () => {
    // Témoin 1 (#1586) : la désambiguïsation d'homonymes calcule bien un
    // nombre « mémoire marché », mais UNIQUEMENT via `MarketMemoryService`
    // (`resolveDetailed`) — jamais par import direct d'une entité ou d'une
    // table. Lu sur le VRAI fichier, pas une paraphrase.
    const companiesController = stripComments(readFileSync(COMPANIES_CONTROLLER, 'utf8'))
    expect(companiesController.includes('MarketMemoryService')).toBe(true)
    expect(forbiddenTokenFound(companiesController)).toBeNull()

    // Témoin 2 : le score sectoriel DataForge, malgré son nom voisin
    // (« externalization »), n'a rien à voir avec la mémoire marché — la
    // garde ne l'attrape pas parce qu'elle n'ancre rien sur « market » seul.
    const dataforgeEntity = stripComments(readFileSync(DATAFORGE_ENTITY, 'utf8'))
    expect(dataforgeEntity.includes('sector_prior_externalization_score')).toBe(true)
    expect(forbiddenTokenFound(dataforgeEntity)).toBeNull()

    // Témoin 3 : un commentaire qui NOMME l'entité (comme celui de cette garde,
    // ou de `market-memory.service.ts`) ne doit pas se faire piéger par sa
    // propre justification une fois copié ailleurs.
    const commentaireSeul = `// ne jamais importer MarketCompanySignalEntity ici`
    expect(forbiddenTokenFound(stripComments(commentaireSeul))).toBeNull()

    // Témoin 4 (#1617.4) : la remise à neuf de la salle de démonstration NOMME
    // la table scopée pour la purger, et c'est légitime — purger n'est pas
    // lire. Lu sur le VRAI fichier : si le nom de table entrait un jour dans
    // `MARKET_MEMORY_TABLE_NAMES`, cette ligne tomberait et dirait pourquoi.
    const demoReset = stripComments(readFileSync(DEMO_RESET, 'utf8'))
    expect(demoReset.includes('market_company_resolution_override')).toBe(true)
    expect(forbiddenTokenFound(demoReset)).toBeNull()
  })

  it('AUCUNE surface hors de `market-memory/` ne lit une entité ou une table de la mémoire marché', () => {
    const offenders = surfacesOutsideMarketMemory()
      .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
      .map(({ file, source }) => ({ file, token: forbiddenTokenFound(source) }))
      .filter((entry): entry is { file: string; token: string } => entry.token !== null)
      .map(({ file, token }) => `${file.slice(file.indexOf('modules'))} — ${token}`)

    // ⚠️ Si cette liste cesse d'être vide : la lecture appartient à
    // `MarketMemoryService` (`resolve` / `resolveDetailed` / `coverageFor` /
    // `pathsFor`), et c'est lui qu'il faut injecter — pas l'entité.
    expect(offenders.sort()).toEqual([])
  })
})
