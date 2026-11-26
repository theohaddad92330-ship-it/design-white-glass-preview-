import { dureeEcoulee } from '@/lib/dates'
import type { QueueJob, QueueOldestWaiting, QueueSummary, QueueUnknownReason } from '@/lib/queues'

/**
 * Ce que l'écran des files CALCULE, séparé de ce qu'il rend (#1662).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉCIDÉ ICI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · L'ANCIENNETÉ elle-même n'est pas décidée ici : elle vient de l'API, déjà
 *   sous forme d'union à trois états (`QueueOldestWaiting`). Ce module ne fait
 *   que la METTRE EN MOTS. Refaire le calcul à l'écran produirait une deuxième
 *   réponse à la même question, et les deux divergeraient.
 * · Le SEUIL de « job bloqué » n'est pas ici NON PLUS, et c'est délibéré. La
 *   règle « un job bloqué depuis plus d'une heure remonte dans la file de
 *   décision » appartient à la file de décision (#1647), qui porte la nature
 *   `queue_stuck` et son seuil. Un écran qui re-déciderait « à partir de quand
 *   c'est grave » ferait deux dérivations du même seuil, et elles se
 *   contrediraient le jour où l'une des deux bougerait. L'écran AFFICHE une
 *   ancienneté ; c'est la file de décision qui la QUALIFIE.
 * · Aucune horloge n'est lue ici. `dureeEcoulee` reçoit une DURÉE déjà mesurée
 *   par l'API, pas un instant à comparer à `Date.now()` — un composant qui
 *   lirait l'horloge rendrait deux textes différents (serveur puis hydratation)
 *   et React refuserait le second.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS ABSENCES QUI NE SE CONFONDENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Une file VIDE n'a pas de job le plus vieux — « aucun job en attente ».
 *     Elle n'a PAS « un job de 0 minute » : la seconde phrase se lit comme une
 *     file qui vient de commencer à s'accumuler, ce qui est l'inverse du vrai.
 *  2. Une file dont l'ancienneté est ILLISIBLE ne se résume pas non plus à un
 *     tiret muet : la raison est nommée, parce qu'une panne Redis et un
 *     désaccord entre deux lectures n'appellent pas le même geste.
 *  3. Une durée MESURÉE de moins d'une minute est une vraie mesure — « < 1 min »
 *     se dit, il n'est pas masqué.
 */

/** La langue de la console. Structurellement identique au `Lang` de `@/lib/i18n`. */
type Langue = 'fr' | 'en'

/** Le ton d'une file, qui accompagne TOUJOURS un mot — une couleur seule n'est
 *  pas une information, et un daltonien ne lit que le mot. */
export type TonFile = 'incident' | 'attente' | 'repos'

/** Ce que la mention d'ancienneté affiche. Local au module : les appelants le
 *  lisent par inférence sur le retour de `libelleAttente` (knip). */
type MentionAttente = {
  /** La phrase courte, toujours différente d'un état à l'autre. */
  texte: string
  /**
   * Le MÊME état, en un ou deux mots, pour la tuile de tête d'écran.
   *
   * ⚠️ Il n'y a qu'UNE dérivation : `valeur` et `texte` sortent d'ici ensemble.
   * Les calculer à deux endroits produirait deux réponses à la même question —
   * et c'est exactement ainsi qu'un écran finit par annoncer « 0 min » à un
   * endroit et « aucun job » à l'autre, sur la même file.
   */
  valeur: string
  /** `repos` (rien n'attend) · `inconnu` (on ne sait pas) · `mesure` (un chiffre). */
  ton: 'repos' | 'inconnu' | 'mesure'
  /** Pour un état inconnu : POURQUOI. Absent partout ailleurs. */
  detail?: string
}

/**
 * Les quatre raisons pour lesquelles une ancienneté peut manquer, en clair.
 *
 * ⚠️ Elles viennent d'un vocabulaire FERMÉ décidé par l'API : le message
 * d'exception, lui, ne quitte jamais le serveur (une erreur Redis porte l'URL
 * de connexion, donc le mot de passe). Ce qui arrive ici est une clé, et une
 * clé se traduit.
 */
const RAISONS: Record<QueueUnknownReason, Record<Langue, string>> = {
  'lecture-impossible': {
    fr: 'la file n’a pas répondu — Redis ou réseau',
    en: 'the queue did not answer — Redis or network',
  },
  'comptes-et-file-divergent': {
    fr: 'des jobs sont comptés en attente, mais aucun n’a pu être lu',
    en: 'jobs are counted as waiting, yet none could be read',
  },
  'horodatage-illisible': {
    fr: 'le job existe, son instant d’ajout n’est pas exploitable',
    en: 'the job exists, its enqueue timestamp is not usable',
  },
  'profondeur-illisible': {
    fr: 'la profondeur de la file n’a pas été rendue',
    en: 'the queue depth was not reported',
  },
}

