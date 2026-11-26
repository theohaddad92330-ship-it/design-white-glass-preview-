/**
 * #2431.10 — chaque fichier déposé au composeur reçoit un TYPE MÉTIER
 * PROBABLE (« CV » → Talent, « export CRM » → comptes/contacts, « tableau de
 * besoins » → Needs, « AO » → dossier AO, « facture » → Finance, « capture »
 * → extraction à confirmer — exemples de la demande #2431).
 *
 * ── Ce que cette tranche fait, et ne fait PAS ─────────────────────────────
 * Une classification par le SEUL NOM du fichier (mots-clés + extension),
 * jamais par son contenu extrait. C'est pourquoi `confidence` ne porte
 * qu'UNE valeur, `'to_verify'` : une classification qui n'a pas lu le
 * document ne peut jamais se prétendre « élevée » (doctrine : jamais de
 * donnée inventée). Un nom sans indice ne force JAMAIS un type — `undefined`
 * plutôt qu'une catégorie devinée (doctrine : on n'affiche pas ce qu'on n'a
 * pas).
 *
 * RESTE hors de cette tranche (#2431.2 / #2431.3 / #2431.11, notés au
 * registre) : classification par contenu extrait, confiance à plusieurs
 * paliers, création/mise à jour de l'objet métier correspondant, et le
 * statut d'un fichier qui pointerait vers cet objet.
 */

export type DocumentProbableType = 'cv' | 'crm_export' | 'needs_sheet' | 'rfp' | 'invoice' | 'screenshot'

/** Non exportée : seul `classifyDocumentByName` la produit, et son seul
 *  consommateur (`Chat.tsx`) lit `.type`/`.confidence` sur la valeur de retour
 *  sans jamais nommer ce type — export interdit pour un type qui ne servirait
 *  QUE dans son propre fichier (règle « exports » de CLAUDE.md, `knip`). */
type DocumentClassification = {
  type: DocumentProbableType
  confidence: 'to_verify'
}

const CV_EXTENSIONS = new Set(['pdf', 'doc', 'docx'])
const SHEET_EXTENSIONS = new Set(['csv', 'xlsx', 'xls'])
const RFP_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'zip'])
const INVOICE_EXTENSIONS = new Set(['pdf'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

/** Découpe le NOM (hors extension) en jetons alphanumériques — pour qu'un
 *  séparateur `_`/`-`/` ` place bien une frontière de mot, là où `\b` d'une
 *  regex échoue entre deux caractères « mot » (`_` inclus). */
function tokensOf(name: string): { tokens: string[]; extension: string | undefined } {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined
  const tokens = stem
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôöùûüçœ]+/i)
    .filter(Boolean)
  return { tokens, extension }
}

export function classifyDocumentByName(name: string): DocumentClassification | undefined {
  const { tokens, extension } = tokensOf(name)
  const hasToken = (...words: string[]) => words.some(word => tokens.includes(word))
  const hasSubstring = (...words: string[]) => words.some(word => tokens.some(token => token.includes(word)))

  if (extension && IMAGE_EXTENSIONS.has(extension) && hasToken('capture', 'screenshot')) {
    return { type: 'screenshot', confidence: 'to_verify' }
  }
  if (extension && INVOICE_EXTENSIONS.has(extension) && hasSubstring('facture', 'invoice')) {
    return { type: 'invoice', confidence: 'to_verify' }
  }
  if (
    extension &&
    RFP_EXTENSIONS.has(extension) &&
    (hasToken('ao', 'rfp') ||
      (hasToken('appel') && hasSubstring('offre')) ||
      (hasToken('cahier') && hasToken('charges')))
  ) {
    return { type: 'rfp', confidence: 'to_verify' }
  }
  if (extension && SHEET_EXTENSIONS.has(extension) && hasSubstring('besoin', 'needs')) {
    return { type: 'needs_sheet', confidence: 'to_verify' }
  }
  if (
    extension &&
    SHEET_EXTENSIONS.has(extension) &&
    hasToken('export') &&
    (hasToken('crm', 'ats', 'boond') || hasSubstring('contact', 'compte'))
  ) {
    return { type: 'crm_export', confidence: 'to_verify' }
  }
  if (extension && CV_EXTENSIONS.has(extension) && (hasToken('cv') || hasSubstring('curriculum', 'resume', 'résumé'))) {
    return { type: 'cv', confidence: 'to_verify' }
  }
  return undefined
}
