import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FindOptionsWhere, ObjectLiteral, QueryRunner } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import dataSource from '../database/data-source'
import { MarketCompanySignalEntity } from '../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../database/entities/market-ex-esn-at-client.entity'
import { MarketPersonPathEntity } from '../database/entities/market-person-path.entity'
import {
  buildCorpusLabel,
  classifyUpserts,
  corpusFile,
  findForbiddenPiiColumn,
  IMPORTABLE_FILES,
  MARKET_MEMORY_MANIFEST_FILE,
  MARKET_MEMORY_SOURCE_FAMILY,
  optionalDecimal,
  optionalText,
  parseCompanySignal,
  parseCompanyStack,
  parseEsnClient,
  parseExEsnAtClient,
  parseHeader,
  readCsvRecords,
  sha256Hex,
  validateManifest,
  type CompanySignalDraft,
  type ImportableFile,
  type MarketMemoryVintage,
} from '../modules/market-memory/market-memory-import'
import { parsePersonPath, personPathRowKey } from '../modules/market-memory/market-person-paths'

/**
 * L'INGESTION VERSIONNÉE ET TRANSACTIONNELLE du pack de mémoire marché.
 *
 *   pnpm --filter @bellum/api ingest:market-memory <dossier du pack> [--dry-run]
 *
 * Le dossier attendu contient `data/` ET un `manifest.json` à sa racine (voir
 * `MARKET_MEMORY_MANIFEST_FILE`). Le fichier d'identités et de coordonnées
 * livré à côté n'est JAMAIS lu : tout chemin passe par `corpusFile()`, dont le
 * paramètre est TYPÉ sur `IMPORTABLE_FILES` — un fichier hors liste ne compile
 * pas (#1617).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1615 / #1616 — CE QUE CE LOT CHANGE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX défauts mesurés avant ce lot :
 *
 *  1. **Aucun versionnement** — `grep -E 'checksum|manifest|dataset_version|
 *     sha256'` rendait zéro résultat. `loadPack()` REFUSE maintenant tout pack
 *     dont le manifest est absent, mal formé, ou dont une somme de contrôle ne
 *     correspond pas au fichier réel — AVANT toute lecture pour écriture.
 *
 *  2. ⚠️ **L'import n'était PAS transactionnel** — chaque lot de 500 lignes
 *     s'upsertait indépendamment, donc sa propre transaction Postgres
 *     implicite. Un plantage au lot 10 sur 20 laissait les lots 1 à 9 déjà
 *     écrits : un état MIXTE sur des tables PARTAGÉES entre des espaces
 *     concurrents. `runVersionedImport()` englobe maintenant TOUT le passage
 *     (les quatre tables) dans une SEULE transaction — voir son commentaire
 *     pour le choix « tout ou rien » plutôt qu'un curseur de reprise.
 *
 * `--dry-run` valide le pack, lit tout, compte tout, et n'ouvre AUCUNE
 * connexion à la base — le compte s'affiche avant qu'une seule ligne ne soit
 * écrite, dry-run ou pas : `loadPack()` fait tout le travail de lecture et de
 * classification EN MÉMOIRE, `main()` n'ouvre la base qu'après.
 *
 * ⚠️ Le corpus ne se commite pas. Il pèse plus de cent mégaoctets, et il vit
 * hors du dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOT 27 (#1615.4/#1615.5/#1616.3/#1603.5) — CE QUI S'AJOUTE PAR-DESSUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le versionnement et la transaction ci-dessus étaient DÉJÀ livrés (commit
 * `eebd8f5e4`, 09/09/2026). Ce lot complète le manifest de trois champs de plus
 * (`methodologyVersion`, `sourceArtifactUri`, `expectedRowCounts` — voir
 * `MarketMemoryVintage` et `validateManifest` dans `market-memory-import.ts`),
 * ajoute trois colonnes de provenance (`1791941000000-MarketMemoryProvenance`),
 * et ferme les cinq cas de FAIL de #1615.5 : provenance obsolète (`*_2022`),
 * PII dans l'entête d'un fichier autorisé (`findForbiddenPiiColumn`), checksum
 * inattendu (déjà là), et compte de lignes divergent (ci-dessous, dans
 * `loadPack`, APRÈS lecture car `readCsvRecords` seul sait compter juste un
 * champ cité multi-lignes).
 */

