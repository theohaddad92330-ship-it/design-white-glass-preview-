import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'

/**
 * #1685 — LA MESURE D'USAGE PAR FONCTION, agrégée à travers tous les espaces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `/produit/adoption` DISAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran (`apps/dashboard-manager/…/adoption/feature-adoption.logic.ts`)
 * rendait déjà, honnêtement, les 15 fonctions gatées par l'offre (`@bellum/
 * contracts`, `PLAN_FEATURE_KEYS`) et leur dénominateur — mais chaque ligne
 * restait `non_mesurable` : le signal d'usage RÉEL existait par endroits, hors
 * du traceur produit (`crm_connections.last_used_at`, `api_keys.last_used_at`,
 * un outil MCP appelé, une règle de veille créée, un document versé…), mais
 * AUCUNE route interne ne les agrégeait PAR FONCTION, à travers tous les
 * espaces — les routes qui existaient répondaient un espace à la fois. Ce
 * fichier est cette agrégation, côté pur : ce qu'il faut savoir compter, et
 * comment le combiner. `feature-adoption-usage.service.ts` porte les requêtes
 * qui le nourrissent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE VOIT JAMAIS UN IDENTIFIANT D'ESPACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine `c64_analytique_produit`, règle 5 : rien de comportemental par
 * espace client NOMMÉ dans le back-office. La façon la plus sûre de la tenir
 * n'est pas une discipline de relecture, c'est une IMPOSSIBILITÉ structurelle —
 * même leçon que `hashBehavioralSession` (`product-analytics-privacy.ts`) : la
 * rotation vit côté serveur pour que l'interdit soit impossible, pas seulement
 * respecté. Ici, {@link buildFeatureAdoptionReport} ne reçoit JAMAIS de liste
 * d'espaces : seulement des COMPTES déjà agrégés PAR PALIER
 * (`Record<planKey, number>`), exactement la forme que `AdminOverview.plans`
 * expose déjà au reste de l'écran. Le service qui appelle cette fonction fait
 * le GROUP BY workspace_id → plan côté SQL et ne renvoie jamais la ligne
 * détaillée à l'application — aucune ligne de CE fichier ne pourrait écrire un
 * identifiant d'espace même par erreur, la donnée en entrée n'en porte aucun.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CATALOGUE DES SIGNAUX — MESURÉ, OU HONNÊTEMENT NON BRANCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link FEATURE_USAGE_SIGNALS} porte, pour CHACUNE des 15 fonctions, soit la
 * table + colonne qui prouve un usage réel, soit la raison écrite pour
 * laquelle aucune trace persistée n'existe. Deux fonctions n'ont aucun signal
 * aujourd'hui :
 *
 *  - `exports` (PDF/CSV) — `documents.controller.ts` répond en flux binaire
 *    (xlsx/docx/pdf/pptx) sans écrire aucune ligne ; aucune table ne porte,
 *    par espace, qu'un export a eu lieu. Note : le service ne porte même pas
 *    de garde `@RequireFeature('exports')` aujourd'hui (`data:export` est une
 *    permission RBAC, pas le gating par offre) — hors périmètre de ce lot,
 *    signalé pour mémoire.
 *  - `discover` — `ia-proxy.controller.ts` proxifie Brave + Claude sans
 *    consommer de crédit dédié (`credit_ledger` n'a aucun `kind` pour
 *    Découvrir) et sans écrire de ligne persistée par espace ; la seule trace
 *    serait le flux comportemental (`product_events`), hors périmètre de la
 *    doctrine `c64_analytique_produit` pour ce back-office.
 *
 * Une fonction `not_wired` rend TOUJOURS `activeWorkspaces: null` — jamais 0 —
 * quel que soit ce qu'on lui passerait par erreur : voir le test
 * « n'attrape pas ce qu'elle ne vise pas » de `feature-adoption-usage.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DOUZE SIGNAUX BRANCHÉS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chacun est une table déjà écrite par une capacité RÉELLE (jamais une
 * instrumentation créée pour l'occasion) :
 *
 *   fonction          table              colonne datée
 *   ───────────────── ────────────────── ───────────────────────────────────
 *   crm_sync          crm_connections    last_used_at (dernier usage RÉEL)
 *   public_api        api_keys           last_used_at
 *   mcp_assistant     oauth_consents     updated_at (via workspace_members —
 *                                        le lien est PERSONNEL, jamais scopé
 *                                        par espace ; attribué à un espace dès
 *                                        qu'UN de ses membres a un jeton actif)
 *   watchlist         watchlist_rules    created_at
 *   knowledge_base    rag_documents      created_at (un document VERSÉ)
 *   chat_ai           chat_messages      created_at, role = 'user'
 *   team_workspace    team_comments      created_at
 *   needs             opportunities      created_at
 *   talent_pool       consultants        created_at
 *   crm_native        tasks              created_at
 *   ats_native        submissions        created_at
 *   manager_cockpit   member_objectives  updated_at
 */

