import { NotFoundException } from '@nestjs/common'
import { ACTION_LEVEL_PREFERENCE_KEY, actionLevelFromPreferences, type ActionLevelSetting } from '@bellum/contracts'

/**
 * #2896 / #2449.34 — LE NIVEAU D'ACTION PERSISTÉ.
 *
 * Avant ce lot, le niveau n'existait que comme champ éphémère d'une requête
 * (`ActionPrincipal.actionLevel`), lu seulement par `POST /actions/simulate` :
 * aucun écran n'avait de valeur à afficher, et aucun réglage n'atteignait la
 * porte (`copilot-action-gate.ts`).
 *
 * Décision (#2896) : le mandat est PERSONNEL et vit dans le sac de préférences
 * (`user_preferences`), à côté des réglages de réponse de Laura — un réglage à
 * UN seul endroit (GA-26), sans migration, et « oubliable » depuis Réglages ›
 * Mémoire comme toute préférence. La porte, elle, ne change pas.
 *
 * Des FONCTIONS sur un port étroit, pas un service : l'orchestration (quel
 * service lire, pour qui) vit dans le contrôleur, la sortie que GA-07 nomme
 * elle-même (le cliquet compte les imports service → service).
 */
type PreferencesPort = {
  getPreferences(userId: string): Promise<Record<string, unknown>>
  patchPreferences(userId: string, patch: Record<string, unknown>): Promise<unknown>
  forgetLedgerEntry(args: { userId: string; workspaceId: string; layer: 'preferences'; id: string }): Promise<void>
}

/** `null` = rien de réglé : le défaut de #2449 s'applique. */
export async function readActionLevelSetting(
  memory: Pick<PreferencesPort, 'getPreferences'>,
  userId: string,
): Promise<ActionLevelSetting> {
  return { level: actionLevelFromPreferences(await memory.getPreferences(userId)) }
}

/**
 * Pose le niveau, ou le RETIRE (`null`). Retirer passe par le même chemin que
 * « oublier » dans Réglages › Mémoire : la clé disparaît du sac, elle n'y reste
 * jamais à `null` (une clé nulle resterait une ligne du registre de mémoire,
 * relue par le copilote, sans rien dire).
 */
export async function writeActionLevelSetting(
  memory: PreferencesPort,
  caller: { userId: string; workspaceId: () => Promise<string> },
  setting: ActionLevelSetting,
): Promise<ActionLevelSetting> {
  if (setting.level) {
    await memory.patchPreferences(caller.userId, { [ACTION_LEVEL_PREFERENCE_KEY]: setting.level })
    return { level: setting.level }
  }
  try {
    await memory.forgetLedgerEntry({
      userId: caller.userId,
      workspaceId: await caller.workspaceId(),
      layer: 'preferences',
      id: ACTION_LEVEL_PREFERENCE_KEY,
    })
  } catch (error) {
    // Déjà au défaut : rien à retirer, et ce n'est pas une erreur.
    if (!(error instanceof NotFoundException)) throw error
  }
  return { level: null }
}
