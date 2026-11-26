import { z } from 'zod'

/**
 * LES NIVEAUX D'ACCÈS D'UNE CONNEXION OAUTH — #2078.22 / #2078.23.
 *
 * Une connexion ne demandait qu'une chose : TOUT (lire la boîte, écrire des
 * brouillons, envoyer, créer des évènements, des feuilles de calcul). Un
 * commercial qui voulait seulement que Laura lise ses échanges devait accorder
 * l'envoi de courrier en son nom. Deux niveaux nommés, désormais :
 *
 *   • `read`       — lire (messagerie, agenda, documents). Aucune écriture.
 *   • `read_write` — lire ET écrire (brouillons, envois, évènements, feuilles).
 *
 * Les NOMS vivent ici, parce que l'écran et le serveur les échangent. La LISTE
 * des portées de chaque niveau vit chez le fournisseur (`google-config.ts`) :
 * une portée est un détail du fournisseur, pas du contrat.
 *
 * ⚠️ Le niveau AFFICHÉ se dérive des portées que le fournisseur a RENDUES, jamais
 * de celles demandées : un utilisateur peut décocher une case sur l'écran de
 * consentement.
 */
export const OAUTH_ACCESS_LEVELS = ['read', 'read_write'] as const
export const oauthAccessLevelSchema = z.enum(OAUTH_ACCESS_LEVELS)
export type OAuthAccessLevel = z.infer<typeof oauthAccessLevelSchema>

/**
 * Le niveau à redemander quand un écran propose de (re)connecter.
 *
 * Deux interdits, et c'est tout ce que fait cette fonction :
 *   • une reconnexion proposée par un écran de LECTURE ne retire pas l'écriture
 *     à qui l'avait accordée (le niveau `read` ne réclame pas les accès déjà
 *     donnés — il rétrograderait la connexion) ;
 *   • une reconnexion ne donne jamais l'écriture sans qu'un geste d'écriture la
 *     demande (aucune élévation implicite).
 *
 * `current` vaut `null` quand rien n'est connecté.
 */
export function accessLevelToRequest(current: OAuthAccessLevel | null, needed: OAuthAccessLevel): OAuthAccessLevel {
  return current === 'read_write' || needed === 'read_write' ? 'read_write' : 'read'
}
