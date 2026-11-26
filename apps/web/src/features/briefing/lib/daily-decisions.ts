import type { BriefingAction, WorkspaceRole } from '@bellum/contracts'
import { briefingActionUrgencyTier } from './urgency-tier'

/**
 * BEL-SC-227 (#3256) — « Aujourd'hui » devient un système de décision, pas
 * une septième liste de priorités équivalentes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE RECALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * #3249 (règle 4) interdit un second score, une seconde qualification. Le
 * classement par urgence existe déjà (`briefingActionUrgencyTier`, #2389.6)
 * et ses quatre étiquettes DISENT DÉJÀ les trois catégories du ticket :
 * urgent/important protègent l'existant (deadline, perte immédiate, relation
 * commerciale qui pèse) ; opportunité crée le prochain mouvement (action à
 * potentiel) ; administratif est déjà « à traiter mais ne doit pas écraser
 * le commercial » — la même intention que « simplifier le système ». Ce
 * fichier LIT ce verdict, il ne le refait pas.
 */

export const DAILY_DECISION_CATEGORIES = ['protect', 'nextMove', 'simplify'] as const
export type DailyDecisionCategory = (typeof DAILY_DECISION_CATEGORIES)[number]

export interface DailyDecision {
  category: DailyDecisionCategory
  action: BriefingAction
}

/**
 * BEL-SC-227.5 / .26 — le rôle déclaré (`PROFILE_QUESTION_OPTIONS.user_role`,
 * @bellum/contracts — la maison canonique, jamais un second catalogue). Deux
 * groupes seulement, ceux que le ticket nomme en exemple avec des priorités
 * opposées ; les autres rôles (Business Manager, Account Manager…) gardent
 * l'ordre par défaut plutôt qu'une préférence devinée.
 */
const PROTECT_FIRST_ROLES = new Set(['Fondateur / CEO', 'Directeur de BU', "Directeur d'agence"])
const NEXT_MOVE_FIRST_ROLES = new Set(['Business Developer', 'SDR / BDR'])

/**
 * BEL-SC-227.5 / .26 — LE RÔLE CHANGE L'ORDRE, JAMAIS LE CONTENU (CLAUDE.md,
 * doctrine).
 *
 * Les TROIS catégories restent toujours les mêmes, et une catégorie sans
 * candidat ne fait AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas ») —
 * jamais une décision inventée pour remplir un siège. Seul l'ORDRE dans
 * lequel les décisions se lisent varie : un fondateur ou un directeur de BU
 * lit d'abord ce qui protège le business existant, un business developer ou
 * un SDR lit d'abord ce qui crée le prochain mouvement. C'est la même
 * doctrine que la page applique déjà ailleurs (`c76_role_reordonne_jamais_
 * ne_filtre`) — jamais un rôle qui retire un bloc.
 */
export function categoryOrderForRole(role: string | null | undefined): readonly DailyDecisionCategory[] {
  if (role && PROTECT_FIRST_ROLES.has(role)) return ['protect', 'nextMove', 'simplify']
  if (role && NEXT_MOVE_FIRST_ROLES.has(role)) return ['nextMove', 'protect', 'simplify']
  return DAILY_DECISION_CATEGORIES
}

/**
 * #3414 — « Lire comme » (salle de démo) : le rôle CHOISI se traduit en rôle
 * déclaré équivalent pour l'ordre des décisions — un dirigeant ou un manager
 * ouvre sur ce qui protège, un commercial sur le prochain mouvement, un
 * recruteur garde l'ordre par défaut. Sans lecture choisie, le rôle déclaré
 * fait foi, inchangé. L'ordre seul varie (c76), jamais le contenu.
 */
export function roleForReadAs(readAs: WorkspaceRole | null, declared: string | null | undefined): string | null {
  if (!readAs) return declared ?? null
  if (readAs === 'owner') return 'Fondateur / CEO'
  if (readAs === 'admin') return 'Directeur de BU'
  if (readAs === 'sales') return 'Business Developer'
  return 'Talent Manager / Recruteur'
}

function categoryForTier(tier: ReturnType<typeof briefingActionUrgencyTier>): DailyDecisionCategory {
  if (tier === 'urgent' || tier === 'important') return 'protect'
  if (tier === 'opportunity') return 'nextMove'
  return 'simplify'
}

/**
 * BEL-SC-227.1-.4 — au plus TROIS décisions, une par catégorie. Le rang
 * SERVEUR (`priority`) décide déjà qui passe devant qui : la première carte
 * de chaque catégorie, dans cet ordre, en est le représentant — jamais un
 * second tri qui pourrait contredire le classement affiché ailleurs sur
 * l'écran (GA-26).
 */
export function classifyDailyDecisions(
  actions: readonly BriefingAction[],
  now: Date,
  role: string | null | undefined,
): DailyDecision[] {
  const ranked = [...actions].sort((a, b) => a.priority - b.priority)
  const byCategory = new Map<DailyDecisionCategory, BriefingAction>()
  for (const action of ranked) {
    const category = categoryForTier(briefingActionUrgencyTier(action, now))
    if (!byCategory.has(category)) byCategory.set(category, action)
    if (byCategory.size === DAILY_DECISION_CATEGORIES.length) break
  }

  const order = categoryOrderForRole(role)
  const decisions: DailyDecision[] = []
  for (const category of order) {
    const action = byCategory.get(category)
    if (action) decisions.push({ category, action })
  }
  return decisions
}

/**
 * BEL-SC-227.24 — LA DISPERSION : plusieurs sujets ADMINISTRATIFS ouverts en
 * même temps (aucun genre dominant), le signal qui force au moins une
 * décision de simplification. Compté sur le verdict déjà servi
 * (`briefingActionUrgencyTier`), jamais un seuil posé sur du texte.
 */
export function detectDispersion(actions: readonly BriefingAction[], now: Date, threshold = 3): boolean {
  const administrative = actions.filter(action => briefingActionUrgencyTier(action, now) === 'administrative')
  return administrative.length >= threshold
}
