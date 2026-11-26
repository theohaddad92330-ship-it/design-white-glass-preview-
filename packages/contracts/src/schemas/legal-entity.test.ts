import { describe, expect, it } from 'vitest'
import {
  billingEntityOf,
  createLegalEntitySchema,
  FINANCE_ENTITY_BLIND_READS,
  legalEntityClause,
  selectableEntities,
  updateLegalEntitySchema,
  type LegalEntity,
} from './legal-entity.js'

const entity = (over: Partial<LegalEntity> = {}): LegalEntity => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  name: 'ACME Conseil',
  registration_number: '812345678',
  country: 'FR',
  archived: false,
  created_at: '2026-08-19T10:00:00.000Z',
  ...over,
})

/**
 * Les entités juridiques d'un espace (décision D9).
 *
 * Trois règles portent l'objet, et chacune évite un dégât qu'on ne verrait
 * qu'après coup — c'est-à-dire sur une facture.
 */
describe('entités juridiques', () => {
  it('accepte une société sans numéro d’immatriculation ni pays', () => {
    // Exiger un SIREN refuserait la création à une ESN belge, suisse ou
    // canadienne. Ce serait une erreur de conception déguisée en validation.
    expect(createLegalEntitySchema.safeParse({ name: 'ACME Belgium' }).success).toBe(true)
  })

  it('refuse une raison sociale vide', () => {
    expect(createLegalEntitySchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('refuse un pays qui n’est pas un code à deux lettres', () => {
    expect(createLegalEntitySchema.safeParse({ name: 'ACME', country: 'France' }).success).toBe(false)
    expect(createLegalEntitySchema.safeParse({ name: 'ACME', country: 'BE' }).success).toBe(true)
  })

  it('refuse une modification vide', () => {
    expect(updateLegalEntitySchema.safeParse({}).success).toBe(false)
  })
})

describe('quelle société facture cette mission', () => {
  it('rend l’entité rattachée', () => {
    const acme = entity()
    expect(billingEntityOf({ legal_entity_id: acme.id }, [acme])?.name).toBe('ACME Conseil')
  })

  it('rend `null` quand la mission n’en porte aucune — le cas ORDINAIRE d’un espace mono-société', () => {
    // Inventer une entité « par défaut » ferait apparaître une raison sociale
    // sur des documents où personne ne l'a mise.
    expect(billingEntityOf({ legal_entity_id: null }, [entity()])).toBeNull()
    expect(billingEntityOf({}, [entity()])).toBeNull()
  })

  it('rend `null` plutôt qu’une autre société quand le rattachement pointe dans le vide', () => {
    expect(billingEntityOf({ legal_entity_id: 'disparue' }, [entity()])).toBeNull()
  })
})

describe('ce qu’un sélecteur propose', () => {
  it('écarte les sociétés archivées', () => {
    const vivante = entity({ id: 'a1' })
    const dissoute = entity({ id: 'a2', name: 'ACME Régie', archived: true })

    expect(selectableEntities([vivante, dissoute], null).map(e => e.id)).toEqual(['a1'])
  })

  it('garde l’archivée qui est DÉJÀ rattachée à la mission ouverte', () => {
    // Sans cette exception, la fiche d'une mission portée par une société
    // dissoute afficherait un sélecteur vide — et le premier enregistrement
    // effacerait silencieusement le rattachement historique.
    const dissoute = entity({ id: 'a2', archived: true })

    expect(selectableEntities([entity({ id: 'a1' }), dissoute], 'a2').map(e => e.id)).toEqual(['a1', 'a2'])
  })

  it('rend une liste vide quand l’espace n’a déclaré aucune société', () => {
    expect(selectableEntities([], null)).toEqual([])
  })
})

/**
 * LA CLAUSE DE PORTÉE PAR SOCIÉTÉ — le filtre qui filtre vraiment.
 *
 * Livré désactivé le 31/08 « parce qu'aucune des six lectures financières ne
 * prend de société en paramètre ». Elles la prennent désormais, et la condition
 * SQL vit ICI, à un seul endroit : recopiée dans neuf requêtes, une seule
 * l'aurait oubliée — et un filtre trop LARGE rend un chiffre plus gros, qui a
 * l'air juste.
 */
describe('la clause SQL de portée par société', () => {
  it('ne restreint RIEN sans société choisie — « toutes les sociétés » est le défaut', () => {
    expect(legalEntityClause(null, 'm', 3)).toEqual({ sql: '', params: [] })
    expect(legalEntityClause(undefined, 'm', 3)).toEqual({ sql: '', params: [] })
  })

  it('restreint sur la colonne de la MISSION, à l’index de paramètre demandé', () => {
    const clause = legalEntityClause('99999999-9999-4999-8999-999999999999', 'm', 4)
    expect(clause.sql).toContain('m.legal_entity_id = $4::uuid')
    expect(clause.params).toEqual(['99999999-9999-4999-8999-999999999999'])
  })

  it('suit l’alias de la requête appelante', () => {
    expect(legalEntityClause('abc', 'mi', 2).sql).toContain('mi.legal_entity_id = $2::uuid')
  })

  it('n’inclut JAMAIS les missions sans société — « non rattachée » n’est pas « toutes »', () => {
    // Un `OR legal_entity_id IS NULL` ferait entrer dans le total d'ACME toutes
    // les missions que personne n'a rattachées : le filtre paraîtrait marcher
    // et le chiffre serait faux, ce qui est exactement le pire des deux mondes.
    expect(legalEntityClause('abc', 'm', 2).sql).not.toContain('IS NULL')
  })
})

describe('ce que le filtre par société NE gouverne PAS', () => {
  it('nomme chaque lecture aveugle avec sa raison', () => {
    // Le registre est la moitié la plus utile du filtre : sans lui, un bloc qui
    // ne bouge pas quand on choisit une société se lit comme une panne.
    expect(FINANCE_ENTITY_BLIND_READS.length).toBeGreaterThan(0)
    for (const entry of FINANCE_ENTITY_BLIND_READS) {
      expect(entry.reason.length).toBeGreaterThan(30)
    }
  })

  it('nomme la capacité, le délai de paiement et la ligne espérée du prévisionnel', () => {
    const keys = FINANCE_ENTITY_BLIND_READS.map(entry => entry.key)
    expect(keys).toContain('capacity')
    expect(keys).toContain('dso')
    expect(keys).toContain('forecastHoped')
  })
})
