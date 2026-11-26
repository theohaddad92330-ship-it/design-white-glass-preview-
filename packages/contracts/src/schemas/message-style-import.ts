import { z } from 'zod'
import type { MessageStyleRuleProposal, StyleLearningSignal } from './message-style-rule-proposal.js'

/**
 * MÉMOIRE DE STYLE DES MESSAGES — L'IMPORT ET L'ANALYSE PRÉALABLE (épopée
 * #2768, LAU-FINAL-084, #2369.2/.3/.4/.5).
 *
 * Reste HORS de ce fichier (voir `message-style.ts` en tête) : la
 * comparaison de versions avant adoption (#2369.11), les métriques d'usage
 * (#2369.12), et le NO-GO de #2369.14 — chacun exige un écran de bibliothèque
 * ou une intégration à la génération de messages qu'aucun de ces deux
 * dépendait ; ce fichier ferme #2369.2/.3/.4/.5.
 *
 * ⚠️ DOCTRINE — le CORPS d'un message ne sort jamais vers un humain ni vers
 * le modèle. Deux consequences, tenues ici :
 *  1. `analyzeMessageStyleImport` est une fonction PURE, déterministe,
 *     JAMAIS un appel IA — aucune ligne de ce fichier n'envoie `rawText` à
 *     Claude. Les signaux qu'elle détecte (formule, formalité, longueur,
 *     agressivité, date) sont des DESCRIPTEURS courts, jamais une citation du
 *     texte importé.
 *  2. `messageStyleImportSchema` (la forme PERSISTÉE, renvoyée par l'API) ne
 *     porte AUCUN champ de texte — `rawText` vit dans la table (journal),
 *     jamais dans une réponse HTTP.
 */

/**
 * #2369.2 — LES QUINZE SOURCES DE STYLE ADMISES, littérales, dans l'ordre du
 * message (LAU-FINAL-084 « SOURCES DE STYLE »). Un ensemble FERMÉ : rien
 * d'autre n'est accepté (`messageStyleSourceTypeSchema` est un `z.enum`).
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu.
 */
export const MESSAGE_STYLE_SOURCE_TYPES = [
  'validated_example', // exemples validés
  'imported_template', // templates importés
  'sent_message', // messages réellement envoyés
  'accepted_edit', // modifications acceptées
  'brand_guide', // guide de marque
  'signature', // signatures
  'user_preference', // préférences utilisateur
  'formality', // tutoiement/vouvoiement
  'language', // langue
  'forbidden_words', // mots interdits
  'allowed_cta', // CTA autorisés
  'length', // longueur
  'punctuation', // ponctuation
  'opening_formula', // formules d'ouverture
  'closing_formula', // formules de clôture
] as const
export const messageStyleSourceTypeSchema = z.enum(MESSAGE_STYLE_SOURCE_TYPES)
export type MessageStyleSourceType = z.infer<typeof messageStyleSourceTypeSchema>

/**
 * #2369.3 — LES SEPT NATURES D'IMPORT admises (LAU-FINAL-084 « IMPORT »).
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu.
 */
export const MESSAGE_STYLE_IMPORT_KINDS = [
  'linkedin_message',
  'email',
  'phone_pitch',
  'follow_up',
  'introduction',
  'partner_message',
  'profile_push',
] as const
export const messageStyleImportKindSchema = z.enum(MESSAGE_STYLE_IMPORT_KINDS)
export type MessageStyleImportKind = z.infer<typeof messageStyleImportKindSchema>

/** Corps de `POST /message-style/imports` — le texte importé, jamais renvoyé (doctrine, voir tête de fichier). */
export const createMessageStyleImportSchema = z.object({
  importKind: messageStyleImportKindSchema,
  sourceType: messageStyleSourceTypeSchema,
  rawText: z.string().trim().min(1).max(8000),
})
export type CreateMessageStyleImport = z.infer<typeof createMessageStyleImportSchema>

/** La forme PERSISTÉE, renvoyée par l'API — sans `rawText` (doctrine, voir tête de fichier). */
export const messageStyleImportSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  importedBy: z.string().guid(),
  importKind: messageStyleImportKindSchema,
  sourceType: messageStyleSourceTypeSchema,
  createdAt: z.string().datetime(),
})
export type MessageStyleImport = z.infer<typeof messageStyleImportSchema>

/** Une règle CANDIDATE — même forme que `CreateMessageStyleRuleProposal`, avant persistance. */
export type MessageStyleImportProposal = { signal: StyleLearningSignal; observation: string }

/** #2369.5 — la restitution : « je conserve » / « je ne reproduis pas » / « je propose ». */
export type MessageStyleImportAnalysis = {
  conserve: string[]
  neReproduitPas: string[]
  propose: MessageStyleImportProposal[]
}

