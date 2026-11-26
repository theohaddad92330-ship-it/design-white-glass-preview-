import { describe, expect, it } from 'vitest'
import {
  LEGACY_NEED_STATUSES,
  NEED_CLOSED_STATUSES,
  NEED_OPEN_STATUSES,
  NEED_STATUS_ORDER,
  canTransitionNeedStatus,
  isNeedOpen,
  needResumeOnProblem,
  needStatusRequiresReason,
  needStillOpenSql,
  normaliseNeedStatus,
} from './need-status.js'
import { PROJECT_NEED_STATUSES } from './project.js'

/**
 * Les onze états de besoin (PDF 2 §7.4, décision D13 : EN BASE).
 *
 * Ce qui mérite un test n'est pas la liste — c'est ce qui se paie si elle est
 * mal tenue : un besoin gagné qui compte encore comme ouvert fait croire à du
 * travail qui n'existe pas, une perte sans motif rend le taux de refus
 * illisible, et une transition qui saute la qualification produit un matching
 * lancé sur des compétences que personne n'a renseignées.
 */
describe('les quatorze états, et les quatre hérités', () => {
  it('couvre les quatorze états du terrain — #2942/#2152.9-.10 ajoutent Entretien et Négociation, #2323.1 ajoute Détecté', () => {
    for (const status of NEED_STATUS_ORDER) {
      expect(PROJECT_NEED_STATUSES).toContain(status)
    }
    expect(NEED_STATUS_ORDER).toHaveLength(14)
  })

  it('garde les quatre valeurs historiques ACCEPTÉES — une écriture en vol ne doit pas être rejetée', () => {
    for (const legacy of LEGACY_NEED_STATUSES) {
      expect(PROJECT_NEED_STATUSES).toContain(legacy)
    }
  })

  it('ne classe aucun état à la fois ouvert et clos', () => {
    const closed = new Set<string>(NEED_CLOSED_STATUSES)
    expect(NEED_OPEN_STATUSES.filter(status => closed.has(status))).toEqual([])
  })

  it('classe CHAQUE état du terrain, ouvert ou clos — un état non classé disparaîtrait des deux vues', () => {
    // ⚠️ #2323.1 : `detected` est l'exception NOMMÉE — ni ouvert (il n'entre
    // dans aucun compteur de besoins ouverts, un besoin suggéré n'est pas
    // encore travaillé) ni clos. Une exception non écrite ici se relirait
    // comme un oubli au prochain état ajouté ; celle-ci est volontaire.
    const classified = new Set<string>([...NEED_OPEN_STATUSES, ...NEED_CLOSED_STATUSES])
    expect(NEED_STATUS_ORDER.filter(status => !classified.has(status))).toEqual(['detected'])
  })

  it('#2323.1 — `detected` ne compte dans AUCUN des deux compteurs', () => {
    expect(NEED_OPEN_STATUSES).not.toContain('detected')
    expect(NEED_CLOSED_STATUSES).not.toContain('detected')
  })
})

describe('normaliseNeedStatus', () => {
  it('lit les valeurs héritées comme leur équivalent d’aujourd’hui', () => {
    expect(normaliseNeedStatus('open')).toBe('to_qualify')
    expect(normaliseNeedStatus('staffed')).toBe('won')
  })

  it('laisse les autres intactes', () => {
    expect(normaliseNeedStatus('shortlist_ready')).toBe('shortlist_ready')
    expect(normaliseNeedStatus('cancelled')).toBe('cancelled')
  })

  it('rend `to_qualify` sur une valeur inconnue plutôt que de propager un état fantôme', () => {
    expect(normaliseNeedStatus('n’importe quoi')).toBe('to_qualify')
  })
})

describe('isNeedOpen', () => {
  it('compte « en veille » et « à réactiver » comme ouverts — le besoin du client existe toujours', () => {
    expect(isNeedOpen('on_hold')).toBe(true)
    expect(isNeedOpen('to_reactivate')).toBe(true)
  })

  it('ne compte ni gagné, ni perdu, ni annulé', () => {
    expect(isNeedOpen('won')).toBe(false)
    expect(isNeedOpen('lost')).toBe(false)
    expect(isNeedOpen('cancelled')).toBe(false)
  })

  it('lit une valeur héritée sans se tromper', () => {
    expect(isNeedOpen('open')).toBe(true)
    expect(isNeedOpen('staffed')).toBe(false)
  })
})

