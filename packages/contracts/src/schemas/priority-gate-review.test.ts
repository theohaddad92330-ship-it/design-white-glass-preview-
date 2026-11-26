import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARK_REASONS,
  isDefinitiveRefusal,
  isReexaminationDue,
  PARK_REASON_REVIEW_MONTHS,
  reexaminationDueAt,
} from './priority-gate.js'

const NOW = new Date('2026-08-22T00:00:00Z')

describe('la péremption du refus', () => {
  it('reopens a budget refusal after six months — the fiscal year changes', () => {
    expect(isReexaminationDue('no_budget', '2026-01-10', NOW)).toBe(true)
    expect(isReexaminationDue('no_budget', '2026-06-10', NOW)).toBe(false)
  })

  it('reopens a bad timing after three months — that is what they said', () => {
    expect(isReexaminationDue('bad_timing', '2026-04-01', NOW)).toBe(true)
  })

  it('never reopens “do not contact again”', () => {
    // Ce n'est pas un délai, c'est une décision. La relancer serait la faute la
    // plus visible qu'un outil de prospection puisse commettre.
    expect(reexaminationDueAt('do_not_contact', '2020-01-01')).toBeNull()
    expect(isReexaminationDue('do_not_contact', '2020-01-01', NOW)).toBe(false)
  })

  it('does not reopen what the FIRM decided rather than the client', () => {
    // « Hors cible » et « taille inadaptée » ne sont pas des refus du client :
    // ils changeraient si l'ESN grandit, pas si le compte bouge.
    expect(reexaminationDueAt('out_of_icp', '2020-01-01')).toBeNull()
    expect(reexaminationDueAt('size', '2020-01-01')).toBeNull()
  })

  it('never guesses a cadence for a free-text reason', () => {
    expect(reexaminationDueAt('other', '2020-01-01')).toBeNull()
    expect(reexaminationDueAt('une raison inventée', '2020-01-01')).toBeNull()
  })

  it('refuses to decide without a decision date', () => {
    // Sans date, on ne PEUT pas savoir si le délai est écoulé — et le supposer
    // ferait relancer un refus d'hier.
    expect(reexaminationDueAt('no_budget', null)).toBeNull()
    expect(reexaminationDueAt('no_budget', 'pas une date')).toBeNull()
  })

  it('gives every catalogued reason an explicit cadence', () => {
    // Un motif sans entrée retomberait sur « jamais » par accident plutôt que
    // par décision, et personne ne saurait lequel.
    for (const { key } of DEFAULT_PARK_REASONS) {
      expect(Object.hasOwn(PARK_REASON_REVIEW_MONTHS, key)).toBe(true)
    }
  })

  it('carries the two reasons the tome names and no catalogue held', () => {
    const keys = DEFAULT_PARK_REASONS.map(r => r.key)
    expect(keys).toContain('not_interested')
    expect(keys).toContain('do_not_contact')
  })
})

/**
 * #3262 (BEL-SC-233) — trois des treize motifs neufs ne se réexaminent pas au
 * TEMPS : ils se résolvent par un ÉVÉNEMENT (le collègue libère le compte, le
 * conflit partenaire se dénoue, la revue juridique conclut), jamais par un
 * délai qu'on aurait deviné. `null` ici ne les rend PAS définitifs pour autant
 * — `isDefinitiveRefusal` reste `false` sur les trois, exactement comme
 * `out_of_icp` : un évènement peut légitimement les rouvrir, le temps seul ne
 * le peut pas.
 */
describe('trois motifs neufs ne se réexaminent jamais AU TEMPS, sans être définitifs', () => {
  it('worked_by_colleague, partner_conflict, legal_reputational_risk : pas de cadence temps', () => {
    for (const reason of ['worked_by_colleague', 'partner_conflict', 'legal_reputational_risk']) {
      expect(PARK_REASON_REVIEW_MONTHS[reason]).toBeNull()
      expect(isDefinitiveRefusal(reason)).toBe(false)
    }
  })
})

/**
 * L'échéance connue avance le réexamen — tome 1 §11.5.
 *
 * La cadence du tome est « déjà un prestataire → **à l'échéance du contrat si
 * connue**, sinon 12 mois ». Le code appliquait 12 mois dans tous les cas,
 * alors que le dépôt CONNAÎT l'échéance depuis le 23/08 : `access_facts.
 * reopens_on`, calculée depuis DECP, et `referencingWindowAlert` qui prévient
 * à T-9 / T-6 / T-3.
 *
 * Les deux moitiés existaient et ne se parlaient pas. Sur un compte écarté
 * pour titulaire en place dont le marché finit dans quatre mois, l'alerte de
 * fenêtre disait « prépare-toi » pendant que la porte de priorité gardait le
 * compte écarté encore douze mois — huit mois APRÈS le seul moment où le panel
 * s'ouvre.
 *
 * ⚠️ On prend la plus PROCHE des deux, jamais la plus lointaine : un marché de
 * trois ans ne doit pas faire dormir un compte trois ans. Le commentaire de la
 * cadence le disait déjà — « on regarde chaque année ».
 */
