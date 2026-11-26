import type { PageSpec } from '../../types'

/**
 * /pilotage/staffing — Staffing. Quatre lectures sur la même page, jamais
 * pondérées : capacité contre demande sur 12 semaines, intercontrat (jours et
 * coût du mois), fins de mission à 30/60/90 jours, TACE planifié contre réel
 * avec son seuil d’alerte (réglage d’espace, vide = aucune alerte). Un coût ou
 * un TACE absent se dit « non renseigné » / « non mesuré », jamais « 0 ».
 *
 * Lu dans : `apps/web/src/routes/pilotage/staffing.tsx:15` (garde d’offre
 * `manager_cockpit`) → `features/pilotage/staffing/StaffingScreen.tsx:50`
 * (sections : capacité `:55`, intercontrat `:70`, fins de mission `:73`,
 * TACE `:76` ; formulaire de seuil `:462`). Textes de
 * `apps/web/src/i18n/locales/fr/pilotage.json` (clé `staffing`).
 */
export const pilotageStaffingPage: PageSpec = {
  id: 'app/pilotage-staffing',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/staffing.tsx',
  title: 'Staffing',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Staffing', style: 'title' },
      {
        type: 'text',
        text: 'Qui est disponible, qui est sur le banc, quelles missions finissent, et à quel taux les consultants produisent. Rien n’est pondéré.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Capacité et demande · 12 semaines' } },
        children: [
          {
            type: 'text',
            text: 'Par semaine : la capacité en jours face aux jours demandés par les missions signées et, séparément, par les besoins ouverts datés. Les deux demandes ne s’additionnent pas.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'placeholder',
            kind: 'chart',
            label: 'Barres par semaine — Capacité · Missions signées · Besoins ouverts (en jours)',
            height: 'md',
          },
          {
            type: 'text',
            text: '2 besoins ouverts sans date de début ne sont pas comptés.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Intercontrat' } },
        children: [
          {
            type: 'text',
            text: 'Consultants sans mission aujourd’hui. Jours cumulés : jours ouvrés du mois en cours, hors congés.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'Coût de l’intercontrat sur le mois : 8 400 € (jours × coût journalier, consultants dont le coût est renseigné).',
            style: 'body',
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Consultant', value: 'Depuis · Jours ce mois · Compétences · Coût du mois' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Nom du consultant', value: 'Coût non renseigné' } },
              },
            ],
          },
          {
            type: 'text',
            text: '1 consultant sans coût journalier renseigné n’est pas chiffré.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Fins de mission' } },
        children: [
          {
            type: 'text',
            text: 'Missions en cours qui se terminent dans les 30, 60 ou 90 prochains jours, avec la prolongation connue ou non.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'grid',
            columns: 3,
            columnsMobile: 1,
            gap: '4',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Sous 30 jours' } },
                children: [
                  { type: 'text', text: 'Consultant · Client', style: 'body' },
                  { type: 'text', text: 'Fin le 28/10/2026 (dans 14 j)', style: 'caption', color: 'text/muted' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'warning', content: { label: 'Prolongation en discussion' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: '31 à 60 jours' } },
                children: [
                  {
                    type: 'text',
                    text: 'Aucune fin de mission sur cette période.',
                    style: 'caption',
                    color: 'text/muted',
                  },
                ],
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: '61 à 90 jours' } },
                children: [
                  { type: 'text', text: 'Consultant · Client', style: 'body' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'secondary', content: { label: 'Prolongation non connue' } },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'TACE · taux d’activité' } },
        children: [
          {
            type: 'text',
            text: 'Jours facturés ÷ jours ouvrés disponibles. Les week-ends, jours fériés et congés sont retirés du dénominateur.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'text', text: 'Octobre 2026 · du 1er au 14', style: 'body' },
              {
                type: 'component',
                component: 'HelpIcon',
                props: { content: { label: 'Formule du TACE' } },
              },
            ],
          },
          {
            type: 'grid',
            columns: 2,
            columnsMobile: 1,
            gap: '4',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Planifié' } },
                children: [
                  { type: 'text', text: '82 %', style: 'display' },
                  { type: 'text', text: '41 j sur 50 j disponibles', style: 'caption', color: 'text/muted' },
                ],
              },
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Réel' } },
                children: [
                  {
                    type: 'text',
                    text: 'Non mesuré : aucun temps saisi',
                    style: 'caption',
                    color: 'text/muted',
                  },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'warning', content: { label: 'Sous le seuil de 85 %' } },
          },
          {
            type: 'text',
            text: 'Par consultant : Consultant · Planifié · Réel.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'end',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: {
                  state: 'default',
                  content: { label: 'Seuil d’alerte TACE (%)', placeholder: 'Réglage d’espace. Vide = aucune alerte.' },
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Enregistrer' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Remettre à non réglé' } },
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
            title: 'Aucun consultant ni aucune demande à comparer sur les 12 prochaines semaines.',
            description: 'Les blocs sans donnée disent leur absence, jamais un zéro.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Le staffing est indisponible pour le moment.',
            description: 'Rien n’est affiché plutôt qu’un chiffre inventé.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le seuil d’alerte TACE est un RÉGLAGE saisi par l’ESN : sans seuil, aucune alerte (« Aucun seuil d’alerte saisi »), jamais un seuil par défaut inventé.',
      source: 'apps/web/src/features/pilotage/staffing/StaffingScreen.tsx:462',
    },
    {
      kind: 'decision',
      text: 'Un TACE réel sans temps saisi se dit « Non mesuré », jamais « 0 % » ; un coût d’intercontrat non renseigné n’est pas chiffré et son compte est nommé.',
      source: 'apps/web/src/features/pilotage/staffing/StaffingScreen.tsx:424',
    },
    {
      kind: 'decision',
      text: 'Les demandes (missions signées, besoins ouverts datés) ne s’additionnent pas et ne sont pas pondérées ; les besoins sans date sont comptés à part.',
      source: 'apps/web/src/features/pilotage/staffing/StaffingScreen.tsx:137',
    },
  ],
}
