/**
 * Ce qui TIENT chaque promesse de la page « Garde-fous ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une page de marketing qui dit « nous ne ferons jamais X » est une affirmation
 * sur le CODE, écrite dans un endroit qui ne voit jamais le code. Trois
 * semaines plus tard la fonction bouge, et la page continue de promettre — sans
 * que rien ne tombe, parce que rien ne regardait.
 *
 * Chaque entrée ci-dessous rattache une phrase publique à la ligne qui la rend
 * vraie. `safeguards.test.ts` ouvre chacune, vérifie qu'elle existe et qu'elle
 * dit encore ce qu'on lui fait dire, et fait échouer la CI sinon. C'est la même
 * discipline que `doctrine-registry.ts` applique à ses `holders` — et pour la
 * même raison, écrite là-bas : « une garde AFFIRMÉE mais absente est pire
 * qu'une garde absente : elle fait croire que le sujet est tenu ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PAGE N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les chemins ci-dessous ne sont JAMAIS rendus dans le HTML. Le site est
 * public, et la doctrine du copilote public l'interdit explicitement — « aucune
 * clé, architecture, fournisseur backend, coût interne, prompt, log, nom de
 * table » (`features/chatbot/lib/guardrails.ts`, section des hôtes internes).
 * Un lecteur n'a pas besoin de l'arborescence du dépôt ; la CI, si.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE DÉPÔT NE PERMETTAIT PAS D'ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La formulation d'origine — « nous n'enverrons JAMAIS un message à votre
 * place » — est FAUSSE dans ce dépôt, et la page ne l'écrit donc pas.
 * `packages/contracts/src/schemas/playbook.ts:4` nomme les playbooks de niveau
 * 5 « les seules automatisations qui ATTEIGNENT un client sans clic humain » :
 * un message part bien, composé par la machine. Ce qui est VRAI, et ce que la
 * page dit à la place, tient en deux temps : rien ne part tant qu'un humain
 * n'a pas armé, et — depuis l'arbitrage du 26/08 — rien ne part tant qu'un
 * humain n'a pas lu CE message-là.
 */

/**
 * Les six garde-fous, dans l'ordre où ils protègent.
 *
 * Six parce que le code en porte six, pas parce que six est un joli compte :
 * `playbookVerdict` les applique dans cet ordre exact et `playbook.test.ts`
 * les numérote un à un. Un septième ajouté ici sans ligne de code derrière
 * ferait échouer la garde — c'est le but.
 */
export const SAFEGUARD_KEYS = ['reply', 'once', 'optOut', 'quietHours', 'dailyCap', 'armed'] as const

/**
 * Une promesse de la page et la ligne qui la tient.
 *
 * `contains` est un fragment STABLE de la ligne — un nom de symbole ou une
 * valeur, jamais une phrase de commentaire qu'une relecture reformulerait. Une
 * garde qui tombe à chaque passage de style se fait désactiver, et c'est ainsi
 * qu'on perd une garde utile.
 */
type ClaimHolder = {
  claim: (typeof SAFEGUARD_KEYS)[number] | 'copilot' | 'review' | 'notDisableable'
  file: string
  line: number
  contains: string
}

