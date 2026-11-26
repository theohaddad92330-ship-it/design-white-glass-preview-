/**
 * CE QU'UN CRÉDIT COÛTE VRAIMENT, ACTION PAR ACTION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le modèle d'unit-economics du 18/08/2026 (archive 07, feuille « Coûts
 * unitaires », r20) écrit, mot pour mot :
 *
 *   « Aujourd'hui un enrichissement coûte 0,41 € du crédit contre 0,06 € pour
 *     un export : la grille de crédits ne reflète pas le coût réel, et **c'est
 *     exploitable par les gros consommateurs**. »
 *
 * Le mot « exploitable » est un avertissement, pas une remarque : si un crédit
 * dépensé en enrichissement coûte sept fois un crédit dépensé en export, un
 * client qui n'achète QUE de l'enrichissement est vendu à perte, sans qu'aucun
 * écran ne le dise. L'écart ne se voit pas : il se creuse en silence, et se
 * découvre sur une facture.
 *
 * Ce fichier ne CORRIGE pas la grille — {@link CREDIT_WEIGHTS} est une décision
 * commerciale. Il la MESURE, pour qu'un écart devienne une alerte au lieu d'un
 * rapport qu'on relira dans six mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE REFUSE DE FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * **1. Une ligne non tarifée n'est pas une ligne gratuite.** Un fournisseur sans
 * `PROVIDER_UNIT_COST_*` produit des lignes à coût `null`. Elles sont exclues du
 * total, COMPTÉES à part, et une famille dont TOUTES les lignes sont non
 * tarifées n'a pas un coût de 0 $ : elle n'a pas de coût mesuré du tout.
 *
 * **2. Un crédit dont le coût n'est pas enregistré sort du DÉNOMINATEUR.**
 * Deux chemins débitent sans écrire dans `provider_costs` — voir
 * {@link UNMEASURED_COST_REASONS}. Les compter ferait passer l'enrichissement
 * pour deux fois moins cher qu'il n'est. Même règle que « un axe non évaluable
 * sort du dénominateur, sinon le score mesure la complétude de nos données ».
 *
 * **3. On ne divise pas par zéro crédit.** Le copilote coûte de l'argent réel et
 * débite `0` crédit — c'est une décision produit assumée (« gratuit mais
 * borné »). Son coût par crédit n'est pas infini, il est **non mesurable**, et
 * il est rendu à part dans {@link CreditCostMeasure.uncredited}.
 *
 * **4. Le total ne s'agrège JAMAIS entre espaces.** Cette mesure est GLOBALE à
 * l'exploitant : elle répond à « un crédit vaut-il partout la même chose ? »,
 * jamais à « quel client coûte le plus cher que quel autre ». Les espaces sont
 * des ESN, donc des concurrents (`COMMUNITY_FORBIDDEN_KINDS.cost`, GA-43).
 */

import type { CreditedAction } from './credit-weights.js'

/** Une ligne de `provider_costs`, réduite à ce que la mesure lit. */
export type MeasuredCostRow = {
  /** `analysis` | `enrichment` | `chat` | `need_play` — la fonctionnalité. */
  feature: string
  /** Coût en dollars ; `null` = fournisseur non tarifé. JAMAIS 0 par défaut. */
  costUsd: number | null
}

/** Un mouvement de `credit_ledger`, réduit à ce que la mesure lit. */
export type CreditDebitRow = {
  resource: 'analysis_slot' | 'enrichment_credit'
  /** Signé : négatif = consommé, positif = remboursé ou octroyé. */
  delta: number
  /** Le contexte libre du débit. Deux valeurs y sont déterministes — voir plus bas. */
  reason: string | null
}

/** Un motif de `reason` dont on sait qu'aucune ligne de coût ne l'accompagne. */
type ReasonMatcher = { readonly exact: string } | { readonly prefix: string }

