import { Logo, cn } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { useBrand } from '@/features/brand/brand-context'

export function AnimatedLogo({ className, size = 32 }: { className?: string; size?: number }) {
  const shouldReduceMotion = useReducedMotion()
  // Le glyphe s'annonce sous le nom de l'espace : sans ça, un lecteur d'écran
  // serait le seul endroit de la page à dire « BellumAI » chez un client.
  const brand = useBrand()

  return (
    <motion.div
      className="inline-flex items-center justify-center"
      initial={
        shouldReduceMotion
          ? false
          : {
              opacity: 0,
              rotateX: 12,
              rotateY: -88,
              scale: 0.9,
              transformPerspective: 600,
            }
      }
      animate={{ opacity: 1, rotateX: 0, rotateY: 0, scale: 1 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              opacity: { duration: 0.18 },
              rotateX: { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
              rotateY: { type: 'spring', stiffness: 170, damping: 18, mass: 0.7 },
              scale: { type: 'spring', stiffness: 190, damping: 17, mass: 0.7 },
            }
      }
    >
      <Logo
        aria-label={brand.name}
        width={size}
        height={size}
        className={cn('text-[var(--bellum-primary-400)]', className)}
      />
    </motion.div>
  )
}
