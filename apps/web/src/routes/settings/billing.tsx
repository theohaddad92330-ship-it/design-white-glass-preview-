import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/settings/billing` → `/billing`.
 *
 * Théo D settings-outils.N4 — la facturation est une rubrique des Réglages (« Facturation », entre « Accès assistants /
 * MCP » et « Journal d'activité »). Sa page vit déjà dans la coque des Réglages (`/billing` rend `SettingsPage`, voir
 * `settings-nav-shell.test.ts`) et garde ses gardes d'accès ; l'adresse « Réglages » ne la déplace pas, elle y mène — un
 * lien écrit à la manière des autres rubriques (`/settings/<rubrique>`) arrive au même écran.
 *
 * `beforeLoad`, jamais `<Navigate>` (GA-27).
 */
export const Route = createFileRoute('/settings/billing')({
  beforeLoad: () => {
    throw redirect({ to: '/billing', replace: true })
  },
})
