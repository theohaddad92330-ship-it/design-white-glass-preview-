import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /product — le dossier complet, section par section. Neuf sections dans
 * l'ordre réel de `apps/website/src/app/[locale]/product/page.tsx:28-51`.
 * Textes FR : `apps/website/messages/fr/product.json`.
 */

const kicker = (text: string): Block => ({ type: 'text', text, style: 'label', color: 'text/accent' })
const spotlight = (kickerText: string, title: string, desc: string, visual: Block): Block => ({
  type: 'grid',
  columns: 2,
  columnsMobile: 1,
  gap: '10',
  children: [
    {
      type: 'stack',
      direction: 'column',
      gap: '3',
      children: [
        kicker(kickerText),
        { type: 'text', text: title, style: 'title' },
        { type: 'text', text: desc, style: 'body', color: 'text/secondary' },
      ],
    },
    visual,
  ],
})

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '5',
  align: 'center',
  padding: '10',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Produit' } } },
    {
      type: 'text',
      text: 'Tout ce dont une équipe commerciale ESN a besoin, réuni dans un seul espace.',
      style: 'display',
    },
    {
      type: 'text',
      text: "De la compréhension du compte à la préparation de vos messages, BellumAI transforme l'information en actions concrètes.",
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
}

const anatomy: Block = {
  type: 'component',
  component: 'Card',
  props: { content: { title: 'SNCF Réseau', description: 'Exemple' } },
  children: [
    {
      type: 'component',
      component: 'TabNav',
      props: { variant: 'underline', items: ['Vue d’ensemble', 'Contacts', 'Organigramme'] },
    },
    {
      type: 'component',
      component: 'SectionSidebarNav',
      props: {
        content: { title: 'Dossier' },
        items: ['Vue d’ensemble', 'Signaux d’achat', 'Décideurs', 'Organigramme', 'Plan d’action', 'Messages'],
      },
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '2',
      align: 'center',
      children: [
        { type: 'component', component: 'EntityAvatar', props: { size: 'md', content: { name: 'SNCF' } } },
        { type: 'text', text: 'SNCF Réseau', style: 'title' },
        {
          type: 'component',
          component: 'Badge',
          props: { variant: 'outline', content: { label: 'Infrastructures ferroviaires' } },
        },
        {
          type: 'component',
          component: 'Badge',
          props: { variant: 'outline', content: { label: 'SIREN 778 500 060' } },
        },
        { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Priorité haute' } } },
      ],
    },
    {
      type: 'component',
      component: 'SectionCard',
      props: {
        content: {
          title: 'Compte à fort potentiel',
          description: 'De nombreuses opportunités business et tech à court terme.',
        },
      },
      children: [
        {
          type: 'stack',
          direction: 'row',
          gap: '2',
          children: [
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'success', content: { label: 'Opportunité élevée' } },
            },
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'outline', content: { label: 'Alignement stratégique' } },
            },
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'outline', content: { label: 'Décision multi-niveaux' } },
            },
          ],
        },
      ],
    },
    {
      type: 'grid',
      columns: 4,
      columnsMobile: 2,
      gap: '3',
      children: [
        {
          type: 'component',
          component: 'Card',
          props: { content: { title: 'Offres détectées' } },
          children: [
            { type: 'text', text: '26', style: 'display' },
            { type: 'text', text: '↑ 18 %', style: 'caption', color: 'success/text' },
          ],
        },
        {
          type: 'component',
          component: 'Card',
          props: { content: { title: 'Contacts qualifiés' } },
          children: [
            { type: 'text', text: '37', style: 'display' },
            { type: 'text', text: '↑ 12 %', style: 'caption', color: 'success/text' },
          ],
        },
        {
          type: 'component',
          component: 'Card',
          props: { content: { title: 'Entités utiles' } },
          children: [
            { type: 'text', text: '8', style: 'display' },
            { type: 'text', text: '↑ 14 %', style: 'caption', color: 'success/text' },
          ],
        },
        {
          type: 'component',
          component: 'Card',
          props: { content: { title: 'Sites prioritaires' } },
          children: [
            { type: 'text', text: '42', style: 'display' },
            { type: 'text', text: 'Correspondance vérifiée', style: 'caption', color: 'text/muted' },
          ],
        },
      ],
    },
  ],
}

const analysis: Block = spotlight(
  'Analyse de compte',
  'Une vue claire avant de mobiliser votre temps.',
  'Obtenez une vue claire du potentiel, des enjeux et des signaux utiles avant de mobiliser votre temps. Une analyse de compte complète coûte 8 crédits, annoncés avant le clic.',
  {
    type: 'component',
    component: 'Card',
    props: { content: { title: 'Synthèse du compte', description: 'À jour' } },
    children: [
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
                label: 'Budget IT 2025 confirmé (+18 %)',
                value: 'Modernisation du SI et cybersécurité prioritaires · récent',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Programme data & IA en accélération',
                value: '3 signaux d’achat détectés ces 30 jours · 30 j',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Recrutements clés en data engineering',
                value: 'Appels d’offres technologiques repérés · 12 j',
              },
            },
          },
        ],
      },
    ],
  },
)

