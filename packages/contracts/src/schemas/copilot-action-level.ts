import { z } from 'zod'
import type { RoutineDefinition } from './routines.js'
import { hasPermission, type WorkspacePermission, type WorkspaceRole } from './workspace.js'

/**
 * #2449 — LES QUATRE NIVEAUX D'ACTION DU COPILOTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le niveau d'action **n'est pas une étiquette d'affichage** : c'est ce qui
 * AUTORISE ou REFUSE une écriture. D'où la valeur ici, dans le contrat partagé,
 * et la porte qui la lit dans `apps/api/src/modules/action-os/
 * copilot-action-gate.ts` — à UN seul endroit, sur le chemin par lequel passe
 * tout dispatch (`action-router.service.ts`, `dispatchIdempotent`).
 *
 * ⚠️ **Ce n'est PAS un troisième modèle d'autorisation** (GA-26). Le dépôt en
 * portait déjà deux, et ils restent tels quels :
 *
 *   `AutomationLevel` (N0-N5, `action-os.ts`) — ce que la POLITIQUE exige :
 *       qui doit dire oui avant qu'un effet parte. C'est `approval-policy.ts`
 *       qui la dérive, et elle seule.
 *   `UserAutonomyBand` (A0-A3, `action-os.ts`) — ce qu'on DIT à l'utilisateur
 *       de cette exigence.
 *
 * Les quatre niveaux ci-dessous répondent à une TROISIÈME question, que ni N ni
 * A ne posent : **jusqu'où l'utilisateur a-t-il autorisé le copilote à aller
 * pour CE travail ?** N décrit le geste ; le niveau décrit le mandat. La porte
 * compose les deux — elle ne recalcule jamais ce que N a déjà tranché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CINQ MODES DE #2400.3, ET POURQUOI ILS SONT QUATRE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * #2400.3 décrit « cinq modes gradués : observe / suggest / prepare /
 * execute-after-approval / auto-execute ». #2449, relu et validé plus tard,
 * en décrit quatre. Les deux listes ne se contredisent pas : #2400 SÉPARE deux
 * modes que #2449 fusionne, et il les sépare sur un axe qui n'est pas celui de
 * l'autorisation. `observe` et `suggest` écrivent tous deux EXACTEMENT rien ; ce
 * qui les distingue est conversationnel (Laura rapporte, ou Laura propose), pas
 * une permission. Une porte qui les distinguerait aurait deux valeurs pour un
 * seul comportement — et la première divergence viendrait de là.
 *
 * La correspondance est donc écrite, et TENUE par un test
 * ({@link GRADUATED_MODE_LEVEL}) : les cinq noms de #2400 existent dans le code,
 * chacun lié à exactement un niveau. Aucun sixième mode ne peut être exposé.
 */
export const copilotActionLevelSchema = z.enum([
  /**
   * « Répondre seulement » — il ne touche à rien. Aucun objet, aucun brouillon,
   * aucune tâche, aucune écriture, aucun envoi (#2449.3-.7).
   */
  'respond_only',
  /**
   * « Préparer » — il crée à l'INTÉRIEUR de BellumAI, jamais dehors
   * (#2449.8-.15). Ce qu'il crée porte le statut {@link PREPARED_IN_BELLUM}.
   */
  'prepare',
  /**
   * « Exécuter » — il demande AVANT chaque geste qui sort ou qui coûte
   * (#2449.18-.24). Le GO est le geste de l'utilisateur (doctrine : « une
   * écriture CRM/ERP passe par une porte — auto-approuvé sur geste
   * utilisateur, sinon prévisualisation figée »).
   */
  'execute',
  /**
   * « Automatiser » — il agit seul, et seulement si les SIX conditions de
   * {@link AUTOMATION_PREREQUISITES} sont réunies (#2449.26-.31). Jamais vers
   * une personne : le copilote n'envoie pas d'e-mail, quel que soit le niveau.
   */
  'automate',
])
export type CopilotActionLevel = z.infer<typeof copilotActionLevelSchema>

/** Du plus inerte au plus autonome — l'ordre dans lequel un écran les propose. */
export const COPILOT_ACTION_LEVEL_ORDER: readonly CopilotActionLevel[] = [
  'respond_only',
  'prepare',
  'execute',
  'automate',
] as const

/**
 * #2400.3 — les cinq modes gradués du rapport, chacun lié au niveau qui porte
 * sa permission. `Record` exhaustif : un sixième mode ne compile pas, et un
 * mode dont personne n'aurait nommé le niveau non plus.
 */
