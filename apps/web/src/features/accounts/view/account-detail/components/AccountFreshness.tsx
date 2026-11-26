import type { Account, RefreshDimension } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Calendar } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { formatTimeAgo } from '@/lib/relative-time'
import { lastAnalyzedDate } from '../../../model/lastAnalyzed'

/**
 * #2117.41-45 — LA FRAÎCHEUR DIT CE QU'ELLE MESURE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le hero affichait UNE seule date — `lastAnalyzedDate(account)` — sous
 * l'unique libellé « Analyse le … ». Or le dossier peut avoir bougé de QUATRE
 * façons distinctes depuis : une analyse complète, un rafraîchissement ciblé
 * (signaux / contacts / stratégie), une observation structurelle (l'axe
 * « entités » du menu Rafraîchir, qui refait l'organigramme), ou — pas encore
 * mesurée aujourd'hui — une synchronisation CRM. Rendre les trois premières
 * sous UN texte qui dit toujours « Analyse » ment sur ce qui a réellement
 * bougé : un dossier rafraîchi hier sur son seul axe « contacts » continuait
 * d'afficher la date de sa dernière analyse COMPLÈTE, parfois bien plus
 * ancienne — la fraîcheur RÉELLE la plus récente restait invisible.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT LES QUATRE DATES
 * ─────────────────────────────────────────────────────────────────────────
 * `last_analyzed_at` existait déjà (`lastAnalyzedDate`, inchangée ici — la
 * garde contre la fausse date de création reste celle de C1). Les quatre
 * colonnes `*_refreshed_at` sont écrites par `AnalysisRefreshService`
 * (`apps/api/.../analysis-refresh.service.ts`, commentaire : « lue par
 * l'écran ») depuis l'addendum Théo P1 — AUCUN écran ne les lisait avant ce
 * lot : le défaut n°1 du dépôt (code juste que personne n'appelle), trouvé en
 * cherchant l'APPELANT plutôt que la fonction. `entities_refreshed_at` est la
 * fraîcheur de l'ORGANIGRAMME (Phase 3, `enrichOrganigram`) — la structure de
 * l'entreprise — d'où « observation structurelle » : ce n'est pas un nom
 * inventé, c'est le nom du seul axe qui correspond.
 *
 * La synchronisation CRM n'a AUCUNE date tracée aujourd'hui — `CrmPresenceBadge`
 * lit une présence en direct, jamais un horodatage de synchronisation. Plutôt
 * que de taire cette quatrième nature, elle est NOMMÉE « non mesurée » quand
 * un CRM est connecté : c'est la différence entre « je ne sais pas » et
 * « cette question n'existe pas », et c'est elle qui répond honnêtement à
 * #2117.44 sans inventer de date. Aucun nom de fournisseur : « ton CRM ».
 */
type FreshnessNature = 'fullAnalysis' | 'targetedRefresh' | 'structuralObservation'

type FreshnessFact = {
  nature: FreshnessNature
  at: string
  /** Seulement pour `targetedRefresh` — quel axe a bougé. */
  dimension?: Extract<RefreshDimension, 'signals' | 'contacts' | 'strategy'>
}

type FreshnessAccount = Pick<
  Account,
  | 'last_analyzed_at'
  | 'created_at'
  | 'status'
  | 'signals_refreshed_at'
  | 'contacts_refreshed_at'
  | 'entities_refreshed_at'
  | 'strategy_refreshed_at'
>

/**
 * Le fait de fraîcheur le plus RÉCENT parmi les quatre sources connues, ou
 * `null` si aucune n'est mesurée. Pure — c'est ce qui permet de la tester sans
 * monter d'écran.
 */
export function computeFreshnessFact(account: FreshnessAccount): FreshnessFact | null {
  const candidates: FreshnessFact[] = []
  const full = lastAnalyzedDate(account)
  if (full) candidates.push({ nature: 'fullAnalysis', at: full })
  if (account.signals_refreshed_at)
    candidates.push({ nature: 'targetedRefresh', at: account.signals_refreshed_at, dimension: 'signals' })
  if (account.contacts_refreshed_at)
    candidates.push({ nature: 'targetedRefresh', at: account.contacts_refreshed_at, dimension: 'contacts' })
  if (account.strategy_refreshed_at)
    candidates.push({ nature: 'targetedRefresh', at: account.strategy_refreshed_at, dimension: 'strategy' })
  if (account.entities_refreshed_at)
    candidates.push({ nature: 'structuralObservation', at: account.entities_refreshed_at })

  if (candidates.length === 0) return null
  return candidates.reduce((freshest, candidate) =>
    new Date(candidate.at).getTime() > new Date(freshest.at).getTime() ? candidate : freshest,
  )
}

