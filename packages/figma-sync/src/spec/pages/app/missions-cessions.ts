import type { PageSpec } from '../../types'

/**
 * /missions/cessions — les créances cédées au factor : encours, rapprochement
 * des règlements, créances non cédées, contrats d'affacturage.
 *
 * Lu dans : `apps/web/src/routes/missions/cessions.tsx` → `CessionsSection.tsx`
 * (bandeau, tuiles, tableau des cessions, sections « Cession manquante » et
 * « Règlements à rapprocher », contrats). Textes de
 * `apps/web/src/i18n/locales/fr/factoring.json`.
 */
export const missionsCessionsPage: PageSpec = {
  id: 'app/missions-cessions',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/cessions.tsx',
  title: 'Cessions',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Cessions', style: 'title' },
      {
        type: 'text',
        text: 'Une cession porte sur une créance déjà facturée. Bellum prépare le dossier et rapproche ce que le factor a versé : la transmission au factor reste ton geste.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Mission : Migration ERP S/4HANA'] },
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 1,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Encours cédé', value: '18 400 €' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'En attente de règlement', value: '6 200 €' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Cession manquante', value: '1 créance — 3 400 €' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Écart de réconciliation', value: 'Aucun écart' } },
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
            columns: [
              'Client',
              'Mission',
              'Mois',
              'Factor',
              'Montant cédé',
              'Taux',
              'Statut',
              'Rapprochement',
              'Écart',
              'Actions',
            ],
            rows: [['Compte exemple 1', 'Mission exemple 1', '—', '—', '—', '—', 'Préparée', 'En attente', '—', '—']],
          },
        },
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Cession manquante',
            description:
              'Des créances facturées et non encaissées qu’aucune cession ne couvre. Toutes n’ont pas vocation à être cédées : c’est un écart à regarder, pas une faute.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Client', 'Mission', 'Mois', 'Montant facturé', 'Échéance', 'Actions'],
                rows: [['Compte exemple 2', 'Mission exemple 2', '—', '—', '—', '—']],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Règlements à rapprocher',
            description: 'Des versements du factor qu’aucune cession ne solde encore.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Reçu le', 'Montant', 'Référence', 'Actions'],
                rows: [['—', '—', 'Référence non renseignée', '—']],
              },
            },
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Contrats d’affacturage' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', content: { title: 'Aucun contrat d’affacturage', action: 'Ajouter un contrat' } },
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
            title: 'Aucune cession pour l’instant.',
            description:
              'Une cession se prépare depuis une créance facturée et non encaissée, dans la liste ci-dessous.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les cessions n’ont pas pu être lues.', description: 'Réessaie dans un instant.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le rôle qui n’a pas accès aux données financières voit les cessions, leurs statuts et les totaux d’entête, mais pas le montant par ligne — un droit, pas une donnée manquante.',
      source: 'apps/web/src/i18n/locales/fr/factoring.json:8',
    },
    {
      kind: 'decision',
      text: 'Aucune coordonnée bancaire n’est demandée ni conservée : le virement du factor arrive sur le compte de l’ESN, il ne passe pas par Bellum.',
      source: 'apps/web/src/i18n/locales/fr/factoring.json:47',
    },
    {
      kind: 'decision',
      text: 'Responsive : les quatre tuiles passent de 1 colonne sous 768 px à 2 (tablette) puis 4 à partir de 1024 px (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`), même grille pour les contrats (1→2). Les deux tableaux secondaires (cession manquante, règlements) passent sous le tableau principal en une seule colonne à toutes les tailles inférieures à 1280 px. Au-delà de 1920 (2560/3440) : aucune troisième colonne — les deux sections secondaires restent l’une sous l’autre au lieu de se placer côte à côte.',
      source: 'apps/web/src/features/factoring/view/CessionsSection.tsx:255',
    },
    {
      kind: 'decision',
      text: 'RUX-29/#2613 (docs/revue-ux.md T15) : les quatre tuiles ne montrent plus jamais « Non mesuré » côte à côte — un signal négatif inutile quand le compte a des cessions réelles (le tableau ci-dessous). Une tuile réellement sans valeur (aucun connecteur d’affacturage branché) ne se dessine pas du tout ; si les quatre le sont, la rangée entière est remplacée par une phrase (l’état `empty` de cette page le fait déjà).',
      source: 'apps/web/src/features/factoring/view/CessionsSection.tsx:1',
    },
    {
      kind: 'decision',
      text: 'RUX-35 (`docs/revue-ux.md` §4, priorité haute) : ouvert depuis la chaîne de livraison d’un dossier de mission (`?mission=<id>`), cet écran arrive filtré, une pastille retirable « Mission : <nom> » dans la `FilterBar` — jamais la liste complète des cessions à retrier soi-même.',
      source: 'apps/web/src/features/missions/chain/missionChain.ts:129',
    },
  ],
}
