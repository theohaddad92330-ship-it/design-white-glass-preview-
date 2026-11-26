import { createHash } from 'node:crypto'
import { createRecordAssembler } from '../dataforge/dataforge-csv'
import { marketMatchKey, marketRootDomain } from './market-company-key'

/**
 * La lecture du pack de mémoire marché — la partie PURE, séparée de l'IO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT PARTIEL ET DATÉ — Louis 02/11/2026 (lot 775, GA-352)
 * ─────────────────────────────────────────────────────────────────────────────
 * « tout mettre comme donnée sauf le nom et prénom et genre, num et adresse mail ; pour le reste tu peux te servir
 * de toutes les données ». Ce qui change : les PARCOURS individuels (`05_freelances.csv`) entrent, SANS identité —
 * identifiants directs retirés à la lecture (`market-memory-identifiers.ts`, liste fermée : nom, prénom, nom
 * complet, genre/civilité, téléphone, e-mail, URL de profil, photo, adresse postale, date de naissance/âge),
 * pseudonyme HMAC salé (`market-person-paths.ts`). Ce qui NE change PAS : le fichier d'identités et de
 * coordonnées reste refusé (ci-dessous, texte d'origine conservé) ; les trois fichiers d'agrégats à URL de profil
 * restent dehors (une URL de profil est un identifiant direct) ; aucun critère protégé dans un rang.
 * L'historique ci-dessous est gardé tel quel : c'est la raison du refus qui reste vraie pour ce qu'il vise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REFUSE D'IMPORTER, ET POURQUOI C'EST ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pack livré contient un fichier d'identités et de coordonnées, rangé à part
 * par son auteur avec la mention « ne pas intégrer sans avis juridique ». Il
 * n'est PAS importé : base légale de la collecte d'origine, information des
 * personnes concernées et finalité d'une réutilisation n'ont pas été tranchées,
 * et aucun usage produit n'en a besoin. `IMPORTABLE_FILES` est la liste
 * EXHAUSTIVE de ce qui entre — un fichier qui n'y est pas ne s'importe pas par
 * accident, et l'ajouter demande d'écrire pourquoi.
 *
 * Les trois fichiers d'agrégats qui portent une URL de profil ne sont pas non
 * plus dans la liste : rien de ce que le produit affiche n'en a besoin, et une
 * URL de profil reste une donnée personnelle même sans nom à côté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TRAVERSE TOUTES LES CONVERSIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une cellule vide devient `null`, jamais `0`. Le corpus laisse volontairement
 * son score vide sous trois observations — le remplir par zéro à l'import
 * transformerait « pas assez pour noter » en « noté zéro », et plus rien ensuite
 * ne pourrait distinguer les deux.
 */

/** Les fichiers du pack qui entrent en base. La liste est exhaustive, exprès. */
/**
 * #1603.3 — L'ÉTIQUETTE D'AUDIT DU CORPUS, À UN SEUL ENDROIT.
 *
 * Elle vivait dans `scripts/ingest-market-memory.ts`, privée au script CLI :
 * l'ingestion l'écrivait sur les quatre tables, et le module qui les remplit
 * ne la connaissait pas. Un réglage vit à un seul endroit (GA-26) — celui-ci
 * vit désormais avec le code qui l'écrit, et le script l'importe.
 *
 * ⚠️ LA VALEUR A CHANGÉ LE 11/09/2026, AVEC SA REPRISE — et l'ordre des deux
 * est tout le sujet. Le point #1603.3 demandait `bellum_market_memory_v1` comme
 * nom canonique ; il avait été refusé DEUX fois, et le refus était juste :
 * renommer la constante seule aurait coupé le corpus en deux, puisque les
 * ~60 067 lignes déjà en production portaient `parcours-observes`. Cette colonne
 * n'a qu'UN usage — savoir d'où vient une ligne — et deux étiquettes pour un
 * même corpus détruisent exactement ce pour quoi elle existe.
 *
 * Louis a tranché (« oui migration »), et la reprise part dans le MÊME lot :
 * `1792610000000-MarketMemoryCorpusLabelRename`, idempotente, qui réécrit le
 * seul PRÉFIXE des quatre tables en gardant version et période.
 *
 * `corpus_label` ne sort toujours jamais vers un écran (garde dans
 * `market-memory.service.spec.ts`).
 */
