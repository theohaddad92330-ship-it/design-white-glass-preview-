import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DISCOVER_ALERT_EVENT_KINDS } from '@bellum/contracts'

/**
 * ARRÊT §10 — LE BALAYAGE DE DÉCOUVRIR NE LIT JAMAIS HORS DE SON ESPACE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les espaces de ce produit sont des ESN, donc des CONCURRENTS. Une requête de
 * balayage qui oublierait `workspace_id` ne planterait pas : elle rendrait les
 * lignes de tout le monde, et un commercial verrait apparaître dans son
 * « Aujourd'hui » le besoin confirmé d'une autre société. Rien, à l'écran, ne le
 * dirait — les lignes ont exactement la même forme.
 *
 * ⚠️ Et le second danger est le SQL construit par concaténation : une barrière
 * interpolée n'est pas une barrière. Toutes les requêtes du balayage passent
 * leurs valeurs en PARAMÈTRES liés (`$1`, `$2`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE D'ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 *  - elle LIT quelque chose : le fichier existe, et le nombre de requêtes
 *    trouvées est vérifié non nul (une garde dont le corpus se vide passe au
 *    vert pour toujours) ;
 *  - elle sait dire NON : retirer `workspace_id = $1` d'une requête, ou y écrire
 *    une valeur interpolée, la fait rougir (vérifié en cassant volontairement) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas : la requête qui LISTE les
 *    espaces à balayer n'a, par construction, pas de `workspace_id` — elle est
 *    nommée et exclue plutôt qu'attrapée par erreur.
 */

const SWEEPER = resolve(__dirname, '../modules/notifications/discover-alerts/discover-alert-event.sweeper.ts')
const SOURCE = readFileSync(SWEEPER, 'utf8')

/** Les blocs `sql: \`…\`` des producteurs — ceux qui lisent des objets métier. */
function producerQueries(source: string): string[] {
  return [...source.matchAll(/sql:\s*`([\s\S]*?)`/g)].map(match => match[1])
}

describe('ARRÊT §10 — le balayage des événements de Découvrir est cloisonné', () => {
  const queries = producerQueries(SOURCE)

  it('la garde lit bien quelque chose — un corpus vide passerait au vert pour toujours', () => {
    expect(SOURCE.length).toBeGreaterThan(1000)
    expect(queries.length).toBeGreaterThanOrEqual(5)
  })

  it('CHAQUE requête de producteur porte `workspace_id = $1`', () => {
    for (const query of queries) {
      expect(query).toContain('workspace_id = $1')
    }
  })

  it('aucune requête n’interpole une valeur — la barrière est un PARAMÈTRE LIÉ', () => {
    for (const query of queries) {
      // `${…}` dans un gabarit de requête : la valeur entre dans le texte SQL.
      expect(query).not.toMatch(/\$\{/)
    }
  })

  it('LE TÉMOIN — la requête qui liste les espaces n’est pas attrapée', () => {
    // Elle n'a pas de `workspace_id = $1`, et c'est normal : c'est elle qui
    // ÉNUMÈRE les espaces. Une garde qui l'exigerait partout serait
    // impossible à satisfaire, donc contournée.
    expect(SOURCE).toContain('SELECT DISTINCT workspace_id FROM saved_views')
    expect(producerQueries(SOURCE).join('\n')).not.toContain('SELECT DISTINCT workspace_id')
  })

  it('les sept genres du contrat ont tous un producteur nommé', () => {
    // Les deux que le balayage ne produit PAS sont nommés dans son en-tête :
    // ils naissent dans `WatchlistRefreshWorker`, qui compare l'avant et
    // l'après d'une ré-analyse. Un genre sans producteur serait une promesse.
    const worker = readFileSync(resolve(__dirname, '../modules/watchlist-refresh/watchlist-refresh.worker.ts'), 'utf8')
    const wired = `${SOURCE}\n${worker}`
    for (const kind of DISCOVER_ALERT_EVENT_KINDS) {
      expect(wired).toContain(`'${kind}'`)
    }
  })
})
