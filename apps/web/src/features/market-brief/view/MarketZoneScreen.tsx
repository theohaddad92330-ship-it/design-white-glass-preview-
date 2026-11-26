import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Badge, Card, Tabs, TabsList, TabsTrigger, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { BriefCharts } from '@/features/brief-blocks/BriefCharts'
import { BriefEsn } from '@/features/brief-blocks/BriefEsn'
import { BriefKnowledge } from '@/features/brief-blocks/BriefKnowledge'
import { BriefKpis } from '@/features/brief-blocks/BriefKpis'
import { BriefSections } from '@/features/brief-blocks/BriefSections'
import { GroupGalaxy } from '../components/GroupGalaxy'
import { LinkedAccounts } from '../components/LinkedAccounts'
import { LocalRules } from '../components/LocalRules'
import { MarketCalendar } from '../components/MarketCalendar'
import { PriceGrid } from '../components/PriceGrid'
import { PriceTrend } from '../components/PriceTrend'
import { ZoneClients } from '../components/ZoneClients'
import { ZonePeople } from '../components/ZonePeople'
import type { RenderAccountLink } from '../components/account-link'
import { useMarketZone } from '../hooks/useMarketZones'
import { formatDate } from '@/lib/locale'

const renderAccountLink: RenderAccountLink = (accountId, children) => (
  <Link
    to="/accounts/$id"
    params={{ id: accountId }}
    className="inline-flex min-h-11 items-center text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
  >
    {children}
  </Link>
)

function Notice({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <Card data-testid={testId} className="border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-4">
      <Text size="sm" className="text-[var(--warning-soft-text)]">
        {children}
      </Text>
    </Card>
  )
}

/**
 * La fiche d'une zone : les blocs du brief (L4a) dans l'ordre du brief de
 * compte — KPI, « Ce que je sais », graphiques, prix, puis repliables, et les
 * GARDE-FOUS en dernier, toujours visibles. Les comptes liés sont cliquables
 * vers leur fiche. Une rubrique absente ne fait aucune ligne.
 */
type ZoneTab = 'knowledge' | 'prices' | 'calendar' | 'actors' | 'people' | 'sections'

/**
 * Refonte Théo (grammaire de `a/comptes-fiche`) — la fiche d'une zone se lit comme une fiche compte :
 * le retour au portefeuille, l'identité (pastille d'initiales, sur-titre, titre, puces du périmètre),
 * puis de VRAIS onglets — chacun n'affiche que son contenu, jamais des blocs empilés. Un onglet sans
 * matière n'existe pas (une absence ne fait aucune ligne). Rien n'est retiré : chaque bloc du brief
 * vit sous l'onglet qui répond à sa question.
 */
