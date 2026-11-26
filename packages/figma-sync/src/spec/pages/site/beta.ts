import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /beta — candidature au programme beta (5 ESN). Six sections dans l'ordre
 * réel de `apps/website/src/app/[locale]/beta/page.tsx:26-42` : Hero, How,
 * Screens, Offer, Faq, Form. Textes FR : `apps/website/messages/fr/beta.json`.
 */

const kicker = (text: string): Block => ({ type: 'text', text, style: 'label', color: 'text/accent' })
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
  gap: '5',
  padding: '10',
  children: [
    {
      type: 'component',
      component: 'Badge',
      props: { variant: 'outline', content: { label: 'Programme beta — 5 places' } },
    },
    { type: 'text', text: 'Un dossier de conquête ESN complet, en 5 minutes.', style: 'display' },
    {
      type: 'text',
      text: "Contacts réels, organigramme, signaux d'achat et plan d'action prêt à l'emploi. Nous ouvrons la beta à 5 ESN pour construire le produit avec vous.",
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
          props: { variant: 'default', content: { label: 'Candidater à la beta' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'outline', content: { label: "Voir l'offre beta" } },
        },
      ],
    },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '6',
      children: [
        stat('5', 'ESN sélectionnées'),
        stat('~5 min', 'par dossier de compte'),
        stat('59 €', 'HT / mois pendant la beta'),
      ],
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '4',
      children: ['2 sièges inclus', 'Onboarding mi-août 2026', 'Hébergé en Europe'].map(
        (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
      ),
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
    { type: 'text', text: "Du profil ESN au dossier prêt à l'action, en quatre temps.", style: 'title' },
    {
      type: 'grid',
      columns: 4,
      columnsMobile: 1,
      gap: '4',
      children: [
        [
          'Vous décrivez votre ESN',
          'Vos expertises, vos offres et vos cibles. BellumAI se cale sur votre positionnement dès le départ.',
        ],
        [
          "L'IA analyse le compte",
          "Dix agents balaient sources officielles, presse, marchés publics et offres d'emploi pour un compte donné.",
        ],
        [
          'Vous recevez le dossier',
          "Signaux d'achat, décideurs réels, organigramme et lecture du compte, réunis dans un espace unique.",
        ],
        [
          "Vous passez à l'action",
          "Plan d'action priorisé et messages prêts à personnaliser, à exporter vers votre CRM ou à copier dans le canal de votre choix.",
        ],
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

const screens: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Aperçu produit'),
    { type: 'text', text: 'Ce que vous obtenez sur chaque compte.', style: 'title' },
    {
      type: 'text',
      text: 'Nous montrons le produit en direct, sur un compte de votre portefeuille — pas de captures mises en scène.',
      style: 'body',
      color: 'text/secondary',
    },
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Démo sur demande' } } },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        [
          "Signaux d'achat",
          'Recrutements, marchés publics, actualités et mouvements dirigeants qui ouvrent une fenêtre de tir.',
        ],
        [
          'Décideurs & organigramme',
          'Les bons interlocuteurs, leur rôle dans la décision et leurs coordonnées vérifiables.',
        ],
        [
          "Plan d'action & messages",
          'Une séquence priorisée et des messages prêts à personnaliser pour engager le compte.',
        ],
      ].map(
        ([title, desc]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string, description: desc as string } },
          children: [
            { type: 'placeholder', kind: 'image', label: `Capture produit : ${title as string}`, height: 'md' },
          ],
        }),
      ),
    },
    {
      type: 'component',
      component: 'Button',
      props: { variant: 'link', content: { label: 'Parler à l’équipe' } },
    },
  ],
}

