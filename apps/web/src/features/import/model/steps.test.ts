import { describe, expect, it } from 'vitest'
import { IMPORT_STEPS } from '@bellum/contracts'
import { importStepStatuses } from './steps'

/**
 * #1451.3 — `IMPORT_STEPS` était déclaré au contrat et n'avait AUCUN
 * consommateur dans `apps/web/src`.
 *
 * Les sept étapes existaient donc comme documentation d'un écran qui ne les
 * montrait pas : l'assistant enchaînait « déposer », « simuler », « importer »
 * sans jamais dire où on en était ni ce qui restait. C'est le défaut n°1 du
 * dépôt — du code juste que personne n'appelle — appliqué à la colonne
 * vertébrale d'un écran.
 */

const rien = {
  sourceChosen: false,
  fileLoaded: false,
  columnsRecognised: false,
  simulated: false,
  written: false,
}

const statusOf = (progress: Parameters<typeof importStepStatuses>[0]) =>
  Object.fromEntries(importStepStatuses(progress).map(row => [row.step, row.status]))

describe('importStepStatuses — les sept étapes du contrat, dans leur ordre', () => {
  it('rend les sept étapes du contrat, sans en inventer ni en perdre', () => {
    expect(importStepStatuses(rien).map(row => row.step)).toEqual([...IMPORT_STEPS])
  })

  it('rien de commencé : la première étape est celle en cours', () => {
    expect(statusOf(rien)).toMatchObject({ choose_source: 'current', upload: 'todo', apply: 'todo' })
  })

  it('la source choisie : on attend le fichier', () => {
    expect(statusOf({ ...rien, sourceChosen: true })).toMatchObject({
      choose_source: 'done',
      upload: 'current',
    })
  })

  it('le fichier déposé : c’est la reconnaissance des colonnes qui reste', () => {
    expect(statusOf({ ...rien, sourceChosen: true, fileLoaded: true })).toMatchObject({
      upload: 'done',
      map: 'current',
    })
  })

  /**
   * Normaliser et dédupliquer n'ont pas de geste à eux : c'est la SIMULATION
   * qui les fait, côté serveur, et son rapport en porte la preuve (les lignes
   * écartées pour date ou adresse invalide, et les doublons repérés). Les
   * marquer faites avec elle est donc un fait, pas un raccourci d'affichage.
   */
  it('la simulation faite : normaliser, dédupliquer et simuler sont faits ensemble', () => {
    expect(
      statusOf({ sourceChosen: true, fileLoaded: true, columnsRecognised: true, simulated: true, written: false }),
    ).toMatchObject({
      map: 'done',
      normalise: 'done',
      deduplicate: 'done',
      simulate: 'done',
      apply: 'current',
    })
  })

  it('l’écriture faite : plus aucune étape en cours', () => {
    const statuses = importStepStatuses({
      sourceChosen: true,
      fileLoaded: true,
      columnsRecognised: true,
      simulated: true,
      written: true,
    })
    expect(statuses.every(row => row.status === 'done')).toBe(true)
  })

  /**
   * Une correction de correspondance INVALIDE le rapport — le serveur écrit
   * avec le mapping SIMULÉ. Les trois étapes que la simulation portait
   * redeviennent donc à faire, et « Reconnaître » reste faite : c'est la
   * situation exacte que l'écran doit rendre lisible.
   */
  it('une colonne re-rattachée : ce que la simulation portait redevient à faire', () => {
    expect(
      statusOf({ sourceChosen: true, fileLoaded: true, columnsRecognised: true, simulated: false, written: false }),
    ).toMatchObject({
      map: 'done',
      normalise: 'current',
      deduplicate: 'todo',
      simulate: 'todo',
      apply: 'todo',
    })
  })

  it('une seule étape est « en cours » à la fois', () => {
    const statuses = importStepStatuses({ ...rien, sourceChosen: true, fileLoaded: true })
    expect(statuses.filter(row => row.status === 'current')).toHaveLength(1)
  })
})
