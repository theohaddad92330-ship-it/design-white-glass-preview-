import type { PageSpec } from '../../types'

/**
 * /missions/facturation — ce qui EMPÊCHE de facturer ce mois, et un montant
 * indicatif PRÉPARÉ (jamais « émis », jamais un dû).
 *
 * Lu dans : `apps/web/src/routes/missions/facturation.tsx` →
 * `InvoicingPage.tsx` (bandeau permanent) → `InvoiceReadinessPanel.tsx`
 * (tuiles, recherche, mois, statut CRA, bulk, tableau). Textes de
 * `apps/web/src/i18n/locales/fr/missions.json` (`invoicing`, `readiness`).
 */
export const missionsFacturationPage: PageSpec = {
  id: 'app/missions-facturation',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/facturation.tsx',
  title: 'Facturation',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Facturation', style: 'title' },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            description:
              'Bellum n’émet aucune facture. Cet écran dit ce qui EMPÊCHE de facturer, et prépare un montant indicatif — ni un dû, ni une facture.',
          },
        },
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un freelance, client, facture…' } },
          },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Mois' } } },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { label: 'Statut CRA' } } },
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Mission : Migration ERP S/4HANA'] },
          },
        ],
      },
    ],
    kpis: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Facture manquante', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'À envoyer', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'CRA bloqué', value: '—' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'CRA manquants' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Actualiser' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Mission', 'Client', 'Période', 'Montant TTC', 'Statut CRA', 'Statut facture / Action'],
            rows: [
              ['Mission exemple 1', 'Compte exemple 1', '—', 'non chiffré', 'À valider', 'Bloqué'],
              ['Mission exemple 2', 'Compte exemple 2', '—', '—', 'Validé', 'Prêt'],
            ],
          },
        },
      },
    ],
    bulk: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Relancer la saisie/validation CRA' } },
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
            title: 'Rien à surveiller sur ce mois.',
            description:
              'Aucune mission ne couvre ce mois : elles se sont terminées avant, n’ont pas encore commencé, ou sont encore en brouillon.',
            action: 'Ouvrir les missions',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'L’état de facturation n’a pas pu être chargé.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le montant préparé est explicitement PRÉPARATOIRE (« Bellum n’émet aucune facture »), jamais « facturé » — le mot ne se gagne que sur preuve du connecteur de l’outil branché par le client.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:429',
    },
    {
      kind: 'decision',
      text: 'Un mois sans montant chiffré se compte à part (« N non chiffrés »), jamais fondu dans le montant préparé — un total qui les absorberait se lirait complet à tort.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:427',
    },
    {
      kind: 'ecart',
      text: 'La clé de traduction `readiness.tiles.notMeasured` (« Non mesuré ») n’a aucun appelant : le commentaire du composant dit explicitement « trois tuiles, jamais quatre » — la maquette n’en dessine donc que trois, la quatrième reste un texte mort.',
      source: 'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:441',
    },
    {
      kind: 'decision',
      text: '« Relancer la saisie/validation CRA » (`bulk`) porte le COMPTE de la sélection dans son propre libellé (« Relancer (3) ») et se désactive quand rien de relançable n’est coché — jamais un bouton actif sur une sélection vide.',
      source: 'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:416',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois tuiles et les filtres (recherche, mois, statut CRA) passent à la ligne (`flex-wrap gap-2`) sous 768 px plutôt que de suivre une grille à paliers — pas de perte d’information, juste plus de lignes. Au-delà de 1920 (2560/3440) : aucun gain, ni quatrième tuile ni panneau de détail à côté de la table.',
      source: 'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:442',
    },
    {
      kind: 'decision',
      text: 'RUX-35 (`docs/revue-ux.md` §4, priorité haute) : ouvert depuis la chaîne de livraison d’un dossier de mission (`?mission=<id>`), cet écran arrive filtré, une pastille retirable « Mission : <nom> » dans la `FilterBar` — jamais la liste complète des factures à retrier soi-même.',
      source: 'apps/web/src/features/missions/chain/missionChain.ts:129',
    },
  ],
}
