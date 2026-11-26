import type { SalesProfileForRelevance } from '@bellum/contracts'
import { BelowTargetMark } from './BelowTargetMark'
import { OutOfTradeMark } from './OutOfTradeMark'
import { OutOfTradeTag } from './OutOfTradeTag'
import { CandidateProvenance } from './CandidateProvenance'
import { SkillEvidenceLine, SkillEvidenceOffers } from './SkillSearch'
import { WidenedChip } from './WideningNotice'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  ChevronRight,
  ClipboardList,
  FileText,
  Landmark,
  MapPin,
  Pin,
  PinOff,
  Plus,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, cn } from '@bellum/ui'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { portfolioBadgeFor, notSearchedAxes } from '@/features/discover/lib/discover-presentation'
import { candidateGeographyLine } from '@/features/discover/lib/discover-geography'
import { candidateZoneLine } from '@/features/discover/lib/discover-zone-widening'
import { formatSiren } from '@/features/discover/lib/discover-normalize'
import { candidateSiteCities } from '@/features/discover/lib/discover-site-cities'
import { discoverQuickPassEntry } from '@/features/discover/lib/discover-quick-pass'
import { sourceEvidenceCount, sourceEvidenceKey } from '@/features/discover/lib/discover-source-axes'
import { matchedSearchCriteria, type UnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { PartnerComplementarityScore } from '@/features/discover/lib/discover-partner-complementarity'
import { publishedHeadcount, type DiscoverCandidate } from '@/features/discover/lib/discover-types'
import {
  candidateCardFacts,
  cardFactFamilyOf,
  isOutOfTradeFact,
  outOfTradeFactsLast,
  type CardFact,
} from '@/features/discover/lib/discover-card-facts'
import { factNatureLabelKey } from '@/features/discover/lib/discover-fact-type'
import { historicalNeedsCount, sizeBandOf } from '@/features/discover/lib/discover-overview'
import { CandidateActions } from './CandidateActions'
import { CandidateFacts, CandidateWeighed, FactSourceLink, formatFactDate } from './CandidateFacts'
import { CandidateSignalHistory } from './CandidateSignalHistory'
import { HistoryReasonLine } from './HistoryReasonLine'
import type { HistoryReason } from '@/features/discover/lib/discover-history-blocks'
import { AskLaura } from '@/components/primitives/AskLaura'
import { CandidateRowDetails } from './CandidateRowDetails'
import { PersonNameMark } from './PersonNameMark'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'

/* ------------------------------------------------------------------ */
/*  #4495 (Louis 24/10, maquette V22) — LA CARTE de compte, une ligne   */
/*  large en TROIS zones : voir pourquoi regarder un compte sans        */
/*  l'ouvrir.                                                           */
/*                                                                     */
/*   gauche : case · logo/initiales · nom · secteur · ville · tranche · */
/*            « Déjà dans ton espace » ;                                */
/*   centre : étiquettes d'expertise · LE sujet en gras · sa nature en  */
/*            une ligne, avec son icône ;                               */
/*   droite : badge de nature · compteurs (signaux forts, historiques,  */
/*            besoins) · suivre (épingler / ajouter) · chevron vers      */
/*            l'« Aperçu du compte ».                                    */
/*                                                                     */
/*  Ce que la ligne d'avant portait en plus (#3597 / #4068.3 : faits     */
/*  datés, historique, preuves de compétence, ce qui a pesé, critères   */
/*  satisfaits, non cherché, sites, groupe, Laura, dossier, écarter…)   */
/*  n'est PAS supprimé : il est dans l'aperçu, en tête (« L'essentiel »).*/
/*                                                                     */
/*  Une valeur absente ne fait AUCUNE ligne et ne s'affiche jamais      */
/*  « 0 » (GA-18 / GA-19).                                              */
/* ------------------------------------------------------------------ */

/** Au plus trois étiquettes d'expertise : celles des faits forts, puis la pile observée. */
const MAX_EXPERTISE_TAGS = 3

const FAMILY_ICON: Readonly<Record<ReturnType<typeof cardFactFamilyOf>, LucideIcon>> = {
  hiring: UserRound,
  project: FileText,
  public_market: Landmark,
}

function expertiseTags(strong: readonly CardFact[], observed: readonly string[] | undefined): string[] {
  const seen = new Map<string, string>()
  for (const tag of [...strong.flatMap(fact => fact.technologies ?? []), ...(observed ?? [])]) {
    const key = tag.trim().toLowerCase()
    if (key && !seen.has(key)) seen.set(key, tag.trim())
  }
  return [...seen.values()].slice(0, MAX_EXPERTISE_TAGS)
}

interface CandidateRowProps {
  candidate: DiscoverCandidate
  isFollowed: boolean
  onToggleFollow: () => void
  onDismiss: () => void
  onAnalyze: () => void
  /** #2166.54 — sélection multiple. `undefined` = pas de case. */
  selected?: boolean
  onToggleSelected?: () => void
  /** #2151.36 — dans le repliable ; fourni SEULEMENT en recherche ESN/partenaire. */
  partnerComplementarity?: PartnerComplementarityScore
  /** Le repliable s'ouvre fermé (#3597.7) ; `true` sert aux tests du détail. */
  defaultOpen?: boolean
  /** #3819.1 — les critères RÉELLEMENT posés par l'utilisateur (secteur, zone,
   *  effectif) : sert à nommer ceux que ce candidat satisfait, jamais à en
   *  deviner. `undefined` hors recherche (ex. panneau « Comptes comparables »). */
  searchCriteria?: UnifiedFilters
  /** #3819.11 / #3901.9 — les SIREN des AUTRES entreprises de la réponse au même nom ; vide/absent = aucune ligne. */
  homonymSirens?: readonly string[]
  /** #4284.1 — le métier de l'espace, pour marquer une offre « hors de ton métier » ; absent = profil non lu. */
  relevanceProfile?: SalesProfileForRelevance
  /** #4495 — `tile` : la vue « colonnes » (les trois zones empilées) ; `row` (défaut) : la ligne large. */
  layout?: 'row' | 'tile'
  /** #4758 — pourquoi ce compte remonte sans signal récent : son historique de besoins, nommé. Absent = la ligne ne s'écrit pas. */
  historyReason?: HistoryReason | null
  /** #4677 — la recherche des signaux court encore (défaut) ; `false` = finie : la pastille « en cours » se retire. */
  signalsSearching?: boolean
  /** #5069 (lot 777) — le rayon cherché (km) : la ligne de zone dit la distance et ne parle d'élargissement qu'au-delà. */
  searchedRadiusKm?: number
}

export function CandidateRow({
  candidate,
  isFollowed,
  onToggleFollow,
  onDismiss,
  onAnalyze,
  selected,
  onToggleSelected,
  partnerComplementarity,
  defaultOpen = false,
  searchCriteria,
  homonymSirens,
  relevanceProfile,
  layout = 'row',
  historyReason = null,
  signalsSearching = true,
  searchedRadiusKm,
}: CandidateRowProps) {
  const { t, i18n } = useTranslation('discover')
  // #5069 (lot 777) — la ligne de zone se juge carte par carte contre le rayon cherché (distance, « Élargi » hors rayon).
  const zoneText = candidateZoneLine(candidate.zone, i18n.language ?? 'fr', searchedRadiusKm)
  const siteCities = candidateSiteCities(candidate)
  const geographyLine = candidateGeographyLine(candidate.geography)
  // #4436.3 — un libellé nul venu d'une source (« 0 salarié ») se tait comme un effectif absent.
  const headcount = publishedHeadcount(candidate.headcountRange)
  const [open, setOpen] = useState(defaultOpen)
  const badge = portfolioBadgeFor(candidate, { locallyWatched: isFollowed })
  // #3597.3 — le verdict de passe rapide : calcul inchangé, sans crédit, sans appel.
  const quickPass = useMemo(() => discoverQuickPassEntry(candidate), [candidate])
  // #3819.1 — « avant analyse » : ce qui est déjà collecté, ou dit non cherché.
  const notSearched = notSearchedAxes(candidate)
  const matchedCriteria = searchCriteria ? matchedSearchCriteria(candidate, searchCriteria) : []
  // #4068 — UNE hiérarchie, décidée au contrat : 5 forts sur la ligne, 10 de
  // contexte dans le repliable, le reste au dossier. Les sources décisives de
  // l'espace concourent aux mêmes places, sous leur nature.
  const cardFacts = useMemo(
    () =>
      candidateCardFacts(candidate, {
        spaceLabel: axis =>
          t(`sourceAxes.evidence.${sourceEvidenceKey(axis)}`, {
            ...axis.label_params,
            count: sourceEvidenceCount(axis),
          }),
      }),
    [candidate, t],
  )

  // #4495 — LE sujet : le fait fort le plus récent (à défaut, le contexte). Aucun fait → aucune ligne.
  // #4284.1 (recette prod 25/10) — une offre HORS du métier de l'ESN ne porte plus la pertinence de la carte tant qu'un
  // fait du métier existe : elle passe après (partition stable, rien n'est retiré) ; si elle reste le sujet, elle se DIT.
  const subjectPool = useMemo(
    () => [...outOfTradeFactsLast(cardFacts.strong, relevanceProfile), ...cardFacts.context],
    [cardFacts, relevanceProfile],
  )
  const subject = subjectPool[0]
  const subjectOutOfTrade = subject ? isOutOfTradeFact(subject, relevanceProfile) : false
  const tags = expertiseTags(cardFacts.strong, candidate.technologiesObserved)
  const historical = historicalNeedsCount(candidate)
  const knownNeeds = candidate.knownNeedsCount
  const sizeBand = sizeBandOf(candidate.headcountRange)
  const inSpace = candidate.portfolioState !== 'new'
  const SubjectIcon = subject ? FAMILY_ICON[cardFactFamilyOf(subject)] : Zap
  const counters = [
    cardFacts.strong.length > 0
      ? { key: 'strong', icon: Zap, text: t('card.strongCount', { count: cardFacts.strong.length }) }
      : null,
    historical !== null && historical > 0
      ? { key: 'historical', icon: ClipboardList, text: t('card.historicalCount', { count: historical }) }
      : null,
    knownNeeds !== undefined && knownNeeds > 0
      ? { key: 'needs', icon: ClipboardList, text: t('card.knownNeeds', { count: knownNeeds }) }
      : null,
  ].filter((counter): counter is { key: string; icon: LucideIcon; text: string } => counter !== null)

  return (
    <article
      data-testid="candidate-row"
      aria-label={candidate.name}
      className={cn(
        'grid grid-cols-1 items-center gap-4 rounded-card border p-4 transition-colors sm:p-5',
        layout === 'row' && 'md:grid-cols-[minmax(15rem,1fr)_minmax(16rem,1.4fr)_auto] md:gap-6',
        selected
          ? 'border-[var(--bellum-text-accent)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,var(--bellum-surface-1))]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]',
      )}
    >
      {/* ---------- Gauche : qui (Théo `.d3-company-ident`) ----------
          #3082 — le plancher de largeur passe par `style` (reset global `min-width: 0`). */}
      <div
        data-testid="candidate-zone-identity"
        className="flex min-w-0 items-center gap-3"
        style={{ minWidth: '220px' }}
      >
        {onToggleSelected && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={onToggleSelected}
            aria-label={t('selection.checkboxLabel', { name: candidate.name })}
            className="size-4 shrink-0"
          />
        )}
        {/* #2166.1 — le logo n'est jamais deviné : à défaut, les initiales sur pastille. */}
        <CompanyAvatar name={candidate.name} logoUrl={candidate.logoUrl} website={candidate.website} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="max-w-full break-words text-base font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)]">
              {candidate.name}
            </span>
            {/* #4284.26 — jamais écarté, gardé plus bas : le compte hors métier se DIT dès la carte. */}
            <OutOfTradeMark candidate={candidate} />
            {/* #5006 — « hors cible : moins de 20 salariés », raison dite ; effectif inconnu ⇒ rien. */}
            <BelowTargetMark candidate={candidate} />
            {/* #4626 — un nom de personne se DIT sur la carte repliée : jamais une ligne muette qui se fait passer pour une société. */}
            <PersonNameMark candidate={candidate} />
          </span>
          {/* #3907 — ce que fait l'entreprise, en clair, et où : « secteur · ville ». Absent = aucune ligne. */}
          {(candidate.sector || candidate.city || candidate.department) && (
            <span className="text-sm text-[var(--bellum-text-secondary)]">
              {candidate.sector && <span data-testid="candidate-sector">{candidate.sector}</span>}
              {candidate.sector && (candidate.city || candidate.department) ? ' · ' : null}
              {[candidate.city, candidate.department].filter(Boolean).join(' · ')}
            </span>
          )}
          {/* La tranche maison et l'effectif publié ; #4436.3 — jamais « 0 salarié ». */}
          <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--bellum-text-secondary)]">
            {sizeBand && (
              <strong data-testid="candidate-size-band" className="font-semibold text-[var(--bellum-text-accent)]">
                {sizeBand}
              </strong>
            )}
            <span data-testid={headcount ? undefined : 'candidate-size-unpublished'}>
              {headcount || t('card.sizeUnpublished')}
            </span>
            {inSpace && (
              <span data-testid="candidate-in-space">
                {' · '}
                {t('card.inSpace')}
              </span>
            )}
          </span>
          {/* #3238 (recette démo 06/10) — les villes des SITES qui publient se lisent sur la carte repliée. */}
          {siteCities.length > 0 && (
            <span className="text-xs text-[var(--bellum-text-muted)]">
              {t('card.siteCities', { cities: siteCities.join(', ') })}
            </span>
          )}
          {/* #3819.11 / #3901.9 — deux sociétés au même nom : on NOMME l'ambiguïté, on n'en choisit aucune. */}
          {homonymSirens && homonymSirens.length > 0 && (
            <span data-testid="candidate-homonym" className="text-xs text-[var(--bellum-text-muted)]">
              {t('card.homonym', {
                sirens: [candidate.siren, ...homonymSirens].map(formatSiren).join(' / '),
              })}
            </span>
          )}
          {/* Lot T point 2b — une marque = une ligne SE VOIT sur la carte repliée (« + N entités du groupe » / « fait partie du groupe X »), plus cachée dans le détail. */}
          {candidate.brandGroup?.role === 'member' && candidate.brandGroup.headName && (
            <span
              data-testid="candidate-brand-member-of"
              className="inline-flex items-center gap-1 text-xs text-[var(--bellum-text-muted)]"
            >
              <Users className="size-3 shrink-0" aria-hidden="true" />
              {t('card.brandMemberOf', { group: candidate.brandGroup.headName })}
            </span>
          )}
          {candidate.brandGroup?.role === 'head' && (
            <details
              data-testid="candidate-brand-members"
              className="inline-flex items-center gap-1 text-xs text-[var(--bellum-text-muted)]"
            >
              <summary className="cursor-pointer">
                {t('card.brandMembers', { count: candidate.brandGroup.members.length })}
              </summary>
              <ul>
                {candidate.brandGroup.members.map(member => (
                  <li key={member.siren} data-testid="candidate-brand-member">
                    {[member.name, member.siren, member.city, member.headcountRange].filter(Boolean).join(' · ')}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* ---------- Centre : pourquoi (Théo `.d3-company-subject`) ---------- */}
      <div data-testid="candidate-zone-subject" className="flex min-w-0 flex-col gap-1.5">
        {tags.length > 0 && (
          <ul aria-label={t('card.expertiseTags')} className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <li
                key={tag}
                className="rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        {subject ? (
          <>
            <p
              data-testid="candidate-subject"
              className="break-words text-sm font-semibold text-[var(--bellum-text-primary)]"
            >
              {subject.label}
            </p>
            {/* #4284.26 — le sujet hors métier se DIT (même marque que /mes-cibles et la fiche compte, GA-26). */}
            {subjectOutOfTrade && (
              <div>
                <OutOfTradeTag testId="candidate-subject-out-of-trade" />
              </div>
            )}
            <p
              data-testid="candidate-subject-nature"
              className="flex items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]"
            >
              <SubjectIcon className="size-3.5 shrink-0" aria-hidden="true" />
              {t(`card.natureLine${subject.nature.charAt(0).toUpperCase()}${subject.nature.slice(1)}`)}
            </p>
            {/* #4285.1 (recette prod 26/10) — le fait qui sert de sujet se lit AVEC sa date et son lien : la carte
                repliée n'est plus muette là où l'Aperçu ouvert au clic ne l'était pas (une levée sans date ni source). */}
            <p data-testid="candidate-subject-proof" className="flex flex-wrap items-center gap-x-2 text-xs">
              <time dateTime={subject.date} className="tabular-nums text-[var(--bellum-text-muted)]">
                {subject.dateIsDetection
                  ? t('facts.seenOn', { date: formatFactDate(subject) })
                  : formatFactDate(subject)}
              </time>
              <FactSourceLink fact={subject} className="" />
            </p>
          </>
        ) : (
          /* #2546.1 — MESURÉ à zéro : la recherche a cherché et n'a rien trouvé, c'est un fait qui se dit.
             Un candidat jamais interrogé reste muet (jamais le « 0 » d'une non-mesure). */
          candidate.signals.length === 0 &&
          (candidate.signalsSearched ? (
            <p className="text-xs text-[var(--bellum-text-muted)]">{t('card.signalsNoneCompact')}</p>
          ) : candidate.signalsState === 'pending' ? (
            signalsSearching ? (
              /* #4677 — la moisson finit en arrière-plan : « en cours » ≠ « aucun » ≠ « source indisponible ». */
              <p
                data-testid="candidate-signals-pending"
                role="status"
                className="text-xs text-[var(--bellum-text-muted)]"
              >
                {t('card.signalsPending')}
              </p>
            ) : null
          ) : candidate.signalsState === 'unavailable' ? (
            <p data-testid="candidate-signals-unavailable" className="text-xs text-[var(--bellum-text-muted)]">
              {t('card.signalsUnavailable')}
            </p>
          ) : null)
        )}
        {/* #4429.4 / #4433 / #4430 — remonté par élargissement, voisin, collecte fraîche : dit sur la carte. */}
        {zoneText && (
          <span data-testid="candidate-zone" className="text-xs font-medium text-[var(--bellum-text-secondary)]">
            {zoneText}
          </span>
        )}
        {/* #4706.2 — la BASE de la zone (siège / implantation) se lit sur la carte : le filtre posé se vérifie à l'œil
            (elle reste aussi dans le tiroir). Muette sans preuve du registre. */}
        {geographyLine && (
          <span data-testid="candidate-geography" className="text-xs text-[var(--bellum-text-secondary)]">
            {t(geographyLine.key, geographyLine.values)}
          </span>
        )}
        <WidenedChip widenedBy={candidate.widenedBy} />
        <CandidateProvenance candidate={candidate} />
        {/* #4663 — la preuve qui a fait sortir le compte se lit SUR la carte (elle reste aussi dans le tiroir). */}
        <SkillEvidenceLine evidence={candidate.skillEvidence} />
        {/* #4758 — la raison d'un compte qui remonte sur son historique : techno, nombre, période, âge. */}
        {historyReason && <HistoryReasonLine reason={historyReason} />}
      </div>

      {/* ---------- Droite : nature, compteurs, gestes (Théo `.d3-company-opportunity`) ---------- */}
      <div
        data-testid="candidate-zone-actions"
        className={cn('flex min-w-0 flex-wrap items-center gap-3', layout === 'row' && 'md:flex-nowrap md:justify-end')}
      >
        <div className="flex min-w-0 flex-col gap-1.5 md:items-end">
          {subject && (
            <span
              data-testid="candidate-nature-badge"
              className="w-fit rounded-md border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-accent)]"
            >
              {t(factNatureLabelKey(subject.nature))}
            </span>
          )}
          {counters.length > 0 && (
            <ul
              data-testid="candidate-counters"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--bellum-text-secondary)]"
            >
              {counters.map(counter => {
                const Icon = counter.icon
                return (
                  <li key={counter.key} className="inline-flex items-center gap-1">
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {counter.text}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {/* G-FIX #4309 — « Expliquer avec Laura » reste sur la carte FERMÉE, le compte en portée (GA-26). */}
          <AskLaura
            question={t('actions.explainWithLauraQuestion', { name: candidate.name })}
            label={t('actions.explainWithLaura')}
            accountId={candidate.accountId ?? undefined}
            alwaysVisible
          />
          {/* Épingler (compte de ton espace) / ajouter (compte neuf) : le MÊME geste « suivre ». */}
          <button
            type="button"
            onClick={onToggleFollow}
            aria-pressed={isFollowed}
            aria-label={t(isFollowed ? 'actions.unfollow' : 'actions.follow')}
            title={t(isFollowed ? 'actions.unfollow' : 'actions.followHint')}
            className="grid size-11 place-items-center rounded-lg text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] aria-pressed:text-[var(--bellum-text-accent)]"
          >
            {isFollowed ? (
              <PinOff className="size-4" aria-hidden="true" />
            ) : inSpace ? (
              <Pin className="size-4" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
          </button>
          {/* Théo decouvrir.R6 — le détail s'ouvre en tiroir « Aperçu du compte » ; la liste garde sa densité. */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={t('row.showDetails')}
                title={t('row.showDetails')}
                className="grid size-11 place-items-center rounded-lg border border-[var(--bellum-border)] text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              closeLabel={t('row.closePreview')}
              aria-describedby={undefined}
              className="sm:max-w-xl"
            >
              <SheetHeader className="p-5 pb-0 pr-12">
                <SheetTitle>{t('row.previewTitle')}</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                {open && (
                  <LauraIntroScope>
                    <section
                      aria-label={t('row.essentials')}
                      data-testid="candidate-essentials"
                      className="mb-5 flex flex-col gap-3"
                    >
                      {/* Les actions graduées : construire le dossier (coût annoncé, GA-51), suivre, écarter. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <CandidateActions
                          isFollowed={isFollowed}
                          onToggleFollow={onToggleFollow}
                          onDismiss={onDismiss}
                          onAnalyze={onAnalyze}
                          compact
                        />
                      </div>
                      <CandidateIdentityDetails
                        candidate={candidate}
                        geography={geographyLine ? t(geographyLine.key, geographyLine.values) : null}
                      />
                      {/* #4068 — les signaux FORTS, 5 au plus, une ligne chacun (date · nature · fait · lien). */}
                      <CandidateFacts
                        facts={cardFacts.strong}
                        label={t('facts.strongLabel')}
                        relevanceProfile={relevanceProfile}
                      />
                      {/* #4307.2 — l'historique ENTIER, gratuit ; muet à 5 signaux ou moins. */}
                      <CandidateSignalHistory signals={candidate.signals} />
                      {/* COMPETENCE-TROUVE — trouvé par ses offres : « N offres <compétence> » + la plus récente. */}
                      <SkillEvidenceLine evidence={candidate.skillEvidence} />
                      {/* #4664 — TOUTES les offres remontées (10 au plus), chacune avec le lien de son annonce. */}
                      <SkillEvidenceOffers evidence={candidate.skillEvidence} />
                      {/* #4067 — ce qui a pesé, par NATURE (jamais un système ni un fournisseur). */}
                      <CandidateWeighed facts={cardFacts.strong} />
                      {/* #3819.1 — UN fait du candidat comparé à UN critère réellement posé ; muet sans critère. */}
                      {matchedCriteria.length > 0 && (
                        <p data-testid="matched-criteria" className="text-xs text-[var(--bellum-text-muted)]">
                          {t('card.matchedCriteria', {
                            criteria: matchedCriteria
                              .map(axis =>
                                axis === 'keyword'
                                  ? searchCriteria?.keywords.trim()
                                  : t(`card.matchedCriteriaAxis.${axis}`),
                              )
                              .join(', '),
                          })}
                        </p>
                      )}
                      {/* #3819.1 — ce qui n'a pas été cherché tient en UNE mention compacte. */}
                      {notSearched.length > 0 && (
                        <p data-testid="not-searched" className="text-xs text-[var(--bellum-text-secondary)]">
                          {t('card.notSearched', {
                            axes: notSearched.map(axis => t(`card.notSearchedAxis.${axis}`)).join(' '),
                          })}
                        </p>
                      )}
                    </section>
                    <CandidateRowDetails
                      candidate={candidate}
                      partnerComplementarity={partnerComplementarity}
                      quickPass={quickPass}
                      portfolioBadge={badge}
                      contextFacts={cardFacts.context}
                      relevanceProfile={relevanceProfile}
                    />
                  </LauraIntroScope>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </article>
  )
}

/**
 * Ce que la ligne d'avant disait de l'identité du compte et que la carte V22 ne porte plus (#4495) : la base du
 * classement sectoriel, la géographie prouvée, les établissements, le groupe, les
 * besoins connus. Rien n'est deviné ; une absence ne fait aucune ligne.
 */
function CandidateIdentityDetails({
  candidate,
  geography,
}: {
  candidate: DiscoverCandidate
  geography: string | null
}) {
  const { t } = useTranslation('discover')
  const line = 'inline-flex items-center gap-1 text-xs text-[var(--bellum-text-muted)]'
  return (
    <div className="flex flex-col gap-1">
      {candidate.sector && candidate.sectorBasis && (
        <span className={line}>
          <Building2 className="size-3 shrink-0" aria-hidden="true" />
          {candidate.sector}
          {/* #4358.4 — d'où vient le classement : code NAF, activité déclarée ou site. */}
          <span data-testid="candidate-sector-basis">
            {' · '}
            {t(`card.sectorBasis.${candidate.sectorBasis}`)}
          </span>
        </span>
      )}
      {geography && (
        <span className={line}>
          <MapPin className="size-3 shrink-0" aria-hidden="true" />
          {geography}
        </span>
      )}
      {typeof candidate.establishmentCount === 'number' && candidate.establishmentCount > 1 && (
        <span data-testid="candidate-establishment-count" className={line}>
          <Building2 className="size-3 shrink-0" aria-hidden="true" />
          {t('card.establishmentCount', { count: candidate.establishmentCount })}
        </span>
      )}
      {candidate.groupLink && (
        <span data-testid="candidate-group-link" className={line}>
          <Users className="size-3 shrink-0" aria-hidden="true" />
          {t(candidate.groupLink.kind === 'capital_link' ? 'card.groupLink' : 'card.groupLinkProbable', {
            group: candidate.groupLink.entities.join(', '),
          })}
        </span>
      )}
    </div>
  )
}
