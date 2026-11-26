import {
  Banknote,
  Building2,
  ClipboardList,
  Cpu,
  ExternalLink,
  Handshake,
  type LucideIcon,
  Network,
  PiggyBank,
  RefreshCw,
  Rocket,
  Scale,
  Shuffle,
  TrendingUp,
  Truck,
  TriangleAlert,
  UserPlus,
  UserRound,
  UserRoundCheck,
  Zap,
} from 'lucide-react'

/**
 * #1416 — « afficher l'icône / le TYPE du signal ». Aujourd'hui l'icône est la
 * même quel que soit le type : elle décore, elle n'informe pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN NORMALISEUR ET PAS UN ENUM
 * ─────────────────────────────────────────────────────────────────────────────
 * `signal_preview.type` est un `z.string()`, pas une énumération, et ce n'est
 * pas un oubli : la valeur vient du MODÈLE. Le prompt `bellum_signals.py` lui
 * demande dix-huit types (`nomination | budget | projet | incident |
 * regulation | acquisition | partenariat | restructuration | recrutement |
 * transformation | demenagement | investissement | organisation |
 * levee_fonds | appel_offres | technologie | contact | recours_externe`), et
 * rien ne garantit qu'il n'écrira jamais « recrutements » au pluriel, « Budget »
 * avec une majuscule, ni un dix-neuvième mot. Fermer le champ côté contrat
 * aurait fait échouer la lecture d'un compte entier pour une lettre.
 *
 * Ce fichier fait donc l'inverse : il RECONNAÎT les dix-huit, et il a une
 * réponse pour tout le reste.
 *
 * #3206.6 (partiel, épopée #3240) — quatre de ces dix-huit étaient déjà émis
 * par le prompt sans icône propre (`transformation`, `demenagement`,
 * `investissement`, `organisation`) ; cinq viennent d'être ajoutés au contrat
 * de sortie (`levee_fonds`, `appel_offres`, `technologie`, `contact`,
 * `recours_externe`). Même discipline : reconnus par leur forme repliée,
 * jamais rangés dans un type voisin par approximation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'UN REPLI NE DOIT PAS FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un type inconnu ne se RANGE PAS dans le type le plus proche. Peindre un
 * signal non reconnu avec l'icône « incident » lui donnerait une urgence que
 * personne n'a mesurée — le même mensonge que le « 0 » d'une valeur absente.
 * Le repli est l'éclair NEUTRE, celui d'avant : il ne dit rien de plus que
 * « il y a un signal », ce qui est exactement ce qu'on sait.
 *
 * La comparaison est faite sur une forme repliée (minuscules, accents retirés)
 * pour que « Régulation » et « regulation » soient le même type. Elle n'est PAS
 * approximative pour autant : hors de cette normalisation, l'égalité est
 * stricte — un « recrutement massif » n'est pas rangé dans « recrutement », il
 * tombe dans le repli, parce que deviner sur une sous-chaîne rangerait
 * « fin de partenariat » dans « partenariat ».
 */
/* NON exporté : rien hors de ce fichier ne le NOMME — les appelants reçoivent
   le type par inférence sur `signalKindOf`. L'exporter ferait échouer
   `pnpm lint:exports:types` (knip refuse un type exporté sans consommateur). */
type SignalKind =
  | 'nomination'
  | 'budget'
  | 'projet'
  | 'incident'
  | 'regulation'
  | 'acquisition'
  | 'partenariat'
  | 'restructuration'
  | 'recrutement'
  | 'transformation'
  | 'demenagement'
  | 'investissement'
  | 'organisation'
  | 'levee_fonds'
  | 'appel_offres'
  | 'technologie'
  | 'contact'
  | 'recours_externe'

/** Les dix-huit types que le prompt demande au modèle, et leur icône. */
const KIND_ICON: Record<SignalKind, LucideIcon> = {
  nomination: UserRoundCheck,
  budget: Banknote,
  projet: Rocket,
  incident: TriangleAlert,
  regulation: Scale,
  acquisition: Building2,
  partenariat: Handshake,
  restructuration: Shuffle,
  recrutement: UserPlus,
  transformation: RefreshCw,
  demenagement: Truck,
  investissement: TrendingUp,
  organisation: Network,
  levee_fonds: PiggyBank,
  appel_offres: ClipboardList,
  technologie: Cpu,
  contact: UserRound,
  recours_externe: ExternalLink,
}

/**
 * Replie une valeur libre sur sa forme comparable : minuscules, accents
 * retirés, espaces de bord ôtés. `normalize('NFD')` + retrait des diacritiques
 * est la seule façon fiable de faire correspondre « Régulation » et
 * « regulation » sans écrire une table de variantes.
 */
function fold(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      // Les marques diacritiques combinantes (U+0300–U+036F), écrites en
      // échappements : les coller en caractères littéraux rend le fichier
      // dépendant de son propre encodage.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  )
}

/**
 * Le type reconnu, ou `null` quand la valeur n'est pas l'un des dix-huit.
 *
 * `null` est une réponse à part entière : il commande l'icône neutre, et il
 * dit à l'appelant qu'il n'a rien appris — jamais un type par défaut.
 */
export function signalKindOf(rawType: string | null | undefined): SignalKind | null {
  if (!rawType) return null
  const folded = fold(rawType)
  // ⚠️ `folded in KIND_ICON` aurait suffi… et aurait rendu VRAI pour
  // « toString » ou « constructor », qui vivent sur la chaîne de prototypes.
  // Un signal ainsi nommé n'arrivera peut-être jamais, mais la garde ne coûte
  // rien et l'inverse est indébogable.
  return Object.hasOwn(KIND_ICON, folded) ? (folded as SignalKind) : null
}

/**
 * L'icône du signal. Neutre (`Zap`) quand le type est absent ou non reconnu —
 * c'est celle que la colonne portait pour tout le monde jusqu'ici, donc le
 * repli ne dégrade rien.
 */
export function signalKindIcon(rawType: string | null | undefined): LucideIcon {
  const kind = signalKindOf(rawType)
  return kind ? KIND_ICON[kind] : Zap
}
