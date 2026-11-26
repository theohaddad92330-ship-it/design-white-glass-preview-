import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DISCOVER_RESULT_STATES } from './demo-coverage'

/**
 * #1766 — « et en démonstration, l'écran de recherche montre quoi ? »
 *
 * Le retour d'un client a montré un bandeau « la liste est incomplète » AU-DESSUS
 * d'une liste vide. Le correctif ajoute un troisième état, « Résultat non
 * vérifiable ». La garde PAR TABLE ne pose pas la question de la démonstration :
 * `/discover` n'a aucun jeu de données propre, il interroge les mêmes sources
 * publiques que tout espace. Aucune table neuve ⇒ aucune rougeur possible ⇒ le
 * silence exact qui fait découvrir un écran vide en réunion plutôt qu'en CI.
 *
 * Ce que cette garde prouve, en plus de la couverture :
 *  - elle **LIT** un corpus non vide, et elle le lit DANS LE COMPOSANT qui rend
 *    les états — pas dans une liste recopiée à la main, qui ne voit jamais ce
 *    qui n'y est pas ;
 *  - elle **sait dire NON** : un état de résultat ajouté à l'écran sans décision
 *    de démonstration la fait rougir, en le nommant ;
 *  - elle **n'attrape pas ce qu'elle ne vise pas** : `loading` et `error` sont
 *    des états TRANSITOIRES, pas des états de résultat — ils n'ont rien à
 *    montrer en démonstration et leur absence du classement est légitime.
 *
 * ⚠️ Ne JAMAIS déplacer une entrée vers « vide à dessein » pour faire passer ce
 * test. La raison doit tenir devant quelqu'un qui présente le produit.
 */

const WEB = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'discover', 'view')

/** Les états de RÉSULTAT que l'écran sait rendre, et l'entrée de démo qui y répond.
 *  Un état neuf casse le test tant que personne n'a répondu pour la démonstration. */
const ETATS_DE_RESULTAT: Record<string, string> = {
  emptyTitle: 'aucuneCorrespondance',
  unverifiableTitle: 'resultatNonVerifiable',
  // #2490 / #2496 — rien de reconnu dans la demande, rien de coché.
  unreadableTitle: 'demandeIllisible',
  // #2550.1 — raffinements du même état vide : secteur non exprimé par
  // le registre, filtres empilés qui ne laissent personne.
  emptySectorTitle: 'secteurNonExprime',
  emptyFiltersTitle: 'filtresEmpiles',
  // #3878.1 — une incohérence RÉELLEMENT détectée entre deux critères
  // (secteur coché ET exclu, CA minimum au-dessus du maximum), jamais
  // déduite du seul nombre de critères actifs.
  emptyInconsistentTitle: 'criteresIncoherents',
  // #3941.5 — filtre « Augmentation de capital » actif, aucune annonce
  // BODACC B datée pour ces critères : l'écran le dit au lieu de rendre
  // des cartes sans le signal.
  emptyCapitalTitle: 'aucuneAugmentationCapital',
  // #4317.2 (décision n°3, 19/10/2026) — le champ « Compétences » filtre et ne
  // laisse personne : l'écran nomme la compétence au lieu d'un vide anonyme.
  emptySkillsTitle: 'competencesSansCorrespondance',
  // #4627 — des comptes trouvés, tous écartés ou masqués : la cause n'est pas un filtre d'affichage.
  emptySetAsideTitle: 'tousEcartes',
  // #5203 (lot 786) — le filtre « Besoins connus » retire toutes les cartes et le dit.
  emptyNeedsTitle: 'filtreBesoinsVide',
}

/** Transitoires : ils ne portent aucun résultat, donc rien à montrer en démo. */
const ETATS_TRANSITOIRES = ['loadingTitle', 'errorTitle']

function titresRendus(): string[] {
  const source = readFileSync(join(WEB, 'DiscoverStates.tsx'), 'utf8')
  return [...source.matchAll(/states\.(\w*Title)/g)].map(match => match[1])
}

