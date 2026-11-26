import type { PageSpec } from '../../types'

/**
 * `/` — le Cockpit business du backoffice (#1646). Racine du DM : les six
 * tuiles MRR/clients/attrition/marge/burn/runway, la décomposition du mois et
 * la courbe 12 mois, la file de décision et la heatmap d'utilisation
 * (déplacées depuis `/monitoring`), les mouvements du dernier mois figé.
 *
 * Lu dans : `src/app/page.tsx` → `_components/cockpit-business-panel.tsx`
 * (+ `cockpit-business.logic.ts` pour la forme des tuiles).
 */
export const accueilPage: PageSpec = {
  id: 'dm/accueil',
  surface: 'dm',
  domain: 'cockpit',
  route: 'apps/dashboard-manager/src/app/page.tsx',
  title: 'Cockpit',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Cockpit', style: 'title' },
      {
        type: 'text',
        text: 'L’état business de BellumAI en un écran : MRR, marge, burn et runway, la décomposition du mois et douze mois de tendance, ce qui demande une décision, et quand le produit est utilisé.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 6,
        // Un montant en `display` (36 px) ne tient pas dans une demi-largeur de téléphone : une tuile par ligne.
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'MRR' } },
            children: [
              { type: 'text', text: '12 400 €', style: 'display' },
              { type: 'text', text: '+3,2 % vs mois dernier', style: 'caption', color: 'success/text' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Clients' } },
            children: [
              { type: 'text', text: '18', style: 'display' },
              { type: 'text', text: '+1 vs mois dernier', style: 'caption', color: 'success/text' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Attrition' } },
            children: [
              { type: 'text', text: '2,1 %', style: 'display' },
              { type: 'text', text: 'sur 3 mois glissants', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Marge' } },
            children: [
              { type: 'text', text: '68 %', style: 'display' },
              { type: 'text', text: 'sur 30 jours', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Burn' } },
            children: [
              { type: 'text', text: '4 100 €/mois', style: 'display' },
              { type: 'text', text: '-0,8 % vs mois dernier', style: 'caption', color: 'soft/danger/text' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Runway' } },
            children: [
              { type: 'text', text: '14 mois', style: 'display' },
              { type: 'text', text: 'au rythme de burn actuel', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'stack',
        direction: 'row',
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Décomposition du mois' } },
            children: [
              {
                type: 'placeholder',
                kind: 'chart',
                label: 'Waterfall MRR : nouveaux, expansion, contraction, perdus',
                height: 'md',
              },
              {
                type: 'text',
                text: 'Repli si aucun mois n’est figé : « Aucun mois figé — la décomposition apparaîtra au premier instantané, sur /revenus. »',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Douze mois de MRR' } },
            children: [
              { type: 'placeholder', kind: 'chart', label: 'Courbe multi-séries MRR sur 12 mois', height: 'md' },
              {
                type: 'text',
                text: 'Repli si la série est vide : « Aucun mois figé — la série commencera au premier instantané, sur /revenus. »',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
        ],
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce qui demande une décision' } },
        children: [
          {
            type: 'placeholder',
            kind: 'custom',
            label: 'File de décision — un item par anomalie à trancher',
            height: 'md',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Volume d’analyses' } },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Heatmap des lancements d’analyse par jour', height: 'md' },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Mouvements du mois' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Client', 'Type', 'Montant', 'Date'],
                rows: [
                  ['Synaltic Group', 'Nouveau', '+490 €/mois', '22/09/2026'],
                  ['Cassiopée Digital', 'Expansion', '+180 €/mois', '17/09/2026'],
                  ['Ekitia Systems', 'Contraction', '−90 €/mois', '11/09/2026'],
                  ['Arion Technologies', 'Attrition', '−340 €/mois', '04/09/2026'],
                  ['Nextedia Conseil', 'Nouveau', '+290 €/mois', '02/09/2026'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: 'Le tableau est REMPLACÉ par un message, jamais laissé vide sans raison — quatre issues distinctes, jamais confondues : panne de l’API, « Mouvements indisponibles — l’API n’a pas répondu. » (+ détail de l’erreur) · aucun mois jamais figé, « Aucun mois figé — le tableau des mouvements apparaîtra au premier instantané, sur /revenus. » · premier mois figé de la série (rien à comparer), « Premier mois figé de la série : aucun mois précédent pour comparer, donc aucun mouvement n’est mesurable ce mois-ci. » · mois mesuré sans mouvement, « Aucun mouvement mesuré ce mois-ci — aucun client parti, arrivé ou dont l’offre a changé. »',
            style: 'caption',
            color: 'text/muted',
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
            title: 'Aucun mois figé',
            description: 'La décomposition et la série 12 mois apparaîtront au premier instantané, sur /revenus.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Indicateurs business indisponibles', description: 'L’API n’a pas répondu.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les six tuiles financières (MRR, clients, attrition, marge, burn, runway) sont fermées au rôle « propriétaire », comme /revenus et /revenus/tresorerie (`treasury.read`) : un operator/viewer voit la file de décision et la heatmap, pas les chiffres. La maquette montre la vue propriétaire ; un `uxNote` de décision plutôt qu’un second état, la restriction étant déjà portée par `ECRANS_PROPRIETAIRE`.',
      source: 'apps/dashboard-manager/src/app/_components/cockpit-business-panel.tsx:128',
    },
    {
      kind: 'ecart',
      text: 'La file de décision et la heatmap sont rendues DEUX FOIS dans le code : ici, et dans `monitoring/_components/cockpit-panel.tsx` (`/monitoring?view=cockpit`), qui reste le lien permanent du rail latéral. Le doublon est documenté comme volontaire le temps qu’un intégrateur retire l’ancien rendu — la maquette n’en garde qu’un.',
      source: 'apps/dashboard-manager/src/app/_components/cockpit-business-panel.tsx:50',
    },
    {
      kind: 'ecart',
      text: 'Aucun `loading.tsx` : la page est servie en SSR bloquant, il n’y a pas d’état de chargement observable à l’écran. L’état « chargement » de la maquette est projeté par gabarit, pas observé.',
      source: 'apps/dashboard-manager/src/app/page.tsx:51',
    },
    {
      kind: 'decision',
      text: 'Pas d’équivalent catalogue pour une tuile KPI avec delta (`KpiTile` + `Delta` du DM) : rendue ici en `Card` + deux `text` (valeur, variation). À ajouter au catalogue si d’autres backoffices en ont besoin.',
      source: 'apps/dashboard-manager/src/ui/KpiTile.tsx:1',
    },
    {
      kind: 'decision',
      text: 'Responsive : les six tuiles utilisent un `auto-fit`/`minmax(180px, 1fr)` qui redistribue déjà de 6 à moins de colonnes sous 1280 sans media query dédiée ; le contenu reste borné à 1600 px sur 1920 (`.wrap`), jamais étiré. Au-delà (2560, 3440) le cockpit gagnerait un troisième graphique (répartition par segment) ou un panneau maître-détail sur les mouvements du mois, plutôt que d’étirer les tuiles existantes.',
      source: 'apps/dashboard-manager/src/app/_components/cockpit-business.module.css:15',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM (vérifié sur tout `src/`) : au-delà de 1920, `.wrap` plafonne simplement le contenu à 1600 px — pas de 3ᵉ graphique, pas de panneau supplémentaire aujourd’hui. La maquette décrit une cible, pas un comportement observé.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
    {
      kind: 'decision',
      text: '« Mouvements du mois » a trois refus MESURÉS, jamais confondus (`messageMouvementsVides`) : aucun mois jamais figé, premier mois figé de la série (rien à comparer), et mois mesuré sans mouvement — chacun sa phrase, pour ne pas faire dire « rien à signaler » à un mois qui n’a simplement jamais été comparé. La maquette n’en garde que le tableau rempli, avec les trois phrases (+ la panne API, distincte) en note adjacente.',
      source: 'apps/dashboard-manager/src/app/_components/cockpit-business.logic.ts:223',
    },
    {
      kind: 'decision',
      text: 'Le waterfall et la courbe 12 mois ont chacun leur propre repli textuel (pas un composant `EmptyState` partagé) quand aucun mois n’est figé ou que la série est vide — deux phrases distinctes, l’une pour la décomposition, l’autre pour la série, notées en `caption` sous chaque graphe plutôt que jouées comme un second état de page.',
      source: 'apps/dashboard-manager/src/app/_components/cockpit-business-panel.tsx:165',
    },
  ],
}
