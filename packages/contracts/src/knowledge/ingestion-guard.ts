/**
 * La garde d'ingestion de la base de connaissance.
 *
 * ## Le défaut qu'elle ferme
 *
 * `method-delta.ts` porte le manifeste depuis le premier jour, avec la phrase
 * de la source en toutes lettres — « ⚠ Le fichier brut ne va JAMAIS dans un
 * index d'IA. Jamais. » — et le PDF 10 §6.4 énumère ce qu'on n'y met jamais :
 * « un export de CRM brut · des données personnelles · le contenu d'un message ·
 * les données d'un autre espace · un prompt historique monolithique · une liste
 * de contacts à prospecter ».
 *
 * `mayBeIngested()` n'avait AUCUN appelant hors son propre test : l'interdit
 * était écrit, testé, et rien ne l'appliquait. Un export de 17 387 contacts
 * déposé dans Connaissances › Mes documents partait donc en vecteurs, où il
 * devenait retrouvable par n'importe quelle question, indéfiniment, sans
 * qu'aucune des personnes citées l'ait su.
 *
 * ## Pourquoi elle est aussi ÉTROITE
 *
 * Un filtre trop large ferait refuser des documents légitimes, et quelqu'un le
 * désactiverait dans la semaine — ce qui est pire que pas de filtre. Trois
 * règles seulement, chacune adossée à une preuve, et rien d'autre n'est jugé :
 *
 * 1. **Un fichier que le manifeste NOMME** et classe hors base de connaissance
 *    (`notRag`). Le manifeste est une liste d'autorisations POUR LE PAQUET ; le
 *    lire comme une liste d'interdictions pour tout le produit refuserait chaque
 *    dépôt, puisque aucun document d'utilisateur n'y figure. On ne le consulte
 *    donc que pour les six noms qu'il connaît.
 * 2. **Un nom qui porte un codename interne** (#3881, `INTERNAL_CODENAMES`) : un
 *    fichier nommé d'après un outil interne (« DATAFORGE_V4_FINAL (4).xlsx »)
 *    devenait une citation visible au client — l'interdit était déjà écrit dans
 *    `RAG_INGESTION_EXCLUDED`, rien ne l'appliquait.
 * 3. **Un tableau de contacts** : un en-tête délimité qui porte au moins une
 *    COORDONNÉE (adresse, téléphone, profil professionnel) et au moins trois
 *    colonnes personnelles en tout, suivi d'au moins trois lignes de la même
 *    forme. C'est la forme exacte d'un export de CRM ; ce n'est la forme
 *    d'aucun document de méthode, d'aucune plaquette, d'aucune page de notes.
 *
 * Le seuil de TROIS colonnes personnelles n'est pas une coquetterie : « Source ;
 * URL ; Email de contact » est une bibliographie et doit passer, « Prénom ; Nom ;
 * Société ; Fonction ; Email ; Téléphone » est un carnet d'adresses et doit être
 * refusé. Deux colonnes ne séparent pas les deux, trois oui.
 *
 * Ce que la garde ne prétend PAS attraper : un carnet d'adresses en PDF, en
 * classeur, ou recopié en prose. Une garde qui devinerait cela refuserait des
 * CV et des comptes rendus. Ce qui est tenu, c'est la forme brute — celle que
 * la source vise nommément.
 */

import { mayBeIngested, RAG_INGESTION_EXCLUDED, RAG_INGESTION_MANIFEST } from './method-delta.js'

/** Un refus d'ingestion : son code, et la phrase que la personne lit. */
export type RagIngestionRefusal = {
  readonly code: 'not_retrieval_knowledge' | 'internal_codename' | 'contact_table'
  /** Ce qui a été écarté ET pourquoi. Jamais un silence, jamais « refusé ». */
  readonly message: string
}

/** #3881 — les noms internes qu'un dépôt ne doit JAMAIS porter : l'écrit
 *  (`RAG_INGESTION_EXCLUDED[1]` == « doublon DATAFORGE V4 ») existait déjà,
 *  rien ne l'appliquait — un fichier nommé d'après l'outil interne traversait
 *  la garde et devenait une citation visible au client.
 *
 *  V13 (recette prod 08/10) — trois noms de plus, vus EN PRODUCTION dans une
 *  citation : les archives internes « Stelya » et « Orion Datapack », et
 *  « BellumAI », le nom de l'outil lui-même. `oriondatapack` et non `orion`
 *  seul : un vrai prospect peut s'appeler Orion. */
