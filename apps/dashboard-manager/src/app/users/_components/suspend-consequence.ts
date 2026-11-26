import type { EspaceDeLigne } from '../users.logic'

/**
 * Ce que suspendre — ou réactiver — un compte FAIT, nommé (#1664).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DE L'ISSUE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Toute action destructive (suppression, suspension) demande une confirmation
 * qui NOMME la conséquence : "Supprimer Marc Dupont. Son espace reste, ses
 * actions restent attribuées à lui. Irréversible." »
 *
 * Ce n'est pas « êtes-vous sûr ? ». C'est la conséquence, écrite, avec ce qui
 * SURVIT et ce qui DISPARAÎT. La suppression avait déjà la sienne
 * (`delete-user-consequence.ts`, #1664.2) ; la suspension n'avait qu'un
 * `window.confirm('Suspendre ce compte ? Le user ne pourra plus se connecter.')`
 * — une question, une moitié de conséquence, et rien sur ce qui reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SUSPENSION FAIT VRAIMENT, ET POURQUOI C'EST LA MOITIÉ QUI COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AdminUsersService.suspendUser` pose un `ban_duration` de ~100 ans sur le
 * compte SUPABASE. Rien d'autre ne bouge : aucune de nos tables n'est touchée.
 * Donc l'espace reste, ses comptes et ses analyses restent, les autres membres
 * continuent de travailler — **y compris quand la personne suspendue en est la
 * PROPRIÉTAIRE**. C'est exactement l'inverse de la suppression, où le même rôle
 * emporte l'espace entier par cascade : la confusion entre les deux est le seul
 * vrai risque de cet écran, et c'est pour ça que la phrase le dit.
 *
 * La dérivation vit ICI, hors du composant, pour la même raison que sa jumelle :
 * l'environnement de test de cette application est `node` — ce qui se garde est
 * la LOGIQUE, ce qui se voit à l'écran se recette en direct.
 */

/** Une conséquence nommée : ce que le geste arrête, ce qu'il laisse debout.
 *  Local : c'est le retour de `decrireConsequenceSuspension`, que les appelants
 *  lisent par inférence (knip). */
type ConsequenceSuspension = {
  /** Le titre du panneau — le GESTE et sa cible, jamais « êtes-vous sûr ? ». */
  titre: string
  /** Ce que le geste ARRÊTE. */
  arrete: string[]
  /** Ce qui SURVIT — la moitié qu'une confirmation générique omet toujours. */
  survit: string[]
  /** Le mot qui distingue ce geste de la suppression. */
  reversibilite: string
}

/** « Skaizen », « Skaizen et Alterway », « Skaizen, Alterway et Neovance ». */
function joindreNoms(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? ''
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

export function decrireConsequenceSuspension(
  label: string,
  espaces: readonly EspaceDeLigne[],
  suspendu: boolean,
): ConsequenceSuspension {
  const possedes = espaces.filter(espace => espace.role === 'owner').map(espace => espace.name)
  const membres = espaces.filter(espace => espace.role !== 'owner').map(espace => espace.name)

  if (suspendu) {
    return {
      titre: `Réactiver ${label}.`,
      arrete: ['Le blocage de connexion est levé — la personne se reconnecte avec son mot de passe actuel.'],
      survit: ['Rien d’autre ne change : ni son offre, ni ses crédits, ni ses accès.'],
      reversibilite: 'Réversible — le compte peut être suspendu de nouveau à tout moment.',
    }
  }

  const survit = [
    // ⚠️ L'ordre compte : ce qui reste se lit AVANT le détail des espaces, parce
    // que c'est la phrase qui empêche de confondre ce geste avec la suppression.
    'Ses données restent : profil, offre, crédits, analyses déjà lancées.',
    'Ses actions restent attribuées à lui dans l’historique.',
  ]
  if (possedes.length > 0) {
    survit.push(
      `${joindreNoms(possedes)} — dont cette personne est propriétaire — continue${possedes.length > 1 ? 'nt' : ''} d’exister et de tourner pour ses membres. Contrairement à la SUPPRESSION, la suspension n’emporte aucun espace.`,
    )
  }
  if (membres.length > 0) {
    survit.push(`Son adhésion à ${joindreNoms(membres)} reste — elle ne peut simplement plus s’y connecter.`)
  }

  return {
    titre: `Suspendre ${label}.`,
    arrete: [
      'La personne ne peut plus se connecter, dès maintenant.',
      'Ses sessions ouvertes ne survivent pas au prochain rafraîchissement de jeton.',
    ],
    survit,
    reversibilite: 'Réversible — « Réactiver le compte » lève le blocage immédiatement.',
  }
}
