import type { PageSpec } from '../../types'

/**
 * /mailbox — « Ta messagerie », triée par intention métier (relancer avant
 * retrouver) plutôt que par dossier. Trois intentions de triage toujours
 * visibles, dix intentions de recherche repliées, un fil s'ouvre dans un
 * panneau latéral (`ThreadDrawer`).
 *
 * Lu dans : `apps/web/src/routes/mailbox/index.tsx` → `MailboxPage.tsx`
 * (bandeau connecteur, capacités, signature, filtres, liste de fils,
 * `ThreadDrawer`, `DraftDialog`, `LinkAccountDialog`). Textes de
 * `apps/web/src/i18n/locales/fr/mailbox.json`.
 */
export const mailboxPage: PageSpec = {
  id: 'app/mailbox',
  surface: 'app',
  domain: 'mailbox',
  route: 'apps/web/src/routes/mailbox/index.tsx',
  title: 'Messagerie',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ta messagerie, {{name}}', style: 'title' },
      {
        type: 'text',
        text: 'Laura trie ta messagerie connectée et te montre uniquement les fils qui méritent une action.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Demander à Laura' } } },
    ],
    intro: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: { variant: 'default', size: 'sm', content: { description: 'Connectée — synchronisée à l’instant.' } },
      },
      {
        type: 'component',
        component: 'SettingsRow',
        props: { content: { label: 'Signature', value: 'Réglée dans Réglages › Profil' } },
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'md', items: ['Non lus', 'Sans réponse', 'Réponses favorables'] },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Ce qu’on cherche' } },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'sm',
          items: [
            'Budget',
            'TJM',
            'CV reçus',
            'Fiches de poste',
            'Contrat',
            'Appel d’offres',
            'Facture',
            'Rendez-vous',
            'Pièces jointes',
            'Libre',
          ],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Contact exemple 1 — Relance TJM', value: 'Sans réponse' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Contact exemple 2 — CV envoyé', value: 'Non lu' } },
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'Sheet',
        props: { side: 'right', content: { title: 'Fil de discussion' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Préparer une réponse' } },
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
            title: 'Aucun fil pour cette recherche',
            description: 'Change d’intention ou élargis la fenêtre.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucune messagerie connectée',
            description:
              'Connecte ta messagerie pour chercher tes fils, repérer les silences et préparer tes réponses ici.',
            action: 'Connecter ma messagerie',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La signature n’est plus éditable en haut de cet écran de triage : c’est un réglage, déplacé dans Réglages › Profil (une seule porte d’écriture, GA-26). Il n’en reste ici qu’un état d’une ligne et un lien.',
      source: 'apps/web/src/features/mailbox/view/MailboxPage.tsx:243',
    },
    {
      kind: 'decision',
      text: 'Treize intentions de recherche existent toutes, mais seules trois (non lus, sans réponse, réponses favorables) restent visibles d’emblée — les dix autres (budget, TJM, CV…) répondent à « où est ce mail ? », repliées derrière « Ce qu’on cherche », pour ne pas donner un air de formulaire à un écran de triage.',
      source: 'apps/web/src/features/mailbox/view/MailboxPage.tsx:65',
    },
    {
      kind: 'decision',
      text: 'Le fil s’ouvre dans un panneau latéral (`ThreadDrawer`) plutôt qu’une nouvelle page : le détail ne coûte aucun appel de plus (les messages voyagent déjà avec le fil), et « préparer une réponse » ferme le panneau puis ouvre la fenêtre de rédaction — jamais les deux couches en même temps.',
      source: 'apps/web/src/features/mailbox/view/MailboxPage.tsx:353',
    },
    {
      kind: 'decision',
      text: 'Responsive : le panneau de fil est plein écran sous 640 px (`sm`) et redevient un panneau latéral de largeur fixe (`max-w-md`) à partir de 640 px — tablette (768-1194) et desktop (1195-1920) partagent ce même panneau latéral. Au-delà de 1920 px (2560, 3440) : la liste de fils garde sa largeur de lecture de liste (D81, pleine largeur mais sans étirement des lignes), le panneau latéral garde sa largeur fixe — l’espace en plus devient de la marge, jamais une troisième colonne.',
      source: 'apps/web/src/features/mailbox/view/m1/ThreadReader.tsx:1',
    },
  ],
}
