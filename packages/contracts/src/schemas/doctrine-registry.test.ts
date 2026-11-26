import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DOCTRINE_ENFORCEMENTS,
  DOCTRINE_KEYS,
  DOCTRINE_REGISTRY,
  INVARIANTS,
  INVARIANT_KEYS,
  declaredHolders,
  doctrineEntrySchema,
  doctrineGaps,
  doctrinesForPack,
  invariantSchema,
} from './doctrine-registry.js'
import { MANAGER_KPIS } from './manager-kpi.js'

/**
 * GA-38 — le registre de doctrine ne peut pas devenir une brochure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un registre déclaratif a un défaut connu : il vieillit en silence. Personne ne
 * le relit, le code bouge, et il finit par décrire un produit qui n'existe plus
 * — ce qui est PIRE que son absence, parce qu'on s'y fie pour ne pas rouvrir un
 * débat.
 *
 * Ces tests ne peuvent pas vérifier qu'une doctrine est appliquée : seule une
 * relecture le peut. Ils vérifient deux choses qu'aucune relecture ne fait
 * fiablement :
 *
 *  1. **Chaque porteur déclaré EXISTE sur le disque.** C'est l'accident du
 *     24/08 : `provenance.ts` affirmait « c'est exactement ce que le test de
 *     garde `no-blind-record-writes.spec.ts` interdit », et le fichier n'avait
 *     jamais été écrit. Une garde citée mais absente fait croire que le sujet
 *     est tenu.
 *  2. **Le registre reste honnête.** Une doctrine `absent` n'a pas le droit de
 *     citer un porteur, une doctrine non tenue doit NOMMER son écart, et un
 *     registre entièrement vert fait échouer la CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'AUCUNE GARDE NE PEUT FAIRE ICI — ET POURQUOI ON L'ÉCRIT AU LIEU D'EN
 * POSER UNE QUI FERAIT SEMBLANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 29/08/2026, trois entrées se sont révélées plus avancées sur le papier que
 * dans le code : `c19_vocabulaire` niait un écran livré la veille,
 * `c28_seniorite` se déclarait `implemented` sur une règle que rien n'écrit,
 * `c18_manager` annonçait quatorze indicateurs non mesurables là où le
 * catalogue en porte huit. La question s'est donc posée : peut-on GARDER
 * `codeState: 'implemented'` ?
 *
 * **Non, et il vaut mieux l'écrire que le faire mal.** Vérifier qu'une doctrine
 * est appliquée demande de reconnaître une SÉMANTIQUE dans du code — que
 * `cv-parse.service.ts` ne « calcule » pas une séniorité alors qu'il porte le
 * mot `seniority` dans un `switch`, que `WorkspaceLexiconGate` « atteint
 * l'interface ». Une garde qui approcherait ça par des mots-clés serait verte
 * pour toujours sur les cas qui comptent et rouge sur les renommages : elle
 * ferait croire le sujet tenu, ce qui est exactement le défaut qu'on corrige.
 * Six gardes borgnes en deux jours suffisent.
 *
 * Ce qui EST gardable, et qui l'est désormais, c'est la seule affirmation du
 * registre qu'une machine peut lire : un CHIFFRE. Voir « le compte que c18
 * annonce » plus bas — c'était précisément l'entrée fausse, et c'est la seule
 * des trois qu'une garde aurait pu attraper. Les deux autres restent tenues par
 * une relecture, et le registre le dit dans leur `gap` plutôt que de le taire.
 */

/** `packages/contracts/src/schemas/` → quatre niveaux au-dessus = la racine. */
const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

/**
 * Un fichier de TEST, dans les trois conventions du dépôt.
 *
 * ⚠️ `.tsx` compte, et il a manqué jusqu'au 28/08 : la version précédente ne
 * reconnaissait que `.spec.ts` / `.test.ts`, si bien qu'une doctrine tenue par
 * un test de composant React — `PaymentReminderDue.test.tsx`, qui refuse
 * littéralement toute promesse d'envoi — aurait été déclarée sous-testée. Une
 * garde borgne d'un tiers de son corpus dit NON à la mauvaise ligne.
 */
const isTestFile = (path: string): boolean => /\.(spec|test)\.tsx?$/.test(path) || /(^|\/)test_[^/]+\.py$/.test(path)

