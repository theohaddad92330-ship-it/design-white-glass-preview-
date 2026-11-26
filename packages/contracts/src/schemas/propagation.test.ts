import { describe, expect, it } from 'vitest'
import {
  PROPAGATION_FILTER_KEYS,
  accountPropagationSchema,
  accountRevenuePropagationSchema,
  consultantMarginPropagationSchema,
  consultantPropagationSchema,
  contactPropagationSchema,
  missionsOfAccount,
  missionsOfConsultant,
  propagated,
  propagatedBlockSchema,
} from './propagation.js'

const ACCOUNT = 'a0000000-0000-4000-8000-000000000001'
const CONTACT = 'c0000000-0000-4000-8000-000000000002'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000003'

/* ══════════════════════════════════════════════════════════════════════════ */
/*  §4.4 — un bloc propagé porte sa SOURCE, et ne s'édite jamais sur place    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('un bloc propagé porte un lien vers sa source', () => {
  it('la source est obligatoire — un bloc sans elle est REFUSÉ, pas toléré', () => {
    // Sans ce refus, un agrégat pourrait s'afficher sur une fiche sans que rien
    // ne dise où il se calcule : c'est exactement la seconde vérité que §4.4
    // existe pour empêcher.
    expect(propagatedBlockSchema.safeParse({ editable: false }).success).toBe(false)
  })

  it('un lien vide ne compte pas pour un lien', () => {
    expect(
      propagatedBlockSchema.safeParse({
        source: { kind: 'missions', href: '', label: 'Les missions de ce compte' },
        editable: false,
      }).success,
    ).toBe(false)
  })

  it('`editable` ne peut valoir QUE `false` — le type interdit la case', () => {
    // La règle est tenue par le TYPE et pas seulement par une convention : un
    // appelant qui écrirait `editable: true` ne compile pas, et une réponse qui
    // le porterait ne parse pas.
    const source = { kind: 'missions' as const, href: '/missions?accountId=1', label: 'Les missions de ce compte' }
    expect(propagatedBlockSchema.safeParse({ source, editable: false }).success).toBe(true)
    expect(propagatedBlockSchema.safeParse({ source, editable: true }).success).toBe(false)
  })

  it('`propagated` est le SEUL constructeur — il pose la source et le verrou', () => {
    const block = propagated({ accountId: ACCOUNT, missions: 3 }, missionsOfAccount(ACCOUNT))
    expect(block.editable).toBe(false)
    expect(block.source.href).toBe(`/missions?accountId=${ACCOUNT}`)
    expect(block.source.label.length).toBeGreaterThan(0)
    expect(block.missions).toBe(3)
  })

  it('les liens de source n’utilisent que des filtres que l’API sait lire', () => {
    // Une garde qui LIT : sans ces deux clés, `readFilters` de
    // `delivery.controller.ts` ignorerait le paramètre et le lien mènerait à la
    // liste ENTIÈRE — un lien qui ne montre pas la source ment sur la source.
    expect(PROPAGATION_FILTER_KEYS.length).toBeGreaterThan(0)
    for (const href of [missionsOfAccount(ACCOUNT).href, missionsOfConsultant(CONSULTANT).href]) {
      const key = href.slice(href.indexOf('?') + 1).split('=')[0]
      expect(PROPAGATION_FILTER_KEYS).toContain(key)
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════ */
/*  « non mesuré » n'est jamais « 0 »                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

describe('une valeur absente n’est jamais zéro', () => {
  it('un compte sans TJM connu rend `null`, et le zéro est REFUSÉ', () => {
    const base = {
      ...propagated({}, missionsOfAccount(ACCOUNT)),
      accountId: ACCOUNT,
      missions: 2,
      missionsWithoutRate: 2,
    }
    expect(accountPropagationSchema.safeParse({ ...base, averageSoldDailyRateCents: null }).success).toBe(true)
    // Zéro euro de TJM moyen n'existe pas : une mission à 0 € n'est pas une
    // mission, c'est une fiche vide. Le schéma le dit plutôt que l'écran.
    expect(accountPropagationSchema.safeParse({ ...base, averageSoldDailyRateCents: 0 }).success).toBe(false)
  })

  it('un compte sans mois facturé rend `null`, pas 0 €', () => {
    const parsed = accountRevenuePropagationSchema.safeParse({
      ...propagated({}, missionsOfAccount(ACCOUNT)),
      accountId: ACCOUNT,
      invoicedCents: null,
      invoicedMonths: 0,
      missions: 4,
      monthsWithoutAmount: 0,
    })
    expect(parsed.success).toBe(true)
  })

  it('une ligne « contact » n’existe que s’il a signé au moins une fois', () => {
    // Un contact à zéro mission signée ne produit PAS une ligne à 0 : il
    // n'apparaît pas. Le badge « a signé N missions » ne doit jamais s'écrire
    // « a signé 0 mission » — ce qui se lirait comme une mesure.
    const base = { ...propagated({}, missionsOfAccount(ACCOUNT)), contactId: CONTACT, accountId: ACCOUNT }
    expect(contactPropagationSchema.safeParse({ ...base, signedMissions: 1 }).success).toBe(true)
    expect(contactPropagationSchema.safeParse({ ...base, signedMissions: 0 }).success).toBe(false)
  })

  it('une ligne « consultant » n’existe que s’il a été placé au moins une fois', () => {
    const base = { ...propagated({}, missionsOfConsultant(CONSULTANT)), consultantId: CONSULTANT }
    expect(consultantPropagationSchema.safeParse({ ...base, placements: 4 }).success).toBe(true)
    expect(consultantPropagationSchema.safeParse({ ...base, placements: 0 }).success).toBe(false)
  })

  it('une marge non mesurable vaut `null` — et ce qui n’a pas pu l’être est COMPTÉ', () => {
    const parsed = consultantMarginPropagationSchema.safeParse({
      ...propagated({}, missionsOfConsultant(CONSULTANT)),
      consultantId: CONSULTANT,
      marginPercent: null,
      measured: 0,
      unmeasured: 3,
      measurability: { measurable: false, observed: 0, required: 5, missing: 5 },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.marginPercent).toBeNull()
  })
})
