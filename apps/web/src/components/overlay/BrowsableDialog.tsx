import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, MOTION, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'

/**
 * #1797 — LA MODALE QUI PARCOURT UNE LISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE QU'ELLE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────
 * Un écran de liste qui garde en permanence un panneau de détail à droite
 * s'ouvre sur un détail que PERSONNE n'a demandé : la première ligne est
 * choisie d'office, elle occupe un quart de l'écran, et la liste — ce pour
 * quoi on est venu — est écrasée. La réponse : la liste seule à l'arrivée, le
 * détail en modale au clic, et des flèches pour passer d'un élément au suivant
 * sans refermer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT ICI ET PAS DANS `/watchlist`
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun patron précédent/suivant n'existait dans le dépôt : le premier qui en
 * a besoin le pose donc là où le deuxième pourra le prendre. « Le détail d'un
 * élément d'une liste » se rencontre partout — un compte, un contact, une
 * mission, une facture. Le composant ne sait RIEN du domaine : il reçoit un
 * rang, un total, et une fonction pour changer de rang.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LES FLÈCHES PARCOURENT
 * ─────────────────────────────────────────────────────────────────────────
 * Le rang est celui de la liste COURANTE, telle qu'elle est filtrée à l'écran
 * — c'est l'appelant qui le calcule, et c'est lui qui tient ce contrat. Une
 * flèche qui ramènerait un élément écarté par le filtre serait un mensonge :
 * on vient précisément de demander à ne plus le voir.
 *
 * ⚠️ On ne BOUCLE PAS. Aux deux bouts la flèche est désactivée plutôt que de
 * repartir au début : un retour silencieux au premier élément fait perdre où
 * l'on en est, et « je suis au bout » est une information.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1847 — ELLE PREND LA PORTÉE DE L'AMORCE, ET LA REND EN SE FERMANT
 * ─────────────────────────────────────────────────────────────────────────
 * Le contenu est enveloppé d'un `LauraIntroScope`. Sans lui, un `<AskLaura>`
 * rendu DANS la modale (`WatchlistSignalDetail` en pose un) se battait à armes
 * égales avec celui de la PAGE derrière : la règle « le dernier monté gagne »
 * donnait le bon résultat à l'ouverture par accident, mais la fermeture
 * remettait l'amorce à `null` au lieu de rendre la main à la page, et une
 * ligne de liste qui republiait reprenait la portée à une modale ouverte.
 *
 * Le repère est posé ICI plutôt que chez chaque appelant : la modale est la
 * seule à savoir qu'elle EST une surcouche, et l'appelant suivant l'héritera
 * sans avoir lu ce paragraphe.
 */
export function BrowsableDialog({
  children,
  contentKey,
  description,
  index,
  labels,
  leading,
  onIndexChange,
  onOpenChange,
  open,
  subtitle,
  title,
  total,
  trailing,
}: {
  children: ReactNode
  /** Change avec l'élément : c'est ce qui rejoue le fondu du contenu. */
  contentKey: string
  /** Ce que la modale montre, pour qui l'écoute plutôt que de la voir (GA-278). */
  description: string
  /** Rang de l'élément affiché dans la liste COURANTE, base 0. */
  index: number
  /** Les mots du domaine ; sans eux, le vocabulaire générique de `common`. */
  labels?: { next?: string; previous?: string }
  /** L'emblème de l'élément — un logo, un avatar. */
  leading?: ReactNode
  onIndexChange: (index: number) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  subtitle?: ReactNode
  /** Le NOM de l'élément : c'est lui qui nomme le dialogue. */
  title: string
  /** Le nombre d'éléments de la liste COURANTE. */
  total: number
  /** Son état — une pastille, un badge. */
  trailing?: ReactNode
}) {
  const { t } = useTranslation('common')
  const previousLabel = labels?.previous ?? t('browser.previous')
  const nextLabel = labels?.next ?? t('browser.next')
  const hasPrevious = index > 0
  const hasNext = index >= 0 && index + 1 < total

  const goPrevious = useCallback(() => {
    if (index > 0) onIndexChange(index - 1)
  }, [index, onIndexChange])

  const goNext = useCallback(() => {
    if (index >= 0) onIndexChange(index + 1)
  }, [index, onIndexChange])

  /**
   * Les flèches du clavier font le même geste que les boutons — mais elles
   * appartiennent D'ABORD au champ qui a le focus : un curseur dans un texte se
   * déplace de caractère en caractère, il ne change pas d'élément.
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft' && hasPrevious) {
        event.preventDefault()
        onIndexChange(index - 1)
        return
      }
      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault()
        onIndexChange(index + 1)
      }
    },
    [hasNext, hasPrevious, index, onIndexChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('actions.close')}
        onKeyDown={handleKeyDown}
        /* `max-h-[85dvh]` et jamais `vh` : la barre d'adresse d'un téléphone
           mange la différence. Le contenu défile DANS la modale — un seul
           conteneur défilant, jamais deux imbriqués. */
        className="flex max-h-[85dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
      >
        {/* La description n'est pas affichée : le titre et le contenu la
            disent déjà à l'œil. Elle existe pour l'oreille (GA-278). */}
        <DialogDescription className="sr-only">{description}</DialogDescription>

        <div className="shrink-0 border-b border-[var(--bellum-border)] p-4">
          {/* `pr-10` laisse sa place à la croix de fermeture, qui est en
              position absolue dans le coin. */}
          <div className="flex min-w-0 items-start gap-3 pr-10">
            {leading}
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base font-semibold leading-snug">{title}</DialogTitle>
              {subtitle ? (
                <Text size="xs" noWrap className="mt-1 truncate text-[var(--bellum-text-secondary)]">
                  {subtitle}
                </Text>
              ) : null}
            </div>
            {trailing}
          </div>

          {/* Le rang, puis les flèches. Sur leur propre ligne : à 400 px de
              large, les coller à l'identité écrase le nom de l'élément. */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <Text size="xs" aria-live="polite" className="tabular-nums text-[var(--bellum-text-secondary)]">
              {t('browser.position', { position: index + 1, total })}
            </Text>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={previousLabel}
                disabled={!hasPrevious}
                onClick={goPrevious}
                icon={ChevronLeft}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={nextLabel}
                disabled={!hasNext}
                onClick={goNext}
                icon={ChevronRight}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* `MOTION.reveal` — « voici une information », et rien de plus : le
              contenu change, il n'arrive pas d'ailleurs. Aucun glissement,
              aucun rebond. La clé rejoue le fondu à chaque élément. */}
          <motion.div
            key={contentKey}
            initial={MOTION.reveal.initial}
            animate={MOTION.reveal.animate}
            transition={MOTION.reveal.transition}
          >
            {/* #1847 — la portée de l'amorce de Laura, tenue par la modale
                tant qu'elle est ouverte. Aucun nœud du DOM : un contexte. */}
            <LauraIntroScope>{children}</LauraIntroScope>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
