import { z } from 'zod'
import type { TalentDuplicateMatch, TalentDuplicateReason, TalentIdentityConflictField } from './talent-duplicates.js'
import type { TalentIdentityState } from './talent-identity.js'
import { IMPORT_FILE_MAX_BYTES } from './import-limits.js'

/**
 * L'import de CV EN LOT — depuis une archive ZIP (#2569.1) ou une pièce jointe
 * de messagerie (#2568.1) — au-delà du dépôt unitaire de `cv-intake.service.ts`.
 *
 * ── Pourquoi ce fichier existe séparément ─────────────────────────────────
 *
 * Le dépôt unitaire est INTERACTIF : sur un doublon possible, il s'arrête et
 * rend `{ outcome: 'duplicates' }`, parce qu'un humain regarde l'écran à ce
 * moment précis. Un import en lot n'a personne devant l'écran pendant qu'il
 * tourne — poser une question par fichier n'est pas une fonctionnalité, c'est
 * la transformer en corvée (le constat exact de `cvBatch.ts`, §2 de son
 * en-tête). Il faut donc une DÉCISION AUTOMATIQUE, et c'est elle que ce
 * fichier rend pure et testable.
 *
 * ── Les trois issues, et POURQUOI elles suffisent ─────────────────────────
 *
 *  - `new` → aucune ressemblance : on crée (comportement déjà existant).
 *  - `resolved` → une clé FORTE, une seule cible, aucune contradiction : la
 *    correspondance est réelle au sens où `resolveTalentIdentityState` la
 *    nomme déjà `resolved`. On met à jour AUTOMATIQUEMENT — c'est
 *    l'« auto-validation des fiches fiables » de #2569.3 — et #2569.2
 *    (« la donnée la plus récente gagne ») décide QUEL texte l'emporte, via
 *    `incomingCvIsMoreRecent`. Aucune fusion de DEUX fiches n'a lieu : un
 *    document rejoint une fiche existante, exactement le geste que
 *    `rememberAttached` connaît déjà.
 *  - le reste (`probable_duplicate`, `ambiguous`, `conflicting`) → une
 *    EXCEPTION, isolée pour revue humaine (#2569.3, #2184). La fiche est tout
 *    de même créée — « aucun profil perdu silencieusement » (critère 6 de
 *    #2184) — et l'écran de revue existant (`GET /:id/identity`,
 *    `TalentIdentityPanel`) la retrouve : ses champs sont ceux qui ont produit
 *    l'ambiguïté, la recomputation rend donc les mêmes propositions.
 *
 * ⚠️ Ce fichier ne décide JAMAIS de fusionner deux fiches déjà existantes —
 * `c37_fusion_doublons` l'interdit, et l'action `merge` n'existe nulle part
 * dans son vocabulaire.
 */

/**
 * #2326.12 (épopée #2794/#2905, lot V11 28/09) — les DIX étapes NOMMÉES du
 * dépôt d'UN fichier, dans l'ordre RÉELLEMENT parcouru par
 * `CvIntakeService.intakeAutomatic` — même patron que `MATCH_PIPELINE_STEPS`
 * (`consultant-matching.ts`) : une trace poussée AU MOMENT RÉEL de chaque
 * étape, jamais une liste à côté du code qui pourrait diverger.
 *
 * `extract_text` recouvre l'OCR : `POST /cv/extract` (`apps/ia/app/routers/cv.py`)
 * tente d'abord l'extraction directe et ne bascule sur l'OCR QUE si elle
 * échoue (« probablement un scan ») — l'OCR est donc déjà réservé aux scans,
 * pas une étape distincte que Node pourrait nommer : il ne reçoit que le
 * texte final, jamais SI l'OCR a tourné.
 *
 * Une sortie ANTICIPÉE (format non reconnu, fichier vide/trop gros, texte
 * illisible) a une trace COURTE, jamais complétée à dix par convention — la
 * trace dit exactement où le fichier s'est arrêté, jamais plus.
 *
 * `steps` est OPTIONNEL sur chaque variante : un fichier écarté AVANT même
 * `intakeAutomatic` (un lot trop grand, `cv-batch-import.service.ts`) porte
 * `[]` (zéro étape atteinte) ; une doublure de test qui ne teste PAS ce
 * point n'a rien à fournir — absent n'est jamais une trace inventée.
 */
export const CV_INTAKE_STEPS = [
  { id: 'format_check', label: 'Vérifier le format du fichier' },
  { id: 'decode', label: 'Décoder le fichier' },
  { id: 'extract_text', label: 'Extraire le texte (OCR si le fichier est un scan)' },
  { id: 'read_identity_signals', label: "Lire les signaux d'identité" },
  { id: 'match_identity', label: 'Rapprocher une fiche existante' },
  { id: 'resolve_state', label: 'Évaluer le rapprochement' },
  { id: 'decide_action', label: "Décider de l'action" },
  { id: 'write_record', label: 'Écrire la fiche' },
  { id: 'save_document', label: 'Enregistrer le document' },
  { id: 'classify_outcome', label: 'Classer le résultat' },
] as const
export type CvIntakeStepId = (typeof CV_INTAKE_STEPS)[number]['id']

