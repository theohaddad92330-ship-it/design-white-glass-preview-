import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { routineDefinitionSchema } from '@bellum/contracts'
import { ROUTINE_CATALOG } from './routine-catalog'

/**
 * Le nombre annoncé dans le docblock est le nombre RÉEL.
 *
 * Le commentaire d'en-tête disait « vingt-trois » alors que le tableau en
 * contenait vingt-six : les trois dernières avaient été ajoutées par le
 * chantier précédent sans que personne ne relise la phrase juste au-dessus.
 * C'est exactement l'écart que ce dépôt traque partout ailleurs, laissé dans le
 * seul endroit qu'aucun test ne lisait — le texte.
 */
describe('le catalogue annonce le bon nombre d’entrées', () => {
  const WORDS: Record<number, string> = {
    23: 'vingt-trois',
    24: 'vingt-quatre',
    25: 'vingt-cinq',
    26: 'vingt-six',
    27: 'vingt-sept',
    28: 'vingt-huit',
    29: 'vingt-neuf',
    30: 'trente',
    31: 'trente et une',
    32: 'trente-deux',
    33: 'trente-trois',
    34: 'trente-quatre',
    35: 'trente-cinq',
    36: 'trente-six',
    37: 'trente-sept',
    38: 'trente-huit',
    39: 'trente-neuf',
    40: 'quarante',
    41: 'quarante et une',
    42: 'quarante-deux',
    43: 'quarante-trois',
    44: 'quarante-quatre',
    45: 'quarante-cinq',
    46: 'quarante-six',
    47: 'quarante-sept',
    48: 'quarante-huit',
    49: 'quarante-neuf',
    50: 'cinquante',
    51: 'cinquante et une',
    52: 'cinquante-deux',
    53: 'cinquante-trois',
    54: 'cinquante-quatre',
    55: 'cinquante-cinq',
    56: 'cinquante-six',
    57: 'cinquante-sept',
    58: 'cinquante-huit',
    59: 'cinquante-neuf',
    60: 'soixante',
  }

  it('le docblock dit le nombre réel', () => {
    const source = readFileSync(join(__dirname, 'routine-catalog.ts'), 'utf8')
    const header = source.slice(0, source.indexOf('export const ROUTINE_CATALOG'))
    const expected = WORDS[ROUTINE_CATALOG.length]
    expect(expected).toBeDefined()
    expect(header).toContain(expected)
  })
})

/**
 * Les douze attributs sont RENSEIGNÉS, pas seulement déclarés.
 *
 * Le PDF 6 §2 pose la règle : « une automatisation qui ne renseigne pas ses
 * douze attributs n'est pas spécifiée ». Le type les rend obligatoires ; ce
 * test vérifie qu'ils ne sont pas remplis de vide, ce qu'un type ne peut pas
 * voir — une chaîne d'un caractère satisfait `min(1)` et ne dit rien.
 */
describe('les douze attributs d’une routine sont renseignés', () => {
  it.each(ROUTINE_CATALOG.map(routine => [routine.key, routine] as const))('%s', (_key, routine) => {
    for (const field of ['condition', 'reads', 'fallback', 'acceptance'] as const) {
      for (const locale of ['fr', 'en'] as const) {
        const text = routine[field][locale]
        // Une phrase, pas un mot : ces champs sont lus par quelqu'un qui décide
        // d'activer la routine, et « oui » ne l'aide pas à décider.
        // Une phrase, pas un mot. Le nom du champ est dans le titre du cas de
        // test, donc l'échec est déjà localisable sans message supplémentaire.
        expect(text.length).toBeGreaterThan(20)
      }
    }
  })

  // ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026, épopée #4016, lot L6) : « aucune
  // routine ne se déclare au-delà de N4 » tombe — le niveau N5 (autonomie
  // étendue, sans plafond) entre au catalogue. Ce qui NE tombe PAS, et que ces
  // tests tiennent désormais : une routine N5 n'atteint personne dehors. Elle
  // notifie DANS l'application ; un envoi reste derrière un humain (GA-375,
  // `aucun-envoi-sans-clic.spec.ts`) et une écriture CRM derrière un go.
  it('une routine se déclare N1, N4 ou N5 — jamais un niveau d’approbation (N2/N3) ni de conseil (N0)', () => {
    for (const routine of ROUTINE_CATALOG) {
      expect(['n1_prepare', 'n4_bounded_auto', 'n5_extended_auto']).toContain(routine.automationLevel)
    }
  })

  it('#4016 L6 — le niveau N5 est VIVANT : au moins une routine le porte', () => {
    expect(ROUTINE_CATALOG.some(routine => routine.automationLevel === 'n5_extended_auto')).toBe(true)
  })

  it('#4016 L6 — une routine N5 ne sort jamais du produit : canal in-app par défaut', () => {
    const n5 = ROUTINE_CATALOG.filter(routine => routine.automationLevel === 'n5_extended_auto')
    for (const routine of n5) expect(routine.defaultChannel).toBe('in_app')
  })
})