describe('registre de doctrine — complétude', () => {
  it('décrit les CINQUANTE-SEPT contradictions arbitrées, sans doublon', () => {
    expect(DOCTRINE_REGISTRY).toHaveLength(DOCTRINE_KEYS.length)
    expect(new Set(DOCTRINE_REGISTRY.map(entry => entry.key)).size).toBe(DOCTRINE_KEYS.length)
  })

  it('décrit les ONZE invariants, sans doublon', () => {
    expect(INVARIANTS).toHaveLength(INVARIANT_KEYS.length)
    expect(new Set(INVARIANTS.map(inv => inv.key)).size).toBe(INVARIANT_KEYS.length)
  })

  it('chaque entrée respecte son contrat', () => {
    for (const entry of DOCTRINE_REGISTRY) expect(doctrineEntrySchema.safeParse(entry).success).toBe(true)
    for (const inv of INVARIANTS) expect(invariantSchema.safeParse(inv).success).toBe(true)
  })

  it('chaque doctrine dit ce qu’elle SUPPLANTE — sans quoi le débat rouvre', () => {
    // La formulation morte est la moitié utile de l'arbitrage : elle dit à
    // quelqu'un qui propose l'ancienne version que ce n'est pas une idée neuve.
    const silent = DOCTRINE_REGISTRY.filter(entry => entry.supersedes.trim().length < 20)
    expect(silent.map(entry => entry.key)).toEqual([])
  })
})

describe('registre de doctrine — les porteurs existent VRAIMENT', () => {
  it('lit un corpus non vide', () => {
    // Preuve que la garde regarde quelque chose : sans cette assertion, un
    // registre vidé la ferait passer au vert.
    expect(declaredHolders().length).toBeGreaterThan(40)
  })

  it('chaque fichier déclaré est ouvrable depuis la racine du dépôt', () => {
    const missing = declaredHolders().filter(path => !existsSync(join(REPO_ROOT, path)))
    expect(missing).toEqual([])
  })

  it('la garde sait dire NON — un chemin inventé serait vu', () => {
    // Le contrôle porte sur la MÊME résolution que celle du test au-dessus. Sans
    // cette preuve, une racine mal calculée ferait tout passer (ou tout échouer)
    // pour une raison qui n'a rien à voir avec le registre.
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/doctrine-registry.ts'))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'packages/contracts/src/schemas/garde-qui-nexiste-pas.ts'))).toBe(false)
  })

  it('une doctrine `guarded` cite au moins un TEST — un fichier de code ne garde rien', () => {
    const undertested = [...DOCTRINE_REGISTRY, ...INVARIANTS]
      .filter(entry => entry.enforcement === 'guarded')
      .filter(entry => !entry.holders.some(isTestFile))
      .map(entry => entry.key)
    expect(undertested).toEqual([])
  })

  it('reconnaît les trois conventions de test, et RIEN d’autre', () => {
    // Sans cette assertion, la reconnaissance des tests se casse en silence :
    // elle ne produirait plus d'échec, elle produirait un registre trop
    // indulgent. Les deux dernières lignes sont le NON.
    expect(isTestFile('apps/api/src/modules/chains/chain-catalog.spec.ts')).toBe(true)
    expect(isTestFile('packages/contracts/src/schemas/chain.test.ts')).toBe(true)
    expect(isTestFile('apps/web/src/features/missions/view/PaymentReminderDue.test.tsx')).toBe(true)
    expect(isTestFile('apps/ia/tests/test_country_packs.py')).toBe(true)
    expect(isTestFile('apps/web/src/features/missions/view/PaymentReminderDue.tsx')).toBe(false)
    expect(isTestFile('apps/ia/app/services/langfuse_client.py')).toBe(false)
  })

  it('une doctrine ABSENTE ne cite aucun porteur', () => {
    // Déclarer un porteur pour une règle qui n'est pas écrite est la pire ligne
    // du registre : elle transforme un trou en fausse assurance.
    const lying = DOCTRINE_REGISTRY.filter(entry => entry.codeState === 'absent' && entry.holders.length > 0)
    expect(lying.map(entry => entry.key)).toEqual([])
  })
})

describe('registre de doctrine — honnêteté', () => {
  it('toute règle incomplète ou non tenue NOMME son écart', () => {
    const unexplained = [...DOCTRINE_REGISTRY, ...INVARIANTS].filter(entry => {
      const incomplete = 'codeState' in entry ? entry.codeState !== 'implemented' : false
      return (incomplete || entry.enforcement === 'unenforced') && !entry.gap
    })
    expect(unexplained.map(entry => entry.key)).toEqual([])
  })

  it('reconnaît que tout n’est PAS gardé — un registre tout vert serait faux', () => {
    // Au 28/08/2026 : sur cinquante-sept doctrines, une est absente
    // (`c07_discover_scoring`) et dix-neuf ne sont tenues par aucun test.
    // Ce test tombera le jour où quelqu'un déclarera tout gardé sans avoir écrit
    // la garde — c'est exactement la dérive à voir venir.
    const guarded = [...DOCTRINE_REGISTRY, ...INVARIANTS].filter(entry => entry.enforcement === 'guarded')
    expect(guarded.length).toBeLessThan(DOCTRINE_REGISTRY.length + INVARIANTS.length)
    expect(doctrineGaps().length).toBeGreaterThan(0)
  })

  it('un écart annoncé porte l’archive qui le traite, ou déclare qu’il reste ouvert', () => {
    // `nextPack: null` sur une doctrine incomplète est autorisé — il veut dire
    // « personne ne le reprendra », ce qui est une information. Ce qui est
    // refusé, c'est un écart sans phrase : voir le test précédent.
    const packs = DOCTRINE_REGISTRY.map(entry => entry.nextPack).filter((p): p is NonNullable<typeof p> => p !== null)
    expect(packs.length).toBeGreaterThan(0)
    expect(doctrinesForPack('06').length).toBeGreaterThan(0)
  })

  it('les trois niveaux de tenue sont tous employés', () => {
    // Si le registre n'employait que `guarded`, il ne dirait plus rien : c'est
    // la distinction entre « appliqué » et « tenu » qui fait sa valeur.
    const used = new Set([...DOCTRINE_REGISTRY, ...INVARIANTS].map(entry => entry.enforcement))
    expect([...used].sort()).toEqual([...DOCTRINE_ENFORCEMENTS].sort())
  })
})

