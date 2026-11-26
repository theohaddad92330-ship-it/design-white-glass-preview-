import { z } from 'zod'
import type { UniversalImportBreakdown } from './universal-import.js'
import { safeStorageName, TALENT_DOCUMENT_FILE_URL_TTL_SECONDS } from './talent-document-file.js'

/**
 * LE PACK DE CONTEXTE — « Dépose tes documents » (R21-JE, Julien Seigneur / exFabrica, call du 23/10/2026 :
 * « importer N'IMPORTE QUEL fichier de contexte à l'onboarding, et que chacun personnalise Bellum »).
 *
 * Les fichiers d'un client étaient DÉJÀ lisibles, mais par cinq écrans dispersés que personne ne trouvait
 * (import universel, postes cibles, grille go/no-go, bibliothèque de séquences, Connaissances). Ce contrat
 * n'ajoute AUCUN importeur : il AIGUILLE un fichier vers celui qui sait le lire.
 *
 * Décisions (Louis 21/10/2026) :
 *  · classement DÉTERMINISTE, aucun appel modèle — une extension, puis les en-têtes lus par le parser universel ;
 *  · le classement rend la destination ET les en-têtes qui l'ont décidée (l'écran les affiche) ;
 *  · aucune règle → connaissances : un fichier n'est jamais rejeté ;
 *  · l'utilisateur voit et peut changer la destination AVANT d'importer — le select ne propose que les
 *    importeurs qui savent LIRE ce format ({@link contextPackAllowedDestinations}) : on ne promet pas un format non lu.
 */

// import-contexte Je.1 — les formats acceptés par la zone de dépôt (un seul endroit, GA-26).
export const CONTEXT_PACK_EXTENSIONS = ['csv', 'tsv', 'xlsx', 'docx', 'pptx', 'pdf', 'md', 'txt', 'json'] as const
export type ContextPackExtension = (typeof CONTEXT_PACK_EXTENSIONS)[number]

/** Les formats dont l'en-tête se LIT pour décider ; tout autre format se décide sur son extension. */
export const CONTEXT_PACK_TABULAR_EXTENSIONS = ['csv', 'tsv', 'xlsx'] as const

// import-contexte Je.1 — les cinq destinations = les cinq importeurs existants.
export const CONTEXT_PACK_DESTINATIONS = [
  'accounts',
  'target_personas',
  'qualification_grid',
  'sequences',
  'knowledge',
] as const
export const contextPackDestinationSchema = z.enum(CONTEXT_PACK_DESTINATIONS)
export type ContextPackDestination = z.infer<typeof contextPackDestinationSchema>

/**
 * Ce que chaque importeur sait lire — lu dans son propre schéma, jamais deviné :
 *  · comptes : l'import universel (`csv` — dont la tabulation, détectée —, `xlsx`, `json`) ;
 *  · postes cibles, grille, séquences : `csv` | `xlsx` (leurs schémas d'entrée respectifs) ;
 *  · connaissances : tout le reste, texte lu en clair ou extrait côté serveur.
 */
const DESTINATION_FORMATS: Record<ContextPackDestination, readonly ContextPackExtension[]> = {
  accounts: ['csv', 'tsv', 'xlsx', 'json'],
  target_personas: ['csv', 'xlsx'],
  qualification_grid: ['csv', 'xlsx'],
  sequences: ['csv', 'xlsx'],
  knowledge: CONTEXT_PACK_EXTENSIONS,
}

/**
 * Le plafond de la TÊTE envoyée pour classer un texte délimité : la première ligne suffit, 64 Ko la couvrent
 * largement. Un `xlsx` est une archive (répertoire central à la fin) : il part entier, sous
 * {@link CONTEXT_PACK_CLASSIFY_MAX_BYTES} — au-delà, il n'est pas lu et part en connaissances, ce que la ligne dit.
 */
export const CONTEXT_PACK_HEAD_BYTES = 64 * 1024
export const CONTEXT_PACK_CLASSIFY_MAX_BYTES = 4 * 1024 * 1024

/** L'extension en minuscules, sans point — `''` quand il n'y en a pas. */
export function contextPackExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
}

const isContextPackExtension = (ext: string): ext is ContextPackExtension =>
  (CONTEXT_PACK_EXTENSIONS as readonly string[]).includes(ext)