const MOTS: Record<Langue, { vide: string; videCourt: string; inconnu: string; inconnuCourt: string; depuis: string }> =
  {
    fr: {
      vide: 'aucun job en attente',
      videCourt: 'aucun',
      inconnu: 'ancienneté inconnue',
      inconnuCourt: 'inconnue',
      depuis: 'en attente depuis',
    },
    en: {
      vide: 'nothing waiting',
      videCourt: 'none',
      inconnu: 'age unknown',
      inconnuCourt: 'unknown',
      depuis: 'waiting for',
    },
  }

/**
 * L'ancienneté du job le plus vieux, MISE EN MOTS.
 *
 * C'est la seule fonction de ce module qui répond à la demande de l'issue, et
 * la seule où un « 0 » pourrait s'écrire à la place d'une absence. Elle est
 * donc écrite pour que ce soit IMPOSSIBLE : l'entrée est une union, les trois
 * branches sont exhaustives, et la branche `vide` n'a aucun nombre à sa
 * disposition — elle ne PEUT pas en afficher un.
 */
export function libelleAttente(attente: QueueOldestWaiting, langue: Langue): MentionAttente {
  const mots = MOTS[langue]
  if (attente.etat === 'vide') return { texte: mots.vide, valeur: mots.videCourt, ton: 'repos' }
  if (attente.etat === 'inconnu') {
    return {
      texte: mots.inconnu,
      valeur: mots.inconnuCourt,
      ton: 'inconnu',
      detail: RAISONS[attente.raison][langue],
    }
  }
  // ⚠️ `dureeEcoulee` est le formateur de durées de la console, à un seul
  // endroit (`lib/dates.ts`). Il reçoit ici une durée DÉJÀ mesurée par l'API,
  // jamais un instant : rien de ce module ne lit d'horloge.
  const duree = dureeEcoulee(attente.plusVieuxMs)
  return { texte: `${mots.depuis} ${duree}`, valeur: duree, ton: 'mesure' }
}

/**
 * La plus vieille attente TOUTES FILES CONFONDUES — le chiffre de tête d'écran.
 *
 * ⚠️ L'ORDRE DE PRÉCÉDENCE EST UNE DÉCISION, pas un hasard :
 *   mesure > inconnu > vide.
 * Une MESURE gagne parce qu'un fait connu vaut mieux qu'un doute : effacer
 * « 3 h d'attente » parce qu'une autre file est illisible retirerait de la
 * tête d'écran le seul chiffre qu'on ait. Un INCONNU gagne sur un VIDE parce
 * que résumer une panne par « rien n'attend » est exactement le mensonge que
 * l'issue interdit.
 *
 * Et zéro file n'est PAS « rien n'attend » : c'est qu'on n'a rien lu.
 */
export function laPlusVieilleAttente(files: readonly QueueSummary[]): QueueOldestWaiting {
  if (files.length === 0) return { etat: 'inconnu', raison: 'lecture-impossible' }

  let plusVieuxMs: number | null = null
  let inconnue: QueueUnknownReason | null = null

  for (const f of files) {
    if (f.oldestWaiting.etat === 'mesure') {
      const candidat = f.oldestWaiting.plusVieuxMs
      if (plusVieuxMs === null || candidat > plusVieuxMs) plusVieuxMs = candidat
    } else if (f.oldestWaiting.etat === 'inconnu' && inconnue === null) {
      inconnue = f.oldestWaiting.raison
    }
  }

  if (plusVieuxMs !== null) return { etat: 'mesure', plusVieuxMs }
  if (inconnue !== null) return { etat: 'inconnu', raison: inconnue }
  return { etat: 'vide' }
}

/** Les compteurs de tête d'écran. Local : le retour se lit par inférence (knip). */
type TotauxFiles = {
  enAttente: number
  enEchec: number
  actifs: number
  differes: number
  /** Combien de files n'ont pas su dire depuis quand elles attendent. */
  filesInconnues: number
  files: number
}

/**
 * Les profondeurs additionnées.
 *
 * ⚠️ Ici, zéro EST vrai — et c'est la nuance que la doctrine demande de
 * vérifier à chaque fois. « Si cette valeur est absente, 0 est-il VRAI ? » :
 * pour un COMPTE de jobs dans une file qu'on a lue, oui. Ce qui n'est pas
 * mesurable, c'est l'ANCIENNETÉ — et elle n'est pas dans ces totaux, elle est
 * comptée à part (`filesInconnues`).
 */