const INTERNAL_CODENAME_LIST = ['dataforge', 'stelya', 'oriondatapack', 'bellumai'] as const
const INTERNAL_CODENAMES = new Set<string>(INTERNAL_CODENAME_LIST)

/** Ce que chaque type du manifeste est, en français, pour le dire à la personne
 *  qui vient de déposer le fichier. Un refus qui ne nomme pas la nature du
 *  fichier laisse chercher une panne. */
const TYPE_LABELS: Record<string, string> = {
  classifier_seed: 'une graine de classifieur',
  template_metadata: 'des métadonnées de gabarits',
  workflow_spec: 'un contrat de workflow',
  eval_spec: 'un jeu d’évaluation',
}

/** Le type existe mais personne ne lui a écrit d'étiquette : on dit quand même
 *  ce qu'il est, plutôt que de laisser un trou dans la phrase du refus. */
const DEFAULT_TYPE_LABEL = 'une spécification'

/** Les colonnes qui font d'une ligne une COORDONNÉE — ce avec quoi on joint
 *  quelqu'un. C'est leur présence qui distingue un carnet d'un tableau. */
const COORDINATE_WORD_LIST = [
  'email',
  'mail',
  'courriel',
  'telephone',
  'tel',
  'phone',
  'mobile',
  'portable',
  'gsm',
  'linkedin',
] as const
const COORDINATE_WORDS = new Set<string>(COORDINATE_WORD_LIST)

/** Les colonnes qui désignent une PERSONNE ou son rattachement. Volontairement
 *  sans « titre » ni « rôle », trop génériques pour valoir preuve. */
const IDENTITY_WORD_LIST = [
  'nom',
  'prenom',
  'name',
  'firstname',
  'lastname',
  'fullname',
  'civilite',
  'contact',
  'societe',
  'company',
  'entreprise',
  'organisation',
  'organization',
  'fonction',
  'poste',
  'job',
] as const
const IDENTITY_WORDS = new Set<string>(IDENTITY_WORD_LIST)

/** Les séparateurs d'un export réel : le point-virgule d'un Excel français
 *  d'abord, parce que c'est celui qu'on rencontre (leçon de `csv-import.ts`). */
const SEPARATORS = [';', '\t', ','] as const

/** Un en-tête se cherche dans les premières lignes, pas dans tout le fichier :
 *  plus on descend, plus on risque de prendre une phrase pour un en-tête. */
const HEADER_SCAN_LINES = 5
/** Assez de lignes pour reconnaître une régularité, assez peu pour ne rien coûter. */
const MAX_LINES = 200
const MIN_COLUMNS = 3
const MIN_DATA_ROWS = 3
const MIN_PERSONAL_COLUMNS = 3

/**
 * Les deux refus, EN TOUTES LETTRES, avec leurs trous nommés.
 *
 * Ils sont des gabarits et non des chaînes construites en ligne pour une raison
 * précise : le service IA porte la MÊME garde en Python (la porte TypeScript
 * n'est pas la seule — quatre écritures dans `rag_documents` vivent côté
 * Python), et deux refus rédigés séparément divergent en trois semaines. Une
 * personne verrait alors deux explications différentes du même refus selon la
 * porte qu'elle a poussée. Le gabarit voyage en JSON
 * (`ingestion-guard.constants.json`) et une garde des deux côtés le verrouille.
 */
const MESSAGE_TEMPLATES = {
  not_retrieval_knowledge:
    '« {file} » est {label} : le manifeste d’ingestion le classe hors base de connaissance. ' +
    'Indexé, il remonterait comme réponse à une question commerciale, alors que c’est un fichier de configuration — ' +
    'sa place est dans le code, où il est versionné et testé.',
  contact_table:
    'Ce dépôt a la forme d’un carnet d’adresses : les colonnes « {columns} », et au moins {rows} lignes derrière. ' +
    'La base de connaissance n’indexe jamais un fichier de contacts — il deviendrait retrouvable par n’importe ' +
    'quelle question, indéfiniment, sans qu’aucune des personnes citées l’ait su. Pour faire entrer ces contacts ' +
    'dans Bellum, passe par l’assistant d’import, qui simule avant d’écrire et te montre ce qu’il a compris.',
  internal_codename:
    '« {file} » porte le nom d’un outil interne ({excluded}) : ce dépôt n’entre jamais dans la base de ' +
    'connaissance — il y resterait retrouvable par n’importe quelle question, indéfiniment, et une citation le ' +
    'montrerait à un client, qui ne doit jamais voir le nom d’un outil interne. Renomme le fichier avant de le ' +
    'déposer à nouveau.',
} as const