describe('needStatusRequiresReason', () => {
  it('exige un motif sur une perte — sans lui, le taux de refus par cause ne veut rien dire', () => {
    expect(needStatusRequiresReason('lost')).toBe(true)
  })

  it('exige un motif sur une annulation', () => {
    expect(needStatusRequiresReason('cancelled')).toBe(true)
  })

  it('exige un motif pour mettre en veille — « en veille » sans raison est le besoin que personne ne rouvre', () => {
    expect(needStatusRequiresReason('on_hold')).toBe(true)
  })

  it('n’en exige pas pour avancer — un formulaire à chaque étape se contourne', () => {
    expect(needStatusRequiresReason('qualified')).toBe(false)
    expect(needStatusRequiresReason('won')).toBe(false)
  })

  it('n’en exige pas pour entrer en entretien ou en négociation — ce sont des avancées, pas des arrêts', () => {
    expect(needStatusRequiresReason('interview')).toBe(false)
    expect(needStatusRequiresReason('negotiation')).toBe(false)
  })

  it('n’en exige pas pour réactiver — le motif de la veille MEURT quand la veille finit', () => {
    expect(needStatusRequiresReason('to_reactivate')).toBe(false)
  })
})

describe('canTransitionNeedStatus', () => {
  it('laisse avancer d’une étape', () => {
    expect(canTransitionNeedStatus('to_qualify', 'qualified').allowed).toBe(true)
    expect(canTransitionNeedStatus('qualified', 'to_match').allowed).toBe(true)
    expect(canTransitionNeedStatus('submitted', 'client_review').allowed).toBe(true)
  })

  it('laisse revenir en arrière — un profil refusé renvoie à la shortlist, et c’est le métier', () => {
    expect(canTransitionNeedStatus('client_review', 'to_match').allowed).toBe(true)
  })

  /**
   * #2942, #2152.9/.10 — les deux étapes qui manquaient au Pipe des besoins,
   * entre « en validation client » et « gagné » : le client passe du profil
   * reçu (`client_review`) à l'entretien, puis à la négociation, avant de
   * signer. Statuts STORED, comme les onze autres (D13) — un recruteur les
   * POSE, il ne les déduit pas.
   */
  it('laisse avancer de « en validation client » à « entretien », puis à « négociation », puis à « gagné »', () => {
    expect(canTransitionNeedStatus('client_review', 'interview').allowed).toBe(true)
    expect(canTransitionNeedStatus('interview', 'negotiation').allowed).toBe(true)
    expect(canTransitionNeedStatus('negotiation', 'won').allowed).toBe(true)
  })

  it('laisse revenir en arrière depuis l’entretien ou la négociation — le client peut redemander des profils', () => {
    expect(canTransitionNeedStatus('interview', 'client_review').allowed).toBe(true)
    expect(canTransitionNeedStatus('negotiation', 'to_match').allowed).toBe(true)
  })

  it('refuse de sauter directement de « profil proposé » à « négociation »', () => {
    const verdict = canTransitionNeedStatus('submitted', 'negotiation')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBeTruthy()
  })

  it('refuse de sauter la qualification : un matching sans compétences renseignées ne cherche rien', () => {
    const verdict = canTransitionNeedStatus('to_qualify', 'matching')
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toBeTruthy()
  })

  it('laisse clore depuis n’importe quel état ouvert — un client peut annuler à tout moment', () => {
    for (const from of NEED_OPEN_STATUSES) {
      expect(canTransitionNeedStatus(from, 'lost').allowed).toBe(true)
      expect(canTransitionNeedStatus(from, 'cancelled').allowed).toBe(true)
    }
  })

  it('refuse de rouvrir un besoin gagné sans repasser par « à réactiver »', () => {
    // Rouvrir un gagné sans le dire ferait disparaître une mission de la vue de
    // quelqu'un, en silence.
    expect(canTransitionNeedStatus('won', 'matching').allowed).toBe(false)
    expect(canTransitionNeedStatus('won', 'to_reactivate').allowed).toBe(true)
  })

  it('refuse une transition vers soi-même — un « changement » qui ne change rien journalise du bruit', () => {
    expect(canTransitionNeedStatus('qualified', 'qualified').allowed).toBe(false)
  })

  it('accepte une valeur héritée comme point de départ', () => {
    expect(canTransitionNeedStatus('open', 'qualified').allowed).toBe(true)
  })

  it('#2323.1 — `detected` se promeut en `to_qualify` par un geste explicite', () => {
    expect(canTransitionNeedStatus('detected', 'to_qualify').allowed).toBe(true)
  })

  it('#2323.1 — `detected` ne saute pas la qualification, même règle que les autres', () => {
    const verdict = canTransitionNeedStatus('detected', 'matching')
    expect(verdict.allowed).toBe(false)
  })
})

