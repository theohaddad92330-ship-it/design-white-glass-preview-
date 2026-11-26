import { motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, LauraFace, MOTION, cn } from '@bellum/ui'
import type { LauraIntro } from './laura-intro-store'

/**
 * #1812 — LA BULLE S'AGRANDIT SUR UNE LIGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LOUIS A DEMANDÉ, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « j'ai Laura qui s'agrandit sur une ligne et qui écrit ça avec un bouton
 * envoyer comme si je voulais commencer la conversation avec elle, et si
 * j'appuie sur le bouton envoyer sa modale de petite conversation s'ouvre ».
 *
 * Ce composant est purement PRÉSENTATIONNEL — aucun état, aucun appel réseau.
 * `LauraDock` décide QUAND le montrer (une amorce est déposée ET le panneau
 * est fermé) et QUOI faire au clic (`onSend` : préremplir et ouvrir, jamais
 * envoyer — voir le docblock de `LauraDock.tsx`, règle 3 de GA-237).
 *
 * ⚠️ Remplace le ROND, il ne s'ajoute pas à côté : « s'agrandit » veut dire
 * une transformation, pas une deuxième bulle. `LauraDock` ne rend jamais les
 * deux en même temps.
 */
export function LauraIntroBar({
  intro,
  onSend,
  className,
}: {
  intro: LauraIntro
  onSend: () => void
  className?: string
}) {
  const { t } = useTranslation('lauraBubble')

  return (
    <motion.div
      {...MOTION.reveal}
      // Statut, pas alerte : une amorce qui apparaît est une suggestion, pas
      // un problème — `aria-live="polite"` laisse finir ce qui est en cours
      // d'être annoncé plutôt que de l'interrompre (GA-30 : « un panneau qui
      // s'agrandit s'annonce »).
      role="status"
      data-bellum-capture-ignore=""
      className={cn(
        'fixed right-[4.5rem] bottom-[calc(1rem+var(--bellum-mobile-nav-height,0px))] z-widget',
        'flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3',
        'border border-[var(--bellum-border)] bg-card shadow-overlay',
        className,
      )}
    >
      <LauraFace size={28} decorative />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--bellum-text-primary)]">{intro.question}</span>
      {/* Le nom accessible du bouton reste son texte VISIBLE (« Envoyer ») —
          pas `intro.label` : un nom accessible qui ne contient pas le texte
          affiché piège la commande vocale (WCAG 2.5.3). */}
      <Button type="button" size="sm" variant="default" icon={Send} onClick={onSend} className="shrink-0 rounded-full">
        {t('composer.send')}
      </Button>
    </motion.div>
  )
}
