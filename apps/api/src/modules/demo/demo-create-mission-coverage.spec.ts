import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_CREATE_MISSION_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * LA PARITÉ DÉMO DE « CRÉER UNE MISSION » (31/08/2026, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE RECOMPTE, ET POURQUOI ELLE NE CROIT PAS LA PROSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` garde les TABLES. `/missions/nouvelle` n'en ajoute
 * aucune : elle ne lui pose donc aucune question, et un écran qui s'ouvrirait
 * vide en réunion passerait la CI sans un mot.
 *
 * La seule donnée dont l'écran dépend est la liste des projets de rattachement
 * (étape 1). ⚠️ Elle ne vient PAS d'une table `projects` — il n'en existe
 * aucune dans ce dépôt : `GET /projects` lit `opportunities`
 * (`ProjectsService.listForWorkspace`). Confondre les deux ferait chercher un
 * `INSERT INTO projects` qui n'arrivera jamais, et conclure à tort que la
 * capacité est vide.
 *
 * Cette garde recompte donc sur le JEU : la salle porte-t-elle assez d'affaires
 * pour que l'étape 1 s'ouvre remplie, et l'étape 4 puisse aboutir ? Et elle
 * vérifie que la table qui les porte est bien classée seedée. Elle sait dire
 * non : retirer `pipelineProjects`, `openProject` et `project` du jeu, ou
 * déclasser `opportunities`, la fait rougir.
 */
describe('parité démo — « Créer une mission » (/missions/nouvelle)', () => {
  it('LIT un jeu réel — sinon tout ce qui suit serait vrai par vacuité', () => {
    expect(Array.isArray(DEMO_DELIVERY_CLIENT.pipelineProjects)).toBe(true)
    expect(DEMO_SEEDED_TABLES.length).toBeGreaterThan(20)
  })

  it('sert la liste des projets depuis `opportunities`, table classée SEEDÉE', () => {
    // ⚠️ Et PAS `projects` : la nommer ici serait déjà l'erreur que le
    // docblock décrit.
    expect(DEMO_SEEDED_TABLES).toContain('opportunities')
    expect(DEMO_SEEDED_TABLES).not.toContain('projects')
  })

  it('porte assez d’affaires pour que l’étape 1 s’ouvre remplie', () => {
    // Le projet signé + l'affaire ouverte + le reste du pipe : ce sont les
    // lignes que `listForWorkspace` rendra, et donc les choix de l'étape 1.
    const labels = [
      DEMO_DELIVERY_CLIENT.project.label,
      DEMO_DELIVERY_CLIENT.openProject.label,
      ...DEMO_DELIVERY_CLIENT.pipelineProjects.map(entry => entry.label),
    ].filter(label => label.trim().length > 0)

    expect(labels.length).toBeGreaterThanOrEqual(3)
    // Des libellés DISTINCTS : trois lignes portant le même nom ne se
    // choisissent pas — la liste serait remplie et inutilisable.
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_CREATE_MISSION_COVERAGE.state).toBe('seede')
    expect(DEMO_CREATE_MISSION_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
