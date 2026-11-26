import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, LauraFace, MOTION, Text, cn, useAnyModalOpen } from '@bellum/ui'
import { PRODUCT_TOUR_STEPS } from './tour-steps'
import { useProductTourStore } from './product-tour-store'
import { useTourNavigation } from './use-tour-navigation'

/**
 * #1863.3 — LA BARRE QUI TIENT LE FIL PENDANT QU'ON REGARDE L'ÉCRAN.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'ELLE RÉPARE, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Verbatim du retour : la visite « doit nous emmener sur chacune des pages /
 * features qu'elles présentent **en ne perdant jamais le fil** ». Avant ce
 * lot, cliquer « Ouvrir cet écran » fermait la modale et la visite était
 * finie : mesuré, le DOM ne portait plus aucune trace du tour après le clic.
 * On obtenait la page — et on perdait la visite en l'obtenant. C'est le seul
 * geste que la visite proposait, et il l'interrompait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE BARRE, ET PAS LA MODALE LAISSÉE OUVERTE
 * ─────────────────────────────────────────────────────────────────────────
 * Laisser la modale ouverte par-dessus l'écran demandé serait pire que la
 * fermer : elle voile la page, piège la tabulation, et on vient précisément de
 * demander à VOIR cette page. La visite change donc de forme plutôt que de
 * s'arrêter — elle passe d'une modale qu'on lit à une barre qu'on garde sous
 * les yeux. Rien n'est modal ici : aucun voile, aucun piège de focus, l'écran
 * derrière reste entièrement utilisable. C'est ce qui permet d'explorer
 * vraiment l'écran présenté, puis de reprendre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « ÉCRAN SUIVANT » NAVIGUE — C'EST TOUT LE LOT
 * ─────────────────────────────────────────────────────────────────────────
 * Depuis la barre, avancer ne change pas une diapositive : ça ouvre l'écran
 * suivant du produit, la barre suivant avec. On traverse le produit écran par
 * écran sans jamais repasser par le pied de la barre latérale. Et la visite se
 * TERMINE : au dernier écran, « Écran suivant » cède la place à « Terminer la
 * visite » — elle ne reboucle pas (même refus qu'en #1787).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OÙ ELLE SE POSE
 * ─────────────────────────────────────────────────────────────────────────
 * `z-widget` (80), comme les deux autres flottants du produit — c'est un
 * widget, pas une surcouche, et l'échelle d'empilement est NOMMÉE.
 *
 * Le décalage vertical est calculé, pas choisi : la bulle de Laura (48 px) et
 * le bouton de signalement (44 px) sont ancrés à `1rem + la barre d'onglets
 * mobile`, donc ils occupent jusqu'à `4rem` de haut. `4.75rem` passe au-dessus
 * des deux avec 12 px d'air, à TOUTE largeur — une seule règle plutôt qu'une
 * branche `md:` qui se serait contredite autour de 768 px, où la barre
 * centrée et la bulle de Laura se croisent.
 *
 * `inset-x-4` (et non une largeur en `vw`) garantit la gouttière de 16 px à
 * toute largeur sans jamais dépendre de la barre de défilement.
 */
export function ProductTourCompanion() {
  const { t, i18n } = useTranslation('onboarding')
  const index = useProductTourStore(state => state.index)
  const read = useProductTourStore(state => state.read)
  const stop = useProductTourStore(state => state.stop)
  const visitStep = useTourNavigation()
  // #4623 — rien ne flotte au-dessus des actions d'un dialogue ouvert : cette barre s'efface (z-widget 80 > z-overlay 60).
  const anyModalOpen = useAnyModalOpen()

  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const step = PRODUCT_TOUR_STEPS[index] ?? PRODUCT_TOUR_STEPS[0]!
  const Icon = step.icon
  const total = PRODUCT_TOUR_STEPS.length
  const isLast = index + 1 >= total

  return (
    <motion.div
      /* M2 « ça vient d'arriver » — la barre monte depuis le bas d'où elle
         vient, une fois. Aucun rebond, aucune boucle (GA-25). */
      initial={MOTION.enterFromBelow.initial}
      animate={MOTION.enterFromBelow.animate}
      transition={MOTION.enterFromBelow.transition}
      className={cn(
        'fixed inset-x-4 bottom-[calc(4.75rem+var(--bellum-mobile-nav-height,0px))] z-widget',
        'mx-auto max-w-[34rem] rounded-xl border border-[var(--bellum-border)]',
        'bg-[var(--bellum-surface-1)] p-3 shadow-[var(--shadow-elevated)]',
        anyModalOpen && 'hidden',
      )}
      /* Une région NOMMÉE : sans nom, un lecteur d'écran annonce « groupe » et
         on ne sait pas qu'il s'agit de la visite en cours. */
      role="region"
      aria-label={t('tour.companionLabel')}
    >
      <div className="flex min-w-0 items-start gap-3">
        {step.key === 'chat' ? (
          // Laura se nomme elle-même dans le titre de l'étape (D82).
          <LauraFace size={28} decorative />
        ) : (
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-primary-500)]/10 text-[var(--bellum-text-accent)]"
          >
            <Icon className="size-4" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          {/* `aria-live` ICI, sur la ligne qui change : avancer d'un écran
              s'annonce, sans relire toute la barre. */}
          {/* Pas de `full` ici (GA-34, cliquet à zéro) : la barre plafonne à
              34 rem, donc très en deçà des 70 caractères — la borne de lecture
              ne peut pas la resserrer, il n'y a rien à lui faire échapper. */}
          <Text size="xs" aria-live="polite" className="text-[var(--bellum-text-secondary)]">
            {t('tour.position', { position: index + 1, total })}
          </Text>
          <Text size="sm" weight="medium" noWrap className="truncate">
            {step.screen.label[lang]}
          </Text>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('tour.quit')}
          onClick={stop}
          icon={X}
          className="shrink-0"
        />
      </div>

      {/* Les commandes sur leur PROPRE ligne : à 400 px, les coller au nom de
          l'écran écrase le nom — le même arbitrage que `BrowsableDialog`. */}
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={read} className="min-w-0 flex-1 truncate">
          {t('tour.details')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('tour.previous')}
          disabled={index === 0}
          onClick={() => visitStep(index - 1)}
          icon={ChevronLeft}
          className="shrink-0"
        />
        {isLast ? (
          <Button type="button" size="sm" onClick={stop} className="min-w-0 flex-1 truncate">
            {t('tour.finish')}
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            aria-label={t('tour.next')}
            onClick={() => visitStep(index + 1)}
            icon={ChevronRight}
            className="shrink-0"
          />
        )}
      </div>
    </motion.div>
  )
}