/** Le fichier a dépassé la taille admise pour un CV — `CV_UPLOAD_MAX_BYTES`. */
export type CvBatchFileTooBig = { status: 'too_big'; file: string; steps?: readonly CvIntakeStepId[] }
/**
 * Pourquoi un fichier n'a produit aucun texte — au-delà du motif LIBRE, une
 * catégorie STRUCTURÉE (#2183.41).
 *
 * `scan_suspected` couvre les trois formes qu'un document sans calque texte
 * prend chez nous (PDF image-only, Office qui ne porte que des images, image
 * sans texte lisible) — {@link classifyCvExtractFailure}. Le reste (fichier
 * vide, mot de passe, format non supporté, fiche introuvable…) reste `other` :
 * une catégorie n'est posée que quand elle est SÛRE, jamais devinée sur un
 * motif ambigu.
 */
export const CV_EXTRACT_FAILURE_CATEGORIES = ['scan_suspected', 'other'] as const
export type CvExtractFailureCategory = (typeof CV_EXTRACT_FAILURE_CATEGORIES)[number]

/** Le serveur a refusé le fichier, avec SA raison (extraction impossible, etc.)
 *  ET sa catégorie structurée. */
export type CvBatchFileFailed = {
  status: 'failed'
  file: string
  reason: string
  category: CvExtractFailureCategory
  steps?: readonly CvIntakeStepId[]
}
/** Une fiche neuve, créée sans aucune ambiguïté. */
export type CvBatchFileCreated = {
  status: 'created'
  file: string
  consultantId: string
  steps?: readonly CvIntakeStepId[]
}
/** Une fiche existante a reçu ce document — #2569.2 dit qui a gagné le texte. */
export type CvBatchFileAutoUpdated = {
  status: 'auto_updated'
  file: string
  consultantId: string
  /** Vrai quand CE document, plus récent, a remplacé le texte de la fiche. */
  contentReplaced: boolean
  /**
   * #2326.13 — la PROVENANCE de la confiance élevée : la clé qui a rapproché
   * ce document de la fiche (`TalentDuplicateMatch.reason`, déjà calculée par
   * `TalentIdentityService`, jamais recalculée). `null` seulement quand la
   * fiche ciblée n'apparaît plus parmi les correspondances au moment d'écrire
   * — pas une provenance inventée.
   */
  matchedOn: TalentDuplicateReason | null
  steps?: readonly CvIntakeStepId[]
}
/**
 * #3065 (lot 2) — pas un CV, jamais envoyé à l'extraction. Distinct de
 * `failed` : ce n'est pas un échec, c'est un fichier hors périmètre (csv,
 * xlsx, zip imbriqué, sans extension reconnue) — le rapport le NOMME, jamais
 * en échec muet.
 */
export type CvBatchFileIgnored = {
  status: 'ignored'
  file: string
  reason: string
  steps?: readonly CvIntakeStepId[]
}
/** Isolée pour revue — jamais perdue, jamais fusionnée seule. */
export type CvBatchFileException = {
  status: 'exception'
  file: string
  consultantId: string
  state: Exclude<TalentIdentityState, 'new' | 'resolved' | 'updated' | 'ignored'>
  /**
   * #2326.14 — les CHAMPS À VÉRIFIER : ce qui diverge alors que les deux
   * côtés le renseignent (`TalentDuplicateMatch.conflicts`, même calcul que
   * l'écran d'identité). Vide quand l'ambiguïté ne vient d'aucun champ
   * contradictoire (ex. absence totale de signal, #2183.13).
   */
  conflicts: TalentIdentityConflictField[]
  steps?: readonly CvIntakeStepId[]
}

export type CvBatchFileOutcome =
  | CvBatchFileCreated
  | CvBatchFileAutoUpdated
  | CvBatchFileException
  | CvBatchFileTooBig
  | CvBatchFileFailed
  | CvBatchFileIgnored

/** Le compte par issue, pour le rapport de fin (même forme que `summariseCvBatch`). */
export function summariseCvBatchImport(
  outcomes: readonly CvBatchFileOutcome[],
): Record<CvBatchFileOutcome['status'], number> {
  return outcomes.reduce((acc, outcome) => ({ ...acc, [outcome.status]: acc[outcome.status] + 1 }), {
    created: 0,
    auto_updated: 0,
    exception: 0,
    too_big: 0,
    failed: 0,
    ignored: 0,
  })
}

