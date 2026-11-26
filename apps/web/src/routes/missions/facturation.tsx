import { createFileRoute } from '@tanstack/react-router'
import { InvoicingPage } from '@/features/missions/view/InvoicingPage'

export const Route = createFileRoute('/missions/facturation')({
  component: InvoicingPage,
})
