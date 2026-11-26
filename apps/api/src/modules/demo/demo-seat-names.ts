/**
 * Noms FICTIFS des sièges de cadres de la démonstration (décision Louis 01/11/2026 : « affiche-les » —
 * renverse le choix d'anonymat des `roleSeat`, qui s'affichaient « Rôle à identifier » faute de nom).
 *
 * ⚠️ Ces noms sont INVENTÉS pour une salle de démonstration : prénom + nom français plausibles,
 * volontairement hors de tout dirigeant connu de Société Générale, de SNCF ou de Keolis (ni mandataire
 * social du registre, ni cadre cité dans la presse). Ils ne portent aucune coordonnée ni aucun profil :
 * `contactDisplayIdentity` (web) lit « nom ≠ intitulé » comme une identité tenue et affiche le nom, le
 * poste en dessous, une seule fois.
 *
 * Une clé = l'INTITULÉ du siège (`roleSeat({ title })`). Les références par nom (organigramme, relances,
 * missions, tâches) passent par {@link seatName} : renommer ici renomme partout, un seul endroit (GA-26).
 * Un intitulé inconnu lève : jamais un nom deviné, jamais un renvoi silencieux à l'intitulé.
 */
const DEMO_SEAT_NAMES = {
  // Société Générale
  'Directeur des systèmes d’information — filiale de services de paiement': 'Antoine Vasseur',
  'Responsable data & intelligence artificielle de business unit': 'Inès Marchand',
  'Responsable sécurité applicative': 'Julien Brossard',
  'Responsable achats informatiques': 'Sophie Delacroix',
  'Directeur des systèmes d’information groupe': 'Thibault Marquet',
  'Architecte du système d’information groupe': 'Hélène Rochefort',
  'Responsable de la plateforme de données': 'Mathieu Lacombe',
  // SNCF
  'Directeur technique — entité numérique voyageurs': 'Romain Castaing',
  'Responsable data et innovation — direction du numérique': 'Laure Pellerin',
  'Responsable de programme de refonte applicative': 'Nadia Fournier',
  'Responsable de la sécurité des systèmes d’information': 'Olivier Tessier',
  'Responsable des infrastructures numériques': 'Benoît Chaumet',
  'Directeur du numérique du groupe': 'Valérie Montclar',
  'Responsable de l’exploitation des systèmes temps réel': 'Sébastien Aubrac',
  'Responsable des achats de prestations informatiques': 'Florence Armand',
  'Responsable des systèmes d’information d’une filiale de transport': 'Nicolas Garnier',
} as const

export type DemoSeatTitle = keyof typeof DEMO_SEAT_NAMES

/** Le nom fictif du siège `title`. Intitulé inconnu ⇒ erreur (jamais un nom inventé au vol). */
export function seatName(title: DemoSeatTitle): string {
  return DEMO_SEAT_NAMES[title]
}

/** Le nom fictif d'un siège si l'intitulé en a un, sinon `null` (siège agrégé : famille métier sans personne). */
export function seatNameOrNull(title: string): string | null {
  return Object.prototype.hasOwnProperty.call(DEMO_SEAT_NAMES, title) ? DEMO_SEAT_NAMES[title as DemoSeatTitle] : null
}

export const DEMO_SEAT_TITLES = Object.keys(DEMO_SEAT_NAMES) as DemoSeatTitle[]