export const MARKET_MEMORY_CORPUS_LABEL = 'bellum_market_memory_v1'

/**
 * #1616.3 — LA FAMILLE DE SOURCE, À UN SEUL ENDROIT (GA-26).
 *
 * Le retour #1616 demande que chaque ligne porte `source_family =
 * bellum_market_memory` : une seule famille de source existe aujourd'hui (le
 * corpus « parcours-observes »), donc la valeur est une CONSTANTE écrite par
 * le code d'ingestion — pas un champ saisi dans `manifest.json`, puisqu'un
 * pack ne peut pas encore déclarer une AUTRE famille. Le jour où une seconde
 * famille de source existe (ex. un corpus issu d'un autre fournisseur), cette
 * constante devient un paramètre — pas avant, sinon c'est une colonne que
 * personne ne fait varier.
 */
export const MARKET_MEMORY_SOURCE_FAMILY = 'bellum_market_memory'

export const IMPORTABLE_FILES = [
  '02_entreprises.csv',
  /** Lot 775 — décision Louis 02/11/2026 : les parcours entrent, sans identifiant direct (retirés à la lecture). */
  '05_freelances.csv',
  '08_esn_observees_chez_clients.csv',
  '09_technos_par_entreprise.csv',
  '11_anciens_esn_chez_clients.csv',
  '12_rotation_freelances.csv',
  '17_entreprises_ayant_cesse.csv',
  '18_connecteurs_par_entreprise.csv',
] as const

/** Un fichier que le pack a le droit de faire entrer en base. */
export type ImportableFile = (typeof IMPORTABLE_FILES)[number]

/**
 * LE SEUL CHEMIN vers un fichier du pack.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION EXISTE (#1617, trouvé en mesurant)
 * ─────────────────────────────────────────────────────────────────────────────
 * `IMPORTABLE_FILES` est la liste qui EXCLUT les trois fichiers du pack portant
 * des e-mails, des noms de personnes et des URL de profil. C'est la garde la
 * plus sensible de ce module.
 *
 * **Personne ne la lisait.** Le script d'ingestion écrivait ses sept noms de
 * fichiers en dur (`join(dataDir, '02_entreprises.csv')`, sept fois), et son
 * propre commentaire affirmait pourtant : *« ce script ne connaît que la liste
 * `IMPORTABLE_FILES`, et ce qui n'y est pas n'a aucun chemin pour entrer »*.
 * C'était faux. L'exclusion des données personnelles tenait par la DISCIPLINE de
 * celui qui écrivait le script, pas par une porte — c'est le défaut n°1 de ce
 * dépôt (du code juste que personne n'appelle), appliqué à son sujet le plus
 * sensible, et avec sa propre justification pour le cacher.
 *
 * Le remède n'est pas de « faire attention » : c'est de retirer le MOYEN. Un
 * chemin ne se construit plus qu'ici, et le paramètre est typé sur la liste —
 * `corpusFile(dir, '05_freelances.csv')` ne compile pas.
 */
export function corpusFile(dataDir: string, file: ImportableFile): string {
  return `${dataDir}/${file}`
}

