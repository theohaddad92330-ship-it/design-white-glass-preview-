import type { BackofficeAccessEntry, BackofficeAccessEvent } from '@bellum/contracts'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm'
import { BackofficeAccessEventEntity } from '../../database/entities/backoffice-access-event.entity'
import { auditEntryForAccess } from './access-event-audit'
import { AuditJournalService } from './audit-journal.service'

/**
 * Le journal d'accès du back-office — écriture et lecture (#1671.2).
 *
 * ⚠️ POURQUOI L'ÉCRITURE EST « AU MIEUX » (best-effort), ET C'EST DÉLIBÉRÉ.
 * Ce journal est une TRACE, pas une porte. Si sa table est indisponible, la
 * bonne réponse est qu'un opérateur puisse quand même se connecter — pas que
 * toute la console se ferme parce qu'un `INSERT` a échoué. C'est l'inverse du
 * journal d'incarnation, où la ligne d'audit est commise AVANT que le jeton ne
 * soit rendu : là, la trace conditionne le geste ; ici elle l'accompagne.
 *
 * L'échec n'est pas silencieux pour autant : il part dans `logger.error`, donc
 * dans Sentry. Une trace qu'on perd doit se voir.
 */
@Injectable()
export class BackofficeAccessJournalService {
  private readonly logger = new Logger(BackofficeAccessJournalService.name)

  constructor(
    @InjectRepository(BackofficeAccessEventEntity)
    private readonly events: Repository<BackofficeAccessEventEntity>,
    /**
     * ⚠️ LE MIROIR VERS LE JOURNAL UNIQUE (#1666), ET IL EST OPTIONNEL.
     *
     * Optionnel pour la règle n°7 du dépôt : retirer `AuditJournalModule` ne
     * doit pas casser le journal d'accès, qui retombe alors exactement sur son
     * comportement d'avant. Il est bel et bien CÂBLÉ en production —
     * `backoffice-access-journal.module.ts` importe le module, et le test
     * « le miroir est branché » de ce service le vérifie. Un `@Optional()` non
     * résolu ne lève pas : il dégrade en silence, et c'est le défaut qu'on
     * garde ici plutôt que de l'espérer.
     *
     * Même dossier `admin/`, donc AUCUN import cross-module : GA-07 ne bouge
     * pas d'un point (elle ne compte que les `../autre-module/…-service`).
     */
    @Optional() private readonly audit?: AuditJournalService,
  ) {}

  /** Enregistre une entrée. Ne jette jamais — voir le docblock de la classe. */
  async record(entry: BackofficeAccessEntry): Promise<void> {
    // Le miroir d'abord, et sans `await` bloquant l'un sur l'autre : les deux
    // écritures sont indépendantes, et `record` du journal d'audit ne jette
    // jamais non plus. Une trace perdue d'un côté ne doit pas emporter l'autre.
    await this.mirrorToAuditJournal(entry)

    try {
      await this.events.insert({
        event: entry.event,
        actor_email: entry.actorEmail ?? null,
        actor_role: entry.actorRole ?? null,
        reason: entry.reason ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        country: entry.country ?? null,
        target: entry.target ?? null,
      })
    } catch (error) {
      this.logger.error('Journal d’accès back-office : écriture perdue', {
        error,
        tags: { 'backoffice.op': 'access_journal_write' },
      })
    }
  }

  /**
   * Verse l'entrée dans le journal UNIQUE (#1666), quand il est là.
   *
   * ⚠️ Ne jette jamais, pour la même raison que `record` : une trace n'est pas
   * une porte. Et un miroir qui échoue ne doit pas non plus empêcher l'écriture
   * du journal d'accès, dont l'alerte de #1671.3 dépend.
   */
  private async mirrorToAuditJournal(entry: BackofficeAccessEntry): Promise<void> {
    if (!this.audit) return
    const mirrored = auditEntryForAccess(entry)
    // `null` ⇒ l'événement a son propre écrivain (voir `access-event-audit.ts`).
    if (!mirrored) return
    try {
      await this.audit.record(mirrored)
    } catch (error) {
      this.logger.error('Miroir vers le journal d’audit perdu — le journal d’accès, lui, est écrit', {
        error,
        tags: { 'backoffice.op': 'audit_journal_mirror' },
      })
    }
  }