export type FeatureUsageSignal =
  | { readonly kind: 'measured'; readonly description: string }
  | { readonly kind: 'not_wired'; readonly reason: string }

export const FEATURE_USAGE_SIGNALS: Readonly<Record<PlanFeatureKey, FeatureUsageSignal>> = {
  exports: {
    kind: 'not_wired',
    reason:
      "les endpoints de documents (contacts.xlsx / dossier.docx / dossier.pdf / deck.pptx, `documents.controller.ts`) répondent en flux binaire sans écrire aucune ligne — aucune table ne porte, par espace, qu'un export a eu lieu.",
  },
  chat_ai: {
    kind: 'measured',
    description: "chat_messages.created_at (role = 'user') — un message envoyé à Laura",
  },
  discover: {
    kind: 'not_wired',
    reason:
      'Découvrir proxifie Brave + Claude (`ia-proxy.controller.ts`) sans consommer de crédit dédié (aucun `kind` de `credit_ledger` ne lui correspond) et sans écrire de ligne persistée par espace.',
  },
  watchlist: {
    kind: 'measured',
    description: 'watchlist_rules.created_at — une règle de veille créée',
  },
  knowledge_base: {
    kind: 'measured',
    description: 'rag_documents.created_at — un document versé dans la base de connaissance',
  },
  team_workspace: {
    kind: 'measured',
    description: 'team_comments.created_at — un commentaire d’équipe partagé',
  },
  needs: {
    kind: 'measured',
    description: 'opportunities.created_at — un besoin détecté, suivi comme un pipe',
  },
  talent_pool: {
    kind: 'measured',
    description: 'consultants.created_at — un profil ajouté au vivier',
  },
  crm_native: {
    kind: 'measured',
    description: 'tasks.created_at — une tâche créée dans le CRM Bellum',
  },
  ats_native: {
    kind: 'measured',
    description: 'submissions.created_at — un talent positionné sur un projet',
  },
  manager_cockpit: {
    kind: 'measured',
    description: 'member_objectives.updated_at — un objectif d’équipe déclaré ou modifié',
  },
  crm_sync: {
    kind: 'measured',
    description: 'crm_connections.last_used_at — dernière synchronisation réelle d’un CRM externe',
  },
  mcp_assistant: {
    kind: 'measured',
    description:
      'oauth_consents.updated_at, via workspace_members — dernier jeton MCP actif rafraîchi par un membre de l’espace',
  },
  public_api: {
    kind: 'measured',
    description: 'api_keys.last_used_at — dernière utilisation d’une clé d’API publique',
  },
  rfp: {
    kind: 'measured',
    description: 'rfps.created_at — un appel d’offres importé dans l’espace',
  },
}

/** Un palier du catalogue LIVE, réduit à ce que ce fichier lit. Structurellement
 *  compatible avec `PlanDefinition` (API) et `AdoptionPlanCatalogue` (écran) —
 *  aucun des deux n'a besoin d'être importé pour que la fonction s'applique. */
export type PlanFeatureRow = { key: string; features: readonly PlanFeatureKey[] }

/** Les paliers du catalogue LIVE qui ouvrent `feature` aujourd'hui. */
export function grantingPlanKeys(plans: readonly PlanFeatureRow[], feature: PlanFeatureKey): string[] {
  return plans.filter(plan => plan.features.includes(feature)).map(plan => plan.key)
}

