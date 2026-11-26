import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROUTINE_CATALOG } from './routine-catalog'

/**
 * #4717 — le catalogue décrit ce que la routine ÉCRIT, pas l'intention d'avant le code.
 *
 * `contact_job_change` promettait « jamais une fiche modifiée d'office » alors qu'un départ prouvé archive le
 * contact et met ses séquences en pause. Le texte est lu par quelqu'un qui décide d'activer la routine : il doit
 * dire ce qu'elle fait. Cette garde lit les chemins d'écriture dans le code et exige que chacun soit déclaré ICI
 * (avec le mot qui l'annonce dans les deux langues) — ajouter une écriture sans toucher au texte fait échouer la CI.
 */
const WRITES: Record<string, { fr: RegExp; en: RegExp }> = {
  // chemin `applyJobChanges` (routine mensuelle ET relecture à l'ouverture d'une fiche)
  openDoorFromMove: { fr: /porte/i, en: /door/i },
  pauseSequencesForJobChange: { fr: /pause/i, en: /paus/i },
  recordJobChange: { fr: /notification/i, en: /notification/i },
  // chemin `recordEmploymentCheck`
  archiveDepartedContact: { fr: /historique/i, en: /history|archive/i },
}

function bodyOf(file: string, method: string): string {
  const source = readFileSync(join(__dirname, file), 'utf8')
  const start = source.search(new RegExp(`\\n  (?:private |public )?(?:async )?${method}\\(`))
  expect(start).toBeGreaterThan(-1)
  const next = source.slice(start + 1).search(/\n {2}(?:\/\*\*|(?:private |public )?(?:async )?[a-zA-Z]+\()/)
  return source.slice(start, next === -1 ? undefined : start + 1 + next)
}

function callsOf(body: string): string[] {
  const names = [...body.matchAll(/this\.(?:crmRoutines\.)?([a-zA-Z]+)\(/g)].map(match => match[1] ?? '')
  return [...new Set(names)].filter(name => name in WRITES).sort()
}

describe('#4717 — contact_job_change : le catalogue dit les écritures de la routine', () => {
  const routine = ROUTINE_CATALOG.find(entry => entry.key === 'contact_job_change')

  it('la garde lit quelque chose : les deux chemins appellent des écritures déclarées', () => {
    expect(callsOf(bodyOf('routine-executors.ts', 'applyJobChanges'))).toEqual([
      'openDoorFromMove',
      'pauseSequencesForJobChange',
      'recordJobChange',
    ])
    expect(callsOf(bodyOf('crm-routines.service.ts', 'recordEmploymentCheck'))).toEqual(['archiveDepartedContact'])
  })

  it('aucune écriture n’est ajoutée aux deux chemins sans être déclarée ici', () => {
    const unknown = (body: string) =>
      [
        ...body.matchAll(
          /(?:await )?this\.(?:crmRoutines\.)?((?:open|pause|archive|record|insert|update|delete|remove|create|set|mark)[a-zA-Z]*)\(/g,
        ),
      ]
        .map(match => match[1] ?? '')
        .filter(name => !(name in WRITES) && name !== 'recordEmploymentCheck')
    expect(unknown(bodyOf('routine-executors.ts', 'applyJobChanges'))).toEqual([])
    expect(unknown(bodyOf('crm-routines.service.ts', 'recordEmploymentCheck'))).toEqual([])
  })

  it.each(Object.entries(WRITES))('%s est annoncée dans `acceptance`, en français et en anglais', (_name, words) => {
    expect(routine?.acceptance.fr).toMatch(words.fr)
    expect(routine?.acceptance.en).toMatch(words.en)
  })

  it('les bornes qui rassurent sont nommées : ni saisie à la main ni CRM, ni suppression', () => {
    expect(routine?.acceptance.fr).toMatch(/main/)
    expect(routine?.acceptance.fr).toMatch(/CRM/)
    expect(routine?.acceptance.fr).toMatch(/suppression/)
    expect(routine?.acceptance.en).toMatch(/by hand/)
    expect(routine?.acceptance.en).toMatch(/CRM/)
    expect(routine?.acceptance.en).toMatch(/deletion/)
  })

  it('l’ancienne promesse est retirée', () => {
    expect(routine?.acceptance.fr).not.toMatch(/jamais une fiche modifiée/)
    expect(routine?.acceptance.en).not.toMatch(/never a record changed/)
  })
})