describe("l'échéance connue avance le réexamen, jamais ne le repousse", () => {
  it('AVANCE quand la fenêtre s’ouvre avant les douze mois', () => {
    // Marché qui finit dans 4 mois : on réexamine à ce moment-là, pas dans un an.
    const due = reexaminationDueAt('incumbent', '2026-08-01', { reopensOn: '2026-12-01' })
    expect(due?.toISOString().slice(0, 10)).toBe('2026-12-01')
  })

  it('NE REPOUSSE PAS quand la fenêtre est plus lointaine que la cadence', () => {
    // Marché de trois ans : on regarde quand même dans un an.
    const due = reexaminationDueAt('incumbent', '2026-08-01', { reopensOn: '2029-08-01' })
    expect(due?.toISOString().slice(0, 10)).toBe('2027-08-01')
  })

  it('échéance inconnue : comportement d’avant, à l’octet près', () => {
    expect(reexaminationDueAt('incumbent', '2026-08-01', { reopensOn: null })?.toISOString()).toBe(
      reexaminationDueAt('incumbent', '2026-08-01')?.toISOString(),
    )
  })

  it('une échéance illisible ne fait rien — on ne devine pas une date', () => {
    expect(reexaminationDueAt('incumbent', '2026-08-01', { reopensOn: 'bientôt' })?.toISOString()).toBe(
      reexaminationDueAt('incumbent', '2026-08-01')?.toISOString(),
    )
  })

  it('un refus DÉFINITIF le reste, même avec une fenêtre datée', () => {
    // C'est la propriété la plus importante : « ne plus me contacter » n'est pas
    // un délai, et une échéance de marché ne peut pas le renverser.
    expect(reexaminationDueAt('do_not_contact', '2026-08-01', { reopensOn: '2026-12-01' })).toBeNull()
    expect(reexaminationDueAt('out_of_icp', '2026-08-01', { reopensOn: '2026-12-01' })).toBeNull()
  })

  it('une échéance DÉJÀ PASSÉE rend le compte réexaminable tout de suite', () => {
    expect(isReexaminationDue('incumbent', '2026-08-01', NOW, { reopensOn: '2026-08-10' })).toBe(true)
  })
})

/**
 * « Ne plus me contacter » n'est pas une cadence — tome 1 §17.1, U34.
 *
 * La cadence portait déjà la règle pour la voie TEMPS (`null` = jamais). Mais
 * un compte écarté se rouvre par DEUX voies, et la seconde — « il s'est passé
 * quelque chose sur ce compte » — ne filtrait rien : un compte dont
 * l'interlocuteur avait demandé à ne plus être contacté remontait dans les
 * propositions dès qu'un signal arrivait.
 *
 * ⚠️ La distinction avec les autres `null` est le cœur de la règle.
 * `out_of_icp`, `size` et `geography` n'ont pas de cadence parce que ce sont
 * des choix de l'ESN, pas des refus du client — les proposer est inutile, pas
 * fautif. `do_not_contact` est le seul qui soit une INTERDICTION, et aucune
 * voie ne doit pouvoir la contourner.
 */
describe('un refus définitif ferme TOUTES les voies, pas seulement le temps', () => {
  it('« ne plus me contacter » est définitif', () => {
    expect(isDefinitiveRefusal('do_not_contact')).toBe(true)
  })

  it('les choix de l’ESN ne sont PAS des interdictions de contact', () => {
    // Ils n'ont pas de cadence temps, ce qui est autre chose : un signal peut
    // légitimement les remettre sur la table.
    for (const reason of ['out_of_icp', 'size', 'geography', 'other']) {
      expect(PARK_REASON_REVIEW_MONTHS[reason]).toBeNull()
      expect(isDefinitiveRefusal(reason)).toBe(false)
    }
  })

  it('un motif absent, vide ou inconnu n’est pas définitif', () => {
    // Le défaut penche vers « on peut recontacter » : traiter un motif inconnu
    // comme un opt-out ferait disparaître des comptes en silence.
    expect(isDefinitiveRefusal(null)).toBe(false)
    expect(isDefinitiveRefusal('')).toBe(false)
    expect(isDefinitiveRefusal('une raison inventée')).toBe(false)
  })

  it('les espaces autour du motif ne le font pas échapper à la règle', () => {
    expect(isDefinitiveRefusal('  do_not_contact  ')).toBe(true)
  })
})
