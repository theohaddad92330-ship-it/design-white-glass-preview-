import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { VerifyEmailPage } from '@/features/auth/view/VerifyEmailPage'

const searchSchema = z.object({
  id: z.string().guid(),
  email: z.string().email().optional(),
})

export const Route = createFileRoute('/verify-email')({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    if (!search.id) {
      throw redirect({ to: '/login', replace: true })
    }
  },
  component: VerifyEmailPage,
})
