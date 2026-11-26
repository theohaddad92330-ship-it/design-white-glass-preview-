import type { Block, PageSpec } from '../../types'
import {
  HEADER_BREAKPOINT_NOTE,
  pricingPlansSection,
  TOKENS_THEME_NOTE,
  responsiveNote,
  SITE_FOOTER,
  SITE_NAV,
} from './shared'

/**
 * /pricing — les tarifs. Cinq sections dans l'ordre réel de
 * `apps/website/src/app/[locale]/pricing/page.tsx:28-40` : Hero, Plans,
 * Crédits, FAQ, CTA. Textes FR : `apps/website/messages/fr/pricing.json`.
 */

const kicker = (text: string): Block => ({ type: 'text', text, style: 'label', color: 'text/accent' })

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  align: 'center',
  padding: '10',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Tarifs' } } },
    { type: 'text', text: 'Une seule unité : le crédit.', style: 'display' },
    { type: 'text', text: 'Une analyse de compte coûte 8 crédits, tout le reste est inclus.', style: 'title' },
    {
      type: 'text',
      text: "Un dossier complet en coûte 8, l'actualiser 4, enrichir un contact 1. Le copilote, les exports, la veille quotidienne et le partage ne coûtent rien de plus.",
      style: 'body',
      color: 'text/secondary',
    },
  ],
}

const plans: Block[] = [
  ...pricingPlansSection(),
  {
    type: 'grid',
    columns: 4,
    columnsMobile: 1,
    gap: '3',
    children: [
      'Le crédit paie ce qui coûte à produire : 8 pour une analyse de compte complète, 4 pour une actualisation, 1 pour un enrichissement de contact.',
      'Crédits non utilisés reportables sur 30 jours.',
      'Facturation annuelle : −20 %.',
      'Besoin d’un périmètre sur mesure ? Contactez-nous.',
    ].map((t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/secondary' })),
  },
  {
    type: 'text',
    text: "BellumAI aide les ESN à remplacer ou réduire l'usage d'outils dispersés de prospection, recherche de comptes, enrichissement, copilote commercial, suivi d'actions et export CRM.",
    style: 'caption',
    color: 'text/muted',
  },
  {
    type: 'stack',
    direction: 'row',
    gap: '2',
    align: 'center',
    children: [
      {
        type: 'text',
        text: "Besoin d'un déploiement Enterprise (sur devis) ?",
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Parler à notre équipe' } },
      },
    ],
  },
]

const credits: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Crédits'),
    { type: 'text', text: 'Ce que coûte chaque action.', style: 'title' },
    {
      type: 'text',
      text: "Pas de seconde monnaie, pas de micro-facturation. Le prix est annoncé avant le clic, et rien n'est débité quand rien n'est trouvé.",
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'component',
      component: 'Table',
      props: {
        table: {
          columns: ['Action', 'Coût', 'Règle'],
          rows: [
            [
              'Analyse de compte complète',
              '8 crédits',
              "Le dossier entier : entités du groupe, signaux d'achat, contacts, organigramme et plan d'action.",
            ],
            [
              "Actualisation d'un dossier",
              '4 crédits',
              'Tout le dossier est repris. Une seule dimension coûte 1 crédit.',
            ],
            ["Enrichissement d'un contact", '1 crédit', 'Email et téléphone professionnels. Rien trouvé, rien débité.'],
            [
              'Copilote IA & messages',
              'Inclus · 0 crédit',
              'Poser une question ou préparer un message ne coûte aucun crédit.',
            ],
            [
              'Exports PDF / CSV & partage',
              'Inclus · 0 crédit',
              'Partagez vos dossiers librement, en interne comme avec un client.',
            ],
            [
              'Veille quotidienne',
              'Inclus · 0 crédit',
              'Vos comptes suivis sont réanalysés chaque jour, sans toucher à vos crédits.',
            ],
          ],
        },
      },
    },
  ],
}

