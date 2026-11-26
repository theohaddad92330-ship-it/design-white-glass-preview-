import type { Account, Contact, RecentSignal } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { orgPersonSlug } from '@bellum/utils'
import { DossierCard } from '../../theo/DossierBlocks'
import { ArrowRight, DoorOpen, Radio, Route } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatSignalDateIfKnown } from '@/lib/signal-date'
import { SourceChip } from '@/components/primitives/SourceChip'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { resolveTab } from '../../accountDetailSearch'
import type { DossierReadView } from '../evaluation/dossierReadViewData'
import { useAccountOverviewData } from '../useAccountOverviewData'
import { rankSignals } from './accountSynthesis'
import { signalsEmptyLabel, unreachableSignalFamilies, type SignalCoverage } from '../sections/signalCoverageText'

type AccountSynthesisCardsProps = {
  accountId: string
  contacts: Contact[]
  signals: RecentSignal[]
  /** #3817.2 — ce que la recherche a pu consulter ; absent = analyse antérieure. */
  signalCoverage?: SignalCoverage
  dossierRead: DossierReadView | null
  immediateActionLabel: string | null
  onTabChange: (tab: TabId) => void
  /** Refonte Théo (23/10) — `bare` : les cartes sans leur rangée, posées dans la grille « Ce que je sais » ;
   *  la prochaine action y vit À PART, dans le panneau « À faire ensuite » (`AccountNextStepAside`). */
  layout?: 'row' | 'bare'
}

/**
 * #3499 — LES TROIS CARTES DU HAUT DE LA SYNTHÈSE (décision 1.c).
 *
 * Signal principal · Meilleure porte d'entrée · Prochaine action — trois au
 * plus, de même hauteur. Une carte SANS donnée ne s'affiche pas : aucune carte
 * vide, aucun « pas encore de signal » en texte nu. Quand aucune n'a de quoi
 * dire, la rangée entière disparaît.
 *
 * Elles REMPLACENT les tuiles `MainSignalCard` / `BestContactCard` /
 * `NextActionCard` et les blocs `DossierEntryPointCard` / l'ancienne carte d'action
 * qui disaient la même chose deux fois dans la colonne ouverte (GA-26). Le
 * classement des contacts est le MÊME que celui de l'onglet Contacts
 * (`useContactRanking`) — jamais un second classement.
 *
 * Référence visuelle : `SimpleCard` de `DossierReadBlocks.tsx` (carte, icône
 * d'accent, titre `sm` semibold, une phrase, un geste).
 */
