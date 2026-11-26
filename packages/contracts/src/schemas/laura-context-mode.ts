import { z } from 'zod'

/**
 * #2453 — LES MODES DE CONTEXTE CANONIQUES DE LAURA (« Contexte de travail »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un mode de contexte dit ce que Laura a le DROIT d'utiliser pour personnaliser
 * un tour — jamais ce que le profil permanent contient. Changer de mode n'écrit
 * RIEN : ni le profil personnel, ni le profil ESN, ni la mémoire (#2453.1).
 *
 * Ce n'est pas la PORTÉE (`ChatScope`, `laura-chat-scope.ts`) : la portée dit
 * sur QUEL objet porte le fil (un compte, un consultant…) ; le mode dit quelles
 * COUCHES personnelles et commerciales entrent dans le raisonnement. Les deux se
 * combinent : un fil cadré sur un compte, en mode neutre, lit le compte choisi
 * (objet sélectionné) mais ni le profil, ni le portefeuille, ni le CRM.
 *
 * Ce n'est pas non plus un contexte de travail enregistré (`work_contexts`,
 * #2455) : ceux-là sont des VARIANTES de profil ; un mode est une règle de
 * lecture, valable pour tous les tours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ LA RÈGLE S'APPLIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Au service IA (`apps/ia/app/services/context_mode.py`), AVANT que la moindre
 * ligne du prompt ne s'écrive et avant que les outils ne reçoivent le profil :
 * une couche exclue y est VIDÉE, pas « priée d'être ignorée ». Le NO-GO du
 * retour — « le système affiche mode neutre mais continue d'utiliser
 * silencieusement les secteurs » — se ferme en code, pas en consigne.
 * Ce fichier est la source de vérité ; le module Python en est le miroir, et
 * `apps/ia/tests/test_context_mode.py` lit CE fichier pour prouver la parité.
 */

/** Ordre stable : un enum ne perd jamais de valeur et n'en insère jamais au milieu (GA-08). */
export const LAURA_CONTEXT_MODES = ['my_activity', 'one_off_mission', 'neutral'] as const
export type LauraContextMode = (typeof LAURA_CONTEXT_MODES)[number]

/** « Mon activité » par défaut : c'est le comportement de Laura d'avant #2453. */
export const DEFAULT_LAURA_CONTEXT_MODE: LauraContextMode = 'my_activity'

export const lauraContextModeSchema = z.enum(LAURA_CONTEXT_MODES)

/**
 * Les couches que le serveur SAIT retirer d'un tour. Chacune correspond à des
 * champs réels de la requête IA — une couche qu'aucun champ ne porte ne se
 * déclare pas ici (on ne trace pas une exclusion qui n'exclut rien).
 *
 * - `profile` — profil personnel + profil ESN : secteurs, expertises,
 *   territoires, références déclarées, objectifs (`profile_data`).
 * - `role` — la fonction dans l'espace (`workspace_role`).
 * - `business_units` — les BU portées, leur territoire, capacité, objectif.
 * - `durable_memory` — faits épinglés, préférences, résumé glissant.
 * - `portfolio` — le portefeuille de comptes de l'espace.
 * - `crm` — ce que le CRM branché dit du compte actif.
 * - `commercial_history` — les corrections et retours passés sur le compte.
 * - `knowledge_base` — la base documentaire de l'espace retrouvée par
 *   similarité (les documents JOINTS au message restent lus : ils sont choisis).
 * - `private_mailboxes` — #3703 : la messagerie et l'agenda branchés (familles
 *   d'outils `email` et `calendar`). Ajoutée EN FIN de liste (GA-08). Neutre
 *   « n'ouvre pas implicitement » ce qui est privé : ni lecture de boîte, ni
 *   brouillon, ni agenda tant qu'on n'a pas choisi un autre mode.
 */
export const LAURA_CONTEXT_LAYERS = [
  'profile',
  'role',
  'business_units',
  'durable_memory',
  'portfolio',
  'crm',
  'commercial_history',
  'knowledge_base',
  'private_mailboxes',
] as const
type LauraContextLayer = (typeof LAURA_CONTEXT_LAYERS)[number]

/**
 * Ce que chaque mode EXCLUT. La demande, l'historique du fil, les fichiers
 * joints, l'objet cadré (compte, consultant…) et les sources publiques ne sont
 * jamais des couches : aucun mode ne les retire.
 *
 * - Mission ponctuelle (#2453.4) : le profil habituel (secteurs, territoires,
 *   objectifs), les BU, les préférences historiques et le portefeuille non lié
 *   sortent ; la base documentaire de l'espace aussi (« éventuellement les
 *   données workspace EXPLICITEMENT autorisées » — par défaut, non). Le CRM et
 *   l'historique du compte SÉLECTIONNÉ restent : c'est un objet choisi.
 * - Neutre (#2453.5) : tout sort. L'utilisateur réactive une couche en
 *   choisissant un autre mode — jamais en silence.
 */
