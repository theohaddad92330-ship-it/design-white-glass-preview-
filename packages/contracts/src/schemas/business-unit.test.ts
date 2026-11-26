import { describe, expect, it } from 'vitest'
import {
  businessUnitAccessValues,
  businessUnitKindValues,
  businessUnitScopeFor,
  createBusinessUnitSchema,
  setMemberBusinessUnitAccessSchema,
} from './business-unit.js'

/**
 * LES RÈGLES D'ACCÈS DE LA COUCHE BU — chacune NOMMÉE, et chacune sait dire NON.
 *
 * Condition posée le 15/09/2026 pour lever l'arrêt du §10 de `.claude/projet.md` :
 * « chaque règle d'accès est un test NOMMÉ qui sait dire NON, et la PR ne se
 * merge pas sans qu'il l'ait lue ». Un cloisonnement sans test qui échoue quand
 * on retire le code n'est pas un cloisonnement, c'est une intention.
 *
 * Ce fichier tient la moitié PURE de la règle. L'autre moitié — « la règle est
 * réellement transmise à la requête » — vit dans
 * `apps/api/src/modules/business-unit/business-unit-scope.spec.ts`, et c'est
 * celle qui manque le plus souvent : une règle calculée correctement mais jamais
 * passée au SQL laisse l'écran tout afficher, avec des tests verts partout.
 *
 * ⚠️ Preuve que ces tests savent dire NON — MESURÉE le 15/09/2026 en cassant
 * volontairement `businessUnitScopeFor`, trois fois, et en relevant le compte :
 *  · corps remplacé par `return null` (« pas de cloisonnement ») → 5 rouges / 12 ;
 *  · `includeUnassigned` passé à `false` → 2 rouges / 12 ;
 *  · ligne `if (access === 'workspace') return null` retirée → 1 rouge / 12,
 *    et c'est le témoin de non-régression.
 * Intacte, la fonction rend 12 verts. Le script de la mesure est
 * `scratchpad/w13-prove-no.sh`.
 */
describe('la couche BU — les règles d’accès', () => {
  const LYON = 'bu-lyon'
  const NANTES = 'bu-nantes'

  it('un membre cloisonné ne voit pas les données d’une AUTRE BU du même espace', () => {
    const scope = businessUnitScopeFor('business_unit', [LYON])

    expect(scope).not.toBeNull()
    expect(scope?.businessUnitIds).toEqual([LYON])
    expect(scope?.businessUnitIds).not.toContain(NANTES)
  })

  it('le niveau d’accès qui voit TOUT l’espace continue de tout voir — le témoin de non-régression', () => {
    // Le défaut de toute ligne `workspace_members` après migration. Si ce test
    // tombe, la dimension a cloisonné les administrateurs par accident, et
    // l'espace entier se découvre vide un lundi matin.
    expect(businessUnitScopeFor('workspace', [])).toBeNull()
    expect(businessUnitScopeFor('workspace', [LYON, NANTES])).toBeNull()
  })

  it('une donnée SANS BU reste visible de qui la voyait avant — la dimension est ADDITIVE', () => {
    const scope = businessUnitScopeFor('business_unit', [LYON])

    expect(scope?.includeUnassigned).toBe(true)
  })

  it('un membre cloisonné SANS aucun périmètre ne voit pas tout l’espace — une liste vide n’est pas « pas de filtre »', () => {
    // L'erreur qui ouvrirait l'espace entier au premier membre mal configuré :
    // « il n'a pas de BU, donc pas de filtre ».
    const scope = businessUnitScopeFor('business_unit', [])

    expect(scope).not.toBeNull()
    expect(scope?.businessUnitIds).toEqual([])
    expect(scope?.includeUnassigned).toBe(true)
  })

  it('porter plusieurs périmètres les cumule, sans jamais en ajouter un troisième', () => {
    const scope = businessUnitScopeFor('business_unit', [LYON, NANTES])

    expect(scope?.businessUnitIds).toEqual([LYON, NANTES])
  })

  it('la portée rendue ne partage pas son tableau avec l’appelant', () => {
    // Un appelant qui trierait la liste en place réécrirait le périmètre d'un
    // membre pour tous les suivants — le genre de fuite qu'aucun écran ne montre.
    const owned = [LYON]
    const scope = businessUnitScopeFor('business_unit', owned)
    owned.push(NANTES)

    expect(scope?.businessUnitIds).toEqual([LYON])
  })

  it('aucun rôle ne contourne le cloisonnement — le niveau d’accès est le SEUL argument', () => {
    // Le responsable d'une agence porte `team:manage` sur SON agence. Si le rôle
    // ouvrait l'espace, le niveau intermédiaire n'aurait plus aucun usage
    // (#2005.7). La signature est la garde : la fonction ne reçoit pas de rôle.
    expect(businessUnitScopeFor.length).toBe(2)
  })
})