const BATCH_SIZE = 500

const PERSON_PATHS_FILE = '05_freelances.csv' satisfies ImportableFile

/** Sépare les parties d'une clé composite dans les Map internes — un octet
 *  qu'aucune valeur du corpus ne porte, donc jamais ambigu. */
const KEY_SEPARATOR = ''

export type MarketMemoryTable =
  | 'market_company_signal'
  | 'market_esn_client'
  | 'market_company_stack'
  | 'market_ex_esn_at_client'
  | 'market_person_paths'

// ─────────────────────────────────────────────────────────────────────────────
// L'ABSTRACTION TRANSACTIONNELLE — le contrat que `runVersionedImport` attend,
// implémenté une fois contre un vrai `QueryRunner` (plus bas), et une fois
// contre un double en mémoire dans `ingest-market-memory.spec.ts`. C'est ce
// qui rend la logique « une transaction, tout ou rien » TESTABLE sans base.
// ─────────────────────────────────────────────────────────────────────────────

export interface TableWriteOps {
  /** Les lignes déjà en base pour ces clés (composites, jointes par `KEY_SEPARATOR`). */
  fetchExisting(keys: readonly string[]): Promise<Map<string, Record<string, unknown>>>
  /** Écrit (insert ou update) — DANS la transaction en cours, jamais commité seul. */
  write(rows: ReadonlyArray<Record<string, unknown>>): Promise<void>
}

