import { launcherTypeOf, runsOfType, type LauncherRun, type LauncherTypeKey } from '@bellum/contracts'

/**
 * Ce que le composer AFFICHE selon le run armé — des fonctions PURES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le lanceur vivait dans une bande AU-DESSUS du fil, avec SON champ de saisie.
 * L'écran portait donc deux zones de saisie à 550 px l'une de l'autre — « Nom
 * de l'entreprise… » en haut, « Écris ton message… » en bas — et déplier un
 * chip poussait la conversation hors de vue. Mesuré en recette le 27/08/2026 :
 * les utilisateurs ne trouvaient plus comment lancer une analyse depuis que le
 * bouton « Nouvelle analyse » avait fusionné avec « Demander à Laura ».
 *
 * Le lanceur descend donc DANS le composer, et le champ devient unique. Ce qui
 * change alors n'est plus la mise en page mais ce que la zone de saisie DIT
 * d'elle-même : son marque-place, son bouton, et ce que fait Entrée. Ces trois
 * réponses sont ici, pures et testables, plutôt que dans trois ternaires au
 * milieu du JSX — c'est la seule partie qui puisse coûter un crédit à
 * quelqu'un, et un `if` enfoui dans un `onKeyDown` ne se teste qu'à la main.
 *
 * ⚠️ Ces fonctions ne DÉCIDENT pas de la voie — {@link launcherIntent} le fait
 * déjà, et en dupliquer la règle produirait deux vérités sur « est-ce que ce
 * clic débite ? ». Elles ne font que traduire un état armé en libellés.
 */

/**
 * Le run réellement armé : celui qu'on a choisi, sinon le PREMIER de son type.
 *
 * Même repli que `launcherIntent`, et pour la même raison : l'ordre du
 * catalogue est une décision (sur un compte, analyser est le geste dominant),
 * et n'armer aucun run après un clic sur un chip donnerait un composer qui a
 * l'air cassé. Un type inconnu — lien collé, état abîmé — n'arme RIEN plutôt
 * que de lever : le composer retombe alors sur la voie Laura, qui ne peut rien
 * coûter.
 */
export function armedRunOf(typeKey: LauncherTypeKey | null, runKey: string | null): LauncherRun | null {
  if (!typeKey) return null
  const type = launcherTypeOf(typeKey)
  if (!type) return null
  const runs = runsOfType(type.key)
  return runs.find(run => run.key === runKey) ?? runs[0] ?? null
}

/**
 * La clé i18n du marque-place.
 *
 * C'est le signal le plus fort de tout le chantier, et il est gratuit : le
 * champ passe de « Écris ton message… » à « Nom de l'entreprise… ». Un
 * utilisateur qui a armé un run par erreur le voit sans avoir à lire un badge.
 *
 * ⚠️ Un run qui ne se cherche PAS au clavier (`queryParam === null` — un
 * territoire se choisit dans une liste de départements) garde le marque-place
 * de Laura : promettre une saisie qu'on jetterait sans le dire est pire que
 * pas de promesse du tout.
 */
export function composerPlaceholderKey(run: LauncherRun | null, typeKey: LauncherTypeKey | null): string {
  if (!run || !typeKey || run.queryParam === null) return 'composer.placeholder'
  return `launcher:placeholder.${typeKey}`
}

/**
 * Ce que fait le bouton principal, et donc comment il s'appelle.
 *
 * `send` = la voie Laura, gratuite. `open` = un run armé : le mot dit qu'on va
 * OUVRIR l'écran de l'objet, pas que le travail est fait — le lanceur
 * n'exécute rien, c'est la confirmation de l'écran de destination qui débite
 * (voir le préambule du catalogue). Annoncer « Lancer » ici ferait croire que
 * le clic prélève, et le prochain écran passerait pour un doublon.
 */
export function composerSubmitMode(run: LauncherRun | null): 'send' | 'open' {
  return run ? 'open' : 'send'
}

/**
 * Le bouton principal est-il actionnable ?
 *
 * Un run SANS saisie clavier (`queryParam === null`) est actionnable dès qu'il
 * est armé : il n'y a rien à taper, et exiger du texte rendrait le bouton
 * définitivement mort. Partout ailleurs, il faut du texte — envoyer un message
 * vide ou ouvrir une analyse sans nom d'entreprise ne mène nulle part.
 */
export function composerCanSubmit(run: LauncherRun | null, text: string): boolean {
  if (run && run.queryParam === null) return true
  return text.trim().length > 0
}

/**
 * #2428.19 — la RAISON, quand le bouton d'envoi est désactivé.
 *
 * Le bouton se contentait d'un `disabled` nu : ni tooltip, ni annonce, rien
 * qui dise POURQUOI. `null` = actionnable, rien à montrer. Sinon, deux causes
 * possibles — jamais devinées, jamais confondues : un run ARMÉ attend un
 * texte qu'on n'a pas encore tapé, ou la voie Laura par défaut n'a ni texte
 * ni connecteur choisi (`hasConnector` — même garde que #2668.1 dans `Chat`,
 * un connecteur seul peut partir sans texte, jamais sur un run armé).
 */
export function composerDisabledReasonKey(run: LauncherRun | null, text: string, hasConnector: boolean): string | null {
  if (composerCanSubmit(run, text) || (!run && hasConnector)) return null
  return run ? 'composer.openDisabledReason' : 'composer.sendDisabledReason'
}
