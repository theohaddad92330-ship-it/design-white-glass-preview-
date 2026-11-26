/**
 * #4016.L10.c — « UN SIGNAL ISOLÉ SUFFIT POUR CHAUD ».
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ (décision Louis 11/10/2026, épopée #4016 lot L10 : « un
 * signal isolé suffit pour « chaud » » ; codé par le lot E6 du 13/10/2026).
 *
 * Avant : GA-262 (#1573.5 / #1574.1 / #1637) — « la mémoire marché AUGMENTE un
 * potentiel, elle ne FABRIQUE jamais une urgence » : la présence marché ne
 * jouait qu'en DÉPARTAGE, après la clé d'urgence de chaque tri du cockpit. Et
 * c36 : « un signal isolé reste à vérifier ; trois signaux convergents font une
 * hypothèse confirmée ».
 *
 * Maintenant : UN seul signal fait un compte « chaud » — un signal récent réel,
 * OU la présence du compte dans la mémoire marché. Le tri d'un bloc du cockpit
 * place d'abord les comptes chauds, puis départage par sa clé d'urgence propre
 * (un signal récent reste devant à chaleur égale).
 *
 * Ce qui NE bouge PAS :
 *  - le rang est une PRÉSENCE, jamais un volume : trier sur le nombre de
 *    parcours ferait remonter les grandes entreprises (refus GA-257) ;
 *  - une observation marché n'est jamais comptée comme un « nouveau signal »
 *    (`new_signals_7d`, #1573.7) : chaude, oui ; signal daté, non ;
 *  - rien ne part tout seul : « chaud » ORDONNE, il n'envoie rien et n'invente
 *    aucune date (le CTA d'une opportunité endormie reste décidé par son signal
 *    neuf).
 *
 * Le plancher vit ICI, à un seul endroit (GA-26).
 */
export const MARKET_HEAT_MIN_SIGNALS = 1

/**
 * `1` = chaud, `0` = froid. `marketPaths` non nul = le compte est couvert par la
 * mémoire marché (le service qui la lit applique déjà son seuil de couverture) ;
 * `null`/`undefined` = pas couvert, ou lecture absente — les deux valent froid.
 */
export function marketHeatRank(input: { recentSignal: boolean; marketPaths: number | null | undefined }): 0 | 1 {
  const signals = Number(input.recentSignal) + (input.marketPaths != null ? 1 : 0)
  return signals >= MARKET_HEAT_MIN_SIGNALS ? 1 : 0
}
