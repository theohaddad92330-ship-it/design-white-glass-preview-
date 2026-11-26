import type { PageSpec } from '../../types'

/**
 * `/impersonations` — qui a incarné quel client, depuis quand, combien de
 * temps, et pourquoi (#1665.2). Lecture seule, jointe côté API (start/stop par
 * `jti`, GA-26 : la jointure vit à un seul endroit) depuis le journal d'audit
 * d'impersonation, append-only.
 *
 * Lu dans : `src/app/impersonations/page.tsx` →
 * `_components/impersonations-table.tsx`.
 */
export const impersonationsPage: PageSpec = {
  id: 'dm/impersonations',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/impersonations/page.tsx',
  title: 'Impersonations',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Impersonations', style: 'title' },
      {
        type: 'text',
        text: 'Qui a incarné quel client, depuis quand, combien de temps, et pourquoi — lecture seule, jointe depuis le journal d’audit d’impersonation.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Sessions listées' } },
            children: [{ type: 'text', text: '312', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'En cours' } },
            children: [{ type: 'text', text: '1', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Terminées' } },
            children: [{ type: 'text', text: '308', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Expirées sans arrêt' } },
            children: [{ type: 'text', text: '3', style: 'display' }],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Qui', 'Compte incarné', 'Début', 'Durée', 'Statut', 'Motif'],
            rows: [
              [
                'ops@bellumai.app',
                'j••••@thales.fr',
                '25/09/2026 14:00',
                '2 min (en cours)',
                'En cours',
                'Support niveau 2 — export PDF bloqué',
              ],
              [
                'ops@bellumai.app',
                'a••••@sg.com',
                '24/09/2026 11:20',
                '6 min',
                'Terminée',
                'Diagnostic import CSV consultants',
              ],
              [
                'support@bellumai.app',
                'r••••@leboncoin.fr',
                '22/09/2026 09:05',
                '3 min',
                'Terminée',
                'Vérification des droits d’un membre',
              ],
              [
                'support@bellumai.app',
                'p••••@blablacar.com',
                '18/09/2026 16:40',
                '11 min',
                'Terminée',
                'Reproduction d’un bug de facturation',
              ],
              [
                'ops@bellumai.app',
                'c••••@decathlon.com',
                '15/09/2026 08:12',
                'Expirée sans arrêt',
                'Expirée sans arrêt',
                'Support niveau 2 — session non close',
              ],
            ],
          },
        },
      },
      { type: 'text', text: 'Mesuré le 25/09/2026 14:02.', style: 'caption', color: 'text/muted' },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune session d’impersonation' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Sessions d’impersonation indisponibles', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La colonne « Compte incarné » affiche l’adresse EN CLAIR (`EmailEnClair`, c87) : plus de masquage ni de clic « Révéler ». Le format `Table` du catalogue (`columns`/`rows`) ne porte pas de composant par cellule, d’où cette note plutôt qu’un lien dans la colonne.',
      source: 'apps/dashboard-manager/src/app/_components/email-en-clair.tsx:10',
    },
    {
      kind: 'decision',
      text: 'La jointure start/stop par `jti` (Qui · Espace · Début · Durée · Motif) est faite côté API, pure et testée sans base — cet écran lit et affiche, il ne recalcule rien (GA-26 : un réglage/calcul vit à un seul endroit).',
      source: 'apps/dashboard-manager/src/app/impersonations/page.tsx:25',
    },
    {
      kind: 'decision',
      text: 'Écran strictement lecture seule : avant #1665.2, aucun `GET` n’exposait les sessions d’impersonation (seul un `POST` pour démarrer existait) — le journal d’audit append-only existait déjà, personne ne le lisait sous cette forme.',
      source: 'apps/dashboard-manager/src/app/impersonations/page.tsx:16',
    },
    {
      kind: 'decision',
      text: 'Même porte que le journal d’audit et l’écran sécurité (`audit.read`, plancher `operator`) : même classe de donnée — des opérateurs, leurs gestes sur les comptes clients.',
      source: 'apps/dashboard-manager/src/app/impersonations/page.tsx:28',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la grille de 4 KPI passerait à 3 (Expirées sans arrêt rejoindrait la ligne suivante) ; le tableau de 6 colonnes reste compact, aucune colonne à masquer. Contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau garderait sa largeur de lecture plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/impersonations/page.tsx:68',
    },
    {
      kind: 'ecart',
      text: '`gridTemplateColumns: repeat(4, minmax(0, 1fr))` est un style inline sans media query : à 1280 les 4 tuiles se resserrent, elles ne passent jamais à 3 aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/impersonations/page.tsx:68',
    },
  ],
}