/**
 * #1615 — LE VERSIONNEMENT DU PACK : manifest, sommes de contrôle, période.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE SECTION AJOUTE, ET POURQUOI ELLE RESTE PURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pack livré n'a jamais porté de version, de somme de contrôle ni de
 * période observée (`grep -E 'checksum|manifest|dataset_version|sha256'` →
 * zéro résultat avant #1615). Sans ça : impossible de dire quelle version a
 * écrit une ligne, de revenir en arrière, ou de savoir si le corpus est
 * encore d'actualité.
 *
 * `validateManifest` lit un `manifest.json` (posé à la racine du pack, à côté
 * du dossier `data/`) et REFUSE le pack entier avant toute écriture s'il est
 * incomplet, mal formé, ou si une somme de contrôle ne correspond pas au
 * fichier réel. Elle reste pure : la lecture des octets et le calcul des
 * sommes réelles restent dans `ingest-market-memory.ts` (IO), qui les lui
 * passe déjà calculées — c'est ce qui la rend testable sans toucher un disque.
 *
 * ⚠️ Elle n'itère JAMAIS que sur `IMPORTABLE_FILES` : une somme de contrôle
 * présente dans le manifest pour un fichier hors de cette liste (le fichier
 * d'identités et de coordonnées, par exemple) n'est jamais lue ni retournée —
 * la même porte typée que `corpusFile`, appliquée ici. Un fichier hors
 * allowlist reste exclu même si quelqu'un l'ajoute au manifest.
 */

/** Le nom du fichier de manifest, à la racine du pack (à côté de `data/`). */
export const MARKET_MEMORY_MANIFEST_FILE = 'manifest.json'

/**
 * La version d'un pack, sa MÉTHODOLOGIE, sa provenance et la PÉRIODE que ses
 * observations couvrent.
 *
 * `methodologyVersion` et `sourceArtifactUri` complètent `datasetVersion`
 * (#1615.4) : trois questions d'audit différentes — QUEL jeu de données, QUELLE
 * méthode de résolution/scoring l'a produit, et D'OÙ il vient (l'artefact
 * source, ex. un lien Drive) — que `dataset_version` seul ne peut pas
 * distinguer. Comme `datasetVersion`, elles ne sortent JAMAIS d'une lecture
 * produit : colonnes d'audit, comme `corpus_label`.
 */
export interface MarketMemoryVintage {
  readonly datasetVersion: string
  readonly methodologyVersion: string
  readonly sourceArtifactUri: string
  readonly periodStart: string // 'YYYY-MM-DD' — une PÉRIODE de corpus, jamais une date individuelle.
  readonly periodEnd: string // 'YYYY-MM-DD'
}

