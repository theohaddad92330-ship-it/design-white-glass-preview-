import type { PageSpec } from '../../types'

/**
 * /consultants/:id/reverse-market — « Où placer ce profil » : la prospection
 * inversée, partie d'un consultant vers les besoins internes puis le marché
 * externe (PDF 5 §6.2, BEL-ATS-010).
 *
 * Lu dans : `apps/web/src/routes/consultants/$id_.reverse-market.tsx` →
 * `ReverseMarketPage.tsx` — trois sections empilées : besoins internes
 * (radar 12 axes), marché externe (offres + ESN qui recrutent),
 * environnements structurellement compatibles (mémoire marché). Textes de
 * `apps/web/src/i18n/locales/fr/consultants.json` (`reverseMarket`).
 */
export const consultantReverseMarketPage: PageSpec = {
  id: 'app/consultant-reverse-market',
  surface: 'app',
  domain: 'consultants',
  route: 'apps/web/src/routes/consultants/$id_.reverse-market.tsx',
  title: 'Où placer ce profil',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour à la fiche de Talent exemple' } },
      },
      { type: 'text', text: 'Où placer Talent exemple', style: 'title' },
      {
        type: 'text',
        text: 'La prospection inversée : partir de ce profil pour trouver où le positionner, en interne comme sur le marché.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Besoins internes',
            description:
              'Les besoins ouverts de l’espace, classés contre ce profil — comme depuis un besoin, vu par l’autre bout.',
          },
        },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'FilterChips',
                props: { size: 'sm', items: ['Tout le portefeuille', 'Mes besoins'] },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Lancer le classement' } },
              },
            ],
          },
          {
            type: 'placeholder',
            kind: 'graph',
            label: 'Radar à 12 axes, jusqu’à 4 profils superposés — hachuré : non évaluable, jamais zéro',
            height: 'md',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Besoin', 'Score de rapprochement'],
                rows: [['Besoin exemple chez Compte exemple', '—']],
              },
            },
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
            title: 'Marché externe',
            description:
              'Les offres publiées et les ESN qui recrutent sur sa zone — la veille territoriale, lue depuis ce profil.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Département', 'Offres IT', 'Technologies demandées, sur la fiche', 'Source'],
                rows: [
                  [
                    '—',
                    'La source publique n’a rien rendu cette semaine-là',
                    'aucune des technologies les plus demandées n’est sur la fiche',
                    '—',
                  ],
                ],
              },
            },
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['ESN', 'Département', 'Offres', 'Habitude trimestrielle', 'Ouverte au rang 2'],
                rows: [['—', '—', '—', 'Pas assez de relevés pour une habitude', 'Jamais déclaré']],
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
            title: 'Environnements structurellement compatibles',
            description:
              'Ce que la mémoire marché a observé, dans le passé, autour de ce profil — une trace, jamais une actualité.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Entreprise', 'Zone', 'Fit expertise', 'Recours externe', 'Signal actuel'],
                rows: [['Compte exemple', '—', '—', '—', '—']],
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun besoin ouvert ne ressort de ce classement.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'La mémoire marché n’a pas pu être lue.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le radar plafonne à quatre profils superposés, et le hachuré (non évaluable) ne se confond jamais avec zéro : au-delà d’un cinquième besoin, l’écran le compte plutôt que de le tracer illisible.',
      source: 'apps/web/src/features/consultants/view/reverse-market/ReverseMarketPage.tsx:203',
    },
    {
      kind: 'decision',
      text: '« Recrute sur sa zone » n’est jamais « recrute ce profil » : la veille compte les offres par ESN et les technologies par département, sans jamais croiser les deux — un rapprochement qu’elle ne sait pas encore faire ne se devine pas.',
      source: 'apps/web/src/i18n/locales/fr/consultants.json:984',
    },
    {
      kind: 'decision',
      text: 'Aucune gradation ni score sur les environnements compatibles : dire « fort » ou « moyen » demanderait de comparer à des entreprises de taille et de secteur voisins, ce que le produit ne sait pas encore faire — la doctrine du score qui montre ses axes s’applique aussi à son absence.',
      source: 'apps/web/src/i18n/locales/fr/consultants.json:1013',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois sections restent empilées en UNE seule colonne à toutes les tailles (`flex flex-col gap-4`, aucun `grid-cols` ni `lg:flex-row`) — vrai à 360 px comme à 1920 px ; les tableaux défilent horizontalement dans leur conteneur (GA-119). Au-delà de 1920 (2560/3440) : aucun gain — pas de disposition en deux colonnes pour lire « interne » et « externe » côte à côte, alors que l’espace le permettrait.',
      source: 'apps/web/src/features/consultants/view/reverse-market/ReverseMarketPage.tsx:143',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessinait un texte brut plutôt qu’un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus, sur les trois surfaces ; `Loader2` en dur est interdit.',
      source: 'apps/web/src/features/consultants/view/reverse-market/ReverseMarketPage.tsx:1',
    },
  ],
}
