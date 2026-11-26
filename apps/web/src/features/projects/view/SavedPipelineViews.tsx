import { SAVED_VIEWS_MAX_PER_SCOPE } from '@bellum/contracts'
import { Box, Button, Input, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { Bookmark, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateSavedView, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import {
  pipelineFiltersToSavedRecord,
  savedRecordToPipelineFilters,
  type PipelineFilters,
} from '../model/pipeline-saved-view'

const SCOPE = 'projects_pipe' as const

/**
 * #2170.52 — LES VUES ENREGISTRÉES DU PIPE.
 *
 * Même mécanisme que {@link SavedNeedViews} (`open-needs/view/SavedNeedViews.tsx`)
 * — un nom, des critères, un propriétaire, un partage, la même table
 * `saved_views` — mais un scope À PART (`projects_pipe`) : les critères des
 * BESOINS ouverts (`NeedFilters`) et ceux du PIPE (filtres rapides) ne sont
 * pas la même forme, et les confondre ferait apparaître une vue de besoins
 * parmi des vues de pipe sans que rien à l'écran ne les distingue.
 *
 * Trois règles, vues avant le clic (identiques à `SavedNeedViews`) :
 * 1. Une vue sans critère est refusée par le serveur, l'écran le DIT.
 * 2. La borne vient du CONTRAT ({@link SAVED_VIEWS_MAX_PER_SCOPE}), ne compte
 *    que MES vues.
 * 3. La capacité manquante DÉGRADE (`@RequireFeature('crm_native')`).
 */
export function SavedPipelineViews({
  draft,
  onApply,
}: {
  /** Ce qui serait enregistré — les six filtres rapides et la recherche. */
  draft: PipelineFilters
  onApply: (filters: PipelineFilters) => void
}) {
  const { t } = useTranslation('projects')
  const { user } = useSession()
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed

  const views = useSavedViews(SCOPE, { enabled: !locked })
  const create = useCreateSavedView(SCOPE)
  const remove = useRemoveSavedView(SCOPE)

  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const items = views.data ?? []
  const criteria = pipelineFiltersToSavedRecord(draft)
  const hasCriteria = Object.keys(criteria).length > 0
  const mine = items.filter(item => item.ownerId === user?.id).length
  const atCap = mine >= SAVED_VIEWS_MAX_PER_SCOPE

  const refusal = !hasCriteria
    ? t('pipeline.savedViews.noCriteria')
    : atCap
      ? t('pipeline.savedViews.full', { max: SAVED_VIEWS_MAX_PER_SCOPE })
      : null

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0 || refusal !== null) return
    create.mutate(
      { scope: SCOPE, name: trimmed, filters: criteria, shared: false },
      {
        onSuccess: () => {
          setNaming(false)
          setName('')
          toast.success(t('pipeline.savedViews.saved', { name: trimmed }))
        },
        onError: error => toast.error(error.message || t('pipeline.savedViews.error')),
      },
    )
  }

  if (locked) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Bookmark className="mr-1 size-3.5" aria-hidden />
          {t('pipeline.savedViews.title')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2">
        {views.isLoading ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('pipeline.savedViews.loading')}
          </Text>
        ) : views.isError ? (
          // « Je n'ai pas pu regarder » n'est pas « tu n'as aucune vue ».
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('pipeline.savedViews.loadError')}
          </Text>
        ) : items.length === 0 ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('pipeline.savedViews.empty')}
          </Text>
        ) : (
          <Box className="space-y-1">
            {items.map(item => (
              <Box key={item.id} display="flex" className="items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onApply(savedRecordToPipelineFilters(item.filters))
                    setOpen(false)
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-left text-sm text-[var(--bellum-text-primary)]"
                >
                  <span className="block truncate">{item.name}</span>
                </button>
                {item.ownerId === user?.id ? (
                  <button
                    type="button"
                    aria-label={t('pipeline.savedViews.remove', { name: item.name })}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: item.id },
                        {
                          onSuccess: () => toast.success(t('pipeline.savedViews.removed')),
                          onError: error => toast.error(error.message),
                        },
                      )
                    }
                    className="min-h-11 min-w-[44px] shrink-0 rounded-md border border-border text-[var(--bellum-text-muted)]"
                  >
                    <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </Box>
            ))}
          </Box>
        )}

        {naming ? (
          <Box display="flex" className="items-center gap-2">
            <Input
              aria-label={t('pipeline.savedViews.nameLabel')}
              placeholder={t('pipeline.savedViews.namePlaceholder')}
              value={name}
              maxLength={80}
              onChange={event => setName(event.target.value)}
            />
            <Button size="sm" disabled={name.trim().length === 0 || create.isPending} onClick={submit}>
              {t('pipeline.savedViews.confirm')}
            </Button>
          </Box>
        ) : (
          <Button size="sm" variant="outline" disabled={refusal !== null} onClick={() => setNaming(true)}>
            {t('pipeline.savedViews.save')}
          </Button>
        )}

        {refusal ? (
          <Text element="p" size="xs" color="text-muted-foreground">
            {refusal}
          </Text>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
