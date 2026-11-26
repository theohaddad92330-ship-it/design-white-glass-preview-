import { DEMO_COLLEAGUES } from './demo-dataset'

/**
 * #4158.28 / #4158.30 / #4158.31 — LA CONTINUITÉ D'ÉQUIPE, MONTRÉE EN SALLE DE DÉMONSTRATION.
 *
 * Craft rule n°9 : une fonctionnalité visible doit l'être aussi devant un prospect, avec des données
 * FICTIVES. Trois choses, chacune posée par un geste que le produit réel fait :
 *
 *  - un digest manager (la cloche, type `manager_digest`) — des dénombrements d'équipe, aucun nom ;
 *  - un modèle de séquence PARTAGÉ avec l'équipe, avec son auteur ;
 *  - une action DÉLÉGUÉE avec sa note de contexte.
 *
 * Le collègue fictif est un des trois membres de L2 (`DEMO_COLLEAGUES`, #4158.13) : l'auteur désigné par
 * `created_by` / `handoff_by` est donc un vrai membre de la salle, son nom se lit à l'écran. Aucun
 * identifiant n'est défini ici : `DEMO_COLLEAGUES` est la seule source (un test le prouve).
 */

/** Le collègue fictif qui a écrit le modèle partagé et délégué l'action (Léa, de `DEMO_COLLEAGUES`). */
export const DEMO_TEAM_COLLEAGUE_ID: string = (() => {
  const colleague = DEMO_COLLEAGUES.find(candidate => candidate.key === 'lea')
  if (!colleague) throw new Error('Collègue fictif « lea » absent de DEMO_COLLEAGUES')
  return colleague.userId
})()

/** La note de contexte de la délégation — celle qu'un commercial écrirait en passant la main. */
export const DEMO_HANDOFF_NOTE =
  'Le directeur technique a demandé une démo la semaine dernière : relance-le avant jeudi, le budget est ouvert jusqu’à fin du trimestre.'

/** Le digest du lundi : des dénombrements d'équipe, jamais un nom ni une probabilité. */
export const DEMO_MANAGER_DIGEST = {
  title: 'La semaine de ton équipe',
  body: [
    'À arbitrer : 3 comptes sans responsable · 2 interventions ouvertes.',
    'Équipe : 14 actions faites cette semaine, 5 en retard.',
    'En veille : 7 comptes.',
  ].join('\n'),
  link: '/team',
} as const

/**
 * #4158.50 — DEUX exemples d'équipe dans la bibliothèque de messages de la salle : l'un écrit par
 * l'occupant, l'autre par le collègue fictif (Léa). Tous deux partagés avec l'équipe
 * (`visibility = 'team'`), `a_revoir` + `inspiration` — comme ce que produit le bouton « Ajouter un
 * exemple » (jamais proposés comme messages prêts à envoyer). Textes FICTIFS, sans chiffre ni client.
 */
export const DEMO_TEAM_MESSAGE_EXAMPLES: readonly { author: 'owner' | 'colleague'; title: string; body: string }[] = [
  {
    author: 'colleague',
    title: 'Relance après démo — rappel du prochain pas',
    body: 'Bonjour {{Prénom du contact}}, merci pour l’échange de la semaine dernière. Je te propose un point de 20 minutes pour cadrer la suite côté {{Entreprise}} : jeudi ou vendredi ?',
  },
  {
    author: 'owner',
    title: 'Prise de contact — lien avec un projet en cours',
    body: 'Bonjour {{Prénom du contact}}, j’ai vu que {{Entreprise}} préparait {{projet}}. Nous accompagnons des équipes sur ce type de sujet : un court échange pour voir si cela a du sens chez vous ?',
  },
]
