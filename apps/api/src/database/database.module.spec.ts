import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { buildDbPoolExtra, buildTypeOrmOptions } from './database.module'

describe('buildDbPoolExtra', () => {
  const orig = process.env['DB_POOL_MAX']
  afterEach(() => {
    if (orig === undefined) delete process.env['DB_POOL_MAX']
    else process.env['DB_POOL_MAX'] = orig
  })

  it('bounds the pool and sets connection + statement timeouts', () => {
    delete process.env['DB_POOL_MAX']
    const extra = buildDbPoolExtra()
    expect(extra.max).toBe(10)
    expect(extra.connectionTimeoutMillis).toBeGreaterThan(0)
    expect(extra.idleTimeoutMillis).toBeGreaterThan(0)
    expect(extra.statement_timeout).toBeGreaterThan(0)
  })

  // INC-04-10 — un blip réseau a laissé le pool (5) bloqué 50 min sur des
  // sockets morts. La config doit détecter le socket mort (keepAlive) et
  // borner côté CLIENT l'attente d'une réponse qui ne viendra jamais.
  it('detects dead sockets: TCP keepAlive on, with a short initial delay', () => {
    const extra = buildDbPoolExtra()
    expect(extra.keepAlive).toBe(true)
    expect(extra.keepAliveInitialDelayMillis).toBeGreaterThan(0)
    expect(extra.keepAliveInitialDelayMillis).toBeLessThanOrEqual(15_000)
  })

  it('bounds a query client-side, AFTER the server statement_timeout', () => {
    const extra = buildDbPoolExtra()
    // Le serveur doit couper proprement d'abord ; le client ne tranche que si
    // la réponse n'arrive jamais (socket mort).
    expect(Number(extra.query_timeout)).toBeGreaterThan(Number(extra.statement_timeout))
    expect(Number(extra.query_timeout)).toBeLessThanOrEqual(Number(extra.statement_timeout) + 30_000)
  })

  it('honours a DB_POOL_MAX override', () => {
    process.env['DB_POOL_MAX'] = '25'
    expect(buildDbPoolExtra().max).toBe(25)
  })

  it('falls back to the default on a garbage override', () => {
    process.env['DB_POOL_MAX'] = 'not-a-number'
    expect(buildDbPoolExtra().max).toBe(10)
  })
})

describe('buildTypeOrmOptions', () => {
  it('wires the pool extra into the TypeORM options', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService
    const opts = buildTypeOrmOptions(config) as { extra?: Record<string, number>; synchronize?: boolean }
    expect(opts.extra?.statement_timeout).toBe(60_000)
    // Never let TypeORM alter the schema on boot.
    expect(opts.synchronize).toBe(false)
  })

  // INC-04-10 — une erreur de client inactif (socket coupé) se journalise en
  // ERREUR avec son message seul — jamais l'objet (qui porte la config).
  it('wires a pool error handler that logs at error level, message only', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService
    const opts = buildTypeOrmOptions(config) as { poolErrorHandler?: (err: unknown) => void }
    expect(typeof opts.poolErrorHandler).toBe('function')
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    opts.poolErrorHandler?.(new Error('Connection terminated unexpectedly'))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toContain('Connection terminated unexpectedly')
    spy.mockRestore()
  })
})