export function AccountSynthesisCards({
  accountId,
  contacts,
  signals,
  signalCoverage,
  dossierRead,
  immediateActionLabel,
  onTabChange,
  layout = 'row',
}: AccountSynthesisCardsProps) {
  const { t } = useTranslation('accountDetail')
  const { t: tOrg } = useTranslation('accountOrg')
  const ranking = useContactRanking(accountId, {})
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])

  const signal = rankSignals(signals)[0] ?? null

  const top = Array.isArray(ranking.data?.ranked) ? (ranking.data.ranked[0] ?? null) : null
  const rankedContact = top ? (contactsById.get(top.contact_id) ?? null) : null
  const rankedWhy =
    top && top.explanation.who.measured ? tOrg(`priorityPath.explanation.codes.${top.explanation.who.code}`) : null
  const entryPoint = dossierRead?.bestEntryPoint ?? null
  const entryWho = rankedContact
    ? [rankedContact.full_name, rankedContact.title].filter(Boolean).join(' — ')
    : (entryPoint?.label ?? null)
  const entryWhy = rankedContact ? (rankedWhy ?? entryPoint?.why ?? null) : (entryPoint?.why ?? null)

  // #4324.3 — « meilleure porte d'entrée » et l'onglet Contacts doivent lire la MÊME population, ou l'écart est
  // NOMMÉ ici : un nom que le dossier désigne sans qu'aucun contact ne le porte, ou un contact classé mais masqué.
  const entryGap: 'off_list' | 'hidden' | null = rankedContact
    ? rankedContact.hidden === true
      ? 'hidden'
      : null
    : entryPoint?.label &&
        !contacts.some(contact => orgPersonSlug(contact.full_name) === orgPersonSlug(entryPoint.label ?? ''))
      ? 'off_list'
      : null

  const actionLabel = dossierRead?.nextAction?.label ?? immediateActionLabel ?? null
  // Lu SEULEMENT quand le dossier nomme un onglet : sinon, le plan.
  const requestedTab = dossierRead?.nextAction?.tab ?? null
  // #3720.1 — la clé enregistrée passe par la MÊME table d'alias que l'URL : une suggestion d'avant la
  // suppression d'un onglet (`programs`, `signaux`, `score`) retombe sur l'onglet qui le porte, pas sur « plan ».
  const actionTab: TabId = resolveTab(requestedTab) ?? 'plan'

  // #3817.2 — zéro signal n'est jamais « marché vide » (doctrine) : une
  // source injoignable garde la carte, nommée, plutôt que de la faire
  // disparaître comme une liste réellement vide (GA-18/19 priment ici sur la
  // règle locale « carte sans donnée ne s'affiche pas » du 01/10/2026 — une
  // recherche RÉELLEMENT consultée et vide, elle, reste muette : voir #3817).
  const unreachableFamilies = unreachableSignalFamilies(signalCoverage, t)
  const signalGap =
    !signal?.signal && signalCoverage?.status === 'incomplete' && unreachableFamilies.length > 0
      ? signalsEmptyLabel(signalCoverage, unreachableFamilies, t)
      : null

  const cards: ReactNode[] = []
  if (signal?.signal) {
    const meta = [signal.source, formatSignalDateIfKnown(signal.date)].filter(Boolean).join(' · ')
    cards.push(
      <SynthesisCard
        key="signal"
        icon={<Radio className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
        title={t('synthesis.cards.signalTitle')}
        cta={t('synthesis.cards.signalCta')}
        onCta={() => onTabChange('veille')}
        testId="synthesis-card-signal"
      >
        <Text
          element="p"
          size="sm"
          weight="medium"
          className="line-clamp-3 break-words text-[var(--bellum-text-primary)]"
        >
          {signal.signal}
        </Text>
        {signal.sales_implication ? (
          <Text element="p" size="xs" className="line-clamp-2 break-words text-[var(--bellum-text-secondary)]">
            {t('synthesis.cards.signalWhat', { implication: signal.sales_implication })}
          </Text>
        ) : null}
        {meta ? (
          <Text element="p" size="xs" className="break-words text-[var(--bellum-text-muted)]">
            {t('synthesis.cards.signalSource', { source: meta })}
          </Text>
        ) : null}
        {/* #3925 — le lien vers la PREUVE du signal principal (« Voir l'offre », « Voir l'article »…) :
            la Synthèse le nommait sans le rendre cliquable (recette démo SNCF 10/10). */}
        {/* Théo A comptes-fiche — la source est VISIBLE sur la carte : site d'origine + ↗, sans ouvrir de détail. */}
        <SourceChip sources={[{ url: signal.url }]} />
      </SynthesisCard>,
    )
  } else if (signalGap) {
    cards.push(
      <SynthesisCard
        key="signal"
        icon={<Radio className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
        title={t('synthesis.cards.signalTitle')}
        cta={t('synthesis.cards.signalCta')}
        onCta={() => onTabChange('veille')}
        testId="synthesis-card-signal"
      >
        <Text element="p" size="sm" className="line-clamp-3 break-words text-[var(--bellum-text-secondary)]">
          {signalGap}
        </Text>
      </SynthesisCard>,
    )
  }
  if (entryWho) {
    cards.push(
      <SynthesisCard
        key="entry"
        icon={<DoorOpen className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
        title={t('synthesis.cards.entryTitle')}
        cta={rankedContact ? t('synthesis.cards.entryCta') : t('synthesis.cards.entryCtaPath')}
        onCta={() => onTabChange('contacts')}
        testId="synthesis-card-entry"
      >
        <Text
          element="p"
          size="sm"
          weight="medium"
          className="line-clamp-2 break-words text-[var(--bellum-text-primary)]"
        >
          {entryWho}
        </Text>
        {entryWhy ? (
          <Text element="p" size="xs" className="line-clamp-2 break-words text-[var(--bellum-text-secondary)]">
            {entryWhy}
          </Text>
        ) : null}
        {entryGap ? (
          <Text
            element="p"
            size="xs"
            className="break-words text-[var(--bellum-text-muted)]"
            data-testid="synthesis-entry-gap"
          >
            {t(`synthesis.cards.entryGap.${entryGap}`)}
          </Text>
        ) : null}
      </SynthesisCard>,
    )
  }
  if (actionLabel && layout === 'row') {
    cards.push(
      <SynthesisCard
        key="action"
        icon={<Route className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />}
        title={t('synthesis.cards.actionTitle')}
        cta={t('synthesis.cards.actionCta')}
        onCta={() => onTabChange(actionTab)}
        primary
        testId="synthesis-card-action"
      >
        <Text
          element="p"
          size="sm"
          weight="medium"
          className="line-clamp-3 break-words text-[var(--bellum-text-primary)]"
        >
          {actionLabel}
        </Text>
      </SynthesisCard>,
    )
  }

  if (cards.length === 0) return null
  if (layout === 'bare') return <>{cards}</>
  return (
    <div data-testid="synthesis-cards" className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
      {cards}
    </div>
  )
}

function SynthesisCard({
  title,
  cta,
  onCta,
  primary = false,
  testId,
  children,
}: {
  icon: ReactNode
  title: string
  cta: string
  onCta: () => void
  primary?: boolean
  testId: string
  children: ReactNode
}) {
  // Refonte Théo (23/10) — `.ac20-card` : sur-titre en capitales, corps, pied d'action sous un filet.
  return (
    <DossierCard
      testId={testId}
      eyebrow={title}
      footer={
        <Button
          type="button"
          onClick={onCta}
          icon={ArrowRight}
          iconPosition="right"
          variant={primary ? 'black' : 'ghost'}
          size="sm"
          className="w-fit"
        >
          {cta}
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </DossierCard>
  )
}

/**
 * Refonte Théo (23/10) — « À faire ensuite » (`.ac20-next`) : la MÊME prochaine action que la carte « Action »
 * (lecture du dossier d'abord, action immédiate sinon), dans le panneau de droite du regard de Laura.
 * Rien à proposer → aucun panneau (jamais une case vide).
 */
export function useSynthesisNextAction(account: Account): { label: string; tab: TabId } | null {
  const overview = useAccountOverviewData(account)
  const label = overview.dossierRead?.nextAction?.label ?? overview.immediateActionLabel ?? null
  if (!label) return null
  return { label, tab: resolveTab(overview.dossierRead?.nextAction?.tab ?? null) ?? 'plan' }
}

/**
 * #3499 — le point de montage des trois cartes au niveau du DOSSIER
 * (`AccountDetail`), juste sous « Ce qu'il faut retenir » : au-dessus des
 * bandeaux, de la ligne de contexte et de la barre d'onglets. Même lecture
 * du dossier que la Synthèse (`useAccountOverviewData`, GA-26).
 */
export function AccountSynthesisTop({
  account,
  contacts,
  onTabChange,
  layout,
}: {
  account: Account
  contacts: Contact[]
  onTabChange: (tab: TabId) => void
  layout?: 'row' | 'bare'
}) {
  const overview = useAccountOverviewData(account)
  return (
    <AccountSynthesisCards
      layout={layout ?? 'row'}
      accountId={account.id}
      contacts={contacts}
      signals={(overview.recent_signals ?? []) as RecentSignal[]}
      signalCoverage={overview.signal_coverage}
      dossierRead={overview.dossierRead}
      immediateActionLabel={overview.immediateActionLabel}
      onTabChange={onTabChange}
    />
  )
}
