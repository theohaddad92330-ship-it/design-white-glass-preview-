import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, pricingPlansSection, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * / — la page d'accueil du site public. Seize sections dans l'ordre réel de
 * `apps/website/src/app/[locale]/page.tsx:90-143`. Textes FR :
 * `apps/website/messages/fr/home.json`.
 *
 * Header/footer : voir `./shared.ts` (identiques sur les 17 pages du site).
 */

const kicker = (text: string): Block => ({ type: 'text', text, style: 'label', color: 'text/accent' })
const heading = (text: string): Block => ({ type: 'text', text, style: 'title' })
const paragraph = (text: string): Block => ({ type: 'text', text, style: 'body', color: 'text/secondary' })
const stat = (value: string, label: string): Block => ({
  type: 'stack',
  direction: 'column',
  gap: '1',
  children: [
    { type: 'text', text: value, style: 'display' },
    { type: 'text', text: label, style: 'caption', color: 'text/muted' },
  ],
})

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    {
      type: 'component',
      component: 'Badge',
      props: { variant: 'outline', content: { label: "L'IA au service des ESN" } },
    },
    { type: 'text', text: 'L’IA commerciale pensée pour les ESN.', style: 'display' },
    paragraph(
      "Identifiez les bons comptes, les bons décideurs et les bons signaux avant vos concurrents. BellumAI transforme l'information dispersée en dossiers de conquête prêts à l'action.",
    ),
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
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '6',
      children: [
        stat('10', 'agents spécialisés'),
        stat('~5 min', 'par dossier de compte'),
        stat('360°', 'vision du compte'),
      ],
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '4',
      children: ['Démo sur un compte réel', 'Sans engagement', 'Hébergé en Europe'].map(
        (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
      ),
    },
    {
      type: 'placeholder',
      kind: 'image',
      label:
        "Maquette produit : dossier de compte (signal d'achat détecté, contacts prioritaires, score d'opportunité)",
      height: 'lg',
    },
  ],
}

const logoBand: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  align: 'center',
  children: [
    {
      type: 'text',
      text: 'Conçu pour les équipes commerciales des entreprises de services du numérique',
      style: 'caption',
      color: 'text/muted',
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '6',
      justify: 'center',
      children: ['Business Managers', 'Directions commerciales', 'Dirigeants d’ESN'].map(
        (t): Block => ({ type: 'text', text: t, style: 'label', color: 'text/muted' }),
      ),
    },
  ],
}

const metrics: Block = {
  type: 'grid',
  columns: 4,
  columnsMobile: 2,
  gap: '6',
  children: [
    ['~10 min', 'Un dossier de conquête complet', 'au lieu d’une journée de recherche'],
    ['20+', 'Sources croisées', 'INSEE, INPI, BODACC, France Travail…'],
    ['360°', 'Vue compte de bout en bout', 'contacts, organigramme, signaux, plan'],
    ['0', 'Donnée inventée', 'chaque insight est sourcé et traçable'],
  ].map(
    ([value, label, sub]): Block => ({
      type: 'stack',
      direction: 'column',
      gap: '2',
      children: [
        { type: 'text', text: value as string, style: 'display' },
        { type: 'text', text: label as string, style: 'body' },
        { type: 'text', text: sub as string, style: 'caption', color: 'text/muted' },
      ],
    }),
  ),
}

const problem: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Le problème'),
    heading('Vous perdez des heures avant même de prospecter.'),
    paragraph(
      'Recherche manuelle, numéros introuvables, signaux manqués, organigrammes flous, relances incohérentes… Chaque friction vous éloigne de vos opportunités. BellumAI transforme ce chaos en avantage compétitif.',
    ),
    {
      type: 'grid',
      columns: 2,
      columnsMobile: 1,
      gap: '6',
      children: [
        {
          type: 'stack',
          direction: 'column',
          gap: '3',
          children: [
            { type: 'text', text: 'Avant BellumAI', style: 'heading' },
            ...[
              'Des heures perdues à chercher des informations éparpillées.',
              'Des signaux d’achat invisibles, des opportunités manquées.',
              'Organigrammes flous, décideurs difficiles à identifier.',
              'Suivi commercial dispersé, relances inconsistantes.',
            ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/secondary' })),
          ],
        },
        {
          type: 'stack',
          direction: 'column',
          gap: '3',
          children: [
            { type: 'text', text: 'Après BellumAI', style: 'heading' },
            ...[
              '1 compte analysé en 5 minutes avec toutes les informations clés.',
              'Signaux détectés en temps réel, opportunités priorisées.',
              'Décideurs identifiés avec leurs contacts vérifiés.',
              'Plan d’action structuré, relances contextuelles et efficaces.',
            ].map((t): Block => ({ type: 'text', text: t, style: 'body' })),
          ],
        },
      ],
    },
  ],
}