/** Les destinations proposées au select pour ce format, dans l'ordre de {@link CONTEXT_PACK_DESTINATIONS}. */
export function contextPackAllowedDestinations(ext: string): ContextPackDestination[] {
  return CONTEXT_PACK_DESTINATIONS.filter(destination =>
    (DESTINATION_FORMATS[destination] as readonly string[]).includes(ext),
  )
}

/* ------------------------------------------------------------------ */
/*  Les règles nommées                                                 */
/* ------------------------------------------------------------------ */

/**
 * Une règle : au moins UN en-tête « clé » ET au moins UN en-tête « qualifiant ». Une seule colonne ne
 * décide jamais (« Entreprise » seule est un annuaire, pas un tiering). `excluded` : un en-tête qui signe
 * des PERSONNES (e-mail, prénom…) interdit la règle — un fichier de contacts a une « Fonction » et une
 * « Séniorité », ce n'est pas pour autant une liste de postes cibles.
 *
 * L'ordre compte : la première règle satisfaite gagne.
 */
type ContextPackRule = {
  destination: Exclude<ContextPackDestination, 'knowledge'>
  keys: readonly string[]
  qualifiers: readonly string[]
  excluded?: readonly string[]
}

const PERSON_HEADERS = ['email', 'e mail', 'mail', 'prenom', 'telephone', 'linkedin', 'portable'] as const

const CONTEXT_PACK_RULES: readonly ContextPackRule[] = [
  { destination: 'qualification_grid', keys: ['critere', 'go no go'], qualifiers: ['poids', 'note', 'seuil'] },
  {
    destination: 'sequences',
    keys: ['etape', 'sequence'],
    // #4426.7 — le classeur de campagnes réel porte « Type / Étape », « Titre / Intitulé » et « Contenu ».
    qualifiers: ['objet', 'script', 'accroche', 'relance', 'contenu', 'corps'],
  },
  {
    destination: 'target_personas',
    keys: ['poste', 'intitule', 'fonction'],
    qualifiers: ['niveau', 'decideur', 'seniorite'],
    excluded: PERSON_HEADERS,
  },
  {
    destination: 'accounts',
    keys: ['entreprise', 'societe', 'raison sociale'],
    // #4426.4 — « Tiering (A, B, C) » : le mot est « tiering », pas « tier ». Un onglet « Supprimées »
    // (« Motif de suppression ») porte les mêmes colonnes mais n'est jamais la liste de comptes à importer.
    qualifiers: ['tier', 'tiering', 'priorite', 'segment'],
    excluded: ['suppression', 'supprime'],
  },
]

