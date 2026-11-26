import { useState } from 'react'
import type { InverseMatch } from '@bellum/contracts'
import { Badge, Box, Button, Card, FilterChips, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { TransparencyBanner } from './TransparencyBanner'
import { matchingApi } from '../api'

/**
 * « À quels besoins ce profil répond ? » (PDF 4 §5.2, BEL-MTC-304).
 *
 * C'est le cœur de l'intercontrat, et le geste qui n'était pas outillé : quand
 * un consultant se libérait, quelqu'un relisait les besoins à la main.
 *
 * La règle qui le porte est celle du N14 : un consultant libre le 1er septembre
 * n'est « recommandé » que sur un besoin démarrant après. Les autres sont
 * montrés avec leur motif `unavailable_at_start` plutôt que cachés — un
 * recruteur peut décaler un démarrage, un algorithme non.
 */
export function InverseMatchPanel({ consultantId }: { consultantId: string }) {
  const { t } = useTranslation('matching')
  const navigate = useNavigate()
  const [scope, setScope] = useState<'mine' | 'all'>('all')
  const [run, setRun] = useState<InverseMatch | null>(null)
  const [loading, setLoading] = useState(false)

  const launch = () => {
    setLoading(true)
    matchingApi
      .inverse(consultantId, scope)
      .then(setRun)
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setLoading(false))
  }

  return (
    <Card className="p-4">
      <Text element="h3" size="base" weight="semibold">
        {t('inverse.title')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('inverse.subtitle')}
      </Text>

      {/* Le matching INVERSE classe des besoins pour une personne — c'est
          toujours un classement de personnes au sens de l'Annexe III, vu par
          l'autre bout. Le bandeau y était absent. */}
      <TransparencyBanner />

      <Box display="flex" className="mt-3 flex-wrap items-center gap-2">
        <FilterChips
          ariaLabel={t('inverse.scopeAria')}
          options={[
            { value: 'all', label: t('inverse.scopeAll') },
            { value: 'mine', label: t('inverse.scopeMine') },
          ]}
          value={scope}
          onChange={next => next && setScope(next)}
        />
        <Button size="sm" onClick={launch} disabled={loading}>
          {loading ? t('loading') : t('inverse.launch')}
        </Button>
      </Box>

      {run ? (
        run.needs.length === 0 ? (
          <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
            {t('inverse.empty')}
          </Text>
        ) : (
          <Box display="flex" className="mt-4 flex-col gap-2">
            {run.needs.map(entry => (
              <Box
                key={entry.need.needId ?? entry.need.role}
                display="flex"
                className="items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <Text size="sm" weight="medium">
                    {entry.need.role}
                    {entry.need.accountName ? ` · ${entry.need.accountName}` : ''}
                  </Text>
                  <Box display="flex" className="mt-1 flex-wrap gap-1">
                    <Badge variant="outline">{t(`buckets.${bucketKey(entry.result.bucket)}`)}</Badge>
                    {entry.result.exclusions.map(exclusion => (
                      <Badge key={exclusion.reason} variant="default">
                        {t(`reasons.${exclusion.reason}`)}
                      </Badge>
                    ))}
                  </Box>
                </div>
                <Box display="flex" className="shrink-0 items-center gap-3">
                  <Text size="sm" weight="semibold">
                    {entry.result.pushableScore}
                  </Text>
                  {entry.need.needId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void navigate({ to: '/projects/needs', search: { match: entry.need.needId as string } })
                      }
                    >
                      {t('inverse.open')}
                    </Button>
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>
        )
      ) : null}
    </Card>
  )
}

function bucketKey(bucket: string): string {
  return bucket === 'not_evaluable' ? 'notEvaluable' : bucket
}
