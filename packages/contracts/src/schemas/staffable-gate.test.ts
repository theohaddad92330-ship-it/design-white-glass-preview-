import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNSTAFFABLE_REASONS,
  STAFFABLE_VERDICTS,
  needStaffableNotRefusedSql,
  needStaffableRefusedSql,
  staffableGateEffect,
} from './staffable-gate.js'

/**
 * La porte G3 (PDF 2 §7.6).
 *
 * Ce que ces tests tiennent : un « oui » fait AVANCER le besoin (sans quoi la
 * porte ne sert à rien — elle décorerait une décision sans conséquence), un
 * « non » exige son motif (sans quoi le taux de refus par cause n'existe pas),
 * et « pas encore » laisse tout en place, ce qui est le point : le recruteur
 * doit pouvoir dire « je ne sais pas encore » sans que rien ne bouge.
 */
describe('staffableGateEffect', () => {
  it('« oui » fait passer le besoin en qualifié', () => {
    const effect = staffableGateEffect('to_qualify', 'yes', null)
    expect(effect.staffable).toBe('yes')
    expect(effect.nextStatus).toBe('qualified')
    expect(effect.problem).toBeNull()
  })

  it('n’avance pas un besoin déjà plus loin — un « oui » de confirmation ne le fait pas reculer', () => {
    const effect = staffableGateEffect('shortlist_ready', 'yes', null)
    expect(effect.nextStatus).toBeNull()
  })

  it('« non » exige un motif', () => {
    expect(staffableGateEffect('to_qualify', 'no', '  ').problem).toBeTruthy()
  })

  it('« non » avec motif clôt le besoin et garde la raison', () => {
    const effect = staffableGateEffect('to_qualify', 'no', ' Compétence absente du vivier ')
    expect(effect.nextStatus).toBe('lost')
    expect(effect.reason).toBe('Compétence absente du vivier')
    expect(effect.problem).toBeNull()
  })

  it('« pas encore » ne déplace rien — dire « je ne sais pas » doit être possible', () => {
    const effect = staffableGateEffect('to_qualify', 'unknown', null)
    expect(effect.nextStatus).toBeNull()
    expect(effect.reason).toBeNull()
    expect(effect.problem).toBeNull()
  })

  it('couvre les trois issues et rien d’autre', () => {
    expect(STAFFABLE_VERDICTS).toEqual(['unknown', 'yes', 'no'])
  })
})

describe('les motifs de non-staffabilité par défaut', () => {
  it('propose les six du §7.6, et « autre » en dernier', () => {
    expect(DEFAULT_UNSTAFFABLE_REASONS).toHaveLength(7)
    expect(DEFAULT_UNSTAFFABLE_REASONS.at(-1)?.key).toBe('other')
  })

  it('porte ses libellés en FR et en EN', () => {
    for (const reason of DEFAULT_UNSTAFFABLE_REASONS) {
      expect(reason.fr.length).toBeGreaterThan(0)
      expect(reason.en.length).toBeGreaterThan(0)
    }
  })
})

/**
 * La porte, écrite en SQL.
 *
 * Ce que ces tests tiennent tient en une phrase : `staffable` a TROIS issues, et
 * le prédicat qui en dérive ne doit jamais se comporter comme un booléen. Deux
 * requêtes l'avaient oublié — `COALESCE(n.staffable, true) = true` d'un côté,
 * `staffable = false` de l'autre — sur une colonne `text`. Postgres refusait la
 * requête ENTIÈRE, à chaque exécution, en silence.
 */
describe('les prédicats SQL de la porte G3', () => {
  it('n’écarte que ce qui a reçu sa réponse NÉGATIVE', () => {
    // Le fond de la porte : `unknown` RESTE. Un besoin non jugé n'est pas un
    // besoin refusé, et l'écarter tairait la routine sur l'immense majorité des
    // besoins — `unknown` est la valeur par défaut de chaque ligne créée.
    const sql = needStaffableNotRefusedSql('n.staffable')
    expect(sql).toBe("COALESCE(n.staffable, 'unknown') <> 'no'")
    expect(sql).not.toMatch(/\btrue\b|\bfalse\b/)
  })

  it('compare du TEXTE à du TEXTE, des deux côtés', () => {
    // La faute d'origine se voit à l'œil nu sur cette assertion : aucun littéral
    // booléen ne doit apparaître dans un prédicat sur une colonne `text`.
    for (const sql of [needStaffableNotRefusedSql('staffable'), needStaffableRefusedSql('staffable')]) {
      expect(sql).not.toMatch(/=\s*(true|false)\b/)
      expect(sql).toMatch(/'(unknown|yes|no)'/)
    }
  })

  it('ne nomme que des verdicts qui existent', () => {
    const literals = [...needStaffableNotRefusedSql('s').matchAll(/'([a-z]+)'/g)].map(match => match[1] ?? '')
    expect(literals.length).toBeGreaterThan(0)
    for (const literal of literals) expect(STAFFABLE_VERDICTS).toContain(literal)
  })

  it('le complément compte les besoins TRANCHÉS, pas les autres', () => {
    // `unknown` n'est ni dans l'un ni dans l'autre quand on compte : y verser les
    // « pas encore jugés » ferait dire à l'ESN qu'elle ne sait pas faire ce que
    // personne n'a encore regardé.
    expect(needStaffableRefusedSql('staffable')).toBe("staffable = 'no'")
  })

  it('refuse une expression de colonne qui n’en est pas une', () => {
    // Les VALEURS viennent d'une énumération figée ; la colonne est le seul
    // morceau que l'appelant choisit, donc le seul qui se vérifie.
    expect(() => needStaffableNotRefusedSql("n.staffable = 'x' OR 1=1 --")).toThrow(/colonne invalide/i)
    expect(() => needStaffableRefusedSql('')).toThrow(/colonne invalide/i)
  })
})
