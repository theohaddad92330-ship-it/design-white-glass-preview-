const PLACEHOLDER = /\{\{\s*([^{}\n]+?)\s*\}\}/g

/**
 * #3440 — un gabarit ne s'affiche JAMAIS brut (« {{Prénom}} ») devant un
 * humain : chaque variable devient un trou lisible (« [prénom] »).
 */
export function readableTemplate(text: string): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => `[${name.toLowerCase()}]`)
}
