import { Fragment } from 'react'
import { SignalOpportunityAction } from './SignalOpportunityAction'
import { Badge, Button, Card, Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { CalendarDays, ListPlus, RadioTower, Grid2x2Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatSignalDate } from '@/lib/signal-date'
import { SourceChip } from '@/components/primitives/SourceChip'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { signalSourceLabel } from '@/lib/data-source-label'
import type { WatchScenario, WatchSignal } from '@/features/accounts/model/watch'
import type { WatchFilter } from './WatchFilters'
import { getWatchCategories } from './watchCategories'
import { signalNature } from '@/features/accounts/model/lineNature'
import { LineNatureBadge } from '../opportunities/LineNatureBadge'
import type { SalesProfileForRelevance } from '@bellum/contracts'
import {
  hiringDisplayLabel,
  hiringNoticeForSignals,
  isOutOfTradeHiring,
  isOffDomainHiringSignal,
} from '@/features/discover/lib/discover-hiring-domain'
import { HiringDomainNoticeLine } from '@/features/discover/view/HiringDomainNoticeLine'
import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'

type WatchSignalTimelineProps = {
  activeCategory: WatchFilter
  /** #2119.16 — la liste est-elle RESSERRÉE ? La catégorie ne suffit plus à
   *  répondre depuis que la fenêtre d'âge existe : un vide obtenu par elle se
   *  lit « rien ne correspond », pas « ce compte n'a aucun signal ». */
  narrowed: boolean
  isPersisting: boolean
  scenario: WatchScenario
  signals: WatchSignal[]
  onAddToPlan: (signal: WatchSignal) => void
  onCreateAngle: (signal: WatchSignal) => void
  /** #2127.8 — les familles d'expertise observées sur ce compte (déjà filtrées et
   *  bornées par `observedRoleFamilyLabels`). Absentes ou vides : rien d'écrit. */
  observedRoleFamilies?: string[]
  /** #3683.2 — le compte : sans lui, pas de « Préparer une opportunité ». */
  accountId?: string
  /** #3995 (revient sur #3676.6, décision Louis 10/10) — les ids des signaux qu'une piste
   *  présente déjà. Ils RESTENT dans la liste ; leur ligne porte au plus une mention
   *  légère « En piste », jamais un renvoi « ci-dessus ». */
  inLeadSignalIds?: ReadonlySet<string>
  /** #3922.3 — la collecte du segment signaux précède la capacité « lien source » : l'absence de lien se DIT. */
  collectedBeforeLink?: boolean
  /** #3901.w — le profil déclaré (`placed_roles`) ; absent = libellés et ordre d'avant. */
  hiringProfile?: SalesProfileForRelevance
  /** #4284.10 — la lecture du profil a échoué : la ligne le DIT, jamais un faux « dans ton métier ». */
  hiringProfileFailed?: boolean
}

export function WatchSignalTimeline({
  isPersisting,
  onAddToPlan,
  onCreateAngle,
  scenario,
  signals,
  observedRoleFamilies,
  accountId,
  inLeadSignalIds,
  collectedBeforeLink = false,
  narrowed,
  hiringProfile,
  hiringProfileFailed = false,
}: WatchSignalTimelineProps) {
  // #3901.w — les recrutements suivent le profil déclaré : hors domaine = rang (fin de liste), jamais retiré.
  const toTyped = (signal: WatchSignal) => ({ type: signal.type, label: signal.signal })
  // #4733.6 — un recrutement de DIRIGEANT (typologie `executiveRole`, déjà posée par l'IA, rien de neuf) est un fait
  // fort : jamais hors métier, jamais replié sous « Autres métiers », même quand le poste n'est pas celui de l'ESN.
  const isOffTrade = (signal: WatchSignal) =>
    !signal.executiveRole && isOffDomainHiringSignal(toTyped(signal), hiringProfile)
  const ranked = [...signals.filter(signal => !isOffTrade(signal)), ...signals.filter(isOffTrade)]
  // #4396.1 — les offres d'un autre métier que celui de l'ESN sont regroupées sous un titre, après le métier.
  const firstOffTradeIndex = ranked.findIndex(isOffTrade)
  const hiringNotice = hiringProfileFailed
    ? ({ kind: 'profileError' } as const)
    : hiringNoticeForSignals(signals.filter(signal => !signal.executiveRole).map(toTyped), hiringProfile)
  return (
    <Card className="min-w-0 gap-0 p-0 [--card-spacing:0px]">
      <TimelineHeader count={signals.length} scenario={scenario} />
      {signals.length > 0 ? (
        <div className="relative">
          {hiringNotice ? (
            <div className="px-5 pt-3">
              <HiringDomainNoticeLine notice={hiringNotice} />
            </div>
          ) : null}
          {ranked.map((signal, index) => (
            <Fragment key={signal.id}>
              {index === firstOffTradeIndex ? <OtherTradesHeading count={ranked.length - index} /> : null}
              <SignalRow
                signal={signal}
                displayLabel={hiringDisplayLabel(toTyped(signal), hiringProfile)}
                outOfTrade={!signal.executiveRole && isOutOfTradeHiring(toTyped(signal), hiringProfile)}
                isPersisting={isPersisting}
                onAddToPlan={onAddToPlan}
                onCreateAngle={onCreateAngle}
                observedRoleFamilies={observedRoleFamilies}
                accountId={accountId}
                collectedBeforeLink={collectedBeforeLink}
                inLead={inLeadSignalIds?.has(signal.id) ?? false}
              />
            </Fragment>
          ))}
        </div>
      ) : (
        <TimelineEmptyState filtered={narrowed} />
      )}
    </Card>
  )
}

function OtherTradesHeading({ count }: { count: number }) {
  const { t } = useTranslation('accountWatch')
  return (
    <div
      data-testid="other-trades-heading"
      className="border-b border-[var(--bellum-border)] px-5 py-2 text-[var(--bellum-text-muted)]"
    >
      <Text size="xs" weight="semibold">
        {t('timeline.otherTrades', { count })}
      </Text>
    </div>
  )
}

function TimelineHeader({ count, scenario }: { count: number; scenario: WatchScenario }) {
  const { t } = useTranslation('accountWatch')
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
      <Text size="sm" weight="semibold">
        {t('timeline.signalsDetected', { count })}
      </Text>
      {scenario === 'partial' ? <Badge variant="warning">{t('timeline.partialCoverage')}</Badge> : null}
    </div>
  )
}

