import { describe, expect, it } from 'vitest'
import type { DecisionItem, DecisionNature, DecisionQueueReport } from '@/lib/decision-queue'
import {
  anciennete,
  LIBELLES,
  LIGNES_AFFICHEES,
  resumerFile,
  RIEN_A_DECIDER,
  tokenDeGravite,
} from './decision-queue.logic'

const NATURES: DecisionNature[] = [
  'invoice_missing',
  'invoice_unpaid',
  'commitment_ending',
  'trial_ending',
  'churn_risk',
  'credits_exhausted',
  'cost_spike',
  'queue_stuck',
  'analysis_failing',
  'feedback_unanswered',
  'user_suspended_long',
  'plan_mismatch',
]

function ligne(n: number): DecisionItem {
  return {
    nature: 'churn_risk',
    subject: { kind: 'workspace', id: `w${n}`, label: `Espace ${n}` },
    detail: `aucune activité depuis ${30 + n} j`,
    ageDays: 30 + n,
    severity: 'warning',
    action: { label: 'Ouvrir la fiche', href: `/clients?workspace=w${n}` },
  }
}

function rapport(items: DecisionItem[], muettes: DecisionNature[] = []): DecisionQueueReport {
  return {
    items,
    natures: NATURES.map(nature => ({
      nature,
      measured: muettes.includes(nature) ? 0 : 1,
      raised: items.filter(item => item.nature === nature).length,
      unmeasured: muettes.includes(nature) ? 'donnée absente' : null,
    })),
  }
}

describe('#1647 — le bloc « Ce qui demande une décision »', () => {
  it('T2 — file vide : une phrase, et le nombre de natures MESURÉES', () => {
    const resume = resumerFile(rapport([]))
    expect(resume.lignes).toEqual([])
    expect(resume.reste).toBe(0)
    // « Rien » sur douze natures mesurées ne dit pas la même chose que « rien »
    // sur zéro : c'est ce compte qui fait la différence à l'écran.
    expect(resume.mesurees).toBe(12)
    expect(resume.muettes).toEqual([])
    expect(RIEN_A_DECIDER).toContain('Rien ne demande de décision')
  })

  it('une file vide FAUTE DE DONNÉE ne se lit pas comme une file vide', () => {
    const resume = resumerFile(rapport([], NATURES))
    expect(resume.lignes).toEqual([])
    expect(resume.mesurees).toBe(0)
    expect(resume.muettes).toHaveLength(12)
    for (const muette of resume.muettes) {
      expect(muette.unmeasured).toEqual(expect.any(String))
    }
  })

  it(`le bloc montre ${LIGNES_AFFICHEES} lignes au plus, et compte le reste`, () => {
    const resume = resumerFile(rapport(Array.from({ length: 9 }, (_, i) => ligne(i))))
    expect(resume.lignes).toHaveLength(LIGNES_AFFICHEES)
    expect(resume.reste).toBe(4)
  })

  it('sous le plafond, il n’y a pas de reste', () => {
    expect(resumerFile(rapport([ligne(1), ligne(2)])).reste).toBe(0)
  })

  it('les douze natures RENDUES PAR L’API ont un libellé — une nature sans nom ne s’explique pas', () => {
    for (const nature of NATURES) {
      expect(LIBELLES[nature].length).toBeGreaterThan(0)
    }
  })

  it('`flag_matured` (#1667.1) a aussi un libellé — le type est exhaustif même avant que l’API ne l’émette', () => {
    // `NATURES` ci-dessus reste les DOUZE que l'API rend AUJOURD'HUI
    // (`rapport.natures`) — `flag_matured` n'y figure pas tant que
    // `apps/api/.../decision-queue.ts` (hors périmètre) ne l'émet pas, mais
    // `LIBELLES` doit déjà savoir la nommer : `Record<DecisionNature, string>`
    // est exhaustif par construction TypeScript.
    expect(LIBELLES.flag_matured.length).toBeGreaterThan(0)
    expect(Object.keys(LIBELLES).sort()).toEqual([...NATURES, 'flag_matured'].sort())
  })

  it('une ancienneté inconnue n’est JAMAIS rendue « 0 j »', () => {
    expect(anciennete(null)).toBe('bascule non datée')
    expect(anciennete(0)).toBe('aujourd’hui')
    expect(anciennete(37)).toBe('depuis 37 j')
  })

  it('les couleurs passent par un token, jamais par une valeur hexadécimale', () => {
    for (const severity of ['danger', 'warning', 'info'] as const) {
      expect(tokenDeGravite(severity)).toMatch(/^var\(--[a-z-]+\)$/)
    }
  })
})
