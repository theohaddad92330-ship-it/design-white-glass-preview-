import { z } from 'zod'

/**
 * L'offre en TYPES DE PRESTATION, et les secteurs BACKÉS par une référence —
 * lot 26 (#2038, #2041).
 *
 * `positioning` mélangeait deux axes : la LARGEUR de spécialisation
 * ('Expertise de niche' vs 'Généraliste') et le MODE de vente ('Régie pure',
 * 'Conseil & Delivery' glissés dans les mêmes choix). Séparer les deux en
 * touchant `positioning` casserait les fixtures dorées de l'IA
 * (`apps/ia/tests/fixtures/golden_multi_persona/*.json`), `esn_prefill.py` et
 * `coverage-mode.test.ts`, qui pattern-matchent ses valeurs verbatim —
 * **doctrine « ajout seulement »** : `service_types` est un AXE NEUF, à côté
 * de `positioning` qu'on ne touche pas, plutôt qu'un remplacement.
 *
 * Trois états, jamais un score nu (#2038.14) : `service_types` (disponible —
 * ce que l'ESN sait livrer), `service_types_proven` (prouvé — sous-ensemble
 * déjà VENDU) et `service_types_desired` (ambition — NON disponible
 * aujourd'hui, jamais dans le même tableau que les deux premiers). Un champ
 * séparé garantit par construction qu'une ambition ne peut pas être lue comme
 * une preuve (#2038.15) : rien ne fusionne jamais `service_types_desired`
 * dans `service_types_proven`.
 *
 * `reference_sectors` (#2041.2) distingue, dans les secteurs visés
 * (`target_sectors`), ceux où l'ESN a une référence RÉELLE (mission,
 * consultant en poste) de ceux qui restent une ambition — aujourd'hui un seul
 * tableau les fusionne. Additif : `target_sectors` continue de porter « tous
 * les secteurs visés », ce nouveau champ affine sans le remplacer.
 *
 * Toutes optionnelles, `.catch([])` comme `offer_domains` : absent = tableau
 * vide, jamais une valeur devinée, jamais un échec de lecture pour un profil
 * enregistré avant ce lot. Pas dans `TEMPS1_REQUIRED_KEYS` : la porte de
 * complétion serveur ne bouge pas.
 */
export const OFFRE_SECTEURS_ANSWER_FIELDS = {
  service_types: z.array(z.string()).catch([]),
  // #2038.12 — sous-ensemble de `service_types` déjà VENDU (état « prouvé »).
  service_types_proven: z.array(z.string()).catch([]),
  // #2038.13 — types PAS ENCORE dans `service_types`, que l'ESN veut
  // développer (état « ambition »). Champ séparé à dessein (#2038.15).
  service_types_desired: z.array(z.string()).catch([]),
  reference_sectors: z.array(z.string()).catch([]),
}
