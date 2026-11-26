import type { PageSpec } from '../../types'

/**
 * /pilotage/rex — Retours d’expérience. Deux moitiés sur le même écran : ce qui
 * ATTEND (missions terminées sans retour, avec le geste qui les fait sortir de
 * la file) et ce qui est RECUEILLI (preuve que le geste mène quelque part).
 * Aucun taux, aucune moyenne, aucune courbe — des comptes d’objets seulement.
 * Aucune garde d’offre ni de rôle sur la route ; l’écriture reste gardée par
 * `records:write`, côté serveur et dans l’écran.
 *
 * Lu dans : `apps/web/src/routes/pilotage/rex.tsx` → `RexScreen.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/pilotage.json` (clé `rex`).
 */
export const pilotageRexPage: PageSpec = {
  id: 'app/pilotage-rex',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/rex.tsx',
  title: 'Retours d’expérience',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Retours d’expérience', style: 'title' },
      {
        type: 'text',
        text: 'Un retour se recueille à chaud, en deux minutes. Trois mois plus tard il est introuvable, et avec lui la seule matière d’où une preuve peut sortir.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Missions terminées attendent leur retour' } },
            children: [{ type: 'text', text: '—', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Retours recueillis' } },
            children: [{ type: 'text', text: '—', style: 'display' }],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'À recueillir' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Mission', 'Compte', 'Terminée le', 'Geste'],
                rows: [
                  ['Mission exemple 1', 'Compte exemple 1', '—', 'Recueillir le retour'],
                  ['Mission exemple 2', 'Compte exemple 2', '—', 'Recueillir le retour'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Retour sur mission exemple 1' } },
        children: [
          {
            type: 'component',
            component: 'Textarea',
            props: {
              content: {
                label: 'Ce que la mission a appris',
                placeholder: 'Le sponsor a changé au bout de deux mois…',
              },
            },
          },
          {
            type: 'component',
            component: 'Textarea',
            props: {
              content: { label: 'Ce qui a bien fonctionné', placeholder: 'Le binôme architecte et développeur…' },
            },
          },
          {
            type: 'component',
            component: 'Textarea',
            props: {
              content: { label: 'Ce qui a posé problème', placeholder: 'Les accès à l’environnement de test…' },
            },
          },
          { type: 'component', component: 'Button', props: { content: { label: 'Enregistrer' } } },
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Annuler' } } },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Retours recueillis' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Mission exemple 3 · recueilli le —', value: '' } },
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
            title: 'Aucune mission terminée dans cet espace.',
            description:
              'Un retour se recueille quand une mission s’achève. Elles apparaîtront ici dès qu’une première se termine.',
            action: 'Voir les missions',
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
            title: 'Lecture impossible.',
            description: 'Ce n’est pas « aucun retour » : la liste n’a pas pu être lue.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Ce qui manquait n’était ni la table ni le calcul (`rex_entries` existe depuis longtemps) mais l’endroit où l’on ÉCRIT le retour — `POST /capitalisation/rex` n’avait aucun appelant avant cet écran.',
      source: 'apps/web/src/features/pilotage/rex/view/RexScreen.tsx:24',
    },
    {
      kind: 'decision',
      text: 'Aucun taux, aucune moyenne, aucune courbe affichés : chaque compte porte sur des objets et est posé juste au-dessus de la liste qu’il dénombre.',
      source: 'apps/web/src/features/pilotage/rex/view/RexScreen.tsx:37',
    },
    {
      kind: 'decision',
      text: "Le droit d’écrire un retour est vérifié par `hasPermission(…, 'records:write')`, jamais par un test de rôle en dur — ce geste appartient aussi au recruteur et au commercial, pas seulement au responsable.",
      source: 'apps/web/src/features/pilotage/rex/view/RexScreen.tsx:55',
    },
    {
      kind: 'decision',
      text: 'Responsive : le tableau « À recueillir », le formulaire (six champs) et la liste des retours recueillis sont déjà en une colonne à toutes les largeurs dans le code (`space-y-*`, aucune grille) — mobile, tablette et bureau sont identiques. Au-delà de 1920 (2560, 3440), la maquette cible une lecture à deux colonnes (file à recueillir à gauche, retours recueillis à droite) plutôt qu’une seule colonne étirée sur toute la largeur.',
      source: 'apps/web/src/features/pilotage/rex/view/RexScreen.tsx:107',
    },
  ],
}
