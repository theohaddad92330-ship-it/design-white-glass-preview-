import { SAVED_VIEWS_MAX_PER_SCOPE } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateSavedView, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import { planningViewToSavedRecord, savedRecordToPlanningView, type PlanningView } from '../planning-views'

/** « Missions » vit sous son propre nom dans le registre des vues. */
const SCOPE = 'missions' as const

/**
 * Théo missions-planning.R7 — « MES VUES » : enregistrer les filtres ET la
 * fenêtre de dates, sans copier les missions.
 *
 * Même mécanisme de persistance que `SavedMissionViews` (le registre des vues
 * de « Missions »), sous une clé qui lui est propre : la liste ne lit pas cette
 * clé comme un critère, et ce dialogue ne montre que les vues qui la portent.
 */
export function PlanningViewsDialog({
  open,
  onOpenChange,
  current,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: PlanningView
  onApply: (view: PlanningView) => void
}) {
  const { t } = useTranslation('missions')
  const { user } = useSession()
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed

  const views = useSavedViews(SCOPE, { enabled: !locked && open })
  const create = useCreateSavedView(SCOPE)
  const remove = useRemoveSavedView(SCOPE)
  const [name, setName] = useState('')

  const items = (views.data ?? []).flatMap(item => {
    const view = savedRecordToPlanningView(item.filters)
    return view === null ? [] : [{ item, view }]
  })
  const mine = items.filter(entry => entry.item.ownerId === user?.id).length
  const atCap = mine >= SAVED_VIEWS_MAX_PER_SCOPE
  const trimmed = name.trim()

  const save = () => {
    if (trimmed.length === 0 || atCap) return
    create.mutate(
      { scope: SCOPE, name: trimmed, filters: planningViewToSavedRecord(current), shared: false },
      {
        onSuccess: () => {
          setName('')
          toast.success(t('savedViews.saved', { name: trimmed }))
        },
        onError: error => toast.error(error.message || t('savedViews.error')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('planning.screen.views.title')}</DialogTitle>
          <DialogDescription>{t('planning.screen.views.intro')}</DialogDescription>
        </DialogHeader>

        {locked ? (
          <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
            {t('savedViews.locked')}
          </Text>
        ) : (
          <>
            {views.isLoading ? (
              <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
                {t('savedViews.loading')}
              </Text>
            ) : views.isError ? (
              <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
                {t('savedViews.loadError')}
              </Text>
            ) : items.length === 0 ? (
              <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
                {t('planning.screen.views.empty')}
              </Text>
            ) : (
              <ul className="space-y-1" aria-label={t('planning.screen.views.listLabel')}>
                {items.map(({ item, view }) => (
                  <li key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onApply(view)
                        onOpenChange(false)
                      }}
                      className="min-h-11 min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-left text-sm text-[var(--bellum-text-primary)]"
                    >
                      <span className="block truncate">{item.name}</span>
                    </button>
                    {item.ownerId === user?.id ? (
                      <button
                        type="button"
                        aria-label={t('savedViews.remove', { name: item.name })}
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(
                            { id: item.id },
                            {
                              onSuccess: () => toast.success(t('savedViews.removed')),
                              onError: error => toast.error(error.message),
                            },
                          )
                        }
                        className="min-h-11 min-w-[44px] shrink-0 rounded-md border border-border text-[var(--bellum-text-muted)]"
                      >
                        <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            <Box className="space-y-1">
              <label htmlFor="planning-view-name" className="text-sm font-medium">
                {t('planning.screen.views.nameLabel')}
              </label>
              <Input
                id="planning-view-name"
                value={name}
                maxLength={80}
                onChange={event => setName(event.target.value)}
              />
              {atCap ? (
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('savedViews.full', { max: SAVED_VIEWS_MAX_PER_SCOPE })}
                </Text>
              ) : null}
            </Box>
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => onOpenChange(false)}
          >
            {t('planning.screen.views.close')}
          </Button>
          {locked ? null : (
            <Button
              type="button"
              className="pointer-coarse:min-h-11"
              disabled={trimmed.length === 0 || atCap || create.isPending}
              onClick={save}
            >
              {t('planning.screen.views.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
