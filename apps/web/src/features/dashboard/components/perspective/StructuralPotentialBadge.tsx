import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { badgeVariants, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'

/**
 * #1573.4 — LE BADGE « POTENTIEL STRUCTUREL FORT ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN BADGE SECONDAIRE, PAS UNE ANOMALIE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `AnomalyRow` dit déjà l'ÉTAT de la relation — silencieux, jamais travaillé,
 * signal neuf. Ce badge n'ajoute pas une raison d'agir : il ajoute un
 * POTENTIEL, visible d'un coup d'œil, dont le détail ne s'ouvre qu'au clic. Il
 * ne se rend QUE si la mémoire marché couvre RÉELLEMENT le compte —
 * `market_paths` n'arrive au composant que déjà au-dessus du seuil
 * (`MARKET_MEMORY_MIN_PATHS`), lu et appliqué par le SEUL endroit qui a le
 * droit de le faire (`MarketMemoryService`, cf. sa doc).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX REFUS QUI FONT LE CONTENU
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Aucune date.** La mémoire marché n'expose ni date ni identité — le
 *    contrat les retire déjà (`marketPathsSchema` ne porte qu'un compte). Rien
 *    ici ne prétend savoir QUAND l'observation a eu lieu.
 *  · **« Bellum a observé… », jamais « cette entreprise travaille avec… ».**
 *    Le retour l'écrit en toutes lettres : une observation de marché seule ne
 *    conclut jamais un fait présent, encore moins une urgence. Le détail
 *    décrit ce qui a été VU dans le corpus, et le dit deux fois — une fois
 *    dans la phrase, une fois dans l'avertissement qui la suit — parce que
 *    c'est exactement la phrase qu'un commercial pressé lira de travers.
 */
export function StructuralPotentialBadge({ companyName, count }: { companyName: string; count: number }) {
  const { t } = useTranslation('dashboard')
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-testid="structural-potential-trigger"
        // GA-32 — le libellé visible ne dit pas SUR QUEL compte : plusieurs
        // badges identiques dans la même liste ne se distinguent pas au
        // lecteur d'écran sans le nom.
        aria-label={t('perspective.coverage.structuralPotential.trigger', { company: companyName })}
        className={`${badgeVariants({ variant: 'primary' })} shrink-0 cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--bellum-primary-500)_25%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] pointer-coarse:min-h-11 pointer-coarse:px-3`}
        // La ligne entière est un lien vers le compte : sans cet arrêt, ouvrir
        // le badge naviguerait aussi vers la fiche (même leçon que
        // `AccountMarketContextButton`, #1582).
        onClick={event => event.stopPropagation()}
      >
        {t('perspective.coverage.structuralPotential.badge')}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        onClick={event => event.stopPropagation()}
        className="w-[280px] rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 shadow-[var(--shadow-elevated)]"
      >
        <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('perspective.coverage.structuralPotential.title')}
        </Text>
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('perspective.coverage.structuralPotential.detail', { count, company: companyName })}
        </Text>
        {/* Le refus explicite, pas seulement une phrase prudente au-dessus :
            « à qualifier », jamais « à contacter aujourd'hui ». */}
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('perspective.coverage.structuralPotential.caveat', { company: companyName })}
        </Text>
      </PopoverContent>
    </Popover>
  )
}