/**
 * #3065 (lot 2) — les SEULES extensions qu'un CV porte ici (pdf, docx, doc).
 * Le reste d'une archive réelle (csv, xlsx, zip imbriqué, sans extension) n'a
 * jamais été un CV : l'envoyer à l'extraction le ferait échouer en silence,
 * compté comme une ERREUR alors que ce n'en est pas une.
 */
const RECOGNIZED_CV_EXTENSIONS = ['.pdf', '.docx', '.doc']

export function isRecognizedCvExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return RECOGNIZED_CV_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * M2.3 (Meyer 20/10) — un tableur n'est pas un CV. Un CSV de 340 000 caractères déposé dans l'import de CV du Vivier
 * a créé une fiche « Nom non renseigné » : l'extraction lit n'importe quel texte, et la fiche naît sans rien
 * vérifier. Le refus est NOMMÉ et renvoie vers Réglages › Import, où ce fichier a sa place.
 */
const SPREADSHEET_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls', '.ods']

export function hasSpreadsheetExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return SPREADSHEET_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/** Aucun CV ne dépasse ce volume de texte : au-delà, c'est une base de données, pas une personne. */
export const CV_TEXT_MAX_CHARS = 200_000

/** Le message du refus — une seule écriture, partagée par l'API (le web a ses clés i18n). */
export const CV_NOT_A_CV_MESSAGE =
  'Ce fichier est un tableau, pas un CV. Pour importer une liste de contacts ou de sociétés, utilise Réglages › Import.'

const TABULAR_DELIMITERS = [';', '\t', ',', '|'] as const

/**
 * Le texte a-t-il la forme d'un tableau délimité ? Au moins cinq lignes dont 80 % portent le MÊME nombre (≥ 4) du même
 * séparateur — la régularité est ce qui distingue un export d'une liste de compétences à virgules, qui varie d'une ligne
 * à l'autre.
 */
export function looksTabularText(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .slice(0, 200)
  if (lines.length < 5) return false
  return TABULAR_DELIMITERS.some(delimiter => {
    const counts = lines.map(line => line.split(delimiter).length - 1)
    const tally = new Map<number, number>()
    for (const count of counts) tally.set(count, (tally.get(count) ?? 0) + 1)
    for (const [count, seen] of tally) if (count >= 4 && seen / lines.length >= 0.8) return true
    return false
  })
}

/**
 * Les entrées d'une archive qui ne sont jamais des CV, mais des artefacts du
 * SYSTÈME qui l'a créée — métadonnées macOS, fichier caché du Finder. Compter
 * l'une d'elles comme un échec ferait croire à un lot bruité qu'il ne l'est
 * pas. Partagée entre l'import EN LIGNE (`cv-batch-import.service.ts`,
 * archive bufferisée) et l'import VOLUMINEUX (`cv-zip-import.worker.ts`,
 * archive en streaming) — les deux doivent voir EXACTEMENT le même filtre
 * (GA-26), sans quoi une même archive donnerait un rapport différent selon sa
 * taille.
 */
export function isCvZipNoiseEntry(entryName: string): boolean {
  return entryName.startsWith('__MACOSX/') || entryName.toLowerCase().endsWith('.ds_store')
}

/**
 * #3303 — une entrée d'archive qui est elle-même un ZIP imbriqué (un dossier
 * de CV reçu par WeTransfer arrive souvent scindé en plusieurs sous-archives,
 * ex. « Candidats.zip », « All 13.8.zip »). Reconnue par EXTENSION, jamais
 * par sniffing d'octets : une archive porte toujours `.zip`, contrairement à
 * un CV qui peut en manquer (voir {@link sniffCvFileKind}).
 */
export function isCvZipNestedArchiveEntry(entryName: string): boolean {
  return entryName.toLowerCase().endsWith('.zip')
}

/**
 * #3303 — au-delà de combien de ZIP imbriqués un dépaquetage récursif
 * s'arrête. Une archive au-delà de cette profondeur n'est plus dépaquetée :
 * son entrée `.zip` reste telle quelle, et `isRecognizedCvExtension` la classe
 * `ignored` (« pas un CV ») comme n'importe quelle extension hors périmètre —
 * jamais une boucle sans fin sur une archive pathologique.
 */
export const CV_ZIP_NESTED_MAX_DEPTH = 3

/**
 * #3303 — les signatures d'octets qui trahissent un CV MÊME quand son nom n'a
 * aucune extension reconnue (un export WeTransfer renomme parfois, ou perd,
 * l'extension). Jamais une devinette sur le contenu texte : seulement la
 * signature binaire du format.
 *
 *  - PDF : commence toujours par `%PDF` (§7.5.2 de la spec PDF).
 *  - DOCX : un `.docx` est un ZIP (signature `PK`) dont le répertoire central
 *    porte une entrée sous `word/` (`word/document.xml`) — les noms d'entrée
 *    d'un ZIP ne sont JAMAIS compressés, ils restent lisibles tels quels dans
 *    les octets, même sans dépaqueter l'archive.
 */
