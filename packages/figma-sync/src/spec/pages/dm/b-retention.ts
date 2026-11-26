import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /retention — la rétention par COHORTE MENSUELLE D'ESPACES (jamais par
 * personne) : chaque ligne un mois d'inscription, chaque colonne un mois de
 * vie de la cohorte. Trois états qui ne disent pas la même chose : illisible
 * (panne API), aucune cohorte (fait réel), cohortes masquées (existent, trop
 * petites pour être nommées sans désigner leurs membres).
 *
 * Lu dans : `apps/dashboard-manager/src/app/retention/page.tsx` →
 * `@/app/_components/charts` (`CohortGrid`).
 */
export const dmRetentionPage: PageSpec = {
  id: 'dm/retention',
  surface: 'dm',
  domain: 'retention',
  route: 'apps/dashboard-manager/src/app/retention/page.tsx',
  title: 'Rétention par cohorte',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Rétention par cohorte', style: 'title' },
      {
        type: 'text',
        text: 'Chaque ligne est un mois d’inscription, chaque colonne un mois de vie de la cohorte. Une case dit la part d’espaces qui ont validé au moins une action ce mois-là — se connecter ne compte pas.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      sectionCard(
        'Usage après inscription',
        [kpiGrid(2, [kpiTile('Usage à J+7', '—'), kpiTile('Usage à J+30', '—')])],
        'Autre grandeur que la grille ci-dessous : l’unité est l’INSCRIPTION, pas l’espace. Les deux chiffres ne se comparent pas entre eux.',
      ),
      kpiGrid(3, [
        kpiTile('Espaces suivis', '—'),
        kpiTile('Cohortes', '—', { period: 'dont — masquée(s)' }),
        kpiTile('Jamais aucune action validée', '—', {
          period: 'comptés dans les dénominateurs, absents des numérateurs',
        }),
      ]),
    ],
    primary: [
      {
        type: 'component',
        component: 'CohortGrid',
        props: { data: 'partial', content: { period: 'Mois d’inscription', asOf: '—' } },
      },
      sectionCard('Cohortes masquées', [
        {
          type: 'text',
          text: 'Sous le seuil d’espaces, un taux de rétention désignerait ses membres : nommées ici sans être affichées.',
          style: 'caption',
          color: 'text/secondary',
        },
      ]),
      {
        type: 'text',
        text: 'La dernière case de chaque ligne porte un mois EN COURS : elle ne peut que monter. Une case au-delà est vide parce que le mois n’a pas eu lieu — ce n’est pas une rétention de zéro.',
        style: 'caption',
        color: 'text/muted',
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
            title: 'Aucun espace client dans la base',
            description: 'Les espaces de démonstration sont exclus du calcul.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire la rétention' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une panne de lecture ne rend JAMAIS une grille vide (ce serait annoncer « aucun client ») : « illisible », « aucune cohorte » et « cohortes masquées » sont trois états distincts, chacun avec ses mots.',
      source: 'apps/dashboard-manager/src/app/retention/page.tsx:26',
    },
    {
      kind: 'decision',
      text: 'Deux routes indépendantes (usage après inscription, grille de cohortes) : la panne de l’une n’emporte jamais l’autre — un seul `try` autour des deux aurait fait de la page un tout-ou-rien.',
      source: 'apps/dashboard-manager/src/app/retention/page.tsx:48',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/retention/page.tsx:102'),
  ],
}
