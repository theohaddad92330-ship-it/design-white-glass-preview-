import { describe, expect, it } from 'vitest'
import { mergeAddedColumns } from './column-preference'

/**
 * Une colonne AJOUTÉE atteint ceux qui ont déjà choisi leurs colonnes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, TROUVÉ EN PRODUCTION LE 04/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `/missions` a reçu une colonne « Prochaine action », inscrite dans les
 * colonnes par défaut, sous un commentaire qui dit exactement ce qu'il fallait
 * éviter : « une colonne d'action livrée MASQUÉE est exactement le défaut qu'on
 * répare ».
 *
 * Elle était invisible en production. Pas masquée par un bug d'affichage : le
 * choix de colonnes est une PRÉFÉRENCE PERSISTÉE, et une préférence enregistrée
 * avant que la colonne existe ne la contient pas. Le lecteur rendait la liste
 * stockée telle quelle, donc la colonne neuve n'atteignait **personne ayant
 * déjà ouvert l'écran** — c'est-à-dire tous les bêta-testeurs, exactement ceux
 * qui avaient demandé la fonctionnalité.
 *
 * Mesuré : le sélecteur de colonnes de `/missions` listait 11 colonnes, aucune
 * « Prochaine action », et les 8 cellules de risque du tableau ne portaient
 * aucun élément cliquable.
 *
 * ⚠️ Ce n'est pas propre aux missions : `usePaymentColumns` et
 * `useMissionTrackingColumns` ont la même forme, donc le même défaut en
 * attente. Cette primitive est partagée pour que la prochaine colonne ajoutée
 * n'ait pas à s'en souvenir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * On ne rétablit PAS les défauts : ce serait effacer un choix délibéré. On
 * n'ajoute que les colonnes apparues APRÈS l'enregistrement — celles que
 * l'utilisateur n'a jamais eu l'occasion de décocher. Une colonne qu'il a vue
 * et retirée reste retirée.
 */
describe('mergeAddedColumns — une colonne neuve atteint ceux qui ont déjà choisi', () => {
  const CATALOGUE = ['mission', 'account', 'status', 'nextAction', 'margin'] as const
  type Key = (typeof CATALOGUE)[number]

  it('ajoute la colonne apparue APRÈS l’enregistrement', () => {
    // L'utilisateur a choisi avant que `nextAction` existe : elle n'était donc
    // ni cochée ni décochée, elle n'existait pas.
    const stored: Key[] = ['mission', 'account', 'status']
    const merged = mergeAddedColumns(stored, ['nextAction'], CATALOGUE)
    expect(merged).toContain('nextAction')
  })

  it('respecte un choix DÉLIBÉRÉ de retirer une colonne connue', () => {
    // `margin` existait déjà quand il a choisi : son absence est un refus.
    const stored: Key[] = ['mission', 'account', 'status']
    const merged = mergeAddedColumns(stored, ['nextAction'], CATALOGUE)
    expect(merged).not.toContain('margin')
  })

  it('n’ajoute rien quand il n’y a rien de neuf', () => {
    const stored: Key[] = ['mission', 'status']
    expect(mergeAddedColumns(stored, [], CATALOGUE)).toEqual(['mission', 'status'])
  })

  it('rend l’ORDRE du catalogue, jamais celui des clics', () => {
    // Sans cela, deux utilisateurs ayant coché dans un ordre différent
    // verraient deux tableaux différents pour le même contenu.
    const stored: Key[] = ['margin', 'mission']
    expect(mergeAddedColumns(stored, ['nextAction'], CATALOGUE)).toEqual(['mission', 'nextAction', 'margin'])
  })

  it('ne duplique pas une colonne déjà choisie', () => {
    const stored: Key[] = ['mission', 'nextAction']
    const merged = mergeAddedColumns(stored, ['nextAction'], CATALOGUE)
    expect(merged.filter(k => k === 'nextAction')).toHaveLength(1)
  })

  it('ignore une clé ajoutée qui n’est pas au catalogue', () => {
    // Une clé retirée du produit ne doit pas réapparaître par cette porte.
    const stored: Key[] = ['mission']
    expect(mergeAddedColumns(stored, ['disparue' as Key], CATALOGUE)).toEqual(['mission'])
  })
})