// ⚠️ Ce paquet est consommé par le web (navigateur, pas de `Buffer` global) —
// des octets bruts (`Uint8Array`, dont `Buffer` est déjà une sous-classe côté
// Node), jamais le type Node, pour que ce fichier reste importable des deux côtés.
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46] // %PDF
const ZIP_SIGNATURE = [0x50, 0x4b] // PK
const DOCX_MARKER = [0x77, 0x6f, 0x72, 0x64, 0x2f] // word/

function bytesStartWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false
  return prefix.every((byte, index) => bytes[index] === byte)
}

function bytesInclude(bytes: Uint8Array, needle: readonly number[]): boolean {
  for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    if (needle.every((byte, index) => bytes[offset + index] === byte)) return true
  }
  return false
}

export function sniffCvFileKind(bytes: Uint8Array): 'pdf' | 'docx' | null {
  if (bytesStartWith(bytes, PDF_SIGNATURE)) return 'pdf'
  if (bytesStartWith(bytes, ZIP_SIGNATURE) && bytesInclude(bytes, DOCX_MARKER)) return 'docx'
  return null
}

/**
 * Le nombre de fichiers `failed` dont la catégorie est `scan_suspected` — la
 * ligne PROGRESSION « scans », distincte des autres échecs (§3 de #2183,
 * « fichiers reçus / créés / doublons / exceptions / scans / erreurs »).
 */
export function countScanSuspects(outcomes: readonly CvBatchFileOutcome[]): number {
  return outcomes.filter(outcome => outcome.status === 'failed' && outcome.category === 'scan_suspected').length
}

/**
 * Les motifs, dans le texte CONTRÔLÉ que notre propre service IA
 * (`document_text.py`) émet, qui signalent un document sans calque texte —
 * jamais un texte de modèle, donc une classification FIABLE, pas une
 * devinette (#2183.41). Une catégorie inconnue ou ambiguë reste `other`.
 */
const SCAN_SUSPECTED_MARKERS = ['scan/image', 'uniquement des images', 'texte lisible dans cette image']

export function classifyCvExtractFailure(reason: string): CvExtractFailureCategory {
  const text = reason.toLowerCase()
  return SCAN_SUSPECTED_MARKERS.some(marker => text.includes(marker)) ? 'scan_suspected' : 'other'
}

// Louis 06/10/2026 : plus aucun plafond en NOMBRE de fichiers/fiches à l'import de CV
// (anciens plafonds de 300 et 2000, qui avaient
// laissé 329 CV d'une archive de 2 329 de côté). Seules restent les limites en
// OCTETS, de transport.

/**
 * Le plafond, en octets du FICHIER archive, du transport inline actuel
 * (base64 dans le corps JSON) — #3065. Une archive réelle de 703 Mo dépassait
 * silencieusement la limite du corps HTTP et remontait « Validation failed »,
 * sans jamais dire la vraie raison. Cette borne est désormais NOMMÉE et UNIQUE :
 * lue par le web (refus avant tout envoi, `CvZipImportDialog`) et par l'API
 * (`main.ts`, pour dimensionner le corps HTTP ; `cv-batch-import.service.ts`,
 * pour refuser avec sa raison si le transport a laissé passer plus).
 * Au-delà, l'archive attend l'import volumineux (#3065 lot 2, pas encore
 * livré) — pour l'instant elle se découpe en plusieurs envois.
 */
export const CV_ZIP_MAX_ARCHIVE_BYTES = 20 * 1024 * 1024

/**
 * #3065 (lot 2b) — le plafond de l'IMPORT VOLUMINEUX. Au-delà de
 * `CV_ZIP_MAX_ARCHIVE_BYTES`, l'archive ne voyage plus en base64 dans un corps
 * JSON : elle part directement vers le stockage (URL signée d'upload), puis
 * l'API la lit en STREAMING (`cv-zip-import.worker.ts`) — la mémoire du
 * process ne borne donc plus la taille transportable. Le plafond qui reste
 * est délibéré, pas technique : au-delà, ce n'est plus un import de CV mais un
 * incident. UNIQUE et NOMMÉ à l'écran (`CvZipImportDialog`) — jamais découvert
 * par un refus muet.
 *
 * Lot BATCH-CV (Louis 12/10/2026, « 400, voire 2000 CV d'un coup ») — 1 Gio →
 * 2,5 Gio : au poids du cas réel qui a ouvert #3065 (703 Mo pour 688 CV, ≈ 1 Mo
 * le CV), 2 000 CV pèsent ≈ 2 Gio et étaient refusés. ⚠️ Le seau ne dépasse
 * jamais la limite GLOBALE du projet Supabase (Storage › Settings › « Upload
 * file size limit ») : elle doit être relevée à ≥ 2,5 Gio, sinon une archive
 * entre l'ancienne limite et celle-ci rend un 413 NOMMÉ (`uploadRefusedSize`).
 */
