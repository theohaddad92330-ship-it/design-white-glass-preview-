/**
 * Réglages de la synchronisation CRM dans les deux sens.
 *
 * Tous ont un défaut sûr et actif. Le kill-switch existe pour une raison
 * précise : cette boucle ÉCRIT chez un tiers, et une écriture chez un tiers est
 * la seule chose qu'on ne peut pas annuler depuis ici. Pouvoir l'arrêter sans
 * redéploiement n'est pas une commodité, c'est la condition pour l'activer.
 */
import { killSwitchCut } from '../../common/kill-switches'

/** Coupe la boucle sans redéploiement. */
export function crmSyncDisabled(): boolean {
  return killSwitchCut('crm.sync')
}

/**
 * Contacts traités par espace de travail et par passage. Borne de VOLUME, pas
 * de qualité : les contacts les plus anciennement synchronisés passent d'abord,
 * donc l'ensemble tourne sur plusieurs jours au lieu de re-balayer les mêmes.
 */
export function maxContactsPerWorkspace(): number {
  // `Number('')` vaut 0, pas NaN : lire la variable sans tester d'abord sa
  // PRÉSENCE mettait la borne à zéro dès qu'elle n'était pas posée, donc
  // désactivait silencieusement toute la boucle. Le défaut ne doit s'appliquer
  // qu'à une valeur absente ou vide, jamais à un zéro délibéré — un opérateur
  // qui écrit `0` veut vraiment couper.
  const raw = (process.env['CRM_SYNC_MAX_CONTACTS'] ?? '').trim()
  if (!raw) return 200
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 200
}

/**
 * Autorise-t-on la boucle à ÉCRASER une valeur non vide côté CRM ?
 *
 * `false` par défaut, et c'est délibéré malgré l'arbitrage « Bellum fait foi ».
 * L'arbitrage porte sur ce que le PRODUIT affiche et propose ; l'écraser
 * automatiquement dans l'outil d'un client est une autre décision, dont les
 * conséquences se lisent chez lui et pas chez nous. La boucle remplit donc les
 * champs VIDES — ce qui est un gain net sans risque — et signale les écarts pour
 * que quelqu'un tranche. Un opérateur qui veut la propagation automatique
 * l'active explicitement.
 */
export function overwriteRemoteValues(): boolean {
  return (process.env['CRM_SYNC_OVERWRITE'] ?? '').trim().toLowerCase() === 'true'
}
