import { HelpCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EntityHypothesisView } from './entityHypothesis'

/**
 * #2265.13 — « sinon choisir le plus probable et ANNONCER l'hypothèse ».
 *
 * La désambiguïsation d'homonymes (Théo p.10) choisissait déjà silencieusement
 * un candidat dominant quand plusieurs entités homonymes sont plausibles — un
 * commercial ouvrait la fiche « SOCIETE GENERALE » sans savoir qu'un autre
 * SIREN, presque aussi plausible, existe. Ce bandeau rend visible le choix fait
 * pour lui, avec la raison — jamais un fait présenté comme certain.
 *
 * Muet dès que le statut n'est pas `selected` (voir `readEntityHypothesis`) :
 * un candidat unique ou verrouillé par l'utilisateur n'a rien à annoncer.
 */
export function EntityHypothesisNotice({ data }: { data: EntityHypothesisView }) {
  const { t } = useTranslation('accountDetail')

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-1)_60%,transparent)] px-4 py-3">
      <HelpCircle className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--bellum-text-primary)]">{t('overview.entityHypothesis.title')}</p>
        <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">{data.message}</p>
      </div>
    </div>
  )
}