/**
 * Les débits dont le coût n'est enregistré NULLE PART, vérifiés à la source.
 *
 * - `refresh:<dimension>` — `analysis-refresh.service.ts` débite un crédit
 *   d'enrichissement puis n'appelle jamais `ProviderCostService.record` : le
 *   fichier ne contient pas une seule occurrence de `providerCosts`.
 * - `cv_rewrite` — `consultants.controller.ts` débite un crédit d'enrichissement
 *   et n'enregistre aucun coût non plus.
 *
 * Ces crédits sont réels et leur coût aussi ; c'est notre MESURE qui manque.
 * Les laisser au dénominateur diluerait le coût du crédit d'enrichissement —
 * l'erreur irait dans le sens rassurant, exactement comme les quatre postes
 * fixes à 0 € de {@link FIXED_COST_FAMILIES_UNMEASURED}.
 */
const UNMEASURED_COST_REASONS: readonly ReasonMatcher[] = [{ prefix: 'refresh:' }, { exact: 'cv_rewrite' }]

/** Une famille : des fonctionnalités qui coûtent, et le pot de crédits qu'elles vident. */
export type CreditCostFamily = {
  readonly key: string
  readonly label: string
  /** Les valeurs de `provider_costs.feature` rattachées à cette famille. */
  readonly features: readonly string[]
  /** Le compteur de `credit_ledger` que ces fonctionnalités débitent. */
  readonly resource: CreditDebitRow['resource']
  /** Les actions de la grille que cette famille recouvre — pour la lecture humaine. */
  readonly actions: readonly CreditedAction[]
}

/**
 * La carte qui joint les deux registres.
 *
 * Les deux tables ne partagent aucune clé : `provider_costs` connaît la
 * FONCTIONNALITÉ, `credit_ledger` connaît la RESSOURCE débitée. Cette carte est
 * le seul endroit où les deux vocabulaires se rencontrent — la refaire ailleurs
 * garantirait deux vérités (« lire et écrire dans deux tables », cause racine
 * connue du dépôt).
 */
export const CREDIT_COST_FAMILIES: readonly CreditCostFamily[] = [
  {
    key: 'analysis',
    label: 'Analyse de compte',
    features: ['analysis'],
    resource: 'analysis_slot',
    actions: ['account_analysis', 'account_refresh'],
  },
  {
    key: 'enrichment',
    label: 'Enrichissement et plan de besoin',
    // `need_play` débite bien le pot d'enrichissement
    // (`need-play.service.ts` : `consumeEnrichmentCredit({ reason: 'need_play' })`)
    // ET enregistre son coût sous sa propre fonctionnalité.
    features: ['enrichment', 'need_play'],
    resource: 'enrichment_credit',
    actions: ['contact_enrichment', 'need_play'],
  },
]

/**
 * Coût ESTIMÉ (USD) d'UN crédit débité, par famille — l'entrée que la porte de
 * budget PRÉVENTIVE (`checkBudgetGate`, `WorkspaceBudgetService.checkGate`,
 * épopée #2975) attend en `estimatedCostUsd`, calculée AVANT l'action, jamais
 * après. Ce n'EST PAS le coût réel : celui-là s'écrit après coup dans
 * `provider_costs`, au coût mesuré par fournisseur — la seule vérité que lit
 * `checkGate` pour le dépensé déjà fait sur la période. Reprend l'ordre de
 * grandeur DÉJÀ écrit et déjà utilisé pour tarifer les recharges
 * (`CreditsService.TOPUP_PACKS` : coût réel ~0,65 €/run d'analyse, ~0,08 €/
 * unité d'enrichissement) au même chiffre en USD — l'écart EUR/USD n'a pas de
 * sens à ce niveau de précision pour une PORTE, pas pour une facture.
 *
 * Clé = `CreditCostFamily.key` (voir {@link CREDIT_COST_FAMILIES}) : une
 * famille sans entrée ici n'a pas d'estimation, jamais un défaut à 0 $ qui
 * ouvrirait la porte en silence.
 */
