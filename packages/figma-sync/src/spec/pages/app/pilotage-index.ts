import type { PageSpec } from '../../types'

/**
 * /pilotage — Pilotage › Décisions. KPI de chaîne (huit maillons, seuil
 * d'alerte par maillon), file d'arbitrage, chaîne, impact mesurable,
 * apprentissage, synthèses CRM/playbooks, dictionnaire des indicateurs.
 *
 * Lu dans : `apps/web/src/routes/pilotage/index.tsx` (garde `manager_cockpit`)
 * → `PilotagePage.tsx` (droit par section), section Cockpit `CockpitBody.tsx` (Cockpit de Théo, Louis 23/10). Textes de `apps/web/src/i18n/locales/fr/pilotage.json`.
 */
export const pilotageIndexPage: PageSpec = {
  id: 'app/pilotage',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/index.tsx',
  title: 'Pilotage',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Voilà ce qui mérite ton attention, Camille.', style: 'title' },
      {
        type: 'text',
        text: 'BellumAI suit toute la chaîne commerciale et te montre uniquement les endroits où une décision est nécessaire.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Demander à Laura quoi corriger' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'warning', content: { label: '3 alertes' } } },
        ],
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Maillons qui décrochent' } },
            children: [{ type: 'text', text: '3', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Besoins détectés à confirmer' } },
            children: [{ type: 'text', text: '5', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Maillons sans mesure' } },
            children: [{ type: 'text', text: '2', style: 'display' }],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'À traiter' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Néopharm Solutions', value: 'Maillon « qualité » sous le seuil' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Atelier Vasseur', value: 'Besoin détecté à confirmer' } },
              },
            ],
          },
        ],
      },
      {
        type: 'placeholder',
        kind: 'graph',
        label: 'La chaîne commerciale — huit maillons en chaîne, seuil d’alerte par maillon (acquisition → qualité)',
        height: 'lg',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Impact mesurable de BellumAI' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Attribution directe', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Attribution partielle', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Historique non attribuable', value: '—' } },
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
            title: 'Ce qui fonctionne le mieux chez toi',
            description: 'Ce que ton équipe a fait de ses besoins passés, jusqu’à trois patterns.',
          },
        },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Trois patterns au plus, occurrences et période', height: 'sm' },
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
                title: 'Pipeline du CRM',
                description: 'Calculé sur l’historique de ton CRM, pas sur une estimation.',
              },
            },
            children: [
              {
                type: 'placeholder',
                kind: 'chart',
                label: 'Affaires ouvertes, gagnées, taux de réussite, par étape',
                height: 'sm',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: {
                title: 'Playbooks',
                description: 'Ce qui part tout seul — réglable dans Réglages › Routines.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'EmptyState',
                props: { size: 'sm', content: { title: 'Synthèse des routines actives' } },
              },
            ],
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
            title: 'Dictionnaire des indicateurs',
            description: 'Ce que chaque chiffre compte, et ce qu’on en fait — jamais de valeur ici, une référence.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Indicateur', 'Famille', 'Cadence', 'Seuil', 'Décision'],
                rows: [
                  ['Contacts ciblés', 'Business et acquisition', 'hebdomadaire', '—', '—'],
                  ['Taux de réponse', 'Business et acquisition', 'hebdomadaire', '—', '—'],
                  ['TJM', 'Finance et cash', 'mensuelle', '—', '—'],
                ],
              },
            },
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
            title: 'C’est normal sur un espace qui démarre',
            description:
              'Les cases se remplissent au fur et à mesure, et rien ne s’affiche en rouge tant que rien n’a coulé.',
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
          content: { title: 'Je n’ai pas pu charger la chaîne commerciale.', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'RUX-20 (docs/revue-ux.md T15, addenda au Top 20) : « À traiter » est la file de décisions que RUX-20 cite nommément — quand rien n’attend d’arbitrage, elle ne montre pas deux lignes à tiret ni « 0 dossier » : la `SectionCard` disparaît et cède la place à une phrase qui dit pourquoi (« Rien à traiter pour l’instant — reviens après ta prochaine analyse »).',
      source: 'apps/web/src/features/pilotage/view/CockpitBody.tsx:78',
    },
    {
      kind: 'decision',
      text: 'Deux blocs sont volontairement absents de cet écran : les rituels d’équipe (partis sur `/team`, #1437 — organisation managériale, pas décision de performance) et la configuration des relances automatiques (dans Réglages › Routines, #1438) ; il n’en reste ici qu’une synthèse.',
      source: 'apps/web/src/features/pilotage/view/CockpitBody.tsx:63',
    },
    {
      kind: 'decision',
      text: '« À traiter » est placé HAUT (#1439) bien que la spécification #1440 la place en septième position — les deux lectures sont tenues ensemble : haute quand il y a quelque chose à arbitrer, absente quand il n’y a rien.',
      source: 'apps/web/src/features/pilotage/view/CockpitBody.tsx:78',
    },
    {
      kind: 'decision',
      text: 'La bulle Laura ne déclare que la COMPLÉTUDE (maillons mesurés / total), jamais les chiffres eux-mêmes — pour empêcher Laura de commenter une mosaïque à moitié grise comme si elle était pleine (« non mesuré » ≠ « mesuré à zéro »).',
      source: 'apps/web/src/features/pilotage/view/CockpitBody.tsx:118',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, la grille de KPI et les deux synthèses CRM / Playbooks repassent à 1 colonne ; en tablette (768–1194), elles montent à 2 colonnes (palier `sm`, 640 px, dans le code réel de la bande de décisions) ; en bureau (1280–1920), 3 colonnes ; au-delà (2560, 3440) on n’étire jamais — la maquette cible une 4ᵉ colonne de KPI et les deux synthèses CRM/Playbooks côte à côte avec le dictionnaire des indicateurs, plutôt qu’un simple élargissement des cartes existantes. Le graphe de la chaîne commerciale reste lisible dès 360 px en empilant ses maillons verticalement. Cet écran ne peuple pas le slot `aside` : rien à réserver ≥ 1280 px.',
      source: 'apps/web/src/features/pilotage/view/PilotagePage.tsx:133',
    },
    {
      kind: 'ecart',
      text: 'La bande de décisions ne gagne aucune colonne au-delà de 1024 px (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`, dernier palier `lg`) : sur un écran 2560 ou 3440, elle s’étire sans ajouter de carte plutôt que de rester à largeur de lecture confortable.',
      source: 'apps/web/src/features/pilotage/view/DecisionStrip.tsx:105',
    },
  ],
}
