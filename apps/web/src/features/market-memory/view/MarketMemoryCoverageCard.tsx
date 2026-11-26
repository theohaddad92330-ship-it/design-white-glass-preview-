import type { MarketPortfolioCoverage } from '@bellum/contracts'
import { SectionCard, Text } from '@bellum/ui'
import { Library } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Completeness } from '@/components/primitives/Completeness'
import { ComputedAt } from '@/components/primitives/ComputedAt'
import { useMarketMemoryPortfolio } from '../api'

/**
 * #1633.1 / #1635.2 — LA COUVERTURE MÉMOIRE MARCHÉ DU PORTEFEUILLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN BLOC, DEUX ÉCRANS, ET C'EST LE POINT DU LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Monté sur l'écran Marché (`/accounts/marches`, #1635 ; il vivait aussi sur
 * l'ancien `/pilotage/qualite`, #1633, supprimé le 14/10/2026). Deux
 * copies auraient produit deux nombres le jour où l'une des deux change — c'est
 * mot pour mot ce que #1621 décrit, et la moitié web de ce que GA-258 tient
 * côté API.
 *
 * ⚠️ #1635.1 dit « ne pas ajouter un nouveau dashboard » : c'est un BLOC qui se
 * pose dans un écran existant, il n'a ni route, ni entête, ni titre de page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TAUX DIT, ET CE QU'IL NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « 38 sur 62 » veut dire : sur 38 comptes, la mémoire marché a assez de
 * parcours observés pour en dire quelque chose. Ça ne veut PAS dire que les
 * 24 autres se comportent d'une façon ou d'une autre — ils sont hors de ce que
 * NOUS savons, pas hors du marché. Les deux issues insistent, chacune de son
 * côté, parce que c'est la lecture que tout le monde fait spontanément.
 *
 * D'où `coverage.meaning`, affiché et non facultatif, et la garde GA-259 qui
 * interdit au vocabulaire de la sous-traitance d'entrer dans ce bloc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SUR UNE PANNE, AUCUN COMPTEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Pas des zéros : « 0 couvert sur 0 » se lirait « le marché ne connaît aucun de
 * tes comptes », ce qui est rassurant et faux. C'est le contrat qui force le
 * choix ici (`status: 'unavailable'`), il ne peut pas être oublié.
 */
export function MarketMemoryCoverageCard() {
  const { t } = useTranslation('marketMemory')
  const { data, isLoading, isError } = useMarketMemoryPortfolio()

  const body = () => {
    if (isLoading) return <Text size="sm">{t('coverage.intro')}</Text>
    // ⚠️ `!== 'ok'` et NON `=== 'unavailable'`. La première version testait la
    // panne nommée, laissait passer tout le reste, et lisait `data.coverage` sur
    // un objet qui n'en a pas — l'écran ENTIER tombait. Trouvé par les suites
    // voisines : `DataQuality` et `MarketWatch` moquent `apiFetch` avec LEUR
    // charge utile, que ce bloc recevait à son tour.
    //
    // Ce n'est pas un artefact de test. C'est la fenêtre de déploiement : le web
    // part en une minute, l'API en plusieurs, et pendant ce temps cette route
    // n'existe pas encore. Une forme inattendue doit se rendre comme une panne,
    // jamais faire tomber l'écran qui l'héberge.
    if (isError || !data || data.status !== 'ok') {
      return (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('coverage.unavailable')}
        </Text>
      )
    }
    if (data.coverage.accounts === 0) {
      return (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('coverage.empty')}
        </Text>
      )
    }
    return <CoverageBody coverage={data.coverage} computedAt={data.computedAt} />
  }

  return (
    <SectionCard icon={Library} title={t('coverage.title')} description={t('coverage.intro')}>
      {body()}
    </SectionCard>
  )
}

