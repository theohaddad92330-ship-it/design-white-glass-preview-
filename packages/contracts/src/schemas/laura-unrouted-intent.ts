/**
 * #1949.23 — décision Louis 13/09 batch 12 : le vocabulaire de la trace
 * anonyme des demandes que Laura n'a pas su router.
 *
 * Il vit ICI parce que TROIS côtés le partagent et qu'un réglage vit à un seul
 * endroit (GA-26) :
 *  - l'API l'écrit (`laura_unrouted_intents.category`), et la contrainte SQL
 *    `laura_unrouted_intents_category_check` doit le COUVRIR (GA-12, qui lit ce
 *    dossier) ;
 *  - le back-office le traduit (FR/EN) ;
 *  - le moteur IA le déclare dans l'outil `note_unrouted_request` — un autre
 *    langage, gardé par `test_unrouted_intent.py`, qui relit CE fichier.
 *
 * Trois raisons, jamais plus : une classification plus fine se ferait au
 * modèle, et une catégorie ajoutée ici sans migration serait refusée en base.
 */
export const UNROUTED_INTENT_CATEGORIES = ['hors_perimetre', 'capacite_absente', 'intention_incomprise'] as const

export type UnroutedIntentCategory = (typeof UNROUTED_INTENT_CATEGORIES)[number]
