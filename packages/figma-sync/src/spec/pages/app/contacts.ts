import type { PageSpec } from '../../types'

/**
 * /contacts — le portefeuille de contacts, table dense (onze colonnes) avec
 * une section de filtres repliée par défaut (#2477 : 3219 px de bandeau
 * avant la première ligne, mesuré en production).
 *
 * Lu dans : `apps/web/src/routes/contacts/index.tsx` → `ContactsPage.tsx`
 * (`ContactsIntro`) → `ContactsPageContent.tsx` → `ContactContent.tsx`
 * (section de filtres repliée, portée, vues, table) →
 * `contacts-list/ContactsTableHeaderRow.tsx` (onze colonnes). Textes :
 * `apps/web/src/i18n/locales/fr/contacts.json`.
 */
export const contactsPage: PageSpec = {
  id: 'app/contacts',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/index.tsx',
  title: 'Contacts',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Du contact détecté au contact prioritaire', style: 'title' },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Ajouter un contact' } },
      },
    ],
    intro: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Tous mes comptes', 'Compte ouvert'] },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Toutes', 'À contacter', 'À enrichir', 'À vérifier', 'Déjà connus', 'Masqués'] },
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'sm', content: { placeholder: 'Rechercher un contact' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Demander à Laura sur mes contacts' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter vers une feuille' } },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'xs', content: { label: 'Filtres' } },
      },
      {
        type: 'component',
        component: 'FilterBar',
        props: {
          items: [
            'Rôle décisionnel',
            'Entreprise',
            'Étiquette',
            'Email / LinkedIn',
            'Réseau dormant',
            'Ville / pays',
            'Porteur',
          ],
        },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Cycle de vie : Tous', 'État actuel'] },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Nom',
              'Entreprise',
              'Entité',
              'Rôle',
              'Niveau',
              'État',
              'Donnée vérifiée le',
              'Email / LinkedIn',
              'Mobile / Direct',
              'Score',
              'Action',
            ],
            rows: [
              ['Contact exemple 1', 'Compte exemple 1', '—', '—', '—', '—', '—', '—', '—', '—', '—'],
              ['Contact exemple 2', 'Compte exemple 1', '—', '—', '—', '—', '—', '—', '—', '—', '—'],
              ['Contact exemple 3', 'Compte exemple 2', '—', '—', '—', '—', '—', '—', '—', '—', '—'],
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
        component: 'SearchEmptyState',
        props: { content: { title: 'Aucun contact ne correspond aux filtres' } },
      },
      {
        type: 'text',
        text: 'Aucun contact de ton portefeuille ne passe la recherche ou les filtres en vigueur.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger tes contacts.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Tous les filtres (bouton « Ajouter un filtre », barre de filtres, pastilles de cycle de vie) vivent dans UNE section repliée par défaut — mesuré à 3219 px de bandeau avant la première ligne de contact quand chacun avait sa propre ligne toujours visible. Un filtre actif reste compté sur l’entête repliée (jamais un « 0 »).',
      source: 'apps/web/src/features/contacts/view/ContactContent.tsx:609',
    },
    {
      kind: 'decision',
      text: 'La vue « Masqués » n’est pas un état vide de filtre : c’est une portée HORS de la requête (exclusion SQL). Servir « aucun contact dans cet état » y affirmerait à tort qu’on a cherché et rien trouvé.',
      source: 'apps/web/src/features/contacts/view/ContactContent.tsx:743',
    },
    {
      kind: 'decision',
      text: 'Une sélection en cours l’emporte sur « Exporter » : le bouton exporte les lignes cochées si elles existent, jamais toute la liste chargée en silence derrière une sélection ignorée.',
      source: 'apps/web/src/features/contacts/view/ContactContent.tsx:695',
    },
    {
      kind: 'decision',
      text: 'Responsive : les filtres passent de deux colonnes (`md:grid-cols-2`) à une colonne empilée sous 768 px — une seule borne, jamais `sm`/`lg`, pour éviter un tiers de section vide. La table à onze colonnes défile horizontalement dans son propre conteneur sous 1024 px plutôt que de comprimer les cellules ; le bandeau de portée (`TabNav`) et les pastilles de vue s’enroulent (`flex-wrap`) à toutes les largeurs. Au-delà de 1920, la table garde ses onze colonnes lisibles et gagne de la marge, jamais des colonnes étirées.',
      source: 'apps/web/src/features/contacts/view/ContactContent.tsx:644',
    },
    {
      kind: 'ecart',
      text: 'Le chargement de la liste utilise `BrailleLoader` (loader animé) importé mais hors du catalogue de composants Figma — `Skeleton` shape `table` employé en repli dans la maquette.',
      source: 'apps/web/src/features/contacts/view/ContactContent.tsx:4',
    },
  ],
}