describe('registre de doctrine — ce qu’il donne à lire', () => {
  it('#2197.41 — c80 n’est plus `absent` : markInvoiced écrit « déclaré », et le registre le cite', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c80_facture_se_nomme_sa_source')

    expect(entry?.codeState).toBe('partial')
    expect(entry?.holders).toContain('apps/api/src/modules/delivery/invoice-readiness.service.spec.ts')
  })

  it('répond à « peut-on renommer le bloc de vingt points de Discover ? » sans rouvrir le débat', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c07_discover_scoring')

    expect(entry?.codeState).toBe('absent')
    expect(entry?.holders).toEqual([])
    expect(entry?.canonical).toContain('avant de personnaliser le barème')
  })

  it('répond à « peut-on détecter une réponse favorable ? » sans rouvrir le débat', () => {
    // D29 du dossier du 26 août : la source REFUSE « détecter une réponse
    // positive » pendant que `routine-catalog.ts` livre `positive_replies`.
    // Contradiction ouverte, tranchée le 28/08 — le refus est PÉRIMÉ.
    //
    // C'est la seule entrée du registre qui LÈVE un refus au lieu d'en poser
    // un, et c'est précisément pour cela qu'elle doit y figurer : sans elle, la
    // prochaine relecture retire la routine « parce que la source la refuse ».
    // Le test exige que les DEUX moitiés soient écrites — celle qui autorise et
    // celle qui refuse toujours —, parce qu'une entrée qui ne dirait que
    // « autorisé » rouvrirait l'autre débat.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c44_reponse_favorable')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.canonical).toContain('SIGNALER')
    expect(entry?.canonical).toContain('RÉPONDRE')
    expect(entry?.holders).toContain('apps/api/src/modules/routines/routine-catalog.ts')
  })

  it('répond à « peut-on positionner sans consentement ? » — et dit que la SOURCE se contredit', () => {
    // L'entrée la plus utile du lot, parce qu'elle arbitre entre DEUX documents
    // vivants et non entre une source et le code. Si elle ne citait qu'une
    // moitié, la prochaine relecture « corrigerait » le code au nom de l'autre.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c45_consentement_positionnement')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Ce qui est REFUSÉ, et le fait que ce soit le seul refus dur.
    expect(entry?.canonical).toContain('EXPIRÉ')
    expect(entry?.canonical).toContain('SEUL refus dur')
    // Ce qui est AUTORISÉ et journalisé — la moitié qu'un lecteur pressé perd.
    expect(entry?.canonical).toContain('jamais recueilli')
    expect(entry?.canonical).toContain('journalis')
    // Les deux formulations de la source, citées côte à côte.
    expect(entry?.supersedes).toContain('ne peut pas être positionné')
    expect(entry?.supersedes).toContain('PDF-02:246-248')
    expect(entry?.supersedes).toContain('PDF-05:302-303')
    expect(entry?.holders).toContain('apps/api/src/modules/consultants/matching/submission-preflight.spec.ts')
  })

  it('répond à « peut-on afficher le rang d’entrée d’une entité ? » — et cite la garde qui le refuse', () => {
    // Le refus était tenu par OMISSION : `score` voyage jusqu'au client et
    // personne ne le rend. Une omission n'est pas une règle — GA-58 en fait une.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c48_score_entite')

    expect(entry?.enforcement).toBe('guarded')
    expect(entry?.holders).toContain('apps/web/src/architecture/entity-rank-score-stays-internal.test.ts')
  })

  it('les cinq refus du CRM et de l’ATS disent tous ce qui les TIENT', () => {
    // Un refus inscrit « gardé » sans test est pire que non inscrit : il ferme
    // le débat en promettant une garde qui n'existe pas. La vérification
    // générique (« une doctrine `guarded` cite au moins un TEST ») s'applique
    // déjà ; celle-ci vérifie que les cinq clés sont bien là, DANS L'ORDRE et
    // À LEUR PLACE.
    //
    // ⚠️ Le contrôle portait sur `slice(-5)` — « les cinq DERNIÈRES ». C'était
    // vrai le jour où elles ont été écrites et faux dès l'ajout suivant : GA-08
    // exige précisément qu'on ajoute EN FIN, donc ce test se serait cassé au
    // premier respect de la règle qu'il accompagne. Il porte désormais sur leur
    // POSITION, qui est ce qu'on voulait figer.
    const added = [
      'c45_consentement_positionnement',
      'c46_marge_par_client',
      'c47_cout_acces',
      'c48_score_entite',
      'c49_interet_et_adressabilite',
    ] as const
    const start = DOCTRINE_KEYS.indexOf(added[0])
    expect(start).toBeGreaterThan(0)
    expect(DOCTRINE_KEYS.slice(start, start + added.length)).toEqual(added)
    for (const key of added) {
      const entry = DOCTRINE_REGISTRY.find(item => item.key === key)
      expect(entry, `entrée manquante : ${key}`).toBeDefined()
      expect(entry?.gap, `${key} doit NOMMER ce qu'il ne tient pas`).toBeTruthy()
    }
  })

  it('répond à « le board Missions peut-il porter ses propres états ? » — et cite ce qui le refuse', () => {
    // Le refus ne vivait QUE dans une phrase de changelog, et cette phrase
    // disait deux choses dont une est morte : « pas un second pipe » (vrai) et
    // « on n'y déplace donc pas les cartes » (faux depuis le 21/08). Une entrée
    // qui recopierait la seconde ferait RETIRER une fonctionnalité livrée.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c50_second_pipe')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Ce qui est refusé — un troisième jeu d'états — et ce qui ne l'est pas.
    expect(entry?.canonical).toContain('PROJECTION')
    expect(entry?.canonical).toContain("TROISIÈME jeu d'états, pas le geste")
    // La formulation morte est CITÉE : sans elle, quelqu'un la retrouve dans le
    // changelog et croit avoir découvert une régression.
    expect(entry?.supersedes).toContain('On n’y déplace donc pas les cartes')
    expect(entry?.holders).toContain('apps/api/src/architecture/mission-board-owns-no-state.spec.ts')
  })

  it('répond à « faut-il un tableau de bord recruteur ? » — et cite les gardes qui le refusent', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c51_tableau_recruteur')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Les deux écrans partagés sont NOMMÉS : « les mêmes écrans » sans les dire
    // laisserait la question ouverte au premier désaccord.
    expect(entry?.canonical).toContain('/projects/needs')
    expect(entry?.canonical).toContain('/consultants')
    expect(entry?.canonical).toContain('PERMISSION')
    expect(entry?.supersedes).toContain('PDF-02:400-410')
    expect(entry?.holders).toContain('apps/web/src/architecture/no-separate-recruiter-dashboard.test.ts')
    // `managerOnly` reste légitime : l'entrée doit le dire, sinon la prochaine
    // relecture retire une restriction qui, elle, suit son endpoint.
    expect(entry?.gap).toContain('managerOnly')
  })

  /* ═════════════════════════════════════════════════════════════════════════
   * LES SIX REFUS DU COCKPIT ET DU VIVIER, ÉCRITS LE 28/08/2026.
   *
   * Ils ont un trait commun qu'aucun des lots précédents n'avait : ce ne sont
   * pas des refus tirés d'une source, ce sont des CONTRADICTIONS ASSUMÉES avec
   * elle. Le code fait autre chose que ce que PDF-02 demande, délibérément, et
   * la raison ne vivait que dans un commentaire au-dessus de la route ou de la
   * section de JSX concernée.
   *
   * Un commentaire ne se relit pas à la mesure suivante : elle recompte
   * `ABSENT` et quelqu'un re-code ce qui a été refusé. Ces tests exigent donc
   * que chaque entrée porte les DEUX formulations — celle de la source et celle
   * du code — et dise laquelle gagne.
   * ═══════════════════════════════════════════════════════════════════════ */

  it('répond à « un commercial voit-il la capacité ? » — et dit que la source et le code divergent', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c52_capacite_equipe')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Ce que le code fait : `finance:read` SEUL, donc 403 pour un siège `sales`.
    expect(entry?.canonical).toContain('finance:read` SEUL')
    expect(entry?.canonical).toContain('403')
    // Et la raison, qui est la seule chose qui empêche de « corriger » la route.
    expect(entry?.canonical).toContain("n'a pas de propriétaire commercial")
    // Les deux formulations, côte à côte, et laquelle gagne.
    expect(entry?.supersedes).toContain('PDF-02:154-157')
    expect(entry?.holders).toContain('apps/api/src/architecture/finance-scope-is-asked.spec.ts')
  })

  it('répond à « le montant du pipe est-il sous droit financier ? » — et dit pourquoi non', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c53_montant_du_pipe')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // La ligne exacte que `finance:read` protège — c'est elle qui tranche.
    expect(entry?.canonical).toContain('montant VENDU')
    expect(entry?.canonical).toContain('coût CHARGÉ')
    // La source demande que le bloc 1 disparaisse ; il ne disparaît pas.
    expect(entry?.supersedes).toContain('PDF-02:188-190')
    expect(entry?.holders).toContain('apps/api/src/architecture/cockpit-scope-is-owned.spec.ts')
  })

  it('répond à « le tarif cible est-il financier ? » — et sépare le prix de vente des entrées de la marge', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c54_tarif_cible')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Les trois champs GARDÉS sont nommés : sans eux, « les trois tarifs » de la
    // source et « les trois montants » du code se confondent, et ce ne sont pas
    // les mêmes trois.
    expect(entry?.canonical).toContain('min_tjm_cents')
    expect(entry?.canonical).toContain('cost_rate')
    expect(entry?.canonical).toContain('purchase_tjm_cents')
    expect(entry?.supersedes).toContain('PDF-02:227-228')
    expect(entry?.holders).toContain('apps/api/src/modules/consultants/consultant-finance-write.spec.ts')
  })

  it('répond à « le cockpit va-t-il en tête du briefing ? » — et assume le contraire de la source', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c55_cockpit_pas_en_tete')

    expect(entry?.codeState).toBe('implemented')
    // Rien ne tient l'ordre d'un écran : le dire est le seul moyen honnête.
    expect(entry?.enforcement).toBe('held')
    expect(entry?.canonical).toContain('puis se saute')
    expect(entry?.supersedes).toContain('PDF-02:115')
    expect(entry?.gap).toBeTruthy()
    expect(entry?.holders).toContain('apps/web/src/features/briefing/view/BriefingPage.tsx')
  })

  it('répond à « le pipe a-t-il cinq barres ou six ? » — et dit où passent les deux autres', () => {
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c56_etapes_du_pipe')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('guarded')
    // Le refus ne dit pas « cinq » tout court : il dit où vont les deux autres.
    expect(entry?.canonical).toContain('entonnoir')
    expect(entry?.canonical).toContain('intake')
    expect(entry?.supersedes).toContain('PDF-02:124-126')
    expect(entry?.holders).toContain('packages/contracts/src/schemas/project.pipeline.test.ts')
  })

  it('répond à « où se saisit le tarif vendu ? » — et déclare la décision NON confirmée', () => {
    // La seule entrée du registre qui porte une décision produit EN ATTENTE. Elle
    // le dit dans son `gap` plutôt que de se faire passer pour un arbitrage
    // tenu — un refus qui se déguise en doctrine est pire qu'un trou.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c57_tarif_vendu_sur_la_fiche')

    expect(entry?.codeState).toBe('implemented')
    expect(entry?.enforcement).toBe('unenforced')
    expect(entry?.canonical).toContain('missions.daily_rate')
    expect(entry?.supersedes).toContain('PDF-02:227-228')
    // Le mot qui empêche de la citer comme un arbitrage clos.
    expect(entry?.gap).toContain('NON CONFIRMÉE')
    // L'alternative est ÉCRITE : sans elle, la décision se re-pose de zéro.
    expect(entry?.gap).toContain('dernier tarif vendu')
  })

  it('les six refus du cockpit et du vivier sont à leur PLACE, en fin de liste', () => {
    // Même forme que le contrôle des cinq refus CRM/ATS, et pour la même raison :
    // GA-08 exige d'ajouter EN FIN, donc un contrôle écrit en `slice(-6)` se
    // casserait au premier respect de la règle qu'il accompagne.
    const added = [
      'c52_capacite_equipe',
      'c53_montant_du_pipe',
      'c54_tarif_cible',
      'c55_cockpit_pas_en_tete',
      'c56_etapes_du_pipe',
      'c57_tarif_vendu_sur_la_fiche',
    ] as const
    const start = DOCTRINE_KEYS.indexOf(added[0])
    expect(start).toBeGreaterThan(0)
    expect(DOCTRINE_KEYS.slice(start, start + added.length)).toEqual(added)
    for (const key of added) {
      const entry = DOCTRINE_REGISTRY.find(item => item.key === key)
      expect(entry, `entrée manquante : ${key}`).toBeDefined()
      // Chacune est une CONTRADICTION avec la source : elle doit citer la ligne
      // de PDF-02 qu'elle contredit, sans quoi la mesure suivante la recomptera.
      expect(entry?.supersedes, `${key} doit citer la ligne de PDF-02`).toContain('PDF-02:')
    }
  })

  it('répond à « peut-on STOCKER une chance de closing ? » — pas seulement « peut-on l’afficher ? »', () => {
    // Écrit le 29/08 après `passe-b-iteration-3/ARCHIVE-02.md` item 7. L'entrée
    // du 25/08 ne parlait que du score AFFICHÉ ; la source, elle, demande un
    // SCHÉMA — `pdf2.md:373`, `closing_chance` + `closing_chance_axes`, « 0-100
    // + jsonb, calculé ». Le refus le plus répété du produit serait donc revenu
    // par une migration sans contredire une seule ligne du registre.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c26_probabilite')

    expect(entry?.codeState).toBe('implemented')
    // Elle n'est plus seulement TENUE : le NOM est décidable, donc gardable.
    expect(entry?.enforcement).toBe('guarded')
    // Les deux verbes doivent être dans la règle. C'est tout l'écart de l'item 7.
    expect(entry?.canonical).toContain('PERSISTÉ')
    expect(entry?.canonical).toContain('EXPOSÉ')
    // La demande d'origine est CITÉE : sans elle, la prochaine relecture croit
    // à une idée neuve.
    expect(entry?.supersedes).toContain('closing_chance')
    expect(entry?.supersedes).toContain('pdf2.md:373')
    expect(entry?.holders).toContain('apps/api/src/architecture/no-persisted-probability.spec.ts')
    // Et l'écart reste NOMMÉ : ce qui est gardé est le nom, jamais le sens.
    expect(entry?.gap).toContain('NOM')
    expect(entry?.gap).toContain('SENS')
  })

  it('répond à « peut-on afficher une probabilité ? » — oui depuis le 11/10/2026, CALIBRÉE, jamais nue', () => {
    // #4016 L1 — renversement DATÉ : la règle d'origine reste écrite après la
    // nouvelle, et les deux verbes refusés (PERSISTÉ, EXPOSÉ nue) le restent.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c26_probabilite')
    expect(entry?.canonical).toMatch(/^⚠️ RENVERSEMENT DATÉ — 11\/10\/2026/)
    expect(entry?.canonical).toContain('#4016')
    expect(entry?.canonical).toContain('calibratedProbabilitySchema')
    expect(entry?.canonical).toContain('NON ÉVALUABLES')
    expect(entry?.canonical).toContain("RÈGLE D'ORIGINE")
    expect(entry?.holders).toContain('packages/contracts/src/schemas/deal-probability.ts')
    expect(entry?.holders).toContain('apps/web/src/architecture/placement-laws.test.ts')
    expect(entry?.gap).toContain('JUSTESSE')
  })

  /* ═════════════════════════════════════════════════════════════════════════
   * LES TROIS ENTRÉES QUI SE DÉCLARAIENT PLUS AVANCÉES QU'ELLES NE L'ÉTAIENT.
   *
   * Trouvées par les recomptages du 29/08/2026, vérifiées sur le code une par
   * une. Elles partagent un défaut, et c'est le pire que ce registre puisse
   * avoir : **une entrée qui se déclare implémentée alors qu'elle ne l'est pas
   * est pire qu'une entrée absente**. C'est la garde borgne, au niveau de la
   * doctrine — on s'y fie pour NE PAS rouvrir un débat, donc une entrée fausse
   * ferme un débat qui aurait dû rester ouvert.
   *
   * GA-38 ne pouvait rien voir : elle ouvre les chemins déclarés, et les trois
   * chemins existaient. Ce sont les PHRASES qui mentaient.
   * ═════════════════════════════════════════════════════════════════════════ */

  it('répond à « le lexique de l’espace atteint-il l’interface ? » — et ne dit plus qu’il n’existe pas', () => {
    // Le `gap` affirmait « la moitié “lexique vertical” N'EXISTE PAS […] les
    // libellés du web sont des chaînes i18n statiques ». FAUX depuis D17
    // (28/08) : `/settings/lexicon` existe, `WorkspaceLexiconGate` est monté
    // dans `App.tsx`, et `applyWorkspaceLexicon` réécrit le magasin i18next par
    // `addResourceBundle` — les libellés d'objet ne sont plus statiques.
    //
    // Ce qui reste vrai, et que l'entrée doit continuer de dire, est plus
    // étroit : le lexique est DÉCLARÉ par l'espace, il n'est pas DÉRIVÉ du
    // portefeuille d'offre. `preferred_terms` / `forbidden_terms` descendent
    // toujours dans le prompt seul.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c19_vocabulaire')

    expect(entry?.codeState).toBe('partial')
    expect(entry?.gap).not.toContain("N'EXISTE PAS")
    expect(entry?.gap).toContain('/settings/lexicon')
    // La moitié qui MANQUE encore, nommée — sinon la correction transforme un
    // mensonge en un autre, dans l'autre sens.
    expect(entry?.gap).toContain('DÉRIV')
    // Les porteurs de la moitié livrée sont déclarés, donc ouverts par GA-38 :
    // le jour où quelqu'un retire l'écran, le registre le voit.
    expect(entry?.holders).toContain('apps/web/src/i18n/workspace-lexicon.ts')
    expect(entry?.holders).toContain('apps/web/src/i18n/workspace-lexicon.test.ts')
  })

  it('répond à « la séniorité est-elle calculée ? » — et ne se déclare plus implémentée', () => {
    // L'entrée canonise « la séniorité est CALCULÉE sur des dates réelles » en
    // `codeState: 'implemented'`. D62 (28/08) a jugé cette formulation fausse,
    // et le code lui donne raison : `cv-parse.service.ts:218-222` laisse
    // `seniority` dans son `default:` — « rien à écrire aujourd'hui », « la
    // séniorité en particulier reste SAISIE ». La valeur portée par une fiche
    // vient de `consultants.service.ts` (`input.seniority`), pas du parsing.
    //
    // D62 tranche : on corrige le REGISTRE, pas le code. La règle canonique
    // reste la bonne — c'est l'état déclaré qui était faux.
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c28_seniorite')

    expect(entry?.codeState).toBe('partial')
    // L'écart NOMMÉ, avec le chemin qu'un lecteur peut ouvrir.
    expect(entry?.gap).toContain('cv-parse.service.ts')
    expect(entry?.gap).toContain('SAISIE')
  })

  it('répond à « Découvrir et Laura achètent-ils des offres ? » — oui depuis le 21/10, plafonné, cache commun', () => {
    // #4430 — renversement PARTIEL et daté de la PR #4230 (« Découvrir sans appel payant ») et de
    // « Mantiks jamais dans Découvrir » (14/10). La veille, elle, reste au cache seul (VC.1, 18/10).
    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c125_offres_fraiches_laura_decouvrir')

    expect(entry?.canonical).toContain('7 jours')
    expect(entry?.canonical).toContain('60')
    expect(entry?.supersedes).toContain('#4230')
    expect(entry?.supersedes).toContain('VC.1')
    expect(entry?.holders).toContain('apps/ia/app/services/fresh_jobs.py')
  })

  it('le compte que c18 annonce est celui que le dictionnaire porte VRAIMENT', () => {
    // ─────────────────────────────────────────────────────────────────────
    // LA SEULE AFFIRMATION DU REGISTRE QU'UNE MACHINE PEUT VÉRIFIER
    // ─────────────────────────────────────────────────────────────────────
    // `c18_manager` annonçait « quatorze des soixante indicateurs restent
    // `measurable: false` ». Le catalogue en porte HUIT. Personne ne pouvait
    // le voir : le registre DÉCRIT, il n'exécute rien, et c'est ce qui lui
    // permet de dire la vérité — y compris, ici, une contre-vérité.
    //
    // Cette garde ne prétend pas vérifier qu'une doctrine est appliquée : il
    // faudrait reconnaître une sémantique dans du code, et une garde qui
    // ferait semblant serait pire que pas de garde. Elle vérifie la seule
    // chose de ce registre qui soit MESURABLE — un CHIFFRE — et c'est
    // exactement l'affirmation qui était fausse.
    //
    // C'est pourquoi le `gap` écrit ce compte en CHIFFRES et non en lettres,
    // contrairement au reste de la prose du registre : « huit » n'est pas
    // vérifiable sans inventer un lecteur de numéraux français, et une garde
    // qui invente ce qu'elle lit est le défaut qu'on corrige ici.
    const total = MANAGER_KPIS.length
    const unmeasurable = MANAGER_KPIS.filter(kpi => !kpi.measurable).length
    // Preuve que la garde LIT : sans elle, un catalogue vidé la ferait passer.
    expect(total).toBeGreaterThan(0)
    expect(unmeasurable).toBeGreaterThan(0)

    const entry = DOCTRINE_REGISTRY.find(item => item.key === 'c18_manager')
    expect(entry?.gap).toContain(`${unmeasurable} des ${total}`)
  })

  it('répond à « faut-il demander avant de fusionner un compte venu du CRM et le compte analysé ? » — non depuis le 26/10, et SEULEMENT eux', () => {
    const entry = DOCTRINE_REGISTRY.find(e => e.key === 'c142_fusion_auto_compte_crm_compte_analyse')
    expect(entry?.canonical).toMatch(/26\/10\/2026/)
    expect(entry?.canonical).toMatch(/SANS DEMANDER/)
    // La portée serrée est écrite : des homonymes d'origines quelconques restent PROPOSÉS.
    expect(entry?.canonical).toMatch(/restent PROPOSÉS/)
    expect(entry?.supersedes).toMatch(/c37_fusion_doublons/)
    // Et c37 renvoie au renversement : qui la relit voit qu'elle a une exception datée.
    expect(DOCTRINE_REGISTRY.find(e => e.key === 'c37_fusion_doublons')?.canonical).toMatch(
      /c142_fusion_auto_compte_crm_compte_analyse/,
    )
  })

  // #4433 — la règle FINALE de la zone (Louis 27/10/2026) : elle renverse trois décisions, elle doit se LIRE.
  it("répond à « la zone s'arrête-t-elle à la région ? » — non depuis le 27/10 : département, région, puis la France, sans demander", () => {
    const entry = DOCTRINE_REGISTRY.find(e => e.key === 'c143_zone_100km_puis_paliers_jusqu_a_la_france')
    expect(entry?.canonical).toMatch(/27\/10\/2026/)
    expect(entry?.canonical).toMatch(/100 km/)
    expect(entry?.canonical).toMatch(/département.*région.*FRANCE/s)
    expect(entry?.canonical).toMatch(/JAMAIS « tu veux élargir/)
    // Les trois décisions renversées sont NOMMÉES : un arbitrage effacé se re-propose, un arbitrage renversé se lit.
    for (const renversee of ['#4640', '#4429', '#4419', '#4515']) expect(entry?.supersedes).toContain(renversee)
    // c133 renvoie au renversement : qui lit « ville, département, région » voit que l'échelle monte plus haut.
    expect(DOCTRINE_REGISTRY.find(e => e.key === 'c133_paliers_d_elargissement_exact_d_abord')?.canonical).toMatch(
      /c143_zone_100km_puis_paliers_jusqu_a_la_france/,
    )
  })

  // #4640 — c144 renverse c143 le soir même : l'arrêt à la région, livré deux fois, doit se LIRE.
  it("répond à « l'automatique monte-t-il jusqu'à la France ? » — non depuis le 27/10 au soir : il s'arrête à la région", () => {
    const entry = DOCTRINE_REGISTRY.find(e => e.key === 'c144_zone_automatique_s_arrete_a_la_region')
    expect(entry?.canonical).toMatch(/27\/10\/2026 AU SOIR/)
    expect(entry?.canonical).toMatch(/MÊME si la région rend 0 compte/)
    expect(entry?.canonical).toMatch(/ZONE_AUTO_MAX_TIER/)
    expect(entry?.supersedes).toContain('c143')
    expect(entry?.supersedes).toMatch(/DEUX FOIS/)
    expect(entry?.gap).toContain('zone_dossier.py')
    // c143 n'est ni supprimée ni réécrite : elle reste lisible, et renvoie à son renversement.
    expect(DOCTRINE_REGISTRY.find(e => e.key === 'c143_zone_100km_puis_paliers_jusqu_a_la_france')).toBeDefined()
    expect(DOCTRINE_REGISTRY.find(e => e.key === 'c133_paliers_d_elargissement_exact_d_abord')?.canonical).toMatch(
      /c144_zone_automatique_s_arrete_a_la_region/,
    )
  })

  // #4761 — c145 renverse #4307 : l'historique déjà stocké se lit sans crédit. Le renversement doit se LIRE.
  it("répond à « relire l'historique d'un compte coûte-t-il un crédit ? » — non depuis le 28/10 : seul un appel neuf débite", () => {
    const entry = DOCTRINE_REGISTRY.find(e => e.key === 'c145_historique_stocke_se_lit_sans_credit')
    expect(entry?.canonical).toMatch(/28\/10\/2026/)
    expect(entry?.canonical).toMatch(/APPEL NEUF/)
    expect(entry?.canonical).toMatch(/DISCOVER_BLOCK_CAP/)
    expect(entry?.supersedes).toMatch(/#4307/)
    expect(entry?.supersedes).toMatch(/pas effacée/)
  })

  // 29/10/2026 — « un lot n'est fini que quand son APPELANT existe » : six lots mesurés en une matinée.
  it("répond à « un lot est-il fini quand sa fonction est testée ? » — non : il l'est quand son APPELANT existe, six cas mesurés", () => {
    const entry = DOCTRINE_REGISTRY.find(e => e.key === 'c146_un_lot_n_est_fini_que_quand_son_appelant_existe')
    expect(entry?.canonical).toMatch(/29\/10\/2026/)
    expect(entry?.canonical).toMatch(/APPELANT/)
    // Les six cas sont NOMMÉS avec leur numéro : c'est la mesure qui rend la règle impossible à re-litiger.
    for (const cas of ['#4734', '#4735', '#4742', '#4754', '#4759', '#4760']) expect(entry?.canonical).toContain(cas)
    expect(entry?.supersedes).toMatch(/fonction/)
    // Une règle dont le code ne vérifie pas l'appelant ne se déclare pas gardée : elle le dit.
    expect(entry?.enforcement).not.toBe('guarded')
    expect(entry?.gap).toBeTruthy()
  })

  it('chaque invariant a un porteur — le dernier orphelin a été comblé le 27/08/2026', () => {
    // Ce test disait, jusqu'au 27/08, « un invariant sur onze n'est porté par
    // RIEN » — c'était `beta_feedback_is_not_reusable`, et le registre en avait
    // fait sa mesure la plus utile. Il est comblé : `reuse_scope` existe sur
    // les trois tables de retour, contraint en base, et GA-47 refuse la lecture
    // inter-espaces qui l'ignorerait.
    //
    // Le test ne disparaît pas, il s'INVERSE : un invariant qui reperdrait son
    // porteur doit se voir. C'est la même exigence qu'ailleurs dans ce fichier
    // — un porteur cité doit exister sur le disque.
    const orphans = INVARIANTS.filter(inv => inv.holders.length === 0)
    expect(orphans.map(inv => inv.key)).toEqual([])

    const filled = INVARIANTS.find(inv => inv.key === 'beta_feedback_is_not_reusable')
    expect(filled?.enforcement).toBe('guarded')
    expect(filled?.holders).toContain('apps/api/src/architecture/feedback-reuse-scope.spec.ts')
  })
})
