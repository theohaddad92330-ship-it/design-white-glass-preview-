/**
 * GARDE — la cartographie de l'outillage (#2054).
 *
 * Trois choses que ce fichier rend impossibles, chacune payée une fois :
 *
 *  1. **Un nom de fournisseur dans un libellé persisté.** « CARTOGRAPHIER LA
 *     CHAÎNE, PAS COLLECTIONNER LES LOGOS » est le titre même de la demande, et
 *     la doctrine `tool-naming` l'impose : NOS fournisseurs ne se nomment
 *     jamais, un outil du client ne se nomme que s'il est BRANCHÉ et par
 *     injection. Le corpus lu est celui des valeurs réellement persistées.
 *  2. **Un prédicat comparé à une valeur que le produit ne produit pas.**
 *     `worksAlone === '1'` et `hasConnectedTooling` ont coûté deux défauts
 *     invisibles aux tests le 14/09 : ici, `toolingFamilyIsAbsent` est éprouvé
 *     sur LA liste de choix réelle, pas sur une chaîne inventée.
 *  3. **Un préremplissage GLOBAL.** Une connexion parle de SON outil et
 *     d'aucun autre (#2054.19) — le contre-exemple lu au registre est
 *     `!ctx.hasConnectedTooling`, qui masquait les quatorze choix de `tooling`
 *     dès qu'UNE connexion existait.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OUR_SUPPLIERS, supplierNamesIn } from '../tool-naming.js'
import { toolFamilyValues } from '../tool-registry.js'
import {
  OUTILLAGE_ANSWER_FIELDS,
  TOOLING_CONFIDENCE_CHOICES,
  TOOLING_DUPLICATES_CHOICES,
  TOOLING_EXPORT_CHOICES,
  TOOLING_FRESHNESS_CHOICES,
  TOOLING_INTERNAL_NAME_MAX_LENGTH,
  TOOLING_INTERNAL_NAMES_MAX,
  TOOLING_MAP_KEYS,
  TOOLING_PRESENCE_ABSENT,
  TOOLING_PRESENCE_SCALE,
  TOOLING_REFERENCE_CHOICES,
  TOOLING_REFERENCE_DATA_CHOICES,
  toolingFamilyIsAbsent,
  toolingMapKeysForConnectedTools,
} from './answers-outillage.js'

/** Toutes les valeurs PERSISTÉES de la cartographie, catalogues compris. */
const ALL_PERSISTED_VALUES: readonly string[] = [
  ...TOOLING_PRESENCE_SCALE,
  ...TOOLING_REFERENCE_CHOICES,
  ...TOOLING_REFERENCE_DATA_CHOICES,
  ...TOOLING_FRESHNESS_CHOICES,
  ...TOOLING_CONFIDENCE_CHOICES,
  ...TOOLING_EXPORT_CHOICES,
  ...TOOLING_DUPLICATES_CHOICES,
]

describe('outillage — le corpus est lu (une garde qui itère sur du vide est verte et borgne)', () => {
  it('porte les onze entrées de la chaîne, une par outil et jamais un tableau plat', () => {
    // #2054.1 à #2054.11 — onze familles, donc onze CLÉS distinctes : un seul
    // `string[]` ferait de la cartographie une collection de logos.
    expect(TOOLING_MAP_KEYS.length).toBe(11)
    expect(new Set(TOOLING_MAP_KEYS).size).toBe(11)
    for (const key of TOOLING_MAP_KEYS) {
      expect(Object.keys(OUTILLAGE_ANSWER_FIELDS)).toContain(key)
    }
  })

  it('porte les sept attributs de la source de référence', () => {
    // #2054.12 (qui s'en sert — porté par l'échelle des onze) puis #2054.13
    // à #2054.18 : donnée contenue, fraîcheur, confiance, export, doublon,
    // douleur.
    for (const key of [
      'tooling_reference',
      'tooling_reference_data',
      'tooling_reference_freshness',
      'tooling_reference_confidence',
      'tooling_reference_export',
      'tooling_duplicates',
      'tooling_pain',
    ]) {
      expect(Object.keys(OUTILLAGE_ANSWER_FIELDS)).toContain(key)
    }
  })

  it('lit une échelle non vide', () => {
    expect(TOOLING_PRESENCE_SCALE.length).toBeGreaterThan(3)
  })
})

describe('outillage — aucune marque, ni la nôtre ni celle du client (#2054.8)', () => {
  it('ne cite AUCUN de nos fournisseurs dans une valeur persistée', () => {
    expect(ALL_PERSISTED_VALUES.length).toBeGreaterThan(30)
    for (const value of ALL_PERSISTED_VALUES) {
      expect(supplierNamesIn(value), `valeur fautive : ${value}`).toEqual([])
    }
  })

  it('n’affiche AUCUNE probabilité et aucun pourcentage (doctrine c26_probabilite)', () => {
    // #2054.15 — « niveau de confiance » est le point où la pente vers un score
    // chiffré est la plus forte : c'est un jugement déclaré, pas une chance.
    for (const value of ALL_PERSISTED_VALUES) {
      expect(value, `valeur fautive : ${value}`).not.toMatch(/%|probabilit|chance/i)
    }
  })

  it('sait dire NON (témoin : le détecteur voit bien un nom de fournisseur)', () => {
    // Sans ce témoin, la garde ci-dessus serait verte avec un détecteur cassé.
    const supplier = OUR_SUPPLIERS[0]
    expect(supplier).toBeDefined()
    expect(supplierNamesIn(`Un outil comme ${supplier?.name}`)).not.toEqual([])
  })
})

