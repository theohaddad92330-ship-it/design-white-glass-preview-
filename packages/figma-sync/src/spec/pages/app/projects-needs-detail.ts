import type { PageSpec } from '../../types'

/**
 * /projects/needs/$needId — la fiche d’un besoin (l’objet qui n’avait pas de
 * fiche : seulement une liste, un kanban et un tiroir de matching). Verdict
 * go/no-go sur six axes, comparaison de TJM, quatre familles d’onglets.
 *
 * Lu dans : `apps/web/src/routes/projects/needs_.$needId.tsx` →
 * `NeedDetailPage.tsx` (entête, `ChainProgressBlock`, `NeedRateComparison`,
 * `NeedVerdictBanner`, quatre familles). Textes de
 * `apps/web/src/i18n/locales/fr/projects.json` (`needSheet.*`).
 */
export const projectsNeedsDetailPage: PageSpec = {
  id: 'app/projects-needs-detail',
  surface: 'app',
  domain: 'projects',
  route: 'apps/web/src/routes/projects/needs_.$needId.tsx',
  title: 'Fiche du besoin',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux besoins' } },
      },
      { type: 'text', text: 'Besoin exemple — DevOps confirmé', style: 'title' },
      { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Urgence haute' } } },
      { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Ouvert' } } },
      {
        type: 'text',
        text: 'Compte exemple · Sur l’affaire « Affaire exemple »',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Lancer le matching' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Je connais quelqu’un' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Prioriser' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'secondary', size: 'sm', content: { label: 'Partager' } },
      },
    ],
    summary: [
      {
        type: 'placeholder',
        kind: 'custom',
        label: 'Progression du parcours de staffing (étapes dérivées, aucune écriture depuis ce bloc)',
        height: 'sm',
      },
      {
        type: 'component',
        component: 'DataRow',
        props: { content: { label: 'TJM demandé vs positionné', value: '—' } },
      },
    ],
    tabs: [
      {
        type: 'component',
        component: 'TabNav',
        props: {
          variant: 'underline',
          items: ['Synthèse', 'Profils & positionnements', 'Avancement', 'Documents & historique'],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: {
          content: {
            title: 'Aller / ne pas aller',
            description: 'Six axes évalués, ce qui n’a pas pu être évalué reste nommé.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Compétence', value: 'Couverte' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Disponibilité',
                    value: 'Non mesuré — aucun consultant marqué disponible sur la période',
                  },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '4',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            grow: true,
            children: [
              {
                type: 'placeholder',
                kind: 'custom',
                label: 'Bandeau de staffing (progression synthétique, NeedStaffingBanner)',
                height: 'sm',
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: {
              content: { title: 'Laura recommande', description: 'Sur les besoins comparables de cette affaire.' },
            },
            children: [
              {
                type: 'text',
                text: '3 profils à présenter côté BellumAI pour maximiser tes chances.',
                style: 'body',
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Taux de réussite mesuré',
                    value: '62 % — historique des besoins comparables de cette affaire',
                  },
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'secondary', size: 'sm', content: { label: 'Voir les profils' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Le poste' } },
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Responsable', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Interlocuteur', value: '—' } } },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Je n’ai pas pu charger ce besoin.',
            description: 'La lecture a échoué — ce n’est pas que le besoin n’existe pas. Réessaie.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le verdict go/no-go ne rend AUCUN nombre agrégé (aucune probabilité de closing) : six axes, trois issues possibles, et son dénominateur affiché — revirement du 31/08/2026 sur `c26_probabilite`. Il PROPOSE, la porte de décision reste la seule qui tranche, et son franchissement est journalisé.',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx:411',
    },
    {
      kind: 'decision',
      text: 'Le badge d’urgence ne s’affiche QUE si quelqu’un l’a dite : un « normale » par défaut ferait passer pour un arbitrage ce qui n’est qu’une absence de réponse (GA-18/19).',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx:322',
    },
    {
      kind: 'decision',
      text: 'Les six anciens onglets (overview, matching, positioning, activity, documents, history) restent des valeurs valides de `?tab=` — un lien déjà collé continue d’ouvrir la bonne famille — mais la barre visible ne montre plus que quatre familles regroupées (GA-26 : une seule table de correspondance).',
      source: 'apps/web/src/features/projects/open-needs/model/need-detail-tabs.ts:1',
    },
    {
      kind: 'decision',
      text: '« Je connais quelqu’un » et le rapprochement inversé (comptes voisins cherchant la même compétence) ne s’affichent QUE quand personne n’est encore positionné (`shortlist_count === 0`) : un besoin qui porte déjà trois profils n’a pas besoin qu’on lui en propose un quatrième par ce chemin.',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx:350',
    },
    {
      kind: 'decision',
      text: 'Responsive : l’entête empile ses actions sous 640 px et les aligne en ligne au-delà ; le bloc « Aller / ne pas aller » et « Laura recommande » passent d’une colonne à `lg:grid-cols-3` (2/3 + 1/3) à partir de 1024 px — tablette (768-1194) reste en 1 colonne. Au-delà de 1920 px (2560, 3440) : les onglets, le verdict et les cartes de section gardent leur largeur de lecture de fiche (D81) ; la page GAGNE une deuxième colonne pour « Le poste » / « Le suivi » côte à côte au lieu d’empilées, jamais un étirement du texte du verdict.',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx:426',
    },
    {
      kind: 'decision',
      text: 'La carte « Laura recommande » n’affiche AUCUN taux de réussite : aucune probabilité n’est montrée (`c26_probabilite`, #3486 du 01/10/2026 — l’exception du 31/08 est retirée).',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailRecommendation.tsx:13',
    },
    {
      kind: 'decision',
      text: 'RUX-29/#2613 (docs/revue-ux.md T15) : « Disponibilité — non mesuré » n’est plus une PASTILLE (une pastille sans valeur n’existe pas) mais une ligne d’axe nommée, comme un score garde ses axes — cohérent avec la description de cette carte (« ce qui n’a pas pu être évalué reste nommé »).',
      source: 'apps/web/src/features/projects/open-needs/view/NeedDetailPage.tsx:411',
    },
  ],
}
