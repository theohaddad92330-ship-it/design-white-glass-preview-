import type { PageSpec } from '../../types'

/**
 * /pilotage/finance — Finance et capacité. Cinq lectures financières jamais
 * fondues (CA, prévisionnel, capacité, marge, délai de paiement), plus le CA
 * par mission, les relevés d’activité, l’ADV, les encaissements, l’outil de
 * gestion connecté, le prévisionnel par horizon, les alertes de facturation et
 * l’activité récente. Neuf générations de maquettes ont validé cette structure
 * (dossier du 26/08/2026).
 *
 * Lu dans : `apps/web/src/routes/pilotage/finance.tsx` (garde `manager_cockpit`)
 * → `FinanceScreen.tsx` (monte `FinancePanel` + dix sous-blocs). Textes de
 * `apps/web/src/i18n/locales/fr/pilotage.json` (clé `finance`).
 */
export const pilotageFinancePage: PageSpec = {
  id: 'app/pilotage-finance',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/finance.tsx',
  title: 'Finance et capacité',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Finance et capacité', style: 'title' },
      {
        type: 'text',
        text: 'Cinq lectures, jamais fondues en un seul chiffre. L’écart entre elles est l’information.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        children: [
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Période' } } },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { label: 'Société', placeholder: 'Toutes les sociétés' } },
          },
          {
            type: 'text',
            text: 'Le prévisionnel, la capacité et le délai de paiement ne suivent pas cette période : ils regardent devant, le mois en cours, et tout l’historique.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          content: {
            title: 'Portée restreinte',
            description: 'Ton périmètre : tes comptes et tes missions.',
          },
        },
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'warning',
          content: {
            title: 'Réservé aux responsables',
            description: 'Ces chiffres relèvent du périmètre finance. Ils existent, mais ton siège ne les lit pas.',
          },
        },
      },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Taux de réalisation' } },
            children: [
              {
                type: 'placeholder',
                kind: 'chart',
                label: 'Anneau — 78 % de l’objectif de marge du mois',
                height: 'sm',
              },
              { type: 'text', text: 'Marge 41 200 € · objectif 52 800 €', style: 'caption', color: 'text/muted' },
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'end',
                children: [
                  {
                    type: 'component',
                    component: 'Input',
                    props: { state: 'default', content: { label: 'Objectif de marge (%)', placeholder: 'ex. 30' } },
                  },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'sm', content: { label: 'Enregistrer' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'Apports d’affaires',
                description: 'Ce que coûte le passage par un apporteur, en points de marge.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Marge totale (vente directe)', value: '46 800 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '− commission d’apport', value: '5 600 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: '= marge nette (via apporteur)', value: '41 200 €' } },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Prévisionnel : non mesuré. Aucun calcul du produit ne rend une marge prévisionnelle par apporteur.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'Ce que la photo mensuelle compare',
                description: 'Deux chiffres photographiés chaque mois. La marge n’est pas photographiée.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Clients actifs', value: '18 (+1 vs mois dernier)' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Missions sans coût saisi', value: '3 (−1 vs mois dernier)' } },
                  },
                ],
              },
            ],
          },
        ],
      },
      { type: 'text', text: 'Finance et capacité', style: 'heading' },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Chiffre d’affaires' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Signé', value: '58 400 €' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    align: 'center',
                    children: [
                      {
                        type: 'component',
                        component: 'Delta',
                        props: { tone: 'up', content: { value: '+8 % vs mois précédent' } },
                      },
                      {
                        type: 'component',
                        component: 'HelpIcon',
                        props: {
                          content: {
                            label: 'Ce que ce chiffre compte, sur quelle fenêtre, et ce qui en est exclu.',
                          },
                        },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Produit', value: '52 100 €' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    children: [
                      {
                        type: 'component',
                        component: 'Delta',
                        props: { tone: 'up', content: { value: '+4 % vs mois précédent' } },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Facturé', value: '47 300 €' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    children: [
                      {
                        type: 'component',
                        component: 'Delta',
                        props: { tone: 'down', content: { value: '−3 % vs mois précédent' } },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Encaissé', value: '41 900 €' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    children: [
                      {
                        type: 'component',
                        component: 'Delta',
                        props: { tone: 'up', content: { value: '+2 % vs mois précédent' } },
                      },
                    ],
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir le détail' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Prévisionnel' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Acquis', value: '58 400 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Probable', value: '22 000 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Espéré', value: '14 000 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Marge des lignes contractualisées', value: '19 600 €' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir le détail' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Capacité' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Jours disponibles au total', value: '340 j' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Jours déjà engagés', value: '286 j' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Taux d’intercontrat', value: '15,9 %' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    align: 'center',
                    children: [
                      {
                        type: 'component',
                        component: 'Badge',
                        props: { variant: 'warning', content: { label: 'Cible < 5 %' } },
                      },
                      {
                        type: 'component',
                        component: 'HelpIcon',
                        props: {
                          content: {
                            label: 'Ce que ce chiffre compte, sur quelle fenêtre, et ce qui en est exclu.',
                          },
                        },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Jours restant à vendre', value: '54 j' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir le détail' } },
              },
              {
                type: 'text',
                text: 'Sans le droit finance:read, ce bloc dit : « Réservé aux responsables : ce chiffre décrit l’espace entier. »',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Marge' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Marge de l’espace', value: '39,4 %' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    align: 'center',
                    children: [
                      {
                        type: 'component',
                        component: 'Badge',
                        props: { variant: 'success', content: { label: 'Cible 25 – 40 %' } },
                      },
                      {
                        type: 'component',
                        component: 'Delta',
                        props: { tone: 'up', content: { value: '+1,3 pt vs mois précédent' } },
                      },
                      {
                        type: 'component',
                        component: 'HelpIcon',
                        props: {
                          content: {
                            label: 'Ce que ce chiffre compte, sur quelle fenêtre, et ce qui en est exclu.',
                          },
                        },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Marge non mesurée', value: '3 missions sans coût saisi' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    children: [
                      {
                        type: 'component',
                        component: 'Badge',
                        props: { variant: 'outline', content: { label: 'Cible < 10 % · complétude' } },
                      },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Seuil d’alerte', value: '30 %' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir le détail' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Marge par canal' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  { type: 'component', component: 'DataRow', props: { content: { label: 'Direct', value: '42,1 %' } } },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Partenaire', value: '34,8 %' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Sous-traitance', value: '28,6 %' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Coût de l’intermédiation', value: '5 600 €' } },
                  },
                ],
              },
              {
                type: 'text',
                text: 'Sans le droit finance:read, ce bloc dit : « Réservé aux responsables : ce chiffre décrit l’espace entier. »',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Délai de paiement' } },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Délai moyen', value: '38 jours' } },
                  },
                  {
                    type: 'stack',
                    direction: 'row',
                    gap: '2',
                    justify: 'end',
                    align: 'center',
                    children: [
                      {
                        type: 'component',
                        component: 'Badge',
                        props: { variant: 'success', content: { label: 'Cible < 65 j' } },
                      },
                      {
                        type: 'component',
                        component: 'HelpIcon',
                        props: {
                          content: {
                            label: 'Ce que ce chiffre compte, sur quelle fenêtre, et ce qui en est exclu.',
                          },
                        },
                      },
                    ],
                  },
                ],
              },
              {
                type: 'text',
                text: '2 factures écartées faute de dates · aucune facture contestée',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'text',
                text: 'Sans le droit finance:read, ce bloc dit : « Réservé aux responsables : ce chiffre décrit l’espace entier. »',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'CA par mission',
            description: 'Ce qui a été livré et facturable ce mois-ci, mission par mission.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Mission', 'Période', 'Livré et facturable', 'Facturé'],
                rows: [
                  ['Mission exemple 1', '01/09 → 30/09', '18 400 €', '18 400 €'],
                  ['Mission exemple 2', '01/09 → 30/09', '12 900 €', '9 200 €'],
                  ['Mission exemple 3', '15/09 → 30/09', '6 100 €', 'à échoir'],
                ],
              },
            },
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
            component: 'SectionCard',
            props: {
              content: {
                title: 'Relevés d’activité',
                description: 'Trois états : ce qui bloque un mois de facturation.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Validés', value: '84 % (26 sur 31 attendus)' } },
                  },
                  { type: 'component', component: 'DataRow', props: { content: { label: 'En attente', value: '4' } } },
                  { type: 'component', component: 'DataRow', props: { content: { label: 'En conflit', value: '1' } } },
                ],
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'Administration des ventes',
                description: 'Les dossiers du mois et ce qui les empêche d’être facturables.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Nouveaux démarrages', value: '2 (+1 vs mois dernier)' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Renouvellements', value: '1 — aucune comparaison possible' } },
                  },
                ],
              },
            ],
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
            component: 'SectionCard',
            props: {
              content: {
                title: 'Encaissements',
                description: 'Ce qui est rentré, attendu, en retard — les douze derniers mois.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'DataList',
                props: {},
                children: [
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Encaissé', value: '41 900 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'En attente', value: '3 800 €' } },
                  },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'En retard', value: '1 600 €' } },
                  },
                  { type: 'component', component: 'DataRow', props: { content: { label: 'Contesté', value: '0 €' } } },
                  {
                    type: 'component',
                    component: 'DataRow',
                    props: { content: { label: 'Non rapproché', value: '620 €' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Voir le détail' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'Ton outil de gestion',
                description: 'Ce que BellumAI sait de l’outil de gestion que tu as connecté.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', content: { label: 'Connecter (Réglages › Intégrations)' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Prévisionnel par horizon',
            description: 'Des montants classés par statut déclaré, jamais pondérés par une probabilité.',
          },
        },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '4',
            align: 'end',
            children: [
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Horizon', value: 'Mois' },
                  items: ['Semaine', 'Mois', 'Trimestre', 'Semestre'],
                },
              },
              {
                type: 'component',
                component: 'FilterChips',
                props: { size: 'sm', items: ['Complète', 'Manager (5 lignes)'] },
              },
            ],
          },
          {
            type: 'placeholder',
            kind: 'chart',
            label:
              'Prévisionnel par horizon — semaine/mois/trimestre/semestre, 4 scénarios non pondérés, décisions proposées',
            height: 'lg',
          },
        ],
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Ce qui bloque de l’argent',
            description: 'Du plus bloquant au moins bloquant — ces montants ne s’additionnent pas.',
          },
        },
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
                  content: { label: 'Relevés en attente de validation', value: '4 missions · montant non chiffré' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Facture non émise', value: '1 mission · 6 100 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Facture en retard d’encaissement', value: '1 facture · 1 600 €' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: { title: 'Activité récente', description: 'Ce qui a bougé, du plus récent au plus ancien.' },
        },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Mission démarrée', value: 'Mission exemple 3 · il y a 2 jours' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Relevé validé par le client', value: 'Mission exemple 1 · il y a 3 jours' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Relevé rejeté', value: 'Mission exemple 2 · il y a 5 jours' } },
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
            title: 'Aucune facturation sur ce mois-ci',
            description: 'Change de mois ou attends la prochaine.',
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
          content: { title: 'Lecture impossible.', description: 'Rien n’est affiché plutôt qu’un chiffre à zéro.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : Signé/Produit/Facturé/Encaissé n’est PAS une bande de 4 tuiles en haut d’écran — ce sont 4 `DataRow` À L’INTÉRIEUR de la carte « Chiffre d’affaires », l’une des 6 cartes du bloc « Finance et capacité » (Chiffre d’affaires, Prévisionnel, Capacité, Marge, Marge par canal, Délai de paiement). Les 5 lectures financières restantes étaient auparavant fondues dans UNE seule `SectionCard` : la réalité en fait 6 cartes séparées, chacune avec son propre lien « Voir le détail » vers un écran différent (doctrine : une destination par figure, jamais la même pour toutes après un bug qui les envoyait toutes vers `/missions`).',
      source: 'apps/web/src/features/pilotage/view/FinancePanel.tsx:332',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le libellé du 2ᵉ compartiment d’Encaissements est « En attente », pas « Attendu » ; un 4ᵉ compartiment « Contesté » manquait entièrement (`summarizeCollections` en rend 4 : Encaissé/En attente/En retard/Contesté, Non rapproché vient d’une source séparée #2419.9).',
      source: 'apps/web/src/features/pilotage/finance/FinanceCollectionsSummary.tsx:1',
    },
    {
      kind: 'decision',
      text: 'L’objectif de marge de l’anneau « Taux de réalisation » est un RÉGLAGE saisi par l’ESN (`finance_margin_targets`), jamais une cible inventée par le produit — sans objectif saisi, l’anneau dit « objectif non défini » et n’affiche aucun pourcentage.',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:114',
    },
    {
      kind: 'decision',
      text: 'Deux bandes ont été retenues en bas d’écran (alertes de facturation, puis activité récente ajoutée le 31/08/2026) ; deux autres proposées ont été rejetées et ne se re-litigent pas : les actions IA suggérées (mélangent des sujets commerciaux sur un écran finance) et la bannière marketing.',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:96',
    },
    {
      kind: 'decision',
      text: 'Le filtre par société est ACTIF depuis le 01/09/2026 sur quatre des six lectures ; les trois qui ne peuvent pas le recevoir (capacité, délai de paiement, ligne « espéré » du prévisionnel) le disent explicitement plutôt que de rester figées en silence.',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:154',
    },
    {
      kind: 'decision',
      text: 'BellumAI SUIT le financier, il ne COMPTABILISE pas (#2564, 18/09/2026) : CA par mission, encaissements et outil de gestion connecté sont ajoutés à cet écran, aucune facture n’est émise ni comptabilisée.',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:201',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, toutes les grilles (KPI de CA, anneau/apports/snapshot, paires Relevés-ADV et Encaissements-Outil) repassent à 1 colonne. En tablette (768–1194) et en bureau (1280–1920) elles tiennent leurs 3 ou 4 colonnes. Au-delà (2560, 3440), on n’étire jamais : la maquette cible une 5ᵉ tuile de KPI (ex. une lecture supplémentaire) et les deux paires de cartes côte à côte en une seule rangée de 4, plutôt que des cartes démesurément larges. Le prévisionnel par horizon garde ses axes lisibles dès 360 en repassant en défilement horizontal CONTENU (jamais le corps de page).',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:366',
    },
    {
      kind: 'ecart',
      text: 'La rangée Objectif / Apports d’affaires / Snapshot saute directement de 1 colonne (mobile) à 3 colonnes au palier `md` (768 px) sans palier intermédiaire à 2 colonnes (`grid gap-6 md:grid-cols-3`) : en tablette étroite (768–900 px environ), les trois cartes sont visuellement compressées avant que la largeur ne soit vraiment confortable pour trois colonnes.',
      source: 'apps/web/src/features/pilotage/finance/FinanceScreen.tsx:366',
    },
  ],
}
