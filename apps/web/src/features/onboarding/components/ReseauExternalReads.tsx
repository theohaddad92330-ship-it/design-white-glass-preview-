import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Card, Text } from '@bellum/ui'
import { useCrmNetworkSize } from '@/features/crm/hooks/useCrmNetworkSize'
import { useCapitalisationWorkspaceSummary } from '@/features/onboarding/hooks/useCapitalisationWorkspaceSummary'
import { providerLabel } from '@/features/onboarding/components/CrmVocabularyHint'

/**
 * #2045.5 / #2045.8 / #2045.11 (épopée #2859) — les DEUX réservoirs que
 * `reseau-comptage.ts` ne demande jamais en bande, parce que le produit peut
 * les compter EXACTEMENT plutôt que les faire deviner (`answers-reseau.ts`
 * documente pourquoi ces deux-là restent hors du questionnaire déclaratif) :
 *
 *   - #2045.5 « contacts CRM » — le total PORTAIL du CRM branché
 *     (`CrmService.networkSize`), jamais scopé à un compte ;
 *   - #2045.8 « missions passées » — le total des missions déjà tracées sur
 *     l'espace (`CapitalisationService.workspaceMissionCount`).
 *
 * #2045.11 « permettre un import ultérieur » : le lien vers Réglages ›
 * Mémoire collective (`CrmImportPanel`, déjà livré) — reprendre son CRM ou un
 * fichier plus tard, sans bloquer l'onboarding maintenant.
 *
 * Rendu à part de `SubStepQuestions` (jamais un `Question.kind` de plus) :
 * ces deux lignes ne sont PAS une réponse à saisir, seulement une LECTURE —
 * les y mélanger forcerait soit une clé `EsnAnswers` qui ne correspond à
 * aucune colonne persistée, soit une validation qui compterait une lecture
 * comme « répondu ». Une carte à part le dit plus honnêtement : rien ici ne
 * se choisit, tout se lit.
 *
 * Honnêteté (JAMAIS de donnée inventée, gardes GA-18/GA-19) : chaque ligne de
 * lecture ne s'affiche QUE si sa valeur est RÉELLE (`total`/`missionCount`
 * non `null`) — un CRM non connecté ou une lecture en échec ne montre rien
 * plutôt qu'un zéro inventé. Le lien d'import (#2045.11), lui, ne dépend
 * d'aucune lecture : il reste toujours affiché, la carte n'est donc jamais
 * entièrement vide.
 */
export function ReseauExternalReads() {
  const { t } = useTranslation('onboarding')
  const crm = useCrmNetworkSize()
  const capitalisation = useCapitalisationWorkspaceSummary()

  const crmTotal = crm.data?.provider && crm.data.total !== null ? crm.data.total : null
  const missionCount = capitalisation.data?.missionCount ?? null

  return (
    <Card className="mt-4 space-y-2 p-4">
      {crmTotal !== null && crm.data?.provider && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('reseauExternalReads.crmContacts', { provider: providerLabel(crm.data.provider), count: crmTotal })}
        </Text>
      )}
      {missionCount !== null && (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('reseauExternalReads.missions', { count: missionCount })}
        </Text>
      )}
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('reseauExternalReads.importLater')}{' '}
        <Link to="/settings/knowledge" className="underline text-[var(--bellum-text-accent)]">
          {t('reseauExternalReads.importLaterLink')}
        </Link>
      </Text>
    </Card>
  )
}
