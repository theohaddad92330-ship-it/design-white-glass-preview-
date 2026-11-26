import { z } from 'zod'

/**
 * Le placement en CDI chez le client — une famille à lui seul.
 *
 * L'ESN place-t-elle aussi des profils EN CDI chez ses clients ? (#1124)
 *
 * « Je propose aussi à mes clients du recrutement de profil IT en fixe chez
 * eux. Donc si tu peux me sortir les annonces de postes comme ça, je suis
 * assez refait. »
 *
 * Ce n'est ni un domaine (`offer_domains` dit ce qu'on vend comme CONSEIL —
 * « RH, talent, recrutement » y désigne du conseil RH, pas du placement),
 * ni un positionnement (`positioning` parle de largeur de spécialisation).
 * C'est un MODE de vente, orthogonal aux deux, et rien ne le portait — c'est
 * aussi pourquoi il a son propre fichier.
 *
 * Sa conséquence est unique et écrite : les offres d'emploi d'un compte
 * cessent d'être filtrées aux rôles IT. Pour une ESN qui place des profils
 * chez ses clients, TOUTE ouverture de poste est une piste — et le tri IT lui
 * cachait précisément celles qu'elle vend.
 *
 * Valeurs MACHINE (`yes` / `no`) et non le libellé affiché : le libellé
 * changera un jour, et une dérivation qui compare des phrases se casse en
 * silence — c'est la famille du renommage i18n sur la mauvaise clé.
 *
 * Optionnel et `null` par défaut : absent = comportement d'avant, à l'octet
 * près, pour tous les espaces existants. `no` dit la même chose qu'absent au
 * pipeline (« ne change rien ») tout en gardant trace d'une réponse donnée —
 * la question ne se repose donc pas.
 *
 * ⚠️ `.nullable()` SANS `.optional()`, comme `offer_domain` : zod émet donc
 * toujours la clé (à `null` quand personne n'a répondu). Une clé ABSENTE ne
 * serait pas seulement discrète — elle rendrait la réponse INSAUVEGARDABLE
 * dans l'éditeur de profil, dont l'état « modifié » ne compare que les clés
 * déjà stockées. Trouvé en recette : le clic ne déclenchait aucune requête.
 *
 * ⚠️ Sa POSITION dans le schéma composé (après le portefeuille d'offre, avant
 * le Temps 2) est celle d'avant l'éclatement et ne bouge pas : l'ordre des clés
 * est une part du contrat que la garde `answers.test.ts` fige.
 */
/**
 * Théo O onboarding-couverture (22/10) — la V23 ajoute trois nuances à « oui / non » : placement ponctuel, prestation
 * seule, activité à développer. Les deux valeurs d'avant (`yes`, `no`) gardent leur sens ; les neuves s'AJOUTENT EN FIN.
 * ⚠️ Un placement « à développer » n'est pas encore un placement : il n'ouvre PAS les offres d'emploi à tous les métiers.
 */
export const RECRUITS_FOR_CLIENTS_VALUES = ['yes', 'no', 'sometimes', 'services_only', 'to_develop'] as const
export type RecruitsForClients = (typeof RECRUITS_FOR_CLIENTS_VALUES)[number]

/** L'ESN place-t-elle des profils en CDI chez ses clients ? UN seul prédicat (GA-26) pour tous les lecteurs. */
export function placesProfilesForClients(value: string | null | undefined): boolean {
  return value === 'yes' || value === 'sometimes'
}

export const RECRUITMENT_ANSWER_FIELDS = {
  recruits_for_clients: z.enum(RECRUITS_FOR_CLIENTS_VALUES).nullable().catch(null),
}
