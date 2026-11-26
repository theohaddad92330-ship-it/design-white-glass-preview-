import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-122 — tout chemin qui atteint une personne consulte un verdict d'arrêt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE (T-169, mesuré le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `outcomeStopsMotion` — la fonction qui sait reconnaître un `do_not_call` —
 * **n'avait aucun appelant de production**. Elle n'existait que dans son fichier
 * et dans son propre test. Un refus était décrit dans le catalogue d'issues,
 * publié au front par `action-os.controller.ts`, et n'arrêtait rien.
 *
 * La garde qui existait déjà (`outreach/stop-conditions.spec.ts`) vérifiait la
 * SURFACE : qu'aucun schéma d'entrée, qu'aucune route n'accepte un drapeau qui
 * désarme une condition d'arrêt. C'est juste, et ce n'est pas suffisant :
 * personne n'a besoin de désarmer une protection qui n'est branchée nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI C'EST UNE ÉNUMÉRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui constate « un appel existe quelque part » protège la forme
 * qu'elle a vue, pas la règle. Celle-ci ÉNUMÈRE les chemins et exige de chacun
 * qu'il consulte une porte. Un chemin branché sur cinq laisse le défaut entier.
 *
 * **Les deux portes**, parce qu'un chemin connaît soit une personne, soit une
 * adresse, et que prétendre le contraire aurait produit une porte qui ne ferme
 * qu'à moitié :
 *  - porte PERSONNE — `ContactStopService` (`contact_stops`) ;
 *  - porte ADRESSE — `SuppressionService.isSuppressed` (`email_suppressions`).
 *
 * Poser un arrêt alimente les DEUX (voir `contact-stop.service.ts`) : c'est ce
 * qui fait qu'un `do_not_call` sur un contact qui a une adresse ferme aussi les
 * huit chemins d'envoi d'e-mail, sans qu'aucun d'eux n'ait à connaître les
 * `contact_stops`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FERME PAS, ET LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link UNCOVERED} porte les chemins ENCORE ouverts, chacun avec sa raison et
 * sa décision. Ce n'est pas une dispense : c'est la liste que quelqu'un doit
 * regarder. Un trou nommé se referme ; un trou tu se redécouvre en clientèle.
 * Le test qui la lit exige une raison non vide — on ne range rien ici en
 * silence.
 *
 * ⚠️ CE QU'ELLE NE PEUT PAS SAVOIR. Elle lit du TEXTE. « Le fichier mentionne la
 * porte » n'est pas « la porte est franchie sur CE chemin » ni « la branche est
 * atteignable ». C'est pourquoi les chemins réparés par ce lot portent en plus
 * un test de comportement (`outreach.service.spec.ts`, `contact-stop.service.spec.ts`).
 */

const MODULES = join(__dirname, '..', 'modules')

/** Ce qui, dans une source, prouve qu'une porte est consultée. */
const DOORS = {
  /** `contact_stops` — la personne. */
  person: ['ContactStopService', 'contactStops.verdict', 'contactStops.stoppedAmong'],
  /** `email_suppressions` — l'adresse. */
  address: ['isSuppressed', 'isSuppressedInBellum', 'contactableAttendees'],
} as const

type Door = keyof typeof DOORS

type SendPath = {
  /** Le fichier de production, relatif à `apps/api/src/modules`. */
  file: string
  /** Ce qu'il fait atteindre à une personne. */
  what: string
  /** La porte qu'il DOIT consulter. */
  door: Door
}

/**
 * Les chemins qui envoient, préparent ou recopient quelque chose VERS une
 * personne, et la porte que chacun consulte.
 *
 * Relevé exhaustif du 30/08/2026 sur `apps/api/src/modules/`.
 */
