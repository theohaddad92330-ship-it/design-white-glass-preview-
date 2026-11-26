import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3677.7 — PARITÉ DÉMO : un programme nommé porte son objectif, son périmètre
 * ou son horizon (lus dans « Signaux et besoins »), et un programme n'en porte
 * pas forcément — l'écran ne fait alors aucune ligne « non renseigné ».
 */
describe('parité démo — programmes avec horizon', () => {
  const rawPrograms = DEMO_DOSSIERS.map(dossier => (dossier.account as { raw_analysis?: unknown }).raw_analysis)
  it('porte au moins un programme avec objectif et horizon dans le jeu', () => {
    const text = JSON.stringify(rawPrograms)
    expect(text).toMatch(/"horizon":"2029"/)
    expect(text).toMatch(/"objective":"[^"]+"/)
  })
})