export const ACTION_ESTIMATED_COST_USD: Readonly<Record<string, number>> = {
  analysis: 0.65,
  enrichment: 0.08,
}

/**
 * Les fonctionnalités qui coûtent sans débiter un seul crédit.
 *
 * `chat` ↔ `copilot_message`, poids **0** à la grille. Ce zéro-là est une
 * décision produit (arbitrage Louis du 31/07 : « gratuit mais borné » par
 * `CHAT_DAILY_MESSAGE_LIMIT`), pas une absence de coût. L'audit du 24/07 chiffre
 * l'ordre de grandeur : ~87 % de la facture Anthropic venait des fonctions hors
 * analyse, qui ne débitent rien.
 */
export const UNCREDITED_COST_FEATURES: readonly string[] = ['chat']

/**
 * Sous DEUX familles mesurables, il n'y a pas d'écart à mesurer.
 *
 * Même forme que « sous 3 axes, il n'y a pas de score » : un rapport se calcule
 * entre deux grandeurs, et rendre `1` quand une seule est mesurable dirait
 * « tout va bien » là où la bonne réponse est « on ne sait pas ».
 */
export const MIN_FAMILIES_FOR_SPREAD = 2

/**
 * À partir de quel rapport l'écart devient une alerte.
 *
 * **2** : au-delà, un crédit dépensé dans la famille chère coûte plus du double
 * d'un crédit dépensé dans la famille bon marché — un client dont l'usage est
 * concentré sur la première paie donc moins de la moitié de ce qu'il coûte,
 * relativement à un autre. En dessous de 2, l'écart reste dans le bruit d'un mix
 * mensuel et alerter apprendrait à ignorer l'alerte. Repère de la source : le
 * modèle du 18/08 mesurait **6,7×** (0,41 € contre 0,06 € du crédit).
 */
export const CREDIT_COST_SPREAD_ALERT_RATIO = 2

/**
 * À partir de quelle part le coût qui ne débite rien devient une alerte.
 *
 * **50 %** : au-delà, la grille de crédits ne facture plus la majorité de ce
 * qu'on dépense, et le prix d'un crédit ne dit plus rien du coût du service.
 * Repère de la source : l'audit du 24/07 mesurait ~87 %.
 */
export const UNCREDITED_COST_SHARE_ALERT = 0.5

/**
 * LES COÛTS FIXES — CE QUE PERSONNE NE MESURE, ET QUI VAUT DONC « INCONNU ».
 *
 * Le modèle du 18/08 (feuille « Stack fixe », r19-r22, total r27) porte quatre
 * lignes à **0 €** faute de facture, et l'écrit lui-même :
 *
 *   « Facture non fournie : **le zéro est un trou, pas un fait**. »
 *   « Ce total est un plancher : quatre lignes "À VÉRIFIER" y figurent à 0 €. »
 *   « TROU CONNU — le plancher affiché est donc optimiste. » (Cockpit r30)
 *
 * Aucune de ces quatre familles n'a la moindre représentation dans le dépôt :
 * `provider_costs` ne connaît que les fournisseurs facturés À L'APPEL. Tout
 * total de coût produit par ce code est donc **structurellement un plancher**,
 * et c'est la raison pour laquelle cette constante existe : nommer ce qui manque
 * coûte une ligne, le taire coûte une décision prise sur un chiffre faux dans le
 * sens rassurant.
 *
 * ⚠️ Aucune ne porte de MONTANT, et c'est délibéré. Recopier ici les euros d'un
 * tableur du 18/08 fabriquerait une seconde vérité qui se périmerait sans
 * prévenir — la leçon déjà payée par l'en-tête de `credit-weights.ts` : « un
 * miroir juste redevient faux ; un renvoi, jamais. »
 */
export const FIXED_COST_FAMILIES_UNMEASURED: readonly { readonly label: string; readonly reason: string }[] = [
  { label: 'Hébergement et noms de domaine', reason: 'facture non fournie' },
  { label: 'Observabilité', reason: 'plan gratuit ou payant non confirmé' },
  { label: 'Outillage interne', reason: 'plan non confirmé' },
  { label: 'CRM interne', reason: 'plan non confirmé' },
]

