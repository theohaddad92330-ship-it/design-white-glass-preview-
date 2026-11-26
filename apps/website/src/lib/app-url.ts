export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.bellum-ai.com'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bellum-ai.com'

export const loginUrl = () => `${APP_URL}/login`
export const signupUrl = () => `${APP_URL}/signup`

/**
 * La démonstration en libre-service : un clic, une salle louée, aucun compte à
 * créer, aucun crédit consommé. C'est le lien qu'un commercial colle dans un
 * message — et, depuis le 16/08, ce que promet la carte « Free » de la grille.
 */
export const demoUrl = () => `${APP_URL}/demo`

/**
 * Où mène « Parler à l'équipe » (Team / Enterprise, sur devis).
 *
 * `NEXT_PUBLIC_CALENDLY_URL` quand l'opérateur l'a posée, `null` sinon — et
 * l'appelant retombe alors sur le formulaire de demande du site, qui envoie
 * déjà un e-mail. Le repli n'est pas décoratif : un bouton pointant vers une
 * variable vide ouvre une page blanche, et c'est le bouton du palier le plus
 * cher.
 */
export const talkToTeamUrl = (): string | null => process.env.NEXT_PUBLIC_CALENDLY_URL?.trim() || null
