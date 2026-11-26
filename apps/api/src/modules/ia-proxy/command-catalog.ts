import type { CommandDefinition } from '@bellum/contracts'

/**
 * LE CATALOGUE DE COMMANDES (PDF 6 §9.2, ticket BEL-AUT-505).
 *
 * Il vit dans le CODE, comme le catalogue de routines et celui des chaînes, et
 * pour la même raison : une commande éditable sans revue est une phrase envoyée
 * au modèle que personne ne relit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI Y FIGURE, ET CE QUI N'Y FIGURE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le PDF annonce 285 requêtes. Ce catalogue en porte vingt-quatre — les vingt
 * du jeu de recette minimal (§9.2), plus quatre que les chantiers précédents
 * ont rendues possibles. La règle est celle du catalogue de routines : **n'y
 * figure que ce qu'un outil sait RÉELLEMENT servir.**
 *
 * Deux des vingt n'y sont pas, et c'est écrit plutôt que passé sous silence :
 *
 * - « Crée un rendez-vous mardi 15 h avec visio » — le copilote ne crée rien.
 *   L'écriture d'agenda passe par un clic de l'utilisateur sur un endpoint
 *   authentifié ; proposer la commande ferait promettre une création qui
 *   n'arrivera pas.
 * - « Analyse mon Q3 et propose un plan Q4 » — aucune maille trimestrielle
 *   n'existe. Une commande qui produirait un plan sans chiffres serait une
 *   invention, ce que le produit s'interdit.
 *
 * `requires` est presque toujours vide, et c'est le fait le plus utile de ce
 * fichier : la majorité de ce qu'un commercial demande porte sur les données de
 * Bellum et ne dépend d'AUCUN connecteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1913 — LE MOMENT ET LE RÉSULTAT ATTENDU
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque commande porte son `moment` métier — c'est le SEUL endroit où le
 * rangement de l'écran « Que puis-je demander ? » est décidé — et son `outcome`,
 * écrit d'après la description des outils qu'elle appelle
 * (`apps/ia/app/services/chat_tools.py`) : on n'y promet que ce que l'outil
 * rend. La donnée utilisée se DÉRIVE des outils (`commandReads`), et le coût se
 * lit dans la grille (`COMMAND_BILLED_ACTION`) : ni l'une ni l'autre ne
 * s'écrit ici.
 *
 * Aucune commande ne sert aujourd'hui le moment `find_contact` : l'écran ne
 * l'affiche pas, et on n'en invente pas une pour le remplir.
 */