/** Ce qu'une famille a coûté, et ce que ce chiffre ne dit pas. */
export type FamilyCreditCost = {
  key: string
  label: string
  /** Somme des lignes TARIFÉES, en dollars. */
  costUsd: number
  /** Lignes sans prix — hors du total, comptées, jamais absorbées comme des zéros. */
  untariffedLines: number
  /** Crédits nets (consommés − remboursés) DONT le coût est mesuré. */
  credits: number
  /** Crédits débités par un chemin qui n'enregistre aucun coût — hors dénominateur. */
  creditsWithoutMeasuredCost: number
  /** Le coût d'un crédit, en dollars. `null` quand il n'est pas mesurable. */
  usdPerCredit: number | null
  /** Pourquoi il ne l'est pas. `null` quand il l'est. */
  unmeasurable: string | null
}

export type CreditCostMeasure = {
  families: FamilyCreditCost[]
  /** Le coût qui ne débite aucun crédit — mesuré, jamais divisé. */
  uncredited: { costUsd: number; untariffedLines: number; features: readonly string[] }
  /** Sa part du coût total mesuré. `null` quand rien n'est mesuré (jamais 0 %). */
  uncreditedShare: number | null
  /** Une fonctionnalité qui écrit dans le registre sans être rattachée à une famille. */
  unmappedFeatures: string[]
  unmappedCostUsd: number
  /** Le rapport entre la famille la plus chère et la moins chère, au crédit. */
  spread: { ratio: number; dearest: string; cheapest: string } | null
  /** Pourquoi il n'y en a pas. `null` quand il y en a un. */
  spreadUnmeasurable: string | null
  /** Vrai dès qu'une ligne ou un crédit échappe à la mesure : le total est un PLANCHER. */
  isFloor: boolean
}

/** Les flottants s'additionnent mal : sans arrondi un total affiche 3.0000000000000004. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function matches(reason: string | null, matcher: ReasonMatcher): boolean {
  if (reason == null) return false
  return 'exact' in matcher ? reason === matcher.exact : reason.startsWith(matcher.prefix)
}

/**
 * Ce qu'un crédit a coûté sur la fenêtre observée, famille par famille.
 *
 * Les deux entrées viennent de deux tables distinctes lues sur LA MÊME fenêtre :
 * `provider_costs` pour le numérateur, `credit_ledger` pour le dénominateur.
 * Rien n'est estimé, rien n'est extrapolé — ce qui n'est pas mesurable est
 * nommé.
 */
