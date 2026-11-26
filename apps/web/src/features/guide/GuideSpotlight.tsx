import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion'
import { X } from 'lucide-react'
import type { GuideMode } from '@bellum/contracts'
import { Button, MOTION, Text, cn, reduced } from '@bellum/ui'
import { guideSpotlightHalo, placeGuideBubble, type GuideRect, type GuideViewport } from './guide-spotlight-geometry'
import { parseGuideBodySegments } from './guide-body-markup'
import type { GuideStepAction } from './guide-store'

/**
 * #2212.2/.9/.38/.39/.40 — LE SPOTLIGHT : UN VOILE, UN HALO, UNE BULLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS, ET C'EST LA MOITIÉ DU LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `ProductTourDialog.tsx:9-19` (#1787) refuse les visites guidées du marché pour
 * trois raisons nommées : elles VOLENT LE FOCUS, elles CASSENT LA TABULATION, et
 * elles reposent sur un rail de navigation qui n'existe pas sur mobile. Ce
 * composant est écrit contre ces trois reproches :
 *
 *  1. **il ne déplace JAMAIS le focus.** Aucun `focus()`, aucun `autoFocus`,
 *     aucun piège de tabulation. La personne garde le curseur là où elle
 *     l'avait ; le guide montre, il ne prend pas la main ;
 *  2. **il ne bloque JAMAIS l'écran** (#2212.38). Le voile est en
 *     `pointer-events-none` : il assombrit, il n'intercepte pas. Tout le produit
 *     reste cliquable pendant qu'un guide est ouvert — y compris la cible
 *     désignée, ce qui est le minimum pour une aide qui dit « clique ici » ;
 *  3. **il se ferme TOUJOURS** (#2212.40). Une croix étiquetée, et Échap. Aucune
 *     condition, aucun pas obligatoire : un guide dont on ne peut pas sortir est
 *     un défaut plus grave que l'absence de guide.
 *
 * Et il ne cible jamais le rail (la barrière est dans `guide-anchors.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MOUVEMENT EST CELUI DU PRODUIT, PAS LE SIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `MOTION.reveal` pour l'apparition du voile et de la bulle, `MOTION.pulseOnce`
 * pour le halo — « regarde ici, une fois » (M7), qui est littéralement la
 * question que pose un spotlight. Aucun rebond, aucune parallaxe (GA-25), et
 * aucune courbe ni durée définie ici : la grammaire vit dans
 * `packages/ui/src/motion.ts`.
 *
 * Les couleurs sont des JETONS (`--bellum-guide-veil`, `--bellum-guide-halo`),
 * définis sur `:root` et redéfinis pour le thème sombre : aucune valeur
 * hexadécimale dans ce fichier (D79, GA-33).
 */
type GuideSpotlightProps = {
  target: GuideRect
  /** R33b — la zone que la bulle ne recouvre jamais (les amorces de Laura) ; absente = rien à épargner. */
  keepClear?: GuideRect | null
  viewport: GuideViewport
  title: string
  body: string
  /** Rang courant et total — pour dire où on en est, jamais une probabilité. */
  step: { current: number; total: number }
  /**
   * #2212.5/#2212.11 — le mode change ce que la bulle PROPOSE, jamais ce
   * qu'elle affiche par ailleurs (même avatar, même bulle, #2213.21). En
   * `action-guidee`, il n'y a pas de bouton « Suivant » : la promesse du mode
   * (`packages/contracts/src/schemas/guide.ts:68-69`, « le guide montre, la
   * personne clique ») serait rompue par un bouton qui avance sans que la
   * cible réelle ait été cliquée. C'est `GuideHost` qui observe ce clic et
   * appelle `onNext` — ce composant reste sans effet de bord, comme ailleurs.
   */
  mode: GuideMode
  /**
   * #2212.15 — un contenu de déclenchement. Présent, il REMPLACE Suivant ET
   * Précédent : ce pas ne progresse que par un choix explicite.
   */
  actions?: readonly GuideStepAction[]
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  onSelectAction: (action: GuideStepAction) => void
}

/**
 * La taille de la bulle. La hauteur est une ESTIMATION servant au PREMIER
 * placement, avant mesure réelle (voir `measuredHeight` ci-dessous).
 */
const BUBBLE = { width: 320, height: 168 }

