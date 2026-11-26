import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { i18n } from '@/i18n'

/**
 * #4424.6 (décision Louis 21/10) — la création d'une mission ou d'un besoin
 * PROPOSE « Préparer le RDV ». Rien ne part seul : c'est une action sur le
 * toast de succès.
 *
 * #4424.4 — elle mène au panneau « Préparer le rendez-vous » de la FICHE COMPTE
 * (R1 / R2, déroulé, REX, pitch), qui ne dépend d'aucun agenda synchronisé. Sans
 * compte connu, elle garde l'ancien chemin : le brief (`/briefing`).
 */
export function useMeetingPrepAction(): (accountId: string | null) => { label: string; onClick: () => void } {
  const navigate = useNavigate()
  return useCallback(
    (accountId: string | null) => ({
      label: i18n.t('briefing:agenda.prepProposal.cta'),
      onClick: () =>
        void (accountId
          ? navigate({ to: '/accounts/$id', params: { id: accountId }, search: { tab: 'plan', prep: 'rdv' } })
          : navigate({ to: '/briefing', search: { plan: undefined } })),
    }),
    [navigate],
  )
}
