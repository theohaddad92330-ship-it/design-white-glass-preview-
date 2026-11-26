import { describe, expect, it } from 'vitest'
import { CLOSED_STAGES, INTAKE_STAGES, isPipelineStage, PROJECT_STAGES } from './project.js'
import {
  CLOSED_UNWON_STAGES,
  decayedConfidence,
  DECIDED_STAGES,
  EVIDENCE_GAP_LABELS,
  EVIDENCE_GAPS,
  EVIDENCE_REQUIREMENTS,
  evidenceInputSchema,
  evidenceLevelSchema,
  highestEvidenceLevel,
  LIVE_STAGES,
  meetsEvidenceLevel,
  opportunityEvidenceGaps,
  opportunityFreshness,
  projectEvidence,
  projectEvidenceSchema,
  projectStageInSql,
  projectStageNotInSql,
  TRIAGED_STAGES,
  UNDECIDED_STAGES,
  type EvidenceInput,
  type EvidenceLevel,
  projectReadRowSchema,
  type ProjectEvidenceSource,
} from './opportunity-ontology.js'

/**
 * L'ontologie « fait → projet → opportunité » (addendum final p42-46).
 *
 * Ce qui se teste, c'est l'anti-inflation : le produit appelait « besoin » un
 * recrutement repéré sur une page carrière, ce qui fait écrire à un DSI qu'on a
 * « noté son besoin » quand il n'a rien demandé. La règle centrale — une demande
 * confirmée exige une PAROLE, pas un faisceau d'indices — est vérifiée dans les
 * deux sens.
 */

function evidence(over: Partial<EvidenceInput> = {}): EvidenceInput {
  return {
    datedFacts: 0,
    explicitlyExpressed: false,
    hasFit: false,
    hasPerimeter: false,
    hasDecisionMaker: false,
    hasNextAction: false,
    ...over,
  }
}

describe('niveaux de preuve', () => {
  it('un signal isolé ne fait pas un projet', () => {
    expect(highestEvidenceLevel(evidence({ datedFacts: 1 }))).toBe('fact')
    expect(meetsEvidenceLevel(evidence({ datedFacts: 1 }), 'detected_project').met).toBe(false)
  })

  it('deux faits qui convergent font un projet détecté', () => {
    expect(highestEvidenceLevel(evidence({ datedFacts: 2 }))).toBe('detected_project')
  })

  it('un fait daté RATTACHÉ à un chantier fait un projet détecté (D27)', () => {
    // Le troisième chemin, ajouté le 28/08/2026 : la table ne rattache aucun
    // second fait à un projet, mais elle porte la LECTURE qui fait d'un
    // événement un chantier. Un fait plus une offre est un projet détecté.
    expect(highestEvidenceLevel(evidence({ datedFacts: 1, hasFit: true }))).toBe('detected_project')
    expect(highestEvidenceLevel(evidence({ datedFacts: 1, hasPerimeter: true }))).toBe('detected_project')
    expect(highestEvidenceLevel(evidence({ datedFacts: 1, hasDecisionMaker: true }))).toBe('detected_project')
    expect(highestEvidenceLevel(evidence({ datedFacts: 1, hasNextAction: true }))).toBe('detected_project')
  })

  it('un rattachement SANS fait daté ne fait toujours rien — le fait reste le socle', () => {
    // Le sens de la correction est d'ouvrir un chemin, pas de retirer le
    // plancher : sans événement daté et sourcé, il n'y a rien à rattacher.
    expect(highestEvidenceLevel(evidence({ hasFit: true, hasPerimeter: true, hasDecisionMaker: true }))).toBeNull()
    expect(meetsEvidenceLevel(evidence({ hasFit: true }), 'detected_project').missing).toEqual(['no_dated_fact'])
  })

  it('« demande confirmée » exige une parole, jamais un faisceau d’indices', () => {
    // Le cœur du sujet : dix recrutements repérés ne valent pas une phrase du
    // client. Les confondre, c'est prétendre qu'il a demandé quelque chose.
    expect(highestEvidenceLevel(evidence({ datedFacts: 10 }))).toBe('detected_project')
    expect(meetsEvidenceLevel(evidence({ datedFacts: 10 }), 'confirmed_demand').met).toBe(false)
    expect(highestEvidenceLevel(evidence({ explicitlyExpressed: true }))).toBe('confirmed_demand')
  })

  it('une demande confirmée vaut aussi projet détecté — l’inverse est faux', () => {
    const spoken = evidence({ explicitlyExpressed: true })
    expect(meetsEvidenceLevel(spoken, 'detected_project').met).toBe(true)
    expect(meetsEvidenceLevel(evidence({ datedFacts: 3 }), 'confirmed_demand').met).toBe(false)
  })

  it('une opportunité exige les cinq éléments — il en manque un, ce n’en est pas une', () => {
    // ⚠️ 28/08 : `explicitlyExpressed` fait désormais partie des cinq. Le
    // `datedFacts: 2` qui tenait ce rôle ouvrait la porte « faisceau », retirée
    // — voir « une opportunité se fonde sur une DEMANDE » ci-dessus.
    const complete = evidence({
      datedFacts: 2,
      explicitlyExpressed: true,
      hasFit: true,
      hasPerimeter: true,
      hasDecisionMaker: true,
      hasNextAction: true,
    })
    expect(highestEvidenceLevel(complete)).toBe('opportunity')
    // Sans prochaine action, on retombe à « demande confirmée » — et ce mot dit
    // exactement ce qu'il manque.
    expect(highestEvidenceLevel({ ...complete, hasNextAction: false })).toBe('confirmed_demand')
    expect(highestEvidenceLevel({ ...complete, hasDecisionMaker: false })).toBe('confirmed_demand')
    // Et sans la demande, un faisceau complet plafonne à « projet détecté ».
    expect(highestEvidenceLevel({ ...complete, explicitlyExpressed: false })).toBe('detected_project')
  })

  it('une opportunité se fonde sur une DEMANDE — un faisceau, même complet, n’en fait pas une', () => {
    // Mesuré le 28/08 (D50 · 26/08). Ancienne règle : `explicitlyExpressed ||
    // datedFacts >= 2`. Le second chemin était STRUCTURELLEMENT mort au niveau
    // d'une ligne : une ligne `opportunities` ne porte QU'UN fait, le sien.
    // Le barème gardait donc une porte que rien ne pouvait franchir — et, pire,
    // il nommait le mauvais manque à qui s'y présentait.
    const faisceau = evidence({
      datedFacts: 5,
      hasFit: true,
      hasPerimeter: true,
      hasDecisionMaker: true,
      hasNextAction: true,
    })
    expect(highestEvidenceLevel(faisceau)).toBe('detected_project')

    const verdict = meetsEvidenceLevel(faisceau, 'opportunity')
    expect(verdict.met).toBe(false)
    // Le manque nommé est le BON : ce n'est pas un fait de plus qu'il faut,
    // c'est que personne n'a rien demandé.
    expect(verdict.missing).toEqual(['not_expressed'])

    // Cinq faits qui convergent ne valent toujours pas une phrase du client :
    // c'est la règle fondatrice du module, appliquée jusqu'au dernier niveau.
    expect(meetsEvidenceLevel(faisceau, 'confirmed_demand').met).toBe(false)

    // Avec la parole, et seulement avec elle, l'opportunité existe.
    expect(highestEvidenceLevel({ ...faisceau, explicitlyExpressed: true })).toBe('opportunity')
  })

  it('une entrée intégralement qualifiée mais non demandée dit le VRAI manque', () => {
    // Le cas qui rendait le message inexploitable : offre + périmètre + décideur
    // + prochaine action, tout est là, et le barème répondait « un seul fait
    // daté — il en faut au moins deux qui convergent ». Le commercial partait
    // chercher un second article de presse ; ce qu'il lui fallait, c'était un
    // client qui demande.
    const verdict = meetsEvidenceLevel(
      evidence({
        datedFacts: 1,
        hasFit: true,
        hasPerimeter: true,
        hasDecisionMaker: true,
        hasNextAction: true,
      }),
      'opportunity',
    )
    expect(verdict.missing).toEqual(['not_expressed'])
  })

  it('« opportunité » ne promet plus la porte que la donnée ne peut pas ouvrir', () => {
    for (const lang of ['fr', 'en'] as const) {
      const texte = EVIDENCE_REQUIREMENTS.opportunity[lang]
      expect(texte).not.toBe('')
      expect(texte).not.toMatch(/Un projet ou une demande|A project or demand/)
    }
  })

  it('rien de daté, rien d’exprimé : aucun niveau revendicable', () => {
    expect(highestEvidenceLevel(evidence())).toBeNull()
    expect(meetsEvidenceLevel(evidence(), 'fact').met).toBe(false)
  })

  it('chaque niveau documente son exigence dans les deux langues', () => {
    for (const requirement of Object.values(EVIDENCE_REQUIREMENTS)) {
      expect(requirement.fr).not.toBe('')
      expect(requirement.en).not.toBe('')
    }
  })

  it('accepte exactement la forme d’entrée annoncée', () => {
    expect(() => evidenceInputSchema.parse(evidence())).not.toThrow()
  })
})

