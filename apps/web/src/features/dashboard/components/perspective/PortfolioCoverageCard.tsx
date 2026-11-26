import type { CockpitCoverage, CockpitCoverageAnomaly } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CockpitSources } from './CockpitSources'
import { StructuralPotentialBadge } from './StructuralPotentialBadge'

/**
 * « Mon portefeuille », lu en COUVERTURE (#1408).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE BLOC REMPLACE « MES COMPTES »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour dit que « Mes priorités » et « Mes comptes » font doublon avec la
 * page Comptes et avec « Aujourd'hui ». Il a raison, et la cause est structurelle :
 * une liste de comptes triée par score EST la page Comptes, avec moins de
 * colonnes. Ce bloc ne liste donc plus le portefeuille — il en compte les
 * ÉTATS, puis ne montre que ce qui cloche.
 *
 * La règle d'admission est celle du retour, mot pour mot : « un compte listé
 * ici doit apparaître parce qu'il révèle un problème de couverture ou une
 * opportunité, pas simplement parce qu'il existe ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ET LE MOT « MES COMPTES » A CHANGÉ DE POPULATION
 * ─────────────────────────────────────────────────────────────────────────────
 * C'était la contradiction de fond du lot. Le cockpit filtrait sur le CRÉATEUR
 * du compte, `/comptes` sur son RESPONSABLE : deux populations, un seul mot. Le
 * serveur lit désormais le responsable des deux côtés, et le chemin de
 * l'analyse pose enfin `assigned_to` — sans quoi l'alignement aurait vidé le
 * cockpit. Ce commentaire est ici pour que personne ne « re-corrige » vers le
 * créateur en croyant réparer quelque chose.
 */
export function PortfolioCoverageCard({ coverage }: { coverage: CockpitCoverage }) {
  const { t } = useTranslation('dashboard')

  return (
    <section
      aria-label={t('perspective.coverage.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('perspective.coverage.title')}
        </Text>
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          {t('perspective.coverage.cta')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {/* La synthèse visuelle : cinq états, chacun capable de dire « je ne sais
          pas ». Aucun `?? 0` — un compteur illisible qui s'affiche « 0 » annonce
          une bonne nouvelle que rien ne justifie.

          #2114.56/.60 — SEULES DEUX tuiles sont cliquables. `/accounts` ne
          porte de filtre réel que pour `withoutNextAction` et `newSignals7d`
          (`ACCOUNT_LIST_HEADLINE_FILTERS`, `account.ts:496`, même patron que
          `sinceLastVisitLineHref`). Les trois autres (suivis, silencieux,
          jamais travaillés) n'ont AUCUN filtre serveur : les rendre
          cliquables ouvrirait une liste NON filtrée — « un objet sans écran
          où atterrir ne se promet pas cliquable ». */}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tally label={t('perspective.coverage.followed')} value={coverage.followed} />
        <Tally
          label={t('perspective.coverage.withoutNextAction')}
          value={coverage.without_next_action}
          href="/accounts?headline=withoutNextAction"
        />
        <Tally label={t('perspective.coverage.silent')} value={coverage.no_interaction_30d} />
        <Tally
          label={t('perspective.coverage.newSignals')}
          value={coverage.new_signals_7d}
          href="/accounts?headline=newSignals7d"
        />
        <Tally label={t('perspective.coverage.neverWorked')} value={coverage.never_worked} />
      </dl>

      {coverage.anomalies.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {coverage.anomalies.map(anomaly => (
            <li key={anomaly.account_id}>
              <AnomalyRow anomaly={anomaly} />
            </li>
          ))}
        </ul>
      ) : (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-secondary)]">
          {t('perspective.coverage.noAnomaly')}
        </Text>
      )}

      <CockpitSources provenance={coverage.provenance} />
    </section>
  )
}

