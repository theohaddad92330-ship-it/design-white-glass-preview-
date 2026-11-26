/**
 * #3419.3 — « Autres accroches » dans l'éditeur d'un message d'outreach.
 *
 * La proposition vient de `/ia/message` avec la consigne « accroche alternative »
 * (`revision`) : le moteur ne réécrit que l'ouverture du message courant, sur un
 * autre élément RÉEL du dossier, et lui interdit d'inventer un fait pour varier.
 * Rien ici n'écrit : le texte proposé n'entre que dans le champ de l'éditeur, et
 * la version ne naît qu'au clic « Enregistrer une nouvelle version ».
 */
export type AlternativeHookResponse = { body?: string; rationale?: string }

export type AlternativeHook = {
  /** Le message complet révisé : seule son ouverture diffère du message courant. */
  text: string
  /** La raison du choix donnée par le moteur (l'élément du dossier sur lequel l'ouverture s'appuie). */
  anchor: string | null
  /** L'ouverture nouvelle seule — ce qu'il ne faut pas resservir à la proposition suivante. */
  opening: string | null
}

const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)

/** Le premier paragraphe du message révisé qui n'était pas déjà dans le message courant. */
function newOpening(revised: string, current: string): string | null {
  const known = new Set(paragraphsOf(current))
  return paragraphsOf(revised).find(part => !known.has(part)) ?? null
}

/**
 * Une proposition, ou aucune : un texte vide ou identique au message courant veut dire
 * que le moteur n'a pas trouvé d'autre élément sourcé — on le dit, on ne propose rien.
 */
export function alternativeHooksFor(
  data: AlternativeHookResponse | null | undefined,
  currentBody: string,
): AlternativeHook[] {
  const text = (data?.body ?? '').trim()
  if (!text || text === currentBody.trim()) return []
  return [{ text, anchor: data?.rationale?.trim() || null, opening: newOpening(text, currentBody) }]
}
