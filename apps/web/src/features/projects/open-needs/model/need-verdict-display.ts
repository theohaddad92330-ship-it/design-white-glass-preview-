import type { NeedVerdictAxisResult, NeedVerdictKind } from '@bellum/contracts'

/**
 * CE QUE L'ÉCRAN AFFICHE D'UN AXE — et rien de ce qu'il DÉCIDE.
 *
 * La décision entière vit au contrat (`need-verdict.ts`). Ce fichier ne fait
 * que choisir la clé de traduction et les paramètres à lui passer, ce qui est
 * une dérivation à part entière et mérite donc ses tests : c'est ici qu'un
 * `?? 0` transformerait « non renseigné » en « 0 profil ».
 *
 * ⚠️ Aucune phrase française n'est écrite ici. Le contrat rend des CLÉS et des
 * NOMBRES ; le français vit dans `projects.json`, FR et EN à parité. Composer la
 * phrase ici la rendrait invisible à la garde de parité.
 */

/** La tonalité d'un état — trois valeurs, et l'absence n'en est pas une. */
type NeedVerdictTone = 'success' | 'warning' | 'danger' | 'unknown'

export function needVerdictAxisTone(axis: NeedVerdictAxisResult): NeedVerdictTone {
  if (axis.state === null) return 'unknown'
  if (axis.state === 'positive') return 'success'
  return axis.state === 'attention' ? 'warning' : 'danger'
}

/**
 * La tonalité du VERDICT lui-même.
 *
 * ⚠️ `insufficient_data` n'est PAS un « non » gris-rouge : c'est une question
 * ouverte, et elle se lit en neutre. Lui donner la couleur du refus ferait
 * abandonner des besoins qu'on n'a simplement pas encore regardés.
 */
export function needVerdictTone(verdict: NeedVerdictKind): NeedVerdictTone {
  if (verdict === 'go') return 'success'
  return verdict === 'no_go' ? 'danger' : 'unknown'
}

/**
 * Ce qu'un axe AFFICHE : soit une valeur mesurée, soit la raison de son
 * absence. Jamais les deux, jamais ni l'un ni l'autre.
 *
 * Les clés sont dérivées de l'axe et de son état — `staffing_capacity` mesuré
 * rend `verdictAxis.value.staffing_capacity`, non renseigné rend
 * `verdictAxis.unmeasured.noRun`. Deux espaces de noms distincts : une raison
 * d'absence n'est pas une valeur, et les mélanger ferait afficher « 3 profils »
 * là où il n'y en a aucun de connu.
 */
type NeedVerdictAxisDisplay =
  | { measured: true; key: string; params?: NeedVerdictAxisParams }
  | { measured: false; key: string }

/**
 * Les paramètres passés à la traduction.
 *
 * `count` porte le pluriel d'i18next — c'est LE nom qu'il attend, et le lui
 * refuser ferait dire « 1 profils ». `targetRateCents` / `startOn` restent
 * BRUTS : les mettre en forme ici figerait la locale dans un modèle pur, alors
 * que `formatCents` et `formatDate` la lisent au moment du rendu.
 */
type NeedVerdictAxisParams = {
  count?: number
  threshold?: number
  targetRateCents?: number
  floorRateCents?: number
  startOn?: string
}

export function needVerdictAxisDisplay(axis: NeedVerdictAxisResult): NeedVerdictAxisDisplay {
  // ⚠️ On se fie à `measured`, pas à `state` : les deux sont solidaires au
  // contrat, mais c'est `measured` qui porte les nombres, et lire l'un pour
  // afficher l'autre est exactement la jointure qui dérive avec le temps.
  const measured = axis.measured
  if (measured === null) {
    return { measured: false, key: `needVerdict.unmeasured.${axis.unmeasured ?? 'unknown'}` }
  }
  const key = (suffix = ''): string => `needVerdict.axisValue.${axis.axis}${suffix}`

  if ('count' in measured) return { measured: true, key: key(), params: measured }
  if ('targetRateCents' in measured) return { measured: true, key: key(), params: measured }
  if ('activeMissions' in measured) return { measured: true, key: key(), params: { count: measured.activeMissions } }
  if ('competitors' in measured) return { measured: true, key: key(), params: { count: measured.competitors } }
  if ('availabilityScore' in measured) return { measured: true, key: key(), params: { startOn: measured.startOn } }
  // #3389.9/.10 — pas de nombre : l'axe dit un fait (achats impliqués ou non,
  // risque déclaré), le détail vit sur la fiche du besoin et de l'affaire.
  if ('procurementInvolved' in measured) {
    return { measured: true, key: key(measured.procurementInvolved ? 'Involved' : 'NotInvolved') }
  }
  if ('riskDeclared' in measured) return { measured: true, key: key() }
  // L'accès, et la seule clé qui change de NOM selon ce qu'on a mesuré :
  // « 4 contacts connus » et « 4 contacts, aucun décideur » ne disent pas la
  // même chose, et c'est la seconde phrase qui mène à un geste.
  // #3389.8 — le verrou du compte, quand un fait frais le dit, ajoute sa propre phrase :
  // `…Locked` (verrouillé), `…SemiOpen`, `…Open` — le décideur manquant garde son suffixe.
  const lockSuffix =
    measured.lock === 'verrouille'
      ? 'Locked'
      : measured.lock === 'semi_ouvert'
        ? 'SemiOpen'
        : measured.lock === 'ouvert'
          ? 'Open'
          : ''
  return {
    measured: true,
    key: key((measured.decisionMaker ? '' : 'NoDecisionMaker') + lockSuffix),
    params: { count: measured.contacts },
  }
}
