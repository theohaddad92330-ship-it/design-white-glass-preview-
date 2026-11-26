import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Account, RefreshDimension } from '@bellum/contracts'
import { refreshDimensionSchema } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { AlertTriangle, ArrowRight, CheckCircle2, History, Plus, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { useRefreshDimension } from '@/features/accounts/hooks/useRefreshDimension'
import { readOrgPeopleRefreshDiff } from '@/features/accounts/view/account-detail/tabs/organigramme/orgPeopleRefreshDiff'

/**
 * #2125.50-.67 — CE QUE LE DERNIER RAFRAÎCHISSEMENT A CHANGÉ.
 *
 * « Je paie des crédits et je ne sais pas ce qui a bougé. » Le serveur écrit
 * désormais son compte rendu dans `raw_analysis.last_refresh` ; cette carte le
 * rend, et rien d'autre — elle ne recalcule aucun diff, sinon deux diffs
 * finiraient par ne pas dire la même chose (GA-26).
 *
 * SIX LISTES SÉPARÉES, et c'est le sujet : un fait neuf, un fait modifié et un
 * fait qu'on n'observe plus n'appellent pas le même geste. « 3 changements »
 * les rendrait tous les trois inutiles.
 *
 * Deux règles tenues à l'affichage :
 *  · un fait devenu obsolète REDEVIENT INCONNU AVEC SA DATE — sa dernière
 *    valeur connue reste lisible, suivie de « information du …, à revérifier ».
 *    Il n'est ni supprimé, ni déclaré faux ;
 *  · une phase qui n'a rien rendu est NOMMÉE. Écrire « aucun changement » là où
 *    la mesure n'a pas eu lieu est la version la plus coûteuse du zéro qui ment.
 */

type ObsoleteFact = { key: string; label: string; lastKnownValue: string | null; lastSeenAt: string | null }
type ChangedFact = { key: string; label: string; before: string | null; after: string | null }
type NewFact = { key: string; label: string; value: string | null }
type PreservedCorrection = { key: string; label: string; keptValue: string | null; discardedValue: string | null }
/** #2318.8 — une correction que le run a RÉELLEMENT écrasée en base, constatée
 *  par le serveur en relisant l'état persisté (jamais déduite d'un arbitrage). */
type OverwrittenCorrection = {
  key: string
  label: string
  correctedValue: string | null
  overwrittenWith: string | null
  byPhase: string
}
type ObsoleteAction = { key: string; label: string }
type ExpiredSignal = { key: string; label: string; lastKnownValue: string | null; lastSeenAt: string | null }
type ScoreOrConfidenceChange = { key: string; label: string; before: string | null; after: string | null }
/** #2591.3 — CE rafraîchissement n'a PAS recalculé le score. `lastKnownValue`
 *  reste lisible (« on archive, on ne supprime pas ») ; elle n'est pas
 *  réaffichée ici, le score courant est déjà visible en tête de fiche. */
type ScoreNotRecalculated = { lastKnownValue: string | null }
/** #2591.6 — même forme que `ScoreNotRecalculated`, pour la CONFIANCE. */
type ConfidenceNotRecalculated = { lastKnownValue: string | null }

type RefreshDiffView = {
  newFacts: NewFact[]
  changedFacts: ChangedFact[]
  obsoleteFacts: ObsoleteFact[]
  preservedCorrections: PreservedCorrection[]
  /** #2318.8 — vide sur un compte rendu antérieur à ce chantier : l'absence de
   *  la clé n'est PAS la preuve qu'aucune correction n'a été écrasée, seulement
   *  qu'on ne l'a pas mesuré. La carte se tait alors, elle ne rassure pas. */
  overwrittenCorrections: OverwrittenCorrection[]
  changedRecommendations: ChangedFact[]
  obsoleteActions: ObsoleteAction[]
  unmeasured: RefreshDimension[]
  /** #2555.2 — faits relus à l'IDENTIQUE : la QUATRIÈME catégorie du diff
   *  (nouveaux · modifiés · inchangés · erreurs), sans quoi un fait reconfirmé
   *  ne se distinguait pas d'un fait jamais revu. */
  unchangedFacts: number
  /** #2318.4 — trois des onze champs de LAU-FINAL-059 qui manquaient au diff. */
  expiredSignals: ExpiredSignal[]
  scoreChanged: ScoreOrConfidenceChange | null
  confidenceChanged: ScoreOrConfidenceChange | null
  /** #2591.3 — `null` sauf quand le serveur SAIT que cette dimension n'a pas
   *  recalculé le score (voir `scoreRecalculated` côté contrat). */
  scoreNotRecalculated: ScoreNotRecalculated | null
  /** #2591.6 — même rôle que `scoreNotRecalculated`, pour la CONFIANCE (voir
   *  `confidenceRecalculated` côté contrat). */
  confidenceNotRecalculated: ConfidenceNotRecalculated | null
}

type RefreshFailureView = {
  phase: RefreshDimension
  outcome: 'failed' | 'unknown'
  keptDimensions: RefreshDimension[]
  credits: { debited: number | null; refunded: boolean }
  retry: { dimension: RefreshDimension; allowed: boolean; needsConfirmation: boolean }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function dimensions(value: unknown): RefreshDimension[] {
  return Array.isArray(value)
    ? value.filter((item): item is RefreshDimension => refreshDimensionSchema.safeParse(item).success)
    : []
}

/** #2318.4 — `scoreChanged`/`confidenceChanged` : `null` quand rien n'a
 *  changé (jamais un objet vide qui se lirait comme un changement). */
function scoreOrConfidence(value: unknown): ScoreOrConfidenceChange | null {
  if (!isRecord(value)) return null
  const key = typeof value.key === 'string' ? value.key : ''
  if (!key) return null
  return { key, label: String(value.label ?? key), before: text(value.before), after: text(value.after) }
}

/** #2591.3 — un compte rendu illisible ne rend rien, comme le reste du blob. */
function readScoreNotRecalculated(value: unknown): ScoreNotRecalculated | null {
  if (!isRecord(value)) return null
  return { lastKnownValue: text(value.lastKnownValue) }
}

/** #2591.6 — même lecteur que `readScoreNotRecalculated`, pour la CONFIANCE. */
function readConfidenceNotRecalculated(value: unknown): ConfidenceNotRecalculated | null {
  if (!isRecord(value)) return null
  return { lastKnownValue: text(value.lastKnownValue) }
}

/**
 * Lit le compte rendu du blob, sans jamais le compléter.
 *
 * `raw_analysis` est un `Record<string, unknown>` : ce qui s'y trouve a été
 * écrit par une version du serveur qui n'est pas forcément celle d'aujourd'hui.
 * Un compte rendu illisible ne rend donc RIEN — une carte à moitié devinée
 * dirait des changements que personne n'a mesurés.
 */
function readLastRefresh(
  account: Account,
): { diff: RefreshDiffView | null; failure: RefreshFailureView | null; phase: RefreshDimension | null } | null {
  const raw = account.raw_analysis
  if (!isRecord(raw)) return null
  const last = raw.last_refresh
  if (!isRecord(last)) return null

  // #2591.3 — la dimension rejouée, pour NOMMER un score non recalculé
  // (« ce rafraîchissement n'a repris que {{dimension}} »). Absente sur un
  // compte rendu plus ancien : jamais devinée.
  const phase: RefreshDimension | null = refreshDimensionSchema.safeParse(last.phase).success
    ? (last.phase as RefreshDimension)
    : null

  const rawFailure = isRecord(last.failure) ? last.failure : null
  const failure: RefreshFailureView | null =
    rawFailure && refreshDimensionSchema.safeParse(rawFailure.phase).success
      ? {
          phase: rawFailure.phase as RefreshDimension,
          outcome: rawFailure.outcome === 'unknown' ? 'unknown' : 'failed',
          keptDimensions: dimensions(rawFailure.keptDimensions),
          credits: {
            debited:
              typeof (rawFailure.credits as { debited?: unknown })?.debited === 'number'
                ? (rawFailure.credits as { debited: number }).debited
                : null,
            refunded: (rawFailure.credits as { refunded?: unknown })?.refunded === true,
          },
          retry: {
            dimension: rawFailure.phase as RefreshDimension,
            allowed: (rawFailure.retry as { allowed?: unknown })?.allowed !== false,
            needsConfirmation: (rawFailure.retry as { needsConfirmation?: unknown })?.needsConfirmation === true,
          },
        }
      : null

  const rawDiff = isRecord(last.diff) ? last.diff : null
  const diff: RefreshDiffView | null = rawDiff
    ? {
        newFacts: records(rawDiff.newFacts).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          value: text(item.value),
        })),
        changedFacts: records(rawDiff.changedFacts).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          before: text(item.before),
          after: text(item.after),
        })),
        obsoleteFacts: records(rawDiff.obsoleteFacts).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          lastKnownValue: text(item.lastKnownValue),
          lastSeenAt: text(item.lastSeenAt),
        })),
        preservedCorrections: records(rawDiff.preservedCorrections).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          keptValue: text(item.keptValue),
          discardedValue: text(item.discardedValue),
        })),
        // #2318.8 — le CONSTAT d'écrasement, recopié tel quel. Une entrée sans
        // phase nommée serait une accusation sans coupable : on l'écarte.
        overwrittenCorrections: records(rawDiff.overwrittenCorrections)
          .map(item => ({
            key: String(item.key ?? ''),
            label: String(item.label ?? item.key ?? ''),
            correctedValue: text(item.correctedValue),
            overwrittenWith: text(item.overwrittenWith),
            byPhase: String(item.byPhase ?? ''),
          }))
          .filter(item => item.key !== '' && item.byPhase !== ''),
        changedRecommendations: records(rawDiff.changedRecommendations).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          before: text(item.before),
          after: text(item.after),
        })),
        obsoleteActions: records(rawDiff.obsoleteActions).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
        })),
        // #2318.4 — signaux expirés : mêmes règles qu'un fait obsolète (on
        // archive, on ne supprime pas — la dernière valeur connue reste
        // lisible, avec sa date).
        expiredSignals: records(rawDiff.expiredSignals).map(item => ({
          key: String(item.key ?? ''),
          label: String(item.label ?? item.key ?? ''),
          lastKnownValue: text(item.lastKnownValue),
          lastSeenAt: text(item.lastSeenAt),
        })),
        scoreChanged: scoreOrConfidence(rawDiff.scoreChanged),
        confidenceChanged: scoreOrConfidence(rawDiff.confidenceChanged),
        // #2591.3 — un score réellement changé prime toujours : jamais les
        // deux à la fois, même face à un blob malformé qui les porterait
        // ensemble.
        scoreNotRecalculated: scoreOrConfidence(rawDiff.scoreChanged)
          ? null
          : readScoreNotRecalculated(rawDiff.scoreNotRecalculated),
        // #2591.6 — même garde qu'au-dessus : une confiance réellement changée
        // prime toujours, même face à un blob malformé qui porterait les deux.
        confidenceNotRecalculated: scoreOrConfidence(rawDiff.confidenceChanged)
          ? null
          : readConfidenceNotRecalculated(rawDiff.confidenceNotRecalculated),
        unmeasured: dimensions(rawDiff.unmeasured),
        // #2555.2 — un compte absent ou illisible se lit 0, jamais « inconnu » :
        // contrairement à `discovered`/`llmEnriched` (couverture du CORPUS,
        // jamais mesurée avant ce chantier), ce champ existe depuis que
        // `buildRefreshDiff` écrit le blob — un dossier qui en a un l'écrit
        // toujours, même à zéro. Un blob plus ancien (avant #2555.2) le rend
        // 0, ce qui NE PROMET PAS « rien n'était inchangé » : la ligne ne
        // s'affiche que si au moins un autre compteur du diff est non vide
        // (voir `nothingChanged`), donc un vieux blob à tout zéro n'affiche de
        // toute façon que « aucun changement ».
        unchangedFacts: typeof rawDiff.unchangedFacts === 'number' ? rawDiff.unchangedFacts : 0,
      }
    : null

  if (!diff && !failure) return null
  return { diff, failure, phase }
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {title}
        </Text>
      </div>
      <ul className="mt-1 space-y-0.5">{children}</ul>
    </div>
  )
}