export const GRADUATED_MODE_LEVEL: Readonly<Record<GraduatedActionMode, CopilotActionLevel>> = {
  /** Il regarde et rapporte. Rien ne s'écrit. */
  observe: 'respond_only',
  /** Il propose. Rien ne s'écrit non plus — d'où le MÊME niveau. */
  suggest: 'respond_only',
  prepare: 'prepare',
  'execute-after-approval': 'execute',
  'auto-execute': 'automate',
}

export const graduatedActionModeSchema = z.enum([
  'observe',
  'suggest',
  'prepare',
  'execute-after-approval',
  'auto-execute',
])
export type GraduatedActionMode = z.infer<typeof graduatedActionModeSchema>

/**
 * #2449.16 — le statut de ce que le niveau « préparer » a créé.
 *
 * **Le mot compte** : « préparé » n'est ni « créé » ni « envoyé ». Un brouillon
 * préparé dans BellumAI n'existe nulle part ailleurs, personne ne l'a reçu, et
 * rien n'a été engagé. Le libellé affiché vit dans `actions.json` (FR et EN) ;
 * la CLÉ vit ici, pour que les deux langues ne puissent pas en dire deux choses
 * différentes.
 */
export const PREPARED_IN_BELLUM = 'prepared_in_bellum'

// ── Niveau « automatiser » : les six conditions (#2449.26-.31) ───────────────

/**
 * Les six conditions du niveau « automatiser », **toutes nécessaires**.
 *
 * L'ordre est celui du rapport, et il n'est pas décoratif : il va du plus
 * factuel (la capacité existe-t-elle vraiment ?) au plus opératoire (sait-on
 * l'arrêter ?). Aucune n'est un défaut : l'absence d'une seule suffit à refuser.
 */
export const AUTOMATION_PREREQUISITES = [
  /** #2449.26 — la fonctionnalité existe RÉELLEMENT. Pas « est prévue ». */
  'capability_exists',
  /** #2449.27 — la policy de l'espace l'autorise (`approval_default_level`). */
  'workspace_policy_allows',
  /** #2449.28 — le rôle est habilité ({@link AUTOMATE_LEVEL_PERMISSION}). */
  'role_allowed',
  /** #2449.29 / #2400.5 — une simulation sur données RÉELLES a été validée. */
  'simulation_validated',
  /** #2449.30 — un plafond est défini. « Illimité » n'est pas un plafond. */
  'cap_defined',
  /** #2449.31 — un interrupteur d'arrêt existe (`common/kill-switches.ts`). */
  'kill_switch_available',
] as const
export type AutomationPrerequisite = (typeof AUTOMATION_PREREQUISITES)[number]

/** L'état des six, tel qu'un appelant l'a mesuré. Aucune valeur par défaut :
 *  « on ne sait pas » n'est pas « c'est bon » (`Record` exhaustif). */
export type AutomationReadiness = Record<AutomationPrerequisite, boolean>

/**
 * Celles des six qui manquent, dans l'ordre du rapport.
 *
 * Rend une LISTE et non un booléen : on ne dit pas seulement non, on dit ce
 * qu'il manque — « un score n'est jamais nu ».
 */
export function missingAutomationPrerequisites(readiness: AutomationReadiness): AutomationPrerequisite[] {
  return AUTOMATION_PREREQUISITES.filter(name => !readiness[name])
}

/**
 * #2449.28 / #2449.32 — l'habilitation au niveau « automatiser ».
 *
 * Réutilise la matrice de permissions plutôt que d'inventer une seconde liste
 * de rôles, exactement comme `canDecide` (`approval-policy.ts`) : « manager »
 * n'est pas un rôle du produit, c'est quiconque gère l'équipe. Un rôle ajouté
 * demain est donc habilité ou non par la matrice, pas par un oubli ici.
 */
export const AUTOMATE_LEVEL_PERMISSION: WorkspacePermission = 'team:manage'

/**
 * #2449.32 — les niveaux qu'on PROPOSE à ce rôle.
 *
 * ⚠️ C'est l'exception explicitement nommée à « le rôle change l'ORDRE, jamais
 * le CONTENU » (`c76_role_reordonne_jamais_ne_filtre`) : « automatiser » n'est
 * pas une information qu'on cache, c'est une HABILITATION qu'on n'a pas. Et
 * l'exception est BORNÉE — les trois autres niveaux restent tous présents, dans
 * le même ordre, pour tout le monde. Un rôle non habilité ne voit pas une liste
 * réordonnée ni amputée d'autre chose : il voit les trois niveaux qu'il peut
 * réellement demander.
 */