export function GuideSpotlight({
  target,
  keepClear,
  viewport,
  title,
  body,
  step,
  mode,
  actions,
  onNext,
  onPrevious,
  onClose,
  onSelectAction,
}: GuideSpotlightProps) {
  const { t } = useTranslation('guide')
  const isActionGuidee = mode === 'action-guidee'

  /**
   * #2212.40 — Échap ferme, depuis n'importe où.
   *
   * L'écouteur est sur le `document` et NON sur la bulle : la personne n'a pas
   * le focus dans la bulle (on ne le lui a pas pris), donc un écouteur local ne
   * recevrait jamais la touche. C'est exactement le genre de sortie qui existe
   * dans le code et ne marche pas.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /**
   * Recette 07/10 — la bulle « Ton audit est prêt » recouvrait la zone de
   * saisie : `placeGuideBubble` est une géométrie pure et juste, mais elle
   * recevait la HAUTEUR ESTIMÉE, jamais la hauteur RÉELLE rendue (un corps
   * plus long qu'estimé, posé en `side: 'top'`, débordait donc PAR LE BAS
   * dans la cible). On mesure la bulle une fois rendue et on recalcule sa
   * position avant la peinture (`useLayoutEffect`, pas de flash) ; l'estimation
   * ne sert plus qu'au tout premier rendu, avant toute mesure.
   */
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState(BUBBLE.height)
  useLayoutEffect(() => {
    const height = bubbleRef.current?.offsetHeight
    if (height && height !== measuredHeight) setMeasuredHeight(height)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `measuredHeight` est le résultat, jamais une dépendance : on ne mesure que quand le contenu ou la fenêtre changent.
  }, [title, body, step.current, viewport.width, viewport.height, target.top, target.left, target.width, target.height])

  const halo = guideSpotlightHalo(target)
  const bubble = placeGuideBubble(target, { width: BUBBLE.width, height: measuredHeight }, viewport, keepClear)
  const isLast = step.current >= step.total

  /**
   * « Regarde ici, une fois » (M7) — mais sans le changement d'échelle pour qui a
   * demandé moins de mouvement. `reduced()` garde la transition et retire le
   * déplacement : le halo reste visible et cesse de battre. Le supprimer
   * complètement pénaliserait précisément la personne qui en a besoin pour
   * trouver la cible.
   */
  const prefersReducedMotion = useReducedMotion()
  const pulse = prefersReducedMotion ? reduced(MOTION.pulseOnce, 'pulseOnce') : MOTION.pulseOnce

  return (
    <div
      // Le conteneur ne capte rien : ce sont ses enfants interactifs qui le font.
      // #2212.38 — le produit reste utilisable pendant qu'un guide est ouvert.
      className="pointer-events-none fixed inset-0 z-guide"
      data-testid="guide-spotlight"
    >
      {/* Le voile. Décoratif, donc invisible à la technologie d'assistance : ce
          qu'il y a à lire est dans la bulle, qui est un vrai dialogue non modal. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[var(--bellum-guide-veil)]"
        initial={MOTION.reveal.initial}
        animate={MOTION.reveal.animate}
        exit={MOTION.reveal.exit}
        transition={MOTION.reveal.transition}
      />

      {/* #2212.9 — le halo. Il désigne, il ne clique pas. */}
      <motion.div
        aria-hidden
        className="absolute rounded-card ring-2 ring-[var(--bellum-guide-halo)]"
        style={{ top: halo.top, left: halo.left, width: halo.width, height: halo.height }}
        animate={pulse.animate as TargetAndTransition}
        transition={pulse.transition as Transition}
      />

      {/* La bulle. `role="dialog"` SANS `aria-modal` : elle n'enferme personne. */}
      <motion.div
        ref={bubbleRef}
        role="dialog"
        aria-label={t('bubble.ariaLabel')}
        className={cn(
          // Théo `.popover-v2` : surface, filet `border2`, rayon et ombre de surcouche, 16 de marge.
          'pointer-events-auto absolute flex flex-col gap-2.5 rounded-overlay border border-[var(--bellum-border-strong)]',
          'bg-[var(--bellum-surface-1)] p-4 shadow-overlay',
        )}
        style={{ top: bubble.top, left: bubble.left, width: bubble.width }}
        initial={MOTION.reveal.initial}
        animate={MOTION.reveal.animate}
        exit={MOTION.reveal.exit}
        transition={MOTION.reveal.transition}
      >
        <div className="flex items-start justify-between gap-2">
          <Text weight="semibold" className="tracking-tight text-[var(--bellum-text-primary)]">
            {title}
          </Text>
          {/* #2212.40 — la sortie. Nommée, tabulable, et au gabarit tactile. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('bubble.close')}
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        {/* #2214.16 (tranché sans Louis) — les mots qui changent la décision,
            en semibold, jamais un paragraphe entier : `**mot**` dans le texte
            i18n, jamais du HTML (voir `guide-body-markup.ts`). */}
        <Text color="text-[var(--bellum-text-secondary)]">
          {parseGuideBodySegments(body).map((segment, index) =>
            segment.emphasis ? (
              <Text key={index} element="span" weight="semibold">
                {segment.text}
              </Text>
            ) : (
              segment.text
            ),
          )}
        </Text>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Text color="text-[var(--bellum-text-muted)]" size="xs">
            {t('bubble.stepOf', { current: step.current, total: step.total })}
          </Text>
          {actions && actions.length > 0 ? (
            // #2212.15 — un contenu de déclenchement REMPLACE Suivant ET
            // Précédent : ce pas ne progresse que par un choix explicite.
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions.map((action, index) => (
                <Button
                  key={action.labelKey}
                  variant={index === 0 ? undefined : 'outline'}
                  size="sm"
                  onClick={() => onSelectAction(action)}
                  className="pointer-coarse:min-h-11"
                >
                  {t(action.labelKey)}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {step.current > 1 ? (
                <Button variant="outline" size="sm" onClick={onPrevious} className="pointer-coarse:min-h-11">
                  {t('bubble.previous')}
                </Button>
              ) : null}
              {isActionGuidee ? (
                // #2212.5/#2212.11 — pas de bouton qui avance seul : le texte
                // dit que c'est le clic sur la cible réelle qui fait avancer.
                <Text color="text-[var(--bellum-text-muted)]" size="xs">
                  {t('bubble.actionGuideeHint')}
                </Text>
              ) : (
                <Button size="sm" onClick={isLast ? onClose : onNext} className="pointer-coarse:min-h-11">
                  {isLast ? t('bubble.finish') : t('bubble.next')}
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
