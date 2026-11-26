import type { PageSpec } from '../../types'

/**
 * /missions/:id — le dossier d'une mission (D200, 30/08/2026). Même contenu
 * que le tiroir ouvert depuis `/missions` — `MissionDetailTabs`, un seul
 * composant pour les deux formes.
 *
 * Lu dans : `apps/web/src/routes/missions/$id.tsx` → `MissionDossierPage.tsx`
 * (entête, provenance des champs, prérequis de démarrage, chaîne de livraison,
 * cinq onglets) → `MissionDetailTabs.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/missions.json` (`dossier`, `overview`,
 * `staffing`, `finance`, `scores`, `history`, `startReadiness`, `chain`).
 */
export const missionDossierPage: PageSpec = {
  id: 'app/mission-dossier',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/$id.tsx',
  title: 'Dossier de mission',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux missions' } },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        justify: 'between',
        align: 'start',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              { type: 'text', text: 'Mission exemple', style: 'title' },
              { type: 'text', text: 'Compte exemple', style: 'body', color: 'text/secondary' },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'secondary', content: { label: 'En cours' } },
              },
              { type: 'component', component: 'Badge', props: { variant: 'secondary', content: { label: 'Régie' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Créer un projet' } },
              },
            ],
          },
        ],
      },
    ],
    summary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Client', value: 'source non renseignée' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Intitulé', value: 'source non renseignée' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Prête à démarrer ?' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Accord du client', value: 'Manquant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Accord du consultant', value: 'Manquant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Contrat ou bon de commande signé', value: 'Manquant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Consultant affecté', value: 'Confirmé' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Date de début', value: 'Confirmé' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'TJM', value: 'Confirmé' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Lieu et accès du premier jour', value: 'À revalider' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'De la signature au cash' } },
        children: [
          {
            type: 'component',
            component: 'Tabs',
            props: {
              items: ['Relevé d’activité', 'CA facturable', 'Facture préparée', 'Encaissement', 'Repositionnement'],
            },
          },
        ],
      },
    ],
    tabs: [
      {
        type: 'component',
        component: 'TabNav',
        props: {
          items: [
            'Synthèse',
            'Qui est dessus',
            'Conditions commerciales',
            'Risque & opportunité',
            'Historique du compte',
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
          { type: 'component', component: 'DataRow', props: { content: { label: 'Rôle cherché', value: '—' } } },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Nature du contrat', value: 'Régie' } },
          },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Démarrée le', value: '—' } } },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Fin prévue',
                value: 'Sans date de fin — aucune fenêtre de renouvellement ne s’y déclenche.',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Le pouls de la mission' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', content: { title: 'Pas encore d’avis' } },
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
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Cette mission n’a pas pu être chargée',
            description: 'Elle est toujours là — c’est la lecture qui a échoué. Réessaie.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le tiroir ouvert depuis /missions et cette page plein écran rendent le MÊME composant (`MissionDetailTabs`) : deux formes du même objet, jamais deux implémentations qui divergeraient (loi 4 du tome 7).',
      source: 'apps/web/src/features/missions/view/MissionDossierPage.tsx:33',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, les onglets (`TabNav`) défilent horizontalement au lieu de se répartir en largeur égale ; l’entête empile le bloc titre/compte au-dessus des badges (`flex-wrap`) plutôt que côte à côte. De 768 à 1194 px, même disposition qu’au-delà. Au-delà de 1920 (2560/3440) : aucun panneau latéral ne s’ajoute — la fiche reste une seule colonne pleine largeur, pas de maître-détail avec la liste.',
      source: 'apps/web/src/features/missions/view/MissionDossierPage.tsx:123',
    },
    {
      kind: 'ecart',
      text: 'Un champ jamais tracé côté serveur (client/intitulé/dates/TJM) ne rend AUCUNE ligne dans la provenance, plutôt qu’une ligne « source inconnue » — mesuré en prod le 23/09 sur 3 comptes où les cinq champs manquaient tous : la ligne entière disparaissait sans dire pourquoi.',
      source: 'apps/web/src/features/missions/view/MissionDossierPage.tsx:244',
    },
    {
      kind: 'decision',
      text: 'RUX-35 (`docs/revue-ux.md` §4, priorité haute) : chacun des cinq maillons de « De la signature au cash » (Relevé d’activité, CA facturable, Facture préparée, Encaissement, Repositionnement) s’ouvre filtré sur CETTE mission (`?mission=<id>`) — avant, la chaîne envoyait vers CRA, facturation et encaissements SANS filtre, le code l’avouait lui-même (`missionChain.ts:129-134`). C’est la friction la plus coûteuse du parcours finance.',
      source: 'apps/web/src/features/missions/chain/missionChain.ts:129',
    },
  ],
}