const how: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Comment ça marche'),
    heading('De la recherche au dossier, en trois temps.'),
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '6',
      children: [
        [
          'Comprendre un compte',
          'Centralisez toutes les informations clés et obtenez une vision 360° claire et à jour.',
        ],
        [
          'Prioriser les contacts utiles',
          'Identifiez les décideurs et influenceurs les plus pertinents pour votre approche.',
        ],
        ['Passer à l’action plus vite', 'Recevez un plan d’action et des messages recommandés, prêts à l’emploi.'],
      ].map(
        ([title, desc], i): Block => ({
          type: 'stack',
          direction: 'column',
          gap: '2',
          children: [
            { type: 'text', text: `Étape ${i + 1}`, style: 'label', color: 'text/accent' },
            { type: 'text', text: title as string, style: 'heading' },
            { type: 'text', text: desc as string, style: 'body', color: 'text/secondary' },
          ],
        }),
      ),
    },
  ],
}

const features: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Le produit'),
    heading('Tout ce que BellumAI met sur la table.'),
    paragraph('Centralisez les signaux clés et accélérez votre prospection avec des dossiers prêts à l’action.'),
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        ["Signaux d'achat", 'Identifiez les projets en cours et les intentions d’investir.'],
        ['Décideurs & contacts', 'Accédez aux bons décideurs et contacts qualifiés rapidement.'],
        ['Organigrammes', 'Comprenez l’organisation interne et les circuits de décision.'],
        ["Offres d'emploi", 'Repérez les besoins en recrutement et les compétences recherchées.'],
        ['Technologies détectées', 'Découvrez les technologies utilisées et les outils en place.'],
        ['Comptes similaires', 'Trouvez des entreprises similaires à fort potentiel.'],
      ].map(
        ([title, desc]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string, description: desc as string } },
        }),
      ),
    },
    { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Voir le produit' } } },
  ],
}

const orchestration: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Orchestration IA'),
    heading('Une orchestration IA qui travaille en arrière-plan pour vous.'),
    paragraph(
      'BellumAI mobilise des agents spécialisés qui collaborent entre eux pour collecter, analyser et structurer les informations clés sur vos comptes cibles. Sélectionnez un agent pour voir son rôle.',
    ),
    {
      type: 'component',
      component: 'Card',
      props: { content: { title: 'Analyse du compte', description: 'Orchestre les agents spécialisés' } },
    },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        ['Détection signaux', "Intentions et signaux d'achat récents."],
        ['Recherche décideurs', 'Contacts clés et coordonnées vérifiées.'],
        ['Organigramme', 'Circuits de décision reconstitués.'],
        ["Plan d'action", 'Prochaines étapes priorisées.'],
        ['Export battle card', 'Dossier PDF prêt à partager.'],
      ].map(
        ([title, desc]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string, description: desc as string } },
        }),
      ),
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'link', content: { label: 'Découvrir le fonctionnement' } },
    },
  ],
}

const enrichment: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Enrichissement ciblé'),
    heading('Vous n’avez pas besoin de 150 contacts. Vous avez besoin des 5 bons.'),
    paragraph(
      'BellumAI identifie d’abord les meilleures personnes pour atteindre votre objectif. Vous choisissez ensuite qui enrichir avec email, téléphone direct et message personnalisé.',
    ),
    {
      type: 'component',
      component: 'SectionCard',
      props: { content: { title: 'Contacts prioritaires', description: '5 utiles sélectionnés' } },
      children: [
        {
          type: 'component',
          component: 'DataList',
          props: {},
          children: [
            {
              type: 'component',
              component: 'UserCell',
              props: { content: { name: 'Claire Lefèvre · DSI', subtitle: 'Décideur · sponsor budget' } },
            },
            {
              type: 'component',
              component: 'UserCell',
              props: { content: { name: 'Thomas Mercier · Head of Data', subtitle: 'Influenceur technique' } },
            },
            {
              type: 'component',
              component: 'UserCell',
              props: { content: { name: 'Awa Réau · Lead Recrutement', subtitle: 'Relais opérationnel' } },
            },
          ],
        },
      ],
    },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '3',
      children: [
        ['1 crédit', 'Email vérifié'],
        ['2 crédits', 'Téléphone'],
        ['Inclus', 'Message'],
      ].map(
        ([credit, label]): Block => ({
          type: 'component',
          component: 'DataRow',
          props: { content: { label: credit, value: label } },
        }),
      ),
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'link', content: { label: 'Découvrir l’enrichissement ciblé' } },
    },
  ],
}