/**
 * « Un besoin encore ouvert », écrit en SQL.
 *
 * Ce que ces tests tiennent : le SQL pose EXACTEMENT la même question que
 * {@link isNeedOpen}, et il ne nomme que des statuts qui existent. Cinq
 * requêtes du dépôt portaient quatre définitions différentes, dont trois
 * écrivaient `NOT IN ('closed', 'cancelled', 'filled')` — deux valeurs qui ne
 * sont pas des statuts de besoin. Un `NOT IN` sur une valeur absente de
 * l'énumération ne lève pas : il est INERTE. Le prédicat avait l'air d'exclure
 * les besoins clos, et n'excluait qu'`cancelled`.
 */
describe('needStillOpenSql', () => {
  it('pose la MÊME question que `isNeedOpen`, pour chaque statut du contrat', () => {
    // La vraie garantie : aucun statut ne peut être « ouvert » d'un côté et
    // « clos » de l'autre. C'est la divergence qui a coûté les cinq requêtes.
    const sql = needStillOpenSql('n.status')
    for (const status of PROJECT_NEED_STATUSES) {
      expect(sql.includes(`'${status}'`)).toBe(isNeedOpen(status))
    }
  })

  it('ne nomme aucune valeur qui n’est pas un statut de besoin', () => {
    const literals = [...needStillOpenSql('status').matchAll(/'([a-z_]+)'/g)].map(match => match[1] ?? '')
    expect(literals.length).toBeGreaterThan(5)
    for (const literal of literals) expect(PROJECT_NEED_STATUSES).toContain(literal)
    // Les deux valeurs du défaut, nommément.
    expect(literals).not.toContain('closed')
    expect(literals).not.toContain('filled')
  })

  it('exclut bien les statuts CLOS — gagné compris', () => {
    // `won` est la valeur que la reprise a substituée à `staffed` : deux des
    // listes recopiées l'avaient oubliée, et comptaient donc chaque besoin
    // gagné parmi les ouverts.
    const sql = needStillOpenSql('n.status')
    for (const status of NEED_CLOSED_STATUSES) expect(sql).not.toContain(`'${status}'`)
    expect(sql).not.toContain("'won'")
  })

  it('accepte une colonne nue comme une colonne préfixée', () => {
    expect(needStillOpenSql('status').startsWith('status IN (')).toBe(true)
    expect(needStillOpenSql('n.status').startsWith('n.status IN (')).toBe(true)
  })

  it('refuse une expression de colonne qui n’en est pas une', () => {
    // Les VALEURS viennent d'une énumération figée ; la colonne est le seul
    // morceau que l'appelant choisit, donc le seul qui se vérifie.
    expect(() => needStillOpenSql('status) OR 1=1 --')).toThrow(/colonne invalide/i)
    expect(() => needStillOpenSql('')).toThrow(/colonne invalide/i)
  })
})

describe('#3389.13 — la date de reprise d’une veille', () => {
  const TODAY = '2026-10-01'

  it('une veille PEUT porter sa date, y compris aujourd’hui', () => {
    expect(needResumeOnProblem('on_hold', '2026-11-15', TODAY)).toBeNull()
    expect(needResumeOnProblem('on_hold', TODAY, TODAY)).toBeNull()
  })

  it('la date est facultative : pas de date n’est pas une erreur, c’est une veille sans échéance', () => {
    expect(needResumeOnProblem('on_hold', null, TODAY)).toBeNull()
    expect(needResumeOnProblem('on_hold', undefined, TODAY)).toBeNull()
  })

  it('⚠️ une date sur un état qui n’est PAS la veille est refusée — elle ne voudrait rien dire', () => {
    for (const status of ['lost', 'cancelled', 'to_reactivate', 'qualified']) {
      expect(needResumeOnProblem(status, '2026-11-15', TODAY)).toBe('only_on_hold')
    }
  })

  it('⚠️ une reprise dans le passé est refusée, pas silencieusement acceptée', () => {
    expect(needResumeOnProblem('on_hold', '2026-09-30', TODAY)).toBe('in_the_past')
  })
})
