const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// Français (0X XX XX XX XX, +33 X …, 0033 …) puis international (+CC suivi d'au moins 8 chiffres séparés).
// Un numéro commence TOUJOURS par 0 ou + : un montant, une année ou un SIREN collé n'est jamais touché.
const PHONE_FR = /(?<![\d+])(?:\+33|0033|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g
const PHONE_INTL = /\+\d{1,3}(?:[\s.-]?\d){8,12}(?!\d)/g

/**
 * #3586.6 — le corpus `dataforge_rag_chunks` est lu par TOUS les espaces : e-mails et numéros
 * de téléphone sont masqués avant indexation. `keepContacts` (INTERNAL_KNOWLEDGE_KEEP_CONTACTS=true)
 * est l'interrupteur de l'opérateur ; le défaut est masqué.
 */
export function maskPersonalData(text: string, opts: { keepContacts?: boolean } = {}): string {
  if (opts.keepContacts) return text
  return text.replace(EMAIL, '[email]').replace(PHONE_FR, '[téléphone]').replace(PHONE_INTL, '[téléphone]')
}
