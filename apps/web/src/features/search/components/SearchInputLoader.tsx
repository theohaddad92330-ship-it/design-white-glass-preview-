import { motion, AnimatePresence } from 'framer-motion'
import { BrailleLoader } from '@bellum/ui'

interface SearchInputLoaderProps {
  /** When true, the spinner fades in on the right of the input. */
  visible: boolean
}

/**
 * Autocomplete spinner overlaid on the search input. Drop inside a
 * `position: relative` wrapper next to the `<input>`.
 *
 * Centering uses `inset-y-0 flex items-center` rather than
 * `top-1/2 -translate-y-1/2` because Framer Motion's `scale` animation sets
 * its own `transform`, which silently overrides the Tailwind translate and
 * pushed the spinner to the bottom-right of the input.
 */
export function SearchInputLoader({ visible }: SearchInputLoaderProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loader"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-y-0 right-4 z-10 flex items-center"
          aria-hidden
        >
          <BrailleLoader variant="grid-searching" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
