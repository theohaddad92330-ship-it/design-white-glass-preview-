import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Network } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'

/**
 * #1582 — LE POPOVER « CONTEXTE MARCHÉ » DE LA LIGNE DE COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN POPOVER — LA MESURE QUI A TRANCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La 2ᵉ ligne d'`AccountTableRow` est saturée à **4,3×** : 159 px rendus pour
 * 679 px requis (production, 06/09/2026). C'est ce qui a fait retirer le
 * fragment « N parcours observés » de #1577 le jour de sa livraison, et c'est
 * ce qui bloquait #1417, #1577 et #1582 ENSEMBLE. Des trois formes proposées,
 * le popover est la seule qui **ne consomme aucune largeur** — un geste règle
 * les trois. `accountRowSecondLineIsFull.test.ts` tient le cliquet.
 *
 * ⚠️ **L'icône vit sur la LIGNE 1**, pas sur la 2. Elle est `shrink-0` : c'est
 * le NOM qui cède (il tronque déjà), et la ligne 2 ne gagne rien du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE REFUS QUI FONT LE CONTENU
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Rien si le compte n'est pas couvert.** Sous `MARKET_MEMORY_MIN_PATHS` la
 *   couverture est VIDE et non partielle : il n'y a pas de « 0 parcours » à
 *   montrer, et l'icône ne se rend pas. ⚠️ `pathsObserved` se teste avec
 *   `> 0`, jamais `typeof === 'number'` — c'est le piège exact déjà payé sur
 *   #1577, où `0` passait pour une mesure.
 * · **Aucune date.** #1582 l'écrit, et la mémoire marché n'expose ni date ni
 *   identité — le contrat lui-même les retire (`.strip()`).
 * · **Aucun « Non ».** Zéro ESN observée se dit « à qualifier » : on n'en a pas
 *   vu, ce qui n'est pas « il n'y en a pas ». Une absence d'observation ne
 *   devient jamais une négation.
 * · **Une panne le DIT.** Sur 503, le popover écrit « mémoire indisponible ».
 *   Ni « à qualifier », ni le silence : ce serait une bonne nouvelle fausse,
 *   le défaut que GA-179 a corrigé sur la colonne Accessibilité.
 *
 * La ligne « Fit avec ton offre » que #1582 demande n'est PAS ici : l'axe `fit`
 * est calculé (`apps/ia/app/services/score_axes.py`) mais rien dans le web ne le
 * lit, et une ligne qui dirait toujours « non mesuré » occuperait la place sans
 * rien dire. Arbitré avec Louis le 07/09/2026 — le fit reste dans Score / axes,
 * ce que #1582 dit lui-même.
 */
export function AccountMarketContextButton({
  accountId,
  companyName,
  pathsObserved,
}: {
  accountId: string
  companyName: string
  /**
   * `market_paths_observed` de la ligne, et il porte TROIS états :
   * un nombre = couvert · `null` = lu, non couvert · `undefined` = la mémoire
   * n'a pas pu être lue. Seul le premier ouvre quelque chose.
   */
  pathsObserved: number | null | undefined
}) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  // La requête ne part qu'à l'ouverture : vingt-cinq lignes affichées ne
  // déclenchent aucune lecture, une ligne ouverte en déclenche une.
  const { data, isPending, isError } = useAccountMarketContext(accountId, open)

  if (!pathsObserved || pathsObserved <= 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-market-context-trigger"
          /* GA-32 — un bouton qui ne montre qu'une icône porte un nom, et ce
             nom dit le GESTE et sur QUEL compte : vingt-cinq « Contexte
             marché » identiques ne se distinguent pas au lecteur d'écran.

             ⚠️ PAS de `pointer-coarse:min-h-11` ici, et c'est délibéré : la
             ligne est FIXÉE à 64 px (`h-16`) et porte deux lignes de texte.
             Un plancher de 44 px sur un enfant de la ligne 1 pousserait la
             ligne 2 hors de la boîte. C'est l'exception que GA-30 nomme
             elle-même (elle est un cliquet, pas un interdit), et c'est déjà
             le choix fait pour `SignalPreviewTrigger`, juste à côté, dans la
             même ligne. Le `p-1` élargit la cible sans changer la hauteur. */
          aria-label={t('marketContext.trigger', { company: companyName })}
          className="-my-1 shrink-0 rounded p-1 text-[var(--bellum-text-muted)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          /* La ligne entière ouvre le dossier : sans cet arrêt, un clic sur
             l'icône quitterait l'écran au lieu d'ouvrir le panneau. Pas de
             `preventDefault` — Radix compose et ouvre (leçon de #1416). */
          onClick={event => event.stopPropagation()}
        >
          <Network className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        onClick={event => event.stopPropagation()}
        /* 300 px, comme #1582 le demande. Jetons uniquement : une couleur en
           dur ne suivrait pas le thème (D79, GA-33). */
        className="w-[300px] rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 shadow-[var(--shadow-elevated)]"
      >
        <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('marketContext.title')}
        </Text>
        {isError ? (
          /* Une panne se DIT. Elle ne se déguise pas en « à qualifier », qui
             affirmerait qu'on a regardé. */
          <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {t('marketContext.unavailable')}
          </Text>
        ) : isPending || !data ? (
          <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {t('marketContext.loading')}
          </Text>
        ) : (
          <>
            <dl className="mt-2 space-y-1.5">
              <MarketContextLine
                label={t('marketContext.externalUse')}
                value={t('marketContext.externalUseObserved')}
              />
              <MarketContextLine
                label={t('marketContext.esnEcosystem')}
                value={data.esn_observed > 0 ? t('marketContext.esnCovered') : t('marketContext.esnToQualify')}
              />
            </dl>
            <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('marketContext.paths', { count: data.paths_observed })}
            </Text>
          </>
        )}
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('marketContext.source')}
        </Text>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Une ligne « intitulé → état ». Le vocabulaire est FERMÉ : ce qui s'écrit à
 * droite vient toujours d'une clé i18n, jamais d'une valeur du serveur.
 *
 * `<dt>` / `<dd>` natifs et non `Text` : la primitive partagée n'accepte que
 * dix éléments, et `dt`/`dd` n'en font pas partie. Élargir son union pour deux
 * balises toucherait un composant utilisé 697 fois — le rapport est mauvais.
 * `text-xs` est bien sur l'échelle (12 px, le plancher de D80), et la borne de
 * largeur de lecture (D81) ne concerne pas une étiquette de trois mots.
 */
function MarketContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="text-xs font-medium text-[var(--bellum-text-primary)]">{value}</dd>
    </div>
  )
}
