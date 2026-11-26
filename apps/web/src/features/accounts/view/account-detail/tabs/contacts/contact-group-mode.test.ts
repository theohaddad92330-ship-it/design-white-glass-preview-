import { beforeEach, describe, expect, it } from 'vitest'
import { CONTACT_GROUP_MODE_STORAGE_KEY, readContactGroupMode } from './contact-group-mode'

describe('readContactGroupMode — #3153 le défaut devient « persona », un choix mémorisé est respecté', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sans choix mémorisé, rend le nouveau défaut « persona »', () => {
    expect(readContactGroupMode()).toBe('persona')
  })

  it('un choix explicite mémorisé (« entity ») est respecté', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'entity')
    expect(readContactGroupMode()).toBe('entity')
  })

  it('un choix explicite mémorisé (« persona ») est respecté', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'persona')
    expect(readContactGroupMode()).toBe('persona')
  })

  it('#3154 — une valeur ancienne « technology » (mode retiré) retombe sur le défaut, jamais une erreur', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'technology')
    expect(readContactGroupMode()).toBe('persona')
  })

  it('une valeur saisie à la main, inconnue, retombe sur le défaut', () => {
    localStorage.setItem(CONTACT_GROUP_MODE_STORAGE_KEY, 'n-importe-quoi')
    expect(readContactGroupMode()).toBe('persona')
  })
})
