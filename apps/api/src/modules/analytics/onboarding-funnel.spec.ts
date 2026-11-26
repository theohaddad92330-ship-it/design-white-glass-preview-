import { ecartEnMois, moisApres, moisDe, type EspaceInscrit, type MoisActif } from './retention-cohorts'
import {
  ETAPES_ENTONNOIR,
  PRIMARY_ONBOARDING_METRIC,
  construireEntonnoir,
  primaryOnboardingMetricLabel,
  type FranchissementEtape,
} from './onboarding-funnel'

/**
 * #1686 — ce qui se teste ici est la DÉRIVATION, pas le rendu ni la lecture
 * base de données (`onboarding-funnel.service.spec.ts` couvre le câblage SQL).
 *
 * Les règles non négociables de l'issue, chacune avec son cas :
 *  1686.1 · aucune cohorte publiée sous 3 espaces — REFUSÉ ici : le masquage
 *           lui-même vit côté écran (`COHORT_MIN_SPACES`, #1643), ce calcul se
 *           contente de rendre le compte d'espaces pour que l'écran puisse le
 *           faire — même partage de responsabilité que la rétention (#1658.1).
 *  1686.2 · une étape à zéro franchissement est « non mesurée » quand la
 *           cohorte est trop jeune pour l'avoir atteinte, un vrai zéro sinon.
 *  1686.3 · l'unité est l'ESPACE — aucun identifiant de PERSONNE n'entre dans
 *           `EspaceInscrit` ni `FranchissementEtape`.
 *  1686.4 · le délai de première valeur se rend en MÉDIANE, jamais en moyenne.
 *  1686.5 · les SEPT étapes de l'issue, `analysis_started` (pas `_completed`)
 *           comme colonne affichée, `premiere_action_validee` séparée de
 *           l'analyse, et `actif_j30` mesuré sur SON PROPRE mois M1.
 */

const MAINTENANT = new Date('2026-09-15T10:00:00Z')

function espace(workspaceId: string, createdAt: string): EspaceInscrit {
  return { workspaceId, createdAt: new Date(createdAt) }
}

function franchi(workspaceId: string, etape: FranchissementEtape['etape'], atteintLe: string): FranchissementEtape {
  return { workspaceId, etape, atteintLe: new Date(atteintLe) }
}

function actif(workspaceId: string, mois: string): MoisActif {
  return { workspaceId, mois }
}

describe('le catalogue des étapes', () => {
  it('1686.5 — porte les sept étapes de l’issue, dans son ordre', () => {
    expect(ETAPES_ENTONNOIR.map(e => e.cle)).toEqual([
      'onboarding_started',
      'onboarding_completed',
      'integration_connected',
      'analysis_started',
      'premiere_action_validee',
      'deuxieme_session',
      'actif_j30',
    ])
  })

  it('1686.5 — `analysis_completed` n’est plus une colonne affichée, mais reste une clé valide pour le délai de 1686.4', () => {
    expect(ETAPES_ENTONNOIR.some(e => e.cle === 'analysis_completed')).toBe(false)
    // Le typage ci-dessous n'est pas un test d'exécution : c'est la preuve que
    // `franchi(..., 'analysis_completed', ...)` compile toujours — voir les
    // tests 1686.4 plus bas, qui l'utilisent encore.
    const toujoursValide: FranchissementEtape['etape'] = 'analysis_completed'
    expect(toujoursValide).toBe('analysis_completed')
  })
})

describe('#2085.23 — la métrique PRINCIPALE, à un seul endroit', () => {
  it('c’est la première action VALIDÉE, jamais le questionnaire TERMINÉ', () => {
    expect(PRIMARY_ONBOARDING_METRIC).toBe('premiere_action_validee')
    // Sait dire NON : un lot qui changerait la constante pour le taux de
    // complétion romprait CETTE assertion, pas une intuition de relecture.
    expect(PRIMARY_ONBOARDING_METRIC).not.toBe('onboarding_completed')
  })

  it('son libellé est celui du catalogue — jamais recopié une seconde fois', () => {
    const attendu = ETAPES_ENTONNOIR.find(e => e.cle === 'premiere_action_validee')?.libelle
    expect(attendu).toBeDefined()
    expect(primaryOnboardingMetricLabel()).toBe(attendu)
  })
})

