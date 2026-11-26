import { motion } from 'framer-motion'
import { AnalysisProgressCard } from '@/components/analysis/AnalysisProgressCard'

interface SearchAnalyzingStateProps {
  companyName: string
  phase: string
  accountId: string | null
  onCancel: () => void
}

export function SearchAnalyzingState({ companyName, phase, accountId, onCancel }: SearchAnalyzingStateProps) {
  const layoutTransition = {
    type: 'spring',
    stiffness: 220,
    damping: 26,
    mass: 0.9,
  } as const

  return (
    <motion.div
      key="analyzing"
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, ease: 'easeOut' as const, layout: layoutTransition }}
      className="relative mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6"
    >
      <motion.div layout className="flex min-h-0 flex-1" transition={{ layout: layoutTransition }}>
        <AnalysisProgressCard companyName={companyName} phase={phase} accountId={accountId} onCancel={onCancel} />
      </motion.div>
    </motion.div>
  )
}