describe('stades', () => {
  /**
   * La traduction cycle stocké → stade affiché a disparu avec le pivot Projet :
   * il n'y a plus qu'un vocabulaire d'étape. Ce qui reste à garder, c'est la
   * partition — et surtout qu'AUCUNE étape ne soit oubliée des deux côtés, car
   * une étape absente des deux listes ferait disparaître ses projets de l'écran
   * sans que personne ne le remarque.
   */
  it('partage TOUTES les étapes entre « en jeu » et « clos », sans trou ni doublon', () => {
    const covered = [...LIVE_STAGES, ...CLOSED_STAGES].sort()
    expect(covered).toEqual([...PROJECT_STAGES].sort())
    expect(new Set(covered).size).toBe(PROJECT_STAGES.length)
  })

  it('sépare ce qui est encore en jeu de ce qui est clos', () => {
    expect(LIVE_STAGES).not.toContain('won')
    expect(LIVE_STAGES).not.toContain('lost')
    expect(LIVE_STAGES).not.toContain('dormant')
  })

  /**
   * Les deux définitions de « pas fini » — et l'écart qui les sépare.
   *
   * Cinq requêtes écrivaient leur propre liste à la main, et deux d'entre elles
   * gardaient `dormant` dedans. Ce n'était PAS une faute de frappe : une routine
   * de relance existe précisément pour réveiller ce qui dort. Ces tests figent
   * l'écart pour qu'une prochaine « unification » ne l'efface pas en silence.
   */
  it('garde `dormant` dans ce qui n’est pas tranché — c’est une pause, pas une issue', () => {
    expect(UNDECIDED_STAGES).toContain('dormant')
    expect(UNDECIDED_STAGES).not.toContain('won')
    expect(UNDECIDED_STAGES).not.toContain('lost')
  })

  it('n’écarte du « pas tranché » que les deux issues CONNUES', () => {
    const decided = [...PROJECT_STAGES].filter(stage => !UNDECIDED_STAGES.includes(stage))
    expect(decided.sort()).toEqual(['lost', 'won'])
  })

  it('fait de « encore en jeu » un sous-ensemble STRICT de « pas tranché » — l’écart vaut `dormant`', () => {
    for (const stage of LIVE_STAGES) expect(UNDECIDED_STAGES).toContain(stage)
    const gap = UNDECIDED_STAGES.filter(stage => !LIVE_STAGES.includes(stage))
    expect(gap).toEqual(['dormant'])
  })
})

/**
 * D37 (28/08/2026) — trois sous-ensembles portaient la même idée sans qu'aucun
 * ne porte de nom partagé. Ce bloc fige les DEUX questions distinctes, et le
 * fait que la seconde DÉRIVE de la première au lieu de la recopier.
 */
