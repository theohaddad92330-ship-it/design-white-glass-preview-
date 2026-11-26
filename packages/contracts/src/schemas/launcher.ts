import type { CreditedAction } from '../billing/credit-weights.js'
import { creditCostOf } from '../billing/credit-weights.js'
import type { PlanFeatureKey } from './plan-features.js'

/**
 * Le lanceur — la porte unique vers ce que Bellum sait faire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX VOIES, ET CE QUI LES SÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 * Le produit avait deux entrées concurrentes : le bouton « Nouvelle analyse »,
 * qui ne savait faire qu'UNE chose sur UN objet, et Laura, qui sait router une
 * intention mais ne produit pas de livrable. Entre les deux, cinq runs réels
 * (enrichissement, matching, plan d'attaque, réécriture de CV, photo de
 * territoire) ne vivaient que dans l'écran qui les héberge — donc introuvables
 * si on ne savait pas déjà où ils étaient.
 *
 * Le lanceur les réunit **sans créer un second routeur d'intention**, ce que le
 * dépôt s'interdit partout ailleurs (« un réglage vit à un seul endroit ») :
 *
 * - **voie `run`** — on CHOISIT un type. Coût annoncé avant le clic, livrable
 *   persisté, débit réel. Elle n'est jamais atteinte par accident.
 * - **voie `laura`** — on tape sans choisir. Gratuite, bornée par le plafond
 *   quotidien, n'écrit rien. C'est le DÉFAUT, et c'est délibéré : le chemin sur
 *   lequel on tombe sans réfléchir doit être celui qui ne peut pas coûter un
 *   crédit.
 *
 * Ce choix retourne le pire défaut d'une boîte universelle. Sans voie Laura,
 * une frappe hors catalogue rend « je ne sais pas faire ça » ; la deuxième fois,
 * on n'ouvre plus la boîte. Avec elle, **aucune frappe ne mène nulle part**.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE LANCEUR N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * **Il n'exécute rien.** Il navigue vers l'objet avec le run ARMÉ, et c'est la
 * confirmation déjà présente sur l'écran de destination qui débite. Trois
 * raisons, dans l'ordre d'importance : aucun second chemin d'écriture, aucun
 * risque de double débit, et le prix affiché ici ne peut pas diverger de celui
 * qui sera prélevé puisque les deux appellent {@link creditCostOf}.
 *
 * C'est le même arbitrage que `?ask=` pour Laura : le lanceur ne rend pas la
 * conversation, il l'OUVRE — un seul fil, une seule mémoire, un seul plafond.
 */

/**
 * ⚠️ LE CHOIX DE LA VOIE NE VIT PAS ICI, ET C'EST DÉLIBÉRÉ.
 *
 * Ce fichier a porté un `laneFor(typeKey)` — « un type ⇒ `run`, sinon `laura` »
 * — que personne n'a jamais appelé. La voie se décide dans
 * `apps/web/src/features/launcher/launcher-intent.ts`, et cette version-là en
 * sait TROIS de plus : une clé de type inconnue (lien collé, état abîmé)
 * retombe sur `laura` quand `laneFor` disait `run` ; un type sans run retombe
 * aussi ; et une saisie vide n'est ni l'une ni l'autre, elle est `idle`.
 *
 * Le remettre ici redonnerait deux dérivations du même choix, dont la plus
 * pauvre serait la plus facile à appeler — ce que GA-26 interdit. Le catalogue
 * (les types, leurs runs, leur coût) reste ici ; la décision reste là-bas.
 */

export type LauncherTypeKey = 'account' | 'contact' | 'need' | 'talent'

/**
 * L'ordre des chips, figé.
 *
 * Même raison que GA-08 pour les énumérations : l'ordre est une décision
 * d'interface — le compte d'abord parce qu'il porte l'écrasante majorité des
 * lancements — et un tri qui bougerait d'un rendu à l'autre déplacerait la
 * cible sous le curseur de quelqu'un qui vise déjà.
 */
export const LAUNCHER_TYPE_ORDER: readonly LauncherTypeKey[] = ['account', 'contact', 'need', 'talent']