/*
 * ⚠️ RENVERSEMENT DATÉ du 15/10/2026 (Louis, #3666.9) — 2,5 Gio → 1 Go, la limite ANNONCÉE de
 * tout import (archive de CV, fichier CRM), lue à UN endroit : `IMPORT_FILE_MAX_BYTES`.
 * _Ancien texte_ : ~~« 1 Gio → 2,5 Gio » (lot BATCH-CV, 12/10/2026)~~.
 */
export const CV_ZIP_LARGE_ARCHIVE_MAX_BYTES = IMPORT_FILE_MAX_BYTES

/**
 * Vers où une archive de cette taille doit partir. La SEULE décision : le web
 * la lit pour choisir quel appel faire, l'API la relit pour refuser exactement
 * ce que le web n'a pas déjà écarté — deux plafonds qui divergeraient
 * laisseraient partir un envoi pour rien, ou refuseraient ce que l'autre côté
 * a accepté (GA-26).
 *
 * `'refused'` couvre aussi bien le dépassement du plafond qu'une taille
 * illisible (zéro, négative, non finie) — une taille qu'on ne sait pas lire
 * n'est jamais une raison d'inventer une route.
 */
export type CvZipImportRoute = 'inline' | 'large' | 'refused'

export function cvZipImportRoute(byteSize: number): CvZipImportRoute {
  if (!Number.isFinite(byteSize) || byteSize <= 0) return 'refused'
  if (byteSize <= CV_ZIP_MAX_ARCHIVE_BYTES) return 'inline'
  if (byteSize <= CV_ZIP_LARGE_ARCHIVE_MAX_BYTES) return 'large'
  return 'refused'
}

/**
 * Ce que l'écran demande pour obtenir une URL d'upload direct vers le
 * stockage. `byteSize` est DIT ici : c'est lui qui permet à l'API de refuser
 * avant de signer une URL pour une archive qui dépasse le plafond, plutôt que
 * de laisser l'upload partir pour rien.
 */
export const cvZipLargeUploadTicketRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    byteSize: z.number().int().positive(),
  })
  .strict()
export type CvZipLargeUploadTicketRequest = z.infer<typeof cvZipLargeUploadTicketRequestSchema>

/**
 * Ce que l'API rend pour un dépôt direct REPRIS par morceaux (#3303,
 * protocole TUS) : le CHEMIN où l'objet atterrira — le même chemin que
 * l'écran redonne à `intake/zip/large` pour démarrer le job, une fois
 * l'upload terminé — et de quoi authentifier l'upload TUS SANS la clé
 * service : `token` est le jeton d'upload signé rendu par Supabase Storage
 * (`createSignedUploadUrl`), limité à CE chemin et de courte durée, envoyé
 * dans l'en-tête `x-signature` de chaque requête TUS. `bucket` et
 * `resumableEndpoint` évitent au navigateur de deviner le nom du seau ou la
 * forme de l'URL de reprise — un réglage vit à un seul endroit (GA-26),
 * ici côté API où vivent déjà `SUPABASE_URL` et le nom du seau.
 *
 * `uploadUrl` reste rendu pour compatibilité (envoi direct historique,
 * `StorageClient.createSignedUploadUrl`) — l'écran n'en a plus l'usage
 * depuis le passage à TUS, mais aucun appelant existant ne casse.
 */
export type CvZipLargeUploadTicket = {
  uploadUrl: string
  path: string
  token: string
  bucket: string
  resumableEndpoint: string
}

/**
 * Ce que l'écran envoie une fois l'upload direct terminé, pour démarrer le
 * traitement en tâche de fond. `filename` est le nom D'ORIGINE (celui de
 * l'archive choisie) — le `path` de stockage n'en porte qu'un identifiant
 * tiré au hasard, jamais lisible.
 */
export const cvZipLargeImportStartSchema = z
  .object({
    path: z.string().trim().min(1),
    filename: z.string().trim().min(1).max(255),
  })
  .strict()
export type CvZipLargeImportStart = z.infer<typeof cvZipLargeImportStartSchema>

/**
 * L'état d'un import volumineux, tel que l'écran le lit en l'interrogeant
 * (`GET /talents/intake/zip/large/:jobId`). Même vocabulaire que le suivi
 * d'enrichissement à la demande (`EnrichJobStatus`) : `queued`/`running` avant
 * la fin, `done` avec le MÊME rapport que l'import en ligne (aucun second
 * format d'affichage), `failed` avec sa raison — jamais un job qui disparaît
 * sans le dire.
 */
