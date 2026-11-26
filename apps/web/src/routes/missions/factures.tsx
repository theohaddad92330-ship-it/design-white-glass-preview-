import { createFileRoute } from '@tanstack/react-router'
import { InvoicesPage } from '@/features/missions/view/InvoicesPage'

export const Route = createFileRoute('/missions/factures')({
  component: InvoicesPage,
})
