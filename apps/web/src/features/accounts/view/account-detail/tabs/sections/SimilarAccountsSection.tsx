import type { SimilarAccountSuggestion } from '@bellum/contracts'
import { Box, Button, Card, HelpIcon, Text } from '@bellum/ui'
import { ArrowRight, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { compactSector } from '@bellum/utils'

type SimilarAccountsSectionProps = {
  items: SimilarAccountSuggestion[]
  variant?: 'row' | 'sidebar'
}

export function SimilarAccountsSection({ items, variant = 'row' }: SimilarAccountsSectionProps) {
  const { t } = useTranslation('accountDetail')
  const navigate = useNavigate()
  const isSidebar = variant === 'sidebar'

  return (
    <Card className={isSidebar ? 'p-4' : 'mb-4 p-4'}>
      <div className="mb-3 flex items-center gap-2">
        <Text element="h2" size="base" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('similar.toAnalyzeTitle')}
        </Text>
        <HelpIcon title={t('similar.help')} />
      </div>
      <div className={isSidebar ? 'space-y-1' : '-mx-1 flex gap-3 overflow-x-auto px-1 pb-3'}>
        {items.map(item => (
          <Button
            key={item.id}
            variant="ghost"
            type="button"
            onClick={() => void navigate({ to: '/search', search: { company: item.company_name } })}
            className={
              isSidebar
                ? 'group flex w-full items-start gap-3 rounded-lg p-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bellum-surface-2)] active:scale-[0.99]'
                : 'group flex w-52 shrink-0 cursor-pointer flex-col gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-4 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bellum-surface-2)] active:scale-[0.99]'
            }
          >
            {isSidebar ? (
              <>
                <CompanyAvatar name={item.company_name} size="md" />
                <div className="min-w-0 flex-1 space-y-1">
                  <Box className="flex min-w-0 items-center gap-2">
                    <Text size="xs" weight="semibold" noWrap className="truncate text-[var(--bellum-text-primary)]">
                      {item.company_name}
                    </Text>
                    {/* #1315.3 — secteur lisible, texte complet en infobulle. */}
                    <span
                      title={item.sector ?? undefined}
                      className="shrink-0 rounded-full border border-[var(--bellum-border)] px-1.5 py-0 text-xs font-medium text-[var(--bellum-text-secondary)]"
                    >
                      {compactSector(item.sector)}
                    </span>
                  </Box>
                  <Text size="xs" className="line-clamp-2 text-[var(--bellum-text-secondary)] leading-relaxed">
                    {item.description}
                  </Text>
                </div>
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] opacity-0 transition-[opacity,color] duration-150 group-hover:text-[var(--bellum-text-primary)] group-hover:opacity-100">
                  <ArrowRight className="size-3.5" />
                </span>
              </>
            ) : (
              <>
                <Box className="flex items-center justify-between">
                  <CompanyAvatar name={item.company_name} size="lg" />
                  <ArrowRight className="size-4 text-[var(--bellum-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </Box>
                <div className="min-w-0">
                  <Text element="p" size="sm" weight="semibold" className="truncate text-[var(--bellum-text-primary)]">
                    {item.company_name}
                  </Text>
                  <Text
                    element="p"
                    size="xs"
                    color="text-[var(--bellum-text-secondary)]"
                    title={item.sector ?? undefined}
                    className="truncate"
                  >
                    {compactSector(item.sector)}
                  </Text>
                </div>
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('similar.potentialScore')}
                </Text>
              </>
            )}
          </Button>
        ))}
        {!isSidebar && (
          <button
            type="button"
            onClick={() => void navigate({ to: '/search' })}
            className="flex w-52 shrink-0 flex-col items-center justify-center gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-4 text-center transition-colors hover:bg-[var(--bellum-surface-2)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bellum-primary-100)] text-black dark:bg-[var(--bellum-primary-300)]">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                {t('similar.launchAnalysis')}
              </Text>
              <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
                {t('similar.discover')}
              </Text>
            </div>
          </button>
        )}
      </div>
    </Card>
  )
}
