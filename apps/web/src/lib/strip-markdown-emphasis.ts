/**
 * Un libellé ou un extrait de SOURCE (pastille, badge, ligne de résumé) ne
 * passe jamais par le moteur markdown de la conversation (`renderMarkdown`,
 * `chat/view/markdown.tsx`) — il s'affiche en texte brut. Un titre de règle
 * méthode ou un extrait de document qui porte encore sa syntaxe markdown
 * (`**gras**`, `` `code` ``) l'affiche donc telle quelle plutôt que rendue.
 *
 * Mesuré en recette prod (26755bbac3, lot C1, 30/09/2026) : une source citée
 * dans le panneau de transparence du chat affichait ses astérisques bruts.
 *
 * Les soulignés ne sont volontairement jamais touchés : un libellé de méthode
 * ou un identifiant de règle est souvent en snake_case (`search_market_memory`,
 * `contact_fit_score_100`) — les traiter comme de l'italique couperait ces
 * mots en deux.
 */
export function stripMarkdownEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
}
