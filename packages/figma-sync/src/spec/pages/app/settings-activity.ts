import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/activity — Journal d'activité. Lu dans
 * `apps/web/src/routes/settings/activity.tsx` → `ActivityLogView.tsx` :
 * filtres (membre, type d'événement, période), table des événements,
 * pagination. Réservé au propriétaire/admins/Sales Ops. Textes de
 * `i18n/locales/fr/activityLog.json`.
 */
export const settingsActivityPage: PageSpec = {
  id: 'app/settings-activity',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/activity.tsx',
  title: 'Journal d’activité',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Journal d’activité', style: 'title' },
      {
        type: 'text',
        text: 'Qui a fait quoi dans ton espace de travail — analyses, enrichissements, exports, messages, équipe et intégrations.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Select',
            props: {
              size: 'sm',
              content: { value: 'Tous les membres' },
              items: ['Tous les membres', 'Léa Dupuis', 'Karim Haddad', 'Élise Bonnet'],
            },
          },
          {
            type: 'component',
            component: 'Select',
            props: {
              size: 'sm',
              content: { value: 'Tous les événements' },
              items: [
                'Tous les événements',
                'Analyse lancée',
                'Analyse terminée',
                'Contact enrichi',
                'Export effectué',
                'Message envoyé',
                'Membre invité',
                'Invitation révoquée',
                'Membre retiré',
                'Rôle modifié',
                'Intégration connectée',
                'Intégration déconnectée',
                'Portefeuille repris',
                'Droits d’un membre modifiés',
              ],
            },
          },
          {
            type: 'component',
            component: 'Select',
            props: {
              size: 'sm',
              content: { value: 'Toute la période' },
              items: ['Toute la période', '7 derniers jours', '30 derniers jours', '90 derniers jours'],
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Léa Dupuis · Analyse lancée', value: 'Compte exemple 1 · 25/09/2026 09:12' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Karim Haddad · Export effectué', value: 'Contacts (18 lignes) · 24/09/2026 17:40' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Élise Bonnet · Membre invité',
                value: 'p••••@wavestone-consulting.fr · 24/09/2026 11:05',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Léa Dupuis · Rôle modifié',
                value: 'Karim Haddad — de Membre à Commercial · 22/09/2026 14:20',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Utilisateur · Intégration connectée', value: 'HubSpot · 20/09/2026 08:30' } },
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'between',
        align: 'center',
        children: [
          { type: 'text', text: 'Page 1 / 3 · 62 événements', style: 'caption', color: 'text/secondary' },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Précédent' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Suivant' } },
              },
            ],
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Rien n’a encore été journalisé',
            description:
              'Dès qu’une analyse part, qu’un contact est enrichi ou qu’un membre rejoint l’équipe, ça s’écrit ici.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Impossible de charger le journal d’activité.',
            description: 'Réessaie dans un instant.',
          },
        },
      },
    ],
    // RUX-14 (docs/revue-ux.md T5) : le journal n'est PAS vide, mais aucune ligne ne passe les
    // filtres posés — distinct de `empty` ci-dessus (jamais journalisé), jamais le même message.
    emptyFiltered: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucun évènement ne passe ces filtres',
            description: 'Le journal n’est pas vide : élargis la recherche en retirant un ou plusieurs filtres.',
            action: 'Retirer les filtres',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le vrai écran n’est PAS un tableau — chaque événement est une carte (`ActivityRow` : avatar-initiales, nom de l’acteur ou « Utilisateur » si inconnu, badge de type d’événement coloré par famille, une ligne combinant cible et détail, une date alignée à droite), sans en-tête de colonnes. Le filtre « Événement » proposait un select vide de contenu ; il porte 13 valeurs réelles nommées. Le message d’erreur recopiait celui de `useTeam` (« Impossible de charger ton équipe ») au lieu du vrai texte du journal.',
      source: 'apps/web/src/features/team/view/ActivityLogView.tsx:58',
    },
    {
      kind: 'decision',
      text: 'Un accès refusé (rôle hors propriétaire/admin/Sales Ops) affiche un message dédié « Accès réservé » plutôt qu’une erreur générique ou un journal vide qui laisserait croire à une page cassée ou à un espace sans activité — état non représentable ici : le gabarit `settings` n’a que loading/error/empty (facultatif), pas de quatrième état « permission ».',
      source: 'apps/web/src/features/team/view/ActivityLogView.tsx:183',
    },
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'RUX-14 (docs/revue-ux.md T5, addenda au Top 20) : un journal vide DISTINGUE « rien n’a jamais été journalisé » (`empty`) et « le journal n’est pas vide, aucune ligne ne passe les filtres » (`emptyFiltered`, avec un bouton pour les retirer) — jamais le même message pour les deux. Le gabarit `settings` gagne `emptyFiltered` en état facultatif (`catalog.ts`), au même titre que `empty` ; cette page déclare les deux.',
      source: 'apps/web/src/features/team/view/ActivityLogView.tsx:261',
    },
    {
      kind: 'ecart',
      text: 'RUX-14 (docs/revue-ux.md T5) : le code distingue déjà `emptyNever` et `emptyFiltered` (« Le journal n’est pas vide : aucune ligne ne passe les filtres posés », avec un bouton « Retirer les filtres ») — la maquette dessine désormais les deux états (`empty`, `emptyFiltered`) ; à vérifier lors du rattrapage que le code utilise bien la même distinction de contenu.',
      source: 'apps/web/src/features/team/view/ActivityLogView.tsx:261',
    },
  ],
}