function formatOnDate(dateStr: string, language: string): string {
  const date = new Date(dateStr)
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  const d = date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const t = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return i18n.t('accounts:hero.dateAtTime', { date: d, time: t })
}

export function AccountFreshness({ account }: { account: Account }) {
  const { t, i18n: i18next } = useTranslation('accounts')
  const fact = computeFreshnessFact(account)

  const natureLabel =
    fact?.nature === 'targetedRefresh' && fact.dimension
      ? t('freshness.targetedRefresh', { dimension: t(`refreshDimension.${fact.dimension}`) })
      : fact
        ? t(`freshness.${fact.nature}`)
        : null

  // #2117.41 — la ligne dit « Analyse actualisée il y a N » (valeur RÉELLE,
  // `formatTimeAgo`) ; la date EXACTE et la nature restent en info-bulle.
  // Aucune date → « non mesuré », jamais une date inventée ni un silence.
  const exactDate =
    fact && natureLabel
      ? t('freshness.onDate', { nature: natureLabel, date: formatOnDate(fact.at, i18next.language) })
      : null
  const updatedAgo = fact
    ? fact.nature === 'targetedRefresh' && fact.dimension
      ? t('freshness.updatedAgo.targetedRefresh', {
          dimension: t(`refreshDimension.${fact.dimension}`),
          ago: formatTimeAgo(fact.at),
        })
      : t(`freshness.updatedAgo.${fact.nature}`, { ago: formatTimeAgo(fact.at) })
    : null
  // #3492 — une absence ne fait AUCUNE ligne (« on n'affiche pas ce qu'on n'a
  // pas », Louis 20/09) : ni « non mesuré — aucune analyse datée », ni « non
  // mesuré — date de la dernière synchronisation » (410 px d'une ligne qui ne
  // dit rien). Sans date réelle, le bloc entier disparaît.
  if (!updatedAgo || !exactDate) return null

  // R15-4 — AUCUNE position absolue. Posé en `lg:absolute` dans le coin du
  // hero, ce bloc recouvrait la ligne « Prochaine action » (x 1 079-1 463,
  // y 271-287 à 1 512 px) : il vit désormais dans le flux, sur SA rangée.
  // #4283.8 (recette 23/10) — la date ABSOLUE de la dernière analyse, à côté du « il y a », et la prochaine
  // ré-analyse d'un compte SUIVI : lue de l'API (`next_reanalysis_at`, le calcul du job de ré-analyse — GA-26), jamais
  // recalculée ici. Compte non suivi (ou veille suspendue) : aucune date, les raisons se disent dans la vue d'ensemble.
  const locale = i18next.language === 'fr' ? 'fr-FR' : 'en-GB'
  const dayFormat: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  const lastAnalysisDate = new Date(fact?.at ?? '').toLocaleDateString(locale, dayFormat)
  const next = account.next_reanalysis_at ? new Date(`${account.next_reanalysis_at}T12:00:00Z`) : null
  const nextLabel =
    next && !Number.isNaN(next.getTime()) ? next.toLocaleDateString(locale, { ...dayFormat, timeZone: 'UTC' }) : null
  return (
    <Box className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Calendar aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
      <Text element="p" size="xs" title={exactDate} className="text-[var(--bellum-text-secondary)]">
        {updatedAgo}
      </Text>
      <Text
        element="span"
        size="xs"
        data-testid="freshness-analysis-date"
        className="text-[var(--bellum-text-secondary)]"
      >
        {t('freshness.absoluteDate', { date: lastAnalysisDate })}
      </Text>
      {nextLabel ? (
        <Text
          element="span"
          size="xs"
          data-testid="freshness-next-reanalysis"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t('freshness.nextReanalysis', { date: nextLabel })}
        </Text>
      ) : null}
    </Box>
  )
}
