import type { AccountCohortIndex, AccountMarketContext } from '@bellum/contracts'
import { marketSaturation, MARKET_PREVIEW_MAX_ITEMS } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { Network, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { observedRoleFamilyLabels } from '@/features/accounts/model/observedRoleFamilies'

/**
 * #1640.3 — LE CONTEXTE MARCHÉ, SUR LE DOSSIER LUI-MÊME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le popover « Contexte marché » de la LISTE (#1582,
 * `../../../accounts-list/AccountMarketContextButton.tsx`) écrit déjà
 * « Recours à des externes : Observé » via les clés i18n
 * `accounts.json:marketContext.*`. Le retour bêta du 06/09/2026 constate que
 * le DOSSIER d'un compte — la page qu'on ouvre pour le lire en entier — ne
 * montre ce fait nulle part : fermer la liste, c'était perdre l'information.
 *
 * Cette carte réutilise le MÊME hook (`useAccountMarketContext`) et les MÊMES
 * clés i18n (`marketContext.title`, `.externalUse`, `.externalUseObserved`,
 * `.loading`, `.unavailable`) — un seul jeu de clés pour les deux écrans. La
 * seule clé neuve est `marketContext.notMeasured` : le popover de la liste n'a
 * jamais eu besoin de l'écrire, parce qu'il choisit de ne PAS se rendre du
 * tout sous le seuil de couverture (`pathsObserved <= 0` → aucune icône). Le
 * dossier, lui, est une carte déjà en place dans une page qu'on lit en entier :
 * la faire disparaître silencieusement serait indiscernable d'un bug de
 * chargement, alors qu'écrire « Non mesuré » est la même honnêteté que partout
 * ailleurs dans ce dépôt (« non mesuré n'est jamais 0 »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1640.2 — L'INDEX PAR COHORTE, ET POURQUOI IL N'APPARAÎT PAS AUJOURD'HUI
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_signal.externalization_score` existe en base (rempli à
 * l'ingestion, `apps/api/src/modules/market-memory/market-memory-import.ts:249`).
 * Ce fichier ne le lit PAS, et ne le lira jamais : un score brut, non normalisé
 * par cohorte, comparerait une PME et un groupe du CAC 40 sur la même échelle.
 * Ce que la carte rend — quand l'API le lui envoie — c'est l'INDEX NORMALISÉ,
 * calculé côté serveur (`MarketMemoryService.cohortIndexFor`), décomposé en
 * trois axes NOMMÉS : un score ne s'affiche jamais nu (doctrine
 * `c26_probabilite`), d'où `ScoreWithAxes` et jamais un `{value}` à la main.
 *
 * ⚠️ **`cohort_index` est ABSENT tant que `MARKET_MEMORY_SCORING_ENABLED` est
 * `false`** — l'état d'aujourd'hui. Le drapeau se lit à UN seul endroit, le
 * contrôleur (`accounts.controller.ts`, `marketContext`), qui ne fait alors
 * aucune lecture de cohorte et n'envoie pas le champ. Le bloc ci-dessous ne se
 * rend donc pas, et l'écran continue de n'écrire que « Recours externe
 * observé » ou « Non mesuré » : construire l'index et l'ALLUMER sont deux
 * décisions, et la seconde attend la calibration sur données réelles
 * (`apps/api/src/scripts/measure-market-memory-cohort-index.ts`).
 *
 * ⚠️ Le bloc ne se rend pas non plus sur un champ ABSENT d'une API antérieure :
 * `cohort_index === undefined` et `=== null` (entreprise non rapprochée du
 * corpus) se rendent pareil — il n'y a rien à dire, et surtout pas « 0 ».
 *
 * `GA-257` (`apps/web/src/architecture/`) tient l'autre moitié du refus : elle
 * échoue si `externalizationScore` se lit hors de l'unique endroit qu'elle
 * calibre — et elle vérifie que CE fichier, l'endroit calibré, ne le lit pas
 * non plus. Il n'a pas à le lire : le serveur envoie un index décomposé, pas
 * une colonne brute.
 *
 * ⚠️ Contrairement au popover de la liste, cette carte est TOUJOURS montée
 * (`enabled: true` dès le rendu, pas de second geste) : le dossier est une
 * page déjà ouverte exprès, la lecture différée d'une liste de vingt-cinq
 * lignes n'a pas la même raison d'être ici.
 */
export function AccountMarketMemoryCard({
  accountId,
  companyName,
  hideEsnEcosystem = false,
}: {
  accountId: string
  companyName: string
  /** K.2 / #4323 — la liste unique des ESN présentes vit ailleurs : la ligne « Sociétés de services observées » s'efface. */
  hideEsnEcosystem?: boolean
}) {
  const { t } = useTranslation('accounts')
  const { data, isPending, isError } = useAccountMarketContext(accountId, true)
  const { relaunch } = useAccountRelaunch({ id: accountId, company_name: companyName })

  const value = isPending
    ? t('marketContext.loading')
    : isError
      ? t('marketContext.unavailable')
      : data
        ? t('marketContext.externalUseObserved')
        : t('marketContext.notMeasured')

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Network className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('marketContext.title')}
        </Text>
      </div>
      <SynthesisLine label={t('marketContext.externalUse')} value={value} />
      {data ? <ObservedContextLines context={data} hideEsnEcosystem={hideEsnEcosystem} /> : null}
      {data?.cohort_index ? <CohortIndexBlock index={data.cohort_index} /> : null}
      {/* #2127.40 / .24 — LA LECTURE LOCALE ET LA VÉRIFICATION FRAÎCHE, SÉPARÉES.
          Tout ce qui est au-dessus est RELU depuis la mémoire, sans frais
          (`MARKET_MEMORY_FREE_READS.market_context_read`). Vérifier aujourd'hui,
          c'est relancer une analyse (`MARKET_MEMORY_PAID_VERIFICATIONS.account_analysis`) :
          son coût s'écrit SUR le bouton, avant le clic, et l'écran de lancement
          le redemande avant tout débit. La paire est le message — l'une sans
          l'autre passe pour de la générosité, ou pour une taxe.
          Proposée dans tous les états, panne comprise : c'est précisément quand
          la mémoire se tait qu'on a besoin de vérifier. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-3">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('marketContext.localRead')}
        </Text>
        <Button variant="outline" size="sm" icon={RefreshCw} onClick={relaunch}>
          {t('marketContext.verifyToday')}
        </Button>
      </div>
    </Card>
  )
}

/**
 * Une ligne de la synthèse : un libellé, une valeur. Trois au plus (#2127.3).
 *
 * #2117.83 — recette 23/09, prod 7e7105fb7 : sur un compte riche, la valeur
 * (« Développement · Chef de projet ») mesurait 67,9px de large dans une
 * colonne `min-w-0` pendant que le libellé voisin, lui, gardait `shrink-0` —
 * toute la largeur disponible, sans jamais céder un pixel. Le libellé
 * COMMANDAIT, la valeur RAMASSAIT ce qu'il restait. Une GRILLE à deux
 * colonnes ÉGALES (`grid-cols-2`) corrige la cause plutôt que le symptôme :
 * aucun des deux côtés ne peut plus dicter sa largeur à l'autre, chacun
 * borné à `min-w-0` pour pouvoir se replier sur deux lignes au lieu
 * d'écraser son voisin — la valeur la plus longue de la carte tient
 * lisiblement dans sa moitié.
 */
function SynthesisLine({ label, value }: { label: string; value: string }) {
  return (
    <div data-testid="market-memory-synthesis-line" className="mt-2 grid grid-cols-2 items-baseline gap-3">
      <Text size="xs" className="min-w-0 text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="xs" weight="medium" className="min-w-0 text-right text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </div>
  )
}

/**
 * #2127.3 / .5 / .6 — LES DEUX LIGNES QUI MANQUAIENT À LA SYNTHÈSE.
 *
 * La synthèse lit le passé du marché en TROIS lignes, jamais plus : le recours à
 * des externes (au-dessus), les familles d'expertise observées, l'écosystème de
 * sociétés de services observé. Chaque liste est bornée à
 * `MARKET_PREVIEW_MAX_ITEMS` pour la même raison que l'aperçu de lancement : un
 * aperçu, pas un recensement.
 *
 * ⚠️ Rendues SEULEMENT sur un compte couvert. Sous le seuil, la ligne du dessus
 * écrit déjà « Non mesuré » : la répéter trois fois dirait trois fois la même
 * chose (loi 4 du tome 7).
 *
 * · Familles — le seau résiduel (« Autre ») sort par `isResidualRoleFamily`, le
 *   filtre UNIQUE du contrat (#1755 : il arrivait premier partout). Champ absent
 *   (API antérieure) → la ligne se tait ; présent mais sans famille nommée →
 *   « À qualifier », jamais « aucune ».
 * · Écosystème — les sociétés NOMMÉES, les plus observées d'abord. Détail absent
 *   (API antérieure) → le comptage, rendu comme dans le popover de la liste
 *   (« Couvert » / « À qualifier ») ; `0` n'est jamais écrit.
 *
 * LAU-FINAL-211 (#3205.5) — LA SATURATION REJOINT LA LIGNE ÉCOSYSTÈME, ELLE
 * N'EN OUVRE PAS UNE QUATRIÈME. La doctrine du bloc ci-dessus (« TROIS lignes,
 * jamais plus ») reste tenue : `marketSaturation` (`@bellum/contracts`) rend
 * une catégorie NOMMÉE, jamais un score, qui s'ajoute entre parenthèses à la
 * ligne qui porte déjà les sociétés observées — jamais une ligne séparée.
 * `insufficient_information` ne s'affiche PAS ici : la ligne dit déjà
 * « Couvert »/« À qualifier » dans ce cas, et répéter « information
 * insuffisante » à côté serait la même absence dite deux fois.
 */
function ObservedContextLines({
  context,
  hideEsnEcosystem,
}: {
  context: AccountMarketContext
  hideEsnEcosystem: boolean
}) {
  const { t } = useTranslation('accounts')

  // #2127.8 — la même liste que sous un signal d'emploi : une seule dérivation.
  const families = observedRoleFamilyLabels(context)

  const esnNames = context.esn_observed_detail
    ? [...context.esn_observed_detail]
        .sort((a, b) => b.persons - a.persons)
        .slice(0, MARKET_PREVIEW_MAX_ITEMS)
        .map(entry => entry.esnName)
    : null

  const saturation = marketSaturation({
    esnObserved: context.esn_observed,
    esnObservedDetail: context.esn_observed_detail,
  })
  const saturationSuffix =
    saturation && saturation !== 'insufficient_information' ? ` · ${t(`marketContext.saturation.${saturation}`)}` : ''

  const ecosystem =
    esnNames && esnNames.length > 0
      ? esnNames.join(' · ')
      : esnNames === null && context.esn_observed > 0
        ? t('marketContext.esnCovered')
        : t('marketContext.esnToQualify')

  return (
    <>
      {families ? (
        <SynthesisLine
          label={t('marketContext.roleFamilies')}
          value={families.length > 0 ? families.join(' · ') : t('marketContext.roleFamiliesToQualify')}
        />
      ) : null}
      {hideEsnEcosystem ? null : (
        <SynthesisLine label={t('marketContext.esnEcosystemObserved')} value={`${ecosystem}${saturationSuffix}`} />
      )}
    </>
  )
}

/**
 * #1640.2 — L'index et ses axes, par la primitive, jamais à la main.
 *
 * `ScoreWithAxes` porte déjà toute la discipline : elle rend « 62/100 » et
 * jamais « 62 % », elle NOMME ce qui n'a pas pu être évalué, et elle affiche
 * `UnknownValue` avec sa raison plutôt qu'un zéro quand il n'y a pas de note.
 * La recoder ici perdrait les trois, une par une, sans que rien ne le dise —
 * et une carte du dépôt l'a déjà fait.
 *
 * La phrase de prudence n'est PAS décorative : `cohortRelativePosition` est un
 * rang dans un échantillon de pairs, et un commercial peut répéter un chiffre
 * en rendez-vous. « 72 » ne dit jamais « 72 % externalisent » (doctrine
 * `c65_couverture_nest_pas_un_fait_de_marche`, garde GA-259).
 */
function CohortIndexBlock({ index }: { index: AccountCohortIndex }) {
  const { t } = useTranslation('accounts')

  // Une exclusion porte sa RAISON jusqu'à l'écran — « non mesuré » tout seul ne
  // répond qu'à « combien ? », la raison répond à « qu'est-ce qui manque ? ».
  const reason = index.kind === 'excluded' ? t(`marketContext.cohortIndex.excluded.${index.reason}`) : null

  // Les axes évaluÉS d'abord, puis ceux qui n'ont PAS pu l'être — ces derniers
  // avec `score: null`, que `ScoreWithAxes` sort du dénominateur et NOMME.
  // « Non évaluable » ne vaut pas zéro : c'est toute la discipline du dépôt.
  const axes: { label: string; score: number | null }[] =
    index.kind === 'calculable'
      ? [
          ...index.evaluated.map(axis => ({
            label: t(`marketContext.cohortIndex.axis.${axis.axis}`),
            score: axis.value as number | null,
          })),
          ...index.notEvaluable.map(axis => ({
            label: t(`marketContext.cohortIndex.axis.${axis}`),
            score: null,
          })),
        ]
      : []

  return (
    <div className="mt-3 border-t border-[var(--bellum-border)] pt-3">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('marketContext.cohortIndex.label')}
      </Text>
      <div className="mt-1">
        <ScoreWithAxes score={index.kind === 'calculable' ? index.index : null} max={100} axes={axes} reason={reason} />
      </div>
      {index.kind === 'calculable' ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('marketContext.cohortIndex.cohort', {
            bracket: index.cohort.bracket,
            count: index.cohort.measuredPeers,
          })}
        </Text>
      ) : null}
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('marketContext.cohortIndex.caution')}
      </Text>
    </div>
  )
}
