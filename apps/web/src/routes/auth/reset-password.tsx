import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordPage } from '@/features/auth/view/ResetPasswordPage'

export const Route = createFileRoute('/auth/reset-password')({ component: ResetPasswordPage })
