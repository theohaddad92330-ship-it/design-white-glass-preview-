import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarCheck, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { consultantsApi } from '../api'

/**
 * Le brief de soutenance d'un consultant sur un besoin.
 *
 * ⚠️ `buildConsultantBrief` est DÉTERMINISTE, testé, exposé par une route, et
 * son client web (`consultantsApi.brief`) existait sans aucun appelant — un
 * `grep .brief(` sur `apps/web` ne rendait que sa propre déclaration. Le défaut
 * était déjà consigné au tracker du PDF 4 (X6) et n'avait pas été repris.
 *
 * Il n'appelle aucun modèle : forces, objections et plan à trente jours sont
 * dérivés du matching. Les OBJECTIONS sont affichées au même relief que les
 * forces — c'est la règle de l'écran de matching, et pour la même raison : le
 * client les posera de toute façon en soutenance.
 */
export function ConsultantBriefDialog({
  open,
  consultantId,
  opportunityId,
  onClose,
}: {
  open: boolean
  consultantId: string
  opportunityId: string
  onClose: () => void
}) {
  const { t } = useTranslation('consultants')

  const brief = useQuery({
    queryKey: ['consultant-brief', consultantId, opportunityId],
    queryFn: () => consultantsApi.brief(consultantId, opportunityId),
    enabled: open,
    staleTime: 0,
  })

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('brief.title')}</DialogTitle>
          <DialogDescription>{t('brief.description')}</DialogDescription>
        </DialogHeader>

        {brief.isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : null}

        {/* Un échec de lecture ne se rend JAMAIS comme un brief vide : ce serait
            faire croire que le matching n'a rien à dire sur ce profil. */}
        {brief.isError ? (
          <Text size="sm" color="text-muted-foreground">
            {t('brief.loadError')}
          </Text>
        ) : null}

        {brief.data ? (
          <div className="space-y-4">
            <Text element="p" size="sm" color="text-muted-foreground">
              {brief.data.context}
            </Text>

            <Section
              icon={<Sparkles className="size-3.5 text-[var(--bellum-text-accent)]" />}
              title={t('brief.strengths')}
              items={brief.data.strengths}
              empty={t('brief.noStrengths')}
            />
            <Section
              icon={<AlertTriangle className="size-3.5 text-[var(--warning-soft-text)]" />}
              title={t('brief.objections')}
              items={brief.data.objections}
              empty={t('brief.noObjections')}
            />
            <Section
              icon={<CalendarCheck className="size-3.5 text-[var(--bellum-text-accent)]" />}
              title={t('brief.planJ30')}
              items={brief.data.planJ30}
              empty={t('brief.noPlan')}
            />
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Une section du brief. Une liste vide le DIT — elle ne disparaît pas. */
function Section({
  icon,
  title,
  items,
  empty,
}: {
  icon: React.ReactNode
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <Text element="h4" size="xs" weight="semibold" color="text-muted-foreground">
          {title}
        </Text>
      </div>
      {items.length === 0 ? (
        <Text element="p" size="sm" color="text-muted-foreground">
          {empty}
        </Text>
      ) : (
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" />
              <Text element="p" size="sm">
                {item}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