export const COMMAND_CATALOG: readonly CommandDefinition[] = [
  /* ── Le brief du jour — en tête : c'est la première carte du premier moment ── */
  {
    key: 'daily_briefing',
    category: 'agenda',
    moment: 'start_day',
    label: { fr: 'Mon brief du jour', en: 'My daily brief' },
    prompt: { fr: 'Fais-moi le brief de ma journée.', en: 'Give me my brief for today.' },
    outcome: {
      fr: 'Tes rendez-vous à préparer, tes fils sans réponse, les réponses favorables et les comptes qui ont bougé. Une source non connectée est signalée comme telle.',
      en: 'Meetings to prepare, unanswered threads, positive replies and accounts that moved. A source that is not connected is flagged as such.',
    },
    tools: ['get_daily_briefing'],
    requires: [],
  },

  /* ── Messagerie ────────────────────────────────────────────────────────── */
  {
    key: 'mail_no_reply',
    category: 'mailbox',
    moment: 'follow_up',
    label: { fr: 'Qui ne m’a pas répondu', en: 'Who has not replied' },
    prompt: {
      fr: 'Quels fils sont sans réponse depuis 7 jours ? Prépare-moi une relance pour chacun.',
      en: 'Which threads have had no reply for 7 days? Prepare a follow-up for each.',
    },
    outcome: {
      fr: 'Les fils restés sans réponse depuis 7 jours, et un brouillon de relance pour chacun, à valider. Rien n’est envoyé.',
      en: 'Threads left unanswered for 7 days, and a follow-up draft for each, for you to approve. Nothing is sent.',
    },
    tools: ['search_mailbox', 'prepare_mail_draft'],
    requires: ['email'],
  },
  {
    key: 'mail_unread',
    category: 'mailbox',
    moment: 'start_day',
    label: { fr: 'Mes messages non lus', en: 'My unread messages' },
    prompt: {
      fr: 'Qu’est-ce que je n’ai pas encore lu, et qu’est-ce qui attend une réponse ?',
      en: 'What have I not read yet, and what is waiting for an answer?',
    },
    outcome: {
      fr: 'Tes fils non lus et ceux qui attendent une réponse, avec l’interlocuteur et la date du dernier message.',
      en: 'Your unread threads and those waiting for an answer, with the contact and the date of the last message.',
    },
    tools: ['search_mailbox'],
    requires: ['email'],
  },

  /* ── Agenda ────────────────────────────────────────────────────────────── */
  {
    key: 'agenda_tomorrow',
    category: 'agenda',
    moment: 'prepare_meeting',
    label: { fr: 'Préparer mes rendez-vous de demain', en: 'Prepare tomorrow’s meetings' },
    prompt: {
      fr: 'Prépare mes rendez-vous de demain : qui je vois, sur quoi, et ce que je dois savoir.',
      en: 'Prepare tomorrow’s meetings: who I am seeing, about what, and what I should know.',
    },
    outcome: {
      fr: 'Tes rendez-vous de demain avec leurs participants, et le point sur les comptes déjà analysés qu’ils concernent.',
      en: 'Tomorrow’s meetings with their attendees, and a brief on the already-analysed accounts involved.',
    },
    tools: ['prepare_day_brief', 'get_account_briefing'],
    requires: ['calendar'],
  },
  {
    // #2319.24 — le rendez-vous IMMINENT : le même chemin de lecture que
    // « demain », sur la journée d'aujourd'hui. Aucune écriture.
    key: 'meeting_imminent',
    category: 'agenda',
    moment: 'prepare_meeting',
    label: { fr: 'J’ai un rendez-vous dans trente minutes', en: 'I have a meeting in thirty minutes' },
    prompt: {
      fr: 'J’ai un rendez-vous dans trente minutes : prépare-moi l’essentiel à lire en cinq minutes.',
      en: 'I have a meeting in thirty minutes: give me the essentials to read in five minutes.',
    },
    outcome: {
      fr: 'Ton prochain rendez-vous d’aujourd’hui : qui tu vois, l’objectif, les questions à poser et ce qui reste à vérifier.',
      en: 'Your next meeting today: who you are seeing, the objective, the questions to ask and what is still to verify.',
    },
    tools: ['prepare_day_brief', 'get_account_briefing'],
    requires: ['calendar'],
  },
  {
    key: 'agenda_free_slots',
    category: 'agenda',
    moment: 'start_day',
    label: { fr: 'Mes créneaux libres', en: 'My free slots' },
    prompt: {
      fr: 'Quels créneaux d’une heure ai-je de libres cette semaine ?',
      en: 'Which one-hour slots do I have free this week?',
    },
    outcome: {
      fr: 'Les créneaux d’une heure libres dans ton agenda cette semaine, en heures ouvrées.',
      en: 'The free one-hour slots in your calendar this week, within working hours.',
    },
    tools: ['find_free_slots'],
    requires: ['calendar'],
  },

  /* ── Comptes ───────────────────────────────────────────────────────────── */
  {
    key: 'accounts_to_prioritise',
    category: 'accounts',
    moment: 'start_day',
    label: { fr: 'Quels comptes prioriser', en: 'Which accounts to prioritise' },
    prompt: {
      fr: 'Quels comptes dois-je prioriser cette semaine, et pourquoi ceux-là ?',
      en: 'Which accounts should I prioritise this week, and why those?',
    },
    outcome: {
      fr: 'Les comptes qui attendent une décision ou une action, chacun avec sa raison.',
      en: 'The accounts waiting for a decision or an action, each with its reason.',
    },
    tools: ['list_accounts_to_act'],
    requires: [],
  },
  {
    key: 'accounts_stalled',
    category: 'accounts',
    moment: 'follow_up',
    label: { fr: 'Comptes sans prochaine action', en: 'Accounts with no next step' },
    prompt: {
      fr: 'Quels comptes suivis n’ont plus rien qui bouge dessus ?',
      en: 'Which tracked accounts have had no activity?',
    },
    outcome: {
      fr: 'Les comptes suivis sur lesquels rien n’a bougé depuis un mois.',
      en: 'The tracked accounts where nothing has moved for a month.',
    },
    tools: ['list_accounts_to_act'],
    requires: [],
  },
  {
    key: 'account_briefing',
    category: 'accounts',
    moment: 'prepare_meeting',
    label: { fr: 'Le point sur un compte', en: 'Brief me on an account' },
    prompt: {
      fr: 'Fais-moi le point sur ce compte : où on en est, ce qui a bougé, ce que je fais ensuite.',
      en: 'Brief me on this account: where we stand, what changed, what I do next.',
    },
    outcome: {
      fr: 'Le score, le verdict, les douleurs principales et les prochaines actions d’un compte déjà analysé.',
      en: 'The score, verdict, main pain points and next actions of an account already analysed.',
    },
    tools: ['get_account_briefing'],
    requires: [],
  },
  {
    key: 'accounts_compare',
    category: 'accounts',
    moment: 'open_account',
    label: { fr: 'Comparer deux comptes', en: 'Compare two accounts' },
    prompt: {
      fr: 'Compare ces comptes : lequel mérite mon temps en premier ?',
      en: 'Compare these accounts: which deserves my time first?',
    },
    outcome: {
      fr: 'Une priorisation argumentée entre des comptes déjà analysés.',
      en: 'A reasoned priority order between accounts already analysed.',
    },
    tools: ['compare_accounts'],
    requires: [],
  },
  /**
   * #3246 (épopée #3210, lot E16) — l'épopée livrait `find_similar_cases`
   * depuis le 30/09/2026 (lot P10) sans qu'aucune commande du catalogue n'y
   * mène : la recette Y19 du 02/10 l'a constaté en démo (« réponses préparées
   * à l'avance… aucune amorce scriptée n'amène au cas Banque Exemplaire »),
   * reste ouverte depuis. Cette commande ferme ce manque — la question est
   * reprise mot pour mot de la recette rejouée aux lots P10/X48/R17.
   */
  {
    key: 'account_similar_cases',
    category: 'accounts',
    moment: 'open_account',
    label: { fr: 'À quoi ce compte ressemble', en: 'What this account resembles' },
    prompt: {
      fr: 'À quoi ressemble ce compte par rapport à ce qu’on a gagné ou perdu ?',
      en: 'What does this account resemble among what we have won or lost?',
    },
    outcome: {
      fr: 'Jusqu’à trois cas gagnés ou perdus du même espace, chacun avec ses similitudes et ses différences nommées. Ce qui a été regardé est toujours dit, même si la liste est vide.',
      en: 'Up to three won or lost cases from the same workspace, each with its similarities and differences named. What was examined is always stated, even when the list is empty.',
    },
    tools: ['find_similar_cases'],
    requires: [],
  },
  {
    key: 'find_accounts',
    category: 'accounts',
    moment: 'open_account',
    label: { fr: 'Trouver de nouveaux comptes', en: 'Find new accounts' },
    prompt: {
      fr: 'Trouve-moi des comptes à prospecter dans mon secteur et ma région.',
      en: 'Find me accounts to prospect in my sector and area.',
    },
    outcome: {
      fr: 'Des critères de recherche prêts : ton clic ouvre Découvrir pré-rempli. Aucune entreprise n’est citée avant.',
      en: 'Search criteria ready: your click opens Discover pre-filled. No company is named before that.',
    },
    tools: ['find_accounts'],
    requires: [],
  },
  /**
   * #2470 — LE TOUR D'HORIZON, exécuté dans la conversation.
   *
   * Retour bêta du 16/09/2026 : « un GO devrait entraîner une recherche
   * directement et que ça alimente la conversation plutôt qu'à forcer à aller
   * sur la page découvrir ». La commande au-dessus PRÉPARE et ouvre l'écran —
   * c'est ce que veut quelqu'un qui compte trier et cocher. Celle-ci CHERCHE et
   * rend la liste dans la bulle. Deux gestes, deux commandes : les fondre
   * ferait disparaître le premier, qui est encore le bon la moitié du temps.
   */
  {
    key: 'run_account_search',
    category: 'accounts',
    moment: 'open_account',
    label: { fr: 'Faire un tour d’horizon du marché', en: 'Run a market sweep' },
    prompt: {
      fr: 'Fais-moi un tour d’horizon des entreprises de mon secteur dans mon département.',
      en: 'Run me a sweep of the companies in my sector and department.',
    },
    outcome: {
      fr: 'La liste des comptes trouvés, dans la conversation, avec les critères qui l’ordonnent et ce qui n’a pas pu être évalué.',
      en: 'The accounts found, right in the conversation, with the criteria that order them and whatever could not be assessed.',
    },
    tools: ['run_account_search'],
    requires: [],
  },

  /* ── Projets et besoins ────────────────────────────────────────────────── */
  {
    key: 'needs_open',
    category: 'accounts',
    moment: 'handle_need',
    label: { fr: 'Les besoins actifs', en: 'Open needs' },
    prompt: {
      fr: 'Quels besoins sont actifs sur mes comptes ?',
      en: 'Which needs are open across my accounts?',
    },
    outcome: {
      fr: 'Les besoins ouverts chez tes clients, chacun rattaché à son compte.',
      en: 'The open needs at your clients, each linked to its account.',
    },
    tools: ['find_needs'],
    requires: [],
  },

  /* ── Vivier et matching ────────────────────────────────────────────────── */
  {
    key: 'talents_available',
    category: 'talent',
    moment: 'position_consultant',
    label: { fr: 'Qui est disponible', en: 'Who is available' },
    prompt: {
      fr: 'Quels consultants sont disponibles, et à partir de quand ?',
      en: 'Which consultants are available, and from when?',
    },
    outcome: {
      fr: 'Les consultants disponibles et à partir de quand. Une disponibilité inconnue est dite, jamais présentée comme libre.',
      en: 'Available consultants and from when. An unknown availability is stated, never shown as free.',
    },
    tools: ['search_talents'],
    requires: [],
  },
  {
    key: 'talents_by_skill',
    category: 'talent',
    moment: 'position_consultant',
    label: { fr: 'Qui connaît une techno', en: 'Who knows a technology' },
    prompt: {
      fr: 'Qui dans le vivier connaît cette technologie, et à quel niveau ?',
      en: 'Who in the bench knows this technology, and at what level?',
    },
    outcome: {
      fr: 'Les profils du vivier qui ont cette compétence, avec leur niveau.',
      en: 'The profiles in your bench with this skill, and their level.',
    },
    tools: ['search_talents'],
    requires: [],
  },
  {
    key: 'talents_reactivate',
    category: 'talent',
    moment: 'position_consultant',
    label: { fr: 'Qui repositionner', en: 'Who to reposition' },
    prompt: {
      fr: 'Quels consultants faut-il repositionner, et pourquoi eux ?',
      en: 'Which consultants should be repositioned, and why them?',
    },
    outcome: {
      fr: 'Les consultants à recontacter, chacun avec la raison de sa présence : fin de mission proche, intercontrat, jamais positionné…',
      en: 'The consultants to reach out to, each with the reason they are listed: mission ending soon, between assignments, never positioned…',
    },
    tools: ['list_reactivation_pool'],
    requires: [],
  },
  {
    key: 'matching_shortlist',
    category: 'talent',
    moment: 'handle_need',
    label: { fr: 'Classer le vivier sur un besoin', en: 'Rank the bench against a need' },
    prompt: {
      fr: 'Classe mon vivier sur ce besoin et donne-moi les trois meilleurs profils, avec leurs manques.',
      en: 'Rank my bench against this need and give me the top three profiles, with their gaps.',
    },
    outcome: {
      fr: 'Ton vivier classé sur le besoin, avec les profils écartés et leur motif. Les mêmes critères rendent le même classement.',
      en: 'Your bench ranked against the need, with the profiles set aside and why. The same criteria give the same ranking.',
    },
    tools: ['find_needs', 'run_matching'],
    requires: [],
  },
  {
    key: 'matching_explain',
    category: 'talent',
    moment: 'position_consultant',
    label: { fr: 'Pourquoi ce profil sur ce besoin', en: 'Why this profile for this need' },
    prompt: {
      fr: 'Compare ce consultant avec ce besoin, axe par axe.',
      en: 'Compare this consultant against this need, axis by axis.',
    },
    outcome: {
      fr: 'L’explication axe par axe. Un axe non évaluable est dit, jamais compté zéro.',
      en: 'The explanation, axis by axis. An axis that cannot be assessed is stated, never counted as zero.',
    },
    tools: ['find_needs', 'run_matching'],
    requires: [],
  },

  /* ── Missions, CRA, facturation ────────────────────────────────────────── */
  {
    key: 'missions_ending',
    category: 'delivery',
    moment: 'track_mission',
    label: { fr: 'Missions qui finissent bientôt', en: 'Missions ending soon' },
    prompt: {
      fr: 'Quelles missions finissent dans les 30 jours ?',
      en: 'Which missions end within 30 days?',
    },
    outcome: {
      fr: 'Les missions qui finissent dans les 30 jours, et celles qui n’ont aucune date de fin.',
      en: 'Missions ending within 30 days, and those with no end date at all.',
    },
    tools: ['search_missions'],
    requires: [],
  },
  {
    key: 'missions_at_risk',
    category: 'delivery',
    moment: 'track_mission',
    label: { fr: 'Missions à risque', en: 'Missions at risk' },
    prompt: {
      fr: 'Quelles missions sont à risque, et de quoi exactement ?',
      en: 'Which missions are at risk, and of what exactly?',
    },
    outcome: {
      fr: 'Les missions en cours et leur risque nommé : fin sans renouvellement, relevé contesté ou manquant, marge à risque ou non mesurable.',
      en: 'Ongoing missions and their named risk: ending without renewal, disputed or missing timesheet, margin at risk or not measurable.',
    },
    tools: ['get_mission_risks'],
    requires: [],
  },
  {
    key: 'timesheets_missing',
    category: 'delivery',
    moment: 'track_mission',
    label: { fr: 'Relevés d’activité manquants', en: 'Missing timesheets' },
    prompt: {
      fr: 'Quels relevés d’activité manquent, et pour quelles missions ?',
      en: 'Which timesheets are missing, and for which missions?',
    },
    outcome: {
      fr: 'Les relevés manquants sur les mois clos, mission par mission. Un mois en cours n’est pas compté en retard.',
      en: 'Missing timesheets for closed months, mission by mission. A month still running is not counted as late.',
    },
    tools: ['get_timesheets'],
    requires: [],
  },
  {
    key: 'timesheets_chase',
    category: 'delivery',
    moment: 'track_mission',
    label: { fr: 'Relancer les relevés', en: 'Chase the timesheets' },
    prompt: {
      fr: 'Prépare une relance pour chaque relevé d’activité manquant.',
      en: 'Prepare a follow-up for each missing timesheet.',
    },
    outcome: {
      fr: 'Un brouillon de relance par relevé manquant, à valider. Rien n’est envoyé.',
      en: 'One follow-up draft per missing timesheet, for you to approve. Nothing is sent.',
    },
    tools: ['get_timesheets', 'prepare_mail_draft'],
    requires: ['email'],
  },
  {
    key: 'invoicing_blocked',
    category: 'delivery',
    moment: 'track_mission',
    label: { fr: 'Ce qui bloque ma facturation', en: 'What blocks my invoicing' },
    prompt: {
      fr: 'Qu’est-ce qui bloque ma facturation ce mois-ci ?',
      en: 'What is blocking my invoicing this month?',
    },
    outcome: {
      fr: 'Ce qui empêche de facturer ce mois, mission par mission, avec le bloqueur nommé. Aucune facture n’est émise.',
      en: 'What prevents invoicing this month, mission by mission, with the blocker named. No invoice is issued.',
    },
    tools: ['get_invoice_blockers'],
    requires: [],
  },

  /* ── Appels d'offres et références ─────────────────────────────────────── */
  {
    key: 'rfp_summary',
    category: 'rfp',
    moment: 'handle_need',
    label: { fr: 'Résumer un appel d’offres', en: 'Summarise a tender' },
    prompt: {
      fr: 'Résume cet appel d’offres : ce qu’il demande, et ce à quoi je ne sais pas répondre.',
      en: 'Summarise this tender: what it asks for, and what I cannot answer.',
    },
    outcome: {
      fr: 'Ce que demande l’appel d’offres, exigence par exigence, avec les exigences sans réponse nommées.',
      en: 'What the tender asks for, requirement by requirement, with unanswered requirements named.',
    },
    tools: ['search_rfps'],
    requires: [],
  },
  {
    key: 'proofs_usable',
    category: 'rfp',
    moment: 'prepare_meeting',
    label: { fr: 'Quelles références citer', en: 'Which references to cite' },
    prompt: {
      fr: 'Quelles références puis-je mobiliser pour ce client ?',
      en: 'Which references can I use for this client?',
    },
    outcome: {
      fr: 'Les références que tu peux citer : seulement celles dont l’accord écrit est valide.',
      en: 'The references you can cite: only those with valid written consent.',
    },
    tools: ['search_proofs'],
    requires: [],
  },

  /* ── Pilotage ──────────────────────────────────────────────────────────── */
  {
    key: 'interventions_today',
    category: 'steering',
    moment: 'steer_team',
    label: { fr: 'Où intervenir aujourd’hui', en: 'Where to step in today' },
    prompt: {
      fr: 'Où dois-je intervenir aujourd’hui ?',
      en: 'Where should I step in today?',
    },
    outcome: {
      fr: 'La file des interventions du jour, chacune avec le motif qui l’a fait remonter.',
      en: 'Today’s intervention queue, each with the reason it came up.',
    },
    tools: ['get_interventions'],
    requires: [],
  },

  /* ── Accès ─────────────────────────────────────────────────────────────── */
  //
  // Tome 1 §16. Les trois commandes ci-dessous s'appuient sur `find_accounts`,
  // qui prépare des critères et ouvre Découvrir — et Découvrir sait désormais
  // trier par accès et ranger les comptes en quatre familles.
  //
  // Ce qui N'EST PAS ici, et qui figure au tome : « ce compte est-il
  // référencé ? », « qui contacter dans cette ESN ? », « qui de mon réseau a
  // changé d'entreprise ? ». Elles ont leur écran, elles n'ont pas d'outil
  // copilote — et une commande qu'on affiche sans que le copilote sache y
  // répondre est exactement le « livré mais vide » que le produit s'interdit.
  {
    key: 'access_open_accounts',
    category: 'access',
    moment: 'open_account',
    label: { fr: 'Des comptes que je peux ouvrir seul', en: 'Accounts I can open on my own' },
    prompt: {
      fr: 'Trouve-moi des comptes où rien ne semble bloquer l’entrée, avec un signal récent.',
      en: 'Find me accounts where nothing seems to block the way in, with a recent signal.',
    },
    outcome: {
      fr: 'Des critères de recherche prêts : ton clic ouvre Découvrir pré-rempli. Aucune entreprise n’est citée avant.',
      en: 'Search criteria ready: your click opens Discover pre-filled. No company is named before that.',
    },
    tools: ['find_accounts'],
    requires: [],
  },
  {
    key: 'access_my_size',
    category: 'access',
    moment: 'open_account',
    label: { fr: 'Des comptes à ma taille', en: 'Accounts my size' },
    prompt: {
      fr: 'Quels comptes sont à la portée d’une structure de ma taille, sans passer par un référencement ?',
      en: 'Which accounts are within reach for a firm my size, without going through a supplier panel?',
    },
    outcome: {
      fr: 'Des critères de recherche prêts : ton clic ouvre Découvrir pré-rempli. Aucune entreprise n’est citée avant.',
      en: 'Search criteria ready: your click opens Discover pre-filled. No company is named before that.',
    },
    tools: ['find_accounts'],
    requires: [],
  },
  {
    key: 'access_territory',
    category: 'access',
    moment: 'open_account',
    label: { fr: 'Ouvrir une ville', en: 'Open up a city' },
    prompt: {
      fr: 'Je veux ouvrir une nouvelle ville : qu’est-ce qui bouge là-bas, et où puis-je entrer ?',
      en: 'I want to open a new city: what is moving there, and where can I get in?',
    },
    outcome: {
      fr: 'Des critères de recherche prêts : ton clic ouvre Découvrir pré-rempli. Aucune entreprise n’est citée avant.',
      en: 'Search criteria ready: your click opens Discover pre-filled. No company is named before that.',
    },
    tools: ['find_accounts'],
    requires: [],
  },

  /* ── #2392 — la clôture de fin de journée, pendant du brief du matin ───── */
  {
    key: 'day_closure',
    category: 'steering',
    moment: 'end_day',
    label: { fr: 'Clôturer ma journée', en: 'Wrap up my day' },
    prompt: {
      fr: 'Fais la clôture de ma journée : ce qui a avancé, ce qui reste ouvert, qui attend une réponse et par quoi je reprends demain.',
      en: 'Wrap up my day: what moved forward, what is still open, who owes me a reply and where I pick up tomorrow.',
    },
    outcome: {
      fr: 'Une carte : tes tâches cochées, tes engagements du jour, les réponses attendues, les blocages et la première action de demain. Chaque tâche restée ouverte se décide une par une, et rien ne change avant ta validation.',
      en: 'A card: tasks you checked, commitments made today, replies you are waiting for, blockers and your first action tomorrow. Each task still open is decided one by one, and nothing changes before you approve.',
    },
    tools: ['compile_day_closure'],
    requires: [],
  },
]
