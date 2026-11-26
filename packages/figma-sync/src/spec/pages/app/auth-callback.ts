import type { PageSpec } from '../../types'

/**
 * /auth/callback — retour du flux OAuth Google (Supabase redirige vers
 * `#access_token=…`). Écran de passage : un chargement, ou un échec avec
 * retour à la connexion. Aucune action utilisateur en régime normal — la
 * navigation se fait seule après lecture des jetons.
 *
 * Lu dans : `apps/web/src/routes/auth/callback.tsx` → `AuthCallback.tsx`.
 * Textes de `apps/web/src/i18n/locales/fr/auth.json` (clé `callback`).
 */
export const authCallbackPage: PageSpec = {
  id: 'app/auth-callback',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/auth/callback.tsx',
  title: 'Connexion en cours',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    primary: [
      { type: 'component', component: 'Skeleton', props: { shape: 'block' } },
      { type: 'text', text: 'Connexion en cours…', style: 'body', color: 'text/muted' },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Connexion échouée',
            description:
              'La connexion a échoué. Merci de réessayer. Si le problème persiste, vérifie ta connexion ou réessaie dans quelques instants.',
          },
        },
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Retour à la connexion' } } },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Toute la logique (parsing du hash, remise des jetons au gestionnaire de session, lecture du profil, navigation) vit dans `useOauthCallback` — ce composant n’est QUE la vue : chargement ou erreur, rien d’autre.',
      source: 'apps/web/src/features/auth/view/AuthCallback.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Responsive : l’écran est un état centré unique (spinner ou message d’erreur), identique à toutes les largeurs de 360 à 3440 — aucune grille à faire évoluer, aucune colonne à gagner en très grand écran.',
      source: 'apps/web/src/features/auth/view/AuthCallback.tsx:35',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : `BrailleLoader` est réservé à l’attente longue d’une analyse (3 à 6 minutes) et nulle part ailleurs — une redirection OAuth est instantanée, elle dessine désormais `Skeleton`.',
      source: 'apps/web/src/features/auth/view/AuthCallback.tsx:9',
    },
  ],
}
