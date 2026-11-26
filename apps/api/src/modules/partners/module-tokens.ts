/**
 * Ce que le module FOURNIT à son service, sous forme de jeton — même discipline
 * que `backoffice-alerts/module-tokens.ts` et `business-metrics/module-tokens.ts`
 * (#1645), pour la MÊME raison.
 *
 * **GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND.** Le lot
 * #1624.7/#1624.9 l'a fait passer à 255 pour un plafond de 254, et la CI l'a
 * dit : `Expected: <= 254 / Received: 255`. Monter le cliquet aurait été le
 * contourner sans rien découpler — c'est exactement ce que son docblock refuse.
 *
 * `PartnersService` n'a pas besoin du service de drapeaux : il a besoin de
 * savoir **si cette capacité est allumée pour cet espace**. La composition se
 * fait dans `partners.module.ts`, qui est hors du périmètre de GA-07, et le
 * service ne connaît plus que la FORME de ce qu'il reçoit.
 */

/** Le jeton du drapeau de déploiement progressif (#1624.9). */
export const PARTNERS_FEATURE_FLAG = 'PARTNERS_FEATURE_FLAG'

/**
 * « Cette capacité est-elle allumée pour cet espace ? »
 *
 * Synchrone et sans échec possible, comme la lecture qu'elle enveloppe :
 * l'implémentation fournie rend `false` quand rien n'est configuré, jamais une
 * erreur — un drapeau indisponible ÉTEINT la capacité, il ne casse pas l'écran.
 */
export type PartnersFeatureFlag = (flag: string, workspaceId: string) => boolean