const integrations: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Intégrations'),
    heading('BellumAI s’intègre à votre stack.'),
    paragraph('Vos outils, vos données, vos canaux. BellumAI se branche à l’existant plutôt que de le remplacer.'),
    {
      type: 'grid',
      columns: 2,
      columnsMobile: 1,
      gap: '4',
      children: [
        ['CRM', 'Exportez contacts et comptes, sans ressaisie. Synchronisation dans le sens de votre process.'],
        ['Notifications', 'Recevez les signaux d’achat et les analyses terminées là où votre équipe travaille.'],
        ['Assistants IA', 'Interrogez vos comptes directement depuis votre assistant via le protocole MCP.'],
        ['Sources de données', 'Des données officielles et publiques, croisées automatiquement à chaque analyse.'],
      ].map(
        ([title, desc]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string, description: desc as string } },
        }),
      ),
    },
  ],
}

const useCasesPreview: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Cas d’usage'),
    heading('Conçu pour les ESN qui veulent ouvrir plus de comptes.'),
    paragraph('Des cas d’usage concrets pour chaque rôle clé de votre organisation.'),
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        [
          'Business Manager',
          'Gagnez du temps sur chaque compte.',
          ['Gagner du temps', 'Visualiser les décideurs', 'Détecter les opportunités'],
        ],
        [
          'Directeur commercial',
          'Structurez l’approche grand compte.',
          ['Structurer le grand compte', 'Capitaliser sur l’historique', 'Piloter avec des données fiables'],
        ],
        [
          'Fondateur / dirigeant',
          'Gardez une vision claire.',
          ['Vision claire du portefeuille', 'Accélérer la croissance', 'Aligner les équipes'],
        ],
      ].map(
        ([badge, title, points]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string } },
          children: [
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'outline', content: { label: badge as string } },
            },
            ...(points as string[]).map(
              (p): Block => ({ type: 'text', text: p, style: 'caption', color: 'text/secondary' }),
            ),
          ],
        }),
      ),
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'link', content: { label: 'Explorer tous les cas d’usage' } },
    },
  ],
}

const testimonialsNote: Block = {
  type: 'placeholder',
  kind: 'custom',
  label:
    'Témoignages : section vide aujourd’hui — TESTIMONIALS = [] tant qu’aucune citation client réelle n’est fournie (jamais de témoignage inventé).',
  height: 'sm',
}

const security: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Sécurité & conformité'),
    heading('Conçu pour la confiance des ESN.'),
    paragraph(
      'La donnée commerciale est sensible. BellumAI la traite avec les standards attendus d’un outil B2B européen.',
    ),
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        [
          'Hébergement en Europe',
          'Vos données sont hébergées dans l’Union européenne (eu-west-1), jamais transférées hors UE.',
        ],
        ['Conforme au RGPD', 'Traitement transparent, droit à l’effacement, DPA disponible sur demande.'],
        [
          'Chiffrement de bout en bout',
          'Données chiffrées en transit (TLS) et au repos, secrets sensibles en AES-256.',
        ],
        [
          'Isolation par compte',
          'Cloisonnement strict au niveau base (RLS Postgres) — vos données restent les vôtres.',
        ],
        [
          'Aucune revente de données',
          'Nous ne vendons ni ne partageons vos données. Elles servent uniquement votre prospection.',
        ],
        [
          'Sources officielles & traçables',
          'Chaque insight provient de sources publiques identifiées. Zéro donnée inventée.',
        ],
      ].map(
        ([title, desc]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string, description: desc as string } },
        }),
      ),
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '4',
      children: [
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'link', content: { label: 'Politique de confidentialité' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'link', content: { label: 'Accord de traitement des données (DPA)' } },
        },
      ],
    },
  ],
}

