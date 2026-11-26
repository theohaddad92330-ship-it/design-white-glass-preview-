import { describe, expect, it } from 'vitest'
import { buildQueryString } from '@/features/action-history/api'
import { buildActiveFilters, buildHistoryQuery, searchPatchFromFilters } from './actionHistoryQuery'

/**
 * Le journal d'activité ne savait filtrer que par type, statut et période : pour
 * répondre à « qui a fait quoi chez Decathlon », il fallait faire défiler tout
 * l'historique de l'équipe. Ces tests verrouillent le passage des deux nouvelles
 * dimensions — compte et membre — de l'URL jusqu'à la requête serveur.
 */
describe('journal d’activité — recherche par compte et par membre', () => {
  it('transforme les paramètres d’URL compte/membre en chips actives', () => {
    const filters = buildActiveFilters({ account: 'Decathlon', member: 'user-1' })
    expect(filters).toEqual([
      { id: 'account', value: 'Decathlon' },
      { id: 'member', value: 'user-1' },
    ])
  })

  it('envoie le compte en recherche texte et le membre en auteur (actorId)', () => {
    const query = buildHistoryQuery('all', [
      { id: 'account', value: 'Decathlon' },
      { id: 'member', value: 'user-1' },
    ])
    expect(query.account).toBe('Decathlon')
    expect(query.actorId).toBe('user-1')
  })

  it('ne transmet pas un compte vide — une chip vide filtrerait tout', () => {
    expect(buildHistoryQuery('all', [{ id: 'account', value: '   ' }]).account).toBeUndefined()
    expect(buildActiveFilters({ account: '  ' })).toEqual([])
  })

  it('conserve les filtres existants (type, statut, période) et l’onglet actif', () => {
    const query = buildHistoryQuery('message', [
      { id: 'type', value: 'analysis' },
      { id: 'status', value: 'Envoyé' },
      { id: 'period', value: '30d' },
      { id: 'member', value: 'user-2' },
    ])
    // L'onglet prime sur la chip « type » : c'est la règle déjà en place.
    expect(query.type).toBe('message')
    expect(query.status).toBe('Envoyé')
    expect(query.period).toBe('30d')
    expect(query.actorId).toBe('user-2')
  })

  it('retirer une chip efface la clé d’URL correspondante', () => {
    const patch = searchPatchFromFilters([{ id: 'account', value: 'Decathlon' }])
    expect(patch).toEqual({
      account: 'Decathlon',
      member: undefined,
      period: undefined,
      status: undefined,
      type: undefined,
    })
  })

  // Un filtre qui s'affiche mais n'est pas sérialisé = une liste qui ne bouge
  // pas, sans rien à l'écran pour l'expliquer.
  it('sérialise compte et membre dans l’URL appelée', () => {
    const qs = buildQueryString(
      buildHistoryQuery('all', [
        { id: 'account', value: 'Decathlon' },
        { id: 'member', value: 'user-1' },
      ]),
    )
    expect(qs).toContain('account=Decathlon')
    expect(qs).toContain('actorId=user-1')
  })

  // #2200.38 — la donnée (`channel`) arrive déjà sur chaque ligne du journal ;
  // seul le filtre manquait pour resserrer « que s'est-il passé sur LinkedIn ».
  it('transmet le canal choisi jusqu’à la requête serveur — #2200.38', () => {
    const filters = buildActiveFilters({ channel: 'linkedin' } as never)
    expect(filters).toEqual([{ id: 'channel', value: 'linkedin' }])

    const query = buildHistoryQuery('all', [{ id: 'channel', value: 'linkedin' }])
    expect(query.channel).toBe('linkedin')

    const patch = searchPatchFromFilters([{ id: 'channel', value: 'linkedin' }])
    expect(patch.channel).toBe('linkedin')

    const qs = buildQueryString(buildHistoryQuery('all', [{ id: 'channel', value: 'linkedin' }]))
    expect(qs).toContain('channel=linkedin')
  })

  it('ignore un canal inconnu plutôt que de l’envoyer au serveur', () => {
    expect(buildHistoryQuery('all', [{ id: 'channel', value: 'fax' }]).channel).toBeUndefined()
    expect(searchPatchFromFilters([{ id: 'channel', value: 'fax' }]).channel).toBeUndefined()
  })

  it('ignore une période inconnue plutôt que de l’envoyer au serveur', () => {
    expect(buildHistoryQuery('all', [{ id: 'period', value: '365d' }]).period).toBeUndefined()
    expect(searchPatchFromFilters([{ id: 'period', value: '365d' }]).period).toBeUndefined()
  })

  // §8 « Depuis votre dernière connexion » : le repère doit ATTEINDRE le serveur,
  // sinon la fenêtre delta afficherait tout l'historique sans rien le signaler.
  it('sérialise le repère `since` dans l’URL appelée', () => {
    const qs = buildQueryString({ since: '2026-07-22T18:00:00.000Z', limit: 25 })
    expect(qs).toContain('since=2026-07-22T18%3A00%3A00.000Z')
  })

  it('n’ajoute pas de paramètre `since` quand il n’y en a pas', () => {
    expect(buildQueryString({ limit: 25 })).not.toContain('since')
  })
})

/**
 * §L4, 30/08/2026 — le rang d'onglets de catégorie (« Depuis ma connexion /
 * Tous / Analyses / … ») est retiré de l'écran : il ne faisait QUE filtrer le
 * journal, sous la MÊME forme que la vraie navigation de section, et doublait
 * la chip « type » déjà proposée par la barre d'outils.
 *
 * Un lien partagé avant ce retrait (`?category=analysis`) doit continuer à
 * filtrer ET à se voir — sans quoi la liste serait filtrée sans que rien à
 * l'écran ne l'explique. `buildActiveFilters` relit désormais `category`
 * comme la chip « type » quand c'est une vraie catégorie.
 */
describe('journal d’activité — un lien `?category=` hérité se lit comme la chip « type »', () => {
  it('une catégorie réelle devient une chip « type » active', () => {
    expect(buildActiveFilters({ category: 'analysis' })).toEqual([{ id: 'type', value: 'analysis' }])
  })

  it('les onglets transversaux (`all`, `since`) ne deviennent jamais une chip', () => {
    expect(buildActiveFilters({ category: 'all' })).toEqual([])
    expect(buildActiveFilters({ category: 'since' })).toEqual([])
  })

  it('une chip « type » explicite prime sur un `category` hérité', () => {
    expect(buildActiveFilters({ category: 'analysis', type: 'message' })).toEqual([{ id: 'type', value: 'message' }])
  })
})
