import { Card, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo } from '@/lib/relative-time'
import { FINANCE_ACTIVITY_NOT_DATED, type FinanceActivityItem } from './finance-activity'

/**
 * LA BANDE « ACTIVITÉ RÉCENTE » — refusée le 26/08, **levée par Louis le
 * 31/08/2026**, et livrée EN PLUS de la bande d'alertes, jamais à sa place.
 *
 * La raison du refus (« un journal ne fait prendre aucune décision ») était
 * juste **contre** la bande d'alertes, qui reste au-dessus et reste l'élément le
 * mieux tenu du dossier. Ce que la bande d'activité ajoute est une autre
 * question : « est-ce que ça bouge ? » — un tableau de bord immobile et un
 * tableau de bord en panne se ressemblent, et c'est le seul manque qu'elle
 * comble. Le raisonnement complet vit dans `finance-activity.ts`, avec le
 * calcul.
 *
 * ⚠️ Elle **NOMME ce qu'elle ne sait pas montrer**. Deux des cinq événements de
 * la maquette n'ont aucune source datée, et pour deux raisons différentes : le
 * produit n'émet aucune facture (une frontière, pas une lacune), et les
 * encaissements ne sont dérivés qu'en montants mensuels. Une bande qui montre
 * trois types d'événements sans le dire fait croire qu'il ne s'est rien passé
 * d'autre.
 */
export function FinanceRecentActivity({
  items,
  all,
  hidden,
  loading,
  failed,
}: {
  /** Les cinq plus récents — ce que la bande montre au repos. */
  items: readonly FinanceActivityItem[]
  /**
   * L'UNION COMPLÈTE des trois familles, déjà triée. C'est la destination de
   * « voir toute l'activité » — voir le commentaire du bouton.
   */
  all: readonly FinanceActivityItem[]
  hidden: number
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation('pilotage')
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? all : items

  return (
    <Card className="mt-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Text size="sm" weight="semibold">
            {t('finance.activity.title')}
          </Text>
          <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
            {t('finance.activity.hint')}
          </Text>
        </div>
        {/* « VOIR TOUTE L'ACTIVITÉ » — et il mène quelque part (01/09/2026).

            Il n'avait AUCUN lien : la raison écrite était juste (« aucun écran
            ne montre l'union de ces trois événements ; un lien qui n'en
            montrerait qu'un tiers est un lien mort »), mais un intitulé sans
            geste est une promesse cassée, et une promesse cassée fait douter du
            reste de la carte.

            La destination est CET écran : les trois familles y sont déjà
            réunies, triées et datées. Un `<button>` et non un `<a>` — ce qui se
            clique se tabule, et un lien qui ne navigue pas ment sur ce qu'il
            fait (GA-35). Il disparaît quand il n'y a rien de plus à déplier :
            un bouton qui ne change rien apprend à ne plus cliquer. */}
        {!loading && !failed && hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(current => !current)}
            aria-expanded={expanded}
            className="shrink-0 rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
          >
            {expanded ? t('finance.activity.seeLess') : t('finance.activity.seeAll', { count: all.length })}
          </button>
        ) : null}
      </div>

      {loading ? (
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('loading')}
        </Text>
      ) : failed ? (
        // Distinguer l'échec du vide, comme la bande d'alertes au-dessus.
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('finance.unavailable')}
        </Text>
      ) : shown.length === 0 ? (
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('finance.activity.empty')}
        </Text>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map(item => (
            <li
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--bellum-border)] pb-2 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <Text size="sm" weight="medium">
                  {t(`finance.activity.kinds.${item.kind}`)}
                </Text>
                {/* Un sujet inconnu ne devient pas « Sans nom » : la ligne se
                    lit très bien sans, et inventer un libellé serait une donnée
                    de remplissage. */}
                {item.subject ? (
                  <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                    {item.subject}
                  </Text>
                ) : null}
              </div>
              {/* ⚠️ `<time>` porte la date ABSOLUE en `dateTime` : « il y a 3 h »
                  est confortable et illisible dans six mois — un lecteur d'écran
                  et un copier-coller ont besoin de la vraie. */}
              <time dateTime={item.at} className="shrink-0">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {formatTimeAgo(item.at)}
                </Text>
              </time>
            </li>
          ))}
        </ul>
      )}

      {/* Ce qui est REPLIÉ, tant que ça l'est. Déplié, la phrase disparaît :
          annoncer « 12 autres » sous une liste qui les montre serait un compte
          faux, et c'est le genre de détail qui fait perdre confiance dans tous
          les autres chiffres de l'écran. */}
      {hidden > 0 && !expanded ? (
        <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
          {t('finance.activity.folded', { count: hidden })}
        </Text>
      ) : null}

      {/* Ce que la bande NE PEUT PAS montrer, nommé une fois, avec sa raison.
          Les deux clés viennent du registre du calcul : une entrée ajoutée
          là-bas apparaît ici sans qu'on y touche. */}
      <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
        {FINANCE_ACTIVITY_NOT_DATED.map(gap => t(`finance.activity.notDated.${gap}`)).join(' · ')}
      </Text>
    </Card>
  )
}