const SEND_PATHS: SendPath[] = [
  // ── Envoi réel d'e-mail ────────────────────────────────────────────────────
  // #4016 L4.1 — la sonde MX + SMTP d'une adresse ESTIMÉE (`RCPT TO` puis
  // `QUIT`, jamais `DATA` : aucun message ne part). Elle interroge le serveur
  // de messagerie d'une personne : l'opposition (`isSuppressed`) et l'arrêt
  // (`contact_stops`) sont lus AVANT la sonde (`email-estimate.service.spec.ts`).
  {
    file: 'contacts/email-estimate.service.ts',
    what: 'vérification MX + SMTP d’une adresse estimée, sans envoi',
    door: 'address',
  },
  {
    file: 'contacts/contacts.service.ts',
    what: 'envoi du brouillon (unitaire et en lot) + sendability',
    door: 'address',
  },
  {
    file: 'mailbox/mailbox.service.ts',
    what: "lot d'envoi et brouillons depuis la messagerie connectée",
    door: 'address',
  },
  {
    file: 'google/google.service.ts',
    what: 'envoi Gmail, brouillon Gmail, et invités d’un événement',
    door: 'address',
  },
  { file: 'microsoft/microsoft.service.ts', what: 'envoi Graph et invités d’un événement', door: 'address' },
  // ── Relance automatique ────────────────────────────────────────────────────
  { file: 'playbooks/playbook-send.sweeper.ts', what: 'balayage des relances automatiques', door: 'address' },
  {
    file: 'playbooks/playbooks.service.ts',
    what: 'décision, réservation et simulation d’une relance',
    door: 'address',
  },
  // ── Inscription dans un moteur d'envoi tiers ───────────────────────────────
  { file: 'crm/crm-depth.service.ts', what: 'inscription dans une séquence du CRM', door: 'address' },
  // ── Armement d'une cadence sur une PERSONNE ────────────────────────────────
  { file: 'outreach/outreach.service.ts', what: 'armement d’une séquence multi-touch datée', door: 'person' },
  // #2380.59 — proposer un appel atteint une personne comme armer une
  // séquence : ce chemin ne consultait AUCUNE porte avant ce lot.
  { file: 'outreach/outreach-message.service.ts', what: 'proposition d’une tâche d’appel', door: 'person' },
  // ── Recopie des coordonnées vers un outil qui appelle ──────────────────────
  {
    file: 'crm-sync/crm-sync.service.ts',
    what: 'poussée quotidienne de l’e-mail et du téléphone vers le CRM',
    door: 'person',
  },
  // ── Ce qui SERT une liste de personnes à relancer ──────────────────────────
  { file: 'contacts/contacts.service.ts', what: 'réseau dormant servi au copilote', door: 'address' },
  { file: 'notifications/weekly-digest.service.ts', what: 'digest hebdomadaire', door: 'address' },
  { file: 'notifications/daily-digest.service.ts', what: 'digest quotidien', door: 'address' },
  { file: 'notifications/notifications.scheduler.ts', what: 'rappels de relance', door: 'address' },
  // #4158.19 — l'e-mail INTERNE entre collègues (opt-in, faux par défaut) : il n'atteint jamais un
  // prospect, mais il consulte quand même la liste d'opposition de l'adresse du destinataire.
  {
    file: 'notifications/team/team-notifier.service.ts',
    what: 'e-mail interne à un collègue (assignation, délégation, mention, digest du manager), opt-in',
    door: 'address',
  },
  {
    file: 'notifications/discover-alerts/discover-alert.service.ts',
    what: 'alertes des recherches enregistrées de Découvrir (e-mail et SMS), 15/09/2026',
    door: 'address',
  },
  {
    file: 'changelog-newsletter/changelog-newsletter.service.ts',
    what: 'lettre d’information produit',
    door: 'address',
  },
]

/**
 * Les chemins ENCORE ouverts. Chacun avec sa raison — jamais une ligne muette.
 *
 * ⚠️ Ne JAMAIS y déplacer un chemin pour faire passer ce test : la personne au
 * bout, elle, recevra quand même le message.
 */
