import type { PageSpec } from '../../types'

/**
 * /missions — la liste « En cours » / « Prêt à facturer ». Deux lentilles sur
 * le même objet : ce qui TOURNE, et ce qui BLOQUE la facturation.
 *
 * Lu dans : `apps/web/src/routes/missions/index.tsx` → `MissionsPage.tsx`
 * (entête, lentilles, filtres, tableau, tiroir de détail). Le lentille
 * « Prêt à facturer » rend `InvoiceReadinessPanel` — voir `app/missions-facturation`
 * pour son détail complet (même composant, même route dédiée
 * `/missions/facturation`). Textes de `apps/web/src/i18n/locales/fr/missions.json`.
 *
 * Les lignes du tableau sont des EMPLACEMENTS, pas des missions inventées.
 */
export const missionsPage: PageSpec = {
  id: 'app/missions',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/index.tsx',
  title: 'Missions',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes missions.', style: 'title' },
      {
        type: 'text',
        text: 'Voici les missions actives qui nécessitent ton attention, classées par urgence.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    intro: [
      { type: 'component', component: 'TabNav', props: { variant: 'pill', items: ['En cours', 'Prêt à facturer'] } },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'sm',
          items: [
            'Démarrage',
            'En cours',
            'Suspendue',
            'Terminée',
            'Interrompue',
            'Renouvelée',
            'Brouillon',
            'Prête à démarrer',
            'À risque',
            'Renouvellement en cours',
            'En fin',
            'Clôturée',
            'Annulée',
            'Archivée',
          ],
        },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Régie', 'Forfait', 'Recrutement', 'Nature non dite'] },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['À renouveler', 'Sans date de fin', 'Avec risque'] },
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher une mission, un compte ou un consultant' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Demander à Laura quelles missions surveiller' } },
          },
          {
            type: 'component',
            component: 'DropdownMenu',
            props: {
              content: { trigger: 'Colonnes' },
              items: ['Mission', 'Compte', 'Rôle', 'Consultant', 'Statut', 'Échéance', 'Nature', 'Risques'],
            },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Nouvelle mission' } },
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
            columns: ['Mission', 'Compte', 'Consultant', 'Statut', 'Échéance', 'Nature', 'Risques', 'Prochaine action'],
            rows: [
              ['Mission exemple 1', 'Compte exemple 1', 'Talent exemple 1', '—', '—', '—', '—', '—'],
              ['Mission exemple 2', 'Compte exemple 2', 'Talent exemple 2', '—', '—', '—', '—', '—'],
              ['Mission exemple 3', 'Compte exemple 3', 'Personne d’affecté', '—', '—', '—', '—', '—'],
            ],
          },
        },
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
            title: 'Aucune mission',
            description: 'Les missions apparaissent ici dès qu’un projet est signé.',
            action: 'Lancer une analyse',
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
            title: 'Les missions n’ont pas pu être chargées',
            description: 'Elles sont toujours là — c’est la lecture qui a échoué.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'RUX-36 (docs/revue-ux.md §2 P2) : le code affiche encore le même libellé « Terminée » pour deux statuts distincts (`ended`, `completed`) dans le filtre « Statut » — impossible de les distinguer sans ouvrir la fiche. La maquette cible distingue « Terminée » (`ended` : la mission s’est arrêtée) de « Clôturée » (`completed` : la mission est administrativement close, facturée et soldée).',
      source: 'apps/web/src/i18n/locales/fr/missions.json:17',
    },
    {
      kind: 'decision',
      text: 'RUX-36 (docs/revue-ux.md §2 P2, Top 20 non retenu) : « Terminée » (`ended`) et « Clôturée » (`completed`) sont deux pastilles de statut distinctes dans le filtre — jamais le même mot pour deux états qui n’ont pas la même conséquence commerciale (une mission `ended` peut encore attendre sa facturation, une mission `completed` ne l’attend plus).',
      source: 'apps/web/src/i18n/locales/fr/missions.json:17',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, la barre d’actions passe à la ligne (`flex-wrap`, MissionsToolbar.tsx) et le tableau défile horizontalement dans son propre conteneur (GA-119, `table.tsx`) — aucune colonne n’est masquée par palier, l’utilisateur choisit lui-même via « Colonnes ». De 768 à 1194 px (tablette), même mise en page qu’au-delà. Au-delà de 1920 (2560/3440) : aucun gain — `page-gutter.ts` ne pose pas de `max-w-*`, le tableau s’étire pleine largeur au lieu de gagner une colonne ou un panneau.',
      source: 'apps/web/src/features/missions/view/MissionsPage.tsx:317',
    },
    {
      kind: 'ecart',
      text: 'Le contenu de la page s’étire pleine largeur sur écran ultra-large (2560/3440 px) : `CONTENT_BASE` n’a pas de `max-w-*`, le tableau ne gagne ni colonne ni panneau supplémentaire.',
      source: 'apps/web/src/components/page/page-gutter.ts:47',
    },
    {
      kind: 'decision',
      text: 'Pas de bouton d’ajout manuel : on n’entre en mission que par le besoin signé ou « Nouvelle mission » (assistant en 4 étapes, `/missions/nouvelle`).',
      source: 'apps/web/src/features/missions/view/MissionsPage.tsx:359',
    },
  ],
}