function CoverageBody({ coverage, computedAt }: { coverage: MarketPortfolioCoverage; computedAt: string }) {
  const { t } = useTranslation('marketMemory')

  return (
    <div className="space-y-3">
      <Text size="sm">
        {t('coverage.headline', { count: coverage.covered, covered: coverage.covered, total: coverage.accounts })}
      </Text>
      {/* ⚠️ LA PHRASE « N restants : x non résolus, y sans observation… » A ÉTÉ
          RETIRÉE À LA RECETTE DU 08/09/2026, et pour DEUX raisons.

          1. Elle répétait, mot pour mot, les quatre tuiles juste en dessous —
             les mêmes nombres deux fois sous deux formes, ce que la loi 4 du
             tome 7 refuse. Et les tuiles disent STRICTEMENT PLUS : chacune
             porte la définition de son seau, qui est ce que la page qualité
             existe pour montrer (« insuffisant » et « non résolu » se
             ressemblent et n'ont rien à voir).
          2. Elle écrivait « 1 non résolus ». i18next n'accorde que sur `count` ;
             trois nombres interpolés dans une même phrase ne peuvent pas
             s'accorder chacun. Une phrase à accords multiples n'est pas
             traduisible — c'est le libellé qu'il faut changer, pas la langue.

          Le reste (#1635.2) est tenu par le titre au-dessus et par les tuiles :
          « 4 sur 6 », puis le détail des 2 autres, avec leur raison. */}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tally label={t('coverage.tiles.covered')} says={t('coverage.tiles.coveredSays')} value={coverage.covered} />
        <Tally
          label={t('coverage.tiles.insufficient')}
          says={t('coverage.tiles.insufficientSays')}
          value={coverage.insufficientObservations}
        />
        <Tally
          label={t('coverage.tiles.ambiguous')}
          says={t('coverage.tiles.ambiguousSays')}
          value={coverage.ambiguous}
        />
        <Tally
          label={t('coverage.tiles.unresolved')}
          says={t('coverage.tiles.unresolvedSays')}
          value={coverage.unresolved}
        />
      </dl>

      {/* Une part d'une part : elle ne se range pas avec les quatre seaux, qui
          eux s'additionnent. La mettre dans la grille casserait la lecture
          « ces quatre-là font le portefeuille ». */}
      {coverage.homonyms > 0 && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('coverage.tiles.homonyms')} : {coverage.homonyms} — {t('coverage.tiles.homonymsSays')}
        </Text>
      )}

      {/* Le sens du taux, affiché et non facultatif : c'est la demande explicite
          de #1633 et de #1635, et la seule protection contre la lecture que
          tout le monde fait spontanément. */}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('coverage.meaning')}
      </Text>

      {/* ⚠️ `counted === total`, et ce n'est PAS une facilité.
          `Completeness` répond à « sur combien d'éléments cet agrégat a-t-il été
          CALCULÉ ». Il a été calculé sur les six comptes ; quatre en sont
          ressortis couverts. La première version passait `counted={covered}`,
          ce qui affichait « calculé sur 4 comptes sur 6 — 67 % » : ça disait
          qu'on n'avait pas pu lire deux comptes, ce qui est FAUX, et ça
          redoublait le titre. Ici la primitive rend « les 6 comptes », c'est-à-
          dire la seule chose qu'elle a à apprendre au lecteur : rien n'a été
          laissé de côté. */}
      <Completeness counted={coverage.accounts} total={coverage.accounts} of={t('coverage.population')} />
      <ComputedAt at={computedAt} />
    </div>
  )
}

/**
 * Un compteur qui sait dire ce qu'il compte.
 *
 * `says` n'est pas décoratif : « Observations insuffisantes : 15 » ne mène à
 * aucun geste tant qu'on ne sait pas que l'entreprise EST dans le corpus. La
 * différence entre ce seau et « non résolu » est exactement ce que la page
 * qualité existe pour montrer.
 */
function Tally({ label, says, value }: { label: string; says: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="mt-0.5">
        <Text size="lg" weight="semibold" className="tabular-nums text-[var(--bellum-text-primary)]">
          {value}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {says}
        </Text>
      </dd>
    </div>
  )
}