/** Le résultat de la validation d'un pack — jamais un `throw` : la raison voyage. */
type PackValidation =
  | {
      readonly valid: true
      readonly vintage: MarketMemoryVintage
      readonly checksums: Readonly<Record<ImportableFile, string>>
      /** #1615.4/#1615.5 — comptes de lignes ATTENDUS, un entier ≥ 0 par fichier
       *  importable. Comparés aux comptes RÉELS par l'appelant (IO), après
       *  lecture — voir `loadPack` dans `ingest-market-memory.ts` : FAIL 5. */
      readonly expectedRowCounts: Readonly<Record<ImportableFile, number>>
    }
  | { readonly valid: false; readonly reason: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * #1615.5 — FAIL 3 : une provenance OBSOLÈTE. Le retour nomme explicitement
 * `salesql_export_2022` (ou équivalent) — le corpus courant parle de
 * 2024-2025, et un millésime 2022 dans le nom de version signale un export
 * qu'on croyait remplacé. Testé sur `version`, pas sur le label composé : le
 * label n'existe qu'APRÈS validation, et la garde doit agir AVANT.
 */
const OBSOLETE_PROVENANCE_PATTERN = /2022|salesql/i

/** Sha256 hexadécimal d'un contenu déjà lu — le calcul pur, séparé de l'IO. */
export function sha256Hex(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Valide la forme du manifest ET ses sommes de contrôle contre celles
 * réellement calculées par l'appelant — AVANT toute écriture en base.
 *
 * `actualChecksums` ne porte que ce que l'appelant a pu lire et hacher ; un
 * fichier absent de cette map (introuvable, illisible) fait échouer la
 * validation exactement comme une somme qui ne correspond pas.
 */
export function validateManifest(
  raw: unknown,
  actualChecksums: Readonly<Partial<Record<ImportableFile, string>>>,
): PackValidation {
  if (raw === null || typeof raw !== 'object') {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} absent ou illisible (JSON objet attendu)` }
  }
  const manifest = raw as Record<string, unknown>

  const version = typeof manifest.version === 'string' ? manifest.version.trim() : ''
  if (version.length === 0) {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : "version" manquante ou vide` }
  }
  if (OBSOLETE_PROVENANCE_PATTERN.test(version)) {
    return {
      valid: false,
      reason: `${MARKET_MEMORY_MANIFEST_FILE} : "version" porte une provenance obsolète (${version}) — le corpus est 2024-2025`,
    }
  }

  const methodologyVersion = typeof manifest.methodologyVersion === 'string' ? manifest.methodologyVersion.trim() : ''
  if (methodologyVersion.length === 0) {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : "methodologyVersion" manquante ou vide` }
  }

  const sourceArtifactUri = typeof manifest.sourceArtifactUri === 'string' ? manifest.sourceArtifactUri.trim() : ''
  if (sourceArtifactUri.length === 0) {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : "sourceArtifactUri" manquante ou vide` }
  }

  const periodStart = typeof manifest.periodStart === 'string' ? manifest.periodStart : ''
  const periodEnd = typeof manifest.periodEnd === 'string' ? manifest.periodEnd : ''
  if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
    return {
      valid: false,
      reason: `${MARKET_MEMORY_MANIFEST_FILE} : "periodStart"/"periodEnd" doivent être au format YYYY-MM-DD`,
    }
  }
  if (periodStart > periodEnd) {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : période inversée (${periodStart} > ${periodEnd})` }
  }

  const declared = manifest.checksums
  if (declared === null || typeof declared !== 'object') {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : "checksums" manquant ou invalide` }
  }
  const declaredChecksums = declared as Record<string, unknown>

  // ⚠️ La boucle porte SEULEMENT sur `IMPORTABLE_FILES` : une clé étrangère à
  // cette liste dans `declaredChecksums` n'est jamais lue — c'est la garde.
  const checksums: Partial<Record<ImportableFile, string>> = {}
  for (const file of IMPORTABLE_FILES) {
    const declaredValue = declaredChecksums[file]
    if (typeof declaredValue !== 'string' || declaredValue.trim().length === 0) {
      return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : somme de contrôle manquante pour ${file}` }
    }
    const actual = actualChecksums[file]
    if (actual === undefined) {
      return { valid: false, reason: `pack : fichier introuvable ou illisible — ${file}` }
    }
    if (actual !== declaredValue) {
      return {
        valid: false,
        reason: `pack : somme de contrôle invalide pour ${file} (manifest ${declaredValue}, calculé ${actual})`,
      }
    }
    checksums[file] = declaredValue
  }

  // ⚠️ #1615.4/#1615.5 — FAIL 5 (structure) : un compte de lignes ATTENDU par
  // fichier importable, entier ≥ 0. La même porte typée que `checksums` :
  // seul `IMPORTABLE_FILES` est lu, un fichier hors liste n'entre jamais dans
  // le résultat même déclaré dans le manifest.
  const declaredCounts = manifest.expectedRowCounts
  if (declaredCounts === null || typeof declaredCounts !== 'object') {
    return { valid: false, reason: `${MARKET_MEMORY_MANIFEST_FILE} : "expectedRowCounts" manquant ou invalide` }
  }
  const declaredRowCounts = declaredCounts as Record<string, unknown>

  const expectedRowCounts: Partial<Record<ImportableFile, number>> = {}
  for (const file of IMPORTABLE_FILES) {
    const declaredCount = declaredRowCounts[file]
    if (typeof declaredCount !== 'number' || !Number.isInteger(declaredCount) || declaredCount < 0) {
      return {
        valid: false,
        reason: `${MARKET_MEMORY_MANIFEST_FILE} : "expectedRowCounts" invalide ou manquant pour ${file} (entier ≥ 0 attendu)`,
      }
    }
    expectedRowCounts[file] = declaredCount
  }

  return {
    valid: true,
    vintage: { datasetVersion: version, methodologyVersion, sourceArtifactUri, periodStart, periodEnd },
    checksums: checksums as Record<ImportableFile, string>,
    expectedRowCounts: expectedRowCounts as Record<ImportableFile, number>,
  }
}

/**
 * #1615.5 — FAIL 1 & 2 : une colonne d'ENTÊTE qui ressemble à une donnée
 * personnelle (URL LinkedIn, e-mail, téléphone) dans un fichier PAR AILLEURS
 * autorisé (`IMPORTABLE_FILES`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECONDE ligne de défense, pas la première
 * ─────────────────────────────────────────────────────────────────────────────
 * La première ligne de défense reste `IMPORTABLE_FILES` : les trois fichiers
 * qui PORTENT structurellement identités/coordonnées sont exclus avant même
 * d'atteindre ce code (`corpusFile` ne compile pas sur eux). Cette fonction
 * couvre le cas où une colonne de ce type apparaîtrait un jour dans un fichier
 * par ailleurs accepté — un pack modifié, une nouvelle colonne ajoutée par
 * erreur en amont.
 *
 * ⚠️ Comparaison par TOKEN exact, jamais par sous-chaîne : un test naïf
 * (`/tel/i.test(column)`) attraperait `client_actuel` ou `clientele`, qui ne
 * portent aucun téléphone. Le témoin qui le prouve est dans
 * `market-memory-import.spec.ts`.
 */
const FORBIDDEN_PII_TOKENS: ReadonlySet<string> = new Set([
  'linkedin',
  'email',
  'mail',
  'courriel',
  'telephone',
  'tel',
  'phone',
  'gsm',
  'mobile',
])

export function findForbiddenPiiColumn(header: readonly string[]): string | null {
  for (const column of header) {
    const tokens = column
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 0)
    for (const token of tokens) {
      if (FORBIDDEN_PII_TOKENS.has(token)) {
        return `colonne "${column}" ressemble à une donnée personnelle (motif "${token}")`
      }
    }
  }
  return null
}

/**
 * #1615.3 — LE LABEL DE PROVENANCE, PORTEUR DE LA VERSION ET DE LA PÉRIODE.
 *
 * À UN SEUL ENDROIT (GA-26) : c'est la seule fonction du dépôt qui compose un
 * `corpus_label` versionné, et le script d'ingestion l'appelle plutôt que de
 * réassembler la chaîne lui-même.
 *
 * ⚠️ Le PRÉFIXE (`MARKET_MEMORY_CORPUS_LABEL`) ne change pas : les 60 067
 * lignes déjà en base portent `parcours-observes` tel quel, et les renommer
 * serait #1616.2 (le renommage des 7 tables), explicitement ÉCARTÉ de ce lot
 * — 60 067 lignes en production, porte « ajout seulement ». Cette fonction
 * ENRICHIT l'étiquette des NOUVEAUX imports d'une version et d'une période ;
 * elle ne réécrit jamais celle des lignes déjà écrites.
 *
 * ⚠️ Un fait périmé redevient inconnu AVEC SA DATE, il ne disparaît pas : un
 * opérateur qui lit `corpus_label` en base voit directement de quel pack et de
 * quelle période une ligne parle, sans avoir à croiser `dataset_version` et
 * `period_start`/`period_end` séparément. `corpus_label` reste une colonne
 * D'AUDIT SEULEMENT (aucune lecture produit ne la rend, comme avant) — la
 * période d'un CORPUS n'est pas une date d'observation INDIVIDUELLE, distinction
 * posée par `packages/contracts/src/schemas/market-memory.ts:19-24`.
 */
export function buildCorpusLabel(
  vintage: Pick<MarketMemoryVintage, 'datasetVersion' | 'periodStart' | 'periodEnd'>,
): string {
  return `${MARKET_MEMORY_CORPUS_LABEL}@${vintage.datasetVersion} (${vintage.periodStart}..${vintage.periodEnd})`
}

/**
 * #1616.4 — LA PARTITION insert / update / inchangé, POUR QUE LES COMPTES
 * S'ADDITIONNENT SANS JAMAIS SOUSTRAIRE.
 *
 * Chaque brouillon tombe dans EXACTEMENT une des trois catégories : absente de
 * l'existant → `toInsert` ; présente et identique sur les champs comparés →
 * `unchanged` ; présente et différente → `toUpdate`. La somme des trois
 * longueurs vaut TOUJOURS `drafts.length` — c'est une addition de trois
 * compteurs disjoints, jamais une soustraction.
 *
 * ⚠️ `compareFields` doit EXCLURE les colonnes qui changent à chaque run sans
 * rien dire du contenu (`imported_at` notamment) : les inclure ferait
 * apparaître un réimport à l'identique comme un changement permanent, et
 * réécrirait une ligne — potentiellement une correction — à chaque passage.
 */
interface UpsertClassification<T> {
  readonly toInsert: T[]
  readonly toUpdate: T[]
  readonly unchanged: T[]
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b)
  return false
}

export function classifyUpserts<T>(
  drafts: readonly T[],
  existingByKey: ReadonlyMap<string, Record<string, unknown>>,
  keyOf: (draft: T) => string,
  compareFields: readonly string[],
): UpsertClassification<T> {
  const toInsert: T[] = []
  const toUpdate: T[] = []
  const unchanged: T[] = []

  for (const draft of drafts) {
    const existing = existingByKey.get(keyOf(draft))
    if (existing === undefined) {
      toInsert.push(draft)
      continue
    }
    const draftRecord = draft as Record<string, unknown>
    const changed = compareFields.some(field => !valuesEqual(existing[field], draftRecord[field]))
    if (changed) toUpdate.push(draft)
    else unchanged.push(draft)
  }

  return { toInsert, toUpdate, unchanged }
}

/** Le seuil du corpus pour qu'une technologie caractérise un environnement. */
export const STACK_MIN_PERSONS = 2

/** Découpe une ligne CSV à séparateur `;`, en respectant les guillemets. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ';') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

/** Retire le BOM d'un entête — sans lui, la première colonne ne porte pas son nom. */
export function parseHeader(line: string): string[] {
  return splitCsvLine(line.replace(/^\uFEFF/, '')).map(cell => cell.trim())
}

/** Associe l'entête à une ligne. Les colonnes manquantes valent la chaîne vide. */
export function toRecord(header: readonly string[], line: string): Record<string, string> {
  const cells = splitCsvLine(line)
  const record: Record<string, string> = {}
  header.forEach((name, index) => {
    record[name] = (cells[index] ?? '').trim()
  })
  return record
}

/** Un texte, ou `null` s'il est vide — jamais une chaîne vide en base. */
export function optionalText(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Un entier, ou `null`.
 *
 * ⚠️ Une cellule vide rend `null` et JAMAIS `0` : c'est toute la différence
 * entre « on ne sait pas » et « on a compté zéro ».
 */
export function optionalInt(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim()
  if (trimmed.length === 0) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/** Un entier avec un plancher explicite — pour les colonnes de comptage. */
export function countOrZero(value: string | undefined): number {
  return optionalInt(value) ?? 0
}

/** Un nombre décimal rendu tel quel en texte (numeric Postgres), ou `null`. */
export function optionalDecimal(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (trimmed.length === 0) return null
  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? String(parsed) : null
}

/** Le booléen du corpus s'écrit `True` / `False`. Tout le reste est faux. */
export function parseBoolean(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true'
}

/**
 * La tranche d'effectif, ou `null`.
 *
 * Le corpus écrit littéralement `inconnu` quand il ne sait pas. Le garder tel
 * quel ferait afficher le mot « inconnu » comme s'il était une tranche.
 */
export function parseHeadcountBracket(value: string | undefined): string | null {
  const text = optionalText(value)
  return text === null || text.toLowerCase() === 'inconnu' ? null : text
}

/**
 * `« Autre 225 · Direction / Conseil 106 · Développement 100 »` → trois couples.
 *
 * Le séparateur est le point médian, et le comptage est le DERNIER nombre du
 * fragment : « Direction / Conseil 106 » porte un `/` dans son libellé, découper
 * sur autre chose que la fin casserait une famille sur trois.
 */
export function parseRoleFamilies(value: string | undefined): Array<{ family: string; persons: number }> {
  const text = optionalText(value)
  if (text === null) return []

  const families: Array<{ family: string; persons: number }> = []
  for (const fragment of text.split('·')) {
    const trimmed = fragment.trim()
    if (trimmed.length === 0) continue
    const match = /^(.*?)\s+(\d+)$/.exec(trimmed)
    if (!match) continue
    const family = match[1].trim()
    const persons = Number.parseInt(match[2], 10)
    if (family.length === 0 || !Number.isFinite(persons) || persons <= 0) continue
    families.push({ family, persons })
  }
  return families
}

/** Une ligne de `market_company_signal`, telle que l'import la construit. */
export interface CompanySignalDraft {
  companyKey: string
  companyName: string
  matchKey: string
  websiteDomain: string | null
  isServiceCompany: boolean
  pathsTotal: number
  pathsCurrent: number
  pathsPast: number
  externalizationScore: string | null
  roleFamilies: Array<{ family: string; persons: number }>
  headcountBracket: string | null
  headcountMin: number | null
  headcountMax: number | null
  city: string | null
  region: string | null
  country: string | null
  website: string | null
  esnObservedCount: number
  technosObservedCount: number
  exEsnPresent: number
  rotationRatio: string | null
  hasCeased: boolean
  connectorCount: number
  corpusLabel: string
}

/**
 * Une ligne du fichier des entreprises → une ligne de signal.
 *
 * `null` quand la ligne n'a pas de clé : sans elle, rien ne peut la joindre, et
 * l'insérer fabriquerait une entreprise fantôme que personne ne retrouverait.
 */
export function parseCompanySignal(record: Record<string, string>, corpusLabel: string): CompanySignalDraft | null {
  const companyKey = optionalText(record.cle)
  if (companyKey === null) return null

  const companyName = optionalText(record.nom) ?? companyKey
  const website = optionalText(record.site_web)

  return {
    companyKey,
    companyName,
    matchKey: marketMatchKey(companyName),
    websiteDomain: marketRootDomain(website),
    isServiceCompany: parseBoolean(record.est_esn),
    pathsTotal: countOrZero(record.freelances_total),
    pathsCurrent: countOrZero(record.freelances_actuels),
    pathsPast: countOrZero(record.freelances_passes),
    externalizationScore: optionalDecimal(record.score_externalisation),
    roleFamilies: parseRoleFamilies(record.familles_de_roles),
    headcountBracket: parseHeadcountBracket(record.tranche_effectif),
    headcountMin: optionalInt(record.effectif_min),
    headcountMax: optionalInt(record.effectif_max),
    city: optionalText(record.ville),
    region: optionalText(record.region),
    country: optionalText(record.pays),
    website,
    esnObservedCount: countOrZero(record.esn_observees),
    technosObservedCount: countOrZero(record.technos_observees),
    exEsnPresent: countOrZero(record.anciens_esn_presents),
    // Les trois signaux ci-dessous vivent dans d'AUTRES fichiers du pack : ils
    // sont posés à leur valeur neutre ici, puis complétés. Une valeur neutre
    // n'est pas une mesure — `rotationRatio` reste `null` tant que personne ne
    // l'a lu, et `hasCeased: false` se lit « rien d'observé », jamais « continue ».
    rotationRatio: null,
    hasCeased: false,
    connectorCount: 0,
    corpusLabel,
  }
}

/** Une ligne du fichier des liens société de services × client. */
export function parseEsnClient(
  record: Record<string, string>,
  corpusLabel: string,
): {
  esnKey: string
  esnName: string
  clientKey: string
  clientName: string
  persons: number
  corpusLabel: string
} | null {
  const esnKey = optionalText(record.esn)
  const clientKey = optionalText(record.client)
  const persons = optionalInt(record.personnes)
  if (esnKey === null || clientKey === null || persons === null || persons <= 0) return null

  return {
    esnKey,
    esnName: optionalText(record.esn_nom) ?? esnKey,
    clientKey,
    clientName: optionalText(record.client_nom) ?? clientKey,
    persons,
    corpusLabel,
  }
}

/**
 * Une ligne du fichier des technologies par entreprise.
 *
 * Sous `STACK_MIN_PERSONS`, la ligne n'entre pas : une technologie citée par une
 * seule personne n'est pas un environnement technique, c'est une ligne de CV — et
 * la laisser entrer la ferait ressortir dans une stack « observée ».
 */
export function parseCompanyStack(
  record: Record<string, string>,
  corpusLabel: string,
): { companyKey: string; techno: string; persons: number; corpusLabel: string } | null {
  const companyKey = optionalText(record.cle_entreprise)
  const techno = optionalText(record.techno)
  const persons = optionalInt(record.freelances)
  if (companyKey === null || techno === null || persons === null || persons < STACK_MIN_PERSONS) return null

  return { companyKey, techno, persons, corpusLabel }
}

/** Une ligne du fichier des anciens d'une société de services chez un client. */
export function parseExEsnAtClient(
  record: Record<string, string>,
  corpusLabel: string,
): {
  esnOriginKey: string
  esnOriginName: string
  clientKey: string
  clientName: string
  persons: number
  corpusLabel: string
} | null {
  const esnOriginKey = optionalText(record.esn_origine)
  const clientKey = optionalText(record.client_actuel)
  const persons = optionalInt(record.personnes)
  if (esnOriginKey === null || clientKey === null || persons === null || persons <= 0) return null

  return {
    esnOriginKey,
    esnOriginName: optionalText(record.esn_nom) ?? esnOriginKey,
    clientKey,
    clientName: optionalText(record.client_nom) ?? clientKey,
    persons,
    corpusLabel,
  }
}

/**
 * Lit un CSV du pack en FLUX, et rend ce qui a été lu et ce qui a été retenu.
 *
 * ⚠️ Il n'itère PAS sur les lignes. Mesuré sur le vrai pack : une ligne du
 * fichier des entreprises porte un retour à la ligne DANS un champ entre
 * guillemets. Un lecteur ligne à ligne la coupe en deux — il jette la moitié qui
 * n'a plus de clé et garde l'autre, avec toutes ses colonnes DÉCALÉES d'un cran.
 * Le compteur affichait alors « 1 écartée », ce qui se lit comme du bruit ;
 * c'était en réalité une entreprise dont le site, la ville et les comptages
 * étaient devenus faux, et rien ne l'aurait jamais montré.
 *
 * `createRecordAssembler` est l'assembleur que le dépôt utilise déjà pour ses
 * autres imports : un enregistrement ne se termine pas sur un retour à la ligne
 * cité. Une seule implémentation, pas deux qui divergent.
 */
export async function readCsvRecords(
  stream: AsyncIterable<string | Buffer>,
  onRecord: (record: Record<string, string>) => boolean,
): Promise<{ read: number; kept: number }> {
  let header: string[] | null = null
  let read = 0
  let kept = 0

  function handle(record: string): void {
    if (record.trim().length === 0) return
    if (header === null) {
      header = parseHeader(record)
      return
    }
    read += 1
    if (onRecord(toRecord(header, record))) kept += 1
  }

  const assembler = createRecordAssembler()
  for await (const chunk of stream) {
    for (const record of assembler.push(String(chunk))) handle(record)
  }
  const last = assembler.flush()
  if (last !== null) handle(last)

  return { read, kept }
}