function SignalRow({
  signal,
  displayLabel,
  outOfTrade,
  isPersisting,
  onAddToPlan,
  onCreateAngle,
  observedRoleFamilies,
  accountId,
  collectedBeforeLink,
  inLead,
}: {
  signal: WatchSignal
  /** #3995 — une piste présente déjà ce signal : une mention légère, pas une seconde ligne. */
  inLead: boolean
  /** #3901.w — le libellé affiché (secteur du recrutement selon le profil déclaré) ; le signal reste intact. */
  displayLabel: string
  /** #4284.10 — l'offre est hors du métier de l'ESN : la LIGNE le dit (marque par ligne, pas seulement le bandeau). */
  outOfTrade: boolean
  collectedBeforeLink: boolean
  isPersisting: boolean
  onAddToPlan: (signal: WatchSignal) => void
  onCreateAngle: (signal: WatchSignal) => void
  observedRoleFamilies?: string[]
  accountId?: string
}) {
  const category = getWatchCategories().find(item => item.id === signal.category)!
  const Icon = category.icon

  return (
    <article className="relative m-2 flex min-w-0 gap-4 rounded-xl px-5 py-5 hover:bg-[var(--bellum-bg)]">
      <div
        className={cn(
          'relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg)]',
          iconColor(signal.category),
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* #2618.1 — LA COLONNE DE MÉTADONNÉES DOIT ÊTRE BORNÉE, PAS `auto`.
            Mesuré en production le 21/09/2026 : le titre (texte libre,
            `break-words`) rendait 23,76 px de large dans un conteneur de
            617 px — un caractère par ligne. La correction du 20/09
            (`break-words` sur le titre) empêchait le DÉBORDEMENT d'un mot
            sans espace, mais laissait la colonne voisine en `auto`, donc SANS
            PLAFOND : qu'elle ait besoin d'un peu plus de place (une date plus
            longue, un badge de fraîcheur en plus) et l'algorithme de grille
            satisfait d'abord `auto` puis écrase `minmax(0,1fr)` vers son
            plancher explicite (0) — `break-words` ne déborde plus, il coupe à
            chaque caractère. Même remède que `OrgEditView.tsx` /
            `GroupOrgView.tsx` / `FocalOrgView.tsx` pour la même forme à deux
            colonnes : `minmax(0, <longueur fixe>)` plutôt que `auto`. */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <SignalContent
            signal={signal}
            displayLabel={displayLabel}
            collectedBeforeLink={collectedBeforeLink}
            inLead={inLead}
          />
          <SignalMetadata signal={signal} />
        </div>
        {outOfTrade ? (
          <div className="mt-2">
            <OutOfTradeTag testId="signal-out-of-trade" />
          </div>
        ) : null}
        {signal.category === 'recrutement' && observedRoleFamilies && observedRoleFamilies.length > 0 ? (
          <ObservedContextLine families={observedRoleFamilies} />
        ) : null}
        <SignalActions
          signal={signal}
          isPersisting={isPersisting}
          onAddToPlan={onAddToPlan}
          onCreateAngle={onCreateAngle}
          accountId={accountId}
        />
      </div>
    </article>
  )
}

/**
 * #2127.8 — LE PASSÉ DU MARCHÉ SOUS UN SIGNAL ACTUEL, SANS LE PRENDRE POUR LE PRÉSENT.
 *
 * Un signal d'emploi dit ce qui se passe aujourd'hui ; les familles d'expertise
 * observées disent dans quel environnement il tombe. La ligne est posée SOUS le
 * signal, en retrait, sur les seuls signaux d'emploi — une famille de rôles
 * n'éclaire ni une levée de fonds ni un changement juridique — et elle dit en
 * toutes lettres qu'elle éclaire sans prouver : un commercial peut la répéter
 * en rendez-vous. Ni date, ni comptage, ni nom de personne : la mémoire marché
 * n'en expose pas.
 */
function ObservedContextLine({ families }: { families: string[] }) {
  const { t } = useTranslation('accountWatch')
  return (
    <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
      {t('timeline.observedContext', { families: families.join(' · ') })}
    </Text>
  )
}

function SignalContent({
  signal,
  displayLabel,
  collectedBeforeLink,
  inLead,
}: {
  signal: WatchSignal
  displayLabel: string
  collectedBeforeLink: boolean
  inLead: boolean
}) {
  const { t } = useTranslation('accountWatch')
  const isRecent = signalNature(signal) === 'recentSignal'
  return (
    <div className="min-w-0">
      {/* #3676.6 — la nature de la ligne, en français simple. Une archive la porte déjà par son badge de
          fraîcheur (« Historique » / « Archivé », avec son aide) : on ne le redit pas (GA-26).
          #3995 — « En piste » : mention légère d'un signal qu'une piste présente aussi. */}
      {isRecent || inLead || signal.executiveRole ? (
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {isRecent ? <LineNatureBadge nature="recentSignal" /> : null}
          {/* #4733.6 — le recrutement d'un dirigeant se VOIT : un fait fort, au même rang que le déménagement. */}
          {signal.executiveRole ? (
            <Badge variant="default" data-testid="executive-hiring-badge">
              {t('timeline.executiveHiring')}
            </Badge>
          ) : null}
          {inLead ? <Badge variant="outline">{t('timeline.inLead')}</Badge> : null}
        </div>
      ) : null}
      <Text size="xs" weight="medium" className="capitalize text-[var(--bellum-text-secondary)]">
        {signal.type}
      </Text>
      {/* #2618.1 — « lire le tableau des signaux sans qu'il casse » : le titre
          est un texte LIBRE produit par l'analyse, sans garantie d'espace. Un
          titre (URL, identifiant) sans point de rupture débordait de sa
          colonne (`grid-cols-[minmax(0,1fr)_auto]`) au lieu d'y passer à la
          ligne — même défaut que #1804 (MissionsTable.tsx) et #2619.1
          (QualificationLeadsQueue.tsx). */}
      <Text element="h3" size="sm" weight="semibold" className="break-words">
        {displayLabel}
      </Text>
      {/* #2966 (#2119.22-24) — LE CONTRAT DE SIGNAL À QUATRE RÉPONSES : où /
          pourquoi pour cette ESN / qui pourrait être concerné — TOUJOURS
          répondues, « non mesuré » étant une réponse aussi valide qu'un fait
          (doctrine — un axe non évaluable reste NOMMÉ, jamais tu). La
          quatrième réponse (action crédible ou absence explicite, #2119.25)
          vit dans `SignalActions`, plus bas. */}
      <div className="mt-2 space-y-1">
        <SignalAnswerLine label={t('timeline.perimeterLabel')} value={signal.perimeter} />
        <SignalAnswerLine
          label={t('timeline.whyLabel')}
          value={signal.sales_implication}
          unknown={t('timeline.whyUnknown')}
        />
        {/* #3628 — « Qui pourrait être concerné » n'a AUCUNE source dans le signal : la ligne
            disait « Non mesuré » ×6. Une absence ne fait aucune ligne (doctrine 20/09/2026) ; elle
            reviendra le jour où le contrat de signal porte la valeur. */}
      </div>
      <SignalAngles angles={signal.angles} />
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        {/* #1912.11 — la CAPACITÉ quand la source nomme un de NOS fournisseurs,
            le texte tel quel quand c'est une preuve (un titre de presse, un
            registre public). Jumeau de « Sources : pappers » sur /discover. */}
        <SignalSource source={signal.source} label={signalSourceLabel(t, signal.source)} />
        {/* #3922.3 — le lien vers la PREUVE : « j'ai vu que… » se dit au téléphone. */}
        {/* Théo A comptes-fiche — site d'origine + ↗ sur la carte même ; l'absence d'URL se tait (sauf collecte antérieure). */}
        {signal.sourceUrl ? (
          <SourceChip sources={[{ url: signal.sourceUrl, publishedAt: signal.date }]} />
        ) : (
          <SignalSourceLink url={null} sourceKind={signal.sourceKind} collectedBeforeLink={collectedBeforeLink} />
        )}
        {signal.tags.slice(0, 2).map(tag => (
          <Badge key={tag} variant="default">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  )
}

/**
 * #2966 (#2119.22-24) — une ligne du contrat à quatre réponses. `value` réel
 * quand on l'a, `unknown` (toujours fourni pour « pourquoi »/« qui ») sinon —
 * jamais une ligne tue : « non mesuré » nommé vaut mieux qu'une absence
 * silencieuse (doctrine).
 */
function SignalAnswerLine({ label, value, unknown }: { label: string; value?: string; unknown?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
      <Text element="span" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text element="span" size="xs" className="min-w-0 break-words text-[var(--bellum-text-secondary)]">
        {value || unknown}
      </Text>
    </div>
  )
}

/**
 * #2687 — « ET DONC ? »
 *
 * Un signal daté et sourcé ne dit pas ce qu'il faut en FAIRE. L'analyse le
 * disait déjà — `qualified_hypotheses[].esn_angle` porte l'offre, `first_action`
 * la première action — mais rien ne reliait sa réponse au signal qui l'a
 * déclenchée. Le lien existe maintenant (`based_on_signal_ids`), et il est
 * SUIVI, jamais deviné : voir `signalAngles.ts` pour pourquoi aucun repli sur le
 * texte ou la position n'était acceptable.
 *
 * Trois règles tiennent ce bloc :
 *
 *  · AUCUNE ligne quand l'analyse n'a rien rattaché — pas de « Aucun angle ».
 *    Une absence ne fait aucune ligne dans une liste (doctrine, 20/09/2026), et
 *    c'est le cas de tous les dossiers analysés avant le lien.
 *  · Chaque axe indépendamment : une hypothèse qui a une action sans angle
 *    n'écrit pas de ligne « angle ».
 *  · L'hypothèse est NOMMÉE sous ses deux axes. Un angle qu'on ne peut pas
 *    rattacher à un raisonnement est une affirmation qu'on ne peut pas
 *    contester — et ici le raisonnement est celui d'un modèle.
 */
function SignalAngles({ angles }: { angles: WatchSignal['angles'] }) {
  const { t } = useTranslation('accountWatch')
  if (angles.length === 0) return null

  return (
    <div className="mt-3 space-y-2">
      {angles.map((angle, index) => (
        <div key={`${angle.hypothesis}-${index}`} className="min-w-0 border-l-2 border-[var(--bellum-border)] pl-3">
          {angle.esnAngle ? <SignalAngleLine label={t('timeline.esnAngle')} value={angle.esnAngle} /> : null}
          {angle.firstAction ? <SignalAngleLine label={t('timeline.firstAction')} value={angle.firstAction} /> : null}
          {angle.hypothesis ? (
            <Text size="xs" className="mt-1 break-words text-[var(--bellum-text-muted)]">
              {t('timeline.fromHypothesis', { hypothesis: angle.hypothesis })}
            </Text>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Une ligne « intitulé : ce que l'analyse a dit ». Le texte est LIBRE et sans
 *  garantie d'espace (même défaut que le titre, #2618.1) : il passe à la ligne
 *  au lieu de déborder de sa colonne. */
function SignalAngleLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text element="span" size="xs" className="min-w-0 break-words text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </div>
  )
}

/**
 * #2119.3 — LA SOURCE, CLIQUABLE QUAND ELLE EN EST UNE.
 *
 * Le retour demande « chaque signal cite une source cliquable ». Le contrat n'a
 * AUCUN champ d'URL : `recentSignalSchema` porte `source` (le nom lisible :
 * « Les Échos », « BODACC ») et `source_ref` (le jeton de traçabilité du
 * scrape, « [P1] »). Fabriquer un lien à partir d'un nom de média serait une
 * donnée inventée — et une donnée inventée cliquable est pire qu'un texte.
 *
 * Ce qui est fait ici est le seul geste honnête : quand la source EST déjà une
 * URL absolue en http(s), elle devient un lien ; sinon elle reste le texte
 * qu'elle a toujours été. Rien n'est deviné, et le jour où l'analyse portera une
 * URL à part, ce composant est l'endroit où la brancher.
 *
 * ⚠️ `noopener noreferrer` : une page ouverte par `target="_blank"` garde
 * autrement une poignée sur la nôtre via `window.opener`.
 */
function SignalSource({ source, label }: { source: string; label: string | null }) {
  // `signalSourceLabel` rend `null` sur une source vide : il n'y a alors rien à
  // écrire, et surtout rien à lier — un lien sans texte n'est annonçable par
  // aucun lecteur d'écran.
  if (label === null) return null
  const href = asHttpUrl(source)
  if (!href) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="min-w-0 truncate text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
    >
      {label}
    </a>
  )
}

/** `new URL` plutôt qu'une expression régulière : elle refuse ce qui n'est pas
 *  une URL au lieu de « reconnaître » une chaîne qui y ressemble, et le filtre
 *  de protocole écarte `javascript:` — une source vient de l'analyse, donc du
 *  dehors. */
function asHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function SignalMetadata({ signal }: { signal: WatchSignal }) {
  return (
    <div className="flex max-w-full flex-wrap items-center gap-3 lg:justify-end">
      <SignalFreshnessBadge freshness={signal.freshness} temporalStatus={signal.temporalStatus} />
      <SignalDate date={signal.date} />
      <PotentialBadge score={signal.score} />
    </div>
  )
}

/** Fraîcheur (Théo p.18/p.7) : un signal de plus de ~24 mois est un ARCHIVE,
 *  pas un déclencheur « à relancer ». On ne badge que l'archive — c'est le seul
 *  état porteur d'information ; `current`/`undated` ne fabriquent rien.
 *
 * #3206.3 (épopée #3240) : `temporalStatus` distingue, à l'intérieur de
 * l'archive, HISTORICAL (un état passé encore utile de contexte — une
 * nomination périmée) de STALE (trop ancien pour soutenir une décision
 * actuelle — une offre d'emploi périmée). Absent/indisponible (analyse
 * antérieure sans date exploitable) → le libellé générique d'avant.
 *
 * SUPERSEDED (reste du 30/09) n'apparaît PAS ici : ce statut dépend de
 * `history_status` (`signal_history`, joint uniquement par
 * `accounts.service.ts` pour la Watchlist), que `recentSignals` — la source
 * de CET écran — ne porte pas. Voir `WatchlistSignalDetail.tsx` pour le badge
 * réel, alimenté par un appelant qui a effectivement la donnée. */
function SignalFreshnessBadge({
  freshness,
  temporalStatus,
}: {
  freshness: WatchSignal['freshness']
  temporalStatus: WatchSignal['temporalStatus']
}) {
  const { t } = useTranslation('accountWatch')
  if (freshness !== 'archive') return null
  const isHistorical = temporalStatus === 'HISTORICAL'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help outline-none">
          <Badge variant="warning">{t(isHistorical ? 'freshness.historical' : 'freshness.archive')}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {t(isHistorical ? 'freshness.historicalHint' : 'freshness.archiveHint')}
      </TooltipContent>
    </Tooltip>
  )
}

function SignalActions({
  signal,
  isPersisting,
  onAddToPlan,
  onCreateAngle,
  accountId,
}: {
  signal: WatchSignal
  isPersisting: boolean
  onAddToPlan: (signal: WatchSignal) => void
  onCreateAngle: (signal: WatchSignal) => void
  accountId?: string
}) {
  const { t } = useTranslation('accountWatch')
  // #2966 (#2119.25) — « propose une action crédible OU l'absence explicite ».
  // `createAngle`/`addToPlan` restent de vrais gestes disponibles sur CHAQUE
  // signal (un commercial peut toujours en créer un), mais rien ne disait
  // jusqu'ici que l'analyse elle-même n'a RIEN recommandé pour celui-ci — la
  // branche manquante que le registre du dépôt pointait.
  const hasRecommendation = Boolean(signal.sales_implication) || signal.angles.length > 0
  // #2952 (#2305.43/.44/.45/.47/.48) — une recommandation qui ne passe pas le
  // gate d'action n'est pas retirée (doctrine : on n'efface pas ce que
  // l'analyse a dit) mais n'est plus présentée comme actionnable : le
  // fallback littéral de l'issue remplace le silence d'avant.
  const fallbackLine = !hasRecommendation
    ? t('timeline.noActionYet')
    : !signal.actionGate.allowed
      ? t('timeline.contextOnlyNoAction')
      : null
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
      {fallbackLine ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {fallbackLine}
        </Text>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="light"
          size="sm"
          icon={Grid2x2Plus}
          disabled={isPersisting}
          onClick={() => onCreateAngle(signal)}
        >
          {t('timeline.createAngle')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={ListPlus}
          disabled={isPersisting}
          onClick={() => onAddToPlan(signal)}
        >
          {t('timeline.addToPlan')}
        </Button>
        {accountId ? <SignalOpportunityAction accountId={accountId} signal={signal} /> : null}
      </div>
    </div>
  )
}

function SignalDate({ date }: { date: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="flex min-w-0 max-w-56 cursor-help items-center gap-1.5 text-xs text-[var(--bellum-text-muted)] outline-none"
        >
          <CalendarDays className="size-3.5 shrink-0" />
          <span className="block min-w-0 truncate">{formatSignalDate(date)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {formatSignalDate(date)}
      </TooltipContent>
    </Tooltip>
  )
}

function PotentialBadge({ score }: { score?: number }) {
  const { t } = useTranslation('accountWatch')
  if (score == null) return <Badge variant="outline">{t('potential.toQualify')}</Badge>
  const label = score >= 90 ? t('potential.priority') : score >= 80 ? t('potential.strong') : t('potential.toQualify')
  const variant = score >= 90 ? 'success' : score >= 80 ? 'primary' : 'warning'
  return <Badge variant={variant}>{t('potential.withScore', { label, score })}</Badge>
}

function TimelineEmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useTranslation('accountWatch')
  return (
    <div className="flex min-h-80 flex-col items-center justify-center px-4 md:px-6 text-center">
      <RadioTower className="size-5 text-[var(--bellum-text-muted)]" />
      <Text size="sm" weight="semibold" className="mt-3">
        {filtered ? t('timeline.emptyFiltered') : t('timeline.empty')}
      </Text>
      <Text size="xs" className="mt-1 max-w-sm text-[var(--bellum-text-secondary)]">
        {t('timeline.emptyDescription')}
      </Text>
    </div>
  )
}

// #2617.1 — les trois genres « argent » (budget, appel d'offres, marché
// public) partagent la même couleur : un acheteur, public ou privé, reste un
// signal d'opportunité commerciale. Recrutement/nomination/historique gardent
// la couleur neutre par défaut, comme l'ancien `jobs`/`news`.
function iconColor(category: WatchSignal['category']): string {
  if (category === 'budget' || category === 'appel_offres' || category === 'marche_public') {
    return 'text-[var(--success-soft-text)]'
  }
  return 'text-[var(--bellum-primary-500)]'
}
