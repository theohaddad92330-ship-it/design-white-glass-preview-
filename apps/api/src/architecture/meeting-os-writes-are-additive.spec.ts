import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-400 — #2319.119 (épopée #2985) : **un compte rendu de rendez-vous
 * n'écrase JAMAIS un champ déjà connu du compte ou d'un contact.**
 *
 * ## Ce que la garde empêche de revenir
 *
 * Meeting OS extrait des faits d'un compte rendu et les écrit à trois
 * endroits : la mémoire du compte (`AccountMemoryService.record`), les
 * contacts mentionnés (`MeetingNotesService.createMentionedContacts`) et un
 * besoin détecté (`MeetingNotesService.createAccountNeed` →
 * `ProjectPipelineService.addNeedForAccount`). Un seul rendez-vous ambigu
 * (« il a dit qu'il partait peut-être ») ne doit jamais pouvoir réécrire un
 * champ de profil déjà établi par ailleurs — l'invariant que #2319.119
 * réclame. Vérifié le 28/09 (git grep, lecture des trois méthodes) : les
 * trois sont bien ADDITIVES par construction (`.save(.create(...))`, jamais
 * un `.update(...)` vers `AccountEntity`/`ContactEntity`). Cette garde tient
 * ce fait structurel plutôt que de le laisser dériver en silence.
 *
 * ## Ce qu'elle ne prétend pas faire
 *
 * Elle ne rejoue pas un scénario de bout en bout (c'est le rôle des specs de
 * service) : elle vérifie que la STRUCTURE des trois écrivains reste
 * additive. Un futur `.update(` sur ces entités depuis ces méthodes précises
 * fait échouer cette garde avant la revue de code, pas après.
 */

const MODULES = join(__dirname, '..', 'modules')
const ACCOUNT_MEMORY = join(MODULES, 'crm-core', 'account-memory.service.ts')
const MEETING_NOTES = join(MODULES, 'meeting-notes', 'meeting-notes.service.ts')
const PROJECT_PIPELINE = join(MODULES, 'projects', 'project-pipeline.service.ts')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Le corps d'une méthode, de sa signature à la fermeture de même indentation. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) return ''
  const end = source.indexOf('\n  }', start)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

describe('GA-400 — Meeting OS n’écrase jamais un champ existant du profil', () => {
  const accountMemorySource = read(ACCOUNT_MEMORY)
  const meetingNotesSource = read(MEETING_NOTES)
  const projectPipelineSource = read(PROJECT_PIPELINE)

  it('lit un corpus non vide — les trois fichiers existent et sont substantiels', () => {
    expect(accountMemorySource.length).toBeGreaterThan(1_000)
    expect(meetingNotesSource.length).toBeGreaterThan(10_000)
    expect(projectPipelineSource.length).toBeGreaterThan(10_000)
  })

  it('`AccountMemoryService.record` ne fait que CRÉER une ligne de mémoire, jamais mettre à jour le compte', () => {
    const body = methodBody(accountMemorySource, 'async record(')
    expect(body.length).toBeGreaterThan(100)

    expect(body).toContain('this.memory.save(')
    expect(body).toContain('this.memory.create(')
    // Aucune écriture vers le compte lui-même : seule une LECTURE (`findOne`)
    // pour vérifier l'appartenance à l'espace.
    expect(body).not.toMatch(/this\.accounts\.(update|save)\(/)
  })

  it('`MeetingNotesService.createMentionedContacts` ne CRÉE un contact que s’il n’existe pas — un doublon n’est jamais réécrit', () => {
    const body = methodBody(meetingNotesSource, 'async createMentionedContacts(')
    expect(body.length).toBeGreaterThan(200)

    expect(body).toContain('contacts.save(')
    expect(body).toContain('contacts.create(')
    // Un nom déjà présent incrémente `duplicates` et passe au suivant — il ne
    // déclenche aucune écriture sur la fiche trouvée.
    expect(body).toContain('duplicates += 1')
    expect(body).not.toMatch(/contacts\.update\(/)
  })

  it('`MeetingNotesService.createAccountNeed` délègue à une porte qui CRÉE le besoin, sans toucher le compte ou le contact', () => {
    const body = methodBody(meetingNotesSource, 'private async createAccountNeed(')
    expect(body.length).toBeGreaterThan(50)
    expect(body).toContain('addNeedForAccount')
  })

  it('`ProjectPipelineService.saveNeed` (appelée par `addNeedForAccount`) écrit une INSERTION, jamais une mise à jour du compte/contact d’origine', () => {
    const body = methodBody(projectPipelineSource, 'private async saveNeed(')
    expect(body.length).toBeGreaterThan(200)

    expect(body).toContain('this.needs.save(')
    expect(body).toContain('this.needs.create(')
    // Les seules lectures d'appartenance (`assertContactBelongsToAccount`,
    // `assertProject`) ne sont pas des écritures.
    expect(body).not.toMatch(/this\.(accounts|contacts)\.(update|save)\(/)
  })
})