describe('D37 — « en jeu » et « pris en charge » ont chacun un nom, dérivé', () => {
  it('« en jeu » INCLUT l’intake — un projet détecté attend encore un geste', () => {
    expect(LIVE_STAGES).toContain('detected')
    expect(LIVE_STAGES).toContain('potential')
    // C'est LE point tranché : « en jeu » = « pas clos », rien d'autre.
    expect([...LIVE_STAGES].sort()).toEqual(
      PROJECT_STAGES.filter(stage => !(CLOSED_STAGES as readonly string[]).includes(stage)).sort(),
    )
  })

  it('« pris en charge » retire l’intake, et RIEN d’autre', () => {
    expect([...TRIAGED_STAGES]).toEqual(['confirmed', 'qualified', 'profiles_submitted', 'negotiation'])
    // Dérivé, pas retapé : l'union avec l'intake redonne EXACTEMENT « en jeu ».
    expect([...TRIAGED_STAGES, ...INTAKE_STAGES].sort()).toEqual([...LIVE_STAGES].sort())
    for (const stage of CLOSED_STAGES) expect(TRIAGED_STAGES).not.toContain(stage)
  })

  it('« clos sans affaire » est le complément de `won` dans les stades clos', () => {
    expect([...CLOSED_UNWON_STAGES].sort()).toEqual(['dormant', 'lost'])
    expect([...CLOSED_UNWON_STAGES, 'won'].sort()).toEqual([...CLOSED_STAGES].sort())
  })

  it('les trois paniers de la boucle d’apprentissage PARTITIONNENT les projets pris en main', () => {
    // `won` + « pris en charge » + « clos sans affaire » = tout sauf l'intake.
    // Avant D37, `qualified` n'était dans AUCUN panier : une équipe qui
    // qualifie sans avancer ne produisait qu'une ligne à zéro, jetée au tri.
    const touched = [...TRIAGED_STAGES, ...CLOSED_UNWON_STAGES, 'won'].sort()
    expect(touched).toEqual(
      PROJECT_STAGES.filter(stage => !(INTAKE_STAGES as readonly string[]).includes(stage)).sort(),
    )
    expect(new Set(touched).size).toBe(touched.length)
  })

  it('« issue connue » est le complément de `dormant` dans les stades clos', () => {
    // Une veille n'est pas une issue : c'est une pause. La compter comme une
    // perte ferait chuter le taux de conversion à chaque projet mis de côté.
    expect([...DECIDED_STAGES]).toEqual(['won', 'lost'])
    expect(DECIDED_STAGES).not.toContain('dormant')
    expect(DECIDED_STAGES.every(stage => (CLOSED_STAGES as readonly string[]).includes(stage))).toBe(true)
  })

  it('rend le littéral SQL — la seule fabrique de stades en SQL', () => {
    expect(projectStageInSql('o.stage', TRIAGED_STAGES)).toBe(
      "o.stage IN ('confirmed','qualified','profiles_submitted','negotiation')",
    )
    expect(projectStageInSql('stage', LIVE_STAGES)).toContain("'detected'")
    expect(projectStageNotInSql('o.stage', INTAKE_STAGES)).toBe("o.stage NOT IN ('detected','potential')")
  })

  it('refuse une liste VIDE — `IN ()` n’est pas du SQL, et le silence serait pire', () => {
    expect(() => projectStageInSql('o.stage', [])).toThrow(/vide/i)
    expect(() => projectStageNotInSql('o.stage', [])).toThrow(/vide/i)
  })
})

