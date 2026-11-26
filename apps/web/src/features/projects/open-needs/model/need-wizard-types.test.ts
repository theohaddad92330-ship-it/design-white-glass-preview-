import { describe, expect, it } from 'vitest'
import { NEED_CHANNELS, NEED_ORIGINS } from '@bellum/contracts'
import {
  emptyNeedWizardDraft,
  MISSION_TYPE_CARDS,
  missionTypeCardPatch,
  missionTypeCardSelected,
  needWizardDraftToCreateInput,
  type NeedWizardDraft,
} from './need-wizard'

/**
 * LES SEPT CARTES REMPLISSENT DEUX CHAMPS — jamais une septième valeur.
 *
 * La maquette `08-creer-un-besoin.png` montre sept cartes côte à côte, ce qui
 * ressemble à une énumération unique. Ce fichier tient la lecture inverse :
 * quatre cartes écrivent `origin`, deux écrivent `channel`, une n'écrit RIEN.
 * Une régression qui réintroduirait un septième « type » en base casserait
 * d'abord ici, avant la contrainte SQL.
 */

function draft(over: Partial<NeedWizardDraft> = {}): NeedWizardDraft {
  return { ...emptyNeedWizardDraft(), ...over }
}

describe('les sept cartes « type de mission »', () => {
  it('en compte exactement sept, dans l’ordre de la maquette', () => {
    expect(MISSION_TYPE_CARDS.map(card => card.key)).toEqual([
      'inbound',
      'outbound',
      'partenaire',
      'portage',
      'sourcing_interne',
      'appel_offres',
      'apport_affaires',
    ])
  })

  it('n’écrit QUE des valeurs que la contrainte SQL accepte déjà', () => {
    for (const card of MISSION_TYPE_CARDS) {
      if (card.origin) expect(NEED_ORIGINS).toContain(card.origin)
      if (card.channel) expect(NEED_CHANNELS).toContain(card.channel)
      // Une carte ne touche jamais aux DEUX axes : sinon deux clics
      // successifs écraseraient silencieusement le choix précédent.
      expect(Boolean(card.origin) && Boolean(card.channel)).toBe(false)
    }
  })

  it('« sourcing interne » n’enregistre rien — c’est une ACTION, pas une valeur', () => {
    const card = MISSION_TYPE_CARDS.find(entry => entry.key === 'sourcing_interne')
    expect(card?.to).toBe('/consultants')
    expect(card?.origin).toBeUndefined()
    expect(card?.channel).toBeUndefined()
    expect(missionTypeCardPatch(card!, draft())).toEqual({})
    expect(missionTypeCardSelected(card!, draft())).toBe(false)
  })

  it('une origine et un canal COEXISTENT — un entrant servi par un partenaire est deux cartes', () => {
    const inbound = MISSION_TYPE_CARDS.find(entry => entry.key === 'inbound')!
    const partner = MISSION_TYPE_CARDS.find(entry => entry.key === 'partenaire')!

    let current = draft()
    current = { ...current, ...missionTypeCardPatch(inbound, current) }
    current = { ...current, ...missionTypeCardPatch(partner, current) }

    expect(current.origin).toBe('entrant')
    expect(current.channel).toBe('partenaire')
    expect(missionTypeCardSelected(inbound, current)).toBe(true)
    expect(missionTypeCardSelected(partner, current)).toBe(true)
  })

  it('une seconde carte du MÊME axe remplace la première', () => {
    const inbound = MISSION_TYPE_CARDS.find(entry => entry.key === 'inbound')!
    const outbound = MISSION_TYPE_CARDS.find(entry => entry.key === 'outbound')!

    let current = draft()
    current = { ...current, ...missionTypeCardPatch(inbound, current) }
    current = { ...current, ...missionTypeCardPatch(outbound, current) }

    expect(current.origin).toBe('sortant')
    expect(missionTypeCardSelected(inbound, current)).toBe(false)
  })

  it('re-cliquer efface — une carte posée par erreur se retire', () => {
    const portage = MISSION_TYPE_CARDS.find(entry => entry.key === 'portage')!
    const chosen = draft({ channel: 'portage' })
    expect(missionTypeCardPatch(portage, chosen)).toEqual({ channel: null })
  })

  it('aucune carte ne DEVINE « direct » — une absence de réponse reste une absence', () => {
    expect(MISSION_TYPE_CARDS.some(card => card.channel === 'direct')).toBe(false)
    // Et le corps envoyé au serveur n'invente pas le canal manquant.
    const body = needWizardDraftToCreateInput(draft({ title: 'Architecte cloud', origin: 'entrant' }))
    expect(body.channel).toBeUndefined()
    expect(body.origin).toBe('entrant')
  })
})
