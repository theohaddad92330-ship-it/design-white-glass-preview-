import { createFileRoute } from '@tanstack/react-router'
import { TimesheetsPage } from '@/features/missions/view/TimesheetsPage'

export const Route = createFileRoute('/missions/cra')({
  component: TimesheetsPage,
})
