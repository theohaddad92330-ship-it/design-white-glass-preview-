import { SAVED_VIEWS_MAX_PER_SCOPE, type NeedFilters } from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCreateSavedView, useRemoveSavedView, useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { useSession } from '@/lib/hooks/use-session'
import { needFiltersToSavedRecord, savedRecordToNeedFilters } from '../model/saved-view-filters'

/** L'écran des besoins vit dans le pipe : ses vues sont rangées avec lui. */
const SCOPE = 'projects' as const

/**
 * Les vues enregistrées du tiroir de filtres (I-34).
 *
 * L'API existait depuis le CRM natif — trois routes, un contrat, une borne — et
 * **aucun client web ne l'appelait**. C'est la famille de défauts que ce dépôt
 * paie le plus souvent : du code juste, testé, que personne n'appelle.
 *
 * Trois règles portent ce panneau, et chacune se voit AVANT le clic.
 *
 * 1. **Une vue sans critère est refusée par le serveur** (« elle existe déjà :
 *    c'est la liste complète »). L'écran le DIT au lieu de laisser cliquer pour
 *    récolter un 400 — qui, sur un tiroir de filtres, s'affiche comme un message
 *    technique sans rapport avec le geste.
 * 2. **La borne vient du CONTRAT** ({@link SAVED_VIEWS_MAX_PER_SCOPE}), jamais
 *    d'un 20 recopié : deux bornes finissent par diverger, et c'est le client
 *    qui se met à promettre ce que le serveur refuse. Elle ne compte que MES
 *    vues, comme le serveur — les vues partagées d'un collègue n'entrent pas
 *    dans mon quota.
 * 3. **La capacité manquante DÉGRADE.** Le contrôleur porte
 *    `@RequireFeature('crm_native')` : quand l'offre ne l'ouvre pas, le panneau
 *    disparaît en DISANT pourquoi, et la requête n'est même pas posée. Le doute
 *    n'interdit rien (offre inconnue ⇒ on laisse faire, le serveur tranche).
 *
 * Une vue est PERSONNELLE (`shared: false`) : partager la sienne sans que
 * personne l'ait demandé encombre l'écran de tout le monde. Le partage se
 * décidera là où on peut aussi le retirer.
 */
export function SavedNeedViews({
  draft,
  onApply,
}: {
  /** Ce qui serait enregistré — les filtres du tiroir ET le terme de recherche. */
  draft: NeedFilters
  onApply: (filters: NeedFilters) => void
}) {
  const { t } = useTranslation('projects')
  const { user } = useSession()
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed

  const views = useSavedViews(SCOPE, { enabled: !locked })
  const create = useCreateSavedView(SCOPE)
  const remove = useRemoveSavedView(SCOPE)

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const items = views.data ?? []
  const criteria = needFiltersToSavedRecord(draft)
  // Le MÊME calcul que celui du serveur (`Object.keys(filters).length > 0`) :
  // compter autrement rendrait le refus de l'écran et celui de l'API différents.
  const hasCriteria = Object.keys(criteria).length > 0
  const mine = items.filter(item => item.ownerId === user?.id).length
  const atCap = mine >= SAVED_VIEWS_MAX_PER_SCOPE

  const refusal = !hasCriteria
    ? t('openNeeds.savedViews.noCriteria')
    : atCap
      ? t('openNeeds.savedViews.full', { max: SAVED_VIEWS_MAX_PER_SCOPE })
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
          toast.success(t('openNeeds.savedViews.saved', { name: trimmed }))
        },
        // Le serveur EXPLIQUE son refus (borne atteinte, nom vide) : le
        // remplacer par un libellé générique perdrait la seule chose utile.
        onError: error => toast.error(error.message || t('openNeeds.savedViews.error')),
      },
    )
  }

  return (
    <Box className="space-y-2 border-t border-border pt-3">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {t('openNeeds.savedViews.title')}
      </Text>

      {locked ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('openNeeds.savedViews.locked')}
        </Text>
      ) : (
        <>
          {views.isLoading ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('openNeeds.savedViews.loading')}
            </Text>
          ) : views.isError ? (
            // « Je n'ai pas pu regarder » n'est pas « tu n'as aucune vue » : une
            // liste vide sur une lecture en échec se lit comme un fait.
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('openNeeds.savedViews.loadError')}
            </Text>
          ) : items.length === 0 ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('openNeeds.savedViews.empty')}
            </Text>
          ) : (
            <Box className="space-y-1">
              {items.map(item => (
                <Box key={item.id} display="flex" className="items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onApply(savedRecordToNeedFilters(item.filters))}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-left text-sm text-[var(--bellum-text-primary)]"
                  >
                    <span className="block truncate">{item.name}</span>
                    {item.shared ? (
                      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('openNeeds.savedViews.shared')}
                      </Text>
                    ) : null}
                  </button>
                  {/* Le serveur ne supprime QUE ce qui m'appartient : proposer
                      le geste sur la vue d'un collègue promettrait un 404. */}
                  {item.ownerId === user?.id ? (
                    <button
                      type="button"
                      aria-label={t('openNeeds.savedViews.remove', { name: item.name })}
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(
                          { id: item.id },
                          {
                            onSuccess: () => toast.success(t('openNeeds.savedViews.removed')),
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
                aria-label={t('openNeeds.savedViews.nameLabel')}
                placeholder={t('openNeeds.savedViews.namePlaceholder')}
                value={name}
                maxLength={80}
                onChange={event => setName(event.target.value)}
              />
              <Button size="sm" disabled={name.trim().length === 0 || create.isPending} onClick={submit}>
                {t('openNeeds.savedViews.confirm')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setNaming(false)
                  setName('')
                }}
              >
                {t('openNeeds.savedViews.cancel')}
              </Button>
            </Box>
          ) : (
            <Button size="sm" variant="outline" disabled={refusal !== null} onClick={() => setNaming(true)}>
              {t('openNeeds.savedViews.save')}
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