export function RefreshOutcomeCard({ account }: { account: Account }) {
  const { t, i18n } = useTranslation('accounts')
  const outcome = readLastRefresh(account)
  if (!outcome) return null
  const { diff, failure, phase } = outcome

  const fieldLabel = (key: string, fallback: string): string =>
    t(`refreshOutcome.field.${key}`, { defaultValue: fallback })

  const onDate = (iso: string | null): string | null => {
    if (!iso) return null
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(i18n.language)
  }

  // #2318.4 — la vue « organigramme » du MÊME rafraîchissement, pour les
  // trois champs que `raw_analysis.last_refresh.diff` ne porte pas : nouveaux
  // contacts, contacts non reconfirmés, nouvelles entités. Écrite par le même
  // geste (`AccountsService.applyOrgChart`, appelé par `enrichOrganigram` sur
  // les axes entités/filiales/postes), lue ici via le lecteur déjà testé —
  // pas un second parseur du blob (GA-26).
  const orgDiff = readOrgPeopleRefreshDiff(account.raw_analysis)

  const nothingChanged =
    diff !== null &&
    diff.unmeasured.length === 0 &&
    diff.newFacts.length === 0 &&
    diff.changedFacts.length === 0 &&
    diff.obsoleteFacts.length === 0 &&
    diff.changedRecommendations.length === 0 &&
    diff.obsoleteActions.length === 0 &&
    diff.expiredSignals.length === 0 &&
    diff.scoreChanged === null &&
    diff.confidenceChanged === null &&
    // #2591.3 — un score non recalculé n'est pas « rien n'a changé ».
    diff.scoreNotRecalculated === null &&
    // #2591.6 — même règle pour la confiance non recalculée.
    diff.confidenceNotRecalculated === null

  // #2591.3 — « avec, si possible, la date du dernier calcul réel » (#2591).
  // `applyPlan` (Phase 4, dimension 'strategy'/'buying_path') est le SEUL
  // écrivain de `priority_score` — sa fraîcheur est donc la date honnête du
  // dernier VRAI calcul, déjà portée par `account` (GA-26 : une lecture
  // existante, pas un second champ inventé pour ce diff).
  const lastScoreCalculatedOn = onDate(account.strategy_refreshed_at ?? null)
  // #2591.6 — même principe pour la confiance : `signals`/`identity_group`/
  // `ecosystem`/`projects` (Phase 1) sont les SEULS écrivains de
  // `raw_analysis.confidence`, et partagent tous la même fraîcheur
  // (`signals_refreshed_at`, GA-26).
  const lastConfidenceCalculatedOn = onDate(account.signals_refreshed_at ?? null)
  const refreshedDimensionLabel = phase ? t(`refreshDimension.${phase}`) : null

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('refreshOutcome.title')}
        </Text>
      </div>

      {failure ? <RefreshFailureBlock failure={failure} accountId={account.id} /> : null}

      {diff ? (
        <>
          {diff.unmeasured.length > 0 ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
              {t('refreshOutcome.unmeasured', {
                axes: diff.unmeasured.map(dimension => t(`refreshDimension.${dimension}`)).join(', '),
              })}
            </Text>
          ) : null}

          {/* #2555.2 — la QUATRIÈME catégorie (nouveaux · modifiés · INCHANGÉS ·
              erreurs) : sans elle, un fait relu à l'identique ne se
              distinguait pas d'un fait jamais revu. Affichée dès qu'il y en a
              un, même quand `nothingChanged` couvre déjà le cas global — elle
              nomme alors CE QUI a été relu, pas seulement l'absence de
              changement. */}
          {diff.unchangedFacts > 0 ? (
            <Text size="xs" className="mt-2 flex items-center gap-1.5 text-[var(--bellum-text-muted)]">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
              {t('refreshOutcome.unchangedFacts', { count: diff.unchangedFacts })}
            </Text>
          ) : null}

          {nothingChanged ? (
            <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('refreshOutcome.nothingChanged')}
            </Text>
          ) : null}

          {diff.newFacts.length > 0 ? (
            <Section
              icon={<Plus className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.newFacts')}
            >
              {diff.newFacts.map(fact => (
                <li key={fact.key}>
                  <Text size="xs">{`${fieldLabel(fact.key, fact.label)} · ${fact.value ?? ''}`}</Text>
                </li>
              ))}
            </Section>
          ) : null}

          {diff.changedFacts.length > 0 ? (
            <Section
              icon={<ArrowRight className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.changedFacts')}
            >
              {diff.changedFacts.map(fact => (
                <li key={fact.key}>
                  <Text size="xs">
                    {t('refreshOutcome.changedLine', {
                      label: fieldLabel(fact.key, fact.label),
                      before: fact.before ?? '',
                      after: fact.after ?? '',
                    })}
                  </Text>
                </li>
              ))}
            </Section>
          ) : null}

          {diff.obsoleteFacts.length > 0 ? (
            <Section
              icon={<History className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.obsoleteFacts')}
            >
              {/* On archive, on ne supprime pas : la dernière valeur connue reste
                  lisible, avec sa date, et l'invitation à revérifier. */}
              {diff.obsoleteFacts.map(fact => {
                const seen = onDate(fact.lastSeenAt)
                return (
                  <li key={fact.key}>
                    <Text size="xs">
                      {`${fieldLabel(fact.key, fact.label)} · ${fact.lastKnownValue ?? ''} — `}
                      <span className="text-[var(--bellum-text-muted)]">
                        {seen ? t('refreshOutcome.toRecheckOn', { date: seen }) : t('refreshOutcome.toRecheck')}
                      </span>
                    </Text>
                  </li>
                )
              })}
            </Section>
          ) : null}

          {/* #2318.8 — AVANT les corrections conservées, et jamais fondu avec
              elles : « on a gardé ta correction » et « on l'a écrasée » sont
              deux phrases opposées. Du travail humain perdu se lit en premier. */}
          {diff.overwrittenCorrections.length > 0 ? (
            <Section
              icon={<AlertTriangle className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.overwrittenCorrections')}
            >
              {diff.overwrittenCorrections.map(item => (
                <li key={item.key}>
                  <Text size="xs">
                    {t('refreshOutcome.overwrittenLine', {
                      label: fieldLabel(item.key, item.label),
                      corrected: item.correctedValue ?? '',
                      overwritten: item.overwrittenWith ?? '',
                      // Même lecture que les axes non mesurés ci-dessus (GA-26) :
                      // un axe se nomme à un seul endroit.
                      phase: t(`refreshDimension.${item.byPhase}`),
                    })}
                  </Text>
                </li>
              ))}
            </Section>
          ) : null}

          {diff.preservedCorrections.length > 0 ? (
            <Section
              icon={<ShieldCheck className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.preservedCorrections')}
            >
              {diff.preservedCorrections.map(item => (
                <li key={item.key}>
                  <Text size="xs">
                    {item.discardedValue
                      ? t('refreshOutcome.preservedLine', {
                          label: fieldLabel(item.key, item.label),
                          kept: item.keptValue ?? '',
                          discarded: item.discardedValue,
                        })
                      : `${fieldLabel(item.key, item.label)} · ${item.keptValue ?? ''}`}
                  </Text>
                </li>
              ))}
            </Section>
          ) : null}

          {diff.changedRecommendations.length > 0 ? (
            <Section
              icon={<Sparkles className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.changedRecommendations')}
            >
              {diff.changedRecommendations.map(item => (
                <li key={item.key}>
                  <Text size="xs">
                    {t('refreshOutcome.changedLine', {
                      label: item.label,
                      before: item.before ?? '',
                      after: item.after ?? '',
                    })}
                  </Text>
                </li>
              ))}
            </Section>
          ) : null}

          {diff.obsoleteActions.length > 0 ? (
            <Section
              icon={<History className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.obsoleteActions')}
            >
              {diff.obsoleteActions.map(item => (
                <li key={item.key}>
                  <Text size="xs">{item.label}</Text>
                </li>
              ))}
            </Section>
          ) : null}

          {/* #2318.4 — « signaux expirés » : même traitement qu'un fait
              obsolète, catégorie nommée à part. */}
          {diff.expiredSignals.length > 0 ? (
            <Section
              icon={<History className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />}
              title={t('refreshOutcome.expiredSignals')}
            >
              {diff.expiredSignals.map(signal => {
                const seen = onDate(signal.lastSeenAt)
                return (
                  <li key={signal.key}>
                    <Text size="xs">
                      {`${fieldLabel(signal.key, signal.label)} · ${signal.lastKnownValue ?? ''} — `}
                      <span className="text-[var(--bellum-text-muted)]">
                        {seen ? t('refreshOutcome.toRecheckOn', { date: seen }) : t('refreshOutcome.toRecheck')}
                      </span>
                    </Text>
                  </li>
                )
              })}
            </Section>
          ) : null}

          {/* #2318.4 — « score modifié » / « confiance modifiée ».
              #2591.3 — ou, faute d'avoir pu recalculer le score, le DIRE
              plutôt que de laisser lire « stable ».
              #2591.6 — même chose pour la confiance. */}
          {diff.scoreChanged ||
          diff.confidenceChanged ||
          diff.scoreNotRecalculated ||
          diff.confidenceNotRecalculated ? (
            <div className="mt-3" data-testid="refresh-outcome-score-confidence">
              {diff.scoreChanged ? (
                <Text size="xs">
                  {t('refreshOutcome.scoreChanged', {
                    before: diff.scoreChanged.before ?? '',
                    after: diff.scoreChanged.after ?? '',
                  })}
                </Text>
              ) : null}
              {/* Un score réellement changé prime : jamais les deux lignes à
                  la fois (le lecteur de blob les rend déjà mutuellement
                  exclusifs — cette garde tient même face à un blob malformé). */}
              {!diff.scoreChanged && diff.scoreNotRecalculated ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {refreshedDimensionLabel
                    ? lastScoreCalculatedOn
                      ? t('refreshOutcome.scoreNotRecalculatedOn', {
                          dimension: refreshedDimensionLabel,
                          date: lastScoreCalculatedOn,
                        })
                      : t('refreshOutcome.scoreNotRecalculated', { dimension: refreshedDimensionLabel })
                    : t('refreshOutcome.scoreNotRecalculatedUnknownDimension')}
                </Text>
              ) : null}
              {diff.confidenceChanged ? (
                <Text size="xs">
                  {t('refreshOutcome.confidenceChanged', {
                    before: diff.confidenceChanged.before ?? '',
                    after: diff.confidenceChanged.after ?? '',
                  })}
                </Text>
              ) : null}
              {/* #2591.6 — même garde que pour le score : une confiance
                  réellement changée prime, jamais les deux lignes à la fois. */}
              {!diff.confidenceChanged && diff.confidenceNotRecalculated ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {refreshedDimensionLabel
                    ? lastConfidenceCalculatedOn
                      ? t('refreshOutcome.confidenceNotRecalculatedOn', {
                          dimension: refreshedDimensionLabel,
                          date: lastConfidenceCalculatedOn,
                        })
                      : t('refreshOutcome.confidenceNotRecalculated', { dimension: refreshedDimensionLabel })
                    : t('refreshOutcome.confidenceNotRecalculatedUnknownDimension')}
                </Text>
              ) : null}
            </div>
          ) : null}

          {/* #2318.4 — « contacts partis » / « nouveaux contacts » / « nouvelles
              entités » : lus depuis le MÊME rafraîchissement (organigramme),
              en comptes seulement — le détail nommé vit dans l'onglet
              Organigramme (`OrgPeopleRefreshDiffCard`, GA-26). Une personne
              NON RECONFIRMÉE n'est jamais dite « partie » : c'est exactement
              la nuance que la doctrine impose (on archive, on ne suppose
              pas). */}
          {orgDiff && (orgDiff.new.length > 0 || orgDiff.notConfirmed.length > 0 || orgDiff.newEntities.length > 0) ? (
            <div className="mt-3 flex items-start gap-1.5" data-testid="refresh-outcome-org-summary">
              <Users className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {[
                  orgDiff.new.length > 0 ? t('refreshOutcome.newContacts', { count: orgDiff.new.length }) : null,
                  orgDiff.notConfirmed.length > 0
                    ? t('refreshOutcome.notConfirmedContacts', { count: orgDiff.notConfirmed.length })
                    : null,
                  orgDiff.newEntities.length > 0
                    ? t('refreshOutcome.newEntities', { count: orgDiff.newEntities.length })
                    : null,
                ]
                  .filter((line): line is string => line !== null)
                  .join(' · ')}
              </Text>
            </div>
          ) : null}
          {/* #2164.38 — les personnes NON RECONFIRMÉES, nommément : un compte
              seul (« 2 contacts non reconfirmés ») obligeait à ouvrir
              l'organigramme pour savoir QUI. Le libellé reste « non
              reconfirmé », jamais « parti » (on archive, on ne suppose pas). */}
          {orgDiff && orgDiff.notConfirmed.length > 0 ? (
            <Text
              size="xs"
              className="mt-1 text-[var(--bellum-text-secondary)]"
              data-testid="refresh-outcome-not-confirmed-names"
            >
              {t('refreshNamed.notConfirmed', {
                ns: 'accountDetail',
                names: orgDiff.notConfirmed.map(person => person.fullName).join(', '),
              })}
            </Text>
          ) : null}
          {/* #2164.39 — les nouvelles entités (filiales, sites), nommément. */}
          {orgDiff && orgDiff.newEntities.length > 0 ? (
            <Text
              size="xs"
              className="mt-1 text-[var(--bellum-text-secondary)]"
              data-testid="refresh-outcome-new-entity-names"
            >
              {t('refreshNamed.newEntities', {
                ns: 'accountDetail',
                names: orgDiff.newEntities.map(entity => entity.name).join(', '),
              })}
            </Text>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}

/**
 * L'ÉCHEC, et le seul endroit de cette carte qui parle au serveur.
 *
 * ⚠️ Il est un composant à part, et ce n'est pas un rangement : `useRefreshDimension`
 * appelle `useQueryClient`, donc le monter inconditionnellement exigerait un
 * `QueryClientProvider` de tout écran qui rend la Synthèse — y compris ceux qui
 * n'ont aucun rafraîchissement à montrer. Rendu ici, il ne se monte que quand
 * une phase a réellement échoué.
 */
function RefreshFailureBlock({ failure, accountId }: { failure: RefreshFailureView; accountId: string }) {
  const { t } = useTranslation('accounts')
  const refresh = useRefreshDimension(accountId)
  // Un `unknown` ne se rejoue pas d'un clic : le premier clic EXPLIQUE.
  const [retryWarned, setRetryWarned] = useState(false)

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="size-4 text-[var(--danger-soft-text)]" aria-hidden />
        <Text size="sm" weight="medium">
          {t('refreshOutcome.failure.title', { phase: t(`refreshDimension.${failure.phase}`) })}
        </Text>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('refreshOutcome.failure.kept', {
          axes: failure.keptDimensions.map(dimension => t(`refreshDimension.${dimension}`)).join(', '),
        })}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('refreshOutcome.failure.preserved')}
      </Text>
      {failure.retry.needsConfirmation && retryWarned ? (
        <Text size="xs" className="mt-2 text-[var(--warning-soft-text)]">
          {t('refreshOutcome.failure.unknownWarning')}
        </Text>
      ) : null}
      {failure.retry.allowed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 min-h-11 gap-1.5 pointer-coarse:min-h-11"
          disabled={refresh.isPending}
          onClick={() => {
            // Une requête PARTIE sans réponse peut avoir été appliquée :
            // rejouer d'un clic paierait deux fois, et pourrait produire une
            // seconde écriture. On ne l'interdit pas — on refuse de le faire
            // SANS LE DIRE.
            if (failure.retry.needsConfirmation && !retryWarned) {
              setRetryWarned(true)
              return
            }
            refresh.mutate(failure.retry.dimension)
          }}
        >
          {failure.retry.needsConfirmation && retryWarned
            ? t('refreshOutcome.failure.retryAnyway')
            : t('refreshOutcome.failure.retry', { phase: t(`refreshDimension.${failure.phase}`) })}
        </Button>
      ) : null}
    </div>
  )
}
