import { SAVED_VIEWS_MAX_PER_SCOPE } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateSavedView, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import { savedRecordToPlanningView } from '../planning-views'
import {
  missionFiltersToSavedRecord,
  savedRecordToMissionFilters,
  type MissionFilterState,
} from '../mission-saved-view-filters'

/** « Missions » vit sous son propre nom dans le registre des vues (`SAVED_VIEW_SCOPES`). */
const SCOPE = 'missions' as const

/**
 * #2408.54 — LES VUES ENREGISTRÉES DE « MISSIONS ».
 *
 * `SAVED_VIEW_SCOPES` porte `'missions'` depuis le CRM natif — trois routes,
 * un contrat, une borne — et aucun client web ne l'appelait pour cet écran :
 * la famille de défauts que ce dépôt paie le plus souvent, du code juste,
 * testé, que personne n'appelle. Même patron que `SavedTalentViews.tsx`
 * (#2152.37).
 *
 * ⚠️ C'EST le mécanisme de persistance que #2408.54 nomme absent, appliqué
 * directement — pas un système neuf. Un abonné peut ainsi nommer et
 * retrouver n'importe quelle combinaison de facettes/filtres déjà proposée
 * par la barre d'outils (#2408.56 CRA manquants via la facette `withRisk`,
 * #2408.59 marge non mesurée — même facette, `margin_unknown` y est déjà
 * fondu, loi 4 du tome 7 — #2408.61 missions sans date via `noEndDate`…) :
 * construire une neuvième vue PRÉDÉFINIE par population aurait dupliqué une
 * facette déjà cliquable ; laisser l'utilisateur nommer la sienne ne
 * duplique rien, et reste vrai le jour où une facette change de seuil.
 *
 * ⚠️ `draft` est ici les filtres DÉJÀ APPLIQUÉS de la lentille « En cours »,
 * pas un brouillon non soumis — on enregistre ce qui est VISIBLE à l'écran.
 */
export function SavedMissionViews({
  draft,
  onApply,
}: {
  draft: MissionFilterState
  onApply: (filters: MissionFilterState) => void
}) {
  const { t } = useTranslation('missions')
  const { user } = useSession()
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed

  const views = useSavedViews(SCOPE, { enabled: !locked })
  const create = useCreateSavedView(SCOPE)
  const remove = useRemoveSavedView(SCOPE)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  // Une vue du PLANNING (clé `planning`) n'est pas un critère de la liste : elle vit dans « Mes vues » du planning.
  const items = (views.data ?? []).filter(item => savedRecordToPlanningView(item.filters) === null)
  const criteria = missionFiltersToSavedRecord(draft)
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
                    onClick={() => onApply(savedRecordToMissionFilters(item.filters))}
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
