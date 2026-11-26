import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeSettingsOpenedFromLaura,
  markSettingsOpenedFromLaura,
  resolveSettingsFallbackRoute,
} from './laura-settings-origin'

describe('#2925 (#2145.20/.22) — le signal « Réglages ouverts depuis Laura »', () => {
  beforeEach(() => sessionStorage.clear())

  it('un clic marqué se consomme UNE fois, puis redevient absent', () => {
    markSettingsOpenedFromLaura()
    expect(consumeSettingsOpenedFromLaura()).toBe(true)
    expect(consumeSettingsOpenedFromLaura()).toBe(false)
  })

  it('sans clic marqué, la consommation répond false — jamais deviné', () => {
    expect(consumeSettingsOpenedFromLaura()).toBe(false)
  })

  it('resolveSettingsFallbackRoute : Laura ramène vers /chat, une PAGE, jamais la bulle', () => {
    expect(resolveSettingsFallbackRoute(true, '/briefing')).toBe('/chat')
  })

  it("resolveSettingsFallbackRoute : sans signal, la préférence de démarrage de l'utilisateur reste le dernier recours (#2112.24)", () => {
    expect(resolveSettingsFallbackRoute(false, '/briefing')).toBe('/briefing')
  })
})
