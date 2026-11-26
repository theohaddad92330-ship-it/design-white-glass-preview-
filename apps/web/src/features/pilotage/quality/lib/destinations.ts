/**
 * La destination d'une ligne de qualité, confrontée à l'arbre de routes RÉEL.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien » (PDF-13
 * §3.2). Les destinations sont décidées par le SERVEUR (`data-hygiene.service`
 * les émet ligne par ligne) et rendues par le navigateur — deux dépôts
 * logiques, deux déploiements séparés. Une garde côté API vérifie déjà que la
 * table des liens correspond à l'arbre de routes du web ; elle ne peut rien
 * dire du jour où le serveur est en avance sur le navigateur, ce qui arrive à
 * chaque livraison où l'API part la première.
 *
 * Ce jour-là, `<Link to="/pilotage/rex">` ne se plaint pas : il rend « Page
 * introuvable », ce qui est le bon comportement du routeur et le pire des
 * écrans. **Un lien mort est pire qu'une absence de lien** — il fait douter de
 * tout le reste de la liste.
 *
 * D'où la vérification au RENDU, destination par destination, contre les routes
 * que ce navigateur connaît vraiment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE REPLI, ET SA RAISON
 * ─────────────────────────────────────────────────────────────────────────
 * Un corpus VIDE ne veut pas dire « aucune route n'existe » : il veut dire que
 * la lecture a échoué. Faire disparaître les huit liens parce qu'on n'a pas su
 * lire la table des routes serait une régression qu'on s'inflige — le même
 * arbitrage que le plafond de proactivité, qui laisse PASSER quand son compteur
 * est illisible. On ne masque que ce qu'on sait absent.
 */

/** Le chemin nu : sans requête, sans ancre, sans barre finale. */
export function normalisePath(link: string): string {
  const withoutQuery = link.split(/[?#]/)[0] ?? ''
  if (withoutQuery === '/') return '/'
  return withoutQuery.replace(/\/+$/, '')
}

/**
 * Les chemins que ce navigateur sait ouvrir.
 *
 * `routesByPath` est la table que le routeur construit à partir de l'arbre
 * généré — c'est l'arbre RÉEL et non une copie tenue à la main, qui divergerait
 * au premier écran ajouté.
 */
export function knownDestinations(routesByPath: Readonly<Record<string, unknown>>): ReadonlySet<string> {
  const out = new Set<string>()
  for (const path of Object.keys(routesByPath)) {
    if (!path.startsWith('/')) continue
    out.add(normalisePath(path))
  }
  return out
}

/** Cette destination s'ouvre-t-elle ? Voir le repli documenté en tête de fichier. */
export function isReachable(link: string, known: ReadonlySet<string>): boolean {
  if (known.size === 0) return true
  return known.has(normalisePath(link))
}
