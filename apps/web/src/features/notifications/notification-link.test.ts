import { describe, expect, it } from 'vitest'
import { notificationDestination } from './notification-link'

/**
 * #1938.11 — une notification renvoie vers l'OBJET exact quand la source le
 * connaît, jamais une route devinée.
 *
 * Avant ce lot, `notificationDestination` ne reconnaissait que 3 destinations
 * (`/accounts/<id>`, `/dashboard`, `/billing`) : tout le reste rendait `null`,
 * donc AUCUN geste d'ouverture — alors même que plusieurs sources réelles
 * écrivent déjà un lien précis (`routines.service.ts`, `action-router.module.ts`,
 * `playbook-send.sweeper.ts`, `session-registry.service.ts`) qui n'était
 * simplement jamais traduit côté routeur. La fonction ne CONSTRUIT toujours
 * rien à partir d'un objet — elle continue de seulement TRADUIRE le `link`
 * déjà écrit côté serveur, mais elle en reconnaît désormais la forme générale
 * plutôt qu'une liste fermée à 3 cas.
 */
describe('notificationDestination', () => {
  it('sans lien, ne propose aucun geste (inchangé)', () => {
    expect(notificationDestination(null)).toBeNull()
  })

  it('un compte précis ouvre sa fiche, onglet Vue d’ensemble (inchangé)', () => {
    expect(notificationDestination('/accounts/abc-123')).toEqual({
      to: '/accounts/$id',
      params: { id: 'abc-123' },
      search: { tab: 'overview' },
    })
  })

  it('« /accounts/ » sans id ne devine rien (inchangé)', () => {
    expect(notificationDestination('/accounts/')).toBeNull()
  })

  it('/billing ajoute le paramètre qui ouvre les offres (inchangé)', () => {
    expect(notificationDestination('/billing')).toEqual({ to: '/billing', search: { offers: true } })
  })

  it('/dashboard reste géré (inchangé)', () => {
    expect(notificationDestination('/dashboard')).toEqual({ to: '/dashboard' })
  })

  it('une mission précise (routine CRA) ouvre désormais sa route réelle', () => {
    expect(notificationDestination('/missions/cra')).toEqual({ to: '/missions/cra' })
  })

  it('un besoin sans profil (routine) ouvre sa liste réelle', () => {
    expect(notificationDestination('/projects/needs')).toEqual({ to: '/projects/needs' })
  })

  it('des contacts à revoir (routine) ouvrent leur écran réel', () => {
    expect(notificationDestination('/contacts')).toEqual({ to: '/contacts' })
  })

  it('un brief (routine) ouvre /briefing', () => {
    expect(notificationDestination('/briefing')).toEqual({ to: '/briefing' })
  })

  it('une alerte de sécurité (type system) ouvre désormais /settings/team — mort avant ce lot', () => {
    expect(notificationDestination('/settings/team')).toEqual({ to: '/settings/team' })
  })

  it('une demande d’approbation (playbooks) ouvre /actions', () => {
    expect(notificationDestination('/actions')).toEqual({ to: '/actions' })
  })

  it('une querystring déjà présente dans le lien devient un `search`', () => {
    expect(notificationDestination('/accounts?gate=parked')).toEqual({
      to: '/accounts',
      search: { gate: 'parked' },
    })
  })

  it('SAIT DIRE NON — une chaîne vide ne propose aucun geste', () => {
    expect(notificationDestination('')).toBeNull()
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un lien protocole-relatif (jamais écrit par le serveur) n’est jamais suivi', () => {
    expect(notificationDestination('//evil.example.com')).toBeNull()
  })

  it('un lien qui ne commence pas par « / » n’est jamais suivi', () => {
    expect(notificationDestination('https://evil.example.com')).toBeNull()
  })

  /**
   * Revue d'intégration du lot 7 — « // » n'est pas la seule forme
   * protocole-relative. L'analyseur d'URL du navigateur (WHATWG) lit une barre
   * oblique inverse comme une barre oblique, et RETIRE tabulations et retours à
   * la ligne avant d'analyser : `/\hôte` et `/<tab>/hôte` deviennent `//hôte`,
   * donc un autre ORIGINE. Le seul critère qui ne se contourne pas est le
   * résultat : le chemin, résolu, doit rester sur l'application.
   */
  it('SAIT DIRE NON — une barre oblique inverse (« /\\hôte », lu « //hôte » par le navigateur) n’est jamais suivie', () => {
    expect(notificationDestination('/\\evil.example.com')).toBeNull()
    expect(notificationDestination('\\\\evil.example.com')).toBeNull()
  })

  it('SAIT DIRE NON — une tabulation ou un retour à la ligne glissé entre les deux barres n’est jamais suivi', () => {
    expect(notificationDestination('/\t/evil.example.com')).toBeNull()
    expect(notificationDestination('/\n/evil.example.com')).toBeNull()
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un chemin encodé reste un chemin de l’application', () => {
    expect(notificationDestination('/contacts?q=a%2Fb')).toEqual({ to: '/contacts', search: { q: 'a/b' } })
  })
})
