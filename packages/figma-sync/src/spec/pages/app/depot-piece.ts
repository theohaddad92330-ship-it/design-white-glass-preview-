import type { PageSpec } from '../../types'

/**
 * /depot-piece/$token — lien PUBLIC, sans compte, qu'un contact externe
 * (client, partenaire) ouvre pour DÉPOSER une pièce de contrat (#2422.6,
 * épopée #2869, lot R24). Dépôt seulement : aucune lecture des autres pièces.
 * Même patron que `/share/$slug` (route anonyme, pas de shell applicatif).
 *
 * Lu dans : `apps/web/src/routes/depot-piece.$token.tsx` →
 * `PublicContractUploadPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/contractUpload.json`.
 */
export const depotPiecePage: PageSpec = {
  id: 'app/depot-piece',
  surface: 'app',
  domain: 'depot-piece',
  route: 'apps/web/src/routes/depot-piece.$token.tsx',
  title: 'Dépôt d’une pièce',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Dépôt d’une pièce — Compte exemple', style: 'title' },
      { type: 'text', text: 'Contrat : Contrat exemple', style: 'caption', color: 'text/muted' },
      { type: 'text', text: 'Mission concernée : Mission exemple', style: 'caption', color: 'text/muted' },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Pièce à déposer' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Choisir un fichier' } },
          },
          { type: 'component', component: 'Button', props: { content: { label: 'Déposer la pièce' } } },
          { type: 'text', text: 'Formats acceptés : —', style: 'caption', color: 'text/muted' },
        ],
      },
    ],
    footer: [{ type: 'component', component: 'BrandMark', props: { size: 'sm' } }],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Ce lien n’est plus valide',
            description: 'Il a peut-être expiré ou été révoqué. Demande un nouveau lien à ton contact.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Dépôt SEULEMENT : la page ne montre ni ne permet de lire les autres pièces du contrat ; la réponse publique du lien ne les porte pas. Chargement et lien invalide affichent la marque du produit, jamais celle d’un espace.',
      source: 'apps/web/src/features/contract-upload/view/PublicContractUploadPage.tsx:60',
    },
  ],
}