/**
 * La réponse de `POST /message-style/imports` : `propose` porte les VRAIES
 * propositions persistées (#2369.7/.8, `MessageStyleService.proposeRule`
 * réutilisé, jamais une seconde écriture) — décidables ensuite par
 * `POST /message-style/rule-proposals/:id/decide`. Ni `importId` ni aucun
 * champ ici ne porte `rawText` (doctrine, voir tête de fichier).
 */
export type MessageStyleImportResult = {
  importId: string
  conserve: string[]
  neReproduitPas: string[]
  propose: MessageStyleRuleProposal[]
}

const GREETING_PATTERNS = [/^bonjour\b/i, /^bonsoir\b/i, /^cher\b/i, /^ch[eè]re\b/i, /^salut\b/i, /^hello\b/i, /^hi\b/i]
const CLOSING_PATTERNS = [
  /cordialement/i,
  /bien\s*à\s*vous/i,
  /à\s*bientôt/i,
  /sincèrement/i,
  /best regards/i,
  /kind regards/i,
]
const AGGRESSIVE_KEYWORDS = [/dernière chance/i, /ne ratez pas/i, /agissez maintenant/i, /offre choc/i, /urgent\b/i]

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split('\n')
      .map(line => line.trim())
      .find(line => line.length > 0) ?? ''
  )
}

function lastNonEmptyLine(text: string): string {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  return lines[lines.length - 1] ?? ''
}

/**
 * #2369.4 — L'ANALYSE PRÉALABLE (patterns/ton/structure/risques/infos
 * obsolètes), PURE et déterministe (voir doctrine en tête de fichier) —
 * jamais un appel au modèle. #2369.5 — sa sortie EST la restitution à trois
 * volets : chaque descripteur détecté va dans EXACTEMENT un des trois, et un
 * axe non détecté ne produit AUCUNE ligne (« on n'affiche pas ce qu'on n'a
 * pas dans une liste »).
 */
export function analyzeMessageStyleImport(rawText: string): MessageStyleImportAnalysis {
  const conserve: string[] = []
  const neReproduitPas: string[] = []
  const propose: MessageStyleImportProposal[] = []

  // Structure — toujours mesurable, jamais une absence.
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
  const lengthBucket = wordCount < 60 ? 'court' : wordCount <= 150 ? 'moyen' : 'long'
  conserve.push(`longueur : message ${lengthBucket} (${wordCount} mots)`)

  // Ton — tutoiement/vouvoiement, seulement quand l'un domine SANS l'autre.
  const tuCount = (rawText.match(/\btu\b|\bton\b|\bta\b|\btes\b|\bt'|\btoi\b/gi) ?? []).length
  const vousCount = (rawText.match(/\bvous\b|\bvotre\b|\bvos\b/gi) ?? []).length
  if (tuCount > 0 && vousCount === 0) conserve.push('formalité : tutoiement')
  else if (vousCount > 0 && tuCount === 0) conserve.push('formalité : vouvoiement')

  // Patterns — formules d'ouverture / de clôture : des règles de STRUCTURE candidates.
  if (GREETING_PATTERNS.some(pattern => pattern.test(firstNonEmptyLine(rawText)))) {
    propose.push({
      signal: 'structure_preference',
      observation: 'Formule d’ouverture identifiée, proposée comme règle de structure.',
    })
  }
  if (CLOSING_PATTERNS.some(pattern => pattern.test(lastNonEmptyLine(rawText)))) {
    propose.push({
      signal: 'structure_preference',
      observation: 'Formule de clôture identifiée, proposée comme règle de structure.',
    })
  }

  // Risques — #2369.13 : un ton agressif isolé ne devient JAMAIS une proposition.
  const exclamationCount = (rawText.match(/!/g) ?? []).length
  const hasAggressiveKeyword = AGGRESSIVE_KEYWORDS.some(pattern => pattern.test(rawText))
  if (exclamationCount >= 3 || hasAggressiveKeyword) {
    neReproduitPas.push('ton agressif isolé détecté — jamais appris (#2369.13)')
  }

  // Infos obsolètes — une date à plus d'un an, nommée, jamais tout le corps.
  const currentYear = new Date().getFullYear()
  const years = [...rawText.matchAll(/\b(19|20)\d{2}\b/g)].map(match => Number(match[0]))
  const obsoleteYear = years.find(year => year < currentYear - 1)
  if (obsoleteYear !== undefined) {
    neReproduitPas.push(`information potentiellement obsolète : date ${obsoleteYear}`)
  }

  return { conserve, neReproduitPas, propose }
}
