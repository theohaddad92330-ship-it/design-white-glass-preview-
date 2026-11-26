import { describe, expect, it } from 'vitest'
import { offNavRoutes } from './off-nav-screens'
import { sectionForPath } from './sections'

/**
 * #1123 — « je fais pas attention et je vais cliquer sur cette barre qui me
 * ramène au général ».
 *
 * La règle que `SectionTabs` applique, testée sur la table de navigation RÉELLE
 * plutôt que sur un composant : on est DANS une fiche quand la route active est
 * un préfixe STRICT du chemin. Aucune liste à maintenir — c'est la table des
 * onglets déclarés qui décide.
 */

/** Miroir exact de la condition de `SectionTabs`. */
function insideRecord(pathname: string): boolean {
  const found = sectionForPath(pathname)
  // #4197 (L6) — un écran HORS BARRE est lui aussi « à l'intérieur ».
  const offNav = offNavRoutes().some(route => pathname === route || pathname.startsWith(`${route}/`))
  return found != null && (offNav || (found.activeTab !== pathname && pathname.startsWith(`${found.activeTab}/`)))
}

describe('la barre de section disparaît dans une fiche (#1123)', () => {
  it.each([
    '/accounts/75fa5a88-6afd-4bef-9e83-ee8b377b8822',
    '/contacts/8a01f138-20fd-4c44-8941-fb6fc2fc9476',
    // #2151.26 (16/09/2026) — « Partenaires » a quitté les onglets DÉCLARÉS de
    // Comptes : `sectionForPath` ne le retrouve plus qu'au préfixe, comme une
    // fiche. La route reste servie (Market Watch, référence Énergie y
    // pointent encore), mais elle n'est plus une destination de section — la
    // barre globale se retire comme pour n'importe quelle fiche.
    '/accounts/partners',
    // #4197 — les écrans de gestion de Missions sortent de la barre : ils se joignent depuis Facturation.
    // (#4491.2 — `/missions/cra` est redevenu un onglet : il est plus bas, avec les écrans de section.)
    '/expenses/bareme',
    '/pilotage/rex',
  ])('%s est une fiche — la barre globale se retire', path => {
    expect(insideRecord(path)).toBe(true)
  })

  it.each([
    '/accounts',
    '/contacts',
    // ⚠️ `/chat/commandes` a quitté cette liste le 02/09 (#1321) : ce n'est plus
    // un écran de section mais une REDIRECTION vers `/chat`. Le catalogue est
    // devenu un tiroir du composer. Une redirection n'a pas de barre à porter —
    // elle ne rend rien.
    '/missions/facturation',
    '/missions/cra', // #4491.2 (PR 12C) — onglet V22 « Relevés d’activité »
    '/expenses', // Théo C missions-planning.HT5 — onglet de Missions
  ])('%s est un écran de section — la barre reste', path => {
    expect(insideRecord(path)).toBe(false)
  })

  it('ne se prononce pas hors des sections connues', () => {
    // Connexion, back-office : la barre ne s'y affichait déjà pas.
    expect(insideRecord('/login')).toBe(false)
  })
})