export function measureCreditCost(input: {
  costRows: readonly MeasuredCostRow[]
  debitRows: readonly CreditDebitRow[]
}): CreditCostMeasure {
  const byFeature = new Map<string, { costUsd: number; untariffedLines: number }>()
  for (const row of input.costRows) {
    let entry = byFeature.get(row.feature)
    if (!entry) {
      entry = { costUsd: 0, untariffedLines: 0 }
      byFeature.set(row.feature, entry)
    }
    if (row.costUsd == null || !Number.isFinite(row.costUsd)) {
      entry.untariffedLines += 1
      continue
    }
    entry.costUsd += row.costUsd
  }

  const families = CREDIT_COST_FAMILIES.map<FamilyCreditCost>(family => {
    let costUsd = 0
    let untariffedLines = 0
    for (const feature of family.features) {
      const entry = byFeature.get(feature)
      if (!entry) continue
      costUsd += entry.costUsd
      untariffedLines += entry.untariffedLines
    }

    let credits = 0
    let creditsWithoutMeasuredCost = 0
    for (const row of input.debitRows) {
      if (row.resource !== family.resource) continue
      // Le registre porte aussi les octrois et les recharges (`delta > 0` sans
      // débit en face). Seul le NET consommé est un dénominateur : un
      // remboursement rend son crédit, un octroi n'en a jamais coûté un.
      if (!Number.isFinite(row.delta)) continue
      const consumed = -row.delta
      if (UNMEASURED_COST_REASONS.some(matcher => matches(row.reason, matcher))) {
        creditsWithoutMeasuredCost += Math.max(0, consumed)
        continue
      }
      credits += consumed
    }
    credits = Math.max(0, credits)

    const hasTariffedLine = costUsd > 0
    let unmeasurable: string | null = null
    if (credits <= 0) unmeasurable = 'aucun crédit débité sur la fenêtre'
    else if (!hasTariffedLine) {
      unmeasurable =
        untariffedLines > 0
          ? `${untariffedLines} ligne(s) non tarifée(s) et aucune ligne tarifée — « non tarifé » n'est pas « gratuit »`
          : 'aucune consommation fournisseur mesurée'
    }

    return {
      key: family.key,
      label: family.label,
      costUsd: round(costUsd),
      untariffedLines,
      credits,
      creditsWithoutMeasuredCost,
      usdPerCredit: unmeasurable == null ? round(costUsd / credits) : null,
      unmeasurable,
    }
  })

  const uncredited = UNCREDITED_COST_FEATURES.reduce(
    (acc, feature) => {
      const entry = byFeature.get(feature)
      if (!entry) return acc
      return { costUsd: acc.costUsd + entry.costUsd, untariffedLines: acc.untariffedLines + entry.untariffedLines }
    },
    { costUsd: 0, untariffedLines: 0 },
  )

  const mapped = new Set<string>([...CREDIT_COST_FAMILIES.flatMap(f => f.features), ...UNCREDITED_COST_FEATURES])
  const unmappedFeatures = [...byFeature.keys()].filter(feature => !mapped.has(feature)).sort()
  const unmappedCostUsd = round(unmappedFeatures.reduce((sum, f) => sum + (byFeature.get(f)?.costUsd ?? 0), 0))
  const unmappedUntariffed = unmappedFeatures.reduce((sum, f) => sum + (byFeature.get(f)?.untariffedLines ?? 0), 0)

  const totalMeasuredUsd = families.reduce((sum, f) => sum + f.costUsd, 0) + uncredited.costUsd + unmappedCostUsd

  const comparable = families.filter(f => f.usdPerCredit != null)
  let spread: CreditCostMeasure['spread'] = null
  let spreadUnmeasurable: string | null = null
  if (comparable.length < MIN_FAMILIES_FOR_SPREAD) {
    spreadUnmeasurable = `moins de ${MIN_FAMILIES_FOR_SPREAD} familles mesurables — un rapport se calcule entre deux grandeurs`
  } else {
    const sorted = [...comparable].sort((a, b) => (a.usdPerCredit as number) - (b.usdPerCredit as number))
    const cheapest = sorted[0] as FamilyCreditCost
    const dearest = sorted[sorted.length - 1] as FamilyCreditCost
    spread = {
      ratio: round((dearest.usdPerCredit as number) / (cheapest.usdPerCredit as number)),
      dearest: dearest.key,
      cheapest: cheapest.key,
    }
  }

  return {
    families,
    uncredited: { ...uncredited, costUsd: round(uncredited.costUsd), features: UNCREDITED_COST_FEATURES },
    // Une part de 0 % dirait « le copilote ne coûte rien ». Sans dépense
    // mesurée, la bonne réponse est « on ne sait pas ».
    uncreditedShare: totalMeasuredUsd > 0 ? round(uncredited.costUsd / totalMeasuredUsd) : null,
    unmappedFeatures,
    unmappedCostUsd,
    spread,
    spreadUnmeasurable,
    isFloor:
      families.some(f => f.untariffedLines > 0 || f.creditsWithoutMeasuredCost > 0) ||
      uncredited.untariffedLines > 0 ||
      unmappedUntariffed > 0 ||
      unmappedFeatures.length > 0,
  }
}
