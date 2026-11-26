import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { actionStatusLabel, statusVariant } from './actionHistoryPresentation'

const t = i18n.getFixedT(null, 'actions') as unknown as Parameters<typeof actionStatusLabel>[0]

/**
 * Le statut d'une « Analyse lancée » était la constante « En cours », dérivée du
 * TYPE d'action — un événement passé. Le badge ne pouvait donc jamais cesser de
 * dire « en cours », et un run mort était strictement indiscernable d'un run
 * vivant. Les issues réelles sont maintenant résolues côté serveur depuis
 * `analysis_runs` ; ces tests verrouillent leur restitution.
 */
describe('statuts d’analyse — chaque issue réelle est distinguable', () => {
  it('traduit les issues réelles au lieu de les afficher brutes', () => {
    expect(actionStatusLabel(t, 'Échouée')).toBe('Échouée')
    expect(actionStatusLabel(t, 'Annulée')).toBe('Annulée')
    expect(actionStatusLabel(t, 'Sans suite')).toBe('Sans suite')
  })

  // Un échec doit SE VOIR — c'est le défaut central : il passait pour normal.
  it('un échec est visuellement distinct d’un succès', () => {
    expect(statusVariant('Échouée')).toBe('destructive')
    expect(statusVariant('Terminée')).toBe('success')
    expect(statusVariant('Échouée')).not.toBe(statusVariant('Terminée'))
  })

  // « Sans suite » ≠ « Échouée » : on ne sait pas ce que le run a produit, on ne
  // le saura jamais, et prétendre l'un ou l'autre serait inventer une issue.
  it('« Sans suite » n’est ni un succès ni un échec', () => {
    expect(statusVariant('Sans suite')).toBe('outline')
    expect(actionStatusLabel(t, 'Sans suite')).not.toBe(actionStatusLabel(t, 'Échouée'))
    expect(actionStatusLabel(t, 'Sans suite')).not.toBe(actionStatusLabel(t, 'En cours'))
  })

  it('les libellés existants ne bougent pas', () => {
    expect(actionStatusLabel(t, 'Terminée')).toBe('Terminée')
    expect(actionStatusLabel(t, 'En cours')).toBe('En cours')
    expect(statusVariant('Envoyé')).toBe('info')
  })
})