  /**
   * Les N dernières entrées, les plus récentes d'abord.
   *
   * Plafonné : la page d'état de sécurité montre « les dernières connexions »,
   * pas douze mois d'historique. Un plafond haut sans borne finirait par sortir
   * la table entière le jour où quelqu'un passe `?limit=999999`.
   */
  async recent(limit = 50): Promise<BackofficeAccessEventEntity[]> {
    const borne = Math.min(Math.max(Math.floor(limit) || 0, 1), 200)
    return this.events.find({ order: { created_at: 'DESC' }, take: borne })
  }

  /**
   * Combien d'échecs pour cette adresse depuis `depuis` — la mesure de
   * l'alerte « plus de 3 échecs » (#1671.3).
   *
   * Comptée EN BASE et non en mémoire : le back-office tourne sur plusieurs
   * instances, et un compteur de processus repartirait de zéro à chaque
   * démarrage — donc n'alerterait jamais.
   */
  async countRecentFailures(actorEmail: string, depuis: Date): Promise<number> {
    return this.events.count({
      where: { actor_email: actorEmail, event: 'connexion_refusee', created_at: MoreThanOrEqual(depuis) },
    })
  }

  /**
   * Les pays d'où cette adresse s'est DÉJÀ connectée avec succès.
   *
   * ⚠️ Seules les connexions RÉUSSIES comptent. Compter les échecs ferait qu'une
   * première tentative depuis un pays inhabituel apprendrait ce pays à
   * l'historique et éteindrait l'alerte qu'elle aurait dû déclencher.
   *
   * ⚠️ `avant`, AJOUTÉ POUR #1671.3, ET C'EST UNE EXTENSION, PAS UNE RÉÉCRITURE.
   * Sans lui, le comportement est identique à l'octet près : « tous les pays
   * connus ». Avec lui, la question devient « connus AVANT cet instant » — ce
   * dont la détection d'un pays jamais vu a besoin, puisque
   * `knownCountries(actor)` tout seul inclurait la connexion qu'on est
   * justement en train de juger, et ne signalerait donc jamais rien.
   */
  async knownCountries(actorEmail: string, avant?: Date): Promise<string[]> {
    const requete = this.events
      .createQueryBuilder('e')
      .select('DISTINCT e.country', 'country')
      .where('e.actor_email = :actorEmail', { actorEmail })
      .andWhere('e.event = :event', { event: 'connexion' })
      .andWhere('e.country IS NOT NULL')
    if (avant) requete.andWhere('e.created_at < :avant', { avant })
    const lignes = await requete.getRawMany<{ country: string }>()
    return lignes.map(l => l.country)
  }

  /**
   * La plus ANCIENNE entrée encore dans le journal — #1671.4, panneau
   * « ce qui a été purgé et quand » de `/securite`.
   *
   * ⚠️ CE QUE CE CHIFFRE DIT, ET CE QU'IL NE DEVINE PAS. La fenêtre de
   * rétention (`RETENTION_DAYS_BACKOFFICE_ACCESS`, appliquée par
   * `PrivacyRetentionService.sweepBackofficeAccessJournal`) n'est pas relue ici
   * — ce service n'a pas accès à ce module (GA-07, aucun import service→service
   * hors dossier), et une seconde lecture du même réglage divergerait un jour de
   * la première (c'est le défaut que le docblock de `windowDays` dénonce
   * lui-même). Ce qu'on peut dire sans deviner, c'est ce qui est RÉELLEMENT
   * encore là : la plus ancienne ligne mesure, en creux, jusqu'où le dernier
   * passage de purge a coupé. `null` quand le journal est vide — jamais une date
   * inventée.
   */
  async oldestEntryAt(): Promise<Date | null> {
    const ligne = await this.events.createQueryBuilder('e').select('MIN(e.created_at)', 'min').getRawOne<{
      min: Date | string | null
    }>()
    const valeur = ligne?.min
    if (!valeur) return null
    const d = valeur instanceof Date ? valeur : new Date(valeur)
    return Number.isNaN(d.getTime()) ? null : d
  }

