import { OPEN_PIPELINE_STAGES } from '@bellum/contracts'
import type { PipelineColumn, PipelineSummary } from '@bellum/contracts'

/**
 * CE QUE LE TOTAL DU PIPE A LE DROIT DE DIRE — une dérivation, tous les écrans.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette en production le 28/08/2026. L'espace portait UN projet au pipe, sans
 * montant saisi. Sur cette donnée, à deux clics d'écart :
 *
 *  · `/briefing` écrivait « 0 € » en gros — `formatCents(totalCents ?? 0)` ;
 *  · `/projects` écrivait « non mesuré — aucun montant saisi sur 1 projet au
 *    pipe ».
 *
 * Deux écrans du même produit, la même réponse, deux verdicts opposés. Et le
 * plus instructif : le cockpit avait la règle ÉCRITE deux lignes plus bas — « pas
 * de `?? 0` : "0 affaire sans montant" est une AFFIRMATION » — appliquée au
 * compteur d'à côté, pas à lui-même. Ce n'est pas un oubli, c'est ce qui arrive
 * quand la même question se retranche à deux endroits : les réponses divergent,
 * et chacune reste défendable chez elle.
 *
 * La dérivation vit donc ici, et les écrans la LISENT. Les barres du cockpit
 * empruntent déjà le même chemin pour la question voisine, une colonne à la fois
 * (`columnAmountCents`, `features/briefing/cockpit.ts`) : ce module est la même
 * règle, appliquée au TOTAL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CAS, PARCE QUE LA SOURCE EN DISTINGUE TROIS
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `empty` — rien au pipe. Zéro affaire fait bien zéro euro : c'est une
 *    MESURE, pas une absence, et crier « non mesuré » enverrait chercher une
 *    panne là où il n'y a simplement rien.
 *  · `unmeasured` — des affaires, aucune chiffrée. Le total n'est pas nul, il
 *    n'a jamais été mesuré ; « 0 € » se lit « il n'y a rien à vendre ».
 *  · `measured` — au moins une chiffrée. Le montant est un PLANCHER dès que
 *    `withoutAmount > 0`, et c'est le compteur d'à côté qui le dit.
 *
 * ⚠️ Ce module ne recompte RIEN. Les totaux viennent du serveur, qui les dérive
 * de ses lignes (`pipelineSummary()` dans `packages/contracts`) ; les recalculer
 * depuis `columns` ferait un troisième chemin, c'est-à-dire le défaut qu'on
 * corrige.
 */
type PipelineTotal =
  | { kind: 'empty' }
  /** `count` vaut `null` quand la réponse ne porte pas les champs : on ne sait
   *  même pas COMBIEN d'affaires manquent, donc on n'en affirme aucune. */
  | { kind: 'unmeasured'; count: number | null }
  /** `count` voyage AVEC le verdict, il ne se relit pas dans le résumé. Un
   *  appelant qui écrivait `summary.total_count` devait le protéger d'un `?? 0`
   *  que TypeScript exige et que GA-19 refuse — alors qu'un total MESURÉ a, par
   *  construction, un compte fini : c'est la condition même de son verdict. */
  | { kind: 'measured'; count: number; amountCents: number; withoutAmount: number }

/**
 * Le verdict du total, depuis le résumé rendu par le serveur.
 *
 * ⚠️ L'entrée est PARTIELLE à dessein : `usePipeline` fait un `apiFetch` typé
 * sans valider par un schéma, donc un champ peut manquer à l'exécution alors
 * que TypeScript le croit présent. Une réponse muette n'affirme rien — ni un
 * total, ni un compte d'affaires non chiffrées.
 */
export function pipelineTotal(
  summary:
    Partial<Pick<PipelineSummary, 'total_count' | 'total_amount_cents' | 'total_without_amount'>> | null | undefined,
): PipelineTotal {
  const count = finite(summary?.total_count)
  const amountCents = finite(summary?.total_amount_cents)
  const withoutAmount = finite(summary?.total_without_amount)

  if (count === null || amountCents === null || withoutAmount === null) return { kind: 'unmeasured', count: null }
  if (count === 0) return { kind: 'empty' }
  // `>=` et non `===` : une source incohérente (plus de non chiffrées que
  // d'affaires) ne doit pas retomber sur un montant fabriqué.
  if (withoutAmount >= count) return { kind: 'unmeasured', count }
  return { kind: 'measured', count, amountCents, withoutAmount }
}

/**
 * Le verdict du SIGNÉ — la même dérivation, appliquée à l'autre statut.
 *
 * ⚠️ Elle délègue à {@link pipelineTotal} au lieu de refaire les trois cas. Le
 * signé pose exactement la même question (« ce total est-il mesuré ? ») sur
 * exactement les mêmes trois champs ; la retrancher ici produirait la seconde
 * vérité que ce module existe pour empêcher.
 *
 * Elle existe parce que le total du pipe n'a plus le droit d'additionner le
 * signé (29/08/2026, `pipelineSummary`) : une affaire gagnée et une affaire en
 * négociation ne se somment pas. Le signé n'a pas disparu pour autant — il est
 * NOMMÉ, à côté, avec son propre verdict.
 */
