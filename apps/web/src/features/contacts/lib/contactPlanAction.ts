import type { PlanActionInput } from '@/features/actions/planItems.api'
import { i18n } from '@/i18n'

/**
 * L'action « prendre contact » écrite dans le plan d'action du compte.
 *
 * Partagée par la fiche contact et par l'action de masse du panneau de
 * sélection, et c'est le point : le serveur dédoublonne une action OUVERTE sur
 * son libellé ET son objet visé. Deux formes différentes pour le même geste
 * créeraient deux lignes dans le plan, et le « déjà au plan » de l'action de
 * masse cesserait d'être vrai.
 *
 * #2123.46 — elle part sur la ligne canonique (`POST /plan-items`) avec le
 * contact comme OBJET visé : l'action devient cliquable vers la fiche, et
 * `/actions` la liste. Elle écrivait `raw_analysis.user_plan_actions`, un blob
 * qu'aucun autre écran ne lit.
 */
export function contactPlanAction(contact: { id: string; full_name: string; title?: string | null }): PlanActionInput {
  const who = contact.title ? `${contact.full_name} — ${contact.title}` : contact.full_name
  return {
    label: i18n.t('contacts:header.planAction', { who }),
    // #2871 (#2395.8) — l'objectif est requis à la création.
    reason: i18n.t('contacts:header.planActionReason', { who }),
    // #2395.8 — résultat attendu requis à la création (gabarit nommant le contact, rien de deviné).
    expected_outcome: i18n.t('contacts:header.planActionOutcome', { who }),
    target: { kind: 'contact', id: contact.id, label: contact.full_name },
    // #3287 (#3265.2) — ajouter un contact au plan d'un compte EST la couverture
    // multi-contacts : la règle du corpus méthode que ce geste applique.
    method_rule: 'couverture_multi_roles_niveaux_entites',
  }
}
