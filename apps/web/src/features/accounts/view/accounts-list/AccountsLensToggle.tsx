import { Box, chipClassName, FilterChips, HORIZONTAL_OVERSCROLL_CLASS, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/features/mobile/useIsMobile'

/**
 * LES DEUX ANGLES DU PORTEFEUILLE (26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX MÉTIERS, UNE SEULE LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le commercial demande « ce compte vaut-il mon temps ? » ; l'ops demande
 * « peut-on facturer ce client ? ». Ce sont les mêmes comptes, les mêmes
 * filtres, la même pagination — seules deux zones de la ligne changent. D'où
 * une LENTILLE et non un second écran : deux écrans auraient dupliqué la
 * recherche, les filtres et la pagination, et auraient divergé au premier ajout.
 *
 * ⚠️ Le mot « Organisations » n'apparaît nulle part : le produit dit COMPTES.
 * La source le demande explicitement, et c'est aussi le seul mot que le reste
 * de l'application emploie — en introduire un second pour le même objet ferait
 * croire à deux objets.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX BOUTONS RADIO, PAS UNE CASE À COCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * Une case « vue delivery » aurait laissé croire qu'elle AJOUTE de
 * l'information ; elle en REMPLACE. Deux options nommées, dont une est toujours
 * active, disent la vérité : on choisit un angle, on n'empile pas des options.
 *
 * `role="radiogroup"` + `aria-checked` : ce qui se clique se tabule (GA-35), et
 * un lecteur d'écran annonce « sélectionné » sur l'angle en cours.
 */
export function AccountsLensToggle({
  deliveryLens,
  onChange,
  className,
}: {
  deliveryLens: boolean
  onChange: (next: boolean) => void
  className?: string
}) {
  const { t } = useTranslation('accounts')
  // #2097.62 — recette iPhone du 25/09 : sous 768px, la rangée (déjà voisine
  // du bandeau de compteurs sur la même ligne d'entête) n'avait aucun
  // défilement propre — `FilterChips` replie ses pastilles en `flex-wrap`,
  // sans jamais les faire tenir ni défiler. Sous la borne mobile seulement,
  // la rangée devient une bande qui défile DANS son conteneur (jamais le
  // corps de la page, D81) — même patron que `TabNav` (GA-119, GA-26 : un
  // seul mécanisme de défilement horizontal dans le dépôt), donc les mêmes
  // pastilles (`chipClassName`) rendues nous-mêmes plutôt que via
  // `FilterChips`, qui n'expose que la variante repliée.
  const isMobile = useIsMobile()
  const options = [
    { value: 'commercial' as const, label: t('lens.commercial') },
    { value: 'delivery' as const, label: t('lens.delivery') },
  ]
  const active = deliveryLens ? 'delivery' : 'commercial'

  return (
    <Box display="flex" className={cn('mt-2 items-center gap-2', className)}>
      {/* V22 (#4496) — libellés courts « Commercial | Facturation », sans phrase d'introduction visible :
          le groupe garde son nom pour un lecteur d'écran (`lens.label`). */}
      {isMobile ? (
        <div
          data-testid="lens-toggle-row"
          role="group"
          aria-label={t('lens.label')}
          className={cn(
            'flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            HORIZONTAL_OVERSCROLL_CLASS,
          )}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={active === option.value}
              onClick={() => onChange(option.value === 'delivery')}
              className={chipClassName({ active: active === option.value, size: 'sm', className: 'shrink-0' })}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        /*
          L'angle passe au composant partagé (01/09/2026).

          Il était écrit à la main en `role="radio"` + `aria-checked`, actif en
          contour + `--bellum-text-accent` sur un fond composé — soit une
          cinquième façon de dire « c'est celui-ci ». La sémantique change de
          `radiogroup` à `group` + `aria-pressed` : c'est celle de toutes les
          autres rangées du produit, et un lecteur d'écran qui traverse deux
          écrans ne doit pas entendre deux modèles pour un même geste.
        */
        <div data-testid="lens-toggle-row" className="flex flex-wrap items-center gap-2">
          <FilterChips
            size="sm"
            ariaLabel={t('lens.label')}
            options={options}
            value={active}
            onChange={next => next && onChange(next === 'delivery')}
          />
        </div>
      )}
    </Box>
  )
}