const UNCOVERED: { file: string; what: string; why: string }[] = [
  {
    file: 'crm/crm.service.ts',
    what: 'export manuel d’un contact vers HubSpot (et ses jumeaux Salesforce, Pipedrive, Attio)',
    why: "Un export est une RECOPIE demandée par un humain, pas un envoi — et l'arrêter demanderait de trancher ce qu'un opérateur doit voir de ses propres fiches après un refus. Le passage AUTOMATIQUE, lui, est fermé (`crm-sync`). Décision D350.",
  },
  {
    file: 'crm/crm-depth.service.ts',
    what: 'création de liste statique et upsert de masse dans le CRM',
    why: "Les identifiants manipulés sont ceux du CRM, pas les nôtres : on ne sait pas, sans un aller-retour par fiche, quelle personne de notre base ils désignent. Le rapprochement demande le chantier d'identité externe. Décision D350.",
  },
  {
    file: 'google/google.service.ts',
    what: 'export d’une grille de contacts vers Google Sheets',
    why: "Le service reçoit des lignes DÉJÀ assemblées par l'appelant et n'inspecte aucune colonne : filtrer ici supposerait de deviner laquelle porte une adresse. La porte est à poser chez l'appelant qui compose la grille. Décision D350.",
  },
  {
    file: 'public-api/public-api.service.ts',
    what: 'liste de contacts servie par clé d’API',
    why: "Une API de lecture rend l'état de la base à son propriétaire ; masquer une fiche sans le dire produirait un inventaire faux. Ce qui manque est un CHAMP « arrêté » dans la réponse, pas un filtre. Décision D352.",
  },
  {
    file: 'linkedin/linkedin.service.ts',
    what: 'relances de réseau professionnel proposées',
    why: "Le produit ne rend ici qu'un nom : aucune coordonnée ne sort, et aucun message ne part. La porte utile est celle du réseau professionnel lui-même, que le dépôt refuse d'automatiser. Décision D353.",
  },
  {
    file: 'briefing/briefing.service.ts',
    what: '#2770 (#2101.19/.21) — confirmSlotProposal crée un évènement d’agenda via AgendaService.createEvent',
    why: "L'appel passe `attendees: []`, une valeur LITTÉRALE jamais dérivée d'une fiche ou d'une adresse : c'est un blocage de temps sur le PROPRE agenda de l'utilisateur (inviteSelf: false), aucune personne externe n'est jamais invitée par ce chemin. Rien à arrêter puisque personne n'est atteint.",
  },
]

/**
 * Les chemins qui DÉLÈGUENT leur porte à un autre — et à qui.
 *
 * Un routeur qui transmet une liste d'invités au service d'agenda n'a pas à
 * refaire le contrôle : deux chemins qui refont une dérivation divergent. Ce
 * que la garde exige alors, c'est que la cible de la délégation soit
 * elle-même couverte — sinon « je délègue » devient l'endroit où le contrôle
 * disparaît, chacun croyant que l'autre le fait.
 */
const DELEGATES: { file: string; what: string; to: string[] }[] = [
  {
    file: 'manager/manager-digest.service.ts',
    what: '#4158.28 — digest hebdomadaire du manager (e-mail INTERNE, opt-in, jamais vers un prospect)',
    // Il ne contacte personne lui-même : dépôt dans l'app ET e-mail passent par `notifyManagerDigest`, qui
    // consulte la liste d'opposition de l'adresse du destinataire (intégration passe 2 — un seul chemin).
    to: ['notifications/team/team-notifier.service.ts'],
  },
  {
    file: 'action-router/action-router.service.ts',
    what: 'intent `create_calendar_event` — transmet la liste des invités',
    to: ['google/google.service.ts', 'microsoft/microsoft.service.ts'],
  },
  {
    file: 'action-os/copilot-card-catalog.ts',
    what: "G.1 — la carte `prepare_calendar_event` ne fait que COMPOSER l'intent `create_calendar_event` (invités compris)",
    // Elle n'écrit rien ni n'envoie rien : le clic passe par le routeur d'actions, qui délègue aux services d'agenda.
    to: ['google/google.service.ts', 'microsoft/microsoft.service.ts'],
  },
  {
    file: 'playbooks/playbook-targets.service.ts',
    what: 'résolution du destinataire unique par compte ou par projet',
    // Il RÉSOUT une adresse, il n'envoie rien. Son SQL exclut déjà le supprimé,
    // le masqué et l'anonymisé ; l'opt-out est consulté par ses deux appelants,
    // sur l'adresse qu'il vient de rendre. Le refaire ici serait une seconde
    // lecture de la même table, dans un `IN` sur toute la base d'un espace.
    to: ['playbooks/playbook-send.sweeper.ts', 'playbooks/playbooks.service.ts'],
  },
]

