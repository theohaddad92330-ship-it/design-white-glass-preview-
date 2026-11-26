/**
 * Les 22 objections du §4.8 du PDF 10, et la RÉACTION attendue de chacune.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * « Aucune ne se traite par une récitation. » C'est le défaut n°6 du transcript
 * test, et le plus révélateur de tous : à « t'es trop cher », Laura a répondu
 * « je note » puis a récité la grille tarifaire complète — alors que le visiteur
 * n'avait pas demandé les prix. Réciter le tarif CONFIRME l'objection au lieu de
 * la traiter, et la bonne réaction est une question : *cher par rapport à quoi ?*
 *
 * Deux objections portent une interdiction absolue, marquée `forbids` :
 * la n°1 (jamais la grille) et la n°12 (jamais un chiffre inventé). Les autres
 * sont des angles que Laura reformule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE `theme` A AJOUTÉ (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Le rapport du 17/08 demande une bibliothèque VIVANTE, « enrichie chaque
 * semaine à partir des vraies conversations », et le §9 un « top 20 des
 * objections non couvertes ». Pour savoir ce qui n'est PAS couvert, il faut que
 * la couverture se lise quelque part — sinon elle se devine, et une couverture
 * devinée déclare couvert tout ce qu'on n'a pas regardé.
 *
 * Chaque entrée déclare donc le THÈME qu'elle traite, et `coveredObjectionThemes()`
 * en dérive la couverture. Un seul endroit : ajouter une objection suffit à
 * retirer son thème de la liste des angles morts, sans toucher à une seconde
 * table qui aurait divergé au troisième ajout.
 *
 * ⚠️ **Rien n'ajoute d'entrée ici tout seul.** Le thème remonte, l'entrée
 * s'écrit à la main. C'est la même règle que « on propose une fusion de
 * doublons, on ne fusionne jamais » : ce fichier part dans le prompt de Laura,
 * donc dans ce que le produit dit à des prospects.
 */

import type { ObjectionTheme } from './objection-coverage'

type Objection = {
  /** Le sujet traité — sert à savoir ce que la bibliothèque NE couvre pas. */
  theme: ObjectionTheme
  /** Ce que le visiteur dit, dans ses mots. */
  says: string
  /** Ce que Laura fait — jamais une phrase à recopier telle quelle. */
  reacts: string
  /** L'interdit qui accompagne l'objection, quand il y en a un. */
  forbids?: string
}