  /**
   * L'ÉTAT DE SÉCURITÉ — ce que `/securite` affiche (#1671.4), et l'ENDROIT où
   * les trois signaux de la détection d'accès anormal se BRANCHENT (#1671.3) :
   * une rafale d'échecs (`countRecentFailures`, qui existait déjà), un pays
   * jamais vu (`knownCountries`, idem), une connexion à une heure inhabituelle
   * (`estHeureInhabituelle`, écrite pour ce lot).
   *
   * ⚠️ ORCHESTRATION FINE, CALCUL PUR AILLEURS. Cette méthode ne fait que
   * FETCHER (la fenêtre d'événements, la plus ancienne entrée, les échecs
   * récents et les pays connus par acteur) puis délègue tout le calcul —
   * compteurs, anomalies, « mesuré ou non » — à `calculerEtatSecurite`, une
   * fonction PURE, testée séparément sans mock de base de données.
   *
   * ⚠️ ARRÊT VOLONTAIRE ICI. Cette méthode ne fait que calculer et RENDRE l'état
   * — elle n'envoie rien. Le dépôt classe tout envoi sortant réel (e-mail,
   * séquence, écriture chez un tiers) parmi les arrêts obligatoires ; le
   * déclencheur d'une alerte reste à trancher par Louis, et son point de
   * branchement est ICI, à la fin de cette méthode, sur `etat.anomalies`.
   */
  async etatSecurite(
    fenetreJours = FENETRE_SECURITE_JOURS_DEFAUT,
    maintenant: Date = new Date(),
  ): Promise<EtatSecurite> {
    const fenetre = Math.min(Math.max(Math.floor(fenetreJours) || 0, 1), 365)
    const depuis = new Date(maintenant.getTime() - fenetre * MS_PAR_JOUR)

    const evenements = await this.events.find({
      where: { created_at: MoreThanOrEqual(depuis) },
      order: { created_at: 'DESC' },
      take: LIMITE_EVENEMENTS_FENETRE,
    })

    const oldestEntryAt = await this.oldestEntryAt()

    // Rafale — un acteur distinct par échec récent, mesurée sur une fenêtre
    // COURTE (voir `FENETRE_RAFALE_MS`) : une rafale est un événement bref, pas
    // la moyenne du mois.
    const acteursEnEchec = [
      ...new Set(
        evenements
          .filter(
            (e): e is BackofficeAccessEventEntity & { actor_email: string } =>
              e.event === 'connexion_refusee' && e.actor_email !== null,
          )
          .map(e => e.actor_email),
      ),
    ]
    const depuisRafale = new Date(maintenant.getTime() - FENETRE_RAFALE_MS)
    const echecsRecents = new Map<string, number>()
    for (const acteur of acteursEnEchec) {
      echecsRecents.set(acteur, await this.countRecentFailures(acteur, depuisRafale))
    }

    // Pays — seulement la DERNIÈRE connexion réussie de chaque acteur : c'est
    // l'état ACTUEL qui intéresse une console de sécurité, pas l'historique
    // complet rejoué ligne par ligne.
    const derniereConnexionParActeur = new Map<string, BackofficeAccessEventEntity>()
    for (const e of evenements) {
      if (e.event !== 'connexion' || !e.actor_email) continue
      if (!derniereConnexionParActeur.has(e.actor_email)) derniereConnexionParActeur.set(e.actor_email, e)
    }
    const paysConnusAvant = new Map<string, string[]>()
    for (const [acteur, evenement] of derniereConnexionParActeur) {
      paysConnusAvant.set(acteur, await this.knownCountries(acteur, evenement.created_at))
    }

    return calculerEtatSecurite({
      evenements,
      oldestEntryAt,
      echecsRecents,
      paysConnusAvant,
      fenetreJours: fenetre,
      depuis,
      now: maintenant,
    })
  }