const orgChart: Block = spotlight(
  'Organigramme intelligent',
  'Comprenez qui décide et par où entrer.',
  "BellumAI reconstitue l'organisation, qualifie chaque interlocuteur par son rôle de décision et éclaire le chemin d'accès le plus court vers la signature.",
  {
    type: 'component',
    component: 'Card',
    props: { content: { title: 'Organigramme · SNCF Réseau', description: 'Chemin recommandé · 3 niveaux' } },
    children: [
      {
        type: 'placeholder',
        kind: 'graph',
        label:
          'Organigramme : Directeur Numérique & IA → Resp. Cybersécurité, Resp. Architecture SI, Cheffe de projet SI',
        height: 'md',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        children: [
          ['Sponsor', 'Décideur final : pouvoir de décision et budget.'],
          ['Influenceur', 'Oriente les choix techniques et stratégiques.'],
          ['Opérationnel', 'Pilote et met en œuvre au quotidien.'],
        ].map(
          ([label, desc]): Block => ({
            type: 'component',
            component: 'DataRow',
            props: { content: { label: label as string, value: desc as string } },
          }),
        ),
      },
    ],
  },
)

const messages: Block = spotlight(
  "Messages & plan d'action",
  "De l'information à l'action concrète.",
  'Préparez des approches fondées sur les informations réellement détectées, puis structurez les prochaines étapes immédiates, hebdomadaires et mensuelles.',
  {
    type: 'component',
    component: 'Card',
    props: {
      content: {
        title: 'Message recommandé',
        description:
          'Bonjour Claire, votre plan de migration cloud annoncé pour 2026 fait écho à des projets data que nous avons accompagnés sur des périmètres comparables. Quelques minutes pour en parler ?',
      },
    },
    children: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Générer le message' } },
      },
      {
        type: 'component',
        component: 'DataRow',
        props: { content: { label: 'Cette semaine', value: 'Contacter la DSI via LinkedIn' } },
      },
      {
        type: 'component',
        component: 'DataRow',
        props: { content: { label: 'Sous 15 j', value: 'Proposer un atelier de cadrage data' } },
      },
    ],
  },
)

const sites: Block = spotlight(
  'Cartographie des sites',
  'Repérez les implantations qui pèsent vraiment.',
  "BellumAI détecte sièges, bureaux et établissements d'un groupe, les positionne sur le territoire et les classe par potentiel - pour cibler les sites où concentrer vos efforts.",
  {
    type: 'component',
    component: 'Card',
    props: { content: { title: 'Sites · SNCF Réseau', description: '225 sites · 13/13 régions' } },
    children: [
      {
        type: 'placeholder',
        kind: 'map',
        label: 'Carte des sites en France, par type (siège, bureaux, établissement, site industriel)',
        height: 'md',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '4',
        children: (
          [
            ['default', 'Siège'],
            ['info', 'Bureaux'],
            ['warning', 'Établissements'],
            ['success', 'Sites industriels'],
          ] as const
        ).map(
          ([variant, label]): Block => ({
            type: 'stack',
            direction: 'row',
            gap: '1',
            align: 'center',
            children: [
              { type: 'component', component: 'DotIndicator', props: { variant, size: 'sm' } },
              { type: 'text', text: label, style: 'caption', color: 'text/muted' },
            ],
          }),
        ),
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Sites prioritaires' },
          table: {
            columns: ['Ville', 'Type', 'Correspondance'],
            rows: [
              ['Paris', 'Siège', 'Correspond'],
              ['Lyon', 'Établissement', 'Correspond'],
              ['Lille', 'Bureaux', 'Correspond'],
              ['Toulouse', 'Établissement', 'À qualifier'],
            ],
          },
        },
      },
      { type: 'text', text: 'Répartition géographique', style: 'label' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Île-de-France', value: '100 % · 54 sites' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Auvergne-Rhône-Alpes', value: '70 % · 38 sites' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Hauts-de-France', value: '54 % · 29 sites' } },
          },
        ],
      },
    ],
  },
)

const contacts: Block = spotlight(
  'Contacts qualifiés',
  'Les bons interlocuteurs, déjà priorisés.',
  'Chaque contact est rattaché à un persona - Sponsor, Influenceur, Opérationnel, noté selon son intérêt pour votre approche, avec son statut d’enrichissement. Vous savez immédiatement qui contacter, et comment.',
  {
    type: 'component',
    component: 'Card',
    props: { content: { title: 'Contacts · 48 détectés', description: '4 à enrichir recommandés' } },
    children: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'UserCell',
            props: { content: { name: 'Julien Nicolas', subtitle: 'Dir. Numérique & IA · Sponsor · Enrichi' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: '92 sur 100' } } },
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
            component: 'UserCell',
            props: { content: { name: 'Claire Dubois', subtitle: 'Resp. Cybersécurité · Influenceur · Message prêt' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: '88 sur 100' } } },
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
            component: 'UserCell',
            props: { content: { name: 'Marc Petit', subtitle: 'Expert Data & IA · Opérationnel · À enrichir' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: '61 sur 100' } } },
        ],
      },
      {
        type: 'text',
        text: 'Score lu sur 100 points : le fit avec l’angle n’est pas évaluable tant qu’aucun angle d’attaque n’est choisi. Il sort du dénominateur, il n’est pas compté zéro.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Rôle décisionnel', value: 'évalué' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Proximité du périmètre', value: 'évalué' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Niveau hiérarchique', value: 'évalué' } },
          },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Accessibilité', value: 'évalué' } } },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Fit avec l’angle', value: 'non évalué' } },
          },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Fraîcheur', value: 'évalué' } } },
        ],
      },
    ],
  },
)

