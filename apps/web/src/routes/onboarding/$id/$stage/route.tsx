import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/$id/$stage')({
  component: Outlet,
})
