import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { PistesBoard } from '../../view/PistesBoard'
import { PistesCount } from '../../view/PistesCount'

/**
 * #4545 (Louis 25/10/2026, revient sur #4340) — LE PANNEAU DES PISTES DU PIPE.
 *
 * Les pistes ont quitté Signaux : ce panneau est la destination de tous leurs chemins (`/projects/pistes`,
 * `/mes-cibles#pistes`, le bouton du Pipe vide, « N pistes à revoir » de Pilotage, la ligne du Pipe). Il
 * s'ouvre PAR L'URL (`/projects?pistes=1`, même patron que `?create=1`) : un lien profond, un rechargement ou
 * un retour arrière le rouvrent, et il ne dépend pas de ce que le Pipe affiche (pipe vide compris).
 *
 * Le tableau est le MÊME `PistesBoard` que portait Signaux ; le palier suit le contenu (`needs`, celui du
 * Pipe) : sans lui, le lien profond n'ouvre rien — aucun accès de plus que le Pipe n'en donnait.
 */
export function PistesDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const { allowed } = usePlanFeature('needs')
  if (!allowed) return null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('detections.drawerClose')} className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b border-[var(--bellum-border)] px-5 py-4">
          <SheetTitle className="text-base">{t('detections.drawerTitle')}</SheetTitle>
          <SheetDescription>{t('detections.drawerDescription')}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-5 py-4">
          <PistesCount />
          <PistesBoard onOpenAccount={accountId => void navigate({ to: '/accounts/$id', params: { id: accountId } })} />
          <Link
            to="/signals"
            className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline underline-offset-2"
          >
            {t('detections.signalsStayInSignals')}
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
