/**
 * #1995 — LE CRITÈRE DE RAPPROCHEMENT D'UNE PERSONNE, À UN SEUL ENDROIT.
 *
 * `resolveCrmContactToBellum` (`../ia-proxy/chat-context.service.ts`) décide si
 * une ligne du CRM connecté DÉSIGNE une fiche Bellum existante ; la création
 * unitaire depuis cette même ligne (`ContactsService.createFromCrmPresence`)
 * doit refuser exactement ce que la résolution aurait trouvé — sinon la
 * création produirait un doublon de ce que la lecture savait déjà relier.
 *
 * Deux chemins qui refont la même dérivation divergent : elle vit ici.
 */

/**
 * Casse ET accents pliés. `ILIKE` plie la casse, pas les diacritiques, et un
 * modèle réécrit « Bénard » en « Benard ». Jumeau TypeScript de `_fold`
 * (`apps/ia/app/services/chat_thread_state.py`), qui plie les deux pour la
 * même raison, sur le même objet.
 */
export function foldForNameMatch(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Un e-mail comparable : vide → `''`, jamais `null` déguisé en valeur. */
export function foldForEmailMatch(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/** La longueur minimale d'un nom exploitable — « Ana » passe, une initiale non. */
export const MIN_FOLDED_NAME_LENGTH = 2
