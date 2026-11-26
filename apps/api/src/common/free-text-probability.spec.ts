import { detectProbabilityMention } from './free-text-probability'

/**
 * #2231 — le prompt du Profiler interdit la PROBABILITÉ depuis le 13/09/2026
 * (`039ea2e8c`), mais les `profiles.profile_context` écrits AVANT ce commit
 * portent encore le texte interdit : corriger un prompt ne corrige pas ce qui
 * est déjà écrit. Ce détecteur répond à « ce texte libre porte-t-il une
 * probabilité ? » — jamais sur un NOM de champ (c'est GA-64,
 * `apps/api/src/architecture/no-persisted-probability.spec.ts`, qui tient ce
 * corpus-là), toujours sur la PROSE déjà générée.
 *
 * Même principe que GA-64 : une CO-OCCURRENCE dans le même segment de phrase,
 * jamais un mot seul. Bannir le mot « probabilité » lui-même casserait le
 * témoin légitime le plus proche : `planRiskSchema.probability`, la
 * vraisemblance QUALITATIVE d'un risque (haute/moyenne/basse), que GA-64 laisse
 * déjà explicitement passer (`probabilityOffence('probability') === null`).
 */
describe('detectProbabilityMention — probabilité dans du texte libre déjà généré', () => {
  it('sait dire NON : détecte les formulations interdites, en FR et EN', () => {
    const interdits = [
      'Ce compte a une probabilité de closing élevée ce trimestre.',
      'Il y a une bonne chance de signer ce deal avant la fin du mois.',
      'Nous estimons 72 % de réussite sur cette opportunité.',
      'Le prospect montre une propension à signer forte.',
      'There is a high probability of closing this deal.',
      'Good chance of winning this deal this quarter.',
      '60% success rate expected on this account.',
      'Le score évalue la probabilité de conclure rapidement.',
    ]
    for (const texte of interdits) {
      expect(detectProbabilityMention(texte)).not.toBeNull()
    }
  })

  it("nomme CE QU'elle a reconnu — une garde qui dit seulement NON se contourne", () => {
    const mention = detectProbabilityMention('Ce compte a une probabilité de closing élevée.')
    expect(mention?.kind).toBe('probabilite_affaire')
    expect(mention?.match.length).toBeGreaterThan(0)

    const propension = detectProbabilityMention('Le prospect montre une propension à signer forte.')
    expect(propension?.kind).toBe('propension_signer')
  })

  it("ne s'attrape pas sur ce qu'elle ne vise pas — les témoins légitimes de GA-64", () => {
    // a) la vraisemblance QUALITATIVE d'un risque (haute/moyenne/basse) —
    //    `planRiskSchema.probability`, que GA-64 laisse déjà explicitement
    //    passer sur le NOM ; ici c'est la PROSE équivalente.
    expect(
      detectProbabilityMention("Risque d'attrition identifié : probabilité moyenne, à surveiller de près."),
    ).toBeNull()

    // b) un taux MESURÉ sur des affaires closes — un fait historique n'est pas
    //    une prédiction (même phrase que `bellum_advisor.py:401`).
    expect(
      detectProbabilityMention('Cite le taux de transformation mesuré sur les affaires closes (win_rate 42 %).'),
    ).toBeNull()

    // c) « probable » comme VALEUR DE CONFIANCE, pas une probabilité prédite.
    expect(
      detectProbabilityMention('Origine du signal : probable (confiance modérée), à confirmer avant action.'),
    ).toBeNull()

    // d) la virgule ne sépare pas un interdit en deux moitiés innocentes :
    //    reste banni même écrit « ni probabilité, ni chance de signer ».
    expect(
      detectProbabilityMention('AUCUNE PROBABILITÉ. Ni probabilité, ni chance de signer, ni pourcentage de réussite.'),
    ).not.toBeNull()
  })

  it('rend `null` sur un texte vide ou sans aucun mot suspect', () => {
    expect(detectProbabilityMention('')).toBeNull()
    expect(detectProbabilityMention('Vous êtes une ESN "Data & Cloud" de 30 consultants.')).toBeNull()
  })
})