const ALL = new Set([...SEND_PATHS.map(p => p.file), ...UNCOVERED.map(p => p.file), ...DELEGATES.map(p => p.file)])

/**
 * Le corpus MÉCANIQUE : tout fichier de production qui porte l'une de ces
 * marques peut atteindre une personne.
 *
 * C'est ce qui empêche le registre ci-dessus de vieillir en silence. Un
 * nouveau chemin d'envoi porte forcément l'une des trois — il envoie par le
 * mailer sortant, il invite des participants, ou il consulte déjà une porte.
 */
const REACHES_A_PERSON = ['sendOutreachEmail', 'attendees', 'isSuppressed']

/**
 * Le balayage ignore trois choses, et chacune est une raison :
 *  - `*.module.ts` — la composition ne décide de rien ;
 *  - `dto/` — un DTO déclare une FORME, il ne transporte personne ;
 *  - `demo/` — le jeu de démonstration ne contient aucune personne réelle, et
 *    c'est précisément la promesse de la salle de démonstration.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'dto' || entry === 'demo') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    if (entry.endsWith('.module.ts')) continue
    out.push(full)
  }
  return out
}

describe('GA-122 — un refus arrête tout chemin qui atteint une personne', () => {
  it('le corpus n’est pas vide et chaque chemin déclaré a du contenu', () => {
    // Une garde qui ne LIT rien passe toujours.
    expect(SEND_PATHS.length).toBeGreaterThanOrEqual(10)
    expect(UNCOVERED.length).toBeGreaterThan(0)
    for (const file of ALL) {
      expect(readFileSync(join(MODULES, file), 'utf8').length).toBeGreaterThan(500)
    }
  })

  it('chaque chemin couvert consulte SA porte', () => {
    const offenders = SEND_PATHS.filter(path => {
      const source = readFileSync(join(MODULES, path.file), 'utf8')
      return !DOORS[path.door].some(marker => source.includes(marker))
    }).map(path => `${path.file} — ${path.what} — ne consulte pas la porte « ${path.door} »`)

    expect(offenders).toEqual([])
  })

  it('un chemin qui DÉLÈGUE délègue à un chemin couvert', () => {
    // « Je délègue » ne doit pas devenir l'endroit où le contrôle disparaît,
    // chacun croyant que l'autre le fait.
    const covered = new Set(SEND_PATHS.map(path => path.file))
    const offenders = DELEGATES.flatMap(path =>
      path.to.filter(target => !covered.has(target)).map(target => `${path.file} → ${target} (non couvert)`),
    )
    expect(offenders).toEqual([])
  })

  it('chaque chemin NON couvert porte une raison écrite', () => {
    // On ne range rien ici en silence. Une ligne sans raison est un oubli
    // déguisé en décision.
    const mute = UNCOVERED.filter(path => path.why.trim().length < 80).map(path => path.file)
    expect(mute).toEqual([])
  })

  it('aucun chemin qui atteint une personne n’échappe au registre', () => {
    const found = sourceFiles(MODULES).filter(file => {
      const source = readFileSync(file, 'utf8')
      return REACHES_A_PERSON.some(marker => source.includes(marker))
    })
    // Preuve de lecture : le balayage voit bien quelque chose.
    expect(found.length).toBeGreaterThan(10)

    const relative = found.map(file => file.slice(MODULES.length + 1))
    // Les fichiers hors registre sont listés NOMMÉMENT : c'est la seule façon
    // que le message d'échec dise quoi faire.
    const missing = relative.filter(file => !ALL.has(file) && !EXEMPT.has(file))
    expect(missing).toEqual([])
  })
})

/**
 * Ce que le balayage mécanique voit sans que ce soit un chemin d'envoi.
 *
 * Chaque entrée est une raison, pas une commodité : `attendees` y désigne une
 * réunion qu'on LIT, `isSuppressed` y est fourni ou transporté, jamais consulté
 * pour décider d'un envoi.
 */
