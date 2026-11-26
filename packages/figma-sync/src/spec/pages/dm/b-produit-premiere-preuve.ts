import type { PageSpec } from '../../types'
import { kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid } from './_shared'

/**
 * /produit/premiere-preuve — issue 2076.13 : LA RECETTE PRODUIT de la
 * « première preuve ». Le verdict qu'un commercial pose sur la première
 * analyse d'un compte qu'il connaît déjà (juste / partielle / fausse /
 * incomplète) enrichit son ESPACE (directives réinjectées aux runs
 * suivants) ; cet écran en est l'autre destination — l'éditeur y lit la
 * justesse du produit, tous espaces confondus.
 *
 * Seuls les espaces qui ont OUVERT le partage sont lus, et seulement le
 * verdict (GA-47) ; les verdicts privés sont un compte, jamais une ligne.
 * Sans verdict partagé, l'écran dit « non mesuré » — jamais « 0 % juste »
 * (GA-18).
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/premiere-preuve/page.tsx`
 * → `premiere-preuve.client.ts`. Textes : `apps/dashboard-manager/src/lib/
 * i18n.ts` (clés `firstProof*`).
 */
export const dmProduitPremierePreuvePage: PageSpec = {
  id: 'dm/produit-premiere-preuve',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/premiere-preuve/page.tsx',
  title: 'Première preuve — verdicts sur comptes connus',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Première preuve — verdicts sur comptes connus', style: 'title' },
      {
        type: 'text',
        text: 'Ce que les commerciaux disent de la première analyse d’un compte qu’ils connaissent déjà : juste, partielle, fausse ou incomplète.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Seuls les espaces qui ont ouvert le partage (Profil › Portefeuille d’offre) sont lus, et seulement le verdict — jamais le compte, jamais le texte d’une précision. Les verdicts privés sont comptés, jamais lus.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    kpis: [
      kpiGrid(3, [
        kpiTile('Verdicts partagés', '—', { period: '— j' }),
        kpiTile('Espaces distincts', '—'),
        kpiTile('Verdicts restés privés', '—'),
      ]),
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Répartition des verdicts partagés' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Verdict', 'Nombre'],
                rows: [
                  ['Juste', '—'],
                  ['Partielle', '—'],
                  ['Fausse', '—'],
                  ['Incomplète', '—'],
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
            title: 'Aucun verdict partagé sur la fenêtre',
            description: 'La justesse de la première analyse n’est pas mesurée — ce n’est pas « 0 % juste ».',
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
          content: {
            title: 'Impossible de lire les verdicts de première preuve',
            description: 'Message technique renvoyé tel quel.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un espace qui n’a pas ouvert le partage (Profil › Portefeuille d’offre) n’apparaît dans AUCUN chiffre de cet écran — ni dans les verdicts partagés, ni comme une ligne à part : « verdicts restés privés » est un COMPTE agrégé, jamais un accès au détail d’un espace précis.',
      source: 'apps/dashboard-manager/src/app/produit/premiere-preuve/page.tsx:15',
    },
    {
      kind: 'decision',
      text: 'Sans aucun verdict partagé sur la fenêtre, l’écran affiche « non mesuré » — jamais « 0 % juste » (GA-18/19) : l’absence de preuve n’est pas une preuve d’absence.',
      source: 'apps/dashboard-manager/src/app/produit/premiere-preuve/page.tsx:17',
    },
    responsiveDecision(
      'la grille de 3 KPI garde ses trois colonnes (elle ne sature qu’à partir de 4) et le tableau de répartition GAGNE une marge de lecture plutôt que de s’étirer',
    ),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/ui/KpiTile.tsx:1'),
  ],
}
