/**
 * #2434.47 / #2434.48 / #2434.49 / #2434.51 — CE QUE LAURA NE LIT JAMAIS À VOIX HAUTE.
 *
 * `ListenReply` envoyait le texte de la réponse tel quel à `speechSynthesis`
 * (seule la ponctuation de mise en forme markdown était retirée, voir
 * `speakableText`). Rien n'empêchait de lire à voix haute un tableau de
 * cinquante lignes, une coordonnée sensible ou un long avertissement légal.
 *
 * ⚠️ Ce module ne touche JAMAIS le texte AFFICHÉ dans la bulle — seulement une
 * copie destinée à `speechSynthesis`. Une coordonnée retirée de la voix reste
 * visible à l'écran : ce n'est pas un masquage de donnée, seulement un refus de
 * la PRONONCER.
 *
 * Trois catégories retirées, dans cet ordre (l'ordre importe : un avertissement
 * en citation peut contenir un tableau, jamais l'inverse dans nos réponses) :
 *  1. un long avertissement en citation markdown (`>`), au-delà d'un seuil de
 *     caractères — un rappel légal bref reste lisible, lui ;
 *  2. un tableau markdown de plus de {@link MAX_READABLE_TABLE_ROWS} lignes de
 *     données — un petit tableau reste lisible (il ne sonne pas comme un
 *     tableau une fois les `|` retirés par `speakableText`, mais il reste COURT) ;
 *  3. une coordonnée sensible — e-mail, téléphone français, IBAN.
 *
 * `blocked: true` signale que plus rien de lisible ne reste : c'est le signal
 * que `ListenReply` utilise pour proposer « je t'affiche le détail » plutôt
 * qu'un bouton qui lancerait une lecture vide (#2434.51).
 *
 * ⚠️ Ce que ce module NE fait PAS : une politique générique « donnée interdite
 * selon le contexte » (habilitation, règle d'espace) — #2434.50 reste `retenu`,
 * cette notion suppose un moteur de policy par contexte qui n'existe pas encore
 * pour la lecture vocale (voir `useDataExit` pour l'export CRM, un domaine
 * différent). Ici, les trois catégories ci-dessus sont FIXES, jamais dérivées
 * d'un rôle ou d'un espace.
 */

/** Au-delà, un tableau ne se lit plus — le seuil de l'énoncé du point. */
const MAX_READABLE_TABLE_ROWS = 50

/** Au-delà, une citation devient un « long avertissement » plutôt qu'un rappel bref. */
const DISCLAIMER_MIN_CHARS = 200

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
/** Téléphone français : 10 chiffres commençant par 0, ou +33, espacés/pointés/tiretés au choix. */
const PHONE_RE = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/g
/** IBAN : deux lettres pays, deux chiffres de contrôle, puis des groupes alphanumériques. */
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}\b/g

/** Les blocs de lignes contiguës qui commencent par un même préfixe (`|` ou `>`). */
function blocksByPrefix(text: string, prefix: string): Array<{ start: number; end: number }> {
  const lines = text.split('\n')
  const blocks: Array<{ start: number; end: number }> = []
  let start = -1
  lines.forEach((line, index) => {
    const matches = line.trim().startsWith(prefix)
    if (matches && start < 0) start = index
    if (!matches && start >= 0) {
      blocks.push({ start, end: index })
      start = -1
    }
  })
  if (start >= 0) blocks.push({ start, end: lines.length })
  return blocks
}

function removeLineBlocks(text: string, blocks: ReadonlyArray<{ start: number; end: number }>): string {
  if (blocks.length === 0) return text
  const lines = text.split('\n')
  const kept = lines.filter((_, index) => !blocks.some(block => index >= block.start && index < block.end))
  return kept.join('\n')
}

/** Retire tout tableau markdown dont le nombre de lignes de données dépasse le seuil. */
function stripOverlongTables(text: string): string {
  const blocks = blocksByPrefix(text, '|').filter(block => {
    // Deux lignes d'en-tête (intitulés + séparateur) avant les données.
    const dataRows = block.end - block.start - 2
    return dataRows > MAX_READABLE_TABLE_ROWS
  })
  return removeLineBlocks(text, blocks)
}

/** Retire toute citation markdown (`>`) dont le contenu dépasse le seuil de caractères. */
function stripLongDisclaimers(text: string): string {
  const lines = text.split('\n')
  const blocks = blocksByPrefix(text, '>').filter(block => {
    const content = lines
      .slice(block.start, block.end)
      .map(line => line.replace(/^\s*>\s?/, ''))
      .join(' ')
    return content.length >= DISCLAIMER_MIN_CHARS
  })
  return removeLineBlocks(text, blocks)
}

/** Retire e-mails, téléphones et IBAN — jamais du texte affiché, seulement de la voix. */
function stripSensitiveCoordinates(text: string): string {
  return text.replace(EMAIL_RE, '').replace(IBAN_RE, '').replace(PHONE_RE, '')
}

/** Effondre les lignes et espaces devenus superflus après un retrait de bloc. */
function collapseBlankLines(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter((line, index, all) => line !== '' || (all[index - 1] ?? '') !== '')
    .join('\n')
    .trim()
}

type SpokenTextPolicy = {
  /** Le texte destiné à `speechSynthesis` — jamais celui affiché dans la bulle. */
  spoken: string
  /** Plus rien de lisible ne reste : l'écran propose « je t'affiche le détail ». */
  blocked: boolean
}

/**
 * Prépare le texte d'une réponse pour la lecture à voix haute (#2434.47/.48/.49/.51).
 */
export function prepareSpokenText(text: string): SpokenTextPolicy {
  let working = text
  working = stripLongDisclaimers(working)
  working = stripOverlongTables(working)
  working = stripSensitiveCoordinates(working)
  working = collapseBlankLines(working)
  return { spoken: working, blocked: working.trim() === '' }
}

/**
 * #2434.8/.9/.10/.12/.24/.30 — la synthèse vocale du SYSTÈME est-elle là ? Partagé par le mode
 * conversation (`useVoiceConversation`). #5032.5 — l'ex-bouton « Écouter » de chaque réponse est retiré :
 * seul le mode conversation lit encore, et il garde ce qu'il lui faut ici (GA-26, un seul endroit).
 */
export function speechSynthesisAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === 'function'
  )
}

/** Le texte tel qu'il se DIT : la ponctuation de mise en forme ne se prononce pas. */
export function speakableText(text: string): string {
  return text
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
