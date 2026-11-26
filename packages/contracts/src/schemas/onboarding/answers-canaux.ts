import { z } from 'zod'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * Canaux d'entrée — issue #2048 (lot L19).
 *
 * Le questionnaire savait poser trois volumes (`weekly_calls`, `weekly_emails`,
 * `weekly_linkedin`) et un circuit de commercialisation (`go_to_market_channels`
 * — « direct, rang 2, partenaires » : par QUI l'affaire passe). Il ne savait pas
 * poser la question d'à côté, qui est celle de l'issue : **par quelle PORTE
 * l'affaire entre-t-elle**, et que sait-on de chaque porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUI COMMANDENT CE BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **« Non mesuré » n'est jamais « 0 », ni « non »** (#2048.21, GA-18/GA-19).
 *    Un canal dont on ignore les chiffres n'est pas un canal à zéro résultat :
 *    c'est un canal NON MESURÉ, et c'est un seau à part. {@link channelAuditBuckets}
 *    rend quatre seaux qui s'ADDITIONNENT jusqu'au catalogue — la forme exacte
 *    des quatre seaux de couverture (GA-259), pour la même raison : le
 *    complément de « mesuré » n'est pas « mauvais », il est hors de ce qu'on sait.
 * 2. **Visibilité et conversion ne se confondent pas** (#2048.20). Le temps
 *    passé sur un canal (`entry_channels_time_split`) et les démarrages qu'il a
 *    réellement produits (`entry_channels_last_starts`) sont DEUX mesures, deux
 *    questions, deux libellés. Aucune des deux n'est convertie en « chance »
 *    de quoi que ce soit — la doctrine « aucune probabilité affichée » vaut ici
 *    comme ailleurs.
 * 3. **Un réglage vit à UN seul endroit** (GA-26). Le volume d'un canal déjà
 *    posé ailleurs ne se repose pas : {@link EntryChannel.volumeAnswerKey}
 *    pointe la clé existante (#2048.14 — trois canaux sur quinze en ont une), et
 *    les douze autres alimentent le seau « non mesuré » plutôt qu'un zéro.
 *
 * ⚠️ Le catalogue de valeurs vit ici et **se cite** depuis `ESN_ANSWER_OPTIONS`
 * et depuis la sous-étape `lib/questions/canaux.ts` — il ne se recopie pas :
 * quatre questions portent le MÊME catalogue, quatre copies auraient divergé au
 * premier canal ajouté.
 *
 * ⚠️ Les valeurs sont persistées VERBATIM en français, comme tout le reste du
 * questionnaire (cf. l'en-tête de `lib/questions/types.ts`) : les localiser
 * casserait en silence les lecteurs qui font correspondre du texte français.
 *
 * ⚠️ Aucun canal ne porte le nom d'un éditeur : un réseau social professionnel
 * se nomme par sa CAPACITÉ, jamais par la plateforme (doctrine de nommage,
 * GA-44) — et aucun de ces canaux n'est un outil que l'espace branche.
 */

/** La clé de réponse qui porte DÉJÀ le volume hebdomadaire d'un canal. */
type ChannelVolumeAnswerKey = 'weekly_calls' | 'weekly_emails' | 'weekly_linkedin'

export type EntryChannel = {
  /** La valeur PERSISTÉE (français verbatim), et le libellé affiché. */
  value: string
  /**
   * #2048.14 — la clé de réponse qui porte déjà le volume de ce canal, `null`
   * quand aucune ne l'a jamais posé. Un `null` n'est pas un zéro : c'est ce qui
   * range le canal dans le seau « utilisé, non mesuré ».
   */
  volumeAnswerKey: ChannelVolumeAnswerKey | null
}

/**
 * Les quinze portes d'entrée : les onze de #2048.1 → #2048.11, plus les
 * quatre de #2044.2/.3/.5/.6 (#2044 nommait treize voies au total, mais
 * quatre d'entre elles n'étaient couvertes qu'en apparence — voir chaque
 * entrée ci-dessous).
 *
 * ⚠️ Un catalogue de valeurs persistées n'en perd jamais une et n'en insère
 * jamais au milieu (GA-08) : un canal nouveau s'ajoute EN FIN.
 */
export const ENTRY_CHANNELS: readonly EntryChannel[] = [
  // #2048.1 — le réseau personnel et les anciens clients. ⚠️ Même objet que la
  // « voie réseau » de #2044 : UN seul champ le porte (GA-26).
  { value: 'Réseau personnel et anciens clients', volumeAnswerKey: null },
  // #2048.2 / #2048.3 / #2048.4 — les trois canaux dont le volume est DÉJÀ
  // posé par le profil progressif. On les nomme ici pour que l'audit les voie,
  // on ne repose pas leur volume.
  { value: 'Appels sortants', volumeAnswerKey: 'weekly_calls' },
  { value: 'E-mails de prospection', volumeAnswerKey: 'weekly_emails' },
  { value: 'Réseaux sociaux professionnels', volumeAnswerKey: 'weekly_linkedin' },
  // #2048.5
  { value: 'Plateformes et places de marché', volumeAnswerKey: null },
  // #2048.6 — la RELATION partenaire est déjà posée (`partner_relationship`) ;
  // ce qui manquait est le canal lui-même dans la comparaison.
  { value: 'Partenaires et rang 2', volumeAnswerKey: null },
  // #2048.7
  { value: "Appels d'offres et consultations", volumeAnswerKey: null },
  // #2048.8
  { value: 'Contenu et marque personnelle', volumeAnswerKey: null },
  // #2048.9
  { value: 'Demandes entrantes', volumeAnswerKey: null },
  // #2048.10
  { value: 'Événements et salons', volumeAnswerKey: null },
  // #2048.11 — les consultants en mission, capteurs de besoins chez le client.
  { value: 'Consultants en mission', volumeAnswerKey: null },
  // #2044.2 — « anciens clients » était FONDU dans #2048.1 ('Réseau personnel
  // et anciens clients', ligne ci-dessus) et n'était pas sélectionnable seul.
  // ⚠️ Piège de données : on AJOUTE, on ne renomme pas — la valeur fusionnée
  // reste acceptée en LECTURE (des réponses existantes la portent déjà), et
  // cette voie distincte s'ajoute EN FIN plutôt que de la remplacer.
  { value: 'Anciens clients', volumeAnswerKey: null },
  // #2044.3 — absente des onze valeurs de #2048 : aucune porte ne nommait
  // spécifiquement les anciens collègues (un réseau de pairs, pas de clients).
  { value: 'Anciens collègues', volumeAnswerKey: null },
  // #2044.5 — absente : la recommandation (un tiers qui met en relation) n'a
  // jamais eu d'entrée dédiée, ni fondue ni distincte.
  { value: 'Recommandation', volumeAnswerKey: null },
  // #2044.6 — « prospection directe » n'était nommée nulle part telle quelle :
  // elle était couverte avec un biais par deux valeurs déjà spécifiques
  // ('Appels sortants', 'E-mails de prospection'), qui ne recouvrent pas la
  // prospection directe par d'autres canaux (courrier, visite, message direct
  // hors e-mail). On AJOUTE la voie générique plutôt que de fusionner sous une
  // des deux valeurs existantes, qui resteraient toutes deux sélectionnables.
  { value: 'Prospection directe', volumeAnswerKey: null },
]

/** Le catalogue de valeurs, à citer plutôt qu'à recopier (GA-26). */
export const ENTRY_CHANNEL_VALUES: readonly string[] = ENTRY_CHANNELS.map(channel => channel.value)

/**
 * Théo O onboarding-couverture (22/10) — la V23 ajoute trois valeurs à « canaux utilisés » SEULEMENT (les autres questions
 * de canaux gardent le catalogue ci-dessus). AJOUTÉES EN FIN (GA-08) ; « Aucun pour le moment » est une réponse, pas un vide.
 */
export const ENTRY_CHANNELS_USED_VALUES: readonly string[] = [
  ...ENTRY_CHANNEL_VALUES,
  'Événements professionnels',
  'Recommandations',
  'Aucun pour le moment',
]

/**
 * Quatre champs, tous ADDITIFS et tous facultatifs — le questionnaire ne bloque
 * jamais, et une question passée reste vide plutôt que devinée.
 *
 * Ils portent QUATRE facettes du même objet et partagent le même catalogue :
 * c'est ce qui fait la « structure par canal » que l'issue demande (#2048.12),
 * sans inventer un rendu de tableau que l'onboarding ne sait pas afficher.
 */
export const CANAUX_ANSWER_FIELDS = {
  // #2048.1/.5/.7/.8/.9/.10/.11/.12 — les canaux réellement utilisés. Un canal
  // non coché n'est « pas utilisé » que si la question a une réponse ; sans
  // réponse il est INCONNU (cf. `channelAuditBuckets`).
  entry_channels_used: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
  // #2048.14 → #2048.18 / #2048.21 — ceux dont l'utilisateur connaît les
  // chiffres (volume, réponses, rendez-vous, besoins, démarrages). Le reste
  // n'est pas à zéro : il est NON MESURÉ, et l'audit le dit avec ce mot.
  entry_channels_measured: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
  // #2048.18 / #2048.20 — les canaux qui ont produit les DERNIERS démarrages.
  // C'est la conversion OBSERVÉE, jamais une conversion calculée ni une
  // « chance » : on note ce qui s'est produit, on ne prédit rien.
  entry_channels_last_starts: z.array(z.string()).optional(),
  // #2048.19 / #2048.20 — où part le temps. La visibilité d'un canal (le temps
  // qu'il coûte) et sa conversion (les démarrages qu'il rend) sont deux
  // réponses distinctes, et c'est tout l'intérêt de les poser séparément.
  entry_channels_time_split: z.array(z.string()).optional(),
  // #2048.13 — pour quels canaux la PÉRIODE des chiffres est-elle connue. Un
  // volume sans fenêtre de temps attachée est un ordre de grandeur, pas une
  // mesure comparable (même principe que `activity_reference_period` côté
  // #2049, mais ICI par canal — un canal peut avoir des chiffres frais quand
  // un autre ne les tient plus que "depuis toujours"). Absence = question non
  // répondue, jamais "période inconnue" écrite à la place de l'utilisateur.
  entry_channels_period: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
}

/**
 * Ce que l'audit lit — structurel, jamais `EsnAnswers` : ce bloc est importé
 * PAR `../onboarding.ts`, donc importer `EsnAnswers` d'ici ferait un cycle
 * d'initialisation de module (la raison déjà écrite en tête de `limits.ts`).
 * `EsnAnswers` reste assignable à cette forme.
 */
export type ChannelAuditInput = {
  entry_channels_used?: readonly string[] | null
  entry_channels_measured?: readonly string[] | null
  weekly_calls?: string | null
  weekly_emails?: string | null
  weekly_linkedin?: string | null
}

/**
 * #2048.20 / #2048.21 — les quatre seaux de l'audit des canaux.
 *
 * Ils s'ADDITIONNENT jusqu'au catalogue : chaque canal est dans un seau et un
 * seul. C'est ce qui empêche la lecture fausse — « il n'utilise pas ce
 * canal » — d'un canal dont on n'a simplement rien demandé.
 */
export type ChannelAuditBuckets = {
  /** Utilisé, et ses chiffres existent (déclarés, ou déjà posés ailleurs). */
  measured: string[]
  /** Utilisé, chiffres INCONNUS. Le troisième seau — jamais un zéro. */
  usedNotMeasured: string[]
  /** L'utilisateur a répondu, et n'a pas retenu ce canal. */
  notUsed: string[]
  /** La question n'a pas de réponse : on ne sait rien, ni oui ni non. */
  unanswered: string[]
}

const isFilled = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim().length > 0

/** Le volume déjà posé pour ce canal, s'il en existe un et qu'il est rempli. */
function hasExistingVolume(channel: EntryChannel, input: ChannelAuditInput): boolean {
  if (channel.volumeAnswerKey === null) return false
  return isFilled(input[channel.volumeAnswerKey])
}

export function channelAuditBuckets(input: ChannelAuditInput): ChannelAuditBuckets {
  const buckets: ChannelAuditBuckets = { measured: [], usedNotMeasured: [], notUsed: [], unanswered: [] }
  const used = input.entry_channels_used ?? []
  // #2048.21 — sans réponse, TOUT est inconnu. Ranger le catalogue dans
  // « pas utilisé » ferait dire au silence ce qu'il ne dit pas.
  if (used.length === 0) {
    buckets.unanswered.push(...ENTRY_CHANNEL_VALUES)
    return buckets
  }
  const usedSet = new Set(used)
  const measuredSet = new Set(input.entry_channels_measured ?? [])
  for (const channel of ENTRY_CHANNELS) {
    if (!usedSet.has(channel.value)) {
      buckets.notUsed.push(channel.value)
      continue
    }
    // #2048.14 / GA-26 — un volume déjà posé ailleurs compte comme mesuré :
    // le redemander ferait deux endroits pour le même réglage.
    if (measuredSet.has(channel.value) || hasExistingVolume(channel, input)) {
      buckets.measured.push(channel.value)
      continue
    }
    buckets.usedNotMeasured.push(channel.value)
  }
  return buckets
}
