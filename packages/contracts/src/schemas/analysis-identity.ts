/**
 * L'IDENTITÉ d'un dossier, et le refus qui la protège.
 *
 * ## Le défaut, mesuré en production le 30/08/2026
 *
 * Le compte `6c8f4edc-…`, nommé **ROCHE**, portait le SIREN `552012031`
 * (« Commerce de gros de produits pharmaceutiques » — le laboratoire). Un clic
 * sur « Actualiser l'analyse » l'a renvoyé sur `/search?accountId=…&company=ROCHE`,
 * qui a relancé une résolution **par nom**. Le registre a rendu `493229280` —
 * **ROCHE BOBOIS**, `70.10Z`, un distributeur de meubles — et la phase 1 l'a
 * estampillé sur le MÊME dossier. Les contacts et les angles du laboratoire se
 * sont retrouvés fusionnés dans la fiche d'une autre société, en silence.
 *
 * Le dépôt refuse depuis toujours d'analyser une société qu'il n'a pas
 * identifiée — c'est toute la raison de la levée d'homonymie par SIREN. Ici la
 * garantie tombait **exactement au moment où elle était déjà acquise** : le
 * dossier CONNAISSAIT son SIREN, et le rafraîchissement le jetait pour repartir
 * du nom.
 *
 * ## La règle
 *
 * **Un dossier qui connaît son SIREN se rafraîchit sur ce SIREN, jamais sur son
 * nom.** Le nom sert à trouver une société qu'on n'a pas encore ; il n'a rien à
 * faire dans un rafraîchissement.
 *
 * Et si, malgré l'ancrage, la résolution rend une identité **différente** de
 * celle du dossier, ce n'est pas un rafraîchissement : **c'est un autre compte**.
 * Le produit REFUSE et le dit. Il ne fusionne jamais — une fusion est
 * irréversible côté dossier comme côté CRM, et « une correction humaine gagne
 * toujours » se retournerait contre l'utilisateur, dont les corrections
 * survivraient sur la fiche d'une société qu'il n'a jamais analysée.
 *
 * ## Pourquoi un MARQUEUR et pas une phrase
 *
 * Le message d'erreur d'un run est stocké en base (`accounts.error_message`) et
 * relu par l'écran. Les deux sentinelles qui existaient avant celle-ci
 * (« Analyse annulée par l'utilisateur. », « Analyse interrompue… ») sont des
 * phrases FRANÇAISES recopiées à la main dans le front pour être reconnues — un
 * réglage qui vit à deux endroits, et une phrase que personne ne peut traduire
 * sans casser la reconnaissance.
 *
 * Ici le message porte donc un marqueur MACHINE, et les deux identités qu'il
 * oppose. L'écran le relit avec {@link parseIdentityMismatchMessage} et rend une
 * copie LOCALISÉE (FR + EN) — le format est écrit et relu dans CE fichier, donc
 * il ne peut pas diverger entre les deux camps.
 */

/** Le marqueur machine. Présent ⇒ le message est un refus d'identité. */
const IDENTITY_MISMATCH_MARKER = '[bellum:identity_mismatch]'

/** Les deux identités que le refus oppose. */
export type IdentityMismatch = {
  /** L'identité que le dossier PORTAIT — celle qui a été préservée. */
  expected: string
  /** L'identité que la résolution a rendue — celle qui a été refusée. */
  resolved: string
}

/**
 * Le message stocké sur le run refusé.
 *
 * Il reste LISIBLE tel quel : un opérateur qui lit la colonne en base, ou un
 * utilisateur dont le front n'aurait pas été redéployé, comprend ce qui s'est
 * passé sans décoder quoi que ce soit. Le marqueur est en tête, la phrase suit.
 */
export function buildIdentityMismatchMessage({ expected, resolved }: IdentityMismatch): string {
  return (
    `${IDENTITY_MISMATCH_MARKER} expected=${expected} resolved=${resolved} — ` +
    `Rafraîchissement refusé : la résolution a rendu une autre société (${resolved}) que celle du dossier (${expected}). ` +
    `Le dossier n'a pas été modifié.`
  )
}

/**
 * Relit un message d'erreur de run. `null` = ce n'est pas un refus d'identité.
 *
 * Volontairement tolérant sur ce qui SUIT les deux champs (la phrase lisible
 * peut évoluer, être tronquée par une colonne, ou être enveloppée par le
 * classificateur d'erreurs du worker qui préfixe « L'analyse de X a échoué… »),
 * et strict sur leur FORME : sans les deux identités, il n'y a rien à afficher,
 * et un refus à moitié lu vaut mieux non reconnu qu'affiché avec un trou.
 */
export function parseIdentityMismatchMessage(message: string | null | undefined): IdentityMismatch | null {
  if (!message || !message.includes(IDENTITY_MISMATCH_MARKER)) return null
  const found = /expected=(\S+)\s+resolved=(\S+)/.exec(message)
  if (!found) return null
  const [, expected, resolved] = found
  if (!expected || !resolved) return null
  return { expected, resolved }
}

/**
 * Deux identités de registre désignent-elles la même société ?
 *
 * La comparaison se fait sur les CHIFFRES seuls : un SIREN voyage tantôt en
 * `552012031`, tantôt en `552 012 031` (mise en forme Pappers), et une
 * comparaison littérale de ces deux-là déclencherait un refus sur un dossier
 * parfaitement sain — le pire résultat possible pour une garde, qui perdrait
 * aussitôt la confiance qu'on lui accorde.
 *
 * Une valeur vide des deux côtés n'est PAS « la même identité » : elle est
 * l'absence d'identité, et l'appelant doit la traiter avant d'arriver ici.
 */
export function isSameRegistryIdentity(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeRegistryIdentity(a)
  const right = normalizeRegistryIdentity(b)
  if (!left || !right) return false
  return left === right
}

/** Les chiffres et lettres d'une identité de registre, en majuscules. */
export function normalizeRegistryIdentity(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}