export const OBJECTIONS: readonly Objection[] = [
  {
    theme: 'price',
    says: "C'est trop cher",
    reacts: '« Cher par rapport à quoi ? Tu compares à un outil que tu as déjà, ou à un budget ? »',
    forbids: 'ne JAMAIS donner la grille tarifaire sur une objection prix',
  },
  {
    theme: 'competitor',
    says: 'On a déjà un CRM',
    reacts: '« Lequel ? Et il vous sert à quoi exactement — à stocker ou à décider ? »',
  },
  {
    theme: 'competitor',
    says: 'On a déjà Boond',
    reacts:
      "« Alors on ne le remplace pas. Boond gère votre delivery. Ce qu'il ne fait pas, c'est vous dire quel compte travailler lundi. C'est là qu'on intervient. »",
  },
  {
    theme: 'trust_ai',
    says: "L'IA, ça hallucine",
    reacts:
      "« Tu as raison de t'en méfier. Chez nous, chaque affirmation porte sa source et sa date. Si on ne sait pas, on écrit qu'on ne sait pas. Tu veux voir à quoi ça ressemble ? »",
  },
  {
    theme: 'adoption',
    says: 'Mes commerciaux ne rempliront jamais un CRM de plus',
    reacts: "« C'est exactement pour ça que le produit ne demande aucune saisie. Il lit ce qui existe déjà. »",
  },
  {
    theme: 'fit_size',
    says: 'On est trop petits',
    reacts: '« Vous êtes combien ? » puis adapter — sous 5 consultants, être honnête sur le fit.',
  },
  {
    theme: 'fit_size',
    says: 'On est trop gros',
    reacts:
      '« Vous avez combien de commerciaux ? » — au-delà de 150, dire franchement que ce n’est pas le cœur de cible.',
  },
  {
    theme: 'timing',
    says: "Je n'ai pas le temps",
    reacts: '« Je comprends. Deux minutes : c’est quoi ton problème numéro un en ce moment ? »',
  },
  {
    theme: 'timing',
    says: 'Envoie-moi une doc',
    reacts: '« Je peux, mais tu ne la liras pas. Dis-moi ce qui t’intéresse, je te réponds en trois lignes. »',
  },
  {
    theme: 'timing',
    says: 'Je vais y réfléchir',
    reacts: '« Bien sûr. Il te manque quoi pour trancher ? »',
  },
  {
    theme: 'competitor',
    says: "C'est quoi la différence avec [concurrent] ?",
    reacts: 'Nommer honnêtement ce que le concurrent fait mieux, puis la différence réelle. Jamais de dénigrement.',
  },
  {
    theme: 'proof',
    says: 'Vous avez combien de clients ?',
    reacts: "« Je préfère ne pas te sortir un chiffre marketing. L'équipe te dira où on en est précisément. »",
    forbids: 'ne JAMAIS inventer un chiffre de clients, de croissance ou de ROI',
  },
  {
    theme: 'integration',
    says: 'Ça se connecte à mon CRM ?',
    reacts: '« Lequel ? » puis répondre depuis les statuts réels de fonction.',
  },
  {
    theme: 'data_privacy',
    says: 'Mes données vont où ?',
    reacts:
      "Réponse factuelle, lien vers la page confidentialité, proposition de parler à l'équipe pour un engagement contractuel.",
  },
  {
    theme: 'adoption',
    says: "C'est encore un outil de plus",
    reacts:
      '« Oui, et c’est le vrai risque. La question à te poser : qu’est-ce que tu supprimerais si celui-là marchait ? »',
  },
  {
    theme: 'proof',
    says: "On a essayé un truc comme ça, ça n'a pas pris",
    reacts: '« Qu’est-ce qui a coincé ? L’adoption, la donnée, ou le résultat ? »',
  },
  {
    theme: 'support',
    says: 'Je veux parler à un humain',
    reacts: 'Qualifier d’abord, transmettre ensuite — la règle du §4.9.',
  },
  {
    theme: 'proof',
    says: 'Vous êtes une startup, vous serez là dans deux ans ?',
    reacts: "Honnêteté : ne pas promettre. Proposer d'en parler avec l'équipe.",
  },
  {
    theme: 'adoption',
    says: 'Ça remplace mes commerciaux ?',
    reacts: '« Non. Ça leur enlève ce qui n’est pas de la vente. »',
  },
  {
    theme: 'price',
    says: 'Il me faut un devis',
    reacts: "Qualifier la taille d'équipe et le besoin avant de renvoyer vers l'équipe.",
  },
  {
    theme: 'legal',
    says: "C'est conforme RGPD ?",
    reacts: 'Répondre depuis la base publique, ne jamais improviser une conformité juridique.',
  },
  {
    theme: 'legal',
    says: 'Vous faites du scraping LinkedIn ?',
    reacts: '« Non, volontairement. Ce serait ton compte qui serait suspendu, pas le nôtre. »',
  },
]

/**
 * Les thèmes que la bibliothèque couvre AUJOURD'HUI.
 *
 * Dérivé des entrées, jamais déclaré à côté : une seconde liste aurait divergé
 * au troisième ajout, et l'écart se serait lu « ce thème est couvert » alors
 * qu'aucune entrée ne le traite.
 */
export function coveredObjectionThemes(): Set<ObjectionTheme> {
  return new Set(OBJECTIONS.map(objection => objection.theme))
}

/** Le bloc injecté dans le prompt. Court : ce sont des réactions, pas un script. */
export function renderObjections(): string {
  return OBJECTIONS.map(objection => {
    const forbid = objection.forbids ? `\n  ⚠ ${objection.forbids}` : ''
    return `· « ${objection.says} » → ${objection.reacts}${forbid}`
  }).join('\n')
}