  /**
   * Purge les entrées plus vieilles que la fenêtre. Rend le nombre supprimé.
   *
   * Appelée par le balayage de rétention existant (04:17), et pas par un
   * planificateur à elle : le dépôt porte déjà 23 déclencheurs, et une heure de
   * plus à surveiller n'aurait rien apporté.
   */
  async purgeOlderThan(cutoff: Date): Promise<number> {
    const res = await this.events.delete({ created_at: LessThan(cutoff) })
    return res.affected ?? 0
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * #1671.3 — LA DÉTECTION D'ACCÈS ANORMAL, ET #1671.4 — L'ÉTAT DE SÉCURITÉ.
 *
 * Tout ce qui suit est PUR : aucune horloge lue, aucune requête. C'est ce qui
 * permet de tester les trois signaux (rafale d'échecs, pays jamais vu, heure
 * inhabituelle) sans mock de base de données — `etatSecurite()` ci-dessus fait
 * le FETCH, ce qui suit fait le CALCUL.
 * ───────────────────────────────────────────────────────────────────────── */

const MS_PAR_JOUR = 24 * 60 * 60 * 1000

/** La fenêtre par défaut de `/securite` : un mois d'activité. */
export const FENETRE_SECURITE_JOURS_DEFAUT = 30

/** Combien d'événements au maximum une fenêtre observe. Un plafond haut, pas un annuaire. */
const LIMITE_EVENEMENTS_FENETRE = 500

/** Combien d'entrées, au maximum, l'écran affiche — la liste « connexions récentes ». */
const LIMITE_ENTREES_AFFICHEES = 50

/**
 * « Plus de 3 échecs » — le mot exact du docblock de `countRecentFailures`.
 * 3 pile n'est pas une rafale ; 4 l'est.
 */
export const SEUIL_RAFALE_ECHECS = 3

/**
 * La fenêtre d'observation d'une RAFALE — volontairement courte (1 h), pas la
 * fenêtre entière du rapport. Une attaque par force brute se joue en minutes ;
 * la diluer sur 30 jours la rendrait invisible au milieu du bruit ordinaire.
 */
export const FENETRE_RAFALE_MS = 60 * 60 * 1000

/** Le fuseau de la détection. Railway rend en UTC ; l'heure qui compte est celle de Paris. */
const FUSEAU_SECURITE = 'Europe/Paris'

/** 1 h – 6 h, heure de Paris : la tranche nocturne que #1671.3 nomme. Borne haute EXCLUE. */
const HEURE_INHABITUELLE_DEBUT = 1
const HEURE_INHABITUELLE_FIN = 6

/** L'heure locale de Paris (0-23) d'un instant, DST compris. */
export function heureLocaleParis(date: Date): number {
  const brut = new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU_SECURITE, hour: 'numeric', hour12: false }).format(
    date,
  )
  const heure = Number(brut)
  return Number.isFinite(heure) ? heure % 24 : Number.NaN
}

/** `03:14` — l'heure de Paris d'un instant, lisible dans le détail d'une anomalie. */
function heureLisibleParis(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_SECURITE, hour: '2-digit', minute: '2-digit' }).format(
    date,
  )
}

/**
 * Le TROISIÈME signal de #1671.3 — celui qui n'existait pas avant ce lot. Les
 * deux premiers (`countRecentFailures`, `knownCountries`) étaient déjà calculés
 * et testés ; celui-ci s'écrit dans le même style : pur, et borné en dur sur une
 * tranche horaire nommée plutôt que devinée par un opérateur au clavier.
 */
export function estHeureInhabituelle(date: Date): boolean {
  const heure = heureLocaleParis(date)
  return heure >= HEURE_INHABITUELLE_DEBUT && heure < HEURE_INHABITUELLE_FIN
}

/** Une entrée du journal, telle que `calculerEtatSecurite` la lit. */
export type EvenementJournal = Pick<
  BackofficeAccessEventEntity,
  | 'id'
  | 'event'
  | 'actor_email'
  | 'actor_role'
  | 'reason'
  | 'detail'
  | 'ip'
  | 'user_agent'
  | 'country'
  | 'target'
  | 'created_at'
>

type TypeAnomalie = 'rafale_echecs' | 'pays_inhabituel' | 'heure_inhabituelle'

type Anomalie = {
  type: TypeAnomalie
  actorEmail: string
  /** ISO — l'instant de l'événement qui a déclenché le signal. */
  at: string
  /** Une phrase, pas une charge utile : ce qui s'est passé, en clair. */
  detail: string
}

type EtatSecurite = {
  /**
   * ⚠️ `false` quand la fenêtre est VIDE — jamais confondu avec « zéro
   * anomalie détectée ». Un journal sans événement n'a rien à comparer :
   * annoncer « 0 anomalie » suggérerait qu'on a regardé et rien trouvé, alors
   * qu'on n'a rien pu regarder du tout. Question qui tranche : si cette valeur
   * est absente, « 0 » est-il VRAI ?
   */
  mesure: boolean
  fenetreJours: number
  depuis: string
  measuredAt: string
  /** Combien d'événements dans la fenêtre, TOUS types confondus. */
  total: number
  parEvenement: Partial<Record<BackofficeAccessEvent, number>>
  acteursDistincts: number
  /** Les pays observés sur des CONNEXIONS RÉUSSIES dans la fenêtre — triés. */
  paysObserves: string[]
  /** `null` quand le journal est vide — jamais une date inventée. */
  oldestEntryAt: string | null
  anomalies: Anomalie[]
  /** Les entrées les plus récentes, bornées à `LIMITE_ENTREES_AFFICHEES`. */
  entries: EvenementJournal[]
}

