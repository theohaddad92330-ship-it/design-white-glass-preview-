import { Box, Card, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Building2, RadioTower, BriefcaseBusiness, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import type { TabId } from '../../components/AccountDetailTabsBar'

/**
 * Les quatre compteurs de la vue d'ensemble (#1113).
 *
 * « Sur cet encadré, je vois "3 offres détectées" et je ne peux pas cliquer
 * dessus pour que ça m'ouvre le bon onglet. »
 *
 * Un chiffre qui compte des objets et ne mène pas à eux oblige à deviner dans
 * quel onglet ils sont — et « Offres détectées » vit dans le Plan d'action, ce
 * que rien n'annonçait. Chacun ouvre désormais l'onglet où ses objets sont
 * VRAIMENT rendus, pas celui dont le nom ressemble le plus.
 *
 * `accountId` absent (l'aperçu d'une carte, un rendu de test) ⇒ les compteurs
 * restent affichés sans être cliquables : un lien mort est pire qu'une absence
 * de lien.
 */
type OverviewStatsRowProps = {
  /** L'ouverture de l'onglet a besoin du dossier. Absent = compteurs inertes. */
  accountId?: string
  /** #2091 — `undefined` = le calcul qui produit ce compte n'a jamais tourné
   *  (pas de plan / pas de cartographie / pas d'analyse) : rendu « non
   *  mesuré », jamais `0`, qui dirait à tort « calculé, et ça vaut zéro ». */
  offersCount: number | undefined
  contactsCount: number
  subsidiariesCount: number | undefined
  signalsCount: number | undefined
  variant?: 'row' | 'sidebar'
}

export function OverviewStatsRow({
  accountId,
  offersCount,
  contactsCount,
  subsidiariesCount,
  signalsCount,
  variant = 'row',
}: OverviewStatsRowProps) {
  const { t } = useTranslation('accountDetail')
  const isSidebar = variant === 'sidebar'
  const stats = (
    <Box className="p-2.5">
      {/* Les offres à proposer sont calculées PAR le plan (`plan.offers_to_propose`)
          et rendues dans l'onglet Plan d'action — jamais dans « Projets », dont
          le nom est pourtant le plus proche. */}
      <OverviewStat
        icon={BriefcaseBusiness}
        iconClassName="bg-sky-100 dark:bg-sky-300"
        label={t('stats.offers')}
        value={offersCount}
        variant={variant}
        accountId={accountId}
        tab="plan"
      />
      <OverviewStat
        icon={Users}
        iconClassName="bg-[var(--bellum-primary-100)] dark:bg-[var(--bellum-primary-300)]"
        label={t('stats.contacts')}
        value={contactsCount}
        variant={variant}
        accountId={accountId}
        tab="contacts"
      />
      <OverviewStat
        icon={Building2}
        iconClassName="bg-emerald-100 dark:bg-emerald-300"
        label={t('stats.entities')}
        value={subsidiariesCount}
        variant={variant}
        accountId={accountId}
        tab="sites"
      />
      {/* Ce compteur a TOUJOURS porté le nombre de signaux — il était juste
          libellé « Sites prioritaires », d'où le 6 démenti par l'onglet Sites. */}
      <OverviewStat
        icon={RadioTower}
        iconClassName="bg-amber-100 dark:bg-amber-300"
        label={t('stats.signals')}
        value={signalsCount}
        variant={variant}
        accountId={accountId}
        tab="veille"
      />
    </Box>
  )

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-xl',
        isSidebar ? 'flex flex-col p-1 [--card-spacing:0px]' : 'grid grid-cols-2 sm:grid-cols-4',
      )}
    >
      {stats}
    </Card>
  )
}

type OverviewStatProps = {
  icon: React.ElementType
  iconClassName?: string
  label: string
  /** `undefined` = non mesuré (voir `OverviewStatsRowProps`). */
  value: number | undefined
  trend?: number | null
  note?: string | null
  variant?: 'row' | 'sidebar'
  accountId?: string
  /** L'onglet où ces objets sont réellement rendus (#1113). */
  tab?: TabId
}

function OverviewStat({
  icon: Icon,
  iconClassName,
  label,
  value,
  trend,
  note,
  variant = 'row',
  accountId,
  tab,
}: OverviewStatProps) {
  const { t } = useTranslation('accountDetail')
  const isSidebar = variant === 'sidebar'
  const className = cn(
    'flex items-center gap-4',
    isSidebar
      ? 'rounded-lg px-2.5 py-2 hover:bg-[var(--bellum-bg-lighter)]'
      : 'border-r border-t border-[var(--bellum-border)] px-5 py-4 first:border-t-0 even:border-r-0 sm:border-t-0 sm:last:border-r-0 sm:even:border-r',
    accountId && tab && 'cursor-pointer hover:bg-[var(--bellum-bg-lighter)]',
  )
  // Un LIEN et non un `<div onClick>` : ce qui se clique se tabule, s'ouvre
  // dans un onglet, et s'annonce (GA-35).
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    accountId && tab ? (
      <Link to="/accounts/$id" params={{ id: accountId }} search={{ tab }} className={className}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    )

  return (
    <Wrapper>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg',
          isSidebar ? 'h-8 w-8 rounded-md' : 'h-11 w-11',
          iconClassName,
        )}
      >
        <Icon className={cn('text-black', isSidebar ? 'h-4 w-4' : 'h-5 w-5')} />
      </div>
      <div className="min-w-0 flex-1">
        <Text element="p" size={isSidebar ? 'xs' : 'sm'} color="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
        <div className="flex items-baseline gap-2">
          {value === undefined ? (
            // #2091 — le dossier n'a jamais produit ce décompte (pas de plan /
            // pas de cartographie / pas d'analyse) : jamais un `0` qui dirait
            // « calculé, et ça vaut zéro ».
            <UnknownValue reason={t('stats.notComputedYet')} />
          ) : (
            <Text
              element="span"
              size={isSidebar ? 'xl' : '2xl'}
              weight="semibold"
              className="tabular-nums text-[var(--bellum-text-primary)]"
            >
              {value}
            </Text>
          )}
          {trend != null && <span className="text-xs font-medium text-[var(--success-soft-text)]">↑ {trend}%</span>}
        </div>
        {note && (
          <Text element="p" size="xs" className="text-[var(--warning-soft-text)] dark:text-[var(--warning-soft-text)]">
            {note}
          </Text>
        )}
        {trend != null && (
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('stats.vsLast30Days')}
          </Text>
        )}
      </div>
    </Wrapper>
  )
}
