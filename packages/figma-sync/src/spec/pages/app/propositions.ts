import type { PageSpec } from '../../types'

/**
 * /propositions — le studio de proposition (addendum final p69) : ne montre
 * pas une proposition rédigée, montre son PLAN et ce qui lui manque, section
 * par section. Rien ne s'envoie ni ne s'enregistre depuis cet écran.
 *
 * Lu dans : `apps/web/src/routes/propositions/index.tsx` →
 * `ProposalPlanBlock.tsx` (Théo C HT-6, 22/10/2026 : le studio est fondu dans Affaires › Présentations, `/propositions` redirige ; le plan vit désormais dans ce bloc ; sélecteur de besoin, résumé de complétude, neuf
 * cartes de section avec leur état et leurs manques). Textes de
 * `apps/web/src/i18n/locales/fr/proposals.json`.
 */
export const propositionsPage: PageSpec = {
  id: 'app/propositions',
  surface: 'app',
  domain: 'propositions',
  route: 'apps/web/src/routes/propositions/index.tsx',
  title: 'Préparer la proposition',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Préparer la proposition', style: 'title' },
      {
        type: 'text',
        text: 'Laura rassemble ce qu’elle sait déjà du besoin et vérifie ce qui manque avant que tu rédiges ta proposition.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Prix, planning et disponibilité ne sont jamais inventés.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    summary: [
      {
        type: 'component',
        component: 'Select',
        props: { size: 'md', content: { label: 'Besoin à préparer', placeholder: 'Choisis un besoin' } },
      },
      {
        type: 'component',
        component: 'DataRow',
        props: { content: { label: 'Compte exemple', value: 'Besoin exemple' } },
      },
      {
        type: 'component',
        component: 'Card',
        props: {
          content: {
            title: '4 sections prêtes sur 9',
            description: 'Des sections sont encore vides. Chacune dit ce qu’il lui faut.',
          },
        },
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Contexte' } },
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Prête' } } },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Équipe' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Incomplète' } },
              },
              { type: 'text', text: 'Ce qu’il manque (1)', style: 'caption', color: 'text/secondary' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Tarification' } },
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Vide' } } },
            ],
          },
        ],
      },
    ],
    footer: [
      {
        type: 'text',
        text: 'Le studio prépare, tu envoies. Aucun e-mail ne part d’ici et aucune fiche n’est modifiée.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Le plan n’a pas pu être assemblé.', description: 'Réessaie.', action: 'Réessayer' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une section vide n’est jamais cachée : elle est MONTRÉE avec son état (« Vide », « Incomplète », « Prête ») et ce qui lui manque — le studio ne fusionne jamais un manque dans un silence.',
      source: 'apps/web/src/features/proposals/view/ProposalPlanBlock.tsx:23',
    },
    {
      kind: 'decision',
      text: 'Le studio ne redemande jamais une valeur qui vit ailleurs : chaque manque porte la porte de l’écran qui le corrige (TJM sur le positionnement, disponibilité sur la fiche vivier, qualification sur le besoin, preuves sur le compte) — jamais un formulaire qui dupliquerait la même valeur.',
      source: 'apps/web/src/features/proposals/view/ProposalPlanBlock.tsx:113',
    },
    {
      kind: 'decision',
      text: 'Aucun chiffre de probabilité ou de chance de signature : le seul chiffre est un DÉCOMPTE (« 4 sections prêtes sur 9 »), immédiatement décomposé par les cartes qui suivent — jamais un score global.',
      source: 'apps/web/src/features/proposals/view/ProposalPlanBlock.tsx:23',
    },
    {
      kind: 'decision',
      text: 'Responsive : la grille de sections est 1 colonne sous 768 px, 2 colonnes de 768 à 1279 px (tablette), 3 colonnes à partir de 1280 px (`xl`). La liste déroulante des besoins reste le seul moyen d’atteindre les besoins au-delà des huit premiers, à toute largeur — jamais une grille de cent boutons. Au-delà de 1920 px (2560, 3440) : la grille plafonne à 3 colonnes, chaque carte garde sa largeur de lecture (D81), l’espace en plus devient de la marge autour de la grille plutôt qu’une 4ᵉ colonne qui casserait la lecture verticale des neuf sections.',
      source: 'apps/web/src/features/proposals/view/ProposalPlanBlock.tsx:113',
    },
  ],
}
