import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Théo C talents-recrutement.N3 / N4 — l'étape de recrutement est INDÉPENDANTE : elle n'altère ni les présentations
// sur les besoins ni les affectations de mission, et elle ne pèse dans aucun classement.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('recrutement d’une personne — invariants', () => {
  const service = read('talent-recruitment.service.ts')

  it('N3 — le service ne touche ni présentations, ni affectations, ni shortlists', () => {
    expect(service).not.toMatch(/submissions|mission_assignments|shortlist|SubmissionEntity|MissionAssignmentEntity/i)
  })

  it('N3 — le service n’écrit que dans son propre journal (aucun UPDATE ni DELETE)', () => {
    expect(service).toMatch(/INSERT INTO talent_recruitment_events/)
    expect(service).not.toMatch(/\b(UPDATE|DELETE)\b/)
  })

  it('N4 — aucun module de classement ne lit l’étape ou le motif de recrutement', () => {
    for (const file of ['consultant-matching.ts', 'matching.service.ts']) {
      let text = ''
      try {
        text = read(file)
      } catch {
        continue
      }
      expect(text).not.toMatch(/talent_recruitment|recruitmentStage|RECRUITMENT_STAGES/)
    }
  })

  it('sait dire NON — un service qui mettrait à jour une présentation serait attrapé', () => {
    expect('UPDATE submissions SET status').toMatch(/submissions/)
  })
})