describe('la couche BU — le contrat de saisie', () => {
  it('le niveau d’accès n’accepte que deux valeurs, et « workspace » est celle d’avant', () => {
    expect(businessUnitAccessValues).toEqual(['workspace', 'business_unit'])
    expect(setMemberBusinessUnitAccessSchema.safeParse({ access: 'admin' }).success).toBe(false)
  })

  it('les sept échelles de travail sont celles des sept cartes', () => {
    expect(businessUnitKindValues).toEqual([
      'company',
      'business_unit',
      'agency',
      'sales_team',
      'territory',
      'new_venture',
      'solo',
    ])
  })

  it('un périmètre sans nom est refusé, et un nom d’espaces seuls aussi', () => {
    expect(createBusinessUnitSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createBusinessUnitSchema.safeParse({ name: '   ' }).success).toBe(false)
    expect(createBusinessUnitSchema.safeParse({ name: 'Agence Lyon' }).success).toBe(true)
  })

  it('un effectif non renseigné reste ABSENT — il ne devient pas zéro', () => {
    const parsed = createBusinessUnitSchema.parse({ name: 'Agence Lyon' })

    expect(parsed.consultantCount).toBeUndefined()
    expect(parsed.teamSize).toBeUndefined()
  })

  it('un effectif négatif est refusé, un effectif nul est accepté', () => {
    // Une agence qui ouvre a zéro consultant ; aucune n'en a moins que zéro.
    expect(createBusinessUnitSchema.safeParse({ name: 'X', consultantCount: -1 }).success).toBe(false)
    expect(createBusinessUnitSchema.safeParse({ name: 'X', consultantCount: 0 }).success).toBe(true)
  })

  // #2005.5 (DÉCISION Louis 17/09, lot CP2) — capacité et objectif du
  // trimestre, saisis par le responsable de BU.
  it('une capacité et un objectif de trimestre non renseignés restent ABSENTS — jamais zéro ni chaîne vide', () => {
    const parsed = createBusinessUnitSchema.parse({ name: 'Agence Lyon' })

    expect(parsed.capacityAvailableConsultants).toBeUndefined()
    expect(parsed.quarterObjective).toBeUndefined()
  })

  it('une capacité négative est refusée, une capacité nulle est acceptée', () => {
    expect(createBusinessUnitSchema.safeParse({ name: 'X', capacityAvailableConsultants: -1 }).success).toBe(false)
    expect(createBusinessUnitSchema.safeParse({ name: 'X', capacityAvailableConsultants: 0 }).success).toBe(true)
  })

  it('accepte un objectif de trimestre, et le borne à 500 caractères', () => {
    expect(createBusinessUnitSchema.safeParse({ name: 'X', quarterObjective: 'Ouvrir 3 comptes clés' }).success).toBe(
      true,
    )
    expect(createBusinessUnitSchema.safeParse({ name: 'X', quarterObjective: 'a'.repeat(501) }).success).toBe(false)
  })
})
