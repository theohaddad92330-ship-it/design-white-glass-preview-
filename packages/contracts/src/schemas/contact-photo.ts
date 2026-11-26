/**
 * La photo d'un contact — ce qui EST une photo, et ce qui n'en est pas une.
 *
 * Deux fournisseurs alimentent `contacts.photo_url` et tous les deux rendent,
 * pour une personne SANS photo, l'URL d'un visuel générique plutôt que rien du
 * tout. C'est ce détail qui rendait le retour bêta « il manque les photos de
 * profil systématiquement » impossible à lire : l'écran affichait bien une
 * image — la silhouette grise du réseau professionnel — donc l'avatar ne
 * retombait jamais sur l'initiale et personne ne pouvait distinguer « cette
 * personne n'a pas de photo » de « la photo n'a pas chargé ».
 *
 * La règle est l'HÔTE, pas une liste d'empreintes. `static.licdn.com` est le
 * CDN d'ACTIFS du réseau (icônes, sprites, silhouettes) : il ne sert jamais la
 * photo d'un membre. Celles-là vivent sur `media.licdn.com`. Une liste de
 * hachages ("9c8pery4andzj6ohjkjp54ma2") se périmerait au premier changement de
 * thème chez le fournisseur, et le défaut reviendrait sans que rien ne le dise.
 *
 * Miroir strict de l'allow-list du relais (`apps/api/src/modules/logo/
 * logo-source.ts`) : ce que le front refuse d'envoyer et ce que l'API refuse
 * d'aller chercher doivent être la MÊME décision, sinon l'un des deux ment.
 */

/** Hôtes de CDN qui ne servent que des actifs génériques — jamais un visage. */
const PLACEHOLDER_PHOTO_HOSTS: readonly string[] = ['static.licdn.com']

/**
 * `true` quand l'URL désigne un visuel générique (silhouette « aucune photo »)
 * plutôt que la photo d'une personne réelle.
 *
 * Rend `false` sur une entrée vide ou illisible : « je ne sais pas » n'est pas
 * « c'est un remplaçant », et refuser une URL qu'on n'a pas su analyser
 * supprimerait des photos valides sur une simple faute de forme.
 */
export function isPlaceholderPhotoUrl(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim()
  if (!value) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return PLACEHOLDER_PHOTO_HOSTS.includes(url.hostname.toLowerCase())
}

/**
 * La photo réellement affichable, ou `null`.
 *
 * Un seul point de passage pour les deux côtés : la persistance (ne jamais
 * écrire une silhouette dans `contacts.photo_url`) et l'affichage (les lignes
 * déjà en base en portent une, et une migration qui efface des données pour un
 * défaut d'affichage serait disproportionnée).
 */
export function usablePhotoUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  return isPlaceholderPhotoUrl(value) ? null : value
}