export function totauxDesFiles(files: readonly QueueSummary[]): TotauxFiles {
  return files.reduce<TotauxFiles>(
    (total, f) => ({
      enAttente: total.enAttente + f.waiting,
      enEchec: total.enEchec + f.failed,
      actifs: total.actifs + f.active,
      differes: total.differes + f.delayed,
      filesInconnues: total.filesInconnues + (f.oldestWaiting.etat === 'inconnu' ? 1 : 0),
      files: total.files + 1,
    }),
    { enAttente: 0, enEchec: 0, actifs: 0, differes: 0, filesInconnues: 0, files: 0 },
  )
}

/**
 * L'état d'une file en un mot.
 *
 * Une ancienneté INCONNUE compte comme un incident : c'est une file dont on ne
 * sait pas si elle est bloquée, et l'ignorer la rendrait indiscernable d'une
 * file au repos — la confusion exacte que #1662 demande de retirer.
 */
export function tonDeLaFile(file: QueueSummary): TonFile {
  if (file.failed > 0 || file.oldestWaiting.etat === 'inconnu') return 'incident'
  if (file.waiting > 0 || file.active > 0 || file.delayed > 0) return 'attente'
  return 'repos'
}

/**
 * LA CONFIRMATION D'UNE PURGE — elle NOMME la conséquence.
 *
 * « Êtes-vous sûr ? » ne dit ni combien de jobs partent, ni lesquels, ni que
 * rien ne les rattrape. Devant une file de 400 échecs, c'est la différence
 * entre un geste de ménage et la perte de la seule trace d'un incident.
 *
 * `etatLibelle` est passé par l'appelant, qui le tient du dictionnaire i18n :
 * un libellé d'état vit à UN seul endroit (loi 1 du tome 7), et le recopier ici
 * en ferait un second qui divergerait au premier renommage.
 */
export function confirmationDePurge(
  entree: { file: string; etatLibelle: string; total: number },
  langue: Langue,
): string {
  const { file, etatLibelle, total } = entree
  const jobs = total > 1 ? 'jobs' : 'job'
  if (langue === 'en') {
    return [
      `Delete ${total} ${jobs} “${etatLibelle}” from the “${file}” queue?`,
      'They are removed from Redis: they will not be retried, and their failure reasons and stack traces are lost.',
      'This cannot be undone.',
    ].join(' ')
  }
  return [
    `Purger ${total} ${jobs} « ${etatLibelle} » de la file « ${file} » ?`,
    'Ils sont retirés de Redis : ils ne seront pas rejoués, et leurs raisons d’échec et traces de pile sont perdues.',
    'Action irréversible.',
  ].join(' ')
}

/**
 * LA CONFIRMATION D'UNE SUPPRESSION — le job est nommé, sa file aussi.
 *
 * ⚠️ Un job SANS identifiant ne se fait pas passer pour un job nommé : écrire
 * « supprimer le job null » serait pire que de dire qu'on ne sait pas lequel
 * c'est. BullMQ peut rendre un job sans `id`, et l'action, elle, ne partira
 * pas — l'écran ne propose pas de bouton dans ce cas.
 */
export function confirmationDeSuppression(entree: { file: string; job: QueueJob }, langue: Langue): string {
  const { file, job } = entree
  const identite = job.id ?? (langue === 'en' ? 'without an id' : 'sans identifiant')
  if (langue === 'en') {
    return [
      `Remove job ${identite} (${job.name}) from the “${file}” queue?`,
      'It leaves Redis: it will not run, and its failure reason and stack trace are lost.',
      'This cannot be undone.',
    ].join(' ')
  }
  return [
    `Supprimer le job ${identite} (${job.name}) de la file « ${file} » ?`,
    'Il quitte Redis : il ne sera pas exécuté, et sa raison d’échec et sa trace de pile sont perdues.',
    'Action irréversible.',
  ].join(' ')
}

/**
 * Une clé de la charge utile d'un job porte-t-elle une ADRESSE E-MAIL ?
 *
 * ⚠️ POURQUOI CETTE QUESTION SE POSE ICI. L'API rend `job.data` filtré par une
 * liste blanche stricte — rien d'arbitraire ne sort. Mais cette liste blanche
 * contient `to`, l'adresse du destinataire d'un e-mail (arbitrage D46 du
 * 28/08, écrit dans `admin-queues.service.ts` : l'adresse voyage ENTIÈRE parce
 * qu'elle est le seul moyen de rapprocher un job d'un envoi). L'écran, lui,
 * est une LISTE : #1670.4 y masque les adresses par défaut, révélées au clic,
 * et le clic est journalisé. Les deux décisions tiennent ensemble — l'API
 * transmet, l'écran masque, l'opérateur révèle quand il en a besoin.
 *
 * `emailType` est le CONTRE-EXEMPLE à connaître : le nom commence par « email »
 * et ne contient aucune adresse. Seul un nom qui FINIT par email/mail, ou la
 * clé `to` du mailer, en est une.
 */
export function estUneAdresse(cle: string): boolean {
  return cle === 'to' || /(e?mail)$/i.test(cle)
}
