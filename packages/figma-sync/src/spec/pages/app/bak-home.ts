import type { PageSpec } from '../../types'

/**
 * `/bak/home` — le repère du back-office opérateur (D34 · 26/08, Louis
 * 28/08/2026). Rendu DANS la coque client (`CustomerPage`) : un opérateur
 * reste un utilisateur, il garde sa barre latérale. L'adresse de la console
 * vient du serveur (`GET /backoffice/address`), jamais d'une variable de
 * bundle — trois états distincts (chargement, aucune adresse, adresse prête),
 * et aucune URL inventée en repli.
 *
 * Lu dans : `apps/web/src/routes/bak/home.tsx` → `BackofficeConsoleLink.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/routes.json` (clé `backoffice`).
 */
export const bakHomePage: PageSpec = {
  id: 'app/bak-home',
  surface: 'app',
  domain: 'backoffice',
  route: 'apps/web/src/routes/bak/home.tsx',
  title: 'Back-office',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    primary: [
      { type: 'text', text: 'Back-office', style: 'title' },
      {
        type: 'text',
        text: 'Le back-office opérateur est une application distincte de celle-ci : clients, équipes, coûts, facturation et supervision du service.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Il n’utilise pas ta session — il s’ouvre à sa propre adresse, avec son propre accès.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Ouvrir la console d’exploitation' } },
      },
      {
        type: 'text',
        text: 'Ton espace de travail n’a pas changé. Cette entrée s’ajoute à ta navigation, elle ne la remplace pas.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Lecture impossible.', description: 'Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Trois états pour l’adresse de la console, jamais confondus : « chargement » (rien ne s’affiche, ni lien ni message d’absence), « aucune adresse » (rôle sans accès ou panne réseau — le texte ne distingue pas les deux, une adresse devinée serait pire qu’une absence dite), « adresse prête » (lien externe, nouvel onglet). Ce triptyque REMPLACE le slot `primary` le temps du chargement réseau du composant, distinct des états `loading`/`error` de la page elle-même (qui n’a rien à charger).',
      source: 'apps/web/src/features/backoffice/BackofficeConsoleLink.tsx:66',
    },
    {
      kind: 'decision',
      text: 'Aucune variable `VITE_BACKOFFICE_URL` : une variable `VITE_*` est inlinée dans le bundle, donc lisible par un visiteur déconnecté. L’adresse vient exclusivement de `GET /backoffice/address`, qui revérifie le rôle côté API plutôt que de faire confiance aux claims du jeton.',
      source: 'apps/web/src/features/backoffice/BackofficeConsoleLink.tsx:20',
    },
  ],
}
