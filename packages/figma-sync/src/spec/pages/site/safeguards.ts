import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /safeguards — les garde-fous du produit. Six sections dans l'ordre réel de
 * `apps/website/src/app/[locale]/safeguards/page.tsx:31-47` : Hero, quatre
 * `ClaimSection` (copilot/guardrails/review/refusals), Cta. Textes FR :
 * `apps/website/messages/fr/safeguards.json`.
 */

const claim = (title: string, paragraph: string, items: [string, string][]): Block => ({
  type: 'stack',
  direction: 'column',
  gap: '5',
  padding: '10',
  children: [
    { type: 'text', text: title, style: 'title' },
    { type: 'text', text: paragraph, style: 'body', color: 'text/secondary' },
    {
      type: 'stack',
      direction: 'column',
      gap: '3',
      children: items.map(
        ([label, desc]): Block => ({
          type: 'component',
          component: 'DataRow',
          props: { content: { label, value: desc } },
        }),
      ),
    },
  ],
})

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  padding: '10',
  children: [
    { type: 'text', text: 'Garde-fous', style: 'label', color: 'text/accent' },
    { type: 'text', text: 'Ce que nous ne ferons pas à votre place.', style: 'display' },
    {
      type: 'text',
      text: "Un logiciel commercial peut écrire à vos clients plus vite que vous. La vraie question n'est pas de savoir s'il en est capable — c'est de savoir ce qui l'en empêche. Cette page décrit ce que BellumAI refuse de faire, et ce qui, dans le produit, l'en empêche.",
      style: 'body',
      color: 'text/secondary',
    },
  ],
}

const copilot = claim(
  'Laura prépare. Vous envoyez.',
  "Laura est votre copilote d'intelligence commerciale. Elle rassemble, elle recoupe, elle rédige. Elle n'a aucun chemin d'écriture vers votre messagerie : quand elle propose un message, elle rend une proposition, et c'est votre geste qui dépose le brouillon.",
  [
    [
      'Aucun outil de Laura ne sait envoyer.',
      "Le geste qui prépare un message rend une proposition. Il n'existe pas d'appel d'envoi derrière, et donc rien à désactiver.",
    ],
    [
      'Le corps de vos messages ne remonte pas au modèle.',
      "Pour rédiger une relance, Laura reçoit l'interlocuteur, l'objet et depuis combien de temps la conversation est silencieuse. Pas le texte de vos échanges.",
    ],
  ],
)

const guardrails = claim(
  'Les six garde-fous des relances automatiques',
  "Une seule famille d'automatisations atteint un client sans qu'un commercial ait cliqué juste avant : les relances de suivi, et seulement si votre espace les a armées. Six garde-fous les encadrent.",
  [
    ['Une réponse ferme la séquence.', "Dès que votre interlocuteur répond, la relance s'arrête — définitivement."],
    ['Une relance, jamais une cadence.', 'Un message automatique au maximum par cible et par règle.'],
    ['Le désabonnement est relu à chaque envoi.', 'Jamais depuis un cache.'],
    ['Heures calmes.', 'Rien avant 8 h, rien après 19 h, rien le week-end.'],
    ['Un plafond par espace et par jour.', '25 relances automatiques au maximum.'],
    ['Rien n’est armé par défaut.', "Chaque relance automatique est éteinte tant qu'un humain ne l'a pas allumée."],
  ],
)

const review = claim(
  'Et même armée, une relance vous est soumise.',
  "Les six garde-fous répondent à la question « cette cible est-elle relançable ? ». Ils ne répondent pas à « ce texte-là peut-il partir chez ce client-là aujourd'hui ? ». C'est une autre question, et c'est un humain qui y répond.",
  [
    ['Ce que vous lisez est ce qui part.', "L'objet et le corps sont figés au moment où la demande vous est soumise."],
    ['Un refus vaut pour toujours.', 'Sur cette cible, la relance refusée ne sera pas re-proposée le lendemain.'],
    ['Une demande non tranchée périme.', 'Passé 3 jours, elle ne part pas.'],
  ],
)

const refusals = claim(
  'Ce que cette page ne fait pas non plus.',
  "Une page qui explique ce qu'on refuse de faire se juge d'abord à ce qu'elle s'autorise à écrire.",
  [
    ['Aucun chiffre de marché.', 'Les seuls nombres écrits ici sont des constantes du produit.'],
    ['Aucune date de livraison.', "Ce qui est décrit sur cette page fonctionne aujourd'hui."],
    ["Aucun nom d'éditeur concurrent.", 'On nomme des capacités, jamais les outils des autres.'],
  ],
)

const cta: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '4',
    align: 'center',
    padding: '10',
    children: [
      { type: 'text', text: 'Vous préférez vérifier ?', style: 'title' },
      {
        type: 'text',
        text: 'La démonstration montre le produit tel qu’il est, sur un jeu de données étiqueté comme fictif.',
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
            props: { variant: 'default', content: { label: 'Essayer la démo' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Découvrir le produit' } },
          },
        ],
      },
    ],
  },
]

export const safeguardsPage: PageSpec = {
  id: 'site/safeguards',
  surface: 'site',
  domain: 'garde-fous',
  route: 'apps/website/src/app/[locale]/safeguards/page.tsx',
  title: 'Garde-fous',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [copilot, guardrails, review, refusals],
    cta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'Chaque section reste en une seule colonne de lecture (comme le texte long des pages légales) à toutes les largeurs — pas de grille à casser.',
      'apps/website/src/features/safeguards/ClaimSection.tsx:1',
    ),
    {
      kind: 'decision',
      text: 'Aucun chiffre de marché ni date de livraison n’est écrit sur cette page (section « Ce que cette page ne fait pas non plus ») — cohérent avec la doctrine « jamais de probabilité ni de chiffre inventé ».',
      source: 'apps/website/messages/fr/safeguards.json:78',
    },
  ],
}