/** Un en-tête en mots comparables : sans accent, minuscules, ponctuation = espace, pluriel en -s retiré. */
function headerWords(header: string): string[] {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(word => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
}

/** Un mot-clé (éventuellement plusieurs mots) présent comme suite CONTIGUË de mots de l'en-tête. */
function headerHas(header: string, keyword: string): boolean {
  const words = headerWords(header)
  const target = headerWords(keyword)
  for (let start = 0; start + target.length <= words.length; start += 1) {
    if (target.every((word, offset) => words[start + offset] === word)) return true
  }
  return false
}

const matchesAny = (header: string, keywords: readonly string[]): boolean =>
  keywords.some(keyword => headerHas(header, keyword))

/* ------------------------------------------------------------------ */
/*  Le classement                                                      */
/* ------------------------------------------------------------------ */

/**
 * Pourquoi cette destination — l'écran le DIT :
 *  · `extension` : un document (docx, pdf…) part en connaissances par son format ;
 *  · `headers` : une règle nommée a reconnu ses colonnes (`matchedHeaders`) ;
 *  · `no_rule` : un tableau qu'aucune règle ne reconnaît — en connaissances, jamais rejeté ;
 *  · `multi_sheet` : un classeur à plusieurs onglets — le parser ne lit que le premier, le fichier part
 *    entier en connaissances plutôt que de deviner ;
 *  · `unreadable` : l'en-tête n'a pas pu être lu (fichier trop gros pour être classé, archive abîmée…).
 */
export const CONTEXT_PACK_CLASSIFY_RULES = ['extension', 'headers', 'no_rule', 'multi_sheet', 'unreadable'] as const

export const contextPackClassificationSchema = z.object({
  fileName: z.string(),
  extension: z.string(),
  destination: contextPackDestinationSchema,
  rule: z.enum(CONTEXT_PACK_CLASSIFY_RULES),
  /** Les en-têtes, tels qu'écrits dans le fichier, qui ont décidé. Vide hors règle `headers`. */
  matchedHeaders: z.array(z.string()),
  /** Le nombre d'onglets d'un `xlsx` lu ; `null` ailleurs — jamais un 0 inventé. */
  sheetCount: z.number().int().positive().nullable(),
  /** #4426.4 — l'onglet d'un classeur multi-onglets qui a décidé la destination ; `null` sinon. */
  sheet: z.string().nullable(),
  /** #4426.4 — les AUTRES onglets reconnus (destination différente), dans l'ordre de priorité métier. */
  otherSheets: z.array(z.object({ sheet: z.string(), destination: contextPackDestinationSchema })),
  allowedDestinations: z.array(contextPackDestinationSchema),
})
export type ContextPackClassification = z.infer<typeof contextPackClassificationSchema>

/** #4426.4 — l'ordre métier quand plusieurs onglets d'un classeur sont reconnus pour des destinations différentes. */
const SHEET_PRIORITY: readonly ContextPackDestination[] = [
  'accounts',
  'sequences',
  'target_personas',
  'qualification_grid',
]

/** Les règles nommées contre UN jeu d'en-têtes ; `null` = aucune règle satisfaite. */
function recognise(
  headers: readonly string[],
): { destination: Exclude<ContextPackDestination, 'knowledge'>; matchedHeaders: string[] } | null {
  for (const rule of CONTEXT_PACK_RULES) {
    if (rule.excluded && headers.some(header => matchesAny(header, rule.excluded ?? []))) continue
    const keyHeaders = headers.filter(header => matchesAny(header, rule.keys))
    const qualifierHeaders = headers.filter(
      header => !keyHeaders.includes(header) && matchesAny(header, rule.qualifiers),
    )
    if (keyHeaders.length === 0 || qualifierHeaders.length === 0) continue
    const decisive = new Set([...keyHeaders, ...qualifierHeaders])
    // L'ordre du FICHIER, pas celui des règles : l'écran cite les colonnes comme l'utilisateur les a écrites.
    return { destination: rule.destination, matchedHeaders: headers.filter(header => decisive.has(header)) }
  }
  return null
}

/**
 * La règle PURE : une extension, des en-têtes (`null` = non lus), un nombre d'onglets (`null` = pas un classeur
 * ou non lu). Aucun appel réseau, aucun modèle — le même fichier rend toujours la même destination.
 */
export function classifyContextPackFile(input: {
  fileName: string
  headers: readonly string[] | null
  sheetCount: number | null
  /** #4426.4 — les en-têtes de CHAQUE onglet d'un classeur (dans l'ordre du classeur). */
  sheets?: readonly { name: string; headers: readonly string[] }[] | null
}): ContextPackClassification {
  const extension = contextPackExtension(input.fileName)
  const base = {
    fileName: input.fileName,
    extension,
    sheetCount: input.sheetCount,
    sheet: null,
    otherSheets: [],
    allowedDestinations: contextPackAllowedDestinations(extension),
  }
  const knowledge = (rule: ContextPackClassification['rule']): ContextPackClassification => ({
    ...base,
    destination: 'knowledge',
    rule,
    matchedHeaders: [],
  })
  if (!(CONTEXT_PACK_TABULAR_EXTENSIONS as readonly string[]).includes(extension)) return knowledge('extension')
  if (input.headers === null) return knowledge('unreadable')
  if (input.sheetCount !== null && input.sheetCount > 1) {
    // #4426.4 — chaque onglet est essayé contre les règles ; le premier reconnu, par priorité métier, décide.
    const recognised = (input.sheets ?? []).flatMap(sheet => {
      const hit = recognise(sheet.headers)
      return hit ? [{ sheet: sheet.name, ...hit }] : []
    })
    const ranked = [...recognised].sort(
      (a, b) => SHEET_PRIORITY.indexOf(a.destination) - SHEET_PRIORITY.indexOf(b.destination),
    )
    const [chosen, ...rest] = ranked
    if (!chosen) return knowledge('multi_sheet')
    return {
      ...base,
      destination: chosen.destination,
      rule: 'headers',
      matchedHeaders: chosen.matchedHeaders,
      sheet: chosen.sheet,
      otherSheets: rest
        .filter(other => other.destination !== chosen.destination)
        .map(other => ({ sheet: other.sheet, destination: other.destination })),
    }
  }
  const hit = recognise(input.headers)
  if (hit) return { ...base, rule: 'headers', ...hit }
  return knowledge('no_rule')
}

/* ------------------------------------------------------------------ */
/*  La requête de classement                                           */
/* ------------------------------------------------------------------ */

/**
 * `POST /import/context-pack/classify` — UN fichier par appel. `headB64` : la tête du fichier (texte délimité)
 * ou le classeur entier (`xlsx`, sous {@link CONTEXT_PACK_CLASSIFY_MAX_BYTES}) ; absent pour un document,
 * qui se classe par son extension.
 */
export const contextPackClassifyRequestSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(name => isContextPackExtension(contextPackExtension(name)), 'Format non pris en charge.'),
  headB64: z
    .string()
    .min(1)
    .max(Math.ceil((CONTEXT_PACK_CLASSIFY_MAX_BYTES * 4) / 3) + 8)
    .optional(),
})
export type ContextPackClassifyRequest = z.infer<typeof contextPackClassifyRequestSchema>