export type LauncherRun = {
  /** Clé stable — elle voyage dans l'URL et dans les tests. */
  key: string
  /**
   * Clé i18n du libellé, dans l'espace de noms `launcher`. Le catalogue ne
   * porte JAMAIS de texte affichable — et jamais de `:` non plus, qui vaut
   * « espace de noms » chez i18next et ferait chercher la clé ailleurs.
   */
  labelKey: string
  /**
   * Clé i18n d'une phrase courte qui dit ce que le clic va DEMANDER, sous le
   * bouton de la liste. `undefined` quand le libellé se suffit.
   *
   * #1414 — « Analyser une entreprise » nomme le travail sans dire ce qu'il
   * attend de toi. La phrase le dit (« choisis une entreprise, Bellum lance son
   * analyse commerciale ») et lève surtout la confusion que le retour nomme
   * lui-même : analyser, c'est une entreprise que TU connais ; découvrir, c'est
   * Bellum qui t'en propose. Elle vit au catalogue et non dans l'écran, comme
   * le libellé : cinq listes montent le même bouton.
   */
  hintKey?: string
  /**
   * L'action facturée. Le catalogue porte l'ACTION, jamais le prix : c'est ce
   * qui garantit que la barre de lancement et le panneau de confirmation
   * annoncent le même chiffre. Le produit a déjà payé l'inverse — un écran
   * annonçait 1 crédit et 8 partaient.
   */
  action: CreditedAction
  /**
   * Le débit n'a lieu QUE si le run trouve quelque chose.
   *
   * C'est la garantie de l'enrichissement (« 0 résultat = 0 débit »), annoncée
   * sur la carte avant le clic depuis le premier jour. Un lanceur qui afficherait
   * « 1 crédit » sec la reprendrait en silence.
   */
  billedOnSuccessOnly: boolean
  /** La destination, où le run est armé et où la confirmation existe déjà. */
  to: string
  /**
   * Le paramètre d'URL qui porte le texte tapé jusqu'à la destination, ou
   * `null` quand ce run ne se cherche pas au clavier.
   *
   * `null` n'est pas un oubli, c'est une réponse : un run qui se choisirait
   * dans une liste fermée (jamais taper un libellé qu'aucun résolveur ne
   * connaît) retire alors le champ de saisie plutôt que d'accepter une frappe
   * qu'il jettera — c'est la même règle que le catalogue des raccourcis : ne
   * rien montrer qui ne fasse rien. Aucun run n'est dans ce cas aujourd'hui
   * (le dernier, `territory`, a quitté le catalogue le 23/09/2026 — #2149.27).
   */
  queryParam: string | null
  /**
   * #2428.14 — clé i18n (espace `launcher`) d'une durée ESTIMÉE, à annoncer
   * à côté du coût avant le clic. `undefined` sur un run dont la durée n'est
   * pas mesurée : `RunDuration` (`ComposerLauncher.tsx`) affiche alors
   * `duration.unknown` (« non mesurée ») plutôt que d'inventer un chiffre —
   * même discipline que `enrichment-duration-text.ts` (#2120.57/#2297.23),
   * qui refuse déjà un « 0 » ou une estimation devinée.
   */
  durationKey?: string
}

export type LauncherType = {
  key: LauncherTypeKey
  /**
   * ⚠️ Ce type ne porte PLUS de `labelKey`, et c'est une décision.
   *
   * Les cinq entrées se nommaient par leur OBJET — « Compte », « Contact » —
   * dans une rangée « ⚡ Lancer : » sous la saisie. Elles ont rejoint la rangée
   * d'exemples le 29/08/2026, où elles se nomment par le TRAVAIL dominant
   * (« Analyser une entreprise ») : c'est `runs[0].labelKey` qui l'écrit, et
   * c'est aussi le run que le clic arme. Un `labelKey` de type que plus aucun
   * écran ne rend serait exactement le défaut n°1 du dépôt — du texte juste,
   * traduit, que personne n'appelle.
   */
  /**
   * Ce type accepte-t-il un nom qu'on n'a PAS encore en base ?
   *
   * Le compte, oui : analyser une entreprise jamais ouverte est le geste
   * fondateur du produit. Les quatre autres, non — on n'enrichit pas un contact
   * qui n'existe pas, on ne matche pas un besoin qui n'est pas saisi. Prétendre
   * le contraire rendrait « aucun résultat » là où la vraie réponse est « cet
   * objet n'existe pas encore », et les deux appellent des gestes opposés.
   */
  acceptsUnknown: boolean
  /**
   * Le palier qui ouvre ce type, `null` quand il est inclus partout.
   *
   * Un chip qui mène à un écran verrouillé est pire qu'un chip absent : la
   * première fois on croit s'être trompé, la deuxième on cesse d'ouvrir le
   * lanceur. C'est la règle que le catalogue des raccourcis applique déjà.
   */
  feature: PlanFeatureKey | null
  runs: readonly LauncherRun[]
}

