import { describe, expect, it } from 'vitest'
import { contactFamilySchema } from './contact.js'
import {
  BUYER_ROLE_FAMILIES,
  BUYER_ROLE_FAMILY_KEYS,
  NON_FAMILY_CLASSIFIER_LABELS,
  normalizeBuyerRoleFamilyToken,
  resolveBuyerRoleFamily,
  resolveBuyerRoleFamilyFromTitle,
} from './buyer-role-families.js'

/**
 * Le registre des familles de rôles acheteurs — la garde.
 *
 * Leçon « garde borgne » appliquée : chaque bloc PROUVE d'abord qu'il lit un
 * corpus non vide (11 familles, > 50 alias, 11 libellés canoniques, 10 libellés
 * de prompt), puis compare. Une garde qui compare deux listes vides est verte
 * pour rien.
 */
describe('BUYER_ROLE_FAMILIES — le corpus', () => {
  it('lit onze familles, chacune avec ses alias et ses titres par niveau', () => {
    expect(BUYER_ROLE_FAMILIES.length).toBe(11)
    expect(BUYER_ROLE_FAMILY_KEYS.length).toBe(11)
    const aliasCount = BUYER_ROLE_FAMILIES.reduce((n, f) => n + f.aliases.length, 0)
    expect(aliasCount).toBeGreaterThan(50)
    for (const family of BUYER_ROLE_FAMILIES) {
      expect(family.labelFr.length).toBeGreaterThan(0)
      expect(family.aliases.length).toBeGreaterThan(0)
      expect(family.titles.c_level.length).toBeGreaterThan(0)
      expect(family.titles.n1.length).toBeGreaterThan(0)
      expect(family.titles.n2.length).toBeGreaterThan(0)
    }
  })

  it('est en bijection avec `contactFamilySchema` — aucune famille inventée, aucune perdue', () => {
    const persisted = [...contactFamilySchema.options].sort()
    expect(persisted.length).toBe(11)
    const registry = BUYER_ROLE_FAMILIES.map(f => f.contactFamily).sort()
    expect(registry).toEqual(persisted)
  })

  it('ne déclare aucune clé ni aucun alias en double — deux familles ne se disputent pas un token', () => {
    expect(new Set(BUYER_ROLE_FAMILY_KEYS).size).toBe(BUYER_ROLE_FAMILY_KEYS.length)
    const seen = new Map<string, string>()
    for (const family of BUYER_ROLE_FAMILIES) {
      for (const token of [family.key, ...family.aliases]) {
        const normalized = normalizeBuyerRoleFamilyToken(token)
        expect(normalized).not.toBe('')
        const owner = seen.get(normalized)
        expect(owner ?? family.key).toBe(family.key)
        seen.set(normalized, family.key)
      }
    }
    expect(seen.size).toBeGreaterThan(50)
  })

  it('garde au moins trois familles cibles — sous trois axes, la largeur du compte ne se mesure pas', () => {
    const targets = BUYER_ROLE_FAMILIES.filter(f => f.isTarget)
    expect(targets.length).toBeGreaterThanOrEqual(3)
    expect(targets.length).toBeLessThan(BUYER_ROLE_FAMILIES.length)
  })
})

