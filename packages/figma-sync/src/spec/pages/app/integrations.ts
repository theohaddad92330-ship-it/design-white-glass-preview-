import type { PageSpec } from '../../types'

/**
 * /integrations — l’écran Intégrations, LE seul (#1448) : Réglages ›
 * Intégrations redirige ici depuis le 14/08. Ordre imposé : bénéfice puis
 * compte d’outils, par quoi commencer, catalogue par familles, clés d’API en
 * dernier (usage avancé).
 *
 * Lu dans : `apps/web/src/routes/integrations/index.tsx` →
 * `IntegrationCenterPage.tsx` (`IntegrationsHero`, `StarterSteps`,
 * `ImportEntryCard`, `NotificationsEntryCard`, recherche + filtres, cartes
 * par famille, `ApiKeysCard`). Textes de
 * `apps/web/src/i18n/locales/fr/integrationCenter.json`.
 */
export const integrationsPage: PageSpec = {
  id: 'app/integrations',
  surface: 'app',
  domain: 'integrations',
  route: 'apps/web/src/routes/integrations/index.tsx',
  title: 'Intégrations',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Intégrations', style: 'title' },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'medium', content: { label: 'Branchés', value: '—' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'medium', content: { label: 'Disponibles', value: '—' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'medium', content: { label: 'Action requise', value: '—' } },
          },
        ],
      },
    ],
    sectionNav: [
      {
        type: 'component',
        component: 'SectionSidebarNav',
        props: {
          content: { title: 'Réglages' },
          items: ['Profil', 'Équipe', 'Intégrations', 'Abonnement et crédits', 'Connaissances'],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Par quoi commencer' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Connecter Google Workspace' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsRow',
        props: { content: { label: 'Déjà des fichiers ou un CRM ?', value: 'Reprendre les données existantes' } },
      },
      {
        type: 'component',
        component: 'SettingsRow',
        props: { content: { label: 'Comment Laura te prévient', value: 'Réglé dans les préférences de notification' } },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'end',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Chercher un outil' } },
          },
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Tous', 'Branchés', 'À brancher'] },
          },
        ],
      },
      {
        type: 'text',
        text: 'Aucun outil ne correspond.',
        style: 'caption',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'CRM' } },
        children: [
          { type: 'component', component: 'Card', props: { content: { title: 'HubSpot', description: 'Branché' } } },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Salesforce', description: 'À brancher' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Messagerie, agenda et documents' } },
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Google Workspace', description: 'Branché' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Clés d’API' } },
        children: [
          { type: 'component', component: 'CopyField', props: { content: { label: 'Clé API', value: '••••••••' } } },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'La liste des intégrations n’a pas pu être chargée',
            description:
              'Aucune conclusion à en tirer sur l’état de tes outils : c’est la lecture qui a échoué, pas les connexions.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Il n’y a plus qu’UN écran d’intégrations : deux écrans (Réglages et un « centre » de surveillance) ne disaient pas la même chose du même outil, l’un affichant « Non branché » là où l’autre ne montrait rien du tout pour Salesforce. Réglages › Intégrations redirige désormais ici.',
      source: 'apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx:24',
    },
    {
      kind: 'decision',
      text: 'Pas de quatrième section « connecteurs à réparer » entre le hero et le catalogue : le catalogue remonte déjà ce qui demande un geste en tête de chaque famille, et le filtre « Branchés » existe. Une troisième liste des mêmes cartes ferait apparaître le même connecteur deux fois (loi 4 du tome 7).',
      source: 'apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx:44',
    },
    {
      kind: 'decision',
      text: '« Reprendre des données » et « préférences de notification » sont des LIENS vers les écrans existants (`/settings/import`, `/settings/notifications`), jamais un second sélecteur réécrit ici — un réglage vit à un seul endroit (GA-26).',
      source: 'apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx:135',
    },
    {
      kind: 'decision',
      text: 'Une connexion OAuth n’est un succès que si le SERVEUR écrit `status: connected` après un échange de jeton réel : un refus, une erreur fournisseur ou une valeur inconnue tombent tous dans l’échec, jamais un succès optimiste côté navigateur.',
      source: 'apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx:78',
    },
    {
      kind: 'decision',
      text: 'Responsive : les cartes de connecteur sont en 1 colonne sous 1024 px, 2 colonnes de 1024 à 1535 px (`lg`), 3 colonnes à partir de 1536 px (`2xl`) — la tablette (768-1194) reste donc en 1 colonne. Au-delà de 1920 px (2560, 3440) : le catalogue plafonne à 3 colonnes de cartes (jamais 4+, une carte de connecteur porte trop d’état pour rétrécir), l’espace en plus devient de la marge de page.',
      source: 'apps/web/src/features/integration-center/view/IntegrationCenterPage.tsx:172',
    },
  ],
}