const EXCLUDED_BY_MODE: Record<LauraContextMode, readonly LauraContextLayer[]> = {
  my_activity: [],
  one_off_mission: ['profile', 'business_units', 'durable_memory', 'portfolio', 'knowledge_base'],
  neutral: LAURA_CONTEXT_LAYERS,
}

/**
 * #2451.9 — LE MODE DE CONTEXTE PAR DÉFAUT DE L'ESPACE.
 *
 * ⚠️ CE N'EST PAS UNE RÈGLE D'ESPACE (`workspace-rules.ts`, #2081.14) : ce
 * fichier-là le dit lui-même — « le socle en porte deux, et pas davantage » et
 * « une règle ne fait que RESTREINDRE, aucune valeur ne rend un droit ». Ce
 * réglage ne retire de droit à personne : il remplace seulement la valeur de
 * repli d'un fil NEUF (`DEFAULT_LAURA_CONTEXT_MODE`) par le choix de l'espace.
 * D'où sa propre colonne (`workspaces.default_context_mode`), son propre
 * contrat ici, sa propre route (`GET/PATCH /workspaces/laura-mode`) — jamais
 * ajouté à `WorkspaceRuleValues`.
 *
 * Lu côté client par `contextModeFor` (`apps/web/.../work-contexts/contextModeStore.ts`) :
 * un fil qui n'a JAMAIS reçu de choix explicite retombe sur ce réglage, pas
 * sur la constante figée. Un mode déjà choisi pour un fil (mémoire par fil,
 * #2451.6) garde toujours la priorité — le réglage d'espace ne rouvre jamais
 * un choix déjà fait.
 */
export const workspaceDefaultContextModeResolutionSchema = z.object({
  defaultContextMode: lauraContextModeSchema,
  /** Propriétaire ou administrateur seulement ; l'API re-vérifie. */
  canEdit: z.boolean(),
})
export type WorkspaceDefaultContextModeResolution = z.infer<typeof workspaceDefaultContextModeResolutionSchema>

/** `PATCH /workspaces/laura-mode` — `strict()` : un champ de plus est refusé, jamais ignoré. */
export const updateWorkspaceDefaultContextModeSchema = z.object({ defaultContextMode: lauraContextModeSchema }).strict()
export type UpdateWorkspaceDefaultContextMode = z.infer<typeof updateWorkspaceDefaultContextModeSchema>

/** #2453.9 — les couches incluses / exclues d'un tour, dans l'ordre du contrat. */
export function contextLayersFor(mode: LauraContextMode): {
  included: LauraContextLayer[]
  excluded: LauraContextLayer[]
} {
  const excluded = EXCLUDED_BY_MODE[mode]
  return {
    included: LAURA_CONTEXT_LAYERS.filter(layer => !excluded.includes(layer)),
    excluded: LAURA_CONTEXT_LAYERS.filter(layer => excluded.includes(layer)),
  }
}

/**
 * #2451.1 / #2453.7 — la question que posent les surfaces HORS conversation
 * (Analyser, Découvrir) : « ce mode me laisse-t-il lire CETTE couche ? ».
 * Elles ne lisent que le profil et le CRM ; la réponse vient de la même table
 * que Laura (`EXCLUDED_BY_MODE`), jamais d'une seconde liste (GA-26).
 */
export function contextModeExcludes(mode: LauraContextMode, layer: (typeof LAURA_CONTEXT_LAYERS)[number]): boolean {
  return EXCLUDED_BY_MODE[mode].includes(layer)
}

/**
 * #2453.6 — LA hiérarchie, identique pour les trois modes. Le mode ne change
 * que le sixième niveau (« contexte du mode ») : une exclusion demandée dans le
 * tour (niveau 2) ne peut jamais être réintroduite par le profil (#2453.3).
 */
export const CONTEXT_PRECEDENCE = [
  'explicit_request',
  'explicit_exclusions',
  'temporary_brief',
  'selected_objects',
  'thread_history',
  'mode_context',
  'defaults',
] as const

/**
 * #2453.6 — LA résolution par la hiérarchie : parmi les couches qui portent une
 * valeur (`undefined` = la couche ne dit rien), la plus HAUTE de
 * `CONTEXT_PRECEDENCE` gagne — l'ordre de l'objet passé n'y change rien.
 *
 * Appelée par les lectures serveur du mode : `AnalysisService.start` (quel
 * mode, quel profil) et `IaProxyController.discoverProfileData` (Découvrir).
 * Une demande explicite bat le défaut de l'espace ; une surcharge explicite du
 * profil bat le mode ; le mode bat le profil habituel.
 */
export function resolveByPrecedence<T>(
  sources: Partial<Record<(typeof CONTEXT_PRECEDENCE)[number], T | undefined>>,
): T | undefined {
  for (const level of CONTEXT_PRECEDENCE) {
    const value = sources[level]
    if (value !== undefined) return value
  }
  return undefined
}
