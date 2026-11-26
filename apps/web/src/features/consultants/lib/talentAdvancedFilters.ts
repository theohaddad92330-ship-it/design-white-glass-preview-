/**
 * Ce que le tiroir « Plus de filtres » du vivier NE sait TOUJOURS PAS filtrer
 * (manque A du 30/08, réduit le 31/08/2026 — PDF-22 §01, puis FERMÉ le
 * 31/08/2026, second lot).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX DERNIERS SONT DEVENUS DE VRAIS CRITÈRES SERVEUR
 * ─────────────────────────────────────────────────────────────────────────
 * La source (PDF 3 §6.4, puis PDF-22 §01) décrivait un tiroir filtrant aussi
 * sur le rayon autour d'une ville et sur les années d'expérience — les deux
 * seuls restés hors d'atteinte après le premier lot du 31/08 (qui avait déjà
 * livré TJM minimum, langues, CV disponible, mode de travail). Louis a
 * tranché les deux :
 *
 *  - le RAYON géocode désormais via la Base Adresse Nationale
 *    (`api-adresse.data.gouv.fr`, publique, sans clé) — `latitude`/
 *    `longitude` posées sur le consultant à la saisie de la ville
 *    (`ConsultantsService.applyGeocoding`), la distance calculée en SQL
 *    (`talentSearchQuerySchema.radiusKm`, `TalentService.search`, haversine).
 *    Un talent non géocodé sort du filtre, il ne vaut jamais « à 0 km » ;
 *  - les ANNÉES D'EXPÉRIENCE sont un champ SAISI sur la personne
 *    (`consultants.years_experience`), distinct de
 *    `consultantSkillSchema.years` qui ne mesure l'ancienneté que sur UNE
 *    compétence. Un agrégat improvisé aurait mesuré autre chose que ce que le
 *    libellé promet — voir `consultantSchema.years_experience`
 *    (`packages/contracts`) pour la décision complète.
 *
 * Ce registre reste VIDE plutôt que supprimé : le jour où un futur critère de
 * ce tiroir se révèle hors d'atteinte, il retrouve tout de suite sa place —
 * et `TalentFilterDrawer.tsx` n'affiche le bloc « ce tiroir ne filtre pas
 * encore » que si ce tableau porte au moins une entrée.
 */
export const TALENT_ADVANCED_FILTERS_UNAVAILABLE: readonly { key: string; reason: string }[] = []
