import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /verite-terrain — l'outillage de vérité terrain de la mémoire marché : 20
 * comptes connus, 10 ESN connues, 5-10 consultants réels jugés à la main.
 * Construit MÊME SI le corpus reste vide au premier déploiement — une mesure
 * impossible ne dit jamais « tout va bien » (GA-285).
 *
 * Lu dans : `apps/dashboard-manager/src/app/verite-terrain/page.tsx` →
 * `verite-terrain.logic.ts`, `_components/judge-form.tsx`.
 */
export const dmVeriteTerrainPage: PageSpec = {
  id: 'dm/verite-terrain',
  surface: 'dm',
  domain: 'verite-terrain',
  route: 'apps/dashboard-manager/src/app/verite-terrain/page.tsx',
  title: 'Vérité terrain — mémoire marché',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Vérité terrain — mémoire marché', style: 'title' },
      {
        type: 'text',
        text: '20 comptes connus, 10 ESN connues, 5-10 consultants réels — jugés à la main. Sous 20 jugements courants, une métrique ne s’affiche jamais en pourcentage.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      kpiGrid(3, [
        kpiTile('Précision @3', 'non mesuré'),
        kpiTile('Précision @10', 'non mesuré'),
        kpiTile('Taux de faux positifs', 'non mesuré'),
        kpiTile('Couverture', 'non mesuré'),
        kpiTile('Échec de résolution d’entité', 'non mesuré'),
        kpiTile('Utilité humaine', 'non mesuré'),
      ]),
    ],
    primary: [
      sectionCard('Juger un cas', [
        {
          type: 'text',
          text: 'Une ESN, un compte, la lecture de la mémoire marché, un verdict.',
          style: 'caption',
          color: 'text/secondary',
        },
        {
          type: 'grid',
          columns: 2,
          gap: '4',
          children: [
            {
              type: 'component',
              component: 'Select',
              props: { size: 'sm', content: { label: 'ESN' }, items: ['ESN exemple'] },
            },
            {
              type: 'component',
              component: 'Select',
              props: { size: 'sm', content: { label: 'Compte' }, items: ['Compte exemple'] },
            },
          ],
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'default', content: { label: 'Enregistrer le verdict' } },
        },
      ]),
      sectionCard('Jugements courants', [
        { type: 'text', text: '— cas jugé(s)', style: 'caption', color: 'text/muted' },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Compte', 'ESN', 'Lecture', 'Verdict', 'Jugé par'],
              rows: [['—', '—', 'non observée', '—', '—']],
            },
          },
        },
      ]),
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun cas jugé pour l’instant' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de joindre l’endpoint admin de l’API' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les six tuiles s’affichent très probablement toutes « non mesuré » au premier déploiement — c’est la VÉRITÉ du corpus, pas un défaut d’affichage.',
      source: 'apps/dashboard-manager/src/app/verite-terrain/page.tsx:24',
    },
    {
      kind: 'decision',
      text: '« 0 cas jugé(s) » pendant le chargement serait un zéro de CHARGEMENT lu comme un zéro de MESURE : tant que la liste n’est pas revenue, rien n’est compté — une liste revenue VIDE, elle, dit bien zéro.',
      source: 'apps/dashboard-manager/src/app/verite-terrain/page.tsx:102',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/verite-terrain/page.tsx:71'),
  ],
}