describe('resolveBuyerRoleFamily', () => {
  it('résout les onze libellés canoniques persistés sur `contacts.family`', () => {
    const options = contactFamilySchema.options
    expect(options.length).toBe(11)
    for (const label of options) {
      expect(resolveBuyerRoleFamily(label)).not.toBeNull()
    }
  })

  /**
   * LE défaut que ce registre corrige.
   *
   * Le prompt de classification (`apps/ia/app/prompts/bellum_contacts.py`)
   * demande à Claude d'écrire des libellés COMPOSÉS (« Data / BI / Analytics »),
   * et l'API les persiste tels quels (`contacts.service.ts`, `family: c.family ||
   * null`). La matrice de couverture comparait ces libellés à ses alias par
   * égalité EXACTE : neuf des dix ne tombaient sur rien et repartaient au repli
   * par mots-clés de titre — le champ `family` que le modèle avait rempli était
   * jeté.
   *
   * Mesuré avant correction : 1 sur 10 (seul « Cybersecurite » passait).
   *
   * ⚠️ Le prompt n'en demande que DIX quand le produit en connaît onze : il
   * replie `infra` dans « IT / Infrastructure ». Le modèle n'écrit donc jamais
   * `Infra` — écart nommé et gardé côté IA
   * (`test_buyer_role_families_parity.py`), parqué en D176.
   */
  it('résout les libellés composés que le prompt de classification demande', () => {
    const promptLabels = [
      'IT / Infrastructure',
      'Cybersecurite',
      'Data / BI / Analytics',
      'IA / ML',
      'Developpement / Architecture',
      'PMO / Transformation',
      'Finance / Controle de gestion',
      'Direction generale / C-Level',
      'Achat / Procurement',
      'RH / Talent',
    ] as const
    expect(promptLabels.length).toBe(10)
    const unresolved = promptLabels.filter(label => resolveBuyerRoleFamily(label) === null)
    expect(unresolved).toEqual([])
  })

  it('place chaque libellé composé sur la BONNE famille, pas seulement sur une famille', () => {
    expect(resolveBuyerRoleFamily('IT / Infrastructure')).toBe('it')
    expect(resolveBuyerRoleFamily('Data / BI / Analytics')).toBe('data')
    expect(resolveBuyerRoleFamily('IA / ML')).toBe('ia')
    expect(resolveBuyerRoleFamily('Developpement / Architecture')).toBe('dev')
    expect(resolveBuyerRoleFamily('PMO / Transformation')).toBe('pmo')
    expect(resolveBuyerRoleFamily('Finance / Controle de gestion')).toBe('finance')
    expect(resolveBuyerRoleFamily('Direction generale / C-Level')).toBe('clevel')
    expect(resolveBuyerRoleFamily('Achat / Procurement')).toBe('achat')
    expect(resolveBuyerRoleFamily('RH / Talent')).toBe('rh')
  })

  it('ignore la casse, les accents et les séparateurs', () => {
    expect(resolveBuyerRoleFamily('Sécurité')).toBe('cyber')
    expect(resolveBuyerRoleFamily('  DSI  ')).toBe('it')
    expect(resolveBuyerRoleFamily('c-level')).toBe('clevel')
    expect(resolveBuyerRoleFamily('Ressources Humaines')).toBe('rh')
  })

  it("rend `null` sur une absence — « non classé » n'est pas « classé ailleurs »", () => {
    expect(resolveBuyerRoleFamily(null)).toBeNull()
    expect(resolveBuyerRoleFamily(undefined)).toBeNull()
    expect(resolveBuyerRoleFamily('')).toBeNull()
    expect(resolveBuyerRoleFamily('   ')).toBeNull()
  })

  /**
   * « Autre » est la douzième valeur du prompt et n'est PAS une famille : c'est
   * le mot que le modèle écrit quand il ne sait pas. Le rattacher à une famille
   * ferait entrer un contact non classé dans une case de la matrice — un
   * « couvert » qui ne l'est pas. Nommé ici pour que personne ne le « corrige ».
   */
  /** #2635.1 — mêmes intitulés, cette fois comme valeur structurée (`contact.family`). */
  it('#2635.1 — résout « MLOps », « FDE » et « GenAI » comme la famille ia', () => {
    expect(resolveBuyerRoleFamily('MLOps')).toBe('ia')
    expect(resolveBuyerRoleFamily('FDE')).toBe('ia')
    expect(resolveBuyerRoleFamily('GenAI')).toBe('ia')
  })

  it('refuse de faire de « Autre » une famille', () => {
    expect(NON_FAMILY_CLASSIFIER_LABELS.length).toBeGreaterThan(0)
    for (const label of NON_FAMILY_CLASSIFIER_LABELS) {
      expect(resolveBuyerRoleFamily(label)).toBeNull()
    }
  })

  /**
   * Les trois libellés OBSERVÉS et non registrés — mesurés dans le jeu de démo
   * le 29/08/2026 : « Métier » (43 lignes), « Ingénierie » (14), « Conformité »
   * (10). Ils NOMMENT le reste du biais : le produit ne connaît pas de famille
   * métier, ingénierie ni conformité, et leur en inventer une serait affirmer
   * une chose que la donnée ne dit pas. Élargir les onze familles est la
   * migration de taxonomie parquée en D176 — ce test la rendra rouge le jour où
   * elle sera faite, ce qui est exactement le but.
   */
  it('laisse NON RÉSOLUS les libellés observés hors des onze familles, sans les deviner', () => {
    expect(resolveBuyerRoleFamily('Métier')).toBeNull()
    expect(resolveBuyerRoleFamily('Ingénierie')).toBeNull()
    expect(resolveBuyerRoleFamily('Conformité')).toBeNull()
  })
})

/**
 * #2165.37 — l'EXPERTISE déduite d'un intitulé de poste en texte libre, quand
 * aucun `family` structuré n'existe sur la source (le résultat Découvrir
 * n'a que le titre). Même corpus, même ordre que `resolveBuyerRoleFamily` —
 * remonté depuis `coverage.service.ts` pour qu'un seul endroit le porte.
 */
describe('resolveBuyerRoleFamilyFromTitle', () => {
  it('déduit une expertise depuis un intitulé, indépendamment des accents et de la casse', () => {
    expect(resolveBuyerRoleFamilyFromTitle('RSSI Groupe')).toBe('cyber')
    expect(resolveBuyerRoleFamilyFromTitle('directeur des systèmes d’information')).toBe('it')
    expect(resolveBuyerRoleFamilyFromTitle('Head of Data')).toBe('data')
  })

  it('rend null — jamais une expertise devinée — quand aucun indice ne matche', () => {
    expect(resolveBuyerRoleFamilyFromTitle('Assistant administratif')).toBeNull()
    expect(resolveBuyerRoleFamilyFromTitle(null)).toBeNull()
  })

  /**
   * #2635.1 — la famille `ia` ne reconnaissait qu'un vocabulaire figé (IA, AI,
   * ML, machine learning) : « Head of AI », « VP AI », « MLOps Engineer » et
   * « FDE » (Forward Deployed Engineer) — des intitulés RÉELS vus chez
   * Decathlon/Accor/Carrefour — n'y tombaient pas. Mesuré : la matrice de
   * couverture et la recherche de rôles perdaient ces contacts.
   */
  it('#2635.1 — reconnaît le vocabulaire IA anglophone et les intitulés spécialisés', () => {
    expect(resolveBuyerRoleFamilyFromTitle('Head of AI')).toBe('ia')
    expect(resolveBuyerRoleFamilyFromTitle('VP AI')).toBe('ia')
    expect(resolveBuyerRoleFamilyFromTitle('MLOps Engineer')).toBe('ia')
    expect(resolveBuyerRoleFamilyFromTitle('FDE')).toBe('ia')
    expect(resolveBuyerRoleFamilyFromTitle('Forward Deployed Engineer')).toBe('ia')
    expect(resolveBuyerRoleFamilyFromTitle('GenAI Lead')).toBe('ia')
  })
})