describe('décroissance de fraîcheur', () => {
  const now = new Date('2026-09-01T00:00:00.000Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

  it('classe un fait récent comme frais', () => {
    expect(opportunityFreshness(daysAgo(10), now)).toBe('fresh')
  })

  it('déclasse au fil des mois', () => {
    expect(opportunityFreshness(daysAgo(90), now)).toBe('ageing')
    expect(opportunityFreshness(daysAgo(400), now)).toBe('stale')
  })

  it('traite une date absente ou illisible comme périmée, jamais comme fraîche', () => {
    // Un fait non daté ne prouve aucun « maintenant » : le supposer récent est
    // exactement l'erreur qu'on corrige.
    expect(opportunityFreshness(null, now)).toBe('stale')
    expect(opportunityFreshness('pas une date', now)).toBe('stale')
  })

  it('ne remonte JAMAIS une confiance avec le temps', () => {
    // Une fonction qui pourrait augmenter la confiance en vieillissant serait un
    // générateur d'urgences.
    expect(decayedConfidence('high', 'fresh')).toBe('high')
    expect(decayedConfidence('high', 'ageing')).toBe('medium')
    expect(decayedConfidence('high', 'stale')).toBe('low')
    expect(decayedConfidence('low', 'fresh')).toBe('low')
    expect(decayedConfidence('low', 'ageing')).toBe('low')
  })
})

describe('ce qui MANQUE, nommé', () => {
  /**
   * Un `false` nu ne permet pas de DIRE ce qui manque : l'écran annonçait
   * « 383 projets détectés » sans pouvoir écrire ce qui, dans les 383, n'était
   * pas un projet. Le verdict porte donc l'exigence (déjà écrite, en FR et EN)
   * et les manques NOMMÉS — jamais un pourcentage, jamais une chance.
   */

  it('un fait que rien ne rattache : le manque s’appelle « fait non rattaché »', () => {
    const verdict = meetsEvidenceLevel(evidence({ datedFacts: 1 }), 'detected_project')
    expect(verdict.met).toBe(false)
    expect(verdict.missing).toEqual(['unattached_fact'])
    // L'exigence n'est pas réécrite : c'est celle du barème, mot pour mot.
    expect(verdict.requirement).toBe(EVIDENCE_REQUIREMENTS.detected_project)
  })

  it('ce qui manque à une OPPORTUNITÉ est une parole, jamais un second fait', () => {
    // ⚠️ Ce test disait l'inverse le matin même, et la RENCONTRE de deux
    // décisions l'a retourné. D27 · 26/08 a rendu « projet détecté »
    // atteignable ; D50 · 26/08 a fondé « opportunité » sur la DEMANDE et non
    // sur un faisceau. Aucun des deux lots ne pouvait voir l'autre : chacun
    // était juste sur sa branche. Depuis, `single_dated_fact` n'est plus
    // PRODUIT nulle part — la clé reste au contrat (un consommateur peut
    // l'avoir stockée), elle n'est simplement plus émise.
    const manques = meetsEvidenceLevel(evidence({ datedFacts: 1 }), 'opportunity').missing
    expect(manques).toContain('not_expressed')
    expect(manques).not.toContain('single_dated_fact')
  })

  it('rien du tout : le manque s’appelle « aucun fait daté »', () => {
    expect(meetsEvidenceLevel(evidence(), 'detected_project').missing).toEqual(['no_dated_fact'])
    expect(meetsEvidenceLevel(evidence(), 'fact').missing).toEqual(['no_dated_fact'])
  })

  it('« demande confirmée » manque une PAROLE, et le dit', () => {
    expect(meetsEvidenceLevel(evidence({ datedFacts: 10 }), 'confirmed_demand').missing).toEqual(['not_expressed'])
  })

  it('une opportunité incomplète nomme CHACUN des éléments absents', () => {
    // ⚠️ 28/08 : la demande est le PREMIER des éléments nommés — c'est la base
    // du niveau, pas un ajout. Un faisceau sans demande le dit maintenant.
    const verdict = meetsEvidenceLevel(evidence({ datedFacts: 2 }), 'opportunity')
    expect(verdict.met).toBe(false)
    expect(verdict.missing).toEqual(['not_expressed', 'no_fit', 'no_perimeter', 'no_decision_maker', 'no_next_action'])

    const almost = meetsEvidenceLevel(
      evidence({ explicitlyExpressed: true, hasFit: true, hasPerimeter: true, hasDecisionMaker: true }),
      'opportunity',
    )
    expect(almost.missing).toEqual(['no_next_action'])
  })

  it('un niveau satisfait ne manque de rien', () => {
    const complete = evidence({
      datedFacts: 2,
      // ⚠️ 28/08 : sans la demande, `confirmed_demand` et `opportunity` ne sont
      // plus satisfaits par un faisceau — l'entrée « complète » les inclut donc.
      explicitlyExpressed: true,
      hasFit: true,
      hasPerimeter: true,
      hasDecisionMaker: true,
      hasNextAction: true,
    })
    for (const level of evidenceLevelSchema.options) {
      const verdict = meetsEvidenceLevel(complete, level)
      expect(verdict.met).toBe(true)
      expect(verdict.missing).toEqual([])
    }
  })

  /**
   * L'échelle vit à UN seul endroit : {@link highestEvidenceLevel} et
   * {@link meetsEvidenceLevel} disent la MÊME chose sur toutes les entrées
   * possibles × 4 niveaux — le plus haut niveau revendicable satisfait tous
   * ceux qui lui sont inférieurs, et aucun autre. Deux implémentations de la
   * même échelle divergent à la première retouche : celle du 28/08 (D27) l'a
   * montré, l'ancienne cascade écrite à la main aurait ignoré le chemin neuf.
   *
   * Une garde qui ne lit rien passe au vert : on compte donc le corpus, et on
   * vérifie qu'il contient les deux réponses.
   */
  it('les deux lectures de l’échelle ne peuvent pas diverger', () => {
    const order: EvidenceLevel[] = ['fact', 'detected_project', 'confirmed_demand', 'opportunity']
    /** Le niveau atteint satisfait tout ce qui est en dessous — sauf que
     *  `confirmed_demand` et `detected_project` ne sont pas comparables : l'un
     *  vient d'une parole, l'autre d'un faisceau ou d'un rattachement. */
    const impliedByHighest = (input: EvidenceInput, level: EvidenceLevel): boolean => {
      const highest = highestEvidenceLevel(input)
      if (highest === null) return false
      if (level === 'detected_project' && highest === 'confirmed_demand') return true
      return order.indexOf(highest) >= order.indexOf(level)
    }

    let checked = 0
    let met = 0
    for (const datedFacts of [0, 1, 2, 5]) {
      for (const explicitlyExpressed of [false, true]) {
        for (const hasFit of [false, true]) {
          for (const hasPerimeter of [false, true]) {
            for (const hasDecisionMaker of [false, true]) {
              for (const hasNextAction of [false, true]) {
                const input = evidence({
                  datedFacts,
                  explicitlyExpressed,
                  hasFit,
                  hasPerimeter,
                  hasDecisionMaker,
                  hasNextAction,
                })
                for (const level of order) {
                  const verdict = meetsEvidenceLevel(input, level)
                  expect(verdict.met).toBe(impliedByHighest(input, level))
                  // Un manque annoncé alors que le niveau est satisfait (ou
                  // l'inverse) rendrait la liste inexploitable.
                  expect(verdict.missing.length === 0).toBe(verdict.met)
                  checked += 1
                  if (verdict.met) met += 1
                }
              }
            }
          }
        }
      }
    }
    // La garde LIT quelque chose, et elle voit les deux réponses.
    expect(checked).toBe(4 * 2 * 2 * 2 * 2 * 2 * 4)
    expect(met).toBeGreaterThan(0)
    expect(met).toBeLessThan(checked)
  })

  /**
   * Ce que la correction du 28/08 (D27) a CHANGÉ, compté plutôt que raconté.
   *
   * L'ancien barème exigeait deux faits datés convergents. Le nouveau ajoute un
   * troisième chemin — un fait daté RATTACHÉ à un chantier. La différence doit
   * porter exactement sur les entrées à UN fait non exprimé : ni plus (le
   * plancher tiendrait mal), ni moins (le barème n'aurait rien gagné).
   */
  it('n’élargit « projet détecté » QUE sur le chemin ouvert, et sur aucun autre', () => {
    /** Le barème d'AVANT, mot pour mot : parole, ou deux faits convergents. */
    const before = (input: EvidenceInput): boolean => input.explicitlyExpressed || input.datedFacts >= 2

    let elargi = 0
    let identique = 0
    let retreci = 0
    for (const datedFacts of [0, 1, 2, 5]) {
      for (const explicitlyExpressed of [false, true]) {
        for (const hasFit of [false, true]) {
          for (const hasPerimeter of [false, true]) {
            for (const hasDecisionMaker of [false, true]) {
              for (const hasNextAction of [false, true]) {
                const input = evidence({
                  datedFacts,
                  explicitlyExpressed,
                  hasFit,
                  hasPerimeter,
                  hasDecisionMaker,
                  hasNextAction,
                })
                const now = meetsEvidenceLevel(input, 'detected_project').met
                if (now && !before(input)) {
                  elargi += 1
                  // Le SEUL chemin neuf : un fait daté, et de quoi le rattacher.
                  expect(datedFacts).toBe(1)
                  expect(explicitlyExpressed).toBe(false)
                  expect(hasFit || hasPerimeter || hasDecisionMaker || hasNextAction).toBe(true)
                } else if (now === before(input)) identique += 1
                else retreci += 1
              }
            }
          }
        }
      }
    }
    // Un fait, non exprimé, au moins un des quatre rattachements : 15 des 16
    // combinaisons d'axes.
    expect(elargi).toBe(15)
    expect(identique).toBe(4 * 2 * 16 - 15)
    // Aucune ligne ne PERD ce qu'elle revendiquait : on corrige un barème
    // inatteignable, on ne resserre rien au passage.
    expect(retreci).toBe(0)
  })

  it('chaque manque porte un nom dans les deux langues', () => {
    expect(EVIDENCE_GAPS.length).toBeGreaterThan(0)
    for (const gap of EVIDENCE_GAPS) {
      expect(EVIDENCE_GAP_LABELS[gap].fr).not.toBe('')
      expect(EVIDENCE_GAP_LABELS[gap].en).not.toBe('')
    }
  })

  it('la liste des manques ne perd JAMAIS une valeur et n’en insère jamais au milieu (GA-08)', () => {
    expect([...EVIDENCE_GAPS]).toEqual([
      'no_dated_fact',
      'single_dated_fact',
      'not_expressed',
      'no_fit',
      'no_perimeter',
      'no_decision_maker',
      'no_next_action',
      // Ajouté le 28/08/2026 (D27), À LA FIN : le barème « projet détecté » a
      // gagné un chemin, donc un manque de plus. Aucune valeur n'a bougé.
      'unattached_fact',
    ])
  })
})

describe('le niveau de preuve d’un projet', () => {
  /**
   * Ce que le barème vaut appliqué à une VRAIE ligne de la table
   * `opportunities`.
   *
   * Rien n'est deviné : chaque axe se lit dans une colonne que quelqu'un a
   * écrite. Ce qui n'a pas pu être évalué est NOMMÉ — jamais compté zéro.
   */
  function row(over: Partial<ProjectEvidenceSource> = {}): ProjectEvidenceSource {
    return {
      kind: 'signal',
      stage: 'detected',
      source: 'Les Échos',
      offer: null,
      primary_domain_code: null,
      amount_cents: null,
      expected_close_on: null,
      btmmp: null,
      first_detected_at: '2026-08-01T00:00:00.000Z',
      ...over,
    }
  }

  it('un signal daté et sourcé, que rien ne rattache, vaut UN fait — pas un projet détecté', () => {
    // Le cœur de la correction du 28/08 : la barre baisse pour ce que la table
    // porte VRAIMENT, elle ne disparaît pas. Un événement nu reste un fait.
    const claim = projectEvidence(row())
    expect(claim.level).toBe('fact')
    expect(claim.missing).toEqual(['unattached_fact'])
    expect(claim.requirement).toBe(EVIDENCE_REQUIREMENTS.fact)
  })

  it('le même signal, RATTACHÉ à une offre, est un projet détecté (D27)', () => {
    // La ligne réaliste qui doit franchir le barème : elle sort telle quelle de
    // la voie `pain` de `materialize` (`offer` = `esn_offer`).
    const claim = projectEvidence(row({ kind: 'pain', offer: 'TMA applicative' }))
    expect(claim.level).toBe('detected_project')
    expect(claim.missing).toEqual([])
    expect(claim.requirement).toBe(EVIDENCE_REQUIREMENTS.detected_project)
  })

  it('la même ligne SANS source ne franchit rien — le fait reste le socle', () => {
    // La contre-épreuve : un rattachement ne fabrique pas la preuve qui manque.
    const claim = projectEvidence(row({ kind: 'pain', offer: 'TMA applicative', source: null }))
    expect(claim.level).toBeNull()
    expect(claim.requirement).toBeNull()
    expect(claim.missing).toEqual(['no_dated_fact'])
  })

  it('chacun des quatre rattachements suffit, lu dans SA colonne', () => {
    expect(projectEvidence(row({ primary_domain_code: 'dev-applicatif' })).level).toBe('detected_project')
    expect(projectEvidence(row({ amount_cents: 12_000_000 })).level).toBe('detected_project')
    expect(projectEvidence(row({ expected_close_on: '2026-12-01' })).level).toBe('detected_project')
    expect(projectEvidence(row({ btmmp: { budget: '300 k€' } })).level).toBe('detected_project')
    expect(projectEvidence(row({ btmmp: { timing: 'T4 2026' } })).level).toBe('detected_project')
    expect(projectEvidence(row({ btmmp: { management: 'DSI groupe' } })).level).toBe('detected_project')
    expect(projectEvidence(row({ btmmp: { nextStep: 'Atelier le 12' } })).level).toBe('detected_project')
  })

  it('un montant ABSENT n’est pas un périmètre — `undefined` n’est pas une valeur saisie', () => {
    // `amount_cents` est `number | null | undefined` : une source construite sans
    // la clé (déploiement décalé, appelant partiel) rendait `undefined !== null`
    // vrai, donc « périmètre identifié » sur une ligne qui ne porte rien. Une
    // absence lue comme une présence est la faute symétrique de « 0 » pour
    // « non mesuré » — et elle aurait promu la ligne toute seule.
    const { amount_cents: _ignored, ...withoutAmount } = row()
    expect(projectEvidence(withoutAmount).level).toBe('fact')
    expect(projectEvidence({ ...row(), amount_cents: undefined }).level).toBe('fact')
  })

  it('une implication est une déduction, pas un fait daté', () => {
    // `materialize` le dit déjà en toutes lettres : « a deduction, not a sourced
    // fact ». Le niveau doit le dire aussi, au lieu de compter un fait de plus.
    const claim = projectEvidence(row({ kind: 'implication', source: 'implication' }))
    expect(claim.level).toBeNull()
    expect(claim.requirement).toBeNull()
    expect(claim.missing).toEqual(['no_dated_fact'])
  })

  it('une nature INCONNUE dégrade en douceur — pas en « aucune preuve »', () => {
    // `kind` est du texte libre sur le fil, et la démonstration écrit déjà
    // `besoin`, qui n'est dans aucune énumération. Une liste d'autorisation
    // ferait passer une absence de VOCABULAIRE pour une absence de PREUVE.
    expect(projectEvidence(row({ kind: 'besoin' })).level).toBe('fact')
  })

  it('une ligne sans source n’est pas un fait — et « 0 » n’est pas une source', () => {
    expect(projectEvidence(row({ source: null })).level).toBeNull()
    expect(projectEvidence(row({ source: '   ' })).level).toBeNull()
    expect(projectEvidence(row({ first_detected_at: 'pas une date' })).level).toBeNull()
  })

  it('une source qui RÉPÈTE la nature de la ligne n’est pas un témoin', () => {
    // Le défaut mesuré le 28/08 : `materialize` écrivait dans `source` le nom de
    // la VOIE de code — 'pain', 'challenge', 'program', 'implication', et
    // 'signal' quand le signal n'en avait justement aucune. Sur 4 voies sur 5,
    // une ABSENCE de source passait donc pour une source, et la ligne
    // revendiquait « un événement daté ET sourcé » sur une tautologie.
    //
    // L'écriture est corrigée. La lecture doit l'être aussi : les lignes déjà en
    // base portent le nom de la voie, et `materialize` est `ON CONFLICT DO
    // NOTHING` — elles ne repasseront jamais par l'écriture. Sans cette règle,
    // deux lignes portant exactement la même preuve auraient deux niveaux selon
    // leur DATE de matérialisation.
    //
    // La règle est générale, pas une liste de noms à tenir à jour : une `source`
    // qui ne dit rien de plus que `kind` ne désigne aucun témoin.
    for (const kind of ['pain', 'challenge', 'program', 'signal']) {
      expect(projectEvidence(row({ kind, source: kind })).level).toBeNull()
    }
    // Ni la casse ni les espaces ne rachètent la tautologie.
    expect(projectEvidence(row({ kind: 'signal', source: '  Signal ' })).level).toBeNull()
    // Un vrai témoin reste un témoin — c'est le cas que la règle doit épargner.
    expect(projectEvidence(row({ kind: 'signal', source: 'Les Échos' })).level).toBe('fact')
    expect(projectEvidence(row({ kind: 'pain', source: 'BODACC' })).level).toBe('fact')
  })

  it('« demande confirmée » n’annonce que la provenance qu’une ligne porte VRAIMENT', () => {
    // Mesuré le 28/08. Ancienne exigence, mot pour mot :
    //   « Une demande explicitement exprimée par un contact, le CRM ou l’utilisateur. »
    // Or la SEULE chose qu'une ligne `opportunities` permet d'observer est
    // `isPipelineStage(row.stage)` : un geste humain, dont l'AUTEUR n'est écrit
    // dans aucune colonne. Les provenances « contact » et « CRM » étaient
    // promises et invérifiables. Un barème qui annonce ce que la donnée ne peut
    // pas dire est faux, même quand son verdict, lui, est juste.
    for (const lang of ['fr', 'en'] as const) {
      const texte = EVIDENCE_REQUIREMENTS.confirmed_demand[lang]
      expect(texte).not.toBe('')
      // Plus d'énumération de provenances présentée comme observable.
      expect(texte).not.toMatch(/exprimée par un contact|expressed by a contact/)
    }

    // Le verdict, lui, ne bouge pas d'un pouce : c'est le GESTE qui l'atteste,
    // et rien d'autre sur la ligne ne peut l'attester.
    expect(projectEvidence(row({ stage: 'confirmed' })).level).toBe('confirmed_demand')
    expect(projectEvidence(row({ stage: 'detected' })).level).toBe('fact')
  })

  it('un projet que quelqu’un a mis dans le pipe est une demande exprimée', () => {
    // Le stade `confirmed` s'appelle « Besoin exprimé » à l'écran : y déplacer
    // un projet est un geste HUMAIN, pas une déduction.
    const claim = projectEvidence(row({ stage: 'confirmed' }))
    expect(claim.level).toBe('confirmed_demand')
    expect(claim.missing).toEqual([])
  })

  it('une opportunité exige les cinq éléments, lus dans les colonnes', () => {
    const claim = projectEvidence(
      row({
        stage: 'negotiation',
        offer: 'TMA',
        amount_cents: 12_000_000,
        btmmp: { management: 'DSI groupe', nextStep: 'Atelier de cadrage le 12' },
      }),
    )
    expect(claim.level).toBe('opportunity')

    // Il en manque un : ce n'en est plus une.
    const withoutNext = projectEvidence(
      row({ stage: 'negotiation', offer: 'TMA', amount_cents: 12_000_000, btmmp: { management: 'DSI groupe' } }),
    )
    expect(withoutNext.level).toBe('confirmed_demand')
  })

  it('une ligne intégralement qualifiée n’est une opportunité que DANS le pipe', () => {
    // Tout est renseigné — offre, montant, décideur, prochaine action — et
    // pourtant, hors du pipe, personne n'a rien demandé. La ligne reste un fait.
    const qualifiee = {
      offer: 'TMA',
      amount_cents: 12_000_000,
      btmmp: { management: 'DSI groupe', nextStep: 'Atelier de cadrage le 12' },
    }
    expect(projectEvidence(row({ ...qualifiee, stage: 'negotiation' })).level).toBe('opportunity')
    // ⚠️ Hors du pipe, elle n'est plus un simple FAIT depuis D27 · 26/08 : un
    // fait daté que quelque chose rattache à un chantier EST un projet détecté.
    // Ce qui lui manque pour être une opportunité reste entier — une demande.
    expect(projectEvidence(row({ ...qualifiee, stage: 'detected' })).level).toBe('detected_project')
  })

  it('rend exactement la forme annoncée par le contrat', () => {
    expect(() => projectEvidenceSchema.parse(projectEvidence(row()))).not.toThrow()
    expect(() => projectEvidenceSchema.parse(projectEvidence(row({ stage: 'won' })))).not.toThrow()
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LA MESURE QUI A FONDÉ D27 — REJOUÉE, JAMAIS SUPPOSÉE
   * ─────────────────────────────────────────────────────────────────────────
   * On énumère l'espace des états d'une ligne au stade `detected` au lieu de le
   * supposer : onze champs binaires, 2 048 formes. Sous l'ancien barème, ZÉRO
   * franchissait « projet détecté » — et c'était STRUCTUREL, une ligne
   * `opportunities` ne portant qu'un seul fait daté. L'écran annonçait pourtant
   * « 383 projets détectés à reprendre » : une population dont aucun membre ne
   * satisfaisait notre propre définition.
   *
   * Le test garde les DEUX chiffres. Si quelqu'un « restaure » l'exigence de
   * deux faits convergents, le premier repasse à zéro et la garde le dit.
   */
  it('mesure l’espace des états d’une ligne « detected » — avant : 0, après : 255 sur 2 048', () => {
    const binaire = [true, false]
    let formes = 0
    let projetsDetectes = 0
    let faits = 0
    let sousLAncienBareme = 0

    for (const deduit of binaire) {
      for (const sourcee of binaire) {
        for (const datee of binaire) {
          for (const offre of binaire) {
            for (const domaine of binaire) {
              for (const montant of binaire) {
                for (const echeance of binaire) {
                  for (const budget of binaire) {
                    for (const calendrier of binaire) {
                      for (const decideur of binaire) {
                        for (const prochaineAction of binaire) {
                          const candidate = row({
                            kind: deduit ? 'implication' : 'signal',
                            stage: 'detected',
                            source: sourcee ? 'Les Échos' : null,
                            first_detected_at: datee ? '2026-08-01T00:00:00.000Z' : 'pas une date',
                            offer: offre ? 'TMA applicative' : null,
                            primary_domain_code: domaine ? 'dev-applicatif' : null,
                            amount_cents: montant ? 12_000_000 : null,
                            expected_close_on: echeance ? '2026-12-01' : null,
                            btmmp: {
                              budget: budget ? '300 k€' : null,
                              timing: calendrier ? 'T4 2026' : null,
                              management: decideur ? 'DSI groupe' : null,
                              nextStep: prochaineAction ? 'Atelier le 12' : null,
                            },
                          })
                          const claim = projectEvidence(candidate)
                          formes += 1
                          if (claim.level === 'detected_project') projetsDetectes += 1
                          if (claim.level === 'fact') faits += 1
                          // L'ancien barème, RECALCULÉ sur la même ligne plutôt
                          // qu'affirmé : une parole, ou deux faits convergents.
                          // Le comptage ne peut pas dépasser 1 — c'est
                          // précisément ce qui le rendait inatteignable.
                          const faitsDatés = !deduit && sourcee && datee ? 1 : 0
                          if (isPipelineStage(candidate.stage) || faitsDatés >= 2) sousLAncienBareme += 1
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // La garde LIT quelque chose : le corpus a la taille annoncée.
    expect(formes).toBe(2048)
    // Le constat qui a fondé la décision de Louis : zéro, et structurellement.
    expect(sousLAncienBareme).toBe(0)
    // Après : les 256 formes qui portent un fait daté, sourcé et non déduit,
    // moins la seule où rien ne le rattache à un chantier.
    expect(projetsDetectes).toBe(255)
    expect(faits).toBe(1)
    // Et le reste ne revendique RIEN : un barème atteignable n'est pas un
    // barème qui accepte tout.
    expect(projetsDetectes + faits).toBe(256)
  })

  /**
   * L'énumération ci-dessus pèse toutes les formes du même poids ; la réalité
   * non. Ce test lit les CINQ voies que `materialize` écrit vraiment, sous la
   * forme exacte qu'elles produisent — c'est le corpus qui compte pour savoir
   * ce que « 383 projets détectés » deviendrait.
   *
   * ⚠️ `source` y vaut le nom de la VOIE (`'pain'`, `'challenge'`, `'program'`,
   * `'implication'`) pour quatre voies sur cinq : la colonne ne nomme pas un
   * témoin, elle nomme le tuyau. C'est une faiblesse RÉELLE du niveau `fact`,
   * relevée le 28/08 et NON corrigée ici — resserrer `fact` exigerait ce que le
   * produit ne collecte pas, exactement le défaut que D27 corrige.
   */
  it('classe les cinq voies de `materialize` telles qu’elles sont réellement écrites', () => {
    const voie = (over: Partial<ProjectEvidenceSource>) =>
      projectEvidence(row({ stage: 'detected', offer: null, btmmp: null, ...over })).level

    // ⚠️ Ce bloc mesure la RENCONTRE de deux décisions du 28/08/2026, écrites
    // par deux agents qui ne pouvaient pas se voir. D27 · 26/08 rend « projet
    // détecté » atteignable avec UN fait rattaché ; D50 · 26/08 cesse de
    // prendre le nom de la voie pour un témoin. La seconde arrive AVANT la
    // première dans l'ordre de lecture : sans témoin, il n'y a pas de fait, et
    // donc rien à promouvoir. Quatre voies sur cinq n'écrivaient que leur
    // propre nom dans `source` — elles ne revendiquent plus rien.
    //
    // 1) Douleur exprimée : `source` = `'pain'`, le nom de la voie. Aucun
    //    témoin, donc aucun fait — même avec une offre reconnue.
    expect(voie({ kind: 'pain', source: 'pain', offer: 'TMA applicative' })).toBeNull()
    expect(voie({ kind: 'pain', source: 'pain', offer: null })).toBeNull()
    // 2) Chantier IT : même tautologie, même verdict.
    expect(voie({ kind: 'challenge', source: 'challenge', offer: 'Infogérance' })).toBeNull()
    // 3) Programme nommé : ni offre, ni témoin.
    expect(voie({ kind: 'program', source: 'program' })).toBeNull()
    // 4) Signal de veille : le SEUL à porter un vrai témoin — et le seul qui
    //    reste un fait. Sans offre, il ne va pas plus loin.
    expect(voie({ kind: 'signal', source: 'Les Échos' })).toBe('fact')
    // 4 bis) …et le même signal avec une offre reconnue devient bien un projet
    //    détecté : les deux décisions se composent, elles ne s'annulent pas.
    expect(voie({ kind: 'signal', source: 'Les Échos', offer: 'TMA applicative' })).toBe('detected_project')
    // 5) Implication ESN : une déduction, pas un fait. Rien, comme avant.
    expect(voie({ kind: 'implication', source: 'implication' })).toBeNull()
  })

  /**
   * #2325.13 — AXE CONFIANCE DU PIPE : « qu'est-ce qu'il manque pour que ce
   * soit une OPPORTUNITÉ complète », pas « ce qu'il faut pour être un projet
   * détecté ». `projectEvidence().missing` reste figé sur `detected_project`
   * (D27) — trivialement vide pour toute ligne déjà DANS le pipe
   * (`isPipelineStage` suffit), donc inutile comme lecture de qualité de
   * données pour la priorisation (#2325). `opportunityEvidenceGaps` RÉUTILISE
   * `projectEvidenceInput` (GA-26, aucun second calcul des mêmes booléens) et
   * lit le niveau le plus exigeant, `opportunity` : fit, périmètre, décideur,
   * prochaine action — le vrai contenu de « CONFIANCE : qualité des données ».
   */
  describe('opportunityEvidenceGaps — #2325.13 : les manques au niveau le plus exigeant', () => {
    it('une ligne dans le pipe sans rien de qualifié porte les quatre manques d’« opportunité »', () => {
      expect(opportunityEvidenceGaps(row({ stage: 'qualified' }))).toEqual([
        'no_fit',
        'no_perimeter',
        'no_decision_maker',
        'no_next_action',
      ])
    })

    it('entièrement qualifiée dans le pipe : aucun manque — un signal POSITIF, pas une absence', () => {
      const claim = opportunityEvidenceGaps(
        row({
          stage: 'negotiation',
          offer: 'TMA',
          amount_cents: 12_000_000,
          btmmp: { management: 'DSI groupe', nextStep: 'Atelier de cadrage le 12' },
        }),
      )
      expect(claim).toEqual([])
    })

    it('hors du pipe (jamais exprimée), le manque "not_expressed" ouvre la liste', () => {
      const claim = opportunityEvidenceGaps(row({ stage: 'detected' }))
      expect(claim).toContain('not_expressed')
    })

    it('un seul élément manquant reste nommé seul — jamais arrondi à "tout manque"', () => {
      const presqueComplete = opportunityEvidenceGaps(
        row({
          stage: 'negotiation',
          offer: 'TMA',
          amount_cents: 12_000_000,
          btmmp: { management: 'DSI groupe' },
        }),
      )
      expect(presqueComplete).toEqual(['no_next_action'])
    })
  })
})

/**
 * #2119.2 — LE CONTRAT DE LA RÉPONSE, ET CE QU'IL LAISSE PASSER.
 *
 * `evidence` traversait le fil depuis des mois sans qu'aucun écran ne puisse le
 * lire : le type qui le portait vivait DANS `ProjectsService`, et le web typait
 * sa réponse `ProjectRow[]`. Ces trois tests tiennent la forme désormais
 * publique, et surtout la distinction entre « l'API n'a pas dit » (absent) et
 * « l'API a répondu qu'elle ne sait pas » (`level: null`).
 */
describe('projectReadRowSchema — la ligne telle que GET /projects la rend (#2119.2)', () => {
  const base = {
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Socle data',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: '2026-09-01T00:00:00.000Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }

  it('accepte une ligne SANS `evidence` — une API antérieure au champ reste lisible', () => {
    const parsed = projectReadRowSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.evidence).toBeUndefined()
  })

  it('accepte `level: null` — « non mesuré » est une VRAIE réponse, distincte de l’absence', () => {
    const parsed = projectReadRowSchema.safeParse({
      ...base,
      evidence: { level: null, requirement: null, missing: ['no_dated_fact'] },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.evidence?.level).toBeNull()
  })

  it('REFUSE un niveau hors de l’échelle — c’est ce qui empêche un cinquième barreau de naître dans une réponse', () => {
    const parsed = projectReadRowSchema.safeParse({
      ...base,
      evidence: { level: 'probable', requirement: null, missing: [] },
    })
    expect(parsed.success).toBe(false)
  })

  /**
   * #2170.3 (tranché sans Louis) — `stage_detail` suit EXACTEMENT le même
   * patron que `evidence` juste au-dessus : calculé à la lecture, jamais migré.
   */
  it('accepte une ligne SANS `stage_detail` — une API antérieure au champ reste lisible', () => {
    const parsed = projectReadRowSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.stage_detail).toBeUndefined()
  })

  it('accepte `stage_detail: null` — aucun affinage applicable, une vraie réponse', () => {
    const parsed = projectReadRowSchema.safeParse({ ...base, stage_detail: null })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.stage_detail).toBeNull()
  })

  it('accepte une des trois valeurs d’affinage', () => {
    const parsed = projectReadRowSchema.safeParse({ ...base, stage_detail: 'profiles_wanted' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.stage_detail).toBe('profiles_wanted')
  })

  it('REFUSE une valeur hors des trois granularités — jamais une sixième étape déguisée', () => {
    const parsed = projectReadRowSchema.safeParse({ ...base, stage_detail: 'won' })
    expect(parsed.success).toBe(false)
  })
})
