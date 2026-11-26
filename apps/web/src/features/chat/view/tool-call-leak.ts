/**
 * #3218 — garde WEB, dernier filet : un appel d'outil recopié en texte par le
 * modèle (`{{functions.offer_reply_options({...})}}`, recette prod 02/10) ne
 * s'affiche jamais. Le filtre IA (`tool_call_leak.py`) le retire à la source ;
 * celui-ci protège les messages DÉJÀ enregistrés avant lui. Seule la forme
 * `{{functions.<nom>(...)}}` est retirée — un `{{prenom}}` de modèle reste.
 */
const TOOL_CALL = /\{\{\s*functions\.\w+\s*\([\s\S]*?\)\s*\}\}/g
const UNCLOSED_TOOL_CALL = /\{\{\s*functions\.[\s\S]*$/

export function stripToolCallText(text: string): string {
  if (!text.includes('functions.')) return text
  return text.replace(TOOL_CALL, '').replace(UNCLOSED_TOOL_CALL, '').trimEnd()
}
