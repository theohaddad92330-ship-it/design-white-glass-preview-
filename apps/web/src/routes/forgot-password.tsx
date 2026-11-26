import { createFileRoute } from '@tanstack/react-router'
import { ForgotPasswordPage } from '@/features/auth/view/ForgotPasswordPage'

export const Route = createFileRoute('/forgot-password')({ component: ForgotPasswordPage })