/**
 * Assemble l'état de sécurité à partir de données DÉJÀ fetchées.
 *
 * ⚠️ `echecsRecents` et `paysConnusAvant` sont des cartes PRÉ-CALCULÉES par
 * `etatSecurite()` (une entrée par acteur concerné), pas un accès direct à la
 * base : c'est ce qui rend cette fonction testable sans mock.
 */
export function calculerEtatSecurite(params: {
  /** DESC par `created_at`, la fenêtre entière. */
  evenements: EvenementJournal[]
  oldestEntryAt: Date | null
  /** actorEmail → nombre d'échecs dans `FENETRE_RAFALE_MS`. */
  echecsRecents: Map<string, number>
  /** actorEmail → pays connus AVANT la dernière connexion réussie de cet acteur. */
  paysConnusAvant: Map<string, string[]>
  fenetreJours: number
  depuis: Date
  now: Date
}): EtatSecurite {
  const { evenements, oldestEntryAt, echecsRecents, paysConnusAvant, fenetreJours, depuis, now } = params

  const parEvenement: Partial<Record<BackofficeAccessEvent, number>> = {}
  const acteurs = new Set<string>()
  const pays = new Set<string>()
  for (const e of evenements) {
    parEvenement[e.event] = (parEvenement[e.event] ?? 0) + 1
    if (e.actor_email) acteurs.add(e.actor_email)
    if (e.event === 'connexion' && e.country) pays.add(e.country)
  }

  const anomalies: Anomalie[] = []

  // 1. Rafale d'échecs — un signalement par acteur, pas un par ligne de refus.
  const dejaSignales = new Set<string>()
  for (const e of evenements) {
    if (e.event !== 'connexion_refusee' || !e.actor_email || dejaSignales.has(e.actor_email)) continue
    const compte = echecsRecents.get(e.actor_email) ?? 0
    if (compte > SEUIL_RAFALE_ECHECS) {
      dejaSignales.add(e.actor_email)
      anomalies.push({
        type: 'rafale_echecs',
        actorEmail: e.actor_email,
        at: e.created_at.toISOString(),
        detail: `${compte} échecs en moins d’une heure`,
      })
    }
  }

  // 2. Pays jamais vu — sur la DERNIÈRE connexion réussie de chaque acteur.
  const derniereParActeur = new Map<string, EvenementJournal>()
  for (const e of evenements) {
    if (e.event !== 'connexion' || !e.actor_email) continue
    if (!derniereParActeur.has(e.actor_email)) derniereParActeur.set(e.actor_email, e)
  }
  for (const e of derniereParActeur.values()) {
    if (!e.country || !e.actor_email) continue
    const connus = paysConnusAvant.get(e.actor_email) ?? []
    // ⚠️ Aucune ligne de base connue ⇒ RIEN à signaler. Un premier accès n'a
    // pas de « pays habituel » à trahir — le signaler serait pénaliser
    // l'absence de mesure, pas une vraie anomalie.
    if (connus.length > 0 && !connus.includes(e.country)) {
      anomalies.push({
        type: 'pays_inhabituel',
        actorEmail: e.actor_email,
        at: e.created_at.toISOString(),
        detail: `Connexion depuis ${e.country} — jamais vu pour cette adresse (connu : ${connus.join(', ')})`,
      })
    }
  }

  // 3. Heure inhabituelle — chaque connexion réussie de la fenêtre, indépendamment.
  for (const e of evenements) {
    if (e.event !== 'connexion' || !e.actor_email) continue
    if (estHeureInhabituelle(e.created_at)) {
      anomalies.push({
        type: 'heure_inhabituelle',
        actorEmail: e.actor_email,
        at: e.created_at.toISOString(),
        detail: `Connexion à ${heureLisibleParis(e.created_at)} (heure de Paris)`,
      })
    }
  }

  anomalies.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  return {
    mesure: evenements.length > 0,
    fenetreJours,
    depuis: depuis.toISOString(),
    measuredAt: now.toISOString(),
    total: evenements.length,
    parEvenement,
    acteursDistincts: acteurs.size,
    paysObserves: [...pays].sort(),
    oldestEntryAt: oldestEntryAt ? oldestEntryAt.toISOString() : null,
    anomalies,
    entries: evenements.slice(0, LIMITE_ENTREES_AFFICHEES),
  }
}
