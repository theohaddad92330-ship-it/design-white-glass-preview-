import type { PageSpec } from '../../types'

/**
 * /accounts/$id/brief — le brief d'avant-rendez-vous (tome 5, partie M) : une
 * page, quatre minutes, huit blocs dans un ordre non décoratif. Le brief
 * REORDONNE le dossier, il ne calcule rien de son côté.
 *
 * Lu dans : `apps/web/src/routes/accounts/$id_.brief.tsx` →
 * `AccountBrief.tsx`. Textes : `apps/web/src/i18n/locales/fr/brief.json`.
 */
export const accountsBriefPage: PageSpec = {
  id: 'app/accounts-brief',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id_.brief.tsx',
  title: 'Brief',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'between',
        children: [
          { type: 'text', text: 'ATOS FRANCE', style: 'title' },
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Télécharger en PDF' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'link', size: 'sm', content: { label: 'Revenir au dossier' } },
              },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'text', text: 'Contexte du rendez-vous', style: 'caption', color: 'text/secondary' },
          {
            type: 'component',
            component: 'ModeTabs',
            props: { items: ['Premier rendez-vous', 'Point client', 'Partenaire', 'Renouvellement', 'Soutenance'] },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Ce qu’il faut savoir en 30 secondes' } },
        children: [
          { type: 'text', text: 'Services numériques · 5 000 salariés · Bezons — compte prioritaire.', style: 'body' },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Pourquoi maintenant' } },
        children: [{ type: 'text', text: '· Signal — 2026-09-12', style: 'body' }],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Ce qu’il fait, lui' } },
        children: [{ type: 'text', text: 'Nom du contact — Titre — Entité', style: 'body' }],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: '5 questions à poser' } },
        children: [
          {
            type: 'text',
            text: '· Travaillez-vous avec des prestataires externes, et sur quels périmètres ?',
            style: 'body',
          },
          {
            type: 'text',
            text: '· Les besoins sont-ils centralisés aux achats, ou gérés par les équipes ?',
            style: 'body',
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: '3 objections probables' } },
        children: [
          { type: 'text', text: '· « On a déjà des partenaires » → lesquels, sur quel périmètre ?', style: 'body' },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Ce qu’on peut prouver' } },
        children: [{ type: 'text', text: '—', style: 'body' }],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Ce qu’on ne sait pas' } },
        children: [
          {
            type: 'text',
            text: 'Rien n’a été noté comme inconnu sur ce dossier — ce qui est rarement vrai.',
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Ne pas faire' } },
        children: [
          { type: 'text', text: 'Libellé de l’anti-conseil', style: 'body' },
          { type: 'text', text: 'Raison', style: 'caption', color: 'text/muted' },
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
        props: { content: { title: 'Ce dossier n’existe pas.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le PDF s’appuie sur `window.print()` (classes `print:`) plutôt qu’un rendu serveur dédié : le document imprimé est exactement l’écran affiché, jamais un second calcul qui pourrait diverger.',
      source: 'apps/web/src/features/brief/view/AccountBrief.tsx:38',
    },
    {
      kind: 'decision',
      text: 'Le bloc « Ce qu’on peut prouver » distingue QUATRE états (absent, non vérifiable, non vérifié, mobilisable) plutôt que deux — jamais de fausse preuve affichée par défaut.',
      source: 'apps/web/src/features/brief/view/AccountBrief.tsx:161',
    },
    {
      kind: 'decision',
      text: 'Responsive : page mono-colonne à toute largeur (360 → 3440), les huit cartes s’empilent verticalement — un brief se lit avant un rendez-vous, jamais en deux colonnes qui forceraient un choix de lecture. Le sélecteur de contexte (`ModeTabs`) et les actions passent sous le titre en colonne dès que la largeur ne les contient plus (`items-baseline justify-between`, pas de grille à faire évoluer). Au-delà de 1920, la colonne garde une largeur de lecture fixe centrée — rien à étirer, rien à gagner en colonnes supplémentaires : c’est un texte à lire, pas un tableau.',
      source: 'apps/web/src/features/brief/view/AccountBrief.tsx:76',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessinait un texte brut plutôt qu’un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus, sur les trois surfaces ; `Loader2` en dur est interdit.',
      source: 'apps/web/src/features/brief/view/AccountBrief.tsx:1',
    },
    {
      kind: 'decision',
      text: 'RUX-11 (`docs/revue-ux.md` §4, T4) : le titre passe de `heading` (18 px) à `title` (24 px) — « le titre est 24 px partout, une fiche d’entité comprise : c’est le résumé qui porte la hiérarchie, pas une taille de titre ».',
      source: 'apps/web/src/features/brief/view/AccountBrief.tsx:76',
    },
  ],
}
