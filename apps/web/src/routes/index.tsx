import { createFileRoute } from '@tanstack/react-router'
import HomePage from '@/components/templates/home-page'

export const Route = createFileRoute('/')({
  component: HomePage,
})