export const CV_ZIP_IMPORT_JOB_STATES = ['unknown', 'queued', 'running', 'done', 'failed'] as const
export type CvZipImportJobState = (typeof CV_ZIP_IMPORT_JOB_STATES)[number]

/**
 * `total` est `null` tant que le job n'a pas fini de lire le répertoire
 * central de l'archive (l'étape avant de traiter le premier fichier) —
 * « non mesuré » n'est jamais 0 fichiers.
 */
export type CvZipImportJobProgress = {
  processed: number
  total: number | null
  /**
   * Incident 05/10/2026 — OÙ en est le job avant son premier fichier : un job
   * ne reste plus jamais à « 0 traité » sans dire pourquoi. `download` =
   * l'archive descend du stockage (octets reçus / total annoncé, `null` si le
   * stockage ne l'annonce pas — jamais 0) ; `open` = lecture du répertoire ;
   * `entries` = les fichiers un par un. Optionnels : un écran qui ne les lit
   * pas reste byte-identique.
   */
  phase?: 'download' | 'open' | 'entries'
  bytesDownloaded?: number
  bytesTotal?: number | null
}

export type CvZipImportJobStatus =
  /** Aucun job sous cet identifiant — jamais démarré, déjà expiré, ou d'un
   *  AUTRE espace (même défense en profondeur que `StorageService.findInWorkspace`). */
  | { state: 'unknown'; jobId: string }
  | { state: 'queued'; jobId: string }
  | { state: 'running'; jobId: string; progress: CvZipImportJobProgress | null }
  | { state: 'done'; jobId: string; result: CvBatchImportReport }
  | { state: 'failed'; jobId: string; reason: string }

/** Les trois états qui n'ont ni « new » ni « resolved » — jamais auto-décidés. */
type CvBatchExceptionState = CvBatchFileException['state']

/** Ce qu'un dépôt automatique demande au serveur pour UN fichier. */
export type CvBatchFileAction =
  | { action: 'create' }
  | { action: 'auto_update'; talentId: string }
  | { action: 'exception'; talentId: string | null; state: CvBatchExceptionState }

/**
 * #2569.3 — la décision, pure, entre auto-validation et exception isolée.
 *
 * Jamais de fusion : l'action `auto_update` rejoint une fiche, elle n'en
 * efface aucune. Le classement en amont (`resolveTalentIdentityState`) porte
 * déjà toute la prudence — cette fonction ne fait que le TRADUIRE en geste.
 */
export function decideCvBatchFileAction(
  state: TalentIdentityState,
  matches: readonly Pick<TalentDuplicateMatch, 'talentId'>[],
): CvBatchFileAction {
  if (state === 'new') return { action: 'create' }
  if (state === 'resolved') {
    const talentId = matches[0]?.talentId
    if (!talentId) return { action: 'create' }
    return { action: 'auto_update', talentId }
  }
  // `resolveTalentIdentityState` ne rend jamais `updated` ni `ignored` — les
  // deux ne naissent que d'une décision HUMAINE (`stateAfterDecision`), jamais
  // du calcul automatique qui alimente cette fonction. S'ils survenaient quand
  // même, ils sont traités comme les autres exceptions plutôt que de perdre le
  // fichier ou de mentir sur son état.
  const exceptionState: CvBatchExceptionState =
    state === 'probable_duplicate' || state === 'ambiguous' || state === 'conflicting' ? state : 'ambiguous'
  return { action: 'exception', talentId: matches[0]?.talentId ?? null, state: exceptionState }
}

/**
 * #2569.2 — « à doublon, la donnée la plus récente gagne. »
 *
 * La date qui compte est une date MESURÉE : le dernier modifié d'une entrée
 * ZIP, ou la date d'un message. Jamais une date devinée, et surtout jamais
 * « maintenant » — deux fichiers d'un même lot seraient alors départagés par
 * leur ORDRE DE TRAITEMENT, pas par leur contenu réel. D'où la règle stricte :
 * une date entrante INCONNUE ne l'emporte jamais, quelle que soit la date
 * existante — « non mesuré » n'est jamais « plus récent ».
 */
export function incomingCvIsMoreRecent(existingCapturedAt: Date | null, incomingCapturedAt: Date | null): boolean {
  if (!incomingCapturedAt) return false
  if (!existingCapturedAt) return true
  return incomingCapturedAt.getTime() > existingCapturedAt.getTime()
}

/**
 * Une adresse e-mail lisible dans le texte d'un CV — lecture DÉTERMINISTE,
 * jamais un appel de modèle. Sert uniquement à la déduplication (#2569.2) : ce
 * n'est ni une compétence, ni une disponibilité, ni un critère protégé.
 */
