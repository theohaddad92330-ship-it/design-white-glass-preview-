/**
 * #2850 (#2431.2/.10, reste 27/09) — LE ROUTAGE GÉNÉRIQUE, PAR CONTENU.
 *
 * Le composeur `/chat` (dépôt de fichier) ne routait un fichier tabulaire QUE
 * vers l'index RAG — jamais vers un objet métier, même quand ses colonnes
 * correspondent EXACTEMENT à une source d'import déjà connue (#2148.25/#2850,
 * `import-catalog.ts`). #2431.10 demandait une classification par CONTENU (au-
 * delà du nom de fichier), à plusieurs paliers de confiance : c'est ce que fait
 * ce fichier, en réutilisant le MOTEUR déjà écrit pour l'assistant d'import
 * (`proposeMapping`, `IMPORT_CATALOG`) — jamais un second catalogue d'alias, qui
 * divergerait au premier ajout (GA-26).
 *
 * Ce que ce module NE FAIT PAS : il ne route JAMAIS l'écriture (#2431.11 reste
 * séparé, hors de cette tranche) — seulement la CLASSIFICATION, une fonction
 * PURE sans écriture ni appel réseau. `RagController.ingest` l'appelle et
 * ajoute une SUGGESTION à sa réponse ; le fichier est ingéré dans le RAG
 * exactement comme avant, la classification ne change rien à ce chemin.
 * `WRITABLE_IMPORT_OBJECTS` filtre déjà les objets non écrivables (`document`,
 * `reference`) : un fichier de témoignages ou d'appel d'offres, par exemple, ne
 * peut jamais ressortir en suggestion, même s'il matche parfaitement sa source.
 */
import { isWritableImportObject, proposeMapping, type WritableImportObject } from '@bellum/contracts'
import { parseDelimited } from '../import/delimited-parser'
import { IMPORT_CATALOG, primaryObject } from '../import/import-catalog'

type ChatDropClassification = {
  object: WritableImportObject
  /** La source du catalogue qui a le mieux matché — pour un message qui NOMME
   *  ce qu'il reconnaît, jamais une simple étiquette d'objet. */
  sourceKey: string
  /** #2431.10 — « confiance à plusieurs paliers » : `high` quand TOUTES les
   *  colonnes du fichier sont reconnues, `low` quand seuls les champs
   *  OBLIGATOIRES de la source le sont (des colonnes restent non reconnues). */
  confidence: 'high' | 'low'
}

/**
 * Classifie un contenu tabulaire (CSV/TSV texte brut — le seul cas où le
 * composeur envoie `content` plutôt que `fileB64`, voir `fileToIngestInput`)
 * vers l'objet métier le plus probable, en réutilisant EXACTEMENT le même
 * moteur de correspondance que l'assistant d'import (`proposeMapping` +
 * `IMPORT_CATALOG`) — jamais un second calcul de correspondance.
 *
 * `null` : moins de deux colonnes (pas un fichier tabulaire — un `.txt`/`.md`
 * de notes, par exemple), ou aucune source du catalogue dont les champs
 * OBLIGATOIRES sont tous couverts, ou la source la mieux matchée écrit vers un
 * objet non écrivable (`document`, `reference` — jamais proposé).
 */
export function classifyChatDropContent(content: string): ChatDropClassification | null {
  const { headers } = parseDelimited(content, 0)
  if (headers.length < 2) return null

  let best: { sourceKey: string; object: WritableImportObject; recognizedHeaders: number } | null = null
  for (const source of IMPORT_CATALOG) {
    // Une source SANS champ obligatoire (`cv_bulk` — une archive de documents,
    // pas un tableau) « correspond » à n'importe quel en-tête sans rien y
    // avoir reconnu : ce n'est pas un signal, c'est un vide qui gagnerait par
    // défaut. Exactement le fait inventé que la doctrine refuse ailleurs.
    if (source.required.length === 0) continue
    const object = primaryObject(source)
    if (!isWritableImportObject(object)) continue
    const { columns } = proposeMapping(headers, source.aliases)
    const mappedFields = new Set(Object.values(columns))
    const hasEveryRequiredField = source.required.every(field => mappedFields.has(field))
    if (!hasEveryRequiredField) continue
    const recognizedHeaders = Object.keys(columns).length
    // Le catalogue est une LISTE ORDONNÉE (`IMPORT_SOURCES`, `@bellum/contracts`) :
    // à correspondance égale, la source la plus proche du début gagne — un
    // ordre STABLE, jamais un tirage entre deux égalités.
    if (!best || recognizedHeaders > best.recognizedHeaders) best = { sourceKey: source.key, object, recognizedHeaders }
  }
  if (!best) return null

  return {
    object: best.object,
    sourceKey: best.sourceKey,
    confidence: best.recognizedHeaders >= headers.length ? 'high' : 'low',
  }
}
