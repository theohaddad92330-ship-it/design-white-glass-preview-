import type { PilotageLevelReport, PilotageMetric } from '@bellum/contracts'

/**
 * COMMENT SE LIT UN MAILLON — les trois décisions d'affichage de la chaîne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES VIVENT HORS DU COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois écrans du pilotage écrivaient chacun leur pourcentage à la main
 * (`${Math.round(x * 100)} %`) : la chaîne commerciale, le pipeline du CRM et le
 * taux d'intercontrat. Trois copies de la même ligne, donc trois occasions de
 * diverger — et un JSX ne se teste pas sans monter tout un écran, si bien que
 * personne n'avait jamais vérifié ce que ces trois lignes faisaient d'un taux
 * proche de zéro.
 *
 * Ce module porte les décisions, `PilotagePage` porte la mise en page. Chacune
 * répond à une question posée par la recette live du 30/08/2026 sur `/pilotage`.
 */

/**
 * UN POURCENTAGE QUI NE MENT PAS SUR ZÉRO — ni sur cent.
 *
 * ⚠️ Le défaut mesuré : « Taux de correction **0 %** » affiché à deux
 * centimètres de « Éléments corrigés **12** », sur la MÊME carte. Douze
 * corrections sur deux mille cinq cents contacts font 0,48 %, et l'arrondi à
 * l'entier écrivait « 0 % ». Les deux chiffres de la carte se contredisaient, et
 * le lecteur ne pouvait pas savoir lequel croire.
 *
 * « 0 % » est une AFFIRMATION : elle dit « rien, pas une seule fois ». Elle est
 * réservée au taux réellement nul — « 0 réponse sur 300 emails », qui est
 * exactement le décrochage que la chaîne existe pour crier. Un taux non nul qui
 * s'arrondit à zéro s'écrit « < 1 % ».
 *
 * Le refus symétrique vaut aussi, pour la même raison : un taux de 99,7 % écrit
 * « 100 % » promet une exhaustivité que personne n'a mesurée.
 *
 * Le `t` est passé en paramètre plutôt que lu ici : l'espace insécable devant le
 * `%` est une règle typographique française que l'anglais n'a pas — c'est la
 * traduction qui colle l'unité au nombre, comme pour les cibles chiffrées
 * (`kpi-target-format.ts`).
 */
export function formatRate(value: number, t: (key: string, options?: Record<string, unknown>) => string): string {
  const percent = Math.round(value * 100)
  if (percent === 0 && value > 0) return t('rate.belowOne')
  if (percent === 100 && value < 1) return t('rate.aboveNinetyNine')
  return t('rate.exact', { value: percent })
}

/**
 * LA COULEUR D'UNE VALEUR — décidée sur la VALEUR, jamais sur le seul statut.
 *
 * ⚠️ Le défaut mesuré : la carte Expansion affichait « Clients actifs **0** » en
 * gris de « non mesuré », avec l'icône de « non mesuré ». Or ce zéro a été LU —
 * `COUNT(*) FILTER (WHERE commercial_status = 'customer')` sur les comptes de
 * l'espace — et il est VRAI. La carte se contredisait avec elle-même : elle
 * montrait un chiffre en disant qu'elle n'en avait pas.
 *
 * La cause est nommée dans le contrat lui-même : « `non_mesure` dit moins que ce
 * qu'il promet ». Le statut est une COULEUR (au-dessus du seuil, sous le seuil,
 * rien à juger) ; ce qui dit si la donnée est CAPTÉE, c'est `value`, et elle
 * seule. Un stock à zéro n'a rien à juger — donc pas de vert, pas de rouge — et
 * il reste parfaitement mesuré.
 */
export function metricTone(metric: Pick<PilotageMetric, 'value' | 'status'>): 'unknown' | 'alert' | 'measured' {
  if (metric.value === null) return 'unknown'
  return metric.status === 'alerte' ? 'alert' : 'measured'
}

/**
 * CE QU'UN MAILLON A À DIRE — quatre états, pas trois.
 *
 * Le contrat n'en porte que trois (`ok` / `alerte` / `non_mesure`) et il ne peut
 * pas en porter davantage : une valeur d'énumération ne s'ajoute pas au milieu
 * (GA-08), et surtout `non_mesure` recouvre honnêtement DEUX situations que le
 * calcul n'a pas besoin de distinguer — il n'a rien à juger dans les deux cas.
 *
 * L'ÉCRAN, lui, en a besoin, parce que les deux appellent des gestes opposés :
 *  - « non lu » demande d'aller chercher la donnée (brancher, réessayer) ;
 *  - « rien à juger » ne demande rien : l'espace est lu, et il est vide ici.
 *
 * Rendus du même gris et de la même icône, les deux se confondent — et
 * l'utilisateur cesse de faire la différence. C'est exactement ce que fait déjà
 * `UnknownValue` avec « jamais su » et « périmé ».
 */
export function levelReading(
  level: Pick<PilotageLevelReport, 'status' | 'metrics'>,
): 'ok' | 'alerte' | 'nothingToJudge' | 'unread' {
  if (level.status !== 'non_mesure') return level.status
  return level.metrics.some(metric => metric.value !== null) ? 'nothingToJudge' : 'unread'
}