function Tally({
  label,
  value,
  href,
}: {
  label: string
  value: number | null
  /** #2114.60 — seules `withoutNextAction`/`newSignals7d` en portent un : le
   *  filtre `/accounts` réel n'existe que pour ces deux-là. Type `string`
   *  générique (pas un littéral de route) — même patron que
   *  `sinceLastVisitLineHref`, qui rend aussi une query string vers un
   *  `<Link to>` typé. */
  href?: string
}) {
  const dt = <dt className="text-xs uppercase tracking-wide text-[var(--bellum-text-muted)]">{label}</dt>
  const dd = (
    <dd className="mt-0.5">
      {value === null ? (
        <UnknownValue />
      ) : (
        <Text size="lg" weight="semibold" className="tabular-nums text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      )}
    </dd>
  )

  // `<dl>` n'accepte QUE dt/dd/div/script/template en enfant direct (HTML5) —
  // le `<a>` reste DANS le `<div>`, jamais à sa place, sous peine de balisage
  // invalide. Un compte non mesuré n'a rien à filtrer : le lien n'apparaît
  // que sur une valeur réelle, jamais au-dessus d'un `UnknownValue`.
  if (href && value !== null) {
    return (
      <div className="min-w-0">
        <Link to={href} className="block rounded-sm pointer-coarse:min-h-11">
          {dt}
          {dd}
        </Link>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {dt}
      {dd}
    </div>
  )
}

function AnomalyRow({ anomaly }: { anomaly: CockpitCoverageAnomaly }) {
  const { t, i18n } = useTranslation('dashboard')
  const name = anomaly.company_name ?? t('perspective.unnamedAccount')
  // ⚠️ `since` à `null` sur un silence veut dire « JAMAIS d'échange », ce qui
  // n'est pas « depuis zéro jour ». Les deux phrases sont distinctes, et la
  // seconde serait fausse.
  // #1572 — les parcours observés complètent la RAISON, ils ne la remplacent
  // pas : l'état de la relation prime, et le fragment n'apparaît que si la
  // mémoire marché couvre vraiment le compte. Le contrat garantit déjà qu'il
  // n'arrive jamais sous le seuil ni à zéro — l'absence est SILENCIEUSE ici,
  // pas d'« inconnu », pas de tiret : cet écran sert à agir, pas à auditer.
  // ⚠️ `?? null` et pas seulement `??` : le champ est ABSENT d'une API plus
  // ancienne que le web, et le lire sans garde casserait la carte entière
  // pendant toute la durée d'un déploiement.
  const marketPaths = anomaly.market_paths ?? null
  const detail =
    anomaly.kind === 'no_recent_interaction' && anomaly.since === null
      ? t('perspective.coverage.reason.neverExchanged')
      : anomaly.since
        ? t(`perspective.coverage.reason.${anomaly.kind}Since`, {
            date: new Date(anomaly.since).toLocaleDateString(i18n.language),
          })
        : t(`perspective.coverage.reason.${anomaly.kind}`)

  return (
    // #1573.4 — LE BADGE VIT HORS DU LIEN, PAS DEDANS.
    //
    // `AnomalyRow` était un unique `<Link>` : y nicher un vrai `<button>`
    // (le déclencheur du popover) imbriquerait deux éléments interactifs —
    // invalide en HTML, et le clavier ne saurait plus lequel activer. Le
    // conteneur porte donc le survol, le lien garde la navigation, et le
    // badge est un FRÈRE du lien, pas un enfant.
    <div className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2 transition-colors hover:bg-[var(--bellum-surface-2)]">
      <Link
        to="/accounts/$id"
        params={{ id: anomaly.account_id }}
        className="flex min-w-0 flex-1 items-center gap-3 pointer-coarse:min-h-11"
      >
        <CompanyAvatar name={name} logoUrl={anomaly.logo_url ?? null} website={anomaly.website ?? null} />
        <span className="min-w-0 flex-1">
          <Text size="sm" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
            {name}
          </Text>
          <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
            {marketPaths === null ? detail : t('perspective.coverage.withMarketPaths', { detail, paths: marketPaths })}
          </Text>
        </span>
        <ArrowRight className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      </Link>
      {/* #1573.4 — le badge secondaire n'apparaît QUE si la mémoire marché
          couvre réellement le compte. `market_paths` n'arrive ici que déjà
          au-dessus du seuil (`MARKET_MEMORY_MIN_PATHS`) — cette ligne ne
          réévalue aucun seuil, elle ne fait que lire une présence. */}
      {marketPaths !== null && <StructuralPotentialBadge companyName={name} count={marketPaths} />}
    </div>
  )
}
