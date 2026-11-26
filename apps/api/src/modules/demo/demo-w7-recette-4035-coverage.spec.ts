import {
  DEMO_BUSINESS_UNITS,
  DEMO_CV_IMPORT_CONSULTANTS,
  DEMO_DOSSIERS,
  DEMO_MESSAGE_STYLE_TEMPLATES,
} from './demo-dataset'

/**
 * Épopée #4035 (lot W7, 11/10) — points DÉMO dont le semis existait SANS garde dédiée : chacun est lu sur le
 * JEU DE DONNÉES (vrais comptes de la salle), et la garde sait dire NON (retirer la ligne la fait rougir).
 */
const sncf = DEMO_DOSSIERS.find(d => d.account.company_name === 'SNCF')!
const sncfJson = JSON.stringify(sncf.account.raw_analysis)

describe('#4035 — points démo gardés (W7)', () => {
  it('#3921 — SNCF porte « Nouvel établissement — Lyon », daté, d’un registre officiel', () => {
    expect(sncfJson).toContain('Nouvel établissement — Lyon')
    expect(sncfJson).toContain('Registre officiel des entreprises (Sirene)')
  })

  it('#3668 — SNCF porte son contexte « Programme climat »', () => {
    expect(sncfJson).toContain('Programme climat')
  })

  it('#2947 — un style ACTIF « Relance après silence » porte Pitch, Ton et Signature', () => {
    const style = DEMO_MESSAGE_STYLE_TEMPLATES.find(t => t.objective.startsWith('Relance après silence'))
    expect(style?.status).toBe('active')
    for (const field of [style?.pitch, style?.tone, style?.signature])
      expect((field ?? '').trim().length).toBeGreaterThan(0)
  })

  // #2204.65 (17/10) — la portée ÉQUIPE existe en salle. G.10 (recette 18/10) : « Relance après silence » v1 ET v2
  // actifs se lisait comme un doublon de style — UNE seule version active par objectif et canal, l'autre ARCHIVÉE.
  it('G.10 — une seule version ACTIVE par objectif et canal ; la portée ÉQUIPE (Agence Lyon) reste semée, archivée', () => {
    const team = DEMO_MESSAGE_STYLE_TEMPLATES.filter(t => t.scope === 'business_unit')
    expect(team.length).toBeGreaterThan(0)
    for (const style of team) {
      expect(style.status).toBe('archived')
      expect(DEMO_BUSINESS_UNITS.map(unit => unit.name)).toContain(style.businessUnitName)
    }
    const actives = DEMO_MESSAGE_STYLE_TEMPLATES.filter(t => t.status === 'active')
    const keys = actives.map(t => `${t.objective}|${t.channel}`)
    expect(actives.length).toBeGreaterThan(0)
    expect(new Set(keys).size).toBe(keys.length)
    // Sait dire NON : un style d'espace ne porte pas d'équipe.
    const workspaceStyle = DEMO_MESSAGE_STYLE_TEMPLATES.find(t => t.objective.startsWith('Relance après silence'))
    expect(workspaceStyle?.scope ?? 'workspace').toBe('workspace')
    expect(workspaceStyle?.businessUnitName ?? null).toBeNull()
  })

  // c97 (décision Louis 12/10) — un CV lu = fiche qualifiée : la fiche née d'un CV n'est plus « à relire ».
  it('#3935 — la fiche Inès Castel, née d’un CV lu, est qualifiée et porte sa ville et sa formation', () => {
    const ines = DEMO_CV_IMPORT_CONSULTANTS.find(c => c.full_name === 'Inès Castel')
    expect(ines?.review_status).toBe('qualified')
    expect(ines?.location).toBeTruthy()
    expect(ines?.education?.length).toBeGreaterThan(0)
  })

  it('sait dire NON : un nom absent du jeu n’est pas trouvé', () => {
    expect(sncfJson).not.toContain('Nouvel établissement — Atlantide')
    expect(DEMO_CV_IMPORT_CONSULTANTS.find(c => c.full_name === 'Personne Inconnue')).toBeUndefined()
  })
})
