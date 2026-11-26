import type { PageSpec } from '../../types'

/**
 * /team — le cockpit manager : sept sections repliables, dans l’ordre où une
 * décision se prend avant sa réunion hebdomadaire (Aujourd’hui / Semaine /
 * Équipe / Pipe / Staffing / Missions / Adoption). Ce qui demande une
 * décision monte, ce qui donne du contexte descend.
 *
 * Lu dans : `apps/web/src/routes/team/index.tsx` →
 * `ManagerDashboardPage.tsx` (entête, `AskLaura`, sept `CollapsedSection`).
 * Textes de `apps/web/src/i18n/locales/fr/manager.json`.
 */
export const teamPage: PageSpec = {
  id: 'app/team',
  surface: 'app',
  domain: 'team',
  route: 'apps/web/src/routes/team/index.tsx',
  title: 'Workspace commercial',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Workspace commercial · {{name}}', style: 'title' },
      { type: 'text', text: '{{count}} membres · vue consolidée', style: 'body', color: 'text/secondary' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Gérer les membres' } },
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Préparer ma revue d’équipe' } },
      },
    ],
    primary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'État verrouillé (palier requis)',
                description:
                  'Ce que /team affiche À LA PLACE de tout le reste quand l’offre en cours n’inclut pas le Pilotage — PlanFeatureRoute remplace ManagerDashboardPage entier par PlanFeatureLocked, rien de ce qui suit ne se dessine.',
              },
            },
            children: [
              { type: 'text', text: 'Pilotage', style: 'title' },
              { type: 'text', text: 'Disponible à partir de l’offre Growth', style: 'body', color: 'text/secondary' },
              {
                type: 'text',
                text: 'Objectifs, activité et couverture de l’équipe en un écran.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: 'Ce que Growth débloque (199 €/mois)', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Pilotage',
                        value: 'Objectifs, activité et couverture de l’équipe en un écran.',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Vivier',
                        value: 'Tes consultants alignés sur un besoin, CV réécrit pour la mission.',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Export CRM', value: 'Pousse un contact dans ton CRM en un clic.' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Assistant IA (MCP)', value: 'Branche Claude ou Cursor sur tes dossiers.' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'API publique', value: 'Tes données dans tes propres outils.' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Passer à Growth pour en profiter' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Aujourd’hui' } },
            children: [
              {
                type: 'text',
                text: 'File d’arbitrage — ce qui demande une décision aujourd’hui.',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '2 comptes n’ont aucun responsable', value: 'Les attribuer' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: '1 compte travaillé en double — Compte exemple 1', value: 'Coordonner' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '3 actions partagées en retard', value: 'Voir les actions' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: '2 comptes attribués n’ont pas bougé depuis 14 jours',
                        value: 'Voir les portefeuilles',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: '1 périmètre n’est couvert par personne',
                        value: 'Voir la carte de couverture',
                      },
                    },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Variante — file vide, aucun arbitrage en attente',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'InfoBanner',
                props: {
                  variant: 'success',
                  size: 'sm',
                  content: {
                    title: 'Rien à arbitrer aujourd’hui',
                    description:
                      'Chaque compte a un responsable, aucune action partagée n’est en retard et personne ne travaille en double.',
                  },
                },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Semaine' } },
            children: [
              {
                type: 'text',
                text: 'Rappels et agenda de la semaine, par porteur. 4 échéances dans les 7 prochains jours.',
                style: 'caption',
                color: 'text/secondary',
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
                      content: { label: 'Léa Dupuis', value: 'Relance Compte exemple 1 — échéance 26/09/2026' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Karim Haddad', value: 'Envoi de la synthèse — échéance 28/09/2026' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Équipe' } },
            children: [
              {
                type: 'component',
                component: 'Table',
                props: {
                  table: {
                    columns: [
                      'Membre',
                      'Portefeuille',
                      'En veille',
                      'Comptes créés',
                      'Contacts',
                      'Emails',
                      'Analyses',
                      'Opportunités',
                      'Crédits',
                      'Dernière activité',
                    ],
                    rows: [
                      ['Léa Dupuis', '8 comptes', '1', '3', '24', '18', '6', '5', '210', 'il y a 2 h'],
                      ['Karim Haddad', '6 comptes', '0', '2', '16', '9', '4', '3', '140', 'il y a 1 j'],
                      ['Élise Bonnet', '4 comptes', '2', '1', '9', '4', '2', '1', '60', 'il y a 5 j'],
                      [
                        'Sami Nasri',
                        '0 compte',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        'Aucune activité enregistrée · Rôle lecture seule',
                      ],
                      [
                        'Nadia Ferro',
                        '0 compte',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        '0',
                        'Aucune activité enregistrée · Aucun compte attribué',
                      ],
                    ],
                  },
                },
              },
              { type: 'text', text: 'Actions à traiter (partagées)', style: 'label' },
              {
                type: 'text',
                text: '5 ouvertes · 3 en retard · 2 déléguées',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'component',
                component: 'Tabs',
                props: { items: ['Tout', 'Mes actions', 'Déléguées à moi'] },
              },
              {
                type: 'stack',
                direction: 'column',
                gap: '2',
                children: [
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'between',
                    align: 'center',
                    children: [
                      { type: 'text', text: 'Relance Compte exemple 1', style: 'body' },
                      {
                        type: 'component',
                        component: 'Badge',
                        props: { variant: 'warning', content: { label: 'En retard' } },
                      },
                    ],
                  },
                  {
                    type: 'text',
                    text: 'Échéance 26/09/2026 · Assignée à Karim Haddad',
                    style: 'caption',
                    color: 'text/secondary',
                  },
                  { type: 'text', text: 'Envoi de la synthèse', style: 'body' },
                  {
                    type: 'text',
                    text: 'Sans échéance · Plan de Léa Dupuis',
                    style: 'caption',
                    color: 'text/secondary',
                  },
                ],
              },
              {
                type: 'text',
                text: 'Les 2 actions les plus urgentes sont affichées ; la file en compte 5.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: 'Coaching', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Karim Haddad', value: '2 opportunités sans action depuis 21 jours' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Élise Bonnet', value: '1 opportunité sans action depuis 30 jours' },
                    },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Un fait daté à apporter en échange individuel · jamais un score, jamais un classement entre commerciaux.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Pipe' } },
            children: [
              {
                type: 'text',
                text: 'Trajectoire commerciale de l’équipe. Aucune probabilité, aucun pipe pondéré.',
                style: 'caption',
                color: 'text/secondary',
              },
              { type: 'text', text: 'Pipeline partagé', style: 'label' },
              {
                type: 'text',
                text: 'Total sur les étapes encore en jeu (signé/perdu/en veille exclus) : 84 000 € · 6 opportunités chiffrées',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Nouveau', value: '3 sur 3 chiffrées · 22 000 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Contacté', value: '2 sur 3 chiffrées · 18 000 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'RDV', value: '1 sur 1 chiffrée · 44 000 €' } },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Chaque commercial fixe sa cible du mois ; l’atteinte se lit sur des données réelles.',
                style: 'caption',
                color: 'text/secondary',
              },
              { type: 'text', text: 'Mon objectif du mois', style: 'label' },
              { type: 'component', component: 'Input', props: { content: { label: 'Rendez-vous', value: '4' } } },
              { type: 'component', component: 'Input', props: { content: { label: 'Comptes', value: '10' } } },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Chiffre d’affaires (€)', placeholder: 'Non fixé' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer mon objectif' } },
              },
              { type: 'text', text: 'Atteinte de l’équipe', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Léa Dupuis · Rendez-vous', value: '3 / 4 (75 %)' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Karim Haddad · Rendez-vous', value: '2 / 3 (67 %)' } },
                  },
                ],
              },
              { type: 'text', text: 'Contacts à traiter', style: 'label' },
              {
                type: 'component',
                component: 'StackedBar',
                props: {
                  data: 'complete',
                  items: [
                    'Nouveau · 6',
                    'Contacté · 9',
                    'Répondu · 4',
                    'RDV · 3',
                    'Gagné · 2',
                    'Perdu · 5',
                    'Archivé · 1',
                  ],
                },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Staffing' } },
            children: [
              {
                type: 'text',
                text: 'Qui couvre quoi — secteurs, territoires, personas — et ce que personne ne couvre.',
                style: 'caption',
                color: 'text/secondary',
              },
              { type: 'text', text: 'Comptes par propriétaire', style: 'label' },
              {
                type: 'text',
                text: '16 / 18 comptes attribués (89 %) · 2 comptes ne sont portés par personne.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: 'Carte de couverture', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Secteurs — Aéronautique & défense',
                        value: 'Léa Dupuis · 3 — Karim Haddad · 1',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Secteurs — Transport & logistique',
                        value: 'Périmètre non couvert — personne ne porte ces comptes',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Territoires — Île-de-France',
                        value: 'Karim Haddad · 4 — dont 1 compte sans responsable',
                      },
                    },
                  },
                ],
              },
              { type: 'text', text: 'Comptes sans responsable', style: 'label' },
              {
                type: 'text',
                text: 'Choisis le responsable de chaque compte. Un compte sans responsable n’est suivi par personne.',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                children: [
                  { type: 'text', text: 'Compte exemple 4 · Secteur inconnu · priorité 7', style: 'body' },
                  {
                    type: 'component',
                    component: 'Select',
                    props: {
                      size: 'sm',
                      content: { placeholder: 'Attribuer à…' },
                      items: ['Léa Dupuis', 'Karim Haddad', 'Élise Bonnet'],
                    },
                  },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                children: [
                  { type: 'text', text: 'Compte exemple 5 · Transport & logistique · priorité 4', style: 'body' },
                  {
                    type: 'component',
                    component: 'Select',
                    props: {
                      size: 'sm',
                      content: { placeholder: 'Attribuer à…' },
                      items: ['Léa Dupuis', 'Karim Haddad', 'Élise Bonnet'],
                    },
                  },
                ],
              },
              { type: 'text', text: 'Doublons de couverture', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Compte exemple 1', value: '2 commerciaux · Léa Dupuis, Karim Haddad' },
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Missions' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Missions sans date de fin',
                        value: '2 — aucune alerte de renouvellement ne se déclenchera jamais dessus',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: 'Missions sans coût chargé',
                        value: '1 — sa marge n’est pas mesurable tant que le coût n’est pas saisi',
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Adoption' } },
            children: [
              { type: 'text', text: 'Activité récente', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Léa Dupuis a lancé une analyse', value: 'Compte exemple 1 · il y a 2 h' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: 'Karim Haddad a envoyé un message', value: 'Compte exemple 2 · il y a 1 j' },
                    },
                  },
                ],
              },
              { type: 'text', text: 'Playbooks partagés', style: 'label' },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Playbook — Ouverture aéronautique & défense', value: 'Playbook' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Méthode — Relance après RDV sans réponse', value: 'Méthode' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Ouvrir les Connaissances' } },
              },
              { type: 'text', text: 'Rituels d’équipe', style: 'label' },
              {
                type: 'text',
                text: 'L’ordre du jour de chaque réunion, avec sa durée et les chiffres à ouvrir.',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Point quotidien', value: '20 min' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Revue hebdomadaire', value: '105 min' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Revue mensuelle', value: '240 min' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Revue trimestrielle', value: '420 min' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Revue rang 1', value: '30 min' } },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Accordéon déplié — Revue hebdomadaire, ordre du jour',
                style: 'caption',
                color: 'text/muted',
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
                      content: {
                        label: '1 · Sourcing et recrutement',
                        value:
                          '15 min · Porté par sales ops · Chiffres à ouvrir : consultants à disponibilité inconnue',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '2 · Comptes et opportunités', value: '25 min · Porté par l’équipe' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: { label: '3 · Indicateurs et arbitrages', value: '20 min · Porté par le manager' },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: '4 · Plan d’actions et expérimentations',
                        value: '30 min · Porté par le manager',
                      },
                    },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: {
                      content: {
                        label: '5 · Prévisionnel et adoption',
                        value:
                          '15 min · Porté par le manager · Chiffres à ouvrir : missions sans coût chargé, missions sans date de fin',
                      },
                    },
                  },
                ],
              },
              { type: 'text', text: 'Capitalisation & collaboration', style: 'label' },
              {
                type: 'text',
                text: 'Partage une idée, un retour terrain, un point de coordination avec l’équipe.',
                style: 'caption',
                color: 'text/secondary',
              },
              {
                type: 'component',
                component: 'Textarea',
                props: { content: { label: 'Ton commentaire', placeholder: 'Partager une idée / un commentaire…' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Partager' } },
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
                      content: {
                        label: 'Léa Dupuis',
                        value: 'À propos de Compte exemple 1 — « le DSI valide le budget en octobre »',
                      },
                    },
                  },
                ],
              },
              {
                type: 'grid',
                columns: 4,
                columnsMobile: 2,
                gap: '2',
                children: [
                  {
                    type: 'component',
                    component: 'Card',
                    props: { content: { title: 'Comptes' } },
                    children: [{ type: 'text', text: '18', style: 'display' }],
                  },
                  {
                    type: 'component',
                    component: 'Card',
                    props: { content: { title: 'Contacts' } },
                    children: [{ type: 'text', text: '49', style: 'display' }],
                  },
                  {
                    type: 'component',
                    component: 'Card',
                    props: { content: { title: 'Emails envoyés' } },
                    children: [{ type: 'text', text: '31', style: 'display' }],
                  },
                  {
                    type: 'component',
                    component: 'Card',
                    props: { content: { title: 'Analyses' } },
                    children: [{ type: 'text', text: '12', style: 'display' }],
                  },
                ],
              },
              { type: 'text', text: 'Crédits & usage IA', style: 'label' },
              {
                type: 'component',
                component: 'UsageBar',
                props: { size: 'md', content: { label: 'Crédits du cycle en cours', used: '410', limit: '600' } },
              },
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Léa Dupuis', value: '210 crédits' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Karim Haddad', value: '140 crédits' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Élise Bonnet', value: '60 crédits' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'text',
            text: 'Données de ton équipe hébergées dans l’Union européenne.',
            style: 'caption',
            color: 'text/muted',
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
        props: { size: 'md', align: 'center', content: { title: 'Rien à afficher pour l’instant' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'text',
        text: 'Erreur générique — la lecture des statistiques d’équipe a échoué',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Le cockpit n’a pas pu être chargé' } },
      },
      {
        type: 'text',
        text: 'Erreur 403 dédiée — l’utilisateur n’est ni propriétaire ni admin de l’espace',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Vue réservée aux managers (propriétaire ou admin de l’espace).' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : la bande des quatre totaux (Comptes/Contacts/Emails/Analyses) n’est PAS une colonne « secondary » à part — elle vit DANS la section « Adoption », juste avant « Crédits & usage IA ». Le tableau « Équipe » ne portait que 5 des 10 colonnes réelles (Comptes créés/Contacts/Emails/Analyses/Crédits manquaient entre « En veille » et « Opportunités ouvertes »). Toutes les sept sections étaient réduites à une phrase : chacune porte maintenant son contenu réel (file d’arbitrage, agenda par porteur, pipeline + objectifs, carte de couverture, activité + playbooks + rituels + capitalisation).',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:189',
    },
    {
      kind: 'decision',
      text: 'Le tableau « Équipe » affiche l’email d’un membre en clair, concaténé après son rôle (« {{role}} · {{email}} ») — pas de masquage ici, à la différence des backoffices DM : un manager voit l’équipe qu’il dirige, ce n’est pas une adresse d’un tiers.',
      source: 'apps/web/src/features/manager/view/cockpit/RepsBoard.tsx:95',
    },
    {
      kind: 'decision',
      text: 'L’ordre des sept sections est la DEMANDE (#1464), pas une préférence : « un manager doit savoir en moins de 30 secondes qui couvre quoi, où l’équipe se marche dessus, où personne n’agit ». Ce qui demande une décision (Aujourd’hui) monte, ce qui donne du contexte (Adoption, avec les quatre totaux) descend en avant-dernier.',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:156',
    },
    {
      kind: 'decision',
      text: 'Aucune probabilité, aucun pipe pondéré dans la section Pipe : « ni l’un ni l’autre n’en a jamais affiché, et c’est un refus écrit du dépôt, pas une omission ».',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:261',
    },
    {
      kind: 'decision',
      text: 'Le coaching porte un fait DATÉ, jamais un score ni un classement entre commerciaux — vérifié par le docblock du panneau lui-même.',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:252',
    },
    {
      kind: 'decision',
      text: 'Une section sans aucune donnée ne s’affiche PAS DU TOUT (Staffing sur une API antérieure à l’attribution de compte, Missions sans les deux lignes d’hygiène) : un en-tête replié sans contenu à l’intérieur mentirait sur ce qu’il annonce — mieux vaut l’absence de la section que la section vide.',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:276',
    },
    {
      kind: 'decision',
      text: 'Responsive : les sept sections sont des `CollapsedSection` repliées à l’arrivée, sur toute largeur — le geste (déplier) est identique en mobile et desktop, seule la largeur de la table « Équipe » change. Tablette (768-1194) et desktop (1195-1920) partagent le même empilement vertical en une colonne. Au-delà de 1920 px (2560, 3440) : le bandeau des quatre totaux (Adoption) reste à 4 colonnes, les sections restent en une colonne pleine largeur — un cockpit à sept sections ne gagne pas de colonnes supplémentaires, il resterait illisible en lecture parallèle.',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:356',
    },
    {
      kind: 'decision',
      text: 'L’état « verrouillé » (palier requis) n’est pas un état du gabarit `dashboard` — celui-ci ne déclare pas d’`optionalStates` — donc il se dessine comme un premier bloc, clairement étiqueté, EN TÊTE de `primary` plutôt que comme une clé de `states` : c’est ce que `PlanFeatureRoute` substitue à tout le reste de l’écran quand l’offre n’inclut pas le Pilotage (`manager_cockpit`, palier Growth).',
      source: 'apps/web/src/features/plan-features/PlanFeatureRoute.tsx:37',
    },
    {
      kind: 'decision',
      text: 'L’état d’erreur 403 dédié (accès réservé aux managers) rejoint l’erreur générique DANS le même bloc `error` — le gabarit `dashboard` n’a qu’UN seul état « erreur » à déclarer, les deux variantes sont donc montrées l’une sous l’autre, chacune étiquetée par sa légende.',
      source: 'apps/web/src/features/manager/view/ManagerDashboardPage.tsx:105',
    },
    {
      kind: 'decision',
      text: 'L’éditeur d’objectif du mois et le compositeur de commentaire sont des formulaires EN LIGNE dans leur panneau (trois champs + un bouton, un textarea + un bouton) — jamais une modale : rien à noter au registre des surcouches (`src/spec/overlays/`).',
      source: 'apps/web/src/features/manager/view/cockpit/ObjectivesPanel.tsx:132',
    },
  ],
}