/** Remplace `{nom}` par sa valeur. Volontairement bête : un gabarit de refus
 *  n'a pas de conditionnel, et un moteur en aurait un. */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}

/** minuscules, sans accents, ponctuation ramenée à des espaces. */
function normalize(cell: string): string {
  return cell
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** « emails » et « email » sont la même colonne ; « mailing » n'en est pas une. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

function cellWords(cell: string): string[] {
  return normalize(cell).split(' ').filter(Boolean).map(singular)
}

function splitCells(line: string, separator: string): string[] {
  return line.split(separator).map(cell =>
    cell
      .trim()
      .replace(/^"+|"+$/g, '')
      .trim(),
  )
}

type HeaderVerdict = { readonly coordinates: string[]; readonly identities: string[] }

/** Classe chaque cellule d'en-tête UNE fois — coordonnée d'abord, rattachement
 *  ensuite. « Email de contact » est une coordonnée, pas deux colonnes. */
function classifyHeader(cells: readonly string[]): HeaderVerdict {
  const coordinates: string[] = []
  const identities: string[] = []
  for (const cell of cells) {
    const words = cellWords(cell)
    if (words.some(word => COORDINATE_WORDS.has(word))) coordinates.push(cell)
    else if (words.some(word => IDENTITY_WORDS.has(word))) identities.push(cell)
  }
  return { coordinates, identities }
}

/** #3881 — un dépôt dont le NOM porte le codename interne, quelle que soit sa
 *  casse ou sa ponctuation (« DATAFORGE_V4_FINAL (4).xlsx », « Export_DataForge.xlsx »). */
function internalCodenameRefusal(filename: string): RagIngestionRefusal | null {
  const folded = filename.toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (const codename of INTERNAL_CODENAMES) {
    if (folded.includes(codename)) {
      return {
        code: 'internal_codename',
        message: fill(MESSAGE_TEMPLATES.internal_codename, { file: filename, excluded: RAG_INGESTION_EXCLUDED[1] }),
      }
    }
  }
  return null
}

function contactTableRefusal(sample: string): RagIngestionRefusal | null {
  const lines = sample
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, MAX_LINES)

  for (const separator of SEPARATORS) {
    for (let head = 0; head < Math.min(HEADER_SCAN_LINES, lines.length); head += 1) {
      const cells = splitCells(lines[head] ?? '', separator)
      if (cells.length < MIN_COLUMNS) continue

      const { coordinates, identities } = classifyHeader(cells)
      if (coordinates.length < 1) continue
      if (coordinates.length + identities.length < MIN_PERSONAL_COLUMNS) continue

      // Un export est RÉGULIER : les lignes ont le nombre de colonnes de leur
      // en-tête. De la prose ponctuée ne l'est pas — c'est ce qui empêche un
      // document de méthode plein de virgules d'être pris pour un tableau.
      const rows = lines.slice(head + 1).filter(line => splitCells(line, separator).length === cells.length).length
      if (rows < MIN_DATA_ROWS) continue

      const named = [...coordinates, ...identities].slice(0, 4).join(' », « ')
      return {
        code: 'contact_table',
        message: fill(MESSAGE_TEMPLATES.contact_table, { columns: named, rows: String(rows) }),
      }
    }
  }
  return null
}

/**
 * Ce dépôt peut-il entrer dans la base de connaissance ? `null` = oui.
 *
 * Pure : aucune lecture, aucun réseau, aucun modèle. `sample` est du TEXTE — le
 * contenu quand on l'a, sinon le début du fichier décodé ; un binaire n'y
 * ressemblera à aucun tableau et passera, ce qui est le bon comportement.
 */