const capabilities: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Et bien plus'),
    { type: 'text', text: 'Un dossier complet, de bout en bout.', style: 'title' },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        ['Contacts prioritaires', 'Identifiez les décideurs, influenceurs et opérationnels à approcher en premier.'],
        ['Signaux & veille', 'Repérez les événements récents qui justifient une prise de contact.'],
        [
          "Offres d'emploi & technologies",
          'Détectez les recrutements, les compétences recherchées et les outils utilisés.',
        ],
        ['Sites prioritaires', 'Identifiez les implantations et entités qui présentent le meilleur potentiel.'],
        ['Comptes similaires', 'Transformez un compte prometteur en nouvelle verticale à explorer.'],
        ['Export PDF', 'Partagez une battle card ou un dossier complet avec votre équipe.'],
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

const cta: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '4',
    align: 'center',
    padding: '10',
    children: [
      { type: 'text', text: 'Prêt à bâtir votre premier dossier ?', style: 'title' },
      { type: 'text', text: 'Sans engagement, résiliable à tout moment.', style: 'body', color: 'text/secondary' },
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

export const productPage: PageSpec = {
  id: 'site/product',
  surface: 'site',
  domain: 'produit',
  route: 'apps/website/src/app/[locale]/product/page.tsx',
  title: 'Produit',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero, anatomy],
    sections: [analysis, orgChart, messages, sites, contacts, capabilities],
    cta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'Les six blocs « Spotlight » passent de 2 colonnes (texte + visuel) à 1 colonne sous 1024 px ; le tableau des sites prioritaires défile horizontalement dans son propre conteneur en dessous, jamais ne déborde.',
      'apps/website/src/features/product/Spotlights.tsx:21',
    ),
    {
      kind: 'decision',
      text: 'Corrigé dans cette maquette : le tableau « Sites prioritaires » DÉFILE bien horizontalement (`overflow-x-auto`) à 360-390 px — la note précédente affirmait le contraire sans que le conteneur existe dans le code lu ; il est bien présent.',
      source: 'apps/website/src/features/product/ProductSites.tsx:246',
    },
    {
      kind: 'decision',
      text: 'L’aperçu du dossier (mockup d’écran) montrait autrefois un score brut (« 8,5/10 · GO ») sans ses axes ; retiré car « un score décomposé ne tient pas dans un coin de 68 px — montrer un score nu là où ses axes ne peuvent pas l’être est le vrai défaut, pas une contrainte de place ». Seule la version « Contacts qualifiés », qui montre les 6 axes, a le droit d’afficher un score.',
      source: 'apps/website/src/components/AppMockup.tsx:92',
    },
    {
      kind: 'decision',
      text: 'La 4ᵉ tuile de l’aperçu (Sites prioritaires) montre un verdict qualitatif (« Correspondance vérifiée »), jamais un delta chiffré : « le produit ne note pas un site sur 100, il rend des verdicts fits/below/unknown ». Le tableau des sites prioritaires suit la même règle : jamais un « score 92 » inventé, un verdict à trois états (Correspond / Sous votre seuil / À qualifier) — corrigé ici pour reprendre le type et le verdict RÉELS de chaque site (`messages/fr/product.json` clés `sites.types` et `sites.fit`).',
      source: 'apps/website/src/features/product/ProductSites.tsx:80',
    },
    {
      kind: 'decision',
      text: 'Le badge « Exemple » sur l’aperçu du dossier avertit explicitement que les noms affichés (Julien Nicolas, Claire Dubois…) sont une illustration publique, jamais une donnée client réelle.',
      source: 'apps/website/src/components/AppMockup.tsx:130',
    },
    {
      kind: 'decision',
      text: 'Corrigé dans cette maquette : deux badges y étaient dessinés en variante d’alerte (`danger`, `warning`) alors que le code les rend TOUJOURS en `success` (vert) — le badge « Priorité haute » de l’aperçu du dossier (`AppMockup.tsx:186-188`) et la puce de score de chaque contact d’exemple (`ProductContacts.tsx:101-115`, « 92 », « 88 », « 61 sur 100 » : le chiffre ne change jamais la couleur). Aucun des deux n’est un seuil dynamique.',
      source: 'apps/website/src/components/AppMockup.tsx:186',
    },
  ],
}