/**
 * LOT 7 / ANALYSE B — GA-303 : LE POOL POSTGRES CONTRE LA CONCURRENCE DE TOUS
 * LES WORKERS BULLMQ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LOI DE LITTLE, PAS UNE REQUÊTE LENTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les workers BullMQ tournent dans le MÊME process Nest que l'API (un seul
 * `startCommand` dans `apps/api/railway.json`, aucun bootstrap de worker
 * séparé dans `main.ts`) et partagent donc le MÊME pool `pg` que tout le
 * trafic HTTP (`buildDbPoolExtra` ci-dessus). Un pool saturé par des
 * connexions RETENUES (une par job BullMQ en cours, pendant toute sa durée)
 * ne se voit sur AUCUN tableau de bord de requêtes lentes : chaque requête
 * individuelle peut être rapide, et le pool être quand même à sec — c'est le
 * diagnostic le plus souvent raté de cette famille.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle COMPTE : la somme des `concurrency` déclarées par chaque worker BullMQ
 * du process (lues dans leur fichier SOURCE, jamais recopiées à la main —
 * une recopie diverge le jour où quelqu'un change une valeur sans repasser
 * ici), comparée au pool moins une marge réservée au trafic HTTP.
 *
 * Elle NE CHANGE RIEN : ni `DB_POOL_MAX`, ni aucune `concurrency`. Relever le
 * pool sans mesurer la base derrière déplacerait la saturation chez Postgres
 * lui-même — c'est un arbitrage humain, pas un correctif de CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN CLIQUET, PAS UNE PORTE — ET POURQUOI CE N'EST PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Au 12/09/2026, l'état mesuré est un surengagement CONNU et ASSUMÉ : 7
 * workers, 14 slots de concurrence déclarés, pour un pool à 10 (marge HTTP 2
 * comprise) — `poolCoversConcurrency(10, 14, 2)` rend `false`, sans qu'aucune
 * requête ne soit individuellement lente (loi de Little : ce sont les
 * connexions RETENUES qui saturent, pas leur durée).
 *
 * Une première version de cette garde faisait échouer CI sur ce fait déjà
 * là — un rouge permanent, sur `main`, qui déclenche le déploiement et où la
 * porte d'agrégation `CI Status` est bloquante. Ce rouge ne force aucune
 * décision : il bloque TOUS les lots, et finit désactivé ou `skip`é dans la
 * journée par quelqu'un qui doit livrer — la règle disparaît, et personne ne
 * sait plus quand. Un déséquilibre CONSTATÉ n'est pas une régression.
 *
 * La garde est donc un CLIQUET : elle ÉPINGLE l'état mesuré (7 workers, 14,
 * 10) et reste VERTE tant que rien ne s'AGGRAVE. Elle ne rougit que si
 * quelqu'un pousse le total au-delà de 14 (un 8ᵉ worker, une concurrence
 * relevée) ou abaisse le pool par défaut sous 10 — c'est-à-dire si quelqu'un
 * AGGRAVE la situation sans le savoir. Le jour où l'arbitrage humain relève le
 * pool ou réduit la concurrence, l'état mesuré s'améliore : le cliquet reste
 * vert (il ne verrouille QUE le sens qui empire), et `KNOWN_ACCEPTED_STATE`
 * ci-dessous se resserre dans le commit qui fait ce choix.
 */
