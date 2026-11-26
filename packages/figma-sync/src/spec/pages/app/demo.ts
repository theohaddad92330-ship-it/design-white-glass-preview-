import type { PageSpec } from '../../types'

/**
 * /demo — landing du lien de démo PARTAGÉ (#2705) : un visiteur sans compte ni
 * session clique un lien nu envoyé dans un message. La page OUVRE SUR UNE
 * EXPLICATION (pas une redemption automatique) — l'échange se fait au clic,
 * jamais au chargement, pour ne pas consommer une place de la réserve bornée
 * à chaque prévisualisation de lien (Slack, LinkedIn, un scanner de mail).
 *
 * Aucun gabarit n'était nommé pour cette route dans le périmètre du lot ; elle
 * partage le même panneau de marque que `/login` (`AuthBrandingPanel`), donc
 * `auth` est le gabarit le plus proche du code réel.
 *
 * Lu dans : `apps/web/src/routes/demo.tsx` → `DemoEntryPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/common.json` (clé `demo.entry`).
 */
export const demoPage: PageSpec = {
  id: 'app/demo',
  surface: 'app',
  domain: 'auth',
  route: 'apps/web/src/routes/demo.tsx',
  title: 'Démo BellumAI',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    brand: [
      { type: 'component', component: 'BrandMark', props: { size: 'lg' } },
      { type: 'text', text: 'Priorise les bons comptes, puis passe à l’action.', style: 'display' },
    ],
    primary: [
      { type: 'text', text: 'Tu es sur la démo de BellumAI', style: 'title' },
      {
        type: 'text',
        text: 'Les dossiers que tu vas ouvrir portent sur de VRAIES entreprises, construits à partir d’informations publiques. Un seul compte est fictif — celui qui porte les missions et la facturation — et son nom le dit. Explore librement.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Cinq dossiers de conquête complets : signaux, entités du groupe, plan d’action.',
                value: '',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Les décideurs, leur organigramme et leurs coordonnées enrichies.', value: '' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Les messages d’approche prêts à envoyer, et Laura pour t’aider.', value: '' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'Aucun crédit consommé, aucune analyse relancée, aucun compte à créer.',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Lancer la démo' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Aller à la connexion' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Lien de démo invalide',
            description: 'Ce lien n’est plus valide. Demande un nouveau lien à ton interlocuteur BellumAI.',
          },
        },
      },
      { type: 'component', component: 'Button', props: { content: { label: 'Réessayer' } } },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le succès termine par un CHARGEMENT DE PAGE COMPLET, jamais une navigation client : l’application démarre exactement comme pour un utilisateur qui revient, plutôt que de faire porter à cet écran la charge d’amorcer correctement l’état client.',
      source: 'apps/web/src/features/demo/view/DemoEntryPage.tsx:29',
    },
    {
      kind: 'decision',
      text: 'Un visiteur déjà connu (cookie `bellum_did` porteur d’un lead, #2705.6) entre directement dans la démo ; un visiteur inconnu est renvoyé vers un formulaire d’accès obligatoire (`/demo/acces`, hors périmètre de ce lot) — jamais la démo sans savoir qui la regarde.',
      source: 'apps/web/src/features/demo/view/DemoEntryPage.tsx:44',
    },
    {
      kind: 'ecart',
      text: 'Aucun gabarit n’était assigné à cette route par le brief de ce lot — choix `auth` motivé par la réutilisation réelle d’`AuthBrandingPanel`, identique à `/login`. Un autre lot pourrait légitimement choisir `marketing`.',
      source: 'apps/web/src/features/demo/view/DemoEntryPage.tsx:34',
    },
    {
      kind: 'decision',
      text: 'Responsive : comme `/login`, le panneau de marque est masqué sous 1024 px (`lg:grid-cols-2`), pas 768 px. Au-delà de 1920 (2560, 3440), on n’étire jamais la carte d’explication (`max-w-md` implicite du panneau) : la maquette cible plus d’espace de respiration autour, jamais un texte d’intro à pleine largeur.',
      source: 'apps/web/src/features/demo/view/DemoEntryPage.tsx:104',
    },
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : `BrailleLoader` est réservé à l’attente longue d’une analyse et nulle part ailleurs — préparer un espace de démonstration est rapide, l’écran dessine désormais `Skeleton`.',
      source: 'apps/web/src/features/demo/view/DemoEntryPage.tsx:1',
    },
  ],
}
