/**
 * #2009.7 — la SEULE forme sous laquelle la construction du contexte de profil
 * apprend l'espace de travail ACTIF de l'utilisateur, pour l'inclure dans la
 * clé d'idempotence de `triggerGeneration` (`profile-context.service.ts`).
 *
 * Même raisonnement que `connected-tools.port.ts` (#2007.8) : la première
 * version aurait lu `EsnProfileWorkspaceResolver` (module `esn-profile`)
 * directement depuis `ProfileContextService`, et GA-07 refuse qu'un service
 * aille chercher celui d'un autre module. `EsnProfileReaderModule` est déjà
 * conçu pour ce cas précis (voir son docblock : « un consommateur qui a
 * seulement besoin de LIRE… sans importer transitivement Auth/Mailer/
 * ProfileContext ») — le câblage vit dans `profile-context.module.ts`, comme
 * pour le registre d'outils.
 *
 * Le docblock de `generationKey` (`profile-context.service.ts`) documentait
 * ce manque explicitement : « élargir la clé suppose de faire remonter
 * workspace… depuis l'appelant — hors périmètre de ce lot. » Ce port ne
 * résout QUE l'espace de travail ; la BU a son propre port depuis #2009.8
 * (`business-units.port.ts`, revue sécurité dans son docblock).
 */
export const WORKSPACE_ID_READER = Symbol('WORKSPACE_ID_READER')

export type WorkspaceIdReader = {
  /**
   * L'espace de travail ACTIF de cet utilisateur, ou `null` s'il n'en a
   * aucun (profil legacy, avant tout espace) — jamais deviné. Une lecture
   * ratée dégrade en `null`, jamais bloquante pour la génération elle-même
   * (même doctrine que {@link ConnectedToolsReader}).
   */
  resolveWorkspaceId(userId: string): Promise<string | null>
}
