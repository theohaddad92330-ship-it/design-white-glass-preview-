import type { GuideSessionRequest } from './guide-store'
import { GUIDE_REGISTRY, guideSessionFromDefinition } from './guide-registry'

/**
 * #2214.3 — LE PREMIER COACHMARK, ET POURQUOI IL Y EN A UN SEUL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST
 * ─────────────────────────────────────────────────────────────────────────────
 * Le socle sans un seul consommateur serait du code juste que personne n'appelle
 * — le motif qui revient dans les ~30 chantiers déjà livrés. Voici donc UNE aide
 * réelle, atteignable depuis « Nouveautés », qui traverse toute la chaîne :
 * le catalogue d'ancrages, les portes, la résolution, la cible de secours, la
 * géométrie, le voile, le halo, la bulle et la sortie.
 *
 * Ce n'est PAS le catalogue des guides du produit (#2214.24 : les guides 2 à 12
 * et le centre d'aide sont coupés à la source, et la décision du 19/09/2026 est
 * « je complète moi-même »). C'est le pas qui prouve que le socle marche.
 *
 * ⚠️ #2212.44/.45 — depuis le registre central, PLUS ICI. Cette constante est
 * DÉRIVÉE de `GUIDE_REGISTRY` : le guide lui-même (id, version, pas) n'est
 * décrit qu'à UN seul endroit (GA-26). Le nom `FEEDBACK_COACHMARK` reste pour
 * ne pas casser ses appelants (`ChangelogMenu.tsx`) — le renommer est un pas
 * séparé, pas une obligation de ce socle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `coachmark` ET PAS `walkthrough`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un seul pas ancré, c'est la définition du niveau 2 (#2214.3). Appeler ça un
 * parcours guidé (niveau 3, #2214.4) serait s'accorder le niveau au-dessus sans
 * la chaîne d'étapes qui le justifie — exactement le glissement que la règle de
 * sélectivité #2214.5 surveille.
 */
const feedbackCoachmarkDefinition = GUIDE_REGISTRY.find(definition => definition.id === 'retour-comment-le-signaler')!

export const FEEDBACK_COACHMARK: GuideSessionRequest = guideSessionFromDefinition(feedbackCoachmarkDefinition)
