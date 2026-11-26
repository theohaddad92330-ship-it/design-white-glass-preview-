import type { PageSpec } from '../../types'

/**
 * /dashboard — RUX-10 (`docs/revue-ux.md` §4, T3) : « Tableau de bord » devient
 * « Ma trajectoire », dans Pilotage — pas un second écran d'arrivée. L'ancien
 * onglet « Équipe » a été RETIRÉ (#1457-1459, garde GA-254 « one team
 * cockpit ») : le vrai cockpit d'équipe est `/team`, deux cockpits d'équipe
 * qui divergent est le défaut qu'on refuse.
 *
 * Lu dans : `apps/web/src/routes/pilotage/index.tsx` → `DashboardPage.tsx`
 * → `DashboardContent.tsx` (activation, complément de profil, accroche
 * pilotage, lien notifications, cockpit personnel). Textes :
 * `apps/web/src/i18n/locales/fr/dashboard.json` et `pilotage.json`.
 */
export const dashboardPage: PageSpec = {
  id: 'app/dashboard',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/index.tsx',
  title: 'Ma trajectoire',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ta trajectoire', style: 'title' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Gérer mes notifications' } },
      },
    ],
    kpis: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Le pilotage, en trois chiffres' } },
        children: [
          {
            type: 'grid',
            columns: 3,
            columnsMobile: 1,
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Maillons qui décrochent', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Maillons qui tiennent', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Maillons non mesurés', value: '—' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Voir le pilotage complet' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Activation',
            description: '5 étapes pour démarrer — cette carte disparaît une fois complète.',
          },
        },
        children: [{ type: 'text', text: '3 / 5 étapes complétées', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Complète ton profil' } },
        children: [
          {
            type: 'text',
            text: 'Proposée une fois la première analyse terminée — jamais avant, jamais bloquant.',
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ma trajectoire & mon portefeuille' } },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Trajectoire du portefeuille dans le temps', height: 'md' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mes opportunités & ma dynamique relationnelle' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Analyser mon activité' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Préparer une revue' } },
          },
        ],
      },
      // RUX-10 : « Mes prochaines étapes » retiré (doublon avec Laura, l'écran d'arrivée par défaut —
      // loi 4, rien n'apparaît deux fois sous la même forme) ; renvoie vers Laura plutôt que de le refaire ici.
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Voir mes prochaines étapes avec Laura' } },
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
            title: 'Rien à piloter pour l’instant',
            description: 'Analyse ton premier compte pour faire apparaître ton tableau de bord.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger ton tableau de bord.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un onglet « Équipe » avec son propre cockpit a été RETIRÉ, pas seulement démasqué : deux cockpits d’équipe (celui-ci et `/team`) auraient divergé le jour même, et celui-ci n’était gardé par aucune permission. La règle « une lecture agrégée vit sur UNE route » est tenue par une garde d’architecture.',
      source: 'apps/web/src/features/dashboard/view/DashboardContent.tsx:22',
    },
    {
      kind: 'decision',
      text: 'L’accroche du pilotage nomme les maillons NON MESURÉS à côté de ceux qui décrochent et de ceux qui tiennent — jamais absorbés dans un total qui ferait croire à une couverture complète.',
      source: 'apps/web/src/features/pilotage/view/PilotageAccroche.tsx:62',
    },
    {
      kind: 'decision',
      text: 'Le lien vers les réglages de notification RENVOIE vers Réglages › Notifications plutôt que de redemander les mêmes préférences ici — un réglage vit à un seul endroit (GA-26).',
      source: 'apps/web/src/features/dashboard/view/DashboardContent.tsx:44',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois chiffres du pilotage passent de 3 à 1 colonne sous 768 px. Les sections repliables (Trajectoire, Opportunités, Prochaines étapes) restent mono-colonne à toutes les largeurs — un tableau de bord PERSONNEL n’a pas besoin d’un aside ni d’une grille large. Au-delà de 1920, chaque section garde une largeur de lecture plafonnée plutôt que de s’étirer en pleine largeur.',
      source: 'apps/web/src/features/dashboard/view/DashboardContent.tsx:25',
    },
    {
      kind: 'decision',
      text: 'RUX-10 (`docs/revue-ux.md` §4, T3) : deux listes de « prochaines choses à faire » sous deux noms — « Mes prochaines étapes » ici et « À faire maintenant » sur `app/briefing` — laissaient le commercial deviner laquelle fait foi (loi 4). `/dashboard` devient « Ma trajectoire » dans Pilotage et perd ce bloc, qui renvoie désormais vers Laura (ADAPTÉ à Q1 : Laura est l’écran d’arrivée par défaut, pas « Aujourd’hui »).',
      source: 'apps/web/src/features/dashboard/view/DashboardContent.tsx:44',
    },
  ],
}