/* ------------------------------------------------------------------ */
/*  Le résultat par fichier                                            */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'un import a PRIS, par destination — compté par l'importeur appelé, jamais estimé. `count: null` =
 * l'importeur ne le dit pas encore (un import de comptes s'écrit en tâche de fond) : l'écran ne l'écrit jamais « 0 ».
 */
export const contextPackImportOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('imported'),
    fileName: z.string(),
    destination: contextPackDestinationSchema,
    count: z.number().int().min(0).nullable(),
    /** Les lignes que l'importeur a écartées, comptées (jamais tues). */
    skipped: z.number().int().min(0),
    /** #4426.7 — le MOTIF de chaque ligne écartée (numéro de ligne, code du motif, campagne si l'importeur la nomme). */
    skippedDetails: z
      .array(z.object({ line: z.number().int(), reason: z.string(), label: z.string().nullable() }))
      .optional(),
    /** #4426.7 — les scripts d'appel gardés avec une campagne importée ; absent = la destination n'en a pas. */
    scripts: z.number().int().min(0).optional(),
    /** #4426.7 — les mails de la campagne rangés en étapes de séquence ; absent = la destination n'en a pas. */
    mails: z.number().int().min(0).optional(),
  }),
  z.object({
    status: z.literal('failed'),
    fileName: z.string(),
    destination: contextPackDestinationSchema,
    /** Le message de l'importeur, tel quel — jamais un échec muet. */
    message: z.string(),
  }),
])
export type ContextPackImportOutcome = z.infer<typeof contextPackImportOutcomeSchema>

/* ------------------------------------------------------------------ */
/*  L'historique des imports de l'assistant                            */
/* ------------------------------------------------------------------ */

/**
 * #4422.1 — chaque import de l'assistant écrit sa ligne d'historique. Les COMPTES n'en ont pas besoin ici : leur
 * import est déjà un job universel, listé par l'historique de /settings/import.
 */
export const CONTEXT_PACK_RECORDED_DESTINATIONS = [
  'target_personas',
  'qualification_grid',
  'sequences',
  'knowledge',
] as const
export const contextPackRecordedDestinationSchema = z.enum(CONTEXT_PACK_RECORDED_DESTINATIONS)

/* ------------------------------------------------------------------ */
/*  L'original déposé (#4573)                                          */
/* ------------------------------------------------------------------ */

/**
 * #4573 — l'ORIGINAL d'un document de contexte se conserve et se relit, sur la règle déjà prise pour les CV (#4034,
 * Louis 12/10/2026) : seau PRIVÉ, URL signée de courte durée fabriquée côté serveur après le contrôle de l'espace.
 *
 * L'état de l'original, posé AU DÉPÔT (jamais reconstruit après coup) :
 *  · `kept` — rangé dans le seau, l'aperçu s'ouvre ;
 *  · `too_big` — au-delà de {@link CONTEXT_PACK_ORIGINAL_MAX_BYTES}, il n'a pas voyagé ;
 *  · `unavailable` — stockage non branché ou refusé : l'import a eu lieu, l'original n'est pas gardé ;
 *  · `failed_import` — l'import a échoué : rien n'a été créé, rien n'est gardé (l'original suit sa donnée) ;
 *  · `erased` — effacé par un effacement RGPD (c67, #2297) : la ligne reste, l'objet est parti.
 * Une ligne SANS statut (`NULL`) est un import ANTÉRIEUR à #4573 : elle le DIT ({@link contextPackOriginalOf}).
 */