const faq: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Questions fréquentes'),
    { type: 'text', text: "Tout ce qu'il faut savoir.", style: 'title' },
    {
      type: 'stack',
      direction: 'column',
      gap: '4',
      children: [
        [
          "Puis-je voir le produit avant de m'abonner ?",
          'Oui. On vous le montre en démo, sur un compte réel de votre choix, avant toute décision.',
        ],
        [
          'Qu’est-ce qui consomme des crédits ?',
          'Ce qui coûte à produire : analyser un compte (8), actualiser un dossier (4, ou 1 pour une seule dimension) et enrichir un contact (1). Le reste est inclus.',
        ],
        [
          "Puis-je changer d'offre à tout moment ?",
          'Oui. Growth est sans engagement et résiliable à tout moment. La facturation annuelle fait économiser 20 %.',
        ],
        [
          'Quelle est la différence entre les offres ?',
          'Free est la démonstration. Growth, le produit entier pour un commercial. Entreprise commence au deuxième utilisateur, sur devis.',
        ],
      ].map(
        ([q, a]): Block => ({
          type: 'stack',
          direction: 'column',
          gap: '1',
          children: [
            { type: 'text', text: q as string, style: 'heading' },
            { type: 'text', text: a as string, style: 'body', color: 'text/secondary' },
          ],
        }),
      ),
    },
  ],
}

const cta: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '4',
    align: 'center',
    padding: '10',
    children: [
      { type: 'text', text: 'Voyez ce que Bellum trouve sur vos comptes.', style: 'title' },
      {
        type: 'text',
        text: 'Créez votre compte, ou essayez la démo sur un compte réel.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Créer mon compte' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Essayer la démo' } },
          },
        ],
      },
    ],
  },
]

export const pricingPage: PageSpec = {
  id: 'site/pricing',
  surface: 'site',
  domain: 'tarifs',
  route: 'apps/website/src/app/[locale]/pricing/page.tsx',
  title: 'Tarifs',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [...plans, credits, faq],
    cta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'Les cartes de forfaits (Free, Growth, Entreprise) passent de 3 colonnes à 2 sous 1280 px puis 1 seule sous 768 px — jamais un tableau qui déborde.',
      'apps/website/src/features/pricing/PricingPlans.tsx:262',
    ),
    {
      kind: 'ecart',
      text: 'RUX-30 (docs/revue-ux.md T16) : le code garde une grille à QUATRE colonnes (`xl:grid-cols-4`) pour trois forfaits — un quatrième emplacement reste vide à partir de 1280 px.',
      source: 'apps/website/src/features/pricing/PricingPlans.tsx:262',
    },
    {
      kind: 'decision',
      text: 'RUX-30 (docs/revue-ux.md T16, addenda au Top 20) : `CONTENT_MAX` = 1600 px, centré ; au-delà on AJOUTE de l’usage, on n’étire jamais. Une grille déclare `minmax(<largeur de carte>, 1fr)` avec un nombre de colonnes maximal égal à son nombre d’éléments — ici 3 forfaits, 3 colonnes, jamais 4.',
      source: 'apps/website/src/features/pricing/PricingPlans.tsx:262',
    },
    {
      kind: 'decision',
      text: 'RUX-43 (docs/revue-ux.md §2 P5, Top 20 non retenu) : l’aperçu tarifaire de l’accueil réutilise EXACTEMENT ce même composant (`pricingPlansSection()`, `./shared.ts`), bascule mensuel/annuel comprise — un prix ne s’affiche que d’une seule façon. Avant cette décision, l’accueil n’affichait que le prix mensuel (199 €), sans bascule ; les deux pages pouvaient diverger.',
      source: 'apps/website/src/features/landing/Pricing.tsx:125',
    },
    {
      kind: 'decision',
      text: 'RUX-42 (docs/revue-ux.md §2 P5) : les cartes de forfait disent « Créer mon compte » pour Free et Growth (aucune carte bancaire requise pour Free, c’est déjà un compte) et « Parler à l’équipe » pour Entreprise (devis, plusieurs commerciaux) — jamais « Choisir Growth » ni « Explorer la démo », qui dupliquaient les trois intentions sous un quatrième et un cinquième libellé.',
      source: 'apps/website/src/features/pricing/PricingCta.tsx:26',
    },
  ],
}