const pricing: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Tarifs'),
    heading('Une analyse de compte coûte 8 crédits. Le copilote est inclus.'),
    paragraph(
      'Un dossier complet en coûte 8, l’actualiser 4, enrichir un contact 1. Le copilote, les exports et la veille quotidienne ne coûtent rien de plus.',
    ),
    // RUX-43 (docs/revue-ux.md §2 P5) : le MÊME composant que /tarifs, bascule comprise —
    // un prix ne s'affiche que d'une seule façon (voir `pricingPlansSection()`, `./shared.ts`).
    ...pricingPlansSection(),
  ],
}

const faq: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Questions fréquentes'),
    heading('Vos questions, nos réponses.'),
    {
      type: 'stack',
      direction: 'column',
      gap: '4',
      children: [
        [
          'Comment BellumAI trouve-t-il ses informations ?',
          "BellumAI croise plus de 20 sources, à commencer par les registres officiels : INSEE, INPI, BODACC, France Travail, marchés publics — puis les sites et offres d'emploi, la presse et les signaux web. Chaque insight est sourcé et traçable.",
        ],
        [
          "En quoi est-ce différent d'un CRM ou d'un outil de scraping ?",
          'Un CRM stocke ce que vous savez déjà ; un outil de scraping vous noie sous la donnée brute. BellumAI priorise les comptes, identifie les décideurs, détecte les signaux d’achat et livre un plan d’action prêt à l’emploi, puis exporte vers votre CRM.',
        ],
        [
          'Combien de temps pour obtenir un dossier de conquête ?',
          'Environ 10 minutes par compte, contre une demi-journée à une journée de recherche manuelle.',
        ],
        [
          'Mes données et celles de mes prospects sont-elles protégées ?',
          'Oui. Hébergement en Union européenne, conformité RGPD, chiffrement en transit et au repos, isolation stricte par compte (RLS). Un DPA est disponible sur demande.',
        ],
        [
          "Faut-il installer quelque chose ou former l'équipe ?",
          'Non. BellumAI est une application web : vous vous connectez et lancez votre première analyse en quelques minutes.',
        ],
        [
          "BellumAI s'intègre-t-il à mes outils ?",
          'Oui : export vers HubSpot et Salesforce, notifications Slack, Teams, Discord, Google Chat, Mattermost ou webhook, et connexion à votre assistant IA via le protocole MCP.',
        ],
        [
          'Puis-je essayer avant de payer ?',
          'Oui : on vous le montre en démo, sur un compte réel de votre choix, avant toute décision.',
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

const about: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  padding: '10',
  children: [
    kicker('À propos'),
    heading('BellumAI a été créé par des Sales, pour des Sales en ESN.'),
    paragraph(
      'Né de frustrations quotidiennes : recherches chronophages, informations dispersées, comptes difficiles à cartographier. Nous avons construit le copilote qui nous manquait.',
    ),
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'link', content: { label: 'Découvrir notre histoire' } },
    },
  ],
}

const team: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('L’équipe'),
    heading('Les visages derrière BellumAI.'),
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        ['CEO & Co-fondateur', 'Ancien Sales en ESN. Porte la vision produit et la relation clients.'],
        ['CTO & Co-fondateur', 'Construit le moteur d’analyse et l’infrastructure derrière chaque dossier.'],
        ['Head of Sales', 'Déploie BellumAI sur le terrain, au contact des équipes commerciales.'],
      ].map(
        ([role, blurb]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: role as string, description: blurb as string } },
          children: [{ type: 'component', component: 'Avatar', props: { content: { initials: '··' } } }],
        }),
      ),
    },
  ],
}

