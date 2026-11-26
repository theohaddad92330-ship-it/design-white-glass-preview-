import { z } from 'zod'

/**
 * #2257.1 — LE CONTRAT DE DEMANDE STRUCTURÉ (LAU-FINAL-002, « compilateur
 * d'intention »).
 *
 * Le ticket demande un objet nommé, dix-huit champs, produit UNE FOIS par
 * tour à partir de ce que le moteur SAIT DÉJÀ — jamais un second appel au
 * modèle. Il n'existait NULLE PART : l'extraction d'intention restait
 * implicite au raisonnement du modèle dans `bellum_advisor.py` (mesuré au
 * registre `.claude/notes/registre-2026-09-17-lau-002-2257.md`).
 *
 * ⚠️ Ce schéma NOMME les dix-huit champs. Il ne prétend pas les avoir tous
 * PRODUITS : à la date de ce lot, seuls deux ont un producteur déterministe
 * côté moteur — `objet_depart` (le compte ACTIF, déjà résolu avant que le
 * prompt existe) et `ambiguite_deja_demandee` (le drapeau client §9.4, « pas
 * deux tours de clarification »). Les quinze autres restent `null` : aucune
 * extraction fiable de l'intention, du périmètre ou du format n'existe encore
 * — les inventer serait la donnée fictive que la doctrine interdit (« non
 * mesuré n'est jamais 0 », appliqué ici à un contrat plutôt qu'à un score).
 * Ce schéma est le NOM du manque autant que le début de la solution : la
 * prochaine capacité qui les peuple les trouve ICI, elle ne recrée pas un
 * second contrat (GA-26, « un réglage vit à un seul endroit »).
 *
 * Miroir Python : `apps/ia/app/models/request_intent_contract.py` (parité
 * testée par `REQUEST_INTENT_CONTRACT_FIELDS` ci-dessous et son jumeau
 * `REQUEST_INTENT_CONTRACT_FIELDS` côté Python — les deux listes doivent
 * rester identiques, champ pour champ).
 *
 * Jamais de contenu verbatim du message dans ce contrat : seulement des
 * catégories, des identifiants et des booléens, pour qu'il reste
 * journalisable — voir {@link requestIntentContractForLog}, qui retire même
 * le nom du compte actif avant d'écrire au journal.
 */
export const REQUEST_INTENT_CONTRACT_FIELDS = [
  'intention_principale',
  'resultat_attendu',
  'objet_depart',
  'objets_a_produire',
  'perimetre_geographique',
  'secteur',
  'expertise',
  'type_compte',
  'exclusions',
  'horizon',
  'urgence',
  'niveau_detail',
  'format_souhaite',
  'action_souhaitee',
  'niveau_autonomie',
  'sensibilite',
  'ambiguite_deja_demandee',
  'besoin_metier_sous_jacent',
] as const