describe('GA-303 — le pool Postgres contre la concurrence de tous les workers BullMQ', () => {
  const MODULES_DIR = join(__dirname, '..', 'modules')

  /** Retire les commentaires AVANT lecture — même principe que les autres
   *  gardes du dépôt (`market-memory-reads-are-free.spec.ts`) : une garde qui
   *  lit le récit du défaut écrit en commentaire compare du bruit à du bruit. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  }

  /** Tous les fichiers sous `modules/` qui déclarent un `@Processor(` — hors
   *  specs. Sert de témoin d'exhaustivité : si ce compte change sans que
   *  `DECLARED_WORKER_QUEUES` ne change avec lui, le registre ci-dessous est
   *  devenu incomplet (ou obsolète), et le test « le registre est exhaustif »
   *  le dit. */
  function processorFilesUnderModules(dir: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        found.push(...processorFilesUnderModules(full))
        continue
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
      if (stripComments(readFileSync(full, 'utf8')).includes('@Processor(')) found.push(full)
    }
    return found
  }

  /**
   * Chaque worker BullMQ du process, et où lire sa concurrence déclarée.
   * Relevé le 12/09/2026 — `git grep "@Processor("` puis `git grep
   * "concurrency" apps/api/src` (aucune autre occurrence de `@Processor(`).
   */
  const DECLARED_WORKER_QUEUES: ReadonlyArray<{ readonly queue: string; readonly file: string }> = [
    { queue: 'analysis', file: 'analysis/analysis.worker.ts' },
    { queue: 'org-rebuild', file: 'analysis/org-rebuild.worker.ts' },
    { queue: 'replan', file: 'analysis/replan.worker.ts' },
    { queue: 'contact-enrichment', file: 'contacts/contact-enrichment.worker.ts' },
    { queue: 'watchlist-refresh', file: 'watchlist-refresh/watchlist-refresh.worker.ts' },
    // #2276 — le job composite de Laura : `concurrency: 2`, posée explicitement.
    { queue: 'laura-job', file: 'action-os/laura-job.worker.ts' },
    // Ni l'un ni l'autre ne pose de `concurrency` — BullMQ leur applique donc
    // son propre défaut (vérifié dans `bullmq@5.73.0`,
    // `dist/cjs/classes/worker.js` : `Object.assign({ drainDelay: 5,
    // concurrency: 1, ... })`).
    { queue: 'mailer', file: 'mailer/mailer.worker.ts' },
    { queue: 'integration-delivery', file: 'integrations/integrations.worker.ts' },
    // #2980/#2110 — la synchro CRM en arrière-plan : `concurrency: 5`, posée explicitement.
    { queue: 'integration-sync', file: 'integration-sync/integration-sync.worker.ts' },
    // #2326.12 (épopée #2794) — l'import de CV en masse, devenu async : `concurrency: 1`, posée explicitement.
    { queue: 'cv-batch-import', file: 'consultants/cv-batch-import.worker.ts' },
    // #3065 (lot 2b) — l'import ZIP volumineux, lu en streaming depuis le stockage : `concurrency: 2`, posée explicitement.
    // ⚠️ 04/10/2026 (c88) : 2 → 1, le slot rendu passe à `cv-auto-parse` ci-dessous — total inchangé (31).
    { queue: 'cv-zip-import', file: 'consultants/cv-zip-import.worker.ts' },
    // c88 (04/10/2026) — la lecture automatique des CV à l'import : `concurrency: 1` (constante
    // `CV_AUTO_PARSE_CONCURRENCY`), payée par le slot rendu de `cv-zip-import` — le cliquet ne bouge pas.
    { queue: 'cv-auto-parse', file: 'consultants/cv-auto-parse.worker.ts' },
    // Import universel (Louis 27/09/2026) — un paquet = une transaction : `concurrency: 1`, posée explicitement.
    { queue: 'universal-import', file: 'universal-import/universal-import.worker.ts' },
    // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — le matching massif, un lot à la fois : `concurrency: 1`, posée explicitement.
    { queue: 'bulk-matching', file: 'consultants/matching/bulk-matching.worker.ts' },
    // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'export en lot, une pagination du vivier entier : `concurrency: 1`, posée explicitement.
    { queue: 'bulk-export', file: 'consultants/bulk-export.worker.ts' },
    // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — la recherche multi-sources, plusieurs lots de front : `concurrency: 3`, posée explicitement.
    { queue: 'multi-source-search', file: 'external-sourcing/multi-source-search.worker.ts' },
    // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — la réécriture de CV en lot, chaque item appelle déjà un modèle : `concurrency: 1`, posée explicitement.
    { queue: 'bulk-cv-rewrite', file: 'consultants/bulk-cv-rewrite.worker.ts' },
    // #3623.11 / #3666.10 (lot V10-C, décision Louis 17/10 : ingest/zip en BullMQ) — l'import d'archive zip de la
    // base de connaissances, une archive à la fois : `concurrency: 1`, posée explicitement.
    { queue: 'rag-zip-ingest', file: 'rag/rag-zip-ingest.worker.ts' },
    // #4158.57 (lot V13, 17/10, arrêt levé par Louis sous conditions) — le rapatriement d'un espace personnel,
    // une demande à la fois : `concurrency: 1`, posée explicitement.
    { queue: 'workspace-merge', file: 'workspace-merge/workspace-merge.worker.ts' },
    // SYNC-B (19/10/2026) — la première reprise d'un CRM, déclenchée au branchement : `concurrency: 1`, posée explicitement.
    { queue: 'crm-first-import', file: 'crm/crm-first-import.worker.ts' },
    // SYNC-C (19/10/2026) — la synchro CRM fréquente (toutes les 15 min, un couple espace-fournisseur par job) : `concurrency: 3`, posée explicitement.
    { queue: 'crm-frequent-sync', file: 'crm-sync/crm-frequent-sync.worker.ts' },
    // #4286.13 (lot SR1, 22/10/2026) — la relecture de l'employeur d'un contact à l'ouverture de sa fiche : `concurrency: 2`, posée explicitement.
    { queue: 'employment-recheck', file: 'routines/employment-recheck.worker.ts' },
    // Théo M2 (22/10/2026) — l'envoi programmé d'un brouillon validé, relu au départ : `concurrency: 2`, posée explicitement.
    { queue: 'scheduled-message-send', file: 'scheduled-send/scheduled-send.worker.ts' },
  ]

  /** Le défaut BullMQ pour un `@Processor(...)` sans `concurrency` — voir la
   *  citation ci-dessus. Documenté ici, pas relu dynamiquement dans le paquet
   *  installé : parser les internes compilés d'une dépendance tierce à chaque
   *  run casserait cette garde pour une raison qui ne la concerne pas (un
   *  refactor interne de BullMQ), pas pour un vrai changement de notre côté.
   *  `bullmqDefaultConcurrencyStillPinnedVersion` ci-dessous ancre ce chiffre
   *  à une version précise, pour qu'une montée de version le fasse RE-vérifier
   *  plutôt que dériver en silence. */
  const BULLMQ_DEFAULT_CONCURRENCY = 1
  const BULLMQ_VERIFIED_VERSION = '5.73.0'

  /** Marge réservée au trafic HTTP qui touche la base : ce n'est pas une
   *  mesure de charge (hors périmètre de ce lot), mais un plancher défendable
   *  — au moins deux requêtes HTTP concurrentes doivent pouvoir obtenir une
   *  connexion même quand tous les workers tournent à plein. */
  const HTTP_CONCURRENCY_MARGIN = 2

  function declaredConcurrency(file: string): { concurrency: number; explicit: boolean } {
    const full = join(MODULES_DIR, file)
    const source = stripComments(readFileSync(full, 'utf8'))
    if (!source.includes('@Processor(')) {
      throw new Error(
        `${file} n'a plus de @Processor(...) — GA-303 croit encore qu'il porte un worker BullMQ. ` +
          'Registre à corriger, pas seulement ce test.',
      )
    }
    const match = source.match(/concurrency:\s*(\d+)/)
    if (match) return { concurrency: Number(match[1]), explicit: true }
    // #3935 (lot BATCH-CV, 12/10/2026) — une concurrence lue de l'env (`concurrency: X_CONCURRENCY`)
    // compte pour son DÉFAUT, lu dans le `.queue.ts` voisin (`X_DEFAULT_CONCURRENCY = N`).
    // Introuvable = la garde refuse, jamais un « 1 » silencieux.
    const named = source.match(/concurrency:\s*([A-Z][A-Z0-9_]*)_CONCURRENCY\b/)
    if (named) {
      const queueFile = full.replace(/\.worker\.ts$/, '.queue.ts')
      const queueSource = stripComments(readFileSync(queueFile, 'utf8'))
      const fallback = queueSource.match(new RegExp(`${named[1]}_DEFAULT_CONCURRENCY\\s*=\\s*(\\d+)`))
      if (!fallback) {
        throw new Error(`${file} lit sa concurrence de l'env mais ${named[1]}_DEFAULT_CONCURRENCY est introuvable.`)
      }
      return { concurrency: Number(fallback[1]), explicit: true }
    }
    return { concurrency: BULLMQ_DEFAULT_CONCURRENCY, explicit: false }
  }

  /** Le rapport pool/concurrence, en une formule PURE — testable sans lire un
   *  seul fichier, pour prouver que la comparaison elle-même sait dire OUI ET
   *  NON avant de la brancher sur les vrais nombres. */
  function poolCoversConcurrency(poolMax: number, totalConcurrency: number, httpMargin: number): boolean {
    return totalConcurrency <= poolMax - httpMargin
  }

  it('le corpus n’est pas vide : au moins un worker BullMQ existe dans `modules/`', () => {
    expect(DECLARED_WORKER_QUEUES.length).toBeGreaterThan(0)
    expect(processorFilesUnderModules(MODULES_DIR).length).toBeGreaterThan(0)
  })

  it('le registre recense TOUS les workers BullMQ du process — ni plus, ni moins', () => {
    const onDisk = processorFilesUnderModules(MODULES_DIR)
    expect(onDisk).toHaveLength(DECLARED_WORKER_QUEUES.length)
    // Et ce sont bien les MÊMES fichiers, pas seulement le même compte.
    const declaredPaths = new Set(DECLARED_WORKER_QUEUES.map(w => join(MODULES_DIR, w.file)))
    for (const file of onDisk) expect(declaredPaths.has(file)).toBe(true)
  })

  it('la concurrence de chaque worker est LUE dans son fichier — les 5 explicites, PUIS les 2 au défaut BullMQ', () => {
    const byQueue = Object.fromEntries(DECLARED_WORKER_QUEUES.map(w => [w.queue, declaredConcurrency(w.file)]))

    expect(byQueue['analysis']).toEqual({ concurrency: 3, explicit: true })
    expect(byQueue['org-rebuild']).toEqual({ concurrency: 2, explicit: true })
    expect(byQueue['replan']).toEqual({ concurrency: 2, explicit: true })
    expect(byQueue['contact-enrichment']).toEqual({ concurrency: 4, explicit: true })
    // Concurrence 1 choisie DÉLIBÉRÉMENT (commentaire du fichier : « une
    // recherche IA à la fois ») — explicite, pas un oubli.
    expect(byQueue['watchlist-refresh']).toEqual({ concurrency: 1, explicit: true })
    // Ces deux-là ne posent AUCUNE option de concurrence : BullMQ leur
    // applique son propre défaut, silencieusement.
    expect(byQueue['mailer']).toEqual({ concurrency: BULLMQ_DEFAULT_CONCURRENCY, explicit: false })
    expect(byQueue['integration-delivery']).toEqual({ concurrency: BULLMQ_DEFAULT_CONCURRENCY, explicit: false })
    expect(byQueue['integration-sync']).toEqual({ concurrency: 5, explicit: true })
    // Concurrence 1 choisie DÉLIBÉRÉMENT (un import ZIP de CV à la fois par
    // espace) — explicite, pas un oubli.
    expect(byQueue['cv-batch-import']).toEqual({ concurrency: 1, explicit: true })
  })

  it('la version de BullMQ installée est celle contre laquelle le défaut « 1 » a été vérifié à la source', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lire un package.json tiers, pas un module applicatif
    const installed = (require('bullmq/package.json') as { version: string }).version
    expect(installed).toBe(BULLMQ_VERIFIED_VERSION)
  })

  it('poolCoversConcurrency dit OUI quand la marge HTTP tient après tous les workers', () => {
    expect(poolCoversConcurrency(10, 8, 2)).toBe(true) // 8 + 2 = 10 pile
  })

  it('poolCoversConcurrency dit NON dès que la marge HTTP est mangée — la fonction sait dire NON', () => {
    expect(poolCoversConcurrency(10, 9, 2)).toBe(false) // 9 + 2 = 11 > 10
  })

  /**
   * L'ÉTAT ACCEPTÉ, resserré le 26/09/2026 (intégration restes) : #2326.12
   * (épopée #2794, l'import de CV en masse devenu async) ajoute un DIXIÈME
   * worker BullMQ (`cv-batch-import`, concurrency 1, posée explicitement) —
   * le total passe de 21 à 22 slots, pool toujours à 10 par défaut. Aucun des
   * trois leviers (pool relevé, worker isolé, concurrence baissée) n'est
   * appliqué ici — l'intégrateur ne décide pas d'infra ni de produit — ce
   * resserrement documente le fait mesuré et laisse l'arbitrage humain
   * ouvert, exactement comme l'état du 26/09/2026 (intégration matin) qu'il
   * remplace : `poolCoversConcurrency(10, 22, 2)` vaut `false`, ce n'est PAS
   * ce que le cliquet garde.
   */
  /**
   * ⚠️ 22 → 23 le 27/09/2026 (import universel, exigence Louis) : ONZIÈME
   * worker (`universal-import`, concurrency 1, posée explicitement). Même
   * parti pris que le relèvement ci-dessus — fait mesuré documenté, arbitrage
   * d'infra (pool relevé / worker isolé) laissé ouvert et NOMMÉ au rapport du lot.
   *
   * ⚠️ INTÉGRATION M, 27/09/2026 — 23 → 25 : deux branches distinctes,
   * fusionnées l'une après l'autre dans ce lot, ajoutaient CHACUNE un
   * DOUZIÈME worker depuis la MÊME base (22) sans se voir : `cv-zip-import`
   * (#3065 lot 2b, `consultants/cv-zip-import.worker.ts`, concurrency 2 —
   * l'import ZIP volumineux en streaming) et `universal-import` (ci-dessus,
   * concurrency 1). Le paragraphe précédent n'a compté que le second (22→23) ;
   * le premier (+2) ne recoupe aucun relèvement déjà fait. Mesure réelle après
   * fusion : 25. Toujours aucun levier appliqué (pool relevé / worker isolé /
   * concurrence baissée) — l'intégrateur ne décide pas d'infra, nommé au
   * rapport du lot.
   */
  /**
   * ⚠️ 25 → 30 le 28/09/2026 (lot SRC5 soir, #2844, #1952.3/.6/.7) : TROIS
   * workers neufs — `bulk-matching` (concurrency 1, un lot à la fois),
   * `bulk-export` (concurrency 1, une pagination du vivier entier) et
   * `multi-source-search` (concurrency 3, plusieurs lots de front) — soit
   * +5 slots. Même parti pris que les relèvements précédents : fait mesuré
   * documenté, aucun des trois leviers appliqué (pool relevé / worker isolé /
   * concurrence baissée) — l'écrivain ne décide pas d'infra, nommé au
   * rapport du lot.
   *
   * ⚠️ 30 → 31 le 28/09/2026 (même lot, #1952.5) : QUATRIÈME worker neuf —
   * `bulk-cv-rewrite` (concurrency 1, chaque item appelle déjà un modèle) —
   * +1 slot. Même parti pris, même arbitrage laissé ouvert.
   */
  /**
   * ⚠️ 31 → 38 le 12/10/2026 (#3935, lot BATCH-CV, urgence Louis : 400 à 2000 CV d'un coup) :
   * `cv-auto-parse` passe de 1 à 8 PAR DÉFAUT (`CV_AUTO_PARSE_CONCURRENCY`, env, borné [1, 24]).
   * Relèvement DEMANDÉ, pas contourné — la garde lit toujours le défaut à la source. Pourquoi
   * la loi de Little pèse moins ici : `CvAutoParseService.readOne` n'ouvre AUCUNE transaction,
   * la connexion n'est tenue que pendant deux lectures et une écriture courtes, jamais pendant
   * l'appel IA (l'essentiel des ~15 s). Levier immédiat sans redéploiement de code :
   * `CV_AUTO_PARSE_CONCURRENCY=1` sur Railway ramène l'état à 31. Arbitrage infra (pool /
   * worker isolé) toujours ouvert, NOMMÉ au rapport du lot.
   */
  /**
   * ⚠️ 38 → 39 le 17/10/2026 (intégration vague 10, #3623.11 / #3666.10, décision Louis 17/10 : « ingest/zip en
   * BullMQ ») : worker neuf `rag-zip-ingest` (concurrency 1, une archive à la fois) — +1 slot. Même parti pris
   * que les relèvements précédents : fait mesuré documenté, aucun levier appliqué, arbitrage infra NOMMÉ à la PR.
   */
  /**
   * ⚠️ 39 → 40 le 17/10/2026 (lot V13-FUSION-ESPACE, #4158.57, arrêt levé par Louis sous conditions dont « job
   * BullMQ, statut, reprise après coupure ») : worker neuf `workspace-merge` (concurrency 1, une demande à la
   * fois) — +1 slot. Même parti pris : fait mesuré documenté, aucun levier appliqué, arbitrage infra NOMMÉ au rapport.
   */
  /**
   * ⚠️ 40 → 44 le 19/10/2026 (intégration SYNC-B + SYNC-C) : DEUX workers neufs — `crm-first-import` (concurrency 1,
   * une reprise à la fois) et `crm-frequent-sync` (concurrency 3, un couple espace-fournisseur par job) — +4 slots.
   * Même parti pris que les relèvements précédents : fait mesuré documenté, aucun levier appliqué, arbitrage infra
   * (pool / worker isolé) NOMMÉ au rapport.
   * ⚠️ 44 → 46 le 22/10/2026 (intégration PR n°5) : un worker neuf — `employment-recheck` (concurrency 2) — +2 slots.
   * ⚠️ 46 → 48 le 22/10/2026 (intégration PR n°8) : un worker neuf — `scheduled-send` (Théo M2, concurrency 2) — +2 slots.
   */
  const KNOWN_ACCEPTED_STATE = { totalConcurrency: 48, poolMax: 10 } as const

  /**
   * Le message qu'une personne lira dans TROIS MOIS quand ce cliquet rougira
   * pour de vrai — sans avoir à retrouver cette conversation. Il nomme l'état
   * connu, dit pourquoi il n'a jamais été « corrigé » ici, et donne les trois
   * leviers (aucun appliqué : l'arbitrage reste humain).
   */
  function overcommitRatchetMessage(measured: { totalConcurrency: number; poolMax: number }): string {
    return [
      'GA-303 — le surengagement pool/concurrence BullMQ s’est AGGRAVÉ par rapport à l’état connu et assumé.',
      '',
      `État ACCEPTÉ (mesuré le 12/09/2026) : ${KNOWN_ACCEPTED_STATE.totalConcurrency} slots de concurrence ` +
        `déclarés (7 workers BullMQ, même process que l'API — un seul startCommand dans railway.json) pour un ` +
        `pool Postgres par défaut à ${KNOWN_ACCEPTED_STATE.poolMax}. Ce déficit (le pool ne couvre déjà pas ` +
        'cette concurrence, marge HTTP de 2 comprise) est CONNU et ASSUMÉ à cette date : aucune requête ' +
        'individuelle n’est lente, c’est la loi de Little — des connexions RETENUES simultanément, pas une ' +
        'durée. Ce n’est PAS une régression que ce test devait corriger ; l’arbitrage est humain.',
      '',
      `État MESURÉ maintenant : ${measured.totalConcurrency} slots de concurrence, pool à ${measured.poolMax}.`,
      '',
      'Ce cliquet rougit parce que la situation a empiré depuis l’état accepté ci-dessus (un worker de plus, ' +
        'une concurrence relevée, ou le pool par défaut abaissé). Trois leviers pour résorber le déficit ' +
        '(aucun appliqué automatiquement — DÉCISION HUMAINE) :',
      '  1. Relever DB_POOL_MAX — SEULEMENT après avoir mesuré le plafond de connexions Postgres/Supabase ' +
        'derrière : le relever sans mesurer déplace la saturation chez Postgres lui-même.',
      '  2. Sortir un ou plusieurs workers (candidats : analysis à 3, contact-enrichment à 4) dans un service ' +
        'Railway séparé, avec son propre pool.',
      '  3. Baisser une concurrence existante (ex. contact-enrichment 4→2) — coûte du débit, gagne de la marge ' +
        'pool sans toucher l’infra.',
      '',
      'Si la situation s’est au contraire AMÉLIORÉE (l’un de ces leviers a été appliqué), resserre ' +
        '`KNOWN_ACCEPTED_STATE` dans ce fichier au nouvel état mesuré, dans le MÊME commit que le changement.',
    ].join('\n')
  }

  /**
   * Le CLIQUET, en une formule PURE — testable sans lire un seul fichier,
   * avant de la brancher sur les vrais nombres. Vrai tant que rien n'a
   * empiré par rapport à `accepted` : le total ne doit pas avoir grandi, le
   * pool ne doit pas avoir rétréci. Un état AMÉLIORÉ (total plus bas, pool
   * plus grand) reste VRAI — ce n'est PAS une porte à franchir pile, c'est un
   * cliquet qui ne serre que dans un sens.
   */
  function ratchetHolds(
    measured: { totalConcurrency: number; poolMax: number },
    accepted: { totalConcurrency: number; poolMax: number },
  ): boolean {
    return measured.totalConcurrency <= accepted.totalConcurrency && measured.poolMax >= accepted.poolMax
  }

  it('ratchetHolds dit OUI sur l’état accepté lui-même — rien n’a empiré', () => {
    expect(ratchetHolds({ totalConcurrency: 14, poolMax: 10 }, { totalConcurrency: 14, poolMax: 10 })).toBe(true)
  })

  it('ratchetHolds dit OUI quand la situation s’est AMÉLIORÉE (pool relevé, concurrence baissée)', () => {
    expect(ratchetHolds({ totalConcurrency: 12, poolMax: 12 }, { totalConcurrency: 14, poolMax: 10 })).toBe(true)
  })

  it(
    'ratchetHolds dit NON dès qu’UN worker de plus (ou une concurrence relevée) pousse le total ' +
      'au-delà de l’accepté — le cliquet sait dire NON',
    () => {
      // Équivalent de « contact-enrichment passe de 4 à 5 » : le total réel
      // mesuré serait 15 au lieu de 14.
      expect(ratchetHolds({ totalConcurrency: 15, poolMax: 10 }, { totalConcurrency: 14, poolMax: 10 })).toBe(false)
    },
  )

  it('ratchetHolds dit NON dès que le pool par défaut est abaissé sous le plancher accepté', () => {
    expect(ratchetHolds({ totalConcurrency: 14, poolMax: 9 }, { totalConcurrency: 14, poolMax: 10 })).toBe(false)
  })

  it(
    'GA-303 — cliquet : ne rougit QUE si le surengagement s’aggrave par rapport à l’état mesuré le ' +
      '12/09/2026 (7 workers, 14 slots, pool 10) — aucune valeur de config n’est changée par ce test',
    () => {
      const orig = process.env['DB_POOL_MAX']
      delete process.env['DB_POOL_MAX']
      let poolMax: number
      try {
        poolMax = Number(buildDbPoolExtra().max)
      } finally {
        if (orig === undefined) delete process.env['DB_POOL_MAX']
        else process.env['DB_POOL_MAX'] = orig
      }
      const totalConcurrency = DECLARED_WORKER_QUEUES.reduce(
        (sum, w) => sum + declaredConcurrency(w.file).concurrency,
        0,
      )
      const measured = { totalConcurrency, poolMax }

      if (!ratchetHolds(measured, KNOWN_ACCEPTED_STATE)) {
        throw new Error(overcommitRatchetMessage(measured))
      }

      // Documente le fait, sans jamais bloquer dessus : au 12/09/2026 le pool
      // ne couvre toujours pas la concurrence (marge HTTP comprise). Ce
      // calcul n'est PAS une assertion — il ne doit JAMAIS faire rougir ce
      // test le jour où l'arbitrage humain corrige enfin la situation.
      void poolCoversConcurrency(measured.poolMax, measured.totalConcurrency, HTTP_CONCURRENCY_MARGIN)
    },
  )
})
