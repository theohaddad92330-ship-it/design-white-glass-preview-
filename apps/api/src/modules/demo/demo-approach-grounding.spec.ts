import { readRecentSignals } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Règle n°9 (#4524, #4525) — « Préparer l'approche » doit être REMPLIE en démonstration.
 *
 * Le bloc « Sur quoi Laura s'appuie » liste des faits cochables lus du dossier : les signaux du compte
 * (`raw_analysis.recent_signals`, déjà semés) et les signaux et besoins du contact (`signals`, `key_points`). L'onglet
 * Appel affiche le numéro EN CLAIR (plage de fiction) et rédige son support à l'ouverture. Aucune clé neuve : rien à
 * classer dans `demo-coverage.ts` — cette garde lit le vrai semis pour que ce soit prouvé, pas supposé.
 */
describe('démo — Préparer l’approche (#4524, #4525)', () => {
  it('au moins un compte porte deux signaux lisibles ou plus : de quoi cocher, les deux premiers l’étant d’emblée', () => {
    const cochables = DEMO_DOSSIERS.filter(dossier => readRecentSignals(dossier.account.recent_signals).length >= 2)
    expect(cochables.length).toBeGreaterThan(0)
  })

  it('un contact porte des points clés (besoins) : le groupe « contact » du bloc n’est pas vide', () => {
    const avecBesoins = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).filter(contact =>
      contact.key_points.some(point => point.trim().length > 0),
    )
    expect(avecBesoins.length).toBeGreaterThan(0)
  })

  it('un contact de la salle a un numéro : l’onglet Appel montre un support avec « Appeler », jamais un onglet sans numéro partout', () => {
    const avecNumero = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts).filter(contact =>
      Boolean(contact.phone?.trim()),
    )
    expect(avecNumero.length).toBeGreaterThan(0)
  })
})
