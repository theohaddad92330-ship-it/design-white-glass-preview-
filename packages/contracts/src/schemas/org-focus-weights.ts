import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Le FOCUS du plan d'action — combien de place chaque axe obtient     */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La charge utile envoyée au prompt du plan d'action est PLAFONNÉE, axe par axe,
 * par une table écrite en dur (`_PLAN_LIST_CAPS`, `apps/ia/app/routers/phase4_plan.py`).
 * Ces plafonds ne sont pas cosmétiques : ce bloc est mis en cache et relu par
 * les onze sous-appels du plan, chaque élément est donc payé onze fois en
 * lecture de cache — et surtout, **ce qui n'entre pas dans le plafond n'entre
 * pas dans le plan**. Un axe à 6 places pèse plus qu'un axe à 4, quel que soit
 * ce que le compte contient réellement.
 *
 * Or `itChallenges` valait 6 pour TOUT LE MONDE. Une ESN qui vend de
 * l'ingénierie industrielle, du conseil RH ou de la finance recevait donc, à
 * chaque dossier, six lignes de « défis IT » et quatre de périmètres
 * prioritaires — un prisme IT par défaut, appliqué à des ESN dont ce n'est pas
 * le métier. L'exigence est explicite : **jamais un prisme IT par défaut**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI CHANGE, ET CE QUI NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les poids deviennent réglables PAR ESPACE, et le défaut reste EXACTEMENT la
 * table d'aujourd'hui : un espace qui n'a rien réglé obtient un plan
 * byte-identique à celui d'avant ce lot. C'est la seule façon honnête
 * d'introduire un réglage — on ne profite pas d'une mise en configuration pour
 * changer la valeur en même temps, sinon plus personne ne sait laquelle des
 * deux modifications a produit l'effet observé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUIL VIT DANS LE CONTRAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ici, et nulle part ailleurs. Le service IA en tient une copie Python
 * (`apps/ia/app/services/focus_weights.py`) parce que `packages/contracts`
 * n'existe pas dans l'image déployée du service IA (son contexte de build est
 * `apps/ia` — même raison que la copie embarquée des JSON Schemas). Cette copie
 * est une DUPLICATION, et les duplications dérivent : la garde
 * `apps/ia/tests/test_focus_weights.py` LIT ce fichier-ci et fait échouer la CI
 * à la moindre divergence, valeur par valeur.
 */

/**
 * Les axes plafonnés de la charge utile du plan. L'ordre est figé (GA-08) et
 * les ajouts vont en FIN.
 *
 * Ce sont exactement les onze clés de `_PLAN_LIST_CAPS` — pas une de plus : un
 * axe qui n'est pas plafonné aujourd'hui ne le devient pas parce qu'on a écrit
 * un contrat.
 */
export const ORG_FOCUS_AXES = [
  'entitiesExhaustive',
  'priorityPerimeters',
  'recentSignals',
  'budgetSignals',
  'competitors',
  'peopleMentioned',
  'itChallenges',
  'pains',
  'angles',
  'objections',
  'powerQuestions',
] as const
export const orgFocusAxisSchema = z.enum(ORG_FOCUS_AXES)
export type OrgFocusAxis = z.infer<typeof orgFocusAxisSchema>

/**
 * Les valeurs EN VIGUEUR — celles qui tournent en production aujourd'hui.
 *
 * ⚠️ Recopiées à l'identique depuis `_PLAN_LIST_CAPS` : ce lot rend le réglage
 * configurable, il ne le CHANGE pas. Le jour où l'une bouge, elle bouge ici et
 * la garde Python force la copie à suivre.
 */
export const ORG_FOCUS_DEFAULT_WEIGHTS: Readonly<Record<OrgFocusAxis, number>> = {
  entitiesExhaustive: 8,
  priorityPerimeters: 4,
  recentSignals: 6,
  budgetSignals: 5,
  competitors: 5,
  peopleMentioned: 8,
  itChallenges: 6,
  pains: 6,
  angles: 5,
  objections: 5,
  powerQuestions: 5,
}

/**
 * Le plafond d'un poids réglé par un espace.
 *
 * `0` est une valeur LÉGITIME et c'est le cœur du sujet : une ESN qui ne vend
 * pas d'IT doit pouvoir retirer complètement `itChallenges` de son plan, pas
 * seulement le réduire. `20` en haut — au-delà, le bloc mis en cache et relu
 * onze fois recommence à coûter ce qu'il coûtait avant qu'on ne le plafonne.
 */
export const ORG_FOCUS_WEIGHT_MAX = 20

/**
 * Ce qu'un espace peut régler : un sous-ensemble des axes, chacun borné.
 *
 * PARTIEL à dessein — un espace règle les deux axes qui le concernent et hérite
 * du reste. Exiger les onze forcerait chaque espace à recopier une table qu'il
 * ne comprend pas, et la première divergence de défaut serait invisible.
 */
export const orgFocusWeightsSchema = z
  .partialRecord(orgFocusAxisSchema, z.number().int().min(0).max(ORG_FOCUS_WEIGHT_MAX))
  .default({})
export type OrgFocusWeights = z.infer<typeof orgFocusWeightsSchema>

/**
 * Les poids EFFECTIFS d'un espace : les défauts, écrasés par ce qu'il a réglé.
 *
 * La dérivation vit ICI, à un seul endroit (GA-26). Un axe inconnu est ignoré
 * en silence plutôt que de faire échouer un run : un réglage périmé (l'axe a
 * disparu du prompt) ne doit pas empêcher de produire un plan.
 */
export function resolveOrgFocusWeights(
  overrides?: Partial<Record<string, number>> | null,
): Record<OrgFocusAxis, number> {
  const resolved: Record<string, number> = { ...ORG_FOCUS_DEFAULT_WEIGHTS }
  for (const axis of ORG_FOCUS_AXES) {
    const value = overrides?.[axis]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    resolved[axis] = Math.min(ORG_FOCUS_WEIGHT_MAX, Math.max(0, Math.floor(value)))
  }
  return resolved as Record<OrgFocusAxis, number>
}