export const LAUNCHER_TYPES: readonly LauncherType[] = [
  {
    key: 'account',
    acceptsUnknown: true,
    feature: null,
    runs: [
      {
        key: 'account.analysis',
        labelKey: 'run.accountAnalysis',
        hintKey: 'run.accountAnalysisHint',
        action: 'account_analysis',
        billedOnSuccessOnly: false,
        to: '/search',
        queryParam: 'company',
        // #2428.14 — même estimation que `search.composer.estimatedDuration`
        // (l'écran de destination) : un seul chiffre, jamais deux qui divergent.
        durationKey: 'duration.accountAnalysis',
      },
      {
        key: 'account.refresh',
        labelKey: 'run.accountRefresh',
        action: 'account_refresh',
        billedOnSuccessOnly: false,
        to: '/accounts',
        queryParam: 'q',
      },
    ],
  },
  {
    key: 'contact',
    acceptsUnknown: false,
    feature: null,
    runs: [
      {
        key: 'contact.enrich',
        labelKey: 'run.contactEnrich',
        action: 'contact_enrichment',
        billedOnSuccessOnly: true,
        to: '/contacts',
        queryParam: 'q',
      },
    ],
  },
  {
    key: 'need',
    acceptsUnknown: false,
    feature: 'needs',
    runs: [
      {
        key: 'need.match',
        labelKey: 'run.needMatch',
        action: 'need_matching',
        billedOnSuccessOnly: false,
        to: '/projects/needs',
        queryParam: 'q',
      },
      {
        key: 'need.play',
        labelKey: 'run.needPlay',
        action: 'need_play',
        billedOnSuccessOnly: false,
        to: '/projects/needs',
        queryParam: 'q',
      },
    ],
  },
  {
    key: 'talent',
    acceptsUnknown: false,
    feature: 'talent_pool',
    runs: [
      {
        key: 'talent.cvRewrite',
        labelKey: 'run.talentCvRewrite',
        action: 'cv_rewrite',
        billedOnSuccessOnly: false,
        to: '/consultants',
        queryParam: 'q',
      },
    ],
  },
]
// #2149.27 — le type `territory` a été RETIRÉ d'ici le 23/09/2026 : son run
// pointait sur `/discover/territoire`, une route absente du disque depuis le
// 10/09 (#1796.2 — le bouton et le panneau qu'il ouvrait avaient quitté
// Découvrir le 16/09/2026, décision Louis, #2486, commit 04b8c8fb4, « inutile
// avec tous les filtres » — cette entrée-ci avait survécu à ce nettoyage).
// Corrigé plus tôt le même jour pour pointer sur `/discover`, il ne restait
// plus qu'un chip qui ouvrait Découvrir SANS aucun critère — rigoureusement
// ce que l'utilisateur obtient en n'ouvrant AUCUN type. Un lanceur qui
// promet un écran qui n'existe pas est pire qu'un lanceur absent (doctrine
// GA-38, garde GA-87). Reconstruire une 5e sortie « Territoires et
// écosystèmes » (recette 23/09, RÉFUTÉ #2149.27) rouvrirait la décision de
// Louis du 16/09/2026 — pas rejouée ici.

/** Le type portant cette clé, ou `undefined` — une clé venue d'une URL n'est pas fiable. */
export function launcherTypeOf(key: LauncherTypeKey): LauncherType | undefined {
  return LAUNCHER_TYPES.find(type => type.key === key)
}

/** Les runs de ce type. Rend `[]` sur une clé inconnue plutôt que de lever. */
export function runsOfType(key: LauncherTypeKey): readonly LauncherRun[] {
  return launcherTypeOf(key)?.runs ?? []
}

/**
 * Ce que ce run coûtera, en crédits.
 *
 * Un seul chemin vers le prix, et il traverse {@link creditCostOf}. Le jour où
 * un poids change, il change ici aussi — sans quoi le lanceur annoncerait
 * l'ancien tarif jusqu'à ce que quelqu'un s'en aperçoive sur une facture.
 */
export function launcherRunCost(run: LauncherRun): number {
  return creditCostOf(run.action)
}
