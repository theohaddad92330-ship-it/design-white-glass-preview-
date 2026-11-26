import type { ClientHealth, ClientRow } from '@/lib/client-health'

/**
 * Ce que l'écran « Clients » CALCULE, séparé de ce qu'il rend (#1652).
 *
 * Tout est pur : aucune horloge lue (l'ancre est un paramètre), aucune requête.
 * C'est ce qui permet de tester les seuls endroits où un mensonge pourrait
 * s'écrire — un « non mesuré » affiché « 0 », un espace sans score rangé comme
 * s'il valait zéro, un montant mal lu.
 */

/** Les paliers que l'éditeur en ligne sait proposer (cf. `PlanSelect`). */
const PLANS_EDITABLES = ['trial', 'starter', 'team', 'growth', 'beta'] as const

/** Local : le prédicat ci-dessous est le seul lecteur (knip). */
type PlanEditable = (typeof PLANS_EDITABLES)[number]

/**
 * Le palier est-il modifiable en ligne ?
 *
 * ⚠️ `PlanSelect` porte un catalogue FERMÉ. Lui passer une clé qui n'y est pas
 * afficherait un `<select>` dont la valeur courante n'est dans aucune option —
 * le navigateur retomberait alors silencieusement sur la PREMIÈRE, et l'écran
 * annoncerait un palier que le client n'a pas.
 */
export function estUnPlanEditable(plan: string | null): plan is PlanEditable {
  return plan !== null && (PLANS_EDITABLES as readonly string[]).includes(plan)
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Centimes → « 199 € ». `null` rend « — », JAMAIS « 0 € ». */
export function formaterEuros(cents: number | null | undefined): string {
  return cents == null ? '—' : EUROS.format(cents / 100)
}

/**
 * `part / total`, où chaque moitié peut manquer — « 2 / — », « — / 4 », « — ».
 *
 * ⚠️ La question à se poser est celle de la doctrine : *si cette valeur est
 * absente, « 0 » est-il VRAI ?* Pour « membres actifs » comme pour « crédits
 * consommés », non : on ne sait pas.
 */
export function formaterRapport(part: number | null, total: number | null): string {
  if (part == null && total == null) return '—'
  return `${part ?? '—'} / ${total ?? '—'}`
}

/** Le score, ou `null` quand il n'y en a pas. C'est la clé de tri. */
export function scoreDe(health: ClientHealth): number | null {
  return health.kind === 'score' ? health.score : null
}

/** Un espace en alerte de churn : score mesuré, et sous le seuil. */
export function estEnAlerte(health: ClientHealth): boolean {
  return health.kind === 'score' && health.churnRisk
}

/** Ce que la colonne Santé affiche, et sur quel ton. Local : c'est le retour de
 *  `libelleSante`, que les appelants lisent par inférence (knip). */
type LibelleSante = { texte: string; ton: 'alerte' | 'mesure' | 'absent'; aide: string }

export function libelleSante(health: ClientHealth): LibelleSante {
  if (health.kind === 'too_recent') {
    // #1946.21 — « Un espace neuf est "en amorçage", pas "mauvais" ». Le calcul
    // disait déjà la bonne chose (aucun score, ton neutre, rangé à part du
    // classement) ; c'est le MOT qui trahissait. « trop récent » se lit comme un
    // manque imputé au client, alors que l'absence de score est de NOTRE côté :
    // nos fenêtres de mesure sont plus longues que la vie de l'espace. Un
    // opérateur qui lit cette colonne pour décider qui rappeler ne doit pas
    // ranger un espace qui démarre parmi ceux qui vont mal.
    return {
      texte: 'en amorçage',
      ton: 'absent',
      aide: `Espace créé il y a ${health.ageDays} j — sous 14 jours, toutes nos fenêtres de mesure sont plus longues que l’espace lui-même. C’est un démarrage, pas un signal négatif.`,
    }
  }
  if (health.kind === 'not_enough_axes') {
    return {
      texte: 'non mesuré',
      ton: 'absent',
      aide: `${health.measured} axe${health.measured > 1 ? 's' : ''} mesuré${health.measured > 1 ? 's' : ''} sur 5 — il en faut 3 pour qu’un score veuille dire quelque chose.`,
    }
  }
  return {
    texte: String(health.score),
    ton: health.churnRisk ? 'alerte' : 'mesure',
    aide: `${health.score} / 100, sur ${health.measured} axe${health.measured > 1 ? 's' : ''} mesuré${health.measured > 1 ? 's' : ''} sur 5.`,
  }
}

/** Un axe rendu en pourcentage — ou son absence, NOMMÉE. */
export function formaterAxe(ratio: number | null): string {
  return ratio == null ? 'non évalué' : `${Math.round(ratio * 100)} %`
}

/**
 * Le TRI PAR DÉFAUT de #1652 : santé CROISSANTE, les problèmes en haut.
 *
 * ⚠️ Un espace SANS score ne vaut pas zéro : il ne se range donc pas devant le
 * client à 2/100 qu'on doit rappeler aujourd'hui. Il part à la fin, dans son
 * propre bloc, trié par nom pour rester stable d'un affichage à l'autre.
 */
export function trierParSanteCroissante(rows: readonly ClientRow[]): ClientRow[] {
  const avec = rows.filter(row => scoreDe(row.health) !== null)
  const sans = rows.filter(row => scoreDe(row.health) === null)
  const parNom = (a: ClientRow, b: ClientRow): number => a.name.localeCompare(b.name, 'fr')
  avec.sort((a, b) => (scoreDe(a.health) ?? 0) - (scoreDe(b.health) ?? 0) || parNom(a, b))
  sans.sort(parNom)
  return [...avec, ...sans]
}

/** Combien de lignes sont en alerte de churn — le chiffre de la file de décision. */
export function compterLesAlertes(rows: readonly ClientRow[]): number {
  return rows.filter(row => estEnAlerte(row.health)).length
}

/**
 * « il y a 3 j », « aujourd’hui », « — ».
 *
 * ⚠️ `maintenant` est un PARAMÈTRE. Un test qui lit l'horloge passe un jour et
 * tombe le lendemain, et une valeur calculée à l'hydratation différerait de
 * celle du serveur (les erreurs React #418/#423 déjà payées ici).
 */
export function depuisQuand(iso: string | null, maintenant: Date): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const jours = Math.floor((maintenant.getTime() - date.getTime()) / 86_400_000)
  if (jours < 0) return '—'
  if (jours === 0) return 'aujourd’hui'
  if (jours === 1) return 'hier'
  if (jours < 60) return `il y a ${jours} j`
  return `il y a ${Math.floor(jours / 30)} mois`
}

/** Comment ce client paie — jamais « gratuit » deviné d'une absence. */
export function libelleFacturation(row: ClientRow): string {
  const { billing } = row
  if (billing.mode === 'manual') {
    const montant = formaterEuros(billing.contractedCents)
    const periode = PERIODES[billing.period ?? ''] ?? null
    return periode && billing.contractedCents !== null ? `Sur facture · ${montant} ${periode}` : 'Sur facture'
  }
  if (billing.mode === 'stripe') return 'Abonnement'
  return '—'
}

const PERIODES: Record<string, string> = {
  monthly: '/ mois',
  quarterly: '/ trimestre',
  yearly: '/ an',
  one_off: 'une fois',
}
