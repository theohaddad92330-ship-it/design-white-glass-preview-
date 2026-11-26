import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePistesToReview } from '@/features/crm-counters/usePistesToReview'
import { usePipeline } from '../hooks/usePipeline'

/**
 * #4499 (Louis 23/10) — « Affaires à qualifier → Ouvrir la file de qualification », atteignable depuis l'onglet
 * Besoins. La carte qui la portait sur le Pipeline a quitté la page avec les trois autres (une ligne de synthèse
 * les remplace) ; la file, elle, vit dans le panneau des pistes du Pipe (`/projects?pistes=1`, #4545 — elle a quitté Signaux).
 *
 * Le nombre n'est jamais nu (GA-134) : « Affaires à qualifier » et son compte sont deux frères du même groupe, et
 * les pistes à revoir restent une phrase entière. Rien à qualifier (ou résumé non lu) : aucune ligne — on n'affiche
 * pas ce qu'on n'a pas, et une flèche vers une file vide est une promesse non tenue.
 */
export function IntakeQueueLine({ intake, pistesToReview }: { intake: number; pistesToReview: number | null }) {
  const { t } = useTranslation('projects')
  if (intake <= 0) return null
  return (
    <div
      data-testid="intake-queue"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--bellum-text-secondary)]"
    >
      <span className="inline-flex items-baseline gap-1.5">
        <span>{t('kpis.intake.label')}</span>
        <b className="font-semibold tabular-nums text-[var(--bellum-text-primary)]">{intake}</b>
      </span>
      {pistesToReview !== null && pistesToReview > 0 ? (
        <span>{t('kpis.intake.pistesToReview', { count: pistesToReview })}</span>
      ) : null}
      <Link
        to="/projects"
        search={{ pistes: 1 }}
        title={t('pipeline.intakeHint')}
        className="inline-flex items-center gap-1 font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
      >
        {t('kpis.intake.cta')}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  )
}

/** La ligne branchée : le MÊME résumé du pipe et le MÊME compteur de pistes que Pilotage (GA-26). */
export function IntakeQueueLink() {
  const { data: summary } = usePipeline()
  const pistesToReview = usePistesToReview()
  // Un résumé absent ou d'une forme inattendue n'est pas « 0 à qualifier » : il ne rend rien (GA-18/19).
  const intake = summary?.intake
  if (typeof intake !== 'number' || !Number.isFinite(intake)) return null
  return <IntakeQueueLine intake={intake} pistesToReview={pistesToReview} />
}