const EXEMPT = new Set<string>([
  // #4016 L4.1 — déclare le TYPE du port d'opposition de l'e-mail estimé ; n'atteint personne.
  'contacts/module-tokens.ts',
  // La liste de suppression elle-même, et la porte qui l'alimente.
  'mailer/suppression.service.ts',
  'contact-stop/contact-stop.service.ts',
  // Le transport : il DIT qu'il ne vérifie pas, et que l'appelant le fait.
  'mailer/mailer.service.ts',
  // Clients bas niveau d'un fournisseur : ils composent une requête HTTP, ils
  // ne décident de rien. Leur seul appelant de production est le service au
  // dessus, qui porte la porte.
  'google/google.client.ts',
  'microsoft/microsoft.client.ts',
  'mailbox/google-mail.backend.ts',
  'mailbox/microsoft-mail.backend.ts',
  // LECTURES d'agenda : `attendees` y est une donnée relue sur un rendez-vous
  // qui existe déjà, jamais une liste d'invités qu'on constitue. Personne n'est
  // atteint par une lecture.
  'agenda/agenda-backend.ts',
  'agenda/google-agenda.backend.ts',
  'agenda/microsoft-agenda.backend.ts',
  // #2390.4/#2390.17 (épopée #2926) — rattache un rendez-vous à un compte en
  // comparant un DOMAINE : `attendee.email` y est relu pour une comparaison de
  // chaîne, jamais transporté ni utilisé pour écrire une adresse quelque part.
  // Aucun message ne part de ce fichier ; son seul appelant (`routine-
  // executors.ts`, déjà exempté) écrit une tâche INTERNE, jamais un envoi.
  'agenda/meeting-account-domain-match.ts',
  'activities/activity-capture.service.ts',
  'routines/routine-executors.ts',
  'routines/routine-catalog.ts',
  // #1913 — le catalogue des commandes de Laura rangées par moments : du TEXTE
  // (« Tomorrow’s meetings with their attendees… », le résultat attendu d'une
  // commande) et des métadonnées (moment, coût, données lues). Il n'envoie, ne
  // prépare ni ne recopie rien vers personne ; la commande qu'il décrit passe
  // par les outils, qui portent leurs propres portes.
  'ia-proxy/command-catalog.ts',
  // Des participants SAISIS dans un compte rendu ou un entretien : du texte
  // rapporté après coup, aucun message ne part.
  'meeting-notes/meeting-notes.service.ts',
  'consultants/submissions.service.ts',
  'ia/ia.client.ts',
  // `attendees: []` — un événement sans invité n'atteint personne.
  'delivery/delivery.controller.ts',
  // #2770 — `confirmSlotProposal` écrit un créneau proposé sur l'agenda
  // PERSONNEL de l'appelant (`attendees: []`, même motif que
  // `delivery.controller.ts` ci-dessus) : jamais une invitation envoyée au
  // contact du compte.
  'briefing/briefing.service.ts',
  // #2106.2 — le producteur de cartes de « Aujourd’hui » : aucun import de
  // service, aucun chemin d'écriture, `preparedArtifacts` ne porte qu'un
  // `href: null` sur les invités EXTERNES déjà lus d'un rendez-vous. Rien ne
  // part — c'est la promesse que `nothing-is-sent.spec.ts` garde déjà sur ce
  // même fichier.
  'briefing/briefing-actions.ts',
  // #4737 — le TRANSPORT LinkedIn (fournisseur établi) : il compose une requête HTTP
  // (`attendees_ids` est le nom du champ du fournisseur, pas une liste d'invités
  // constituée ici) et ne décide de rien. Son seul appelant de production est
  // `linkedin-mandate.service.ts`, qui porte la décision d'envoi (mandat, borne, réponse).
  'linkedin/linkedin-sender.ts',
])
