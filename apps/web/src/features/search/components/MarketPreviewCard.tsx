import type { MarketPreview } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #1589.2 — « CE QUE BELLUM SAIT DÉJÀ », AVANT DE DÉPENSER UN CRÉDIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VOCABULAIRE EST FERMÉ, ET C'EST L'ESSENTIEL DU BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois mots, et trois seulement : **Observé**, **Inconnu**, **Non couvert**.
 * L'issue interdit nommément « Non », « Actuellement » et « Travaille avec » —
 * les trois façons de transformer une observation en affirmation de marché.
 *
 * · « Inconnu » se dit d'une dimension VIDE sur un compte pourtant couvert : la
 *   mémoire a bien été lue, elle n'a rien vu passer sur cet axe. Ce n'est pas
 *   « aucune ESN », c'est « on n'en a pas observé ».
 * · « Non couvert » se dit du compte entier sous le seuil : « Bellum n'a pas
 *   suffisamment d'observations marché sur ce compte. » Jamais « ce compte
 *   n'externalise pas » — c'est la même faute que GA-259 tient un cran plus
 *   haut, sur le taux de couverture du portefeuille.
 *
 * ⚠️ **Et une PANNE n'est aucun des trois.** Un corpus injoignable rendu
 * « non couvert » serait une bonne nouvelle fausse. Le bloc le dit à part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun nom d'ESN, aucune coordonnée, aucun comptage par technologie, aucune
 * date de corpus. Ce n'est pas une retenue de composant : `MarketPreview` ne
 * les PORTE pas — la réduction vit dans le type (`marketPreviewSchema`), et un
 * écran suivant qui lirait la même source hériterait de la même discrétion.
 *
 * « Recours à des externes : Observé » se dérive de l'EXISTENCE de la preview,
 * comme `AccountMarketMemoryCard` le fait côté dossier. Un booléen de plus
 * serait une seconde dérivation du même fait.
 */

type Props = {
  preview: MarketPreview | null
  isPending: boolean
  /** Lu, pas assez d'observations. */
  notCovered: boolean
  /** Pas lu. Distinct du précédent, et jamais rendu pareil. */
  unavailable: boolean
}

/** Une ligne du bloc — le libellé à gauche, ce qu'on a observé à droite. */
function Observation({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="xs" weight="medium" className="min-w-0 truncate text-[var(--bellum-text-primary)]">
        {value}
      </Text>
    </div>
  )
}

export function MarketPreviewCard({ preview, isPending, notCovered, unavailable }: Props) {
  const { t } = useTranslation('search')

  // Pendant le chargement, le bloc ne dit RIEN : un « non couvert » affiché une
  // seconde puis démenti apprend à ne plus lire le bloc.
  if (isPending) return null
  // Ni panne ni absence ne se rendent en quatre lignes vides : une seule
  // phrase, et elles ne sont pas la même phrase.
  if (unavailable || notCovered || !preview) {
    if (!unavailable && !notCovered) return null
    return (
      <Card className="mb-2 p-3">
        <div className="flex items-center gap-2">
          <Network className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {unavailable ? t('marketPreview.unavailable') : t('marketPreview.notCovered')}
          </Text>
        </div>
      </Card>
    )
  }

  const stack = preview.observed_stack.join(' · ')
  const families = preview.role_families.join(' · ')
  const unknown = t('marketPreview.unknown')

  return (
    <Card className="mb-2 p-3">
      <div className="flex items-center gap-2">
        <Network className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('marketPreview.title')}
        </Text>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {/* L'existence de la preview EST l'observation — pas un champ de plus. */}
        <Observation label={t('marketPreview.externalUse')} value={t('marketPreview.observed')} />
        <Observation label={t('marketPreview.stack')} value={stack.length > 0 ? stack : unknown} />
        <Observation
          label={t('marketPreview.ecosystem')}
          value={
            preview.esn_observed > 0
              ? // Le NOMBRE ne s'écrit pas : #1589.2 refuse « un nombre présenté
                // comme recensement exhaustif ». Le pluriel suffit à dire l'ordre
                // de grandeur, et `count` ne sert qu'à l'accord.
                t('marketPreview.esnLinks', { count: preview.esn_observed })
              : unknown
          }
        />
        <Observation label={t('marketPreview.roleFamilies')} value={families.length > 0 ? families : unknown} />
      </div>
      <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
        {t('marketPreview.source')} · {t('marketPreview.freeOfCharge')}
      </Text>
    </Card>
  )
}
