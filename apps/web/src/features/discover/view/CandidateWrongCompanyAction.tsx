import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'
import { useReportWrongCompany } from '@/features/discover/hooks/useDiscoverCandidateFeedback'

interface CandidateWrongCompanyActionProps {
  siren: string
}

/**
 * #3671.2bis — « Mauvaise entreprise » : le signal affiché sur cette carte
 * n'appartient pas à ce SIREN. Geste rare et difficile à annuler (le SIREN ne
 * se rattachera plus aux recherches suivantes de cet espace) — un second clic
 * confirme, comme `DiscoverSidebar` le fait déjà pour la suppression d'une
 * recherche enregistrée.
 */
export function CandidateWrongCompanyAction({ siren }: CandidateWrongCompanyActionProps) {
  const { t } = useTranslation('discover')
  const [confirming, setConfirming] = useState(false)
  const report = useReportWrongCompany(siren)

  if (report.isSuccess) {
    return (
      <p className="mt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>
        {t('card.wrongCompany.reported')}
      </p>
    )
  }

  if (confirming) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{t('card.wrongCompany.confirm')}</span>
        <button
          type="button"
          onClick={() => report.mutate()}
          disabled={report.isPending}
          className="rounded-sm px-2 py-1.5 font-medium underline disabled:opacity-50"
          style={{ color: 'var(--danger-soft-text)' }}
        >
          {report.isPending ? t('card.wrongCompany.reporting') : t('card.wrongCompany.confirmAction')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-sm px-2 py-1.5 underline">
          {t('card.wrongCompany.cancel')}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={t('card.wrongCompany.hint')}
      className="mt-2 flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-surface-hover)]"
      style={{ color: 'var(--text-muted)' }}
    >
      <Flag className="h-[11px] w-[11px]" />
      {t('card.wrongCompany.action')}
    </button>
  )
}