export const CLAIM_HOLDERS: readonly ClaimHolder[] = [
  /* ── Garde-fou 1 : une réponse ferme la séquence ────────────────────────── */
  {
    claim: 'reply',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 139,
    contains: "reason: 'replied'",
  },
  {
    claim: 'reply',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 82,
    contains: 'ARRÊTE dès qu’il y a une réponse',
  },

  /* ── Garde-fou 2 : une relance, jamais une cadence ──────────────────────── */
  {
    claim: 'once',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 52,
    contains: 'PLAYBOOK_MAX_PER_TARGET = 1',
  },
  {
    claim: 'once',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 140,
    contains: "reason: 'already_sent'",
  },
  {
    claim: 'once',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 91,
    contains: 'n’envoie QU’UNE fois par cible',
  },

  /* ── Garde-fou 3 : le désabonnement est relu à chaque envoi ─────────────── */
  {
    claim: 'optOut',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 141,
    contains: "reason: 'opted_out'",
  },
  {
    claim: 'optOut',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 98,
    contains: 'respecte le désabonnement',
  },
  {
    // Le point qui distingue « lu » de « lu à CHAQUE fois » : c'est côté
    // serveur, sur le balayeur, que le cache aurait été tentant.
    claim: 'optOut',
    file: 'apps/api/src/modules/playbooks/playbook-send.sweeper.spec.ts',
    line: 170,
    contains: 'jamais en cache',
  },

  /* ── Garde-fou 4 : heures calmes ────────────────────────────────────────── */
  {
    claim: 'quietHours',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 45,
    contains: 'QUIET_HOURS_START = 8',
  },
  {
    claim: 'quietHours',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 161,
    contains: 'export function withinQuietHours',
  },
  {
    claim: 'quietHours',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 105,
    contains: 'respecte les heures calmes',
  },

  /* ── Garde-fou 5 : un plafond par espace et par jour ────────────────────── */
  {
    claim: 'dailyCap',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 50,
    contains: 'PLAYBOOK_DAILY_CAP = 25',
  },
  {
    claim: 'dailyCap',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 110,
    contains: 's’arrête au plafond quotidien',
  },

  /* ── Garde-fou 6 : rien n'est armé par défaut ───────────────────────────── */
  {
    claim: 'armed',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 137,
    contains: "reason: 'not_enabled'",
  },
  {
    claim: 'armed',
    file: 'packages/contracts/src/schemas/playbook.test.ts',
    line: 119,
    contains: 'n’envoie RIEN tant que l’espace n’a pas armé',
  },
  {
    // La même règle, re-tenue côté serveur : un écran qui n'affiche pas le
    // bouton n'est pas une garantie, la décision se prend dans l'API.
    claim: 'armed',
    file: 'apps/api/src/modules/playbooks/playbooks.service.spec.ts',
    line: 95,
    contains: 'les six garde-fous',
  },

  /* ── « Aucun réglage ne les désactive » ─────────────────────────────────── */
  {
    // La preuve tient dans la SIGNATURE : le verdict ne reçoit que la
    // situation de la cible et l'heure. Il n'existe aucun paramètre
    // d'espace, aucun drapeau, aucun contournement à passer.
    claim: 'notDisableable',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 136,
    contains: 'export function playbookVerdict(candidate: PlaybookCandidate, now: Date)',
  },

  /* ── Laura prépare, elle n'envoie pas ───────────────────────────────────── */
  {
    claim: 'copilot',
    file: 'apps/ia/tests/test_chat_mailbox_tools.py',
    line: 248,
    contains: 'test_prepare_mail_draft_only_proposes',
  },
  {
    claim: 'copilot',
    file: 'apps/ia/tests/test_chat_mailbox_tools.py',
    line: 61,
    contains: 'test_mailbox_search_never_forwards_message_bodies',
  },

  /* ── Et même armée, une relance vous est soumise ────────────────────────── */
  {
    // Ce qui est montré est ce qui part : objet et corps figés au moment de
    // la demande, jamais recomposés à la validation.
    claim: 'review',
    file: 'apps/api/src/modules/playbooks/playbook-send.sweeper.spec.ts',
    line: 118,
    contains: 'FIGE le texte au moment de la demande',
  },
  {
    claim: 'review',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 797,
    contains: "'rejected'",
  },
  {
    claim: 'review',
    file: 'packages/contracts/src/schemas/playbook.ts',
    line: 814,
    contains: 'PLAYBOOK_APPROVAL_EXPIRY_DAYS = 3',
  },
  {
    claim: 'review',
    file: 'packages/contracts/src/schemas/playbook.approval.test.ts',
    line: 35,
    contains: 'vaut PÉRIMÉ, jamais « encore valide »',
  },
]
