import {
  OUTREACH_SEQUENCE_MAX_STEPS,
  createOutreachSequenceRequestSchema,
  outreachStepKindSchema,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * LA CADENCE PERSONNALISÉE (#1510).
 *
 * ⚠️ Ce qui manquait n'était PAS le moteur. `createOutreachSequenceRequestSchema`
 * accepte « un gabarit OU des étapes » depuis le premier jour, et le plafond de
 * douze est au contrat. C'est l'écran qui n'offrait pas la porte — encore une
 * capacité juste, testée, que personne ne pouvait atteindre.
 *
 * Ces tests tiennent le CONTRAT que l'éditeur doit respecter, pas son rendu :
 * ce sont les règles que le serveur appliquera de toute façon, et qu'un écran
 * qui les ignore transforme en erreur après coup, après la saisie.
 */
const CONTACT = '11111111-1111-1111-1111-111111111111'

/** Ce que l'éditeur envoie — la même forme que `CustomCadenceEditor` produit. */
function body(steps: { kind: string; offset_days: number; label?: string }[]) {
  return { contact_id: CONTACT, steps }
}

describe('ce que le moteur accepte déjà — et que l’écran n’offrait pas', () => {
  it('accepte des étapes libres, sans aucun gabarit', () => {
    const parsed = createOutreachSequenceRequestSchema.safeParse(
      body([
        { kind: 'email', offset_days: 0, label: 'Premier contact' },
        { kind: 'reminder', offset_days: 4 },
      ]),
    )
    expect(parsed.success).toBe(true)
  })

  /**
   * ⚠️ « Un gabarit OU des étapes », jamais les deux : « quel gabarit, avec
   * quelles étapes » n'a pas de sens, et le contrat le refuse. L'éditeur envoie
   * donc l'un ou l'autre — d'où le `custom` qui commande le corps entier.
   */
  it('refuse un gabarit ET des étapes à la fois', () => {
    const parsed = createOutreachSequenceRequestSchema.safeParse({
      contact_id: CONTACT,
      template: 'cold_email',
      steps: [{ kind: 'email', offset_days: 0 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('refuse une séquence SANS aucune étape', () => {
    expect(createOutreachSequenceRequestSchema.safeParse(body([])).success).toBe(false)
  })

  /** Le plafond que l'éditeur affiche vient d'ICI, il n'est pas recopié. */
  it('refuse au-delà de douze touches', () => {
    const twelve = Array.from({ length: OUTREACH_SEQUENCE_MAX_STEPS }, (_, index) => ({
      kind: 'reminder',
      offset_days: index,
    }))
    expect(createOutreachSequenceRequestSchema.safeParse(body(twelve)).success).toBe(true)
    expect(
      createOutreachSequenceRequestSchema.safeParse(body([...twelve, { kind: 'reminder', offset_days: 20 }])).success,
    ).toBe(false)
  })

  it('refuse un décalage négatif ou au-delà d’un an', () => {
    expect(createOutreachSequenceRequestSchema.safeParse(body([{ kind: 'email', offset_days: -1 }])).success).toBe(
      false,
    )
    expect(createOutreachSequenceRequestSchema.safeParse(body([{ kind: 'email', offset_days: 366 }])).success).toBe(
      false,
    )
  })

  /**
   * ⚠️ Les trois natures viennent du contrat. L'éditeur les LIT
   * (`outreachStepKindSchema.options`) au lieu d'en écrire une liste à côté :
   * une quatrième nature apparaîtrait dans le menu toute seule, et une nature
   * retirée en disparaîtrait.
   */
  it('n’offre que les natures que le contrat connaît', () => {
    expect(outreachStepKindSchema.options).toEqual([
      'email',
      'reminder',
      'task',
      // Lot L-B (#4165) — les vrais canaux, AJOUTÉS EN FIN : l'éditeur les offre tout seul.
      'linkedin_invite',
      'linkedin_message',
      'call',
    ])
    expect(createOutreachSequenceRequestSchema.safeParse(body([{ kind: 'sms', offset_days: 0 }])).success).toBe(false)
  })

  /**
   * L'intention d'une touche est FACULTATIVE au contrat. L'éditeur laisse donc
   * le champ vide passer — et l'aperçu affiche alors la nature de la touche,
   * jamais une ligne vide qui se lirait comme un bug.
   */
  it('accepte une touche sans intention écrite', () => {
    expect(createOutreachSequenceRequestSchema.safeParse(body([{ kind: 'task', offset_days: 2 }])).success).toBe(true)
  })
})
