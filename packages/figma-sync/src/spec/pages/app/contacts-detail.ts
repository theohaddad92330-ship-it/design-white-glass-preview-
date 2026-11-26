import type { PageSpec } from '../../types'

/**
 * /contacts/$id — la fiche contact. Cinq onglets (Résumé, Rôle & périmètre,
 * Relations, Signaux, Activité) ; l'onglet Relations n'existe que s'il a
 * quelque chose à montrer (§46).
 *
 * Lu dans : `apps/web/src/routes/contacts/$id.tsx` → `ContactDetailPage.tsx`
 * → `ContactDetail.tsx` (entête, bannière relationnelle, onglets, contenu du
 * Résumé en grille 3 colonnes). Textes :
 * `apps/web/src/i18n/locales/fr/contacts.json`.
 */
export const contactsDetailPage: PageSpec = {
  id: 'app/contacts-detail',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/$id.tsx',
  title: 'Fiche contact',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        children: [
          { type: 'component', component: 'Avatar', props: { content: { initials: 'JD' } } },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              { type: 'text', text: 'Jean Dupont', style: 'title' },
              { type: 'text', text: 'DSI — ATOS FRANCE', style: 'caption', color: 'text/secondary' },
              { type: 'component', component: 'FilterChips', props: { size: 'sm', items: ['Décideur économique'] } },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Plan d’action' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Compléter' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Voir sur LinkedIn' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Masquer' } },
      },
    ],
    summary: [{ type: 'text', text: 'Porté par Julie', style: 'caption', color: 'text/secondary' }],
    tabs: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'underline', items: ['Résumé', 'Rôle & périmètre', 'Relations', 'Signaux', 'Activité'] },
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '5',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Informations clés' } },
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Email', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Téléphone', value: '—' } } },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Pourquoi ce contact compte' } },
            children: [{ type: 'text', text: '—', style: 'body' }],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Signaux' } },
            children: [{ type: 'text', text: 'Aucun signal pour l’instant', style: 'body', color: 'text/muted' }],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Fiche' } },
        children: [{ type: 'text', text: 'Nom · titre · entité · SIREN de rattachement', style: 'body' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Icebreakers' } },
        children: [
          {
            type: 'text',
            text: 'Accroches personnalisées, générées depuis le profil du contact.',
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Ce contact est introuvable.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’onglet Relations n’apparaît QUE si le contact porte au moins une relation — un onglet ouvert pour n’y rien trouver coûte un clic et une déception à chaque fiche.',
      source: 'apps/web/src/features/contacts/view/contact-detail/ContactDetail.tsx:41',
    },
    {
      kind: 'decision',
      text: 'Les gestes qui sortent le contact du travail courant (Corrections, Écarter, Effacement RGPD) sont rangés en BAS du Résumé, dans cet ordre précis : le verdict d’identité d’abord, « écarter » (notre décision) ensuite, l’effacement RGPD en dernier — le seul geste irréversible.',
      source: 'apps/web/src/features/contacts/view/contact-detail/ContactDetail.tsx:123',
    },
    {
      kind: 'decision',
      text: 'Responsive : le Résumé passe de trois colonnes (`lg:grid-cols-3`) à une colonne empilée sous 1024 px — Informations clés, Pourquoi ce contact compte et Signaux se lisent alors dans l’ordre plutôt que côte à côte. Pas d’aside sur cette fiche à aucune largeur ; au-delà de 1920, la grille de trois cartes garde des colonnes de largeur confortable plutôt que d’en ajouter une quatrième.',
      source: 'apps/web/src/features/contacts/view/contact-detail/ContactDetail.tsx:92',
    },
  ],
}
