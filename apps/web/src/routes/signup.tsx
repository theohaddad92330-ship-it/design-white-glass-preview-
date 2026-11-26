import { createFileRoute } from '@tanstack/react-router'
import { SignupPage } from '@/features/auth/view/SignupPage'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})
