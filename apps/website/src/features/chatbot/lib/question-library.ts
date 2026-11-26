/**
 * Les 70 questions du §4.7 du PDF 10 — la matière de la qualification.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Ce sont des ANGLES, pas un script. Le §4.7 le pose en une ligne : « Laura en
 * choisit une, la reformule, ne les enchaîne jamais mécaniquement ». Une banque
 * de questions récitée dans l'ordre est un formulaire — c'est-à-dire le défaut
 * n°5 du transcript test, avec plus de variété.
 *
 * ⚠️ **Le « vous » de « Vous êtes combien de consultants ? » est un PLURIEL, pas
 * un vouvoiement.** Il désigne l'entreprise, et il reste juste même quand Laura
 * tutoie la personne. La conversion mécanique de ces questions au tutoiement
 * produirait « Tu es combien de consultants ? », qui n'est pas du français — le
 * dépôt connaît ce piège depuis la conversion des 718 libellés de l'app.
 * On garde donc les formulations telles quelles, et le prompt dit à Laura
 * d'adapter la forme d'adresse au moment de poser.
 */

import type { ScoringAxis } from './routing'

/** Les familles du §4.7. `opening`, `challenge` et `closing` ne renseignent
 *  aucun axe : elles ouvrent, mettent en tension et concluent. */
type QuestionFamily = ScoringAxis | 'opening' | 'challenge' | 'closing'

export const QUESTION_LIBRARY: Readonly<Record<QuestionFamily, readonly string[]>> = {
  opening: [
    "Qu'est-ce qui t'amène ?",
    'Tu cherches quelque chose de précis, ou tu regardes ?',
    'Tu es tombé sur nous comment ?',
    "C'est pour toi ou pour ton équipe ?",
    'Il te manque quoi aujourd’hui ?',
    'Tu es sur la page tarifs — tu compares ?',
    'Tu veux que je te fasse le tour en trois lignes, ou tu as une question précise ?',
    'Tu regardes ça dans quel univers ?',
  ],

  companyType: [
    'Tu es dans quel type de boîte ? ESN, cabinet, autre chose ?',
    'Vous faites de la prestation ou du recrutement ?',
    'Vous êtes sur quel secteur principal ?',
    'Vous êtes en direct chez vos clients, ou en rang 2 ?',
    'Vous travaillez plutôt en régie ou au forfait ?',
  ],

  teamSize: [
    'Vous êtes combien de consultants ?',
    'Vous avez combien de personnes qui vendent ?',
    'Vous êtes basés où ?',
  ],

  persona: [
    'Et toi, tu fais quoi là-dedans ?',
    'Tu es côté business ou côté recrutement ?',
    'Tu portes un portefeuille toi-même ?',
    'Tu gères une équipe ?',
  ],

  decision: [
    "C'est toi qui décides sur ce genre d'outil, ou il y a d'autres personnes ?",
    "Qui d'autre regarderait ça avec toi ?",
    'Tu as déjà déployé un outil comme ça avant ?',
    'Ça se passerait comment chez vous, une décision comme celle-là ?',
  ],

  painFit: [
    "Qu'est-ce qui te prend le plus de temps aujourd'hui ?",
    'Sur quoi vous perdez le plus d’affaires : le sourcing, le délai, ou le prix ?',
    'Tes commerciaux passent combien de temps à chercher de l’info avant un rendez-vous ?',
    'Tu as combien de consultants en intercontrat en ce moment ?',
    'Combien de temps il vous faut entre un besoin client et une shortlist ?',
    'Vos dossiers de compétences, vous les faites comment ?',
    'Vous relancez comment ceux qui ne répondent pas ?',
    'Tu sais, là tout de suite, quels comptes n’ont aucune action prévue ?',
    'Vos CRA, ça se passe bien en fin de mois ?',
    'Vous mesurez votre marge par mission ?',
    "Qu'est-ce qui t'énerve le plus dans ton outil actuel ?",
    "S'il y avait une seule chose à supprimer de ta semaine, ce serait quoi ?",
  ],

  tooling: [
    'Vous travaillez avec quoi aujourd’hui ?',
    'Vous avez un CRM ou c’est Excel ?',
    'Boond, Everwin, Stafiz, ou autre chose ?',
    'Vos mails, c’est Google ou Microsoft ?',
    'Vos CV, ils sont où ?',
    'Vous avez un ATS séparé du CRM ?',
    'Ça vous coûte combien par mois, l’ensemble ?',
    "Qu'est-ce que vous garderiez, et qu'est-ce que vous jetteriez ?",
  ],

  trigger: [
    "Qu'est-ce qui fait que tu regardes ça maintenant, plutôt qu’il y a six mois ?",
    'Il s’est passé quelque chose de particulier ?',
    'Vous avez un objectif de croissance cette année ?',
    'Vous recrutez des commerciaux ?',
    "C'est un projet d'équipe ou une initiative perso ?",
  ],

  horizon: [
    'Tu regardes ça pour quand ?',
    'Vous avez un budget identifié ou tu explores ?',
    'Il y a une échéance qui te met la pression ?',
    'Si ça marche, ça change quoi concrètement pour toi ?',
    'Et si tu ne fais rien, il se passe quoi ?',
  ],

  // Le §4.5 appelle ce temps « le plus important » : c'est là que la personne
  // comprend quelque chose sur SON problème. Ces questions ne cherchent pas une
  // information, elles mettent en tension ce qui vient d'être dit.
  challenge: [
    'Tu dis que tu manques de temps — c’est le sourcing ou le commercial qui déborde ?',
    'Vous perdez des affaires faute de profils, ou faute d’avoir su qu’elles existaient ?',
    'Si je te dis que la moitié de tes comptes n’a aucune action prévue, ça te parle ou ça te surprend ?',
    'Ton intercontrat, tu le découvres quand ?',
    'Vous avez déjà raté un renouvellement parce que personne n’avait vu la date de fin ?',
    'Quand un consultant se libère, il te faut combien de temps pour le repositionner ?',
    'Ton CRM, quelqu’un le remplit vraiment ?',
    'Tu as combien de références clients que tu peux citer dans un appel d’offres, là, tout de suite ?',
    'Si ton meilleur commercial partait demain, tu récupérerais quoi de son travail ?',
    "C'est un problème d'outil ou un problème de méthode ?",
  ],

  closing: [
    'Ça t’irait de voir ça sur un cas concret ?',
    'Tu préfères regarder par toi-même ou qu’on t’en parle ?',
    'Tu veux que je te bloque un créneau avec quelqu’un de l’équipe ?',
    'Je t’envoie un truc à lire, ou on en parle ?',
    'Il te manque quoi pour décider ?',
    "Qu'est-ce qui pourrait te faire dire non ?",
  ],
}

/** Le nombre total, calculé — le §4.7 en annonce 70. */
export const QUESTION_COUNT = Object.values(QUESTION_LIBRARY).reduce((total, list) => total + list.length, 0)

/** Le bloc injecté dans le prompt : les questions de l'axe à explorer, plus les
 *  questions de challenge, qui servent à tous les tours. Injecter les 70 à
 *  chaque appel coûterait un contexte entier pour six lignes utilisables. */
export function questionsFor(axis: ScoringAxis | null): string {
  const families: QuestionFamily[] = axis ? [axis, 'challenge'] : ['challenge', 'closing']
  return families
    .map(family => `${family} :\n${QUESTION_LIBRARY[family].map(question => `· ${question}`).join('\n')}`)
    .join('\n\n')
}
