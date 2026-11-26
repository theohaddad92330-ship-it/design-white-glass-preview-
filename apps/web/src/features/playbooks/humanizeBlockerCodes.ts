/**
 * R24-FIX-B (15/10) — un code de bloqueur (`missing_timesheet`…) n'arrive JAMAIS à l'écran.
 *
 * Le serveur CITE les bloqueurs relevés dans le détail d'une intervention (« Bloqueurs : missing_timesheet,
 * missing_po. ») : la phrase est stockée, donc les lignes déjà écrites portent les codes bruts. On les traduit
 * ICI, au seul point d'entrée des interventions (`playbooksApi.interventions`), avec les libellés que les autres
 * écrans de facturation lisent déjà (`missions:readiness.blockers.*`, FR/EN) — jamais une seconde table.
 * Un mot en snake_case qui n'a pas de libellé reste tel quel : on ne devine pas.
 */
const SNAKE_CODE = /\b[a-z]+(?:_[a-z]+)+\b/g

export function humanizeBlockerCodes(text: string, label: (code: string) => string | null): string {
  return text.replace(SNAKE_CODE, code => label(code) ?? code)
}