describe('l’entonnoir par cohorte mensuelle (#1686)', () => {
  it('range chaque espace dans le mois de son inscription, comme la rétention (#1658.1)', () => {
    const rapport = construireEntonnoir({
      espaces: [
        espace('a', '2026-07-02T08:00:00Z'),
        espace('b', '2026-07-31T22:00:00Z'),
        espace('c', '2026-08-01T00:00:00Z'),
      ],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })

    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2026-07', '2026-08'])
    expect(rapport.cohortes.map(c => c.espaces)).toEqual([2, 1])
    expect(rapport.espaces).toBe(3)
  })

  it('un espace créé « dans le futur » (horloge décalée) n’a aucune cohorte à rejoindre', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-10-01T00:00:00Z')],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes).toEqual([])
    expect(rapport.espaces).toBe(0)
  })

  it('1686.2 — un franchissement réel n’est JAMAIS caché derrière « trop tôt », même dans la cohorte du mois en cours', () => {
    // La cohorte du mois COURANT (2026-09) est aussi jeune que possible ; si un
    // seul espace a déjà franchi l'étape, c'est un signal réel et il se montre.
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-09-01T00:00:00Z'), espace('b', '2026-09-10T00:00:00Z')],
      franchissements: [franchi('a', 'onboarding_started', '2026-09-01T01:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    const cohorte = rapport.cohortes[0]!
    const etape = cohorte.etapes.find(e => e.cle === 'onboarding_started')!
    expect(etape).toEqual({ cle: 'onboarding_started', etat: 'mesuree', atteints: 1, part: 0.5 })
  })

  it('1686.2 — zéro franchissement dans une cohorte encore JEUNE est NON MESURÉ, jamais 0 %', () => {
    // Cohorte de septembre (le mois de `MAINTENANT`) : aucun espace n'a encore
    // eu le temps de connecter une intégration (grâce de 14 jours après la FIN
    // du mois) ni de lancer une analyse.
    const rapport = construireEntonnoir({
      espaces: [
        espace('a', '2026-09-01T00:00:00Z'),
        espace('b', '2026-09-05T00:00:00Z'),
        espace('c', '2026-09-10T00:00:00Z'),
      ],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    const cohorte = rapport.cohortes[0]!
    for (const cle of ['integration_connected', 'analysis_started'] as const) {
      const etape = cohorte.etapes.find(e => e.cle === cle)!
      expect(etape.etat).toBe('non_mesuree')
      expect(etape.part).toBeNull()
      expect(etape.atteints).toBe(0)
    }
  })

  it('1686.2 — zéro franchissement dans une cohorte MÛRE est un vrai zéro mesuré', () => {
    // Cohorte de janvier 2026 : la fin de mois + 14 jours de grâce sont TRÈS
    // loin derrière `MAINTENANT` (septembre). Personne n'a jamais connecté
    // d'intégration : ce n'est plus « trop tôt », c'est mesuré à zéro.
    const rapport = construireEntonnoir({
      espaces: [
        espace('a', '2026-01-05T00:00:00Z'),
        espace('b', '2026-01-20T00:00:00Z'),
        espace('c', '2026-01-25T00:00:00Z'),
      ],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    const cohorte = rapport.cohortes[0]!
    const etape = cohorte.etapes.find(e => e.cle === 'integration_connected')!
    expect(etape).toEqual({ cle: 'integration_connected', etat: 'mesuree', atteints: 0, part: 0 })
  })

  it('1686.2 — la frontière de maturité se lit sur la FIN du mois de la cohorte, pas son début', () => {
    // `integration_connected` porte 14 jours de grâce. Cohorte d'août 2026 : le
    // premier instant qui n'appartient PLUS au mois est le 01/09 00:00:00Z, et
    // la limite de maturité est donc le 15/09 00:00:00Z (01/09 + 14 jours).
    const espaces = [
      espace('a', '2026-08-01T00:00:00Z'),
      espace('b', '2026-08-31T23:00:00Z'),
      espace('c', '2026-08-15T00:00:00Z'),
    ]

    const veille = construireEntonnoir({
      espaces,
      franchissements: [],
      moisActifs: [],
      maintenant: new Date('2026-09-14T23:59:59Z'),
    })
    expect(veille.cohortes[0]!.etapes.find(e => e.cle === 'integration_connected')!.etat).toBe('non_mesuree')

    const jourJ = construireEntonnoir({
      espaces,
      franchissements: [],
      moisActifs: [],
      maintenant: new Date('2026-09-15T00:00:00Z'),
    })
    expect(jourJ.cohortes[0]!.etapes.find(e => e.cle === 'integration_connected')!.etat).toBe('mesuree')
  })

  it('ne compte qu’une fois un espace qui aurait deux lignes pour la même étape — le PLUS ANCIEN franchissement gagne', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z')],
      franchissements: [
        franchi('a', 'onboarding_started', '2026-01-05T00:00:00Z'),
        franchi('a', 'onboarding_started', '2026-01-02T00:00:00Z'),
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    // Le délai de première valeur n'utilise que `analysis_completed`, mais le
    // compte de franchissement, lui, doit rester à 1 espace sur 1 — pas 2.
    const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'onboarding_started')!
    expect(etape.atteints).toBe(1)
    expect(etape.part).toBe(1)
  })

  it('1686.4 — le délai de première valeur se rend en MÉDIANE (nombre impair de mesures)', () => {
    const rapport = construireEntonnoir({
      espaces: [
        espace('a', '2026-01-01T00:00:00Z'),
        espace('b', '2026-01-01T00:00:00Z'),
        espace('c', '2026-01-01T00:00:00Z'),
      ],
      franchissements: [
        franchi('a', 'analysis_completed', '2026-01-02T00:00:00Z'), // 1 jour
        franchi('b', 'analysis_completed', '2026-01-06T00:00:00Z'), // 5 jours
        franchi('c', 'analysis_completed', '2026-01-31T00:00:00Z'), // 30 jours — l'outlier qu'une MOYENNE laisserait passer
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.delaiPremiereValeur).toEqual({ medianJours: 5, echantillon: 3 })
  })

  it('1686.4 — nombre pair de mesures : la médiane moyenne les deux valeurs centrales', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z'), espace('b', '2026-01-01T00:00:00Z')],
      franchissements: [
        franchi('a', 'analysis_completed', '2026-01-02T00:00:00Z'), // 1 jour
        franchi('b', 'analysis_completed', '2026-01-08T00:00:00Z'), // 7 jours
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.delaiPremiereValeur).toEqual({ medianJours: 4, echantillon: 2 })
  })

  it('1686.4 — aucun espace n’a atteint la première valeur : `medianJours` est `null`, jamais 0', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z')],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.delaiPremiereValeur).toEqual({ medianJours: null, echantillon: 0 })
  })

  it('un espace absent des franchissements ne compte dans AUCUN numérateur, mais reste dans le dénominateur', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z'), espace('b', '2026-01-01T00:00:00Z')],
      franchissements: [franchi('a', 'analysis_completed', '2026-01-02T00:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.espaces).toBe(2)
    expect(rapport.cohortes[0]!.delaiPremiereValeur.echantillon).toBe(1)
  })

  it('1686.5 — `premiere_action_validee` se lit comme les autres franchissements (une action, pas une analyse)', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z'), espace('b', '2026-01-01T00:00:00Z')],
      franchissements: [franchi('a', 'premiere_action_validee', '2026-01-10T00:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'premiere_action_validee')!
    expect(etape).toEqual({ cle: 'premiere_action_validee', etat: 'mesuree', atteints: 1, part: 0.5 })
  })

  it('1686.5 — `deuxieme_session` se lit comme les autres franchissements', () => {
    const rapport = construireEntonnoir({
      espaces: [espace('a', '2026-01-01T00:00:00Z')],
      franchissements: [franchi('a', 'deuxieme_session', '2026-01-03T00:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'deuxieme_session')!
    expect(etape).toEqual({ cle: 'deuxieme_session', etat: 'mesuree', atteints: 1, part: 1 })
  })

  describe('1686.5 — `actif_j30` mesure SON PROPRE mois M1, pas « actif un jour quelconque »', () => {
    it('actif en M1 (le mois qui suit l’inscription) → mesuré, réel', () => {
      const rapport = construireEntonnoir({
        espaces: [espace('a', '2026-01-15T00:00:00Z'), espace('b', '2026-01-20T00:00:00Z')],
        franchissements: [],
        moisActifs: [actif('a', '2026-02')], // le mois M1 de la cohorte 2026-01
        maintenant: MAINTENANT,
      })
      const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'actif_j30')!
      expect(etape).toEqual({ cle: 'actif_j30', etat: 'mesuree', atteints: 1, part: 0.5 })
    })

    it('actif seulement dans SON mois d’inscription (M0) ne compte PAS pour `actif_j30`', () => {
      const rapport = construireEntonnoir({
        espaces: [
          espace('a', '2026-01-15T00:00:00Z'),
          espace('b', '2026-01-20T00:00:00Z'),
          espace('c', '2026-01-22T00:00:00Z'),
        ],
        franchissements: [],
        moisActifs: [actif('a', '2026-01')], // M0, pas M1 — n'atteint pas l'étape
        maintenant: MAINTENANT,
      })
      const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'actif_j30')!
      // Cohorte de janvier : le mois M1 (février) est largement écoulé + 31 j de
      // grâce à `MAINTENANT` (septembre) — donc « non mesurée » est FAUSSE ici,
      // c'est un vrai zéro mesuré.
      expect(etape).toEqual({ cle: 'actif_j30', etat: 'mesuree', atteints: 0, part: 0 })
    })

    it('actif dans un mois LOINTAIN (M3) ne compte pas non plus — seul M1 compte', () => {
      const rapport = construireEntonnoir({
        espaces: [espace('a', '2026-01-15T00:00:00Z')],
        franchissements: [],
        moisActifs: [actif('a', '2026-04')], // M3, pas M1
        maintenant: MAINTENANT,
      })
      const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'actif_j30')!
      expect(etape.atteints).toBe(0)
    })

    it('cohorte du mois courant, encore dans son mois M1 → non mesurée, jamais 0 %', () => {
      // MAINTENANT = 2026-09-15. Cohorte de septembre : son mois M1 (octobre)
      // n'a même pas commencé — dire « 0 % » mesurerait le calendrier, pas le
      // produit.
      const rapport = construireEntonnoir({
        espaces: [
          espace('a', '2026-09-01T00:00:00Z'),
          espace('b', '2026-09-05T00:00:00Z'),
          espace('c', '2026-09-10T00:00:00Z'),
        ],
        franchissements: [],
        moisActifs: [],
        maintenant: MAINTENANT,
      })
      const etape = rapport.cohortes[0]!.etapes.find(e => e.cle === 'actif_j30')!
      expect(etape.etat).toBe('non_mesuree')
      expect(etape.part).toBeNull()
    })
  })

  it('les cohortes sont triées de la plus ANCIENNE à la plus récente', () => {
    const rapport = construireEntonnoir({
      espaces: [
        espace('a', '2026-05-01T00:00:00Z'),
        espace('b', '2026-01-01T00:00:00Z'),
        espace('c', '2026-03-01T00:00:00Z'),
      ],
      franchissements: [],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2026-01', '2026-03', '2026-05'])
  })

  it('n’invente aucune cohorte quand il n’y a aucun espace', () => {
    const rapport = construireEntonnoir({ espaces: [], franchissements: [], moisActifs: [], maintenant: MAINTENANT })
    expect(rapport).toEqual({
      cohortes: [],
      etapes: ETAPES_ENTONNOIR,
      espaces: 0,
      calculeA: MAINTENANT.toISOString(),
    })
  })

  it('`calculeA` porte l’heure PASSÉE en paramètre, jamais l’horloge lue en direct', () => {
    const rapport = construireEntonnoir({ espaces: [], franchissements: [], moisActifs: [], maintenant: MAINTENANT })
    expect(rapport.calculeA).toBe(MAINTENANT.toISOString())
  })
})

// Les utilitaires de mois sont ceux de la rétention (#1658.1) — réemployés, pas
// recopiés (GA-26). Ce test ferme juste la porte à une réimportation cassée.
describe('réemploi des utilitaires de mois de la rétention', () => {
  it('sont bien ceux de retention-cohorts.ts', () => {
    expect(moisDe(new Date('2026-03-31T23:30:00Z'))).toBe('2026-03')
    expect(ecartEnMois('2026-01', '2026-03')).toBe(2)
    expect(moisApres('2026-12', 1)).toBe('2027-01')
  })
})

/**
 * #1686.2 bis — LE TROISIÈME ÉTAT, trouvé EN RECETTE sur la production du
 * 09/09/2026 et pas en CI.
 *
 * L'écran affichait, sur la même ligne : « Onboarding démarré **0 %** » et
 * « Onboarding terminé **88 %** ». Quatre-vingt-huit pour cent ne peuvent pas
 * avoir TERMINÉ ce que zéro pour cent ont DÉMARRÉ.
 *
 * La cause est en amont du calcul : `onboarding_started` n'est émis que sur la
 * PREMIÈRE transition hors de `not_started` (`onboarding.service.ts`), donc un
 * espace arrivé par un autre chemin ne l'émet jamais. L'étape n'avait pas zéro
 * franchissement — elle n'avait **pas d'écrivain**. Et le délai de grâce, en
 * expirant, transformait cette absence en « vrai zéro ».
 *
 * ⚠️ Aucun test ne pouvait l'attraper : chaque cas de ce fichier fournit ses
 * franchissements, donc l'étape était TOUJOURS instrumentée dans les tests.
 * C'est la définition d'un défaut que seule la recette voit.
 */
describe('#1686.2 bis — « rien ne l’écrit » n’est pas « personne ne l’a franchie »', () => {
  it('ne rend JAMAIS 0 % une étape que personne n’a franchie sur AUCUNE cohorte', () => {
    // Le cas de production, réduit : l'étape suivante est massivement franchie,
    // la précédente ne l'est jamais. Le délai de grâce est largement expiré.
    const rapport = construireEntonnoir({
      espaces: [espace('w1', '2026-08-02T00:00:00Z'), espace('w2', '2026-08-03T00:00:00Z')],
      franchissements: [
        franchi('w1', 'onboarding_completed', '2026-08-10T00:00:00Z'),
        franchi('w2', 'onboarding_completed', '2026-08-11T00:00:00Z'),
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })

    const aout = rapport.cohortes.find(c => c.cohorte === '2026-08')
    const demarre = aout?.etapes.find(e => e.cle === 'onboarding_started')
    const termine = aout?.etapes.find(e => e.cle === 'onboarding_completed')

    // Le nom de l'étape fautive est DANS la valeur comparée : sinon l'échec
    // dirait « 0 n'est pas null » et il faudrait le déboguer.
    expect({ cle: demarre?.cle, etat: demarre?.etat, part: demarre?.part }).toEqual({
      cle: 'onboarding_started',
      etat: 'non_instrumentee',
      part: null,
    })
    // Le contrôle positif, dans le même cas : l'étape qui a des franchissements
    // reste mesurée. Sans lui, une garde qui casserait tout resterait verte.
    expect(termine?.etat).toBe('mesuree')
    expect(termine?.part).toBe(1)
  })

  it('garde un VRAI zéro quand l’étape est instrumentée ailleurs', () => {
    // Le témoin qui empêche la règle d'être trop gourmande : dès qu'une SEULE
    // cohorte franchit l'étape, un zéro sur une autre cohorte redevient une
    // mesure. Sans ce cas, « non instrumentée » avalerait tous les vrais zéros.
    const rapport = construireEntonnoir({
      espaces: [espace('w1', '2026-07-02T00:00:00Z'), espace('w2', '2026-08-03T00:00:00Z')],
      franchissements: [franchi('w1', 'onboarding_started', '2026-07-10T00:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })

    const aout = rapport.cohortes.find(c => c.cohorte === '2026-08')
    const demarre = aout?.etapes.find(e => e.cle === 'onboarding_started')
    expect({ etat: demarre?.etat, part: demarre?.part }).toEqual({ etat: 'mesuree', part: 0 })
  })

  it('LIT quelque chose — les sept étapes existent, et le cas porte sur l’une d’elles', () => {
    // Contrôle positif du corpus : si `ETAPES_ENTONNOIR` se vidait, les deux
    // tests ci-dessus passeraient sur du vide.
    expect(ETAPES_ENTONNOIR).toHaveLength(7)
    expect(ETAPES_ENTONNOIR.map(e => e.cle)).toContain('onboarding_started')
  })
})