describe('outillage — un prédicat comparé aux valeurs que la question PRODUIT', () => {
  it('reconnaît l’absence sur la valeur réelle de l’échelle, et sur elle seule', () => {
    // #2054.1-.11 — le piège mesuré le 14/09 : un prédicat comparé à `'1'`
    // quand les valeurs réelles sont des libellés est TOUJOURS faux en prod.
    expect(TOOLING_PRESENCE_SCALE).toContain(TOOLING_PRESENCE_ABSENT)
    expect(toolingFamilyIsAbsent(TOOLING_PRESENCE_ABSENT)).toBe(true)
    for (const value of TOOLING_PRESENCE_SCALE.filter(v => v !== TOOLING_PRESENCE_ABSENT)) {
      expect(toolingFamilyIsAbsent(value), `${value} n’est pas une absence`).toBe(false)
    }
  })

  it('ne confond JAMAIS « pas répondu » avec « nous n’en avons pas »', () => {
    // « Non mesuré » n'est pas « 0 » : une question passée reste inconnue.
    expect(toolingFamilyIsAbsent(null)).toBe(false)
    expect(toolingFamilyIsAbsent(undefined)).toBe(false)
    expect(toolingFamilyIsAbsent('')).toBe(false)
  })
})

describe('outillage — une connexion préremplit SON outil, jamais tous (#2054.19)', () => {
  it('ne désigne que la famille branchée', () => {
    expect(toolingMapKeysForConnectedTools([{ family: 'crm' }])).toEqual(['tooling_crm'])
  })

  it('ne parle PAS des dix autres entrées (contre-exemple `hasConnectedTooling`)', () => {
    const touched = toolingMapKeysForConnectedTools([{ family: 'crm' }])
    for (const key of TOOLING_MAP_KEYS.filter(k => k !== 'tooling_crm')) {
      expect(touched).not.toContain(key)
    }
  })

  it('cumule plusieurs connexions sans doublon, dans l’ordre de la chaîne', () => {
    const touched = toolingMapKeysForConnectedTools([{ family: 'email' }, { family: 'crm' }, { family: 'email' }])
    expect(touched).toEqual(['tooling_crm', 'tooling_mailbox'])
  })

  it('se TAIT sur une famille dont une connexion ne prouve rien', () => {
    // `linkedin`, `communication`, `finance`… existent bel et bien dans le
    // registre : une connexion y est vraie, mais elle ne dit RIEN de l'une des
    // onze entrées. Le défaut est de taire, jamais de deviner.
    expect(toolingMapKeysForConnectedTools([{ family: 'linkedin' }])).toEqual([])
    expect(toolingMapKeysForConnectedTools([{ family: 'communication' }])).toEqual([])
  })

  it('ne relie que des familles qui EXISTENT vraiment dans le registre d’outils', () => {
    // La cause racine du 14/09 : comparer à des valeurs que le produit ne
    // produit pas. Chaque famille reliée est une valeur réelle de l'enum.
    const touchedFamilies = toolFamilyValues.filter(family => toolingMapKeysForConnectedTools([{ family }]).length > 0)
    expect(touchedFamilies.length).toBeGreaterThan(0)
    for (const family of touchedFamilies) {
      expect(toolFamilyValues).toContain(family)
    }
  })

  it('ne tombe pas sur une entrée hors registre ni sur une charge utile inattendue', () => {
    expect(toolingMapKeysForConnectedTools([])).toEqual([])
    expect(toolingMapKeysForConnectedTools([{ family: 'famille-inconnue' }])).toEqual([])
    expect(toolingMapKeysForConnectedTools(null)).toEqual([])
  })
})

describe('outillage — #4971 : nommer ses outils MAISON (CRM / ATS / ERP internes)', () => {
  const schema = z.object(OUTILLAGE_ANSWER_FIELDS)

  it('accepte une liste de noms libres, bornée', () => {
    // #4971.1 — un client qui a un CRM maison ne trouvait AUCUN champ pour le
    // nommer : l'échelle de présence ne prend pas de saisie.
    const parsed = schema.safeParse({ tooling_internal_names: ['Outil CRM maison', 'GestMission'] })
    expect(parsed.success).toBe(true)
  })

  it('reste INCONNUE quand la question est passée (jamais « aucun outil »)', () => {
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ tooling_internal_names: null }).success).toBe(true)
  })

  it('refuse un nom vide, un nom trop long, et une liste trop longue', () => {
    expect(schema.safeParse({ tooling_internal_names: ['  '] }).success).toBe(false)
    expect(
      schema.safeParse({ tooling_internal_names: ['x'.repeat(TOOLING_INTERNAL_NAME_MAX_LENGTH + 1)] }).success,
    ).toBe(false)
    const tooMany = Array.from({ length: TOOLING_INTERNAL_NAMES_MAX + 1 }, (_, i) => `Outil ${i}`)
    expect(schema.safeParse({ tooling_internal_names: tooMany }).success).toBe(false)
  })

  it('n’est PAS un maillon qu’une connexion confirme (#4971.2 : un nom saisi ne vaut jamais « branché »)', () => {
    expect(TOOLING_MAP_KEYS as readonly string[]).not.toContain('tooling_internal_names')
  })
})
