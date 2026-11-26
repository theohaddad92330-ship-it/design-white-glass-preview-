import type { PageSpec } from '../../types'

/**
 * /consultants/:id — la fiche d'un talent (PDF 3 §7). Dix onglets, plus un
 * onzième « Revue du CV » tant que la fiche n'a pas été relue (le geste qui
 * transforme un niveau « inconnu » en évaluation).
 *
 * Lu dans : `apps/web/src/routes/consultants/$id.tsx` → `TalentDetailPage.tsx`
 * (retour, entête, bandeaux consentement/archivage, dix onglets). Textes de
 * `apps/web/src/i18n/locales/fr/consultants.json` (`detail`).
 */
export const consultantDetailPage: PageSpec = {
  id: 'app/consultant-detail',
  surface: 'app',
  domain: 'consultants',
  route: 'apps/web/src/routes/consultants/$id.tsx',
  title: 'Fiche talent',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour au vivier' } },
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
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'EntityAvatar',
                props: { size: 'lg', content: { name: 'TE' } },
              },
              { type: 'text', text: 'Talent exemple', style: 'title' },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Consultant' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Modifier' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Archiver' } },
              },
            ],
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
            'Profil',
            'Compétences',
            'Documents',
            'Dossier',
            'Disponibilité & TJM',
            'Positionnements',
            'Missions',
            'Notes',
            'Consentement',
            'Identité',
          ],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Identité et contact' } },
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Email', value: 'Non renseigné' } } },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Téléphone', value: 'Non renseigné' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Engagement et tarif' } },
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'TJM cible', value: 'TJM non renseigné' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Cadre contractuel', value: 'Cadre à préciser' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Couverture et langues' } },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Habilitations et envie' } },
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
            title: 'Fiche indisponible',
            description:
              'Impossible de charger cette fiche. Elle a peut-être été supprimée, ou la requête n’a pas abouti.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’onglet « Revue du CV » n’apparaît QUE tant que la fiche n’a pas été relue — le proposer sur une fiche déjà validée inviterait à repayer un appel de modèle pour rien.',
      source: 'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx:150',
    },
    {
      kind: 'decision',
      text: 'Le rapprochement inverse (« Où placer ce profil ») MÈNE à l’onglet « Disponibilité & TJM », il n’en ouvre pas une copie — deux panneaux de rapprochement donneraient deux verdicts.',
      source: 'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx:252',
    },
    {
      kind: 'decision',
      text: 'Le titre de la fiche n’affiche jamais le nom du FICHIER déposé comme une identité — « Nom non renseigné » plutôt qu’un nom de PDF, même quand `full_name` a été rempli par défaut avec lui.',
      source: 'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx:194',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, les 10 (11 avec Revue) onglets défilent horizontalement au lieu de se répartir en largeur égale ; l’entête empile nom/badge au-dessus des actions (`flex-wrap`). De 768 à 1194 px, même disposition. Au-delà de 1920 (2560/3440) : aucun panneau latéral supplémentaire — la fiche reste en une seule colonne, sans maître-détail avec la liste du vivier.',
      source: 'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx:280',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : le chargement dessinait un texte brut plutôt qu’un `Skeleton` à la forme du contenu — trois composants d’état, pas un de plus, sur les trois surfaces ; `Loader2` en dur est interdit.',
      source: 'apps/web/src/features/consultants/view/detail/TalentDetailPage.tsx:1',
    },
  ],
}