export function MarketZoneScreen({ zoneId }: { zoneId: string }) {
  const { t } = useTranslation('marketBrief')
  const zone = useMarketZone(zoneId)
  const [tab, setTab] = useState<ZoneTab>('knowledge')

  if (zone.isLoading) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('list.loading')}
      </Text>
    )
  }
  if (zone.isError || !zone.data) {
    return <Notice testId="market-zone-error">{t('zone.error')}</Notice>
  }

  const { data } = zone
  const brief = data.brief
  const linkedByName = Object.fromEntries(data.linked_accounts.map(account => [account.name, account.account_id]))
  const perimeter = [...data.departments, ...data.cantons, ...data.cities]
  const generatedOn = data.brief_generated_at ? formatDate(data.brief_generated_at) : null

  const linkedAccounts = (
    <LinkedAccounts
      accounts={data.linked_accounts.map(account => ({ id: account.account_id, name: account.name }))}
      renderAccountLink={renderAccountLink}
    />
  )

  const tabs: { key: ZoneTab; label: string; content: ReactNode }[] = brief
    ? [
        {
          key: 'knowledge' as const,
          label: t('zone.tabs.knowledge'),
          content: (
            <>
              <BriefKpis kpis={brief.kpis} />
              <BriefKnowledge rows={brief.what_i_know} t={t} foldAfter={4} />
              <BriefCharts charts={brief.charts} />
            </>
          ),
        },
        ...(brief.price_grid || (brief.price_trend && brief.price_trend.length > 0)
          ? [
              {
                key: 'prices' as const,
                label: t('zone.tabs.prices'),
                content: (
                  <>
                    {brief.price_grid ? <PriceGrid grid={brief.price_grid} /> : null}
                    {brief.price_trend && brief.price_trend.length > 0 ? (
                      <PriceTrend trend={brief.price_trend} currency={brief.price_grid?.currency} />
                    ) : null}
                  </>
                ),
              },
            ]
          : []),
        ...((brief.calendar && brief.calendar.length > 0) || (brief.rules && brief.rules.length > 0)
          ? [
              {
                key: 'calendar' as const,
                label: t('zone.tabs.calendar'),
                content: (
                  <>
                    {brief.calendar && brief.calendar.length > 0 ? <MarketCalendar items={brief.calendar} /> : null}
                    {brief.rules && brief.rules.length > 0 ? <LocalRules rules={brief.rules} /> : null}
                  </>
                ),
              },
            ]
          : []),
        {
          key: 'actors' as const,
          label: t('zone.tabs.actors'),
          // Recette 06/10/2026 : les comptes liés AVANT les longues listes (clients, ESN).
          content: (
            <>
              {linkedAccounts}
              {brief.groups && brief.groups.length > 0 ? <GroupGalaxy groups={brief.groups} /> : null}
              {brief.clients && brief.clients.length > 0 ? (
                <ZoneClients
                  clients={brief.clients}
                  linkedAccountIds={linkedByName}
                  renderAccountLink={renderAccountLink}
                />
              ) : null}
              <BriefEsn esn={brief.esn} t={t} foldAfter={10} />
            </>
          ),
        },
        ...(brief.people.length > 0
          ? [{ key: 'people' as const, label: t('zone.tabs.people'), content: <ZonePeople people={brief.people} /> }]
          : []),
        ...(brief.sections.length > 0
          ? [
              {
                key: 'sections' as const,
                label: t('zone.tabs.sections'),
                content: <BriefSections sections={brief.sections} t={t} />,
              },
            ]
          : []),
      ]
    : []
  const active = tabs.find(entry => entry.key === tab) ?? tabs[0]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-col gap-4">
        {/* Louis 14/10/2026, refonte Pilotage : la veille « Marché » est l'onglet
            de Comptes `/accounts/marches` (elle avait quitté la liste de zones
            en #3828). Le renvoi pointe l'écran qui porte le geste. */}
        <Link
          to="/accounts/marches"
          className="inline-flex min-h-11 items-center self-start rounded-control px-1 text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('zone.back')}
        </Link>
        <div className="flex min-w-0 flex-wrap items-start gap-4">
          <span
            aria-hidden
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-card bg-[var(--accent-soft-bg)] text-lg font-semibold text-[var(--accent-soft-text)]"
          >
            {data.label.trim().slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <Text size="xs" weight="semibold" className="uppercase tracking-wider text-[var(--bellum-text-muted)]">
              {t('zone.eyebrow', { scope: t(`zone.scope.${data.scope}`) })}
            </Text>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)]">
              {t('title', { zone: data.label })}
            </h1>
            <div className="flex flex-wrap items-center gap-2" data-testid="market-zone-chips">
              {/* Le périmètre de la zone en puces — une zone sans départements n'en pose aucune. */}
              {perimeter.map(code => (
                <Badge key={code} variant="default">
                  {code}
                </Badge>
              ))}
              {data.linked_accounts.length > 0 ? (
                <Badge variant="primary">{t('zone.accountsCount', { count: data.linked_accounts.length })}</Badge>
              ) : null}
            </div>
          </div>
          {generatedOn ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('zone.generatedOn', { date: generatedOn })}
            </Text>
          ) : null}
        </div>
      </header>

      {data.brief_invalid ? <Notice testId="market-zone-invalid">{t('zone.invalid')}</Notice> : null}
      {!brief && !data.brief_invalid ? <Notice testId="market-zone-no-brief">{t('zone.noBrief')}</Notice> : null}

      {active ? (
        <Tabs value={active.key} onValueChange={value => setTab(value as ZoneTab)}>
          <TabsList variant="underline" aria-label={t('zone.tabs.label')} className="max-w-full overflow-x-auto">
            {tabs.map(entry => (
              <TabsTrigger key={entry.key} value={entry.key} data-testid={`market-zone-tab-${entry.key}`}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div role="tabpanel" aria-label={active.label} className="flex min-w-0 flex-col gap-5 pt-5">
            {active.content}
          </div>
        </Tabs>
      ) : (
        linkedAccounts
      )}
    </div>
  )
}
