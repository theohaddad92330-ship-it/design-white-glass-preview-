import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * L'INTERFACE TUTOIE PARTOUT, COMME LAURA (décision Louis 24/10/2026, PR 12C).
 *
 * Les maquettes V22 mélangeaient « Tes » et « Vos » : l'interface a tranché,
 * « tu » partout. Cette garde lit les locales FR et refuse tout
 * « vous / vos / votre / vôtre » qui n'est pas dans une exception NOMMÉE.
 *
 * Les seules exceptions sont des textes écrits POUR UN TIERS — le prospect ou
 * l'invité de l'utilisateur — que celui-ci enverra ou dira : ils vouvoient
 * parce que leur lecteur n'est pas l'utilisateur.
 * « rendez-vous » n'est pas un vouvoiement : le mot est neutralisé avant lecture.
 */

const LOCALES_FR = join(__dirname, '..', 'i18n', 'locales', 'fr')

/** Une exception = un fichier, et soit tout le fichier, soit des préfixes de clés. */
const EXCEPTIONS_TIERS: ReadonlyArray<{ file: string; keys: readonly string[]; raison: string }> = [
  {
    file: 'brief.json',
    keys: [''],
    raison: 'questions et réponses aux objections que le commercial pose à son interlocuteur',
  },
  {
    file: 'briefing.json',
    keys: ['conflictDialog.warnDialog.body', 'agenda.brief.pitch.sentence.'],
    raison: 'message aux invités d’un rendez-vous et phrases de pitch dites au client',
  },
  {
    file: 'outreach.json',
    keys: ['libraryView.model.starter.'],
    raison: 'séquences modèles d’e-mails destinées aux prospects',
  },
]

const VOUVOIEMENT = /(^|[^\p{L}\p{N}-])(vous|vos|votre|vôtre)(?![\p{L}\p{N}])|\p{L}+ez-vous(?![\p{L}])/iu

function vouvoiements(
  files: ReadonlyArray<{ file: string; json: unknown }>,
  exceptions: typeof EXCEPTIONS_TIERS,
): string[] {
  const found: string[] = []
  const walk = (value: unknown, path: string, file: string): void => {
    if (typeof value === 'string') {
      const text = value.replace(/rendez-vous/gi, 'RDV')
      if (!VOUVOIEMENT.test(text)) return
      const excused = exceptions.some(
        e => e.file === file && e.keys.some(k => k === '' || path === k || (k.endsWith('.') && path.startsWith(k))),
      )
      if (!excused) found.push(`${file} ${path}`)
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, file)
    }
  }
  for (const { file, json } of files) walk(json, '', file)
  return found
}

const localeFiles = readdirSync(LOCALES_FR)
  .filter(f => f.endsWith('.json'))
  .map(file => ({ file, json: JSON.parse(readFileSync(join(LOCALES_FR, file), 'utf8')) as unknown }))

describe('ui-tutoie — l’interface FR tutoie, seuls les textes écrits pour un tiers vouvoient', () => {
  it('lit bien les locales FR', () => {
    expect(localeFiles.length).toBeGreaterThan(40)
  })

  it('aucun « vous / vos / votre / vôtre » hors exceptions nommées', () => {
    expect(vouvoiements(localeFiles, EXCEPTIONS_TIERS)).toEqual([])
  })

  it('sait dire NON : un « Votre espace » fabriqué est attrapé', () => {
    const fake = [{ file: 'fake.json', json: { a: { titre: 'Votre espace', b: 'Vous pouvez agir' } } }]
    expect(vouvoiements(fake, EXCEPTIONS_TIERS)).toEqual(['fake.json a.titre', 'fake.json a.b'])
  })

  it('sait dire NON : « vôtre » et un impératif « -ez-vous » sont attrapés', () => {
    const fake = [{ file: 'fake.json', json: { x: 'le vôtre', y: 'Connectez-vous' } }]
    expect(vouvoiements(fake, EXCEPTIONS_TIERS)).toEqual(['fake.json x', 'fake.json y'])
  })

  it('ne confond pas « rendez-vous » avec un vouvoiement', () => {
    const fake = [{ file: 'fake.json', json: { r: 'Rendez-vous pris', s: 'Tes rendez-vous' } }]
    expect(vouvoiements(fake, EXCEPTIONS_TIERS)).toEqual([])
  })

  it('une exception ne couvre que sa clé : le même texte ailleurs est attrapé', () => {
    const json = { agenda: { brief: { pitch: { sentence: { ask: 'Je vous propose' } } }, autre: 'Vos outils' } }
    expect(vouvoiements([{ file: 'briefing.json', json }], EXCEPTIONS_TIERS)).toEqual(['briefing.json agenda.autre'])
  })

  it('chaque exception nomme une raison et pointe un fichier qui existe', () => {
    for (const e of EXCEPTIONS_TIERS) {
      expect(e.raison.length).toBeGreaterThan(10)
      expect(localeFiles.some(f => f.file === e.file)).toBe(true)
    }
  })
})