export function ragIngestionRefusal(input: {
  filename?: string | null
  sample?: string | null
}): RagIngestionRefusal | null {
  const filename = (input.filename ?? '').trim().split(/[/\\]/).pop() ?? ''
  // Règle 1 — le manifeste, et UNIQUEMENT pour les fichiers qu'il nomme.
  const named = RAG_INGESTION_MANIFEST.find(entry => entry.file === filename)
  if (named && !mayBeIngested(named.file)) {
    const label = TYPE_LABELS[named.type] ?? DEFAULT_TYPE_LABEL
    return {
      code: 'not_retrieval_knowledge',
      message: fill(MESSAGE_TEMPLATES.not_retrieval_knowledge, { file: named.file, label }),
    }
  }

  // Règle 2 — le nom interne.
  if (filename) {
    const codename = internalCodenameRefusal(filename)
    if (codename) return codename
  }

  // Règle 3 — le carnet d'adresses.
  const sample = input.sample ?? ''
  return sample.trim() ? contactTableRefusal(sample) : null
}

/**
 * Tout ce qui fait la décision de cette garde, sous une forme qu'un autre
 * langage peut lire.
 *
 * ## Pourquoi cette forme existe
 *
 * La garde TypeScript ci-dessus n'est PAS la seule porte du magasin, contrairement
 * à ce que `IaClient.ragIngest` affirme : `apps/ia/app/services/rag_service.py`
 * écrit dans `rag_documents` par deux chemins (`ingest`, `upsert`) qui ne passent
 * jamais par NestJS — la distillation d'une analyse, et le script d'import CRM.
 * Le refus devait donc être porté en Python aussi.
 *
 * Et il ne pouvait pas y être IMPORTÉ : la racine Railway du service IA est
 * `apps/ia`, `packages/` n'est pas dans son contexte de build (même contrainte
 * que `RAG_DECAY_HORIZON_DAYS`, cf. `apps/ia/app/services/rag_service.py`). Deux
 * copies étaient donc inévitables ; ce qui ne l'était pas, c'est qu'elles
 * divergent. Ces constantes sont figées à l'identique dans
 * `ingestion-guard.constants.json`, et deux gardes les verrouillent :
 * `ingestion-guard.test.ts` (le JSON dit ce que dit ce fichier) et
 * `apps/ia/tests/test_ingestion_guard.py` (le Python dit ce que dit le JSON).
 *
 * L'ordre des listes est significatif — il est comparé tel quel de part et
 * d'autre, parce qu'une liste réordonnée est le genre de différence qu'une
 * comparaison d'ensembles laisse passer et qu'un humain ne relit jamais.
 *
 * ## Modifier ces constantes
 *
 * Éditer ce fichier, puis réécrire le JSON avec
 * `JSON.stringify(RAG_INGESTION_GUARD_CONSTANTS, null, 2)` et un passage de
 * `prettier --write` (c'est lui qui a le dernier mot sur la forme), puis
 * reporter le changement dans `apps/ia/app/services/ingestion_guard.py`. Les
 * deux gardes de parité rougissent tant que les trois ne disent pas la même
 * chose — c'est le but.
 */
export const RAG_INGESTION_GUARD_CONSTANTS = {
  /** Les trois seuls refus possibles. Un code inventé d'un côté produirait un
   *  refus que l'autre porte ne saurait pas nommer. */
  codes: ['not_retrieval_knowledge', 'internal_codename', 'contact_table'],
  coordinateWords: [...COORDINATE_WORD_LIST],
  identityWords: [...IDENTITY_WORD_LIST],
  separators: [...SEPARATORS],
  typeLabels: { ...TYPE_LABELS },
  defaultTypeLabel: DEFAULT_TYPE_LABEL,
  /** #3881 — les noms internes qu'aucun dépôt ne doit porter. */
  internalCodenames: [...INTERNAL_CODENAME_LIST],
  thresholds: {
    headerScanLines: HEADER_SCAN_LINES,
    maxLines: MAX_LINES,
    minColumns: MIN_COLUMNS,
    minDataRows: MIN_DATA_ROWS,
    minPersonalColumns: MIN_PERSONAL_COLUMNS,
  },
  messages: { ...MESSAGE_TEMPLATES },
  /** Le manifeste, aplati : la règle 1 ne lit que `file` et `notRag`. */
  manifest: RAG_INGESTION_MANIFEST.map(entry => ({
    file: entry.file,
    type: entry.type,
    notRag: entry.notRag,
  })),
  /** L'interdit en toutes lettres. Sa première ligne — « export CRM brut » — est
   *  exactement ce que `apps/ia/scripts/ingest_crm.py` faisait. */
  excluded: [...RAG_INGESTION_EXCLUDED],
}
