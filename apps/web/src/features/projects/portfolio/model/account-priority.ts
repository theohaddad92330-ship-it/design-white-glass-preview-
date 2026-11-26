import { isNeedKind, needStage, type AccountNeeds } from './needs'

/**
 * L'ACTION PRIORITAIRE D'UNE CARTE COMPTE — #1331 (6/7), #1330 (4/7).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ISSUE DEMANDE
 * ─────────────────────────────────────────────────────────────────────────────
 * « La page doit moins être une liste et plus un outil de décision. Aujourd'hui,
 * on voit des informations, mais on ne sait pas quoi faire. Chaque carte compte
 * devrait faire ressortir **une action prioritaire unique**. »
 *
 * Et quatre exemples : « 2 besoins confirmés à traiter » · « 7 opportunités à
 * qualifier » · « 1 signal urgent à creuser » · « Aucune offre encore
 * rapprochée ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST LU — rien de neuf, rien d'inventé
 * ─────────────────────────────────────────────────────────────────────────────
 * La NATURE de chaque entrée, qui porte déjà sa position sur la chaîne de preuve
 * (`needStage`), et les offres ESN que l'analyse a rattachées (`entry.offers`).
 * Aucun appel, aucun score, aucune probabilité — c'est un tri, pas un pronostic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'OFFRE MANQUANTE N'EST PAS UNE CINQUIÈME LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois premiers exemples parlent de ce que le CLIENT a montré ; le
 * quatrième parle de ce que NOUS n'avons pas fait. Ce sont deux axes, pas quatre
 * valeurs d'un même axe — les mettre en concurrence obligerait à décider si
 * « aucune offre rapprochée » passe avant « 2 besoins confirmés », et les deux
 * réponses sont défendables, ce qui est le signe qu'on compare deux choses
 * différentes.
 *
 * L'action garde donc **une seule ligne** — la demande de l'issue — mais elle
 * porte les deux axes : le geste, et le fait qu'on n'ait encore rien à mettre en
 * face. `unmatched` le dit ; la vue le rend en second plan. C'est reformulé, et
 * c'est écrit dans le fil.
 *
 * ⚠️ Une seule ligne veut dire un seul GESTE, jamais un compteur par nature :
 * une carte qui empile « 2 confirmés · 7 à qualifier · 4 signaux » redonne à
 * l'utilisateur exactement le travail de tri qu'on lui enlève.
 */
type AccountPriority = {
  /** Le geste, déduit de la matière la plus engageante que porte le compte. */
  kind: 'confirmed' | 'toQualify' | 'signal'
  /** Combien d'entrées le justifient — jamais le total du compte. */
  count: number
  /** Aucune offre ESN rattachée : on sait quoi faire, pas encore quoi vendre. */
  unmatched: boolean
}

/**
 * Le geste du compte, ou `null` s'il n'y a rien à dire.
 *
 * ⚠️ `null` est atteignable et n'est pas du code mort : `buildAccountNeeds`
 * n'écarte que les comptes SANS AUCUNE entrée, et une entrée peut être une
 * nature hors nomenclature. Rendre alors une ligne par défaut afficherait un
 * geste que rien ne fonde.
 */
export function accountPriority(entry: Pick<AccountNeeds, 'needs' | 'offers'>): AccountPriority | null {
  const confirmed = entry.needs.filter(need => isNeedKind(need.kind) && needStage(need.kind) === 'confirmed')
  const toQualify = entry.needs.filter(
    need => isNeedKind(need.kind) && (needStage(need.kind) === 'qualified' || needStage(need.kind) === 'plausible'),
  )
  const signals = entry.needs.filter(need => need.kind === 'signal')
  const unmatched = entry.offers.length === 0

  // L'ordre est celui de la force de preuve, pas celui du volume. Sept
  // déductions ne passent pas avant une demande que quelqu'un a formulée — c'est
  // la même règle que le tri des besoins dans la carte, et l'inverse de ce que
  // ferait un classement par nombre.
  if (confirmed.length > 0) return { kind: 'confirmed', count: confirmed.length, unmatched }
  if (toQualify.length > 0) return { kind: 'toQualify', count: toQualify.length, unmatched }
  if (signals.length > 0) return { kind: 'signal', count: signals.length, unmatched }
  return null
}
