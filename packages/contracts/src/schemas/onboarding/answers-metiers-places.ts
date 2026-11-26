import { z } from 'zod'
import { ONBOARDING_MAX_MULTI } from './limits.js'

/**
 * #3923.a — les MÉTIERS que l'espace place réellement (`esn_profiles.placed_roles`).
 *
 * La colonne existe depuis l'onboarding initial (`1780000000000`), mais elle ne
 * voyageait pas : hors de ce schéma, aucun endpoint ne la livrait au web, et
 * `signalRelevance` (Découvrir, « Pourquoi maintenant ») laissait toute offre
 * d'emploi « non évaluable ». Transportée, elle classe une offre hors métier
 * APRÈS les autres et nomme la raison — jamais une probabilité, jamais une
 * pénalité sur une absence (liste vide = « non évaluable », comme avant).
 *
 * Texte libre borné (métiers en clair : « Développeur Java », « Architecte
 * cloud »), comparé mot à mot au libellé du signal. Optionnelle (absente =
 * « non évaluable », un client plus ancien reste valide) ; `.catch([])` : une valeur
 * illisible ne fait jamais échouer la lecture d'un profil entier.
 *
 * ⚠️ Bloc AJOUTÉ EN FIN du schéma composé, comme les précédents.
 */
export const METIERS_PLACES_ANSWER_FIELDS = {
  placed_roles: z.array(z.string().trim().min(1).max(80)).max(ONBOARDING_MAX_MULTI).optional().catch([]),
}