export function signedTotal(
  summary:
    Partial<Pick<PipelineSummary, 'signed_count' | 'signed_amount_cents' | 'signed_without_amount'>> | null | undefined,
): PipelineTotal {
  return pipelineTotal({
    total_count: summary?.signed_count,
    total_amount_cents: summary?.signed_amount_cents,
    total_without_amount: summary?.signed_without_amount,
  })
}

/** Un nombre, ou rien. `NaN` et `Infinity` ne sont pas des montants. */
function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Le montant d'une colonne du pipe — ou son absence NOMMÉE.
 *
 * ⚠️ Cette fonction vivait dans `features/briefing/cockpit.ts`, et `/projets`
 * en avait une COPIE de tête : `column.amount_cents > 0 ? … : « Aucun montant
 * saisi »`. Sur une colonne VIDE les deux écrans se contredisaient donc — le
 * cockpit écrivait « 0 € » (vrai : la somme d'un ensemble vide vaut zéro) et
 * le pipe « Aucun montant saisi » (faux : il affirme des affaires dont
 * personne n'a saisi le montant). Mesuré en ligne le 28/08/2026, sur la même
 * donnée, deux verdicts. Une dérivation vit à UN SEUL endroit (GA-26).
 *
 * Trois situations, et une seule où zéro est VRAI. C'est exactement le
 * raisonnement que `MissionScoresService.line` tient déjà sur le prévisionnel,
 * appliqué ici parce que la colonne le posait autrement : `amount_cents` vaut
 * `0` aussi bien pour une colonne vide que pour une colonne de six affaires
 * dont aucune n'est chiffrée, et « Négociation · 0 € » se lit alors « on
 * négocie pour rien ».
 *
 *  - AUCUNE affaire : `0`, et c'est vrai — une colonne vide vaut bien zéro ;
 *  - des affaires, aucune chiffrée : `null`, et la barre dit combien ;
 *  - au moins une chiffrée : le montant, et il est un PLANCHER si d'autres ne
 *    le sont pas.
 */
export function columnAmountCents(
  column: Pick<PipelineColumn, 'count' | 'amount_cents' | 'without_amount'>,
): number | null {
  if (column.count === 0) return 0
  if (column.without_amount >= column.count) return null
  return column.amount_cents
}

/**
 * COMBIEN DE PROJETS N'ONT AUCUNE PROCHAINE ACTION — #1324, la 3ᵉ carte.
 *
 * « 3. Sans prochaine action — **valeur réelle**. » Le mot est de l'issue, et
 * il vise juste : le chiffre existait déjà, colonne par colonne
 * (`without_next_action`, #1325 3/9.1), et aucun écran n'en portait le total.
 *
 * ⚠️ Elle somme les colonnes ENCORE EN JEU, pas `columns`. C'est la règle
 * qu'applique déjà `pipelineSummary()` pour le montant, et pour la même raison :
 * une affaire gagnée n'a pas besoin de prochaine action, la compter ici
 * fabriquerait une dette qui n'existe pas. Une affaire perdue ou dormante n'est
 * dans aucune colonne, la question ne se pose donc pas pour elle.
 *
 * ⚠️ Et elle rend un VERDICT, pas un nombre nu. Un résumé sans colonnes — une
 * réponse abîmée, une API antérieure — donnerait `0` par réduction d'un tableau
 * vide, c'est-à-dire « tous tes projets ont une prochaine action » : la plus
 * rassurante des phrases fausses. `unmeasured` dit qu'on ne sait pas.
 *
 * Le `total` voyage AVEC le compte : la carte écrit « 4 sur 12 au pipe », et
 * relire `summary.total_count` à côté serait la seconde lecture qui finit par
 * diverger.
 */
type PipelineNextActionGap = { kind: 'unmeasured' } | { kind: 'measured'; count: number; total: number }

export function pipelineWithoutNextAction(
  summary: Partial<Pick<PipelineSummary, 'columns'>> | null | undefined,
): PipelineNextActionGap {
  const columns = summary?.columns
  if (!Array.isArray(columns) || columns.length === 0) return { kind: 'unmeasured' }
  let count = 0
  let total = 0
  for (const column of columns) {
    if (!(OPEN_PIPELINE_STAGES as readonly string[]).includes(column.stage)) continue
    const gap = finite(column.without_next_action)
    const size = finite(column.count)
    // Une colonne dont l'un des deux chiffres manque rend le TOTAL inconnu :
    // additionner ce qui reste donnerait un compte plus petit que la réalité,
    // présenté comme un fait.
    if (gap === null || size === null) return { kind: 'unmeasured' }
    count += gap
    total += size
  }
  return { kind: 'measured', count, total }
}

/**
 * #4193.2 — le compte de TÊTE de /projects : les affaires ACTIVES (celles du Kanban, `OPEN_PIPELINE_STAGES`), les
 * gagnées nommées À PART. Avant : 23 en tête (gagnées comprises) pour 19 en colonnes. Garde #4291.8 (le gagné a
 * quitté le Kanban) ; revient sur « Gagnée comprise » de #4499.
 */
export function activeAndWonCounts(projects: readonly { stage: string }[]): { active: number; won: number } {
  const won = projects.filter(project => project.stage === 'won').length
  return { active: projects.length - won, won }
}
