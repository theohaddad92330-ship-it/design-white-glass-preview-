import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createOutreachSequenceRequestSchema, createOutreachStepInputSchema } from '@bellum/contracts'

/**
 * Les quatre conditions d'arrêt sont IMPOSÉES et NON DÉSACTIVABLES (PDF 2 §10.4).
 *
 * Réponse reçue · opt-out · rebond · rendez-vous pris. Le document exige
 * littéralement « un test de garde qui vérifie qu'aucune API ne permet de les
 * retirer », et il a raison de l'exiger plutôt que de faire confiance : ce
 * genre de drapeau n'apparaît jamais dans une revue comme « désactiver une
 * protection ». Il apparaît comme `continueAfterReply`, ajouté un vendredi
 * pour débloquer une démonstration.
 *
 * La garde porte sur la SURFACE : ce que les schémas d'entrée acceptent, et ce
 * que le contrôleur expose. Un champ qu'aucun schéma n'accepte ne peut pas
 * arriver du réseau.
 */
const FORBIDDEN = [
  'ignoreoptout',
  'skipoptout',
  'ignorebounce',
  'skipbounce',
  'continueafterreply',
  'ignorereply',
  'skipreply',
  'ignoremeeting',
  'disablestop',
  'stopconditions',
  'forcesend',
]

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

describe('§10.4 — aucune API ne permet de retirer une condition d’arrêt', () => {
  it('les schémas d’entrée n’acceptent aucun drapeau qui désarme une condition', () => {
    // Les deux schémas portent un `refine`, donc un `ZodEffects` : leurs clés se
    // lisent sur le schéma SOUS-JACENT, pas sur l'enveloppe.
    const shapeOf = (schema: unknown): string[] => {
      const inner = schema as {
        _def?: { schema?: { shape?: Record<string, unknown> } }
        shape?: Record<string, unknown>
      }
      const shape = inner.shape ?? inner._def?.schema?.shape ?? {}
      return Object.keys(shape)
    }
    const keys = [...shapeOf(createOutreachStepInputSchema), ...shapeOf(createOutreachSequenceRequestSchema)].map(
      normalise,
    )
    // Une garde qui ne lit RIEN passerait toujours : on vérifie d'abord qu'elle
    // a bien vu la surface qu'elle prétend surveiller.
    expect(keys).toContain('contactid')

    const offenders = keys.filter(key => FORBIDDEN.some(forbidden => key.includes(forbidden)))
    expect(offenders).toEqual([])
  })

  it('le contrôleur n’expose aucune route qui les désarme', () => {
    const source = readFileSync(join(__dirname, 'outreach.controller.ts'), 'utf8')
    const offenders = FORBIDDEN.filter(forbidden => normalise(source).includes(forbidden))
    expect(offenders).toEqual([])
  })

  it('aucun module n’expose de route « stop-conditions » à éditer', () => {
    // Balayage large : la protection ne doit pas non plus réapparaître ailleurs,
    // sous un autre contrôleur, pour le même besoin de démonstration.
    const modules = join(__dirname, '..')
    const controllers: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (entry.endsWith('.controller.ts')) controllers.push(full)
      }
    }
    walk(modules)

    const offenders = controllers.filter(file => {
      const source = normalise(readFileSync(file, 'utf8'))
      return FORBIDDEN.some(forbidden => source.includes(forbidden))
    })
    expect(offenders).toEqual([])
  })
})
