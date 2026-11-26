import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'

type UseGoogleSignInResult = {
  signIn: () => Promise<void>
  isLoading: boolean
}

export function useGoogleSignIn(): UseGoogleSignInResult {
  const { signInWithGoogle } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const signIn: () => Promise<void> = async (): Promise<void> => {
    setIsLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      setIsLoading(false)
      toast.error("La connexion Google n'est pas encore disponible. Utilise ton email.")
    }
  }

  return { signIn, isLoading }
}
