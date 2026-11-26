import {
  effectiveScopeSelection,
  type Account,
  type AnalysisScopeSelection,
  type Contact,
  type ProjectReadRow,
  type SalesProfileForRelevance,
} from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PenLine } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { useAccountCrmSignals } from '@/features/accounts/hooks/useAccountCrmSignals'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'
import { buildAccountWatchData } from '@/features/accounts/model/watchData'
import { distinctWatchEvents } from '@/features/accounts/model/watchEvents'
import { useHiringDomainProfileState } from '@/features/discover/hooks/useHiringDomainProfile'
import { HiringDomainNoticeLine } from '@/features/discover/view/HiringDomainNoticeLine'
import { signalNature, SITE_INFORMATION_NATURE, type LineNature } from '@/features/accounts/model/lineNature'
import { LineNatureBadge } from './LineNatureBadge'
import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { apiFetch } from '@/lib/api'
import { formatDate } from '@/lib/locale'
import { useOptionalContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import { accountMissions, type MissionContact } from './account-missions'
import {
  buildOpportunitySections,
  offersIn,
  RECRUITMENT_SHOWN_FIRST,
  VISION_SHOWN_FIRST,
  type OpportunityCard,
  type OpportunitySections,
  type OtherNeedGroup,
  type TeamNeedCard,
} from './opportunity-cards'
import type { LeadDecisionRow } from './qualificationLeads'

/**
 * #4022 / #4020 (Louis 11/10) — les sections ①②③ de l'écran Opportunités, UNE carte par fait.
 *
 * Remplace, sur cet écran, les blocs Missions (#3823), Besoins et Signaux empilés : chaque carte dit
 * le fait, sa source datée, la personne à contacter liée (coordonnées EN CLAIR, c87) et « Préparer le
 * message » (la préparation existante : le commercial relit et envoie lui-même). Sans personne liée,
 * la carte RESTE et propose « Trouver qui contacter ». Les MÊMES clés React Query que la file des
 * pistes et la veille : aucune lecture neuve. Une section vide ne s'affiche pas.
 */
export function useOpportunitySections(account: Account): {
  sections: OpportunitySections
  contacts: readonly Contact[]
  profile: SalesProfileForRelevance | undefined
  profileFailed: boolean
} {
  const projects = useQuery({
    queryKey: ['projects', 'by-account', account.id],
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${account.id}` }),
  })
  const decisions = useQuery({
    queryKey: ['qualification-leads', 'decisions', account.id],
    queryFn: () => apiFetch<LeadDecisionRow[]>({ path: `/accounts/${account.id}/qualification-leads/decisions` }),
  })
  const contacts = useContactsByAccount(account.id)
  const crmSignals = useAccountCrmSignals(account.id)
  // #4044 — le périmètre géographique DÉCLARÉ du compte = le cadrage de sa dernière analyse (même clé
  // React Query que « Historique des analyses »). Aucune analyse ⇒ aucun périmètre, rien d'écarté.
  const runs = useAccountRuns(account.id)
  const latestRun = runs.data?.[0]
  const perimeter = useMemo(
    () =>
      latestRun
        ? effectiveScopeSelection(
            latestRun.scope_mode,
            (latestRun.scope_selection ?? undefined) as AnalysisScopeSelection | undefined,
          )
        : undefined,
    [latestRun],
  )
  // #3901.6 — les métiers placés DÉCLARÉS séparent les postes visés des autres recrutements.
  const { profile: hiringProfile, failed: profileFailed } = useHiringDomainProfileState()
  const sections = useMemo(() => {
    const signals = distinctWatchEvents(buildAccountWatchData(account, crmSignals).signals)
    const missions = accountMissions({
      rows: projects.data ?? [],
      decisions: decisions.data ?? [],
      contacts: contacts.data ?? [],
      perimeter,
    })
    return buildOpportunitySections({
      signals,
      missions,
      contacts: contacts.data ?? [],
      perimeter,
      ...(hiringProfile ? { profile: hiringProfile } : {}),
    })
  }, [account, crmSignals, projects.data, decisions.data, contacts.data, perimeter, hiringProfile])
  return { sections, contacts: contacts.data ?? [], profile: hiringProfile, profileFailed }
}

/** ① Recrutements — 5 cartes, puis « Voir plus ». */
export function RecruitmentSection({
  cards,
  others = [],
  contacts,
  focusKeys = [],
  profile,
  profileFailed = false,
}: {
  cards: readonly OpportunityCard[]
  /** #3901.6 — les recrutements hors des postes visés, dessous et jamais mélangés aux cartes ci-dessus. */
  others?: readonly OpportunityCard[]
  contacts: readonly Contact[]
  /**
   * #5005.1 — TOUS les postes qu'annonce le résumé d'équipe ② (et non plus le seul premier, #4399) : mis en évidence,
   * dépliés s'ils étaient sous « Voir plus », le premier amené à l'écran.
   */
  focusKeys?: readonly string[]
  /** #4284.10 — le profil de l'espace : une carte hors de son métier le DIT. Absent = aucune marque. */
  profile?: SalesProfileForRelevance
  /** #4284.10 — la lecture du profil a échoué : la section le dit au lieu de laisser croire que tout est dans le métier. */
  profileFailed?: boolean
}) {
  const { t } = useTranslation('projects')
  const { t: tWatch } = useTranslation('accountWatch')
  const [showAll, setShowAll] = useState(false)
  const focusSet = useMemo(() => new Set(focusKeys), [focusKeys])
  const focusIndex = cards.reduce((deepest, card, index) => (focusSet.has(card.key) ? index : deepest), -1)
  const firstFocusKey = cards.find(card => focusSet.has(card.key))?.key ?? null
  useEffect(() => {
    if (focusIndex >= RECRUITMENT_SHOWN_FIRST) setShowAll(true)
  }, [focusSet, focusIndex])
  useEffect(() => {
    if (firstFocusKey) document.getElementById(`posting-${firstFocusKey}`)?.scrollIntoView?.({ block: 'center' })
  }, [firstFocusKey, focusSet, showAll])
  if (cards.length === 0 && others.length === 0) return null
  const hidden = Math.max(0, cards.length - RECRUITMENT_SHOWN_FIRST)
  const shown = showAll ? cards : cards.slice(0, RECRUITMENT_SHOWN_FIRST)
  return (
    <OpportunitySection id="opportunity-recruitment" title={t('opportunityCards.recruitment.title')}>
      {/* #4016.DECATHLON — le compteur « Jobs IT » (#4031) vivait dans le journal des signaux, replié par
          #4022 : il se lit ici, en tête, avec TOUTES les offres des entités du groupe (jamais « 0 » : la
          section n'existe pas sans carte). */}
      <Text
        element="p"
        size="xs"
        color="text-[var(--bellum-text-secondary)]"
        data-testid="recruitment-jobs-count"
        className="tabular-nums"
      >
        {tWatch('stats.jobs.label')} ·{' '}
        {/* #4396.1 — le métier d'abord : « 0 du métier · 7 hors métier » (jamais un total qui noie le métier). */}
        {profile && others.length > 0
          ? t('opportunityCards.recruitment.tradeCount', { inTrade: cards.length, out: others.length })
          : cards.length + others.length}
      </Text>
      {profileFailed ? <HiringDomainNoticeLine notice={{ kind: 'profileError' }} /> : null}
      <ul className="flex flex-col gap-3">
        {shown.map(card => (
          <li
            key={card.key}
            id={`posting-${card.key}`}
            data-focused={focusSet.has(card.key) ? 'true' : undefined}
            className={focusSet.has(card.key) ? FOCUSED_CLASS : undefined}
          >
            <OpportunityCardView card={card} contacts={contacts} section="recruitment" />
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start pointer-coarse:min-h-11"
          onClick={() => setShowAll(value => !value)}
        >
          {showAll ? t('opportunityCards.showLess') : t('opportunityCards.showMore', { count: hidden })}
        </Button>
      ) : null}
      {others.length > 0 ? (
        <details data-testid="recruitment-others" open={cards.length === 0} className="flex flex-col gap-3">
          <summary className="cursor-pointer text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
            {t('opportunityCards.recruitment.others', { count: others.length })}
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {others.map(card => (
              <li key={card.key} id={`posting-${card.key}`}>
                <OpportunityCardView
                  card={card}
                  contacts={contacts}
                  section="recruitment"
                  // #4396.1 — « Autres recrutements » EST hors métier (même prédicat que le rangement, GA-26) : un
                  // espace qui place des CDI avait la liste mais pas la marque.
                  outOfTrade={profile !== undefined}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </OpportunitySection>
  )
}

/**
 * ② Besoins d'équipe — un RÉSUMÉ par équipe / techno (Louis 11/10) : il nomme les postes et renvoie
 * vers leur carte en ① (`onJump`), sans la dupliquer. Sans regroupement, la section ne s'affiche pas.
 */
export function TeamNeedsSection({
  teams,
  others = [],
  onJump,
}: {
  teams: readonly TeamNeedCard[]
  /** #4399.2 — les postes ouverts hors équipe, par famille ; le bloc se tait sans eux. */
  others?: readonly OtherNeedGroup[]
  /** #5005.1 — les clés de TOUS les postes de l'équipe. */
  onJump: (postingKeys: string[]) => void
}) {
  const { t } = useTranslation('projects')
  if (teams.length === 0) return null
  return (
    <OpportunitySection id="opportunity-team" title={t('opportunityCards.team.title')}>
      <ul className="flex flex-col gap-3">
        {teams.map(team => (
          <li key={team.key}>
            {/* #4399 (Louis 21/10, recette) — le bloc est DÉPLIÉ par défaut et LISTE ses postes. Renverse #4022.7
                (12/10, « une offre = une occurrence visible ») : l'offre se lit aussi sur sa carte de ①. */}
            <Card data-testid="opportunity-card" className={CARD_CLASS}>
              <details open data-testid="team-need-group" className="flex flex-col gap-2">
                <summary className="cursor-pointer pointer-coarse:min-h-11">
                  <Text element="h4" size="sm" weight="semibold" className="inline">
                    {t('opportunityCards.team.cardTitle', {
                      team: t(`opportunityCards.team.family.${team.teamKey}`),
                      count: offersIn(team),
                    })}
                  </Text>
                </summary>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                  {team.postings.map(posting => (
                    <li key={posting.key} data-testid="team-need-posting">
                      {posting.title}
                      {posting.offerCount && posting.offerCount > 1
                        ? ` — ${t('opportunityCards.team.postingOffers', { count: posting.offerCount })}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </details>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start pointer-coarse:min-h-11"
                onClick={() => team.postings.length > 0 && onJump(team.postings.map(posting => posting.key))}
              >
                {t('opportunityCards.team.seePostings', { count: offersIn(team) })}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      {others.length > 0 ? <OtherNeedsBlock groups={others} onJump={onJump} /> : null}
    </OpportunitySection>
  )
}

/** #4399.2 — « Autres besoins » : les postes ouverts que les équipes n'ont pas pris, par famille de métier. */
function OtherNeedsBlock({
  groups,
  onJump,
}: {
  groups: readonly OtherNeedGroup[]
  onJump: (postingKeys: string[]) => void
}) {
  const { t } = useTranslation('projects')
  return (
    <div data-testid="other-needs" className="flex flex-col gap-3">
      <Text element="h4" size="sm" weight="semibold">
        {t('opportunityCards.team.otherNeeds')}
      </Text>
      <ul className="flex flex-col gap-3">
        {groups.map(group => (
          <li key={group.key}>
            <Card className={CARD_CLASS}>
              <Text element="p" size="sm" weight="semibold">
                {t('opportunityCards.team.cardTitle', {
                  team: t(`opportunityCards.team.family.${group.family}`),
                  count: group.postings.length,
                })}
              </Text>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {group.postings.map(posting => (
                  <li key={posting.key} data-testid="other-need-posting">
                    {posting.title}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start pointer-coarse:min-h-11"
                onClick={() => group.postings.length > 0 && onJump(group.postings.map(posting => posting.key))}
              >
                {t('opportunityCards.team.seePostings', { count: group.postings.length })}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** ③ Vision / transformation — stratégie, levée, nomination, rachat… ; les programmes publics ouvrent la section. */
export function VisionSection({
  cards,
  contacts,
  children,
}: {
  cards: readonly OpportunityCard[]
  contacts: readonly Contact[]
  /** Les programmes publics (`SignalPrograms`), qui se taisent d'eux-mêmes sans programme. */
  children?: ReactNode
}) {
  const { t } = useTranslation('projects')
  // #4022.2 (recette prod 12/10 : 61 cartes d'un bloc) — 5 d'abord, puis « Voir N de plus ».
  const [showAll, setShowAll] = useState(false)
  const hidden = Math.max(0, cards.length - VISION_SHOWN_FIRST)
  const shown = showAll ? cards : cards.slice(0, VISION_SHOWN_FIRST)
  return (
    <OpportunitySection
      id="opportunity-vision"
      title={t('opportunityCards.vision.title')}
      hideTitle={cards.length === 0}
    >
      {/* #4022.6 — les programmes publics sont DANS cette section (plus de second titre) ; en tête : peu nombreux. */}
      {children}
      {cards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {shown.map(card => (
            <li key={card.key}>
              <OpportunityCardView card={card} contacts={contacts} section="vision" />
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start pointer-coarse:min-h-11"
          onClick={() => setShowAll(value => !value)}
        >
          {showAll ? t('opportunityCards.showLess') : t('opportunityCards.vision.showMore', { count: hidden })}
        </Button>
      ) : null}
    </OpportunitySection>
  )
}

function OpportunitySection({
  id,
  title,
  hideTitle = false,
  children,
}: {
  id: string
  title: string
  hideTitle?: boolean
  children: ReactNode
}) {
  return (
    <section aria-labelledby={hideTitle ? undefined : `${id}-title`} className="flex flex-col gap-3">
      {hideTitle ? null : (
        <Text element="h3" id={`${id}-title`} size="base" weight="semibold">
          {title}
        </Text>
      )}
      {children}
    </section>
  )
}

/**
 * #4328.1 (call refonte UX 19/10 — « texte sans débordement ni superposition ») — une carte peut
 * rétrécir (`min-w-0`) et coupe un mot sans espace (URL, e-mail, intitulé collé) au lieu d'en sortir ;
 * `overflow-wrap` s'hérite, posé ici il couvre tout le texte de la carte.
 */
/** #5005.1 — les postes visés par « Voir les N postes » : un cadre, sans mouvement (grammaire motion). */
const FOCUSED_CLASS = 'rounded-lg ring-2 ring-[var(--bellum-primary-400)]'

const CARD_CLASS =
  'flex min-w-0 flex-col gap-2 border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 [overflow-wrap:anywhere]'

/**
 * #5004.1 — la nature de la carte. Une piste est « à explorer », une mission « demande confirmée » ; un signal de ①
 * se date (récent / historique), un signal de ③ est une « information du site ». Sans fait daté : aucune nature
 * affirmée, le badge se tait (on n'invente ni fraîcheur ni âge).
 */
function cardNature(card: OpportunityCard, section: 'recruitment' | 'vision'): LineNature | null {
  if (card.origin === 'lead') return 'leadToExplore'
  if (card.origin === 'opportunity') return 'confirmedDemand'
  if (section === 'vision') return SITE_INFORMATION_NATURE
  return card.signal ? signalNature(card.signal) : null
}

function OpportunityCardView({
  card,
  contacts,
  section,
  outOfTrade = false,
}: {
  card: OpportunityCard
  contacts: readonly Contact[]
  section: 'recruitment' | 'vision'
  /** #4284.10 — l'offre est hors du métier de l'ESN : la carte le dit. */
  outOfTrade?: boolean
}) {
  const { t } = useTranslation('projects')
  return (
    <Card data-testid="opportunity-card" className={CARD_CLASS}>
      <Text element="h4" size="sm" weight="semibold">
        {card.title}
      </Text>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        <LineNatureBadge nature={cardNature(card, section)} />
        {outOfTrade ? <OutOfTradeTag /> : null}
      </div>
      {card.title !== card.basis.label ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {card.basis.label}
        </Text>
      ) : null}
      <BasisLine card={card} />
      {card.implication ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {card.implication}
        </Text>
      ) : null}
      {card.role ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('opportunityCards.role', { role: card.role })}
        </Text>
      ) : null}
      {card.derivedNeeds.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Text element="p" size="xs" weight="medium">
            {t('opportunityCards.derivedNeeds')}
          </Text>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {card.derivedNeeds.map(need => (
              <li key={need}>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {need}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <WhoToContact contacts={card.contacts} contactsMatch={card.contactsMatch} allContacts={contacts} />
    </Card>
  )
}

/** La source datée, le lieu (un poste) et le lien vérifiable du fait. */
function BasisLine({ card }: { card: OpportunityCard }) {
  const { t } = useTranslation('projects')
  const place = card.place
    ? card.place.rank === 'france'
      ? (card.place.place ?? t('opportunityCards.place.france'))
      : card.place.rank === 'abroad'
        ? card.place.place
          ? t('opportunityCards.place.abroadAt', { place: card.place.place })
          : t('opportunityCards.place.abroad')
        : t('opportunityCards.place.unknown')
    : null
  // V4-CORRECTIFS-C 4294.6 — offres repliées au même intitulé : « N offres (villes) » remplace le lieu d'une seule.
  const folded = card.offerCount
    ? t('opportunityCards.offersFolded', { count: card.offerCount, places: (card.offerPlaces ?? []).join(', ') })
    : null
  // #4294.6 — un fait vu plusieurs fois se dit : « Vu 2 fois » (jamais « 0 », jamais un doublon replié sans un mot).
  const repeated =
    card.seenCount && card.seenCount > 1 ? t('opportunityCards.seenTimes', { count: card.seenCount }) : null
  const origin = [card.basis.source, card.basis.date ? formatDate(card.basis.date) : null, folded ?? place, repeated]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {origin ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {origin}
        </Text>
      ) : null}
      {/* #3917.r42 — une actualité sans date connue se dit sans date, elle ne passe pas pour récente. */}
      {card.signal && !card.basis.date ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="opportunity-card-date-unknown">
          {t('opportunityCards.dateUnknown')}
        </Text>
      ) : null}
      {card.signal ? <SignalSourceLink url={card.basis.sourceUrl} sourceKind={card.basis.sourceKind} /> : null}
    </div>
  )
}

function WhoToContact({
  contacts,
  contactsMatch,
  allContacts,
}: {
  contacts: readonly MissionContact[]
  contactsMatch: 'role' | 'known' | 'none'
  allContacts: readonly Contact[]
}) {
  const { t } = useTranslation('projects')
  // Louis 12/10 soir (#4044) : sans personne recoupée, la carte ne propose RIEN — un bouton
  // « Trouver qui contacter » répété sous chaque signal n'apportait aucune valeur (doctrine :
  // une absence ne fait aucune ligne).
  if (contactsMatch === 'none' || contacts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <Text element="p" size="xs" weight="medium">
        {contactsMatch === 'known'
          ? t('opportunityCards.whoRelated', { count: contacts.length })
          : t('opportunityCards.whoLinked')}
      </Text>
      <ContactRows contacts={contacts} allContacts={allContacts} />
    </div>
  )
}

function ContactRows({
  contacts,
  allContacts,
}: {
  contacts: readonly MissionContact[]
  allContacts: readonly Contact[]
}) {
  const { t } = useTranslation('projects')
  const engagement = useOptionalContactEngagement()
  return (
    <ul className="flex flex-col gap-1.5">
      {contacts.map(contact => {
        const full = allContacts.find(candidate => candidate.id === contact.id) ?? null
        const reach = [contact.email, contact.phone].filter(Boolean).join(' · ')
        return (
          <li key={contact.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-col">
              <Text size="sm" weight="medium">
                {contact.full_name}
              </Text>
              {contact.title ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {contact.title}
                </Text>
              ) : null}
              {/* Coordonnées pro EN CLAIR (c87). */}
              {reach ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {reach}
                </Text>
              ) : null}
            </div>
            {/* #4092 — « Voir la fiche » : la fiche contact canonique. Sans id, rien
                (on n'affiche pas ce qu'on n'a pas). Vrai <Link> : clic droit / nouvel onglet. */}
            {contact.id ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t('opportunityCards.viewProfileFor', { name: contact.full_name })}
                // LOIC-FIX2 O.4 — cible ≥ 44 px partout, pas seulement au doigt.
                className="min-h-11"
                asChild
              >
                <Link to="/contacts/$id" params={{ id: contact.id }}>
                  {t('opportunityCards.viewProfile')}
                </Link>
              </Button>
            ) : null}
            {engagement && full ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={PenLine}
                aria-label={t('opportunityCards.prepareMessageFor', { name: contact.full_name })}
                className="pointer-coarse:min-h-11"
                onClick={() => engagement.openEngagement([full], 'email')}
              >
                {t('opportunityCards.prepareMessage')}
              </Button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
