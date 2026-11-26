import { ServiceUnavailableException } from '@nestjs/common'
import { createHmac } from 'node:crypto'

/**
 * #2297.51 — LA CLÉ DES EMPREINTES D'EFFACEMENT (décision Louis du 19/09/2026).
 *
 * Une personne effacée ne laisse que des EMPREINTES : dans `person_erasures`
 * (ce qui empêche sa recollecte) et dans `email_suppressions` (ce qui empêche
 * un envoi à son adresse). Jusqu'ici c'étaient des SHA-256 nus, salés par
 * l'espace : qui tenait la table ET devinait l'adresse ou le nom vérifiait sa
 * supposition par dictionnaire. Ce sont désormais des HMAC-SHA-256 sous une clé
 * DÉDIÉE, `PERSON_ERASURE_HMAC_KEY`, qui ne vit que sur le serveur : sans elle,
 * une empreinte ne se vérifie plus.
 *
 * SANS CLÉ, RIEN NE SE CALCULE. Pas de repli sur SHA-256, pas de liste vide :
 * `PersonErasureKeyUnavailableError` (503). C'est le patron du secret interne
 * absent en production — refuser plutôt qu'ouvrir en silence. Concrètement :
 *   - l'effacement répond 503 et n'écrit rien ;
 *   - la collecte et l'enrichissement d'un espace qui A des effacements
 *     s'arrêtent (503) plutôt que de laisser revenir une personne faute de
 *     pouvoir la reconnaître ; un espace sans effacement ne calcule rien ;
 *   - le contrôle d'envoi se tait (voir `SuppressionService`).
 * Une clé de moins de 32 caractères vaut une clé absente (même plancher que le
 * secret interne en production).
 *
 * Dédiée, et pas dérivée d'un autre secret : faire tourner le secret interne ne
 * doit pas rendre méconnaissables toutes les personnes effacées. Une rotation
 * de CETTE clé le ferait — elle ne tourne donc pas sans un plan de
 * ré-empreinte (voir `agent_docs/env-reference.md`).
 *
 * La valeur ne sort jamais d'ici : ni journal, ni message d'erreur (qui nomme
 * la variable), ni test (qui posent une clé fixe à eux).
 */
export const PERSON_ERASURE_HMAC_KEY_ENV = 'PERSON_ERASURE_HMAC_KEY'

const MIN_KEY_LENGTH = 32

/** #2297.51 — l'effacement n'est pas configuré : aucune empreinte ne se calcule. */
export class PersonErasureKeyUnavailableError extends ServiceUnavailableException {
  constructor() {
    super(
      `L'effacement d'une personne n'est pas configuré sur ce serveur (${PERSON_ERASURE_HMAC_KEY_ENV} absente ou trop courte) : aucune empreinte ne se calcule sans elle.`,
    )
  }
}

function readKey(): string | null {
  const key = process.env[PERSON_ERASURE_HMAC_KEY_ENV]?.trim() ?? ''
  return key.length >= MIN_KEY_LENGTH ? key : null
}

/** #2297.51 — la clé est-elle posée (et assez longue) ? Ne dit rien de sa valeur. */
export function isPersonErasureKeyConfigured(): boolean {
  return readKey() !== null
}

/**
 * #2297.51 — l'empreinte d'UNE clé d'identité (`email:…`, `name:…`) dans un
 * espace. Lève `PersonErasureKeyUnavailableError` sans clé — jamais de repli.
 */
export function personErasureDigest(workspaceId: string, identityKey: string): string {
  const key = readKey()
  if (!key) throw new PersonErasureKeyUnavailableError()
  return createHmac('sha256', key).update(`${workspaceId}|${identityKey}`).digest('hex')
}