const offer: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker("L'offre beta"),
    { type: 'text', text: 'Transparente, honnête, sans surprise.', style: 'title' },
    {
      type: 'text',
      text: 'Un tarif préférentiel en échange de votre regard. Voici exactement ce que vous obtenez, ce que nous attendons et ce que nous ne promettons pas encore.',
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'component',
      component: 'Card',
      props: {
        content: {
          title: 'Programme beta — 59 € HT / mois',
          description: 'Pour les 5 premières ESN. Facturation mensuelle, sans engagement long.',
        },
      },
      children: [
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'default', content: { label: 'Candidater à la beta' } },
        },
        ...[
          '2 sièges inclus (2 commerciaux)',
          "Crédits d'analyse et d'enrichissement inclus",
          'Accès à toutes les fonctionnalités',
          'Onboarding accompagné à partir de mi-août 2026',
          "Ligne directe avec l'équipe fondatrice",
          'Tarif beta gelé pour la durée du programme',
        ].map((t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/secondary' })),
      ],
    },
    {
      type: 'grid',
      columns: 2,
      columnsMobile: 1,
      gap: '6',
      children: [
        {
          type: 'stack',
          direction: 'column',
          gap: '2',
          children: [
            { type: 'text', text: 'Ce que nous attendons de vous', style: 'heading' },
            ...[
              "Un retour d'usage régulier (ce qui marche, ce qui manque)",
              'Deux à trois calls courts (~20 min) sur la période',
              'Un engagement de 1 à 2 mois, sans reconduction automatique',
            ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/secondary' })),
          ],
        },
        {
          type: 'stack',
          direction: 'column',
          gap: '2',
          children: [
            { type: 'text', text: "Ce qui n'est pas inclus", style: 'heading' },
            ...[
              'SLA entreprise ou disponibilité garantie par contrat',
              'Support 24/7 et astreinte dédiée',
              'Développements sur-mesure ou intégrations spécifiques',
            ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/muted' })),
          ],
        },
      ],
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
    { type: 'text', text: "Tout ce qu'il faut savoir sur la beta.", style: 'title' },
    {
      type: 'stack',
      direction: 'column',
      gap: '4',
      children: [
        [
          "D'où viennent les données ?",
          "Exclusivement de sources publiques et officielles : registres d'entreprises, BODACC, marchés publics, offres d'emploi, presse et sites institutionnels. Aucune donnée n'est inventée.",
        ],
        [
          'Est-ce conforme au RGPD ?',
          'Oui. Les données sont hébergées en Europe. Nous fournissons un DPA, et vous gardez la main sur vos données à tout moment.',
        ],
        [
          'Puis-je connecter mon CRM ?',
          "Oui. BellumAI s'intègre à HubSpot et Salesforce. La connexion s'active depuis Réglages › Intégrations.",
        ],
        [
          'BellumAI agit-il sur LinkedIn à ma place ?',
          "Non. Nous préparons vos messages et vos contacts, mais nous n'automatisons aucune action sur LinkedIn.",
        ],
        [
          'Comment mes données sont-elles sécurisées ?',
          'Chaque espace de travail est isolé, les accès sont chiffrés et cloisonnés par utilisateur.',
        ],
        [
          'Comment fonctionnent les crédits pendant la beta ?',
          'Les crédits sont inclus dans les 59 €/mois. Une analyse complète en coûte 8, une actualisation 4, un enrichissement 1.',
        ],
        ["Quel est le niveau d'engagement ?", 'Un engagement souple de 1 à 2 mois, sans reconduction automatique.'],
        [
          'Que se passe-t-il après la beta ?',
          'Vous basculez librement vers une offre standard, avec un tarif préférentiel réservé aux ESN de la beta.',
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

const form: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '1',
    padding: '10',
    children: [
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '10',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '4',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Candidature beta' } },
              },
              { type: 'text', text: 'Rejoignez les 5 ESN de la beta.', style: 'title' },
              {
                type: 'text',
                text: 'Dites-nous qui vous êtes. Nous sélectionnons les profils les plus proches de notre cible et revenons vers vous rapidement pour un premier échange.',
                style: 'body',
                color: 'text/secondary',
              },
              ...[
                'Un dossier de conquête complet sur vos comptes, en quelques minutes.',
                'Un accès à toutes les fonctionnalités, pour 2 commerciaux.',
                "Une ligne directe avec l'équipe pour peser sur la feuille de route.",
              ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/secondary' })),
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Candidater à la beta', description: 'Cinq places, sélection sur profil.' } },
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { state: 'default', content: { label: 'Votre nom', placeholder: 'Votre nom' } },
              },
              {
                type: 'component',
                component: 'Input',
                props: {
                  state: 'default',
                  content: { label: 'Email professionnel', placeholder: 'vous@votre-esn.com' },
                },
              },
              {
                type: 'component',
                component: 'Input',
                props: { state: 'default', content: { label: 'Votre ESN', placeholder: 'Nom de votre ESN' } },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'md',
                  state: 'default',
                  content: { label: 'Nombre de commerciaux', placeholder: 'Sélectionnez…' },
                  items: ['1 - 3 commerciaux', '4 - 10 commerciaux', '11 - 25 commerciaux', 'Plus de 25'],
                },
              },
              {
                type: 'component',
                component: 'Input',
                props: {
                  state: 'default',
                  content: { label: 'Outils actuels', placeholder: 'Salesforce, HubSpot, LinkedIn Sales Navigator…' },
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Envoyer ma candidature' } },
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                children: ['5 places seulement', 'Réponse sous 2 jours ouvrés', 'Sans engagement long'].map(
                  (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]

export const betaPage: PageSpec = {
  id: 'site/beta',
  surface: 'site',
  domain: 'beta',
  route: 'apps/website/src/app/[locale]/beta/page.tsx',
  title: 'Programme beta',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [how, screens, offer, faq],
    cta: form,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'Le formulaire de candidature passe de 2 colonnes (argumentaire + carte) à 1 colonne sous 1024 px ; les grilles « Comment ça marche » (4) et « Aperçu produit » (3) suivent la règle générale 3→2→1.',
      'apps/website/src/features/beta/BetaForm.tsx:1',
    ),
    {
      kind: 'decision',
      text: 'Le tarif beta (59 € HT/mois, 2 sièges) diffère volontairement du tarif Growth affiché sur /tarifs (199 € HT/mois, 1 utilisateur) : offre d’amorçage limitée à 5 ESN, pas une contradiction de grille tarifaire.',
      source: 'apps/website/messages/fr/beta.json:25',
    },
  ],
}