export const requestIntentContractSchema = z.object({
  /** #2257.3 — NON PRODUIT : aucune classification déterministe de l'intention n'existe côté moteur. */
  intention_principale: z.string().nullable(),
  /** #2257.4 — NON PRODUIT. */
  resultat_attendu: z.string().nullable(),
  /** #2257.5 — PRODUIT : le nom du compte ACTIF, déjà résolu par le chat-context avant le prompt. */
  objet_depart: z.string().nullable(),
  /** #2257.6 — NON PRODUIT. */
  objets_a_produire: z.array(z.string()).nullable(),
  /** #2257.7 — NON PRODUIT. */
  perimetre_geographique: z.string().nullable(),
  /** #2257.8 — NON PRODUIT. */
  secteur: z.string().nullable(),
  /** #2257.9 — NON PRODUIT. */
  expertise: z.string().nullable(),
  /** #2257.10 — NON PRODUIT. */
  type_compte: z.string().nullable(),
  /** #2257.11 — NON PRODUIT comme champ générique (une règle d'exclusion ponctuelle existe ailleurs, limitée à l'auto-cohérence des comptes). */
  exclusions: z.array(z.string()).nullable(),
  /** #2257.12 — NON PRODUIT. */
  horizon: z.string().nullable(),
  /** #2257.13 — NON PRODUIT. */
  urgence: z.string().nullable(),
  /** #2257.14 — NON PRODUIT. */
  niveau_detail: z.string().nullable(),
  /** #2257.15 — NON PRODUIT comme champ dédié : le format est choisi par le modèle en bout de prompt (`_BLOCK_FORMAT`), jamais par un code qui le nomme AVANT. */
  format_souhaite: z.string().nullable(),
  /** #2257.16 — NON PRODUIT. */
  action_souhaitee: z.string().nullable(),
  /** #2257.17 — NON PRODUIT comme champ dédié : l'AUTONOMIE du prompt est une consigne STATIQUE (plafonds génériques), pas une valeur calculée par tour. */
  niveau_autonomie: z.string().nullable(),
  /** #2257.18 — NON PRODUIT comme champ dédié : la sensibilité gouverne déjà l'exécution (porte d'approbation `PendingActions`), mais n'est pas nommée EN AMONT dans un contrat. */
  sensibilite: z.string().nullable(),
  /** #2257.19/.32 — PRODUIT : le drapeau client `clarification_asked` (§9.4, jamais deux tours de clarification d'affilée). */
  ambiguite_deja_demandee: z.boolean(),
  /** #2257.20 — NON PRODUIT : aucun mécanisme n'infère le besoin métier caché derrière la formulation. */
  besoin_metier_sous_jacent: z.string().nullable(),
})
export type RequestIntentContract = z.infer<typeof requestIntentContractSchema>

/**
 * Construit le contrat UNE FOIS par tour, depuis ce que l'appelant a DÉJÀ
 * résolu — jamais un nouvel appel au modèle (le ticket l'exige explicitement).
 */
export function buildRequestIntentContract(input: {
  /** Le nom du compte ACTIF, ou `null` si aucun (fil partagé, portefeuille). */
  activeAccountCompanyName: string | null
  /** Le drapeau client §9.4 : une clarification a-t-elle DÉJÀ été demandée dans ce fil ? */
  clarificationAlreadyAsked: boolean
}): RequestIntentContract {
  return {
    intention_principale: null,
    resultat_attendu: null,
    objet_depart: input.activeAccountCompanyName,
    objets_a_produire: null,
    perimetre_geographique: null,
    secteur: null,
    expertise: null,
    type_compte: null,
    exclusions: null,
    horizon: null,
    urgence: null,
    niveau_detail: null,
    format_souhaite: null,
    action_souhaitee: null,
    niveau_autonomie: null,
    sensibilite: null,
    ambiguite_deja_demandee: input.clarificationAlreadyAsked,
    besoin_metier_sous_jacent: null,
  }
}

/**
 * Vue JOURNALISABLE du contrat — SANS CONTENU (doctrine : le corps d'une
 * demande ne sort jamais vers un journal). `objet_depart` porte un nom de
 * compte : ce n'est pas le contenu d'un message, mais on le retire quand même
 * du journal par prudence — seule sa PRÉSENCE compte pour le diagnostic.
 */
export function requestIntentContractForLog(contract: RequestIntentContract): Record<string, boolean> {
  return {
    has_intention_principale: contract.intention_principale !== null,
    has_resultat_attendu: contract.resultat_attendu !== null,
    has_objet_depart: contract.objet_depart !== null,
    has_objets_a_produire: (contract.objets_a_produire?.length ?? 0) > 0,
    has_perimetre_geographique: contract.perimetre_geographique !== null,
    has_secteur: contract.secteur !== null,
    has_expertise: contract.expertise !== null,
    has_type_compte: contract.type_compte !== null,
    has_exclusions: (contract.exclusions?.length ?? 0) > 0,
    has_horizon: contract.horizon !== null,
    has_urgence: contract.urgence !== null,
    has_niveau_detail: contract.niveau_detail !== null,
    has_format_souhaite: contract.format_souhaite !== null,
    has_action_souhaitee: contract.action_souhaitee !== null,
    has_niveau_autonomie: contract.niveau_autonomie !== null,
    has_sensibilite: contract.sensibilite !== null,
    ambiguite_deja_demandee: contract.ambiguite_deja_demandee,
    has_besoin_metier_sous_jacent: contract.besoin_metier_sous_jacent !== null,
  }
}
