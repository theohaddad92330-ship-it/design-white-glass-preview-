import { useId, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { RADAR_TECHNOLOGIES } from '@bellum/contracts'
import { Button, FilterChips, Text } from '@bellum/ui'
import { QuietCard } from '@/components/page/LibrarySection'
import { fetchTechnologyRadar } from '@/features/technology-radar/api/technology-radar-api'
import { TechnologyRadarView } from './TechnologyRadarView'

/**
 * #4282.10 — l'ENTRÉE PAR TECHNOLOGIE de Découvrir (décision Louis 19/10 n°16) :
 * la liste FERMÉE en premier (SAP, Salesforce, ServiceNow…), une saisie libre en
 * repli. La technologie vit dans l'URL (`?technology=`) : un lien de Laura
 * (`discover_path`) rouvre exactement ce radar. La collecte est mise en cache 30 j
 * côté IA : relancer la même technologie ne recollecte rien.
 */
export function TechnologyRadarScreen({
  technology,
  onTechnologyChange,
}: {
  technology: string
  onTechnologyChange: (technology: string) => void
}) {
  const { t } = useTranslation('technologyRadar')
  const [draft, setDraft] = useState('')
  const captionId = useId()
  const current = technology.trim()
  const query = useQuery({
    queryKey: ['technology-radar', current.toLowerCase()],
    enabled: current.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: ({ signal }) => fetchTechnologyRadar(current, signal),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const next = draft.trim()
    if (next) onTechnologyChange(next)
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Refonte Théo (PR12) — `.d3-search-card` de Découvrir : la question, la liste
          FERMÉE en premier (rangée de filtres commune, GA-249), puis la saisie libre
          et son bouton principal sur une ligne. Le titre et la phrase vivent dans
          l'en-tête de la coque (`CustomerPage`), jamais répétés ici. */}
      <section
        aria-labelledby={captionId}
        className="flex flex-col gap-4 rounded-card border border-[var(--bellum-border)] bg-card p-5 sm:p-6"
      >
        <Text element="h2" id={captionId} size="lg" weight="semibold">
          {t('searchCaption')}
        </Text>
        <FilterChips<string>
          ariaLabel={t('suggestions')}
          legend={t('suggestions')}
          value={RADAR_TECHNOLOGIES.find(tech => tech.label.toLowerCase() === current.toLowerCase())?.label ?? null}
          onChange={next => {
            if (next) onTechnologyChange(next)
          }}
          options={RADAR_TECHNOLOGIES.map(tech => ({ value: tech.label, label: tech.label }))}
        />
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-[var(--bellum-text-secondary)]">
            {t('inputLabel')}
            <input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              maxLength={80}
              placeholder={t('inputPlaceholder')}
              className="min-h-11 w-full rounded-control border border-[var(--bellum-border)] bg-card px-3 text-sm text-[var(--bellum-text-primary)] focus-visible:border-[var(--bellum-text-accent)] focus-visible:outline-none"
            />
          </label>
          <Button type="submit" className="min-h-11">
            {t('submit')}
          </Button>
        </form>
      </section>

      {!current ? (
        <QuietCard title={t('noRadarYetTitle')}>{t('noRadarYet')}</QuietCard>
      ) : query.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {t('loading')}
        </p>
      ) : query.isError || !query.data ? (
        <p role="alert" className="text-sm text-[var(--danger-soft-text)]">
          {t('error')}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* `.d3-toolbar` — ce que montre la suite : la technologie, et la promesse
              que ce sont les mêmes comptes, dans le même ordre, que Laura. */}
          <div className="flex flex-col gap-1 border-b border-[var(--bellum-border)] pb-4">
            <Text size="2xl" weight="semibold" className="tracking-tight">
              {t('resultTitle', { technology: current })}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('resultHint')}
            </Text>
          </div>
          <TechnologyRadarView radar={query.data} />
        </div>
      )}
    </div>
  )
}