const finalCta: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '4',
    align: 'center',
    padding: '10',
    children: [
      { type: 'text', text: 'Voyez BellumAI en action sur un vrai compte.', style: 'title', color: 'text/primary' },
      {
        type: 'text',
        text: 'Découvrez comment BellumAI centralise vos signaux faibles, structure vos dossiers prêts à l’action et aligne vos équipes commerciales.',
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

export const homePage: PageSpec = {
  id: 'site/home',
  surface: 'site',
  domain: 'accueil',
  route: 'apps/website/src/app/[locale]/page.tsx',
  title: 'Accueil',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [
      logoBand,
      metrics,
      problem,
      how,
      features,
      orchestration,
      enrichment,
      integrations,
      useCasesPreview,
      testimonialsNote,
      security,
      pricing,
      faq,
      about,
      team,
    ],
    cta: finalCta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    responsiveNote(
      'La grille de tarifs (trois cartes, trois colonnes) se replie à 2 colonnes sous 1280 px puis 1 sous 768 px.',
      'apps/website/src/components/SiteLayout.tsx:9',
    ),
    {
      kind: 'ecart',
      text: 'RUX-30/RUX-43 (docs/revue-ux.md T16, §2 P5) : le code garde une grille à QUATRE colonnes (`xl:grid-cols-4`) pour trois forfaits, et l’aperçu de l’accueil n’affiche que le prix mensuel (199 €) sans bascule — deux écarts que la maquette cible corrige d’un coup en réutilisant `pricingPlansSection()` (`./shared.ts`), le même composant que `/tarifs` : trois colonnes, bascule mensuel/annuel comprise.',
      source: 'apps/website/src/features/landing/Pricing.tsx:153',
    },
    {
      kind: 'decision',
      text: 'La section Témoignages ne s’affiche pas : `TESTIMONIALS = []` tant qu’aucune citation client réelle n’est disponible (jamais de témoignage inventé, cf. commentaire du fichier).',
      source: 'apps/website/src/features/landing/Testimonials.tsx:17',
    },
    {
      kind: 'ecart',
      text: 'RUX-27 (docs/revue-ux.md T13) : chaque section anime encore son apparition en 0,8 s avec un easing `[0.22, 0.61, 0.36, 1]` propre à `Reveal.tsx`, hors de la grammaire `DURATION`/`EASE` de `packages/ui/src/motion.ts` (GA-25) — une cinquième courbe locale sur le dépôt (T13 en compte cinq).',
      source: 'apps/website/src/features/landing/Reveal.tsx:12',
    },
    {
      kind: 'decision',
      text: 'RUX-27 (docs/revue-ux.md T13, addenda au Top 20) : `packages/ui/src/motion.ts` est la grammaire de mouvement des TROIS surfaces, site compris — `Reveal` cible `DURATION.perceptible` + `EASE.out` (0,26 s), déclenché une seule fois par section, sur toutes les pages marketing sauf les pages légales. Aucun rebond, aucune parallaxe (garde GA-25) ; jamais une courbe ou une durée définie localement dans un composant du site.',
      source: 'apps/website/src/features/landing/Reveal.tsx:12',
    },
    {
      kind: 'decision',
      text: 'Q6 (arbitrage du fondateur, 25/09/2026, RUX-01 à 04) : le site cible le thème clair (suit la préférence système, parité avec le sombre comme l’app, D79) et Geist pour le texte courant — cette maquette utilise déjà UNIQUEMENT les tokens du contrat partagé (voir l’en-tête de `./shared.ts`), donc ce point est déjà tenu. Le violet du site s’aligne sur `primary-500` de l’app, une seule source de tokens (RUX-01) — jamais le violet chaud propre au site ni son dégradé de marque, qui reste réservé au FOND décoratif du hero, jamais sur un bouton ni sur du texte (RUX-04). Clash Display reste réservé au SEUL titre du hero (`text/display`, ≥ 36 px, ce bloc) — jamais aux nombres des sections (`stat()` plus bas, aussi en `display`, reste Geist) ni à aucun autre titre du site.',
      source: 'apps/website/src/app/globals.css:1',
    },
    {
      kind: 'decision',
      text: 'RUX-42 (docs/revue-ux.md §2 P5, Top 20 #2) : trois intentions, trois libellés, trois destinations, PARTOUT sur le site — « Créer mon compte » (`/signup`, bouton `default`), « Essayer la démo » (démo libre-service sans compte, bouton `outline`), « Parler à l’équipe » (le formulaire, lien tertiaire ou bouton selon le contexte). « Demander une démo » et « Voir/Explorer la démo » disparaissent : ils désignaient deux choses différentes selon l’endroit, ce qui a coûté des inscriptions à la mauvaise destination.',
      source: 'apps/website/src/features/landing/FinalCta.tsx:27',
    },
  ],
}
