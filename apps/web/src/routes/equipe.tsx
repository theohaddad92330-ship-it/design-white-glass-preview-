import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4710 — `/equipe` est le nom français que la navigation affiche : l'adresse redirige vers `/team`
 * (`beforeLoad` + `replace: true`, jamais `<Navigate>` — GA-27).
 */
export const Route = createFileRoute('/equipe')({
  beforeLoad: () => {
    throw redirect({ to: '/team', replace: true })
  },
})