/**
 * #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT, quand elle est
 * renseignée, est une PHRASE, jamais un mot — même garde que les quatre
 * attributs ci-dessus. `null` reste accepté (doctrine `example` : une routine
 * dont l'arrêt n'a pas été vérifié dans le code n'en affiche aucun plutôt
 * qu'un comportement deviné) — ce test ne l'exige donc PAS pour les 43.
 */
describe('routine-catalog — stopCondition, quand renseignée, est une phrase (#2398.6/#2398.14)', () => {
  const withStopCondition = ROUTINE_CATALOG.filter(routine => routine.stopCondition !== null)

  it('au moins une routine en porte une — sinon la liaison est morte', () => {
    expect(withStopCondition.length).toBeGreaterThan(0)
  })

  it.each(withStopCondition.map(routine => [routine.key, routine] as const))('%s', (_key, routine) => {
    for (const locale of ['fr', 'en'] as const) {
      expect(routine.stopCondition?.[locale].length).toBeGreaterThan(20)
    }
  })
})

/**
 * #2843 (recette prod 01/10, carte « Vivier dormant ») — CHAQUE routine nomme
 * sa condition d'arrêt : 6 cartes sur 44 en portaient une, les 38 autres ne
 * disaient pas quand elles s'arrêtent de lister.
 */
describe('routine-catalog — chaque routine nomme sa condition d’arrêt (#2843)', () => {
  it.each(ROUTINE_CATALOG.map(routine => [routine.key, routine] as const))('%s', (_key, routine) => {
    expect(routine.stopCondition).not.toBeNull()
    for (const locale of ['fr', 'en'] as const) {
      expect(routine.stopCondition?.[locale].length).toBeGreaterThan(20)
    }
  })
})

/**
 * #2843.7 (#2398.6) — LES CHAMPS QUI MANQUAIENT sont RENSEIGNÉS pour chaque
 * entrée, et COHÉRENTS entre eux : un brouillon de message attend toujours que
 * l'utilisateur l'envoie (Laura n'envoie jamais), une mise à jour CRM proposée
 * attend toujours sa porte d'écriture, une étape d'attente n'existe que s'il y a
 * quelque chose à valider. Le test dit NON à une entrée qui oublie un champ ou
 * qui le remplit à contresens.
 */
describe('#2843.7 — rôles, étapes, actions préparées, validations, budget, portée, profils', () => {
  it.each(ROUTINE_CATALOG.map(routine => [routine.key, routine] as const))('%s', (_key, routine) => {
    const parsed = routineDefinitionSchema.safeParse(routine)
    expect(parsed.success).toBe(true)
    for (const field of ['roles', 'workspaceProfiles', 'steps', 'preparedActions', 'validations'] as const) {
      expect(routine[field].length).toBeGreaterThan(0)
      expect(new Set(routine[field]).size).toBe(routine[field].length)
    }
    expect(routine.steps[0]).toBe('read')
    if (routine.preparedActions.includes('message_draft')) expect(routine.validations).toContain('user_sends')
    if (routine.preparedActions.includes('crm_update_proposal')) {
      expect(routine.validations).toContain('user_approves_write')
    }
    const waits = routine.validations.some(v => v === 'user_sends' || v === 'user_approves_write')
    expect(routine.steps.includes('await_validation')).toBe(waits)
  })

  it('le budget « appel facturé » n’est porté que par les routines qui appellent réellement un fournisseur payant', () => {
    const metered = ROUTINE_CATALOG.filter(routine => routine.budget === 'model_call').map(routine => routine.key)
    expect(metered.sort()).toEqual(['contact_job_change', 'no_reply_follow_up'])
  })
})
