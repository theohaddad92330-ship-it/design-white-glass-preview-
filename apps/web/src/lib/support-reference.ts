import { isSupportReference } from '@bellum/contracts'

/**
 * #2442.5 — LA RÉFÉRENCE SUPPORT, CÔTÉ ÉCRAN.
 *
 * Elle est calculée par l'API et voyage dans le corps de toute réponse
 * d'erreur (`apps/api/src/common/all-exceptions.filter.ts`). Le navigateur ne
 * la fabrique pas : il la LIT, il en VÉRIFIE la forme, et il refuse tout le
 * reste. Le contrôle n'est pas une précaution de style : le corps d'une
 * réponse est « ce que le serveur a eu le temps d'écrire », et un écran ne
 * rend jamais une chaîne arbitraire au motif qu'elle portait le bon nom de
 * champ.
 *
 * ⚠️ LA LIMITE, écrite pour être lue : c'est la référence de la DERNIÈRE
 * réponse d'erreur reçue de l'API, pas celle de l'erreur qu'un écran rend à
 * cet instant. C'est juste dans le cas qui compte — un écran d'échec est
 * affiché PARCE QUE cet appel a échoué — et faux dans un cas qu'on accepte :
 * un écran d'erreur ouvert longtemps pendant qu'un autre appel échoue en fond
 * montrerait la référence du second. Une absence, elle, ne fait AUCUNE ligne.
 */
let remembered: string | null = null

/** #2442.5 — la référence portée par un corps de réponse d'erreur, ou `null`. */
export function readSupportReference(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null
  const candidate = (body as { supportReference?: unknown }).supportReference
  return isSupportReference(candidate) ? candidate : null
}

/** #2442.5 — retient la référence de la dernière réponse d'erreur. Une valeur
 *  mal formée n'est pas retenue : le même refus, sur le même chemin. */
export function rememberSupportReference(reference: string | null): void {
  remembered = reference !== null && isSupportReference(reference) ? reference : null
}

/** #2442.5 — la dernière référence vue, ou `null`. */
export function lastSupportReference(): string | null {
  return remembered
}
