/**
 * Le nom d'une fiche du vivier — ou l'aveu qu'il n'y en a pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08, écran Vivier, en PRODUCTION : une fiche s'affichait
 * sous `cv_anonyme_louis_ai-engineer-node_gw`, à la place d'un nom de personne.
 * Ce n'est pas un nom, c'est le nom du FICHIER déposé.
 *
 * La cause est mesurée et elle est EN AMONT : `cv-intake.service.ts` écrit
 * `full_name: candidateName || input.filename.replace(/\.[a-z0-9]+$/i, '')`.
 * Le dépôt de CV du web n'envoie jamais `fullName`, et l'étape de relecture
 * (`/parse/commit`) écarte explicitement la détection `identity`. Autrement dit
 * **aucun chemin n'écrit jamais un nom extrait** : toute fiche née d'un CV
 * porte le nom de son fichier. C'est une valeur de REMPLISSAGE, ce que le dépôt
 * s'interdit — « un champ illisible vaut `null`, jamais une valeur de
 * remplissage ».
 *
 * Réparer l'écriture est un autre lot (côté API). Ce fichier tient la moitié
 * qui revient à l'écran : **ne pas présenter un identifiant technique comme un
 * nom**.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS — et pourquoi
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne DEVINE pas un nom, et il n'essaie pas de reconnaître « un nom de
 * personne » — ce test-là n'existe pas : les noms du monde ne rentrent dans
 * aucune forme.
 *
 * ⚠️ Il ne décide pas non plus, DEPUIS LE 30/08, de ce qu'est un nom de fichier.
 * Cette question vit à un seul endroit, `looksLikeAFileName` dans
 * `@bellum/contracts` (D372), avec les deux marques retenues et la raison de
 * n'en retenir que deux. Elle a été écrite ici d'abord, puis une seconde fois
 * dans le contrat par le lot d'en face le même jour : deux chemins qui refont la
 * même dérivation divergent (GA-26), et la divergence se serait lue ainsi — une
 * fiche écrite sous un nom que l'écran refuse d'afficher, ou l'inverse.
 *
 * Ce qui RESTE ici est la moitié qui appartient vraiment à l'écran : que faire
 * du verdict — montrer un nom, ou avouer qu'il n'y en a pas en gardant le
 * fichier comme REPÈRE.
 */
import { looksLikeAFileName } from '@bellum/contracts'

/**
 * Le nom à AFFICHER sur une fiche du vivier.
 *
 * `unnamed` porte `deposited` : le fichier d'où vient la fiche, gardé comme
 * REPÈRE et annoncé comme tel. Une fiche sans nom doit rester distinguable
 * d'une autre fiche sans nom — assumer un identifiant n'est pas le déguiser en
 * nom.
 */
type TalentName = { kind: 'named'; name: string } | { kind: 'unnamed'; deposited: string | null }

/** Ce que la fiche affiche : un nom, ou l'absence de nom et son repère. */
export function readTalentName(fullName: string | null | undefined): TalentName {
  const trimmed = (fullName ?? '').trim()
  if (!trimmed) return { kind: 'unnamed', deposited: null }
  if (looksLikeAFileName(trimmed)) return { kind: 'unnamed', deposited: trimmed }
  return { kind: 'named', name: trimmed }
}

/**
 * La même décision, pour les phrases qui INTERPOLENT un nom (« Supprimer X ? »).
 *
 * `unnamedLabel` vient du dictionnaire de l'appelant : ce module ne connaît
 * aucune langue, et une chaîne écrite en dur ici en manquerait une.
 */
export function talentNameText(fullName: string | null | undefined, unnamedLabel: string): string {
  const read = readTalentName(fullName)
  return read.kind === 'named' ? read.name : unnamedLabel
}