export const CONTEXT_PACK_ORIGINAL_STATUSES = ['kept', 'too_big', 'unavailable', 'failed_import', 'erased'] as const
export type ContextPackOriginalStatus = (typeof CONTEXT_PACK_ORIGINAL_STATUSES)[number]

/** Le plafond de l'original transmis : sous la limite de corps de `/import` (12 Mo, `main.ts`) une fois en base64. */
export const CONTEXT_PACK_ORIGINAL_MAX_BYTES = 8 * 1024 * 1024

/** #4573 — la durée de l'URL d'aperçu : CELLE des CV (≤ 5 min), un seul réglage (GA-26). */
export const CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS = TALENT_DOCUMENT_FILE_URL_TTL_SECONDS

/** `<workspace_id>/context-pack/<import_id>/<nom>` — le cloisonnement porté par le chemin, comme les CV. */
export function contextPackOriginalStoragePath(workspaceId: string, importId: string, fileName: string): string {
  return `${workspaceId}/context-pack/${importId}/${safeStorageName(fileName, 'document')}`
}

const ORIGINAL_MIME_BY_EXTENSION: Record<ContextPackExtension, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
}

/** Le type de l'original : l'extension parmi les neuf formats acceptés, jamais deviné au-delà. */
export function contextPackOriginalMimeType(fileName: string): string {
  const ext = contextPackExtension(fileName)
  return isContextPackExtension(ext) ? ORIGINAL_MIME_BY_EXTENSION[ext] : 'application/octet-stream'
}

/** L'état affiché d'un original : `earlier` pour une ligne d'avant #4573 — on ne fait pas semblant. */
export function contextPackOriginalOf(status: ContextPackOriginalStatus | null | undefined): ContextPackOriginalView {
  return status ?? 'earlier'
}
export type ContextPackOriginalView = ContextPackOriginalStatus | 'earlier'

/** `GET /import/context-pack/history/:id/original-url` — une URL signée qui n'ouvre QUE cet original, et périme. */
export const contextPackOriginalUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  mimeType: z.string().nullable(),
  fileName: z.string(),
})
export type ContextPackOriginalUrl = z.infer<typeof contextPackOriginalUrlSchema>

/** `POST /import/context-pack/history` — le bilan que l'importeur appelé a rendu, tel quel (jamais estimé). */
export const contextPackRecordRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  destination: contextPackRecordedDestinationSchema,
  status: z.enum(['done', 'failed']),
  /** `null` = l'importeur ne le dit pas — jamais un 0 inventé. */
  imported: z.number().int().min(0).nullable(),
  skipped: z.number().int().min(0),
  scripts: z.number().int().min(0).nullable(),
  message: z.string().trim().max(500).nullable(),
  /** #4573 — l'ORIGINAL déposé, en base64, d'un import réussi sous {@link CONTEXT_PACK_ORIGINAL_MAX_BYTES}. */
  fileB64: z
    .string()
    .max(Math.ceil((CONTEXT_PACK_ORIGINAL_MAX_BYTES * 4) / 3) + 8)
    .optional(),
  /** #4573 — l'original dépassait le plafond : il n'a pas voyagé, la ligne le dira. */
  originalTooBig: z.boolean().optional(),
})
export type ContextPackRecordRequest = z.infer<typeof contextPackRecordRequestSchema>

export const contextPackHistoryItemSchema = contextPackRecordRequestSchema
  .omit({ fileB64: true, originalTooBig: true })
  .extend({
    // #AM.11 — l'historique est multi-lots : un lot de CV (autre chaîne que l'assistant) y figure aussi.
    destination: z.enum([...CONTEXT_PACK_RECORDED_DESTINATIONS, 'cv']),
    id: z.string().guid(),
    createdAt: z.string(),
    // #AM.11 — le bilan par famille du lot (`ImportFamilyReport`) ; absent = rien à dire par famille.
    breakdown: z.record(z.string(), z.unknown()).optional() as z.ZodOptional<z.ZodType<UniversalImportBreakdown>>,
    /** #4573 — l'état de l'original d'un import de l'assistant ; absent pour un lot de CV (son original vit sur la fiche). */
    original: z.enum([...CONTEXT_PACK_ORIGINAL_STATUSES, 'earlier']).optional(),
  })
export type ContextPackHistoryItem = z.infer<typeof contextPackHistoryItemSchema>