const EMAIL_PATTERN = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9.-]+\.[a-z]{2,}/i

export function extractCvEmail(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(EMAIL_PATTERN)
  return match ? match[0] : null
}

/**
 * Un numéro de téléphone lisible dans le texte d'un CV — français en priorité
 * (0X XX XX XX XX), ou sa forme internationale (+33 …). Même garde-fou que
 * l'e-mail : une lecture, jamais une déduction.
 */
const PHONE_PATTERN = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/

export function extractCvPhone(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(PHONE_PATTERN)
  return match ? match[0] : null
}

export const cvZipImportInputSchema = z
  .object({
    fileB64: z.string().min(1),
    filename: z.string().min(1),
  })
  .strict()
export type CvZipImportInput = z.infer<typeof cvZipImportInputSchema>

export const cvMailImportInputSchema = z
  .object({
    messageId: z.string().min(1),
    attachmentId: z.string().min(1),
  })
  .strict()
export type CvMailImportInput = z.infer<typeof cvMailImportInputSchema>

/**
 * #2326.6 (épopée #2794) — un DOSSIER entier de CV, hors d'une archive ZIP.
 *
 * Même pipeline automatique que `cvZipImportInputSchema` (créer / auto-valider
 * une fiche fiable / isoler une exception, #2569.2/#2569.3) : ce contrat ne
 * change QUE la source des octets — un dossier choisi via `webkitdirectory`
 * plutôt qu'une archive à dépaqueter. `filename` porte le chemin RELATIF
 * (`sous-dossier/cv.pdf`) que le navigateur donne (`File.webkitRelativePath`) —
 * jamais recalculé, pour que le rapport de fin nomme le même chemin que celui
 * choisi à l'écran.
 *
 * ⚠️ Le dépôt CLIENT existant (#2183.4, `CvDropZone.tsx`) accepte déjà un
 * dossier entier, mais SAUTE un doublon plutôt que de le rejoindre ou de
 * l'isoler pour revue — la décision automatique à trois issues de #2569.3
 * n'existe que pour l'archive ZIP. Ce contrat ferme cet écart pour un DOSSIER,
 * sans toucher au dépôt unitaire existant.
 */
export const cvFilesImportInputSchema = z
  .object({
    files: z
      .array(
        z.object({
          fileB64: z.string().min(1),
          filename: z.string().min(1),
        }),
      )
      .min(1),
  })
  .strict()
export type CvFilesImportInput = z.infer<typeof cvFilesImportInputSchema>

/**
 * #2431.6 (épopée #2883) — le MANIFESTE dit avant tout traitement ce que le
 * lot contient : le nombre de fichiers et les doublons INTERNES au lot,
 * calculés par empreinte (même sha256 que `RagZipIngestService.ingestZip`),
 * jamais par nom de fichier — une copie renommée reste le même document.
 *
 * ⚠️ Coût et durée n'apparaissent PAS ici. Ni l'un ni l'autre n'a de calcul
 * existant dans le dépôt : aucune estimation de coût par type de document,
 * aucun historique de durée de traitement par taille/type. Les inventer
 * afficherait une valeur fictive (CLAUDE.md § Code rules, « JAMAIS de donnée
 * fictive »/« Échec API → erreur claire ») — la doctrine « on n'affiche pas ce
 * qu'on n'a pas » (#2613) dit la même chose depuis l'autre bout : une absence
 * ne fait aucune ligne. Champ NOMMÉ, pas construit : ce manifeste reste dit
 * réduit tant que ces deux calculs n'existent pas ailleurs dans le dépôt.
 */
export type CvZipManifestEntry = { name: string; sha256: string }

export type CvZipManifest = {
  totalFiles: number
  duplicateFiles: number
}

export function buildCvZipManifest(entries: readonly CvZipManifestEntry[]): CvZipManifest {
  const seen = new Set<string>()
  let duplicateFiles = 0
  for (const entry of entries) {
    if (seen.has(entry.sha256)) duplicateFiles += 1
    else seen.add(entry.sha256)
  }
  return { totalFiles: entries.length, duplicateFiles }
}

export const cvZipManifestSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  duplicateFiles: z.number().int().nonnegative(),
})