/** Somme les comptes des SEULS paliers demandés ; un palier absent du compte
 *  (aucun abonné aujourd'hui sur ce palier) vaut 0, jamais une exception. */
export function sumByPlans(countsByPlan: Readonly<Record<string, number>>, planKeys: readonly string[]): number {
  return planKeys.reduce((sum, key) => sum + (countsByPlan[key] ?? 0), 0)
}

/** Une ligne du rapport : le signal d'une fonction, sur la fenêtre demandée.
 *  Non exporté : seul `FeatureAdoptionReport.signals` (ci-dessous) a besoin
 *  d'être nommé par les appelants — `pnpm lint:exports:types` (knip) refuse
 *  un type exporté sans second lecteur. */
type FeatureAdoptionSignalReport = {
  feature: PlanFeatureKey
  /** Espaces qui ont le DROIT à la fonction aujourd'hui (proxy : abonnements
   *  du palier, comme `entitlementPourFonction` côté écran — jamais une liste). */
  eligibleWorkspaces: number
  /** Espaces éligibles qui ont RÉELLEMENT utilisé la fonction sur la fenêtre.
   *  `null` = aucun signal branché pour cette fonction (voir `notWiredReason`),
   *  JAMAIS 0 : « pas mesuré » n'est pas « mesuré à zéro ». */
  activeWorkspaces: number | null
  /** La fenêtre RÉELLEMENT interrogée — jamais falsifiée à une valeur qui
   *  franchirait à tort le plancher de maturité de 60 jours (`classerAdoption`,
   *  côté écran, applique déjà cette règle : encore faut-il que ce champ dise
   *  la vérité). */
  windowDays: number
  /** La description humaine du signal mesuré, ou `null` si non branché. */
  signal: string | null
  /** La raison pour laquelle aucun signal n'est branché, ou `null` si mesuré. */
  notWiredReason: string | null
}

export type FeatureAdoptionReport = {
  windowDays: number
  measuredAt: string
  signals: FeatureAdoptionSignalReport[]
}

/**
 * Combine le catalogue de paliers LIVE, les comptes d'éligibilité PAR PALIER et
 * les comptes d'usage PAR PALIER (un sous-ensemble : seules les fonctions
 * mesurées en ont) en UNE ligne par fonction du catalogue — jamais plus, jamais
 * moins (`PLAN_FEATURE_KEYS.map` le garantit par construction, même idiome que
 * `construireRapportAdoption` côté écran).
 *
 * Pure : aucune horloge, aucun accès réseau ou base — tout est testable avec
 * des littéraux. Le service (`feature-adoption-usage.service.ts`) porte les
 * requêtes qui produisent `eligibleCountsByPlan` et `activeCountsByPlanPerFeature`.
 */
export function buildFeatureAdoptionReport(
  plans: readonly PlanFeatureRow[],
  eligibleCountsByPlan: Readonly<Record<string, number>>,
  activeCountsByPlanPerFeature: Readonly<Partial<Record<PlanFeatureKey, Readonly<Record<string, number>>>>>,
  windowDays: number,
): FeatureAdoptionSignalReport[] {
  return PLAN_FEATURE_KEYS.map(feature => {
    const granting = grantingPlanKeys(plans, feature)
    const eligibleWorkspaces = sumByPlans(eligibleCountsByPlan, granting)
    const signalDef = FEATURE_USAGE_SIGNALS[feature]
    const activeByPlan = signalDef.kind === 'measured' ? activeCountsByPlanPerFeature[feature] : undefined
    const activeWorkspaces = activeByPlan
      ? sumByPlans(activeByPlan, granting)
      : signalDef.kind === 'measured'
        ? 0
        : null
    return {
      feature,
      eligibleWorkspaces,
      activeWorkspaces,
      windowDays,
      signal: signalDef.kind === 'measured' ? signalDef.description : null,
      notWiredReason: signalDef.kind === 'not_wired' ? signalDef.reason : null,
    }
  })
}