describe('couverture démo — les états de résultat de /discover (#1766)', () => {
  it('LIT un corpus non vide — sans ça, la garde passerait au vert sur du vide', () => {
    const titres = titresRendus()
    expect(titres.length).toBeGreaterThan(0)
    expect(Object.keys(DEMO_DISCOVER_RESULT_STATES).length).toBeGreaterThan(0)
    // Le contrôle positif : les deux états de résultat sont bien rendus par le
    // composant. S'ils disparaissaient, tout le reste du fichier serait vert
    // sans rien vérifier.
    expect(titres).toEqual(expect.arrayContaining(Object.keys(ETATS_DE_RESULTAT)))
  })

  it('classe CHAQUE état de résultat rendu par l’écran', () => {
    // Si ce test tombe : un état a été ajouté à `DiscoverStates.tsx` sans que
    // personne ait répondu « et en démonstration, ça montre quoi ? ».
    // Le nom du fautif est DANS la valeur comparée — sinon l'échec dirait
    // « false n'est pas true » et il faudrait le déboguer.
    const nonClasses = titresRendus()
      .filter(titre => !ETATS_TRANSITOIRES.includes(titre))
      .filter(titre => !ETATS_DE_RESULTAT[titre])
    expect(nonClasses).toEqual([])
  })

  it('classe aussi les deux états que le composant d’états ne rend PAS', () => {
    // « Des résultats » et « Résultats partiels » vivent dans la liste et dans
    // `DegradedBanner`, pas dans `DiscoverStates`. Les oublier laisserait deux
    // tiers de l'écran hors de la question.
    expect(Object.keys(DEMO_DISCOVER_RESULT_STATES).sort()).toEqual(
      [
        'aucuneAugmentationCapital',
        'aucuneCorrespondance',
        'competencesSansCorrespondance',
        'criteresIncoherents',
        'demandeIllisible',
        'filtresEmpiles',
        'filtreBesoinsVide',
        'resultatNonVerifiable',
        'resultatsListes',
        'resultatsPartiels',
        'secteurNonExprime',
        'tousEcartes',
      ].sort(),
    )
    expect(readFileSync(join(WEB, 'DegradedBanner.tsx'), 'utf8').length).toBeGreaterThan(0)
  })

  it('exige une raison SUBSTANTIELLE pour tout état laissé vide à dessein', () => {
    const trapCourtes = Object.entries(DEMO_DISCOVER_RESULT_STATES)
      .filter(([, entree]) => entree.state !== 'seede' && entree.reason.length <= 200)
      .map(([etat]) => etat)
    expect(trapCourtes).toEqual([])
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un état seedé n’a pas à se justifier longuement', () => {
    // Témoin de cas légitime voisin : une garde « toute entrée porte 200
    // caractères » aurait exigé une dissertation pour un état qui s'atteint
    // tout seul. Trois des quatre entrées sont `seede`.
    const seedes = Object.values(DEMO_DISCOVER_RESULT_STATES).filter(entree => entree.state === 'seede')
    expect(seedes.length).toBeGreaterThan(0)
  })

  it('n’attrape PAS les états transitoires — ils ne portent aucun résultat', () => {
    // Second témoin : `loading` et `error` sont rendus par le même composant et
    // n'ont AUCUNE entrée de démo. C'est légitime, et la garde doit le tolérer.
    for (const transitoire of ETATS_TRANSITOIRES) {
      expect(titresRendus()).toContain(transitoire)
      expect(Object.keys(ETATS_DE_RESULTAT)).not.toContain(transitoire)
    }
  })

  it('le troisième état existe VRAIMENT dans l’écran — pas seulement dans le classement', () => {
    // Une entrée de couverture qui décrit un état que le code ne rend pas est
    // un audit documentaire, pas le code. On relit la source.
    const discover = readFileSync(join(WEB, 'Discover.tsx'), 'utf8')
    expect(discover).toContain('unverifiableReasons')
    expect(discover).toContain('candidates.length === 0')
  })
})