export function offeredActionLevels(role: WorkspaceRole): CopilotActionLevel[] {
  if (hasPermission(role, AUTOMATE_LEVEL_PERMISSION)) return [...COPILOT_ACTION_LEVEL_ORDER]
  return COPILOT_ACTION_LEVEL_ORDER.filter(level => level !== 'automate')
}

// ── #2896 / #2449.34-.37 — LE NIVEAU PERSISTÉ, ET CE QUI L'AFFICHE ──────────

/**
 * #2449.34 — le niveau d'action réglé par l'utilisateur, persisté dans son sac
 * de préférences (`user_preferences`, JSONB) sous CETTE clé et aucune autre.
 *
 * Décision (#2896, appliquée sans QCM) : le mandat est PERSONNEL, comme les
 * réglages de réponse de Laura (`REPLY_PREFERENCE_KEYS`) — c'est « jusqu'où
 * Laura va pour MOI », pas une règle d'espace. Le sac existe déjà : aucune
 * migration, et « oublier » la préférence dans Réglages › Mémoire ramène au
 * défaut, exactement comme pour les réglages de réponse.
 */
export const ACTION_LEVEL_PREFERENCE_KEY = 'copilotActionLevel'

/**
 * #2449.26 — les niveaux qu'un utilisateur peut RÉGLER pour lui-même.
 *
 * « Automatiser » n'y est pas : sa première condition est que « la
 * fonctionnalité existe réellement », et Laura n'exécute aucune de ses
 * propositions sans clic. Ce qui agit seul dans le produit, ce sont les
 * routines — leur niveau se lit routine par routine ({@link ROUTINE_ACTION_LEVEL}).
 * Proposer « automatiser » ici promettrait un comportement qui n'existe pas.
 */
export const SETTABLE_ACTION_LEVELS = ['respond_only', 'prepare', 'execute'] as const
export type SettableActionLevel = (typeof SETTABLE_ACTION_LEVELS)[number]

/** `PUT /actions/level` — `null` RETIRE la clé : on revient au défaut de #2449. */
export const actionLevelSettingSchema = z.object({
  level: z.enum(SETTABLE_ACTION_LEVELS).nullable(),
})
export type ActionLevelSetting = z.infer<typeof actionLevelSettingSchema>

/**
 * Le niveau réglé, lu dans le sac — `null` s'il n'y a rien, ou rien de valide.
 * ⚠️ Le sac s'écrit aussi par `PATCH /memory/preferences` : une valeur posée à
 * la main n'est donc jamais crue sur parole, et « automatiser » n'y est pas lu.
 */
export function actionLevelFromPreferences(preferences: Readonly<Record<string, unknown>>): SettableActionLevel | null {
  const raw = preferences[ACTION_LEVEL_PREFERENCE_KEY]
  return (SETTABLE_ACTION_LEVELS as readonly unknown[]).includes(raw) ? (raw as SettableActionLevel) : null
}

/**
 * #2449.35 / #2449.36 — le niveau qui s'applique au CLIC sur une proposition de
 * Laura, tel qu'il s'affiche avant ce clic.
 *
 * Sans réglage, c'est la « valeur par défaut » de #2449 : « une demande
 * "envoie" prépare puis demande validation » — la carte EST la validation,
 * donc « exécuter ». `isDefault` le dit, pour que l'écran ne présente pas un
 * défaut comme un choix que l'utilisateur aurait fait.
 */
export function actionLevelAtClick(level: SettableActionLevel | null): {
  level: SettableActionLevel
  isDefault: boolean
} {
  return level ? { level, isDefault: false } : { level: 'execute', isDefault: true }
}

/**
 * #2449.37 — le niveau d'action d'une AUTOMATISATION (routine), dérivé de son
 * niveau N déclaré au catalogue — jamais un second champ à tenir en phase
 * (GA-26). `Record` exhaustif : un nouveau niveau N de routine ne compile pas
 * tant qu'on n'a pas dit quel niveau d'action il porte.
 */
export const ROUTINE_ACTION_LEVEL: Readonly<Record<RoutineDefinition['automationLevel'], CopilotActionLevel>> = {
  /** Elle prépare dans BellumAI et attend qu'on la relise. */
  n1_prepare: 'prepare',
  /** Elle agit seule, dans ses bornes : elle notifie, elle n'envoie rien dehors. */
  n4_bounded_auto: 'automate',
  /** #4016 L6 — elle agit seule, sans plafond ; elle n'envoie toujours rien dehors. */
  n5_extended_auto: 'automate',
}