export const cvBatchImportReportSchema = z.object({
  total: z.number().int().nonnegative(),
  summary: z.object({
    created: z.number().int().nonnegative(),
    auto_updated: z.number().int().nonnegative(),
    exception: z.number().int().nonnegative(),
    too_big: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  outcomes: z.array(z.record(z.string(), z.unknown())),
})
export type CvBatchImportReport = {
  total: number
  summary: Record<CvBatchFileOutcome['status'], number>
  outcomes: CvBatchFileOutcome[]
}

/**
 * #2326.12 (épopée #2794) — L'ORCHESTRATEUR ASYNCHRONE, première tranche.
 *
 * Jusqu'ici `importZip`/`importFiles` bouclaient de façon SYNCHRONE dans la
 * requête HTTP (`git grep BullModule` dans `apps/api/src/modules/consultants`
 * rendait 0 résultat, vérifié à plusieurs reprises entre le 25 et le 26/09) —
 * aucune reprise après déconnexion (#2326.27), aucun rapport de JOB (#2326.24
 * n'était qu'un résumé de fin de requête). Ce contrat porte l'état d'un job
 * persisté (`cv_batch_import_jobs`), consommé par un worker BullMQ qui reprend
 * exactement où `processed` s'est arrêté — jamais un rejeu depuis le début, qui
 * redéposerait deux fois les mêmes fiches.
 *
 * `queued`/`processing` sont des états EN VOL : `outcomes` n'y est qu'un
 * PRÉFIXE (les fichiers déjà traités), jamais la totalité — afficher un
 * résumé de zéro erreur avant la fin mentirait par omission.
 */
export const CV_BATCH_IMPORT_JOB_STATUSES = ['queued', 'processing', 'done', 'failed'] as const
export type CvBatchImportJobStatus = (typeof CV_BATCH_IMPORT_JOB_STATUSES)[number]

/** La source des octets — même distinction que {@link CvZipImportInput} vs {@link CvFilesImportInput}. */
export const CV_BATCH_IMPORT_JOB_KINDS = ['zip', 'files'] as const
export type CvBatchImportJobKind = (typeof CV_BATCH_IMPORT_JOB_KINDS)[number]

export type CvBatchImportJobState = {
  id: string
  kind: CvBatchImportJobKind
  status: CvBatchImportJobStatus
  total: number
  /** Combien d'entrées ont déjà produit une issue — jamais un pourcentage. */
  processed: number
  summary: Record<CvBatchFileOutcome['status'], number>
  outcomes: CvBatchFileOutcome[]
  /** La dernière erreur d'une tentative — `null` = rien n'a échoué. */
  error: string | null
  /**
   * #1952.22 (épopée #2844) — le temps RESTANT estimé, en secondes. La seule
   * mesure disponible sans nouvelle table (le manifeste ci-dessus le disait :
   * « aucun historique de durée de traitement… les inventer afficherait une
   * valeur fictive ») : ce job persiste déjà SON PROPRE horodatage de départ
   * (`created_at`) et sa dernière écriture (`updated_at`, bumpée à chaque
   * `processed_count` — `cv-batch-import.worker.ts`). Le débit mesuré sur ce
   * qui est déjà traité (`updated_at - created_at`, réparti sur `processed`)
   * s'extrapole sur ce qui reste. `null` — jamais `0` — tant qu'aucun fichier
   * n'a encore produit d'issue (rien à mesurer) ou que le job est terminé.
   */
  etaSeconds: number | null
}

/**
 * #1952.22 — extrapolation linéaire du temps restant, à partir du SEUL
 * historique que ce job porte déjà : son propre débit mesuré depuis son
 * démarrage. Jamais une durée inventée par type/taille de fichier (ce que le
 * manifeste ci-dessus refuse) — seulement « ce qui a déjà pris tant de temps
 * pour tant de fichiers va prendre autant pour les fichiers restants ».
 */
export function estimateCvBatchImportEtaSeconds(job: {
  status: CvBatchImportJobStatus
  total: number
  processed: number
  createdAt: Date
  updatedAt: Date
}): number | null {
  if (job.status === 'done' || job.status === 'failed') return null
  if (job.processed <= 0) return null
  const remaining = job.total - job.processed
  if (remaining <= 0) return null
  const elapsedMs = job.updatedAt.getTime() - job.createdAt.getTime()
  if (elapsedMs <= 0) return null
  const msPerEntry = elapsedMs / job.processed
  return Math.round((msPerEntry * remaining) / 1000)
}

/** Traduit la ligne persistée en l'état que l'écran lit — jamais recalculé ailleurs (GA-26). */
export function buildCvBatchImportJobState(row: {
  id: string
  kind: CvBatchImportJobKind
  status: CvBatchImportJobStatus
  total: number
  processed_count: number
  outcomes: CvBatchFileOutcome[]
  error: string | null
  created_at: Date
  updated_at: Date
}): CvBatchImportJobState {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    total: row.total,
    processed: row.processed_count,
    summary: summariseCvBatchImport(row.outcomes),
    outcomes: row.outcomes,
    error: row.error,
    etaSeconds: estimateCvBatchImportEtaSeconds({
      status: row.status,
      total: row.total,
      processed: row.processed_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  }
}