export interface ImportTransactionHandle {
  ops(table: string): TableWriteOps
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface ImportRunLogEntry {
  readonly status: 'success' | 'failed'
  readonly vintage: MarketMemoryVintage
  readonly checksums: Readonly<Record<string, string>>
  readonly startedAt: Date
  readonly finishedAt: Date
  readonly tables: readonly TableRunReport[]
  readonly error?: string
}

export interface ImportDeps {
  beginTransaction(): Promise<ImportTransactionHandle>
  /** TOUJOURS appelé, succès ou échec — c'est le JOURNAL D'AUDIT (#1616.4). */
  logRun(entry: ImportRunLogEntry): Promise<void>
}

export interface ImportTableInput {
  readonly table: MarketMemoryTable | string
  /** Lignes lues dans le fichier ANCRE de cette table — mesuré, jamais déduit. */
  readonly read: number
  /** Lignes du fichier ancre rejetées AU PARSING (clé manquante, etc.). */
  readonly rejected: number
  /** Les candidats KEPT — `read - rejected`, par construction du parseur. */
  readonly drafts: readonly Record<string, unknown>[]
  readonly keyOf: (draft: Record<string, unknown>) => string
  /** Colonnes comparées pour classer insert / update / inchangé. Exclut
   *  volontairement `imported_at` — voir `classifyUpserts`. */
  readonly compareFields: readonly string[]
}

export interface TableRunReport {
  readonly table: string
  readonly read: number
  readonly written: number
  readonly unchanged: number
  readonly rejected: number
}

export interface ImportRunResult {
  readonly status: 'success' | 'failed'
  readonly tables: readonly TableRunReport[]
  readonly error?: string
}

/**
 * #1616.4 — LA TRANSACTION QUI MANQUAIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE TRANSACTION « TOUT OU RIEN », PAS UN CURSEUR DE REPRISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le choix documenté par l'énoncé du lot : transaction OU curseur persisté.
 * Ce script est un CLI manuel, invoqué rarement (pas une routine planifiée),
 * sur un volume mesuré de l'ordre de la minute pour 60 000+ lignes. Un curseur
 * de reprise ajoute un ÉTAT PERSISTÉ supplémentaire (où en est-on, quelle
 * table, quel offset) qui doit lui-même survivre à un plantage — donc sa
 * propre garantie transactionnelle, pour un bénéfice quasi nul ici : la
 * relance après un rollback refait le travail depuis zéro en quelques dizaines
 * de secondes, et `classifyUpserts` garantit qu'un ré-import n'écrit QUE ce
 * qui a réellement changé. Une transaction unique est plus SIMPLE à auditer
 * (« soit tout est arrivé, soit rien ») et plus sûre à raisonner que deux
 * mécanismes de reprise qui pourraient diverger entre eux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT LES COMPTES S'ADDITIONNENT — JAMAIS PAR SOUSTRACTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour chaque table : `classifyUpserts` partitionne les brouillons KEPT en
 * trois listes DISJOINTES (insert / update / inchangé) dont la somme des
 * longueurs vaut TOUJOURS `drafts.length` — une addition de compteurs
 * indépendants, jamais une soustraction. `written = toInsert + toUpdate` est
 * mesuré directement sur ces listes, jamais deviné depuis `read`.
 */
export async function runVersionedImport(
  tables: readonly ImportTableInput[],
  vintage: MarketMemoryVintage,
  checksums: Readonly<Record<string, string>>,
  deps: ImportDeps,
): Promise<ImportRunResult> {
  const startedAt = new Date()
  const handle = await deps.beginTransaction()
  const reports: TableRunReport[] = []

  try {
    for (const input of tables) {
      const ops = handle.ops(input.table)
      const keys = input.drafts.map(input.keyOf)
      const existing = await ops.fetchExisting(keys)
      const { toInsert, toUpdate, unchanged } = classifyUpserts(
        input.drafts,
        existing,
        input.keyOf,
        input.compareFields,
      )
      const toWrite = [...toInsert, ...toUpdate]
      // ⚠️ Une ligne INCHANGÉE n'est JAMAIS envoyée à `write` : c'est ce qui
      // protège une correction opérée directement en base d'être réécrite par
      // un réimport du même pack, et ce qui rend un réimport à l'identique un
      // NO-OP réel plutôt qu'un NO-OP « optimisé » côté SQL seulement.
      if (toWrite.length > 0) await ops.write(toWrite)

      reports.push({
        table: input.table,
        read: input.read,
        written: toWrite.length,
        unchanged: unchanged.length,
        rejected: input.rejected,
      })
    }

    await handle.commit()
    await deps.logRun({ status: 'success', vintage, checksums, startedAt, finishedAt: new Date(), tables: reports })
    return { status: 'success', tables: reports }
  } catch (error) {
    // ⚠️ LE CŒUR DU CORRECTIF : le rollback annule TOUT ce qui a été écrit
    // dans CETTE transaction, y compris les tables déjà traitées avant la
    // panne. Avant #1616.4, chaque table (et chaque lot de 500 lignes en son
    // sein) committait indépendamment — un plantage au lot 10 sur 20 laissait
    // les 9 premiers en base. Ici, rien ne survit à un `catch`.
    await handle.rollback()
    const message = error instanceof Error ? error.message : String(error)
    await deps.logRun({
      status: 'failed',
      vintage,
      checksums,
      startedAt,
      finishedAt: new Date(),
      tables: [],
      error: message,
    })
    return { status: 'failed', tables: [], error: message }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURE DU PACK — pure IO + parsing, ZÉRO connexion base. `loadPack` fait
// tout le travail commun au dry-run et au run réel : valider, parser, tagger
// chaque brouillon de sa version/somme/période, calculer les comptes AVANT
// qu'une seule ligne ne soit écrite.
// ─────────────────────────────────────────────────────────────────────────────

interface TableDiagnostic {
  readonly file: string
  readonly read: number
  readonly kept: number
  readonly skipped: number
}

export type LoadPackResult =
  | {
      readonly ok: true
      readonly vintage: MarketMemoryVintage
      readonly checksums: Readonly<Record<ImportableFile, string>>
      readonly tables: readonly ImportTableInput[]
      readonly diagnostics: readonly TableDiagnostic[]
    }
  | { readonly ok: false; readonly reason: string }

/**
 * Rendu en `Record<string, unknown>` explicitement : c'est la forme que
 * `ImportTableInput.drafts` attend, et ce cast unique évite d'en refaire un à
 * chaque site d'appel (signal / esn / stack / exEsn). Les sept champs ajoutés
 * sont toujours les mêmes : `datasetVersion`, `methodologyVersion`,
 * `sourceFamily`, `sourceArtifactUri`, `sourceChecksum`, `periodStart`,
 * `periodEnd` (#1615.4/#1616.3).
 */
function withVintage<T extends object>(
  draft: T,
  vintage: MarketMemoryVintage,
  checksum: string,
): Record<string, unknown> {
  return {
    ...draft,
    datasetVersion: vintage.datasetVersion,
    methodologyVersion: vintage.methodologyVersion,
    sourceFamily: MARKET_MEMORY_SOURCE_FAMILY,
    sourceArtifactUri: vintage.sourceArtifactUri,
    sourceChecksum: checksum,
    periodStart: vintage.periodStart,
    periodEnd: vintage.periodEnd,
  }
}

/** Lit un fichier de liens (esn/stack/exEsn) en mémoire — un CSV = une table. */
async function collectCandidates<T>(
  path: string,
  parse: (record: Record<string, string>) => T | null,
): Promise<{ read: number; kept: number; rows: T[] }> {
  const rows: T[] = []
  const { read, kept } = await readCsvRecords(createReadStream(path, { encoding: 'utf8' }), record => {
    const parsed = parse(record)
    if (parsed === null) return false
    rows.push(parsed)
    return true
  })
  return { read, kept, rows }
}

// ⚠️ Les sept champs de provenance (#1615.4/#1616.3) sont RÉPÉTÉS sur les
// quatre listes ci-dessous — le choix documenté dans `classifyUpserts`
// (`market-memory-import.ts`) : ils voyagent avec `corpusLabel` pour que le
// réimport à l'identique reste un NO-OP, et qu'un vrai changement de
// méthodologie ou d'artefact source déclenche une mise à jour.
const PROVENANCE_COMPARE_FIELDS = [
  'corpusLabel',
  'datasetVersion',
  'methodologyVersion',
  'sourceFamily',
  'sourceArtifactUri',
  'sourceChecksum',
  'periodStart',
  'periodEnd',
] as const

const SIGNAL_COMPARE_FIELDS = [
  'companyName',
  'matchKey',
  'websiteDomain',
  'isServiceCompany',
  'pathsTotal',
  'pathsCurrent',
  'pathsPast',
  'externalizationScore',
  'roleFamilies',
  'headcountBracket',
  'headcountMin',
  'headcountMax',
  'city',
  'region',
  'country',
  'website',
  'esnObservedCount',
  'technosObservedCount',
  'exEsnPresent',
  'rotationRatio',
  'hasCeased',
  'connectorCount',
  ...PROVENANCE_COMPARE_FIELDS,
] as const

const ESN_COMPARE_FIELDS = ['esnName', 'clientName', 'persons', ...PROVENANCE_COMPARE_FIELDS] as const

const STACK_COMPARE_FIELDS = ['persons', ...PROVENANCE_COMPARE_FIELDS] as const

const EX_ESN_COMPARE_FIELDS = ['esnOriginName', 'clientName', 'persons', ...PROVENANCE_COMPARE_FIELDS] as const

/** Lot 775 — les colonnes qui comptent pour reconnaître qu'un parcours a changé (hors identité : il n'y en a pas). */
const PERSON_PATH_COMPARE_FIELDS = [
  'companyName',
  'jobTitle',
  'roleFamily',
  'skills',
  'datePrecision',
  'workStatus',
  'esnName',
  'dailyRateEur',
  'missionCity',
  'missionRegion',
  ...PROVENANCE_COMPARE_FIELDS,
] as const

interface LoadPackOptions {
  /** `MARKET_MEMORY_PERSON_HASH_KEY` — le sel du pseudonyme. Absent ⇒ le pack est REFUSÉ. */
  readonly personHashKey?: string
}

export async function loadPack(packDir: string, options: LoadPackOptions = {}): Promise<LoadPackResult> {
  const personHashKey = (options.personHashKey ?? process.env['MARKET_MEMORY_PERSON_HASH_KEY'] ?? '').trim()
  if (personHashKey.length === 0) {
    return {
      ok: false,
      reason:
        'MARKET_MEMORY_PERSON_HASH_KEY absente : les parcours ne s’importent pas sans le sel du pseudonyme (no-op strict).',
    }
  }
  const dataDir = join(packDir, 'data')
  if (!existsSync(dataDir)) {
    return { ok: false, reason: `Dossier introuvable : ${dataDir}` }
  }

  // ── 1. LE MANIFEST — validé AVANT toute lecture destinée à l'écriture ──────
  const manifestPath = join(packDir, MARKET_MEMORY_MANIFEST_FILE)
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: `Manifest introuvable : ${manifestPath}` }
  }

  let manifestRaw: unknown
  try {
    manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return { ok: false, reason: `Manifest illisible (JSON invalide) : ${manifestPath}` }
  }

  // ⚠️ #1615.5 — FAIL 1 & 2 : la seconde ligne de défense contre la PII se
  // joue ICI, sur le CONTENU déjà lu pour le hash — aucune lecture de plus.
  // Une colonne qui ressemble à une donnée personnelle dans l'entête d'un
  // fichier PAR AILLEURS autorisé refuse le pack ENTIER, avant même que le
  // manifest soit validé : ce n'est pas une question de version, c'est un
  // interdit structurel (voir `findForbiddenPiiColumn`).
  const actualChecksums: Partial<Record<ImportableFile, string>> = {}
  for (const file of IMPORTABLE_FILES) {
    const filePath = corpusFile(dataDir, file)
    if (!existsSync(filePath)) continue
    const content = readFileSync(filePath)
    actualChecksums[file] = sha256Hex(content)

    // Lot 775 — `05_freelances.csv` porte des colonnes d'identité PAR NATURE : elles sont retirées à la lecture
    // (`stripDirectIdentifiers`), jamais écrites. Les autres fichiers gardent ce second filet.
    if (file === PERSON_PATHS_FILE) continue
    const firstLine = content.toString('utf8').split(/\r?\n/, 1)[0] ?? ''
    const forbiddenColumn = findForbiddenPiiColumn(parseHeader(firstLine))
    if (forbiddenColumn !== null) {
      return { ok: false, reason: `pack : ${file} — ${forbiddenColumn}` }
    }
  }

  const validation = validateManifest(manifestRaw, actualChecksums)
  if (!validation.valid) {
    return { ok: false, reason: validation.reason }
  }
  const { vintage, checksums, expectedRowCounts } = validation
  const corpusLabel = buildCorpusLabel(vintage)

  const diagnostics: TableDiagnostic[] = []
  const signals = new Map<string, CompanySignalDraft>()

  // ── 2. LES ENTREPRISES — le fichier ANCRE du signal ────────────────────────
  const signalPath = corpusFile(dataDir, '02_entreprises.csv')
  const signalRead = await readCsvRecords(createReadStream(signalPath, { encoding: 'utf8' }), record => {
    const draft = parseCompanySignal(record, corpusLabel)
    if (draft === null) return false
    signals.set(draft.companyKey, draft)
    return true
  })
  diagnostics.push({
    file: '02_entreprises',
    read: signalRead.read,
    kept: signalRead.kept,
    skipped: signalRead.read - signalRead.kept,
  })

  // ── 3. LES TROIS SIGNAUX QUI COMPLÈTENT une entreprise déjà lue ────────────
  // Une clé absente de `signals` est ignorée : elle désignerait une entreprise
  // que le fichier principal n'a pas, donc une ligne que rien ne pourrait lire.
  const rotationRead = await readCsvRecords(
    createReadStream(corpusFile(dataDir, '12_rotation_freelances.csv'), { encoding: 'utf8' }),
    record => {
      const key = optionalText(record.cle)
      const draft = key ? signals.get(key) : undefined
      if (!draft) return false
      draft.rotationRatio = optionalDecimal(record.rotation)
      return true
    },
  )
  diagnostics.push({
    file: '12_rotation',
    read: rotationRead.read,
    kept: rotationRead.kept,
    skipped: rotationRead.read - rotationRead.kept,
  })

  const ceasedRead = await readCsvRecords(
    createReadStream(corpusFile(dataDir, '17_entreprises_ayant_cesse.csv'), { encoding: 'utf8' }),
    record => {
      const key = optionalText(record.cle)
      const draft = key ? signals.get(key) : undefined
      if (!draft) return false
      draft.hasCeased = true
      return true
    },
  )
  diagnostics.push({
    file: '17_cessations',
    read: ceasedRead.read,
    kept: ceasedRead.kept,
    skipped: ceasedRead.read - ceasedRead.kept,
  })

  const connectorsRead = await readCsvRecords(
    createReadStream(corpusFile(dataDir, '18_connecteurs_par_entreprise.csv'), { encoding: 'utf8' }),
    record => {
      const key = optionalText(record.cle)
      const draft = key ? signals.get(key) : undefined
      if (!draft) return false
      draft.connectorCount = Number.parseInt(record.freelances_multi_clients ?? '0', 10) || 0
      return true
    },
  )
  diagnostics.push({
    file: '18_connecteurs',
    read: connectorsRead.read,
    kept: connectorsRead.kept,
    skipped: connectorsRead.read - connectorsRead.kept,
  })

  const signalChecksum = checksums['02_entreprises.csv']
  const signalRows: Record<string, unknown>[] = [...signals.values()].map(draft =>
    withVintage(draft, vintage, signalChecksum),
  )

  // ── 4. LES TROIS FICHIERS DE LIENS — chacun son propre fichier ANCRE ───────
  const esnPath = corpusFile(dataDir, '08_esn_observees_chez_clients.csv')
  const esnCollected = await collectCandidates(esnPath, record => parseEsnClient(record, corpusLabel))
  const esnRows: Record<string, unknown>[] = esnCollected.rows.map(draft =>
    withVintage(draft, vintage, checksums['08_esn_observees_chez_clients.csv']),
  )

  const stackPath = corpusFile(dataDir, '09_technos_par_entreprise.csv')
  const stackCollected = await collectCandidates(stackPath, record => parseCompanyStack(record, corpusLabel))
  const stackRows: Record<string, unknown>[] = stackCollected.rows.map(draft =>
    withVintage(draft, vintage, checksums['09_technos_par_entreprise.csv']),
  )

  const exEsnPath = corpusFile(dataDir, '11_anciens_esn_chez_clients.csv')
  const exEsnCollected = await collectCandidates(exEsnPath, record => parseExEsnAtClient(record, corpusLabel))
  const exEsnRows: Record<string, unknown>[] = exEsnCollected.rows.map(draft =>
    withVintage(draft, vintage, checksums['11_anciens_esn_chez_clients.csv']),
  )

  // ── 5. LES PARCOURS — identifiants directs retirés À LA LECTURE (lot 775) ──
  const companyKeyByMatchKey = new Map<string, string | null>()
  for (const draft of signals.values()) {
    companyKeyByMatchKey.set(draft.matchKey, companyKeyByMatchKey.has(draft.matchKey) ? null : draft.companyKey)
  }
  const personChecksum = checksums[PERSON_PATHS_FILE]
  const pathRows: Record<string, unknown>[] = []
  const pathsRead = await readCsvRecords(
    createReadStream(corpusFile(dataDir, '05_freelances.csv'), { encoding: 'utf8' }),
    record => {
      const draft = parsePersonPath(record, {
        hashKey: personHashKey,
        corpusLabel,
        datasetVersion: vintage.datasetVersion,
        sourceChecksum: personChecksum,
        resolveCompanyKey: ({ companyKey, matchKey }) => {
          if (companyKey !== null && signals.has(companyKey)) return companyKey
          // Nom normalisé : seulement s'il désigne UNE entreprise du corpus — jamais deviné.
          return companyKeyByMatchKey.get(matchKey) ?? null
        },
      })
      if (draft === null) return false
      pathRows.push(withVintage({ ...draft, rowKey: personPathRowKey(draft) }, vintage, personChecksum))
      return true
    },
  )
  diagnostics.push({
    file: '05_freelances',
    read: pathsRead.read,
    kept: pathsRead.kept,
    skipped: pathsRead.read - pathsRead.kept,
  })

  const tables: ImportTableInput[] = [
    {
      table: 'market_company_signal',
      read: signalRead.read,
      rejected: signalRead.read - signalRead.kept,
      drafts: signalRows,
      keyOf: draft => String(draft['companyKey']),
      compareFields: SIGNAL_COMPARE_FIELDS,
    },
    {
      table: 'market_esn_client',
      read: esnCollected.read,
      rejected: esnCollected.read - esnCollected.kept,
      drafts: esnRows,
      keyOf: draft => `${String(draft['esnKey'])}${KEY_SEPARATOR}${String(draft['clientKey'])}`,
      compareFields: ESN_COMPARE_FIELDS,
    },
    {
      table: 'market_company_stack',
      read: stackCollected.read,
      rejected: stackCollected.read - stackCollected.kept,
      drafts: stackRows,
      keyOf: draft => `${String(draft['companyKey'])}${KEY_SEPARATOR}${String(draft['techno'])}`,
      compareFields: STACK_COMPARE_FIELDS,
    },
    {
      table: 'market_ex_esn_at_client',
      read: exEsnCollected.read,
      rejected: exEsnCollected.read - exEsnCollected.kept,
      drafts: exEsnRows,
      keyOf: draft => `${String(draft['esnOriginKey'])}${KEY_SEPARATOR}${String(draft['clientKey'])}`,
      compareFields: EX_ESN_COMPARE_FIELDS,
    },
    {
      table: 'market_person_paths',
      read: pathsRead.read,
      rejected: pathsRead.read - pathsRead.kept,
      drafts: pathRows,
      keyOf: draft => String(draft['rowKey']),
      compareFields: PERSON_PATH_COMPARE_FIELDS,
    },
  ]

  // ⚠️ #1615.4/#1615.5 — FAIL 5 : un compte de lignes RÉEL qui diverge du
  // compte ATTENDU du manifest, SANS validation, refuse le pack ENTIER. Le
  // compte réel n'existe qu'APRÈS lecture (`readCsvRecords` gère les retours
  // à la ligne cités, une simple découpe par ligne les compterait mal) — donc
  // cette comparaison ne peut pas vivre dans `validateManifest` (pure, sans
  // IO) : elle est ici, mais reste strictement AVANT toute connexion à la
  // base (`main()` n'ouvre `dataSource` qu'après le retour de `loadPack`).
  const actualRowCounts: Record<ImportableFile, number> = {
    '02_entreprises.csv': signalRead.read,
    '05_freelances.csv': pathsRead.read,
    '08_esn_observees_chez_clients.csv': esnCollected.read,
    '09_technos_par_entreprise.csv': stackCollected.read,
    '11_anciens_esn_chez_clients.csv': exEsnCollected.read,
    '12_rotation_freelances.csv': rotationRead.read,
    '17_entreprises_ayant_cesse.csv': ceasedRead.read,
    '18_connecteurs_par_entreprise.csv': connectorsRead.read,
  }
  for (const file of IMPORTABLE_FILES) {
    const expected = expectedRowCounts[file]
    const actual = actualRowCounts[file]
    if (expected !== actual) {
      return {
        ok: false,
        reason: `pack : nombre de lignes divergent pour ${file} (attendu ${expected}, lu ${actual})`,
      }
    }
  }

  return { ok: true, vintage, checksums, tables, diagnostics }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION — l'implémentation réelle de `ImportDeps`, contre un QueryRunner
// TypeORM. Non testée directement (c'est un adaptateur IO fin) ; la logique
// transactionnelle qu'elle sert est prouvée par `runVersionedImport` ci-dessus.
// ─────────────────────────────────────────────────────────────────────────────

function decodeKey(key: string, keyColumns: readonly string[]): Record<string, string> {
  const parts = key.split(KEY_SEPARATOR)
  const where: Record<string, string> = {}
  keyColumns.forEach((column, index) => {
    where[column] = parts[index] ?? ''
  })
  return where
}

function buildOps<Entity extends ObjectLiteral>(
  queryRunner: QueryRunner,
  entity: new () => Entity,
  keyColumns: readonly string[],
): TableWriteOps {
  const repo = queryRunner.manager.getRepository(entity)
  return {
    async fetchExisting(keys) {
      if (keys.length === 0) return new Map()
      const where = keys.map(key => decodeKey(key, keyColumns)) as FindOptionsWhere<Entity>[]
      const rows = await repo.find({ where })
      const map = new Map<string, Record<string, unknown>>()
      for (const row of rows) {
        const record = row as unknown as Record<string, unknown>
        const key = keyColumns.map(column => String(record[column] ?? '')).join(KEY_SEPARATOR)
        map.set(key, record)
      }
      return map
    },
    async write(rows) {
      for (let index = 0; index < rows.length; index += BATCH_SIZE) {
        const chunk = rows.slice(index, index + BATCH_SIZE)
        await repo.upsert(chunk as QueryDeepPartialEntity<Entity>[], {
          conflictPaths: [...keyColumns],
          skipUpdateIfNoValuesChanged: true,
        })
      }
    },
  }
}

function opsFor(queryRunner: QueryRunner, table: string): TableWriteOps {
  switch (table) {
    case 'market_company_signal':
      return buildOps(queryRunner, MarketCompanySignalEntity, ['companyKey'])
    case 'market_esn_client':
      return buildOps(queryRunner, MarketEsnClientEntity, ['esnKey', 'clientKey'])
    case 'market_company_stack':
      return buildOps(queryRunner, MarketCompanyStackEntity, ['companyKey', 'techno'])
    case 'market_ex_esn_at_client':
      return buildOps(queryRunner, MarketExEsnAtClientEntity, ['esnOriginKey', 'clientKey'])
    case 'market_person_paths':
      return buildOps(queryRunner, MarketPersonPathEntity, ['rowKey'])
    default:
      throw new Error(`Table de mémoire marché inconnue : ${table}`)
  }
}

function createTypeOrmDeps(): ImportDeps {
  return {
    async beginTransaction(): Promise<ImportTransactionHandle> {
      const queryRunner = dataSource.createQueryRunner()
      await queryRunner.connect()
      await queryRunner.startTransaction()
      return {
        ops: table => opsFor(queryRunner, table),
        async commit() {
          await queryRunner.commitTransaction()
          await queryRunner.release()
        },
        async rollback() {
          await queryRunner.rollbackTransaction()
          await queryRunner.release()
        },
      }
    },
    // ⚠️ LE JOURNAL D'AUDIT (#1616.4) — une ligne structurée par run, quel que
    // soit le résultat. Pas de nouvelle table : une table créée par migration
    // SANS entité TypeORM déclenche GA-65 (`table-scope-registry.spec.ts`), qui
    // exige alors une entrée dans `table-scopes.ts` — fichier réservé à
    // l'intégrateur (hors du périmètre de ce lot, voir le rapport). Cette
    // ligne `AUDIT_JOURNAL <json>` est donc DÉLIBÉRÉMENT le seul journal pour
    // l'instant : préfixée, grep-able, et elle porte tout ce qu'une future
    // page d'administration lirait (version, période, sommes, compte par
    // table, statut, erreur) — voir « CE QUE JE N'AI PAS FAIT » du rapport.
    async logRun(entry) {
      console.log(
        'AUDIT_JOURNAL',
        JSON.stringify({
          ...entry,
          startedAt: entry.startedAt.toISOString(),
          finishedAt: entry.finishedAt.toISOString(),
        }),
      )
    },
  }
}

async function main(): Promise<void> {
  const packDir = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  if (!packDir) {
    console.error('Usage: ingest-market-memory <dossier du pack> [--dry-run]')
    process.exitCode = 1
    return
  }

  const loaded = await loadPack(packDir)
  if (!loaded.ok) {
    console.error(`Pack invalide — ${loaded.reason}`)
    process.exitCode = 1
    return
  }
  const { vintage, checksums, tables, diagnostics } = loaded

  console.log(`Pack validé : ${vintage.datasetVersion} (${vintage.periodStart}..${vintage.periodEnd})`)
  for (const diagnostic of diagnostics) {
    console.log(
      `${diagnostic.file.padEnd(20)} lues ${diagnostic.read}  retenues ${diagnostic.kept}  écartées ${diagnostic.skipped}`,
    )
  }

  // ⚠️ Le compte s'affiche ICI, AVANT toute connexion base — vrai en
  // `--dry-run` (qui s'arrête juste après) ET en run réel (la base ne s'ouvre
  // qu'après cette boucle).
  for (const table of tables) {
    console.log(
      `${String(table.table).padEnd(24)} lues ${table.read}  candidates ${table.drafts.length}  rejetées ${table.rejected}`,
    )
  }

  if (dryRun) {
    console.log('Mode à blanc : aucune connexion à la base, aucune écriture.')
    return
  }

  await dataSource.initialize()
  let result: ImportRunResult
  try {
    result = await runVersionedImport(tables, vintage, checksums, createTypeOrmDeps())
  } finally {
    await dataSource.destroy()
  }

  for (const report of result.tables) {
    console.log(
      `${report.table.padEnd(24)} lues ${report.read}  écrites ${report.written}  inchangées ${report.unchanged}  rejetées ${report.rejected}`,
    )
  }

  if (result.status === 'failed') {
    console.error(`Import ÉCHOUÉ, transaction annulée (rien n'a été persisté) — ${result.error}`)
    process.exitCode = 1
    return
  }
  console.log('Import terminé avec succès — transaction validée.')
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
