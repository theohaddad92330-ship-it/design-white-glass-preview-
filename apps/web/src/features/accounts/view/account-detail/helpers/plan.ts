/**
 * #2871 — le lecteur du plan GÉNÉRÉ vit dans `@bellum/contracts`
 * (`schemas/generated-plan.ts`) : la fiche et la projection canonique de l'API
 * (`GET /accounts/:id/actions`) en lisent les MÊMES étapes (GA-26). Les noms
 * historiques de la fiche restent, ré-exportés.
 */
export {
  normalizePlanWeeks,
  type GeneratedPlanStep as PlanAction,
  type GeneratedPlanPhase as PlanWeek,
} from '@bellum/contracts'
