import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * #4668 — `/talents` → `/consultants`. La refonte CRM/ATS a nommé la section « Talents » (décision Louis 14/10) ; la
 * route qui existe reste `/consultants` (rien n'est renommé). Quelqu'un qui tape le nom de la section, ou suit un lien
 * écrit avec lui, arrive sur le vivier au lieu de « Page introuvable ». `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/talents')({
  beforeLoad: () => {
    throw redirect({ to: '/consultants', replace: true })
  },
})
