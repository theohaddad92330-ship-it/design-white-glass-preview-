import { SAVED_VIEWS_MAX_PER_SCOPE, type TalentSearchQuery } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateSavedView, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import { savedRecordToTalentFilters, talentFiltersToSavedRecord } from '../lib/talent-saved-view-filters'

/** Le vivier vit sous son propre nom dans le registre des vues (`SAVED_VIEW_SCOPES`). */
const SCOPE = 'talents' as const

/**
 * #2152.37 — LES VUES ENREGISTRÉES DU VIVIER.
 *
 * `SAVED_VIEW_SCOPES` porte `'talents'` depuis le CRM natif — trois routes,
 * un contrat, une borne — et aucun client web ne l'appelait pour cet écran :
 * la famille de défauts que ce dépôt paie le plus souvent, du code juste,
 * testé, que personne n'appelle. Même patron que `SavedNeedViews.tsx`
 * (I-34) : lire son docblock pour le détail des trois règles qui portent ce
 * panneau (refus AVANT le clic, borne du CONTRAT, dégradation par capacité).
 *
 * ⚠️ `draft` est ici les filtres DÉJÀ APPLIQUÉS (`query`, tels que
 * `TalentFilterDrawer` les reçoit), pas le brouillon local de formulaire du
 * tiroir — ce dernier porte des chaînes non coercées (`minTjm: string`), pas
 * la forme de `TalentSearchQuery`. On enregistre donc ce qui est VISIBLE à
 * l'écran, pas une édition non appliquée.
 */
export function SavedTalentViews({
  draft,
  onApply,
}: {
  draft: Partial<TalentSearchQuery>
  onApply: (filters: Partial<TalentSearchQuery>) => void
}) {
  const { t } = useTranslation('consultants')
  const { user } = useSession()
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed

  const views = useSavedViews(SCOPE, { enabled: !locked })
  const create = useCreateSavedView(SCOPE)
  const remove = useRemoveSavedView(SCOPE)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const items = views.data ?? []
  const criteria = talentFiltersToSavedRecord(draft)
  const hasCriteria = Object.keys(criteria).length > 0
  const mine = items.filter(item => item.ownerId === user?.id).length
  const atCap = mine >= SAVED_VIEWS_MAX_PER_SCOPE

  const refusal = !hasCriteria
    ? t('savedViews.noCriteria')
    : atCap
      ? t('savedViews.full', { max: SAVED_VIEWS_MAX_PER_SCOPE })
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
          toast.success(t('savedViews.saved', { name: trimmed }))
        },
        onError: error => toast.error(error.message || t('savedViews.error')),
      },
    )
  }

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {t('savedViews.title')}
      </Text>

      {locked ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('savedViews.locked')}
        </Text>
      ) : (
        <>
          {views.isLoading ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('savedViews.loading')}
            </Text>
          ) : views.isError ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('savedViews.loadError')}
            </Text>
          ) : items.length === 0 ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('savedViews.empty')}
            </Text>
          ) : (
            <Box className="space-y-1">
              {items.map(item => (
                <Box key={item.id} display="flex" className="items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onApply(savedRecordToTalentFilters(item.filters))}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-left text-sm text-[var(--bellum-text-primary)]"
                  >
                    <span className="block truncate">{item.name}</span>
                    {item.shared ? (
                      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('savedViews.shared')}
                      </Text>
                    ) : null}
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
                </Box>
              ))}
            </Box>
          )}

          {naming ? (
            <Box display="flex" className="items-center gap-2">
              <Input
                aria-label={t('savedViews.nameLabel')}
                placeholder={t('savedViews.namePlaceholder')}
                value={name}
                maxLength={80}
                onChange={event => setName(event.target.value)}
              />
              <Button size="sm" disabled={name.trim().length === 0 || create.isPending} onClick={submit}>
                {t('savedViews.confirm')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNaming(false)
                  setName('')
                }}
              >
                {t('savedViews.cancel')}
              </Button>
            </Box>
          ) : (
            <Button size="sm" variant="outline" disabled={refusal !== null} onClick={() => setNaming(true)}>
              {t('savedViews.save')}
            </Button>
          )}

          {refusal ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {refusal}
            </Text>
          ) : null}
        </>
      )}
    </Box>
  )
}
