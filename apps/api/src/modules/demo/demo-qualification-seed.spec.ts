/**
 * #3755.9 — la parité démo de la grille de qualification, PROUVÉE sur les données :
 * une grille valide (total 100), un compte de la salle qualifié axe par axe, une
 * saisie du commercial qui prime, et l'instantané du dossier calculé — jamais écrit
 * à la main.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { qualificationGridInputSchema, readQualificationSnapshot } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'
import {
  DEMO_QUALIFICATION_ACCOUNT,
  DEMO_QUALIFICATION_ANALYSIS,
  DEMO_QUALIFICATION_GRID,
  DEMO_QUALIFICATION_MANUAL,
} from './demo-qualification-seed'

describe('#3755.9 — grille de qualification semée en démo', () => {
  it('la grille passe le contrat : 5 filtres, des pondérés, total 100', () => {
    expect(qualificationGridInputSchema.safeParse({ criteria: DEMO_QUALIFICATION_GRID }).success).toBe(true)
    expect(DEMO_QUALIFICATION_GRID.filter(c => c.kind === 'eliminatory')).toHaveLength(5)
  })

  it('chaque critère de la grille a une évaluation, et chaque preuve est non vide', () => {
    expect(DEMO_QUALIFICATION_ANALYSIS.map(e => e.code)).toEqual(DEMO_QUALIFICATION_GRID.map(c => c.code))
    for (const e of [...DEMO_QUALIFICATION_ANALYSIS, ...DEMO_QUALIFICATION_MANUAL]) {
      if (e.status !== 'not_evaluable') expect(e.evidence?.trim()).toBeTruthy()
    }
  })

  it('le compte qualifié porte l’instantané, avec ses non évaluables NOMMÉS et la saisie qui prime', () => {
    const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === DEMO_QUALIFICATION_ACCOUNT)
    const snapshot = readQualificationSnapshot(dossier?.account.raw_analysis)
    expect(snapshot?.verdict).toBe('GO')
    expect(snapshot?.eliminated_by).toEqual([])
    // 8 (S3, saisie du commercial) + 10 + 5 + 12 sur 10 + 15 + 10 + 15 évaluables.
    expect([snapshot?.points, snapshot?.max]).toEqual([35, 50])
    expect(snapshot?.not_evaluable.map(c => c.code)).toEqual(['F3', 'F4', 'S1', 'S2', 'S5', 'S8', 'S9'])
  })

  it('le semis est ATTEINT depuis seedWorkspace et écrit les trois tables', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('await this.seedQualificationGrid(workspaceId, ownerUserId)')
    for (const table of ['qualification_grids', 'qualification_criteria', 'account_qualifications']) {
      expect(source).toContain(`INSERT INTO ${table}`)
    }
  })
})
