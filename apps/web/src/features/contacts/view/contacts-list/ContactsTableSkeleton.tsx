import { Box, BrailleLoader } from '@bellum/ui'

/** Squelette de chargement — 5 lignes de 6 cellules en shimmer. */
export function ContactsTableSkeleton() {
  return (
    <Box className="rounded-overlay border border-[var(--bellum-border)] bg-card p-6">
      <BrailleLoader variant="grid-searching" />
    </Box>
  )
}
