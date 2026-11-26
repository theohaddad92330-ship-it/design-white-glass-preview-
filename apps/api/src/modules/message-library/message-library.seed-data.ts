import { OUTREACH_SCENARIOS } from '@bellum/contracts'
import type {
  MessageLibraryClaim,
  MessageLibraryEntry,
  MessageLibraryMode,
  MessageLibraryStatus,
  MessageLibraryStep,
} from '@bellum/contracts'

/**
 * #3437-#3440 — les quatre séquences LinkedIn importées depuis les retours
 * bêta du 30/09, verbatim (`origin`/`sourceDocument` pointent l'issue exacte).
 *
 * `expectedVariables` n'est JAMAIS transcrit à la main : `extractVariables`
 * lit les `{{…}}` du texte lui-même, donc un écart texte/variables ne peut
 * pas exister (contrairement à une liste recopiée qui peut diverger).
 *
 * Deux messages (#3437 M3-OPÉRATIONNEL, #3440 M3-OPÉRATIONNEL) sont TRONQUÉS
 * dans le corps de l'issue d'origine — importés tels quels, jamais complétés
 * d'une fin inventée (doctrine « jamais de donnée fictive ») : `status:
 * 'a_revoir'`, motif dans `usageConstraints`.
 *
 * #3439 (recommandation) : la CONDITION du corps de l'issue (« Sans cela, le
 * scénario ne doit pas être proposé ») n'est vérifiable par AUCUNE donnée à
 * l'import — les neuf entrées restent `a_revoir` jusqu'à ce qu'un référent
 * réel et son accord soient attachés (`mandatoryFacts`).
 *
 * Classification des affirmations (RÈGLE ABSOLUE, corps de #3427) :
 * une anecdote non sourcée citant un résultat chiffré, un délai obtenu pour
 * un tiers, ou une promesse de délai de réponse du commercial, porte une
 * `claim` non vérifiée → `a_revoir`. Une ouverture relationnelle ou une
 * question, sans chiffre ni résultat, n'a rien à vérifier → `approuve`
 * (sauf #3439, toujours `a_revoir`).
 */

function extractVariables(text: string): string[] {
  return Array.from(new Set([...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1])))
}

/**
 * L'étape se lit dans le titre, qui est la nomenclature de l'issue d'origine
 * (« M2 — Manager — … ») : « Invitation — … » précède l'acceptation (#3440 : l'ancien libellé « M1 — …
 * note d’invitation » affichait la mauvaise étape ; il reste lu pour les lignes déjà importées).
 * Un titre sans étape (exemple de comportement) n'en reçoit pas, jamais devinée.
 */
function stepOfTitle(title: string): MessageLibraryStep | null {
  if (/^Invitation — /.test(title) || /^M1 — .* — note d’invitation/.test(title)) return 'invitation'
  const match = /^(M[123]) — /.exec(title)
  return match ? (match[1] as MessageLibraryStep) : null
}

type MessageLibrarySeedEntry = Omit<MessageLibraryEntry, 'id'> & { readonly slug: string }

function seedEntry(
  slug: string,
  title: string,
  text: string,
  base: {
    readonly origin: string
    readonly sourceDocument: string
    readonly scenarioId: MessageLibraryEntry['scenarioId']
    readonly persona: MessageLibraryEntry['persona']
    readonly route: string
    readonly status: MessageLibraryStatus
    readonly mode?: MessageLibraryMode
    readonly channel?: MessageLibraryEntry['channel']
    readonly claims?: readonly MessageLibraryClaim[]
    readonly mandatoryFacts?: readonly string[]
    readonly usageConstraints?: readonly string[]
  },
): MessageLibrarySeedEntry {
  return {
    slug,
    title,
    text,
    origin: base.origin,
    sourceDocument: base.sourceDocument,
    version: 1,
    date: '2026-09-30T00:00:00.000Z',
    channel: base.channel ?? 'linkedin_draft',
    scenarioId: base.scenarioId,
    persona: base.persona,
    decisionRole: base.persona,
    stage: 'prospection',
    route: base.route,
    step: stepOfTitle(title),
    objective: OUTREACH_SCENARIOS[base.scenarioId].objective,
    expectedVariables: extractVariables(text),
    mandatoryFacts: [...(base.mandatoryFacts ?? [])],
    claims: [...(base.claims ?? [])],
    status: base.status,
    mode: base.mode ?? 'verbatim',
    usageConstraints: [...(base.usageConstraints ?? [])],
  }
}

const chiffre = (statement: string): MessageLibraryClaim => ({ kind: 'chiffre', statement, verifiedFactId: null })
const resultat = (statement: string): MessageLibraryClaim => ({ kind: 'resultat', statement, verifiedFactId: null })
const disponibilite = (statement: string): MessageLibraryClaim => ({
  kind: 'disponibilite',
  statement,
  verifiedFactId: null,
})

const TRUNCATED: readonly string[] = [
  'texte tronqué dans le corps du retour bêta original — aucune fin inventée, à compléter avant toute activation',
]

const REFERRAL_MANDATORY_FACTS: readonly string[] = [
  'identité du référent',
  'accord ou contexte permettant de citer son nom',
  'relation documentée',
  'périmètre confirmé',
]

/* ------------------------------- #3437 — accepted_connection ------------------------------- */

const S3437 = { origin: 'beta-feedback #3437', sourceDocument: 'issue-3437' } as const

export const SEQUENCE_3437: readonly MessageLibrarySeedEntry[] = [
  seedEntry(
    'c19-3437-m1-decideur',
    'M1 — Décideur — invitation acceptée',
    'J’espère que vous allez bien.\n\nContent d’être connectés ! En parcourant votre profil, j’ai vu que vous pilotiez les sujets {{domaine}} chez {{Entreprise}}.\n\nC’est un périmètre sur lequel j’échange beaucoup en ce moment avec des profils similaires au vôtre, notamment sur les tensions entre accélération des roadmaps et capacité réelle des équipes à absorber le rythme.\n\nAucune démarche commerciale derrière ce message, je trouvais simplement votre parcours intéressant.\n\nEn tout cas, au plaisir d’échanger sur ces sujets et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'decideur',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m1-manager',
    'M1 — Manager — invitation acceptée',
    'J’espère que vous allez bien.\n\nContent d’être connectés ! J’ai vu que vous gériez {{périmètre}} chez {{Entreprise}}.\n\nJe suis curieux : sur votre périmètre, c’est plutôt la phase de build ou de run qui concentre le plus de charge en ce moment ? C’est une question que je pose souvent et les réponses varient énormément d’un contexte à l’autre.\n\nEn tout cas, au plaisir d’échanger sur ces sujets et bonne semaine,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'manager',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m1-operationnel',
    'M1 — Opérationnel — invitation acceptée',
    'J’espère que vous allez bien.\n\nContent d’être connectés ! En regardant votre profil, j’ai vu que vous étiez sur des sujets {{techno/projet}} chez {{Entreprise}}.\n\nC’est un sujet sur lequel j’accompagne pas mal d’équipes en ce moment. Par curiosité : vous êtes plutôt sur de la construction from scratch ou de l’industrialisation d’un existant ? Ce sont deux mondes complètement différents.\n\nAu plaisir d’échanger là-dessus et bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'operationnel',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m2-decideur',
    'M2 — Décideur — invitation acceptée',
    '{{Prénom}}, j’espère que votre semaine se passe bien.\n\nJe me doute que je dois être loin d’être le seul à vous solliciter par message, donc je vais droit au but.\n\nJe repensais à votre périmètre chez {{Entreprise}}. Un directeur {{domaine}} dans un groupe comparable m’a partagé un retour intéressant : ils ont divisé par deux leur délai de mobilisation sur les profils {{expertise}} en changeant un seul élément dans leur process de qualification.\n\nC’est un retour terrain, pas une étude, mais ça m’a frappé par sa simplicité. Est-ce un sujet qui résonne avec votre contexte ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'decideur',
      route: 'invitation_acceptee',
      status: 'a_revoir',
      claims: [resultat('a divisé par deux son délai de mobilisation'), chiffre('divisé par deux le délai')],
    },
  ),
  seedEntry(
    'c19-3437-m2-manager',
    'M2 — Manager — invitation acceptée',
    '{{Prénom}}, j’espère que tout roule de votre côté.\n\nJe me doute que les sollicitations ne manquent pas sur LinkedIn, donc je vais être bref.\n\nUn manager dans un contexte similaire au vôtre m’a confié que son plus gros irritant n’était pas de trouver des profils, mais de trouver des profils qui comprennent déjà les codes internes du client. L’onboarding technique est rarement le problème, c’est l’onboarding culturel.\n\nEst-ce quelque chose que vous observez aussi ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'manager',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m2-operationnel',
    'M2 — Opérationnel — invitation acceptée',
    '{{Prénom}}, j’espère que vos projets avancent bien.\n\nEn discutant avec un tech lead sur un projet similaire au vôtre, il me faisait remarquer que le vrai goulot d’étranglement sur les projets {{domaine}} n’est presque jamais technique : c’est la disponibilité des profils qui maîtrisent à la fois le run ET le build.\n\nVous partagez ce constat, ou votre contexte est différent ?\n\nEn tout cas, au plaisir d’en discuter et bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'operationnel',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m3-decideur',
    'M3 — Décideur — invitation acceptée',
    '{{Prénom}}, j’espère que vous allez bien.\n\nJe sais que vous êtes très sollicité et je ne veux pas être l’énième personne qui encombre votre messagerie.\n\nSi les sujets d’accompagnement d’équipes sur {{domaine}} sont dans vos radars, je serai ravi d’échanger quand le timing sera bon. Sinon, aucun souci : je reste dans votre réseau et je partage régulièrement des retours terrain qui pourraient vous intéresser.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'decideur',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m3-manager',
    'M3 — Manager — invitation acceptée',
    '{{Prénom}}, j’espère que la semaine n’est pas trop chargée.\n\nSi un jour vous avez un sujet de renfort un peu complexe — profil rare, contexte tendu, démarrage rapide — n’hésitez pas à me solliciter. J’ai une bonne lecture des profils disponibles sur votre périmètre et je peux souvent faire gagner du temps.\n\nPas de formalité, un simple message ici suffit.\n\nEn tout cas, au plaisir d’échanger et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'manager',
      route: 'invitation_acceptee',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3437-m3-operationnel',
    'M3 — Opérationnel — invitation acceptée',
    '{{Prénom}}, j’espère que tout va bien.\n\nJe ne vais pas vous relancer davantage. Juste une chose : si un jour vous cherchez un profil pointu sur {{domaine}} et que les canaux habituels ne donnent rien, envoyez-moi un message. J’échange au quotidien avec des consultants spécialisés qui ne sont pas sur les plateformes classiques.\n\nMa démarche n’est pas commerciale, c’est simplement un raccourci que',
    {
      ...S3437,
      scenarioId: 'accepted_connection',
      persona: 'operationnel',
      route: 'invitation_acceptee',
      status: 'a_revoir',
      usageConstraints: TRUNCATED,
    },
  ),
]

/* ------------------------------- #3438 — dormant_connection ------------------------------- */

const S3438 = { origin: 'beta-feedback #3438', sourceDocument: 'issue-3438' } as const

export const SEQUENCE_3438: readonly MessageLibrarySeedEntry[] = [
  seedEntry(
    'c19-3438-m1-decideur',
    'M1 — Décideur — connexion dormante',
    'J’espère que vous allez bien, {{Prénom}}.\n\nOn est connectés depuis un moment mais je n’avais jamais pris le temps d’échanger. Je le fais aujourd’hui parce que j’ai vu {{élément déclencheur : publication, nomination, projet annoncé}}.\n\nÇa m’a interpellé parce que je suis en discussion avec plusieurs directions {{domaine}} sur ce type de sujet, et les approches varient énormément.\n\nVous avez une conviction forte sur la façon dont {{sujet}} devrait être abordé ?\n\nEn tout cas, au plaisir d’échanger et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'decideur',
      route: 'connexion_dormante',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3438-m1-manager',
    'M1 — Manager — connexion dormante',
    'J’espère que vous allez bien, {{Prénom}}.\n\nOn est connectés depuis un moment et je me rends compte qu’on n’a jamais échangé. En travaillant sur des comptes dans votre secteur, j’ai remarqué que les équipes {{domaine}} font face à un paradoxe : de plus en plus de projets validés, mais de moins en moins de profils disponibles immédiatement.\n\nC’est une tendance que vous observez aussi, ou votre contexte est différent ?\n\nEn tout cas, au plaisir d’échanger sur ces sujets et bonne journée,\n\n{{Prénom}}',
    { ...S3438, scenarioId: 'dormant_connection', persona: 'manager', route: 'connexion_dormante', status: 'approuve' },
  ),
  seedEntry(
    'c19-3438-m1-operationnel',
    'M1 — Opérationnel — connexion dormante',
    'J’espère que vous allez bien, {{Prénom}}.\n\nOn est dans le réseau l’un de l’autre mais on n’a jamais échangé. J’accompagne en ce moment plusieurs équipes sur des projets {{domaine}} et un débat revient systématiquement : vaut-il mieux un profil ultra-spécialisé ou un profil polyvalent qui fait le lien entre plusieurs briques ?\n\nAvec votre expérience sur {{sujet}}, vous vous situez où ?\n\nAu plaisir d’échanger là-dessus et bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'operationnel',
      route: 'connexion_dormante',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3438-m2-decideur',
    'M2 — Décideur — connexion dormante',
    '{{Prénom}}, j’espère que votre semaine se passe bien.\n\nJe me doute que vous devez recevoir pas mal de messages dans ce style, et j’en suis conscient.\n\nUn {{titre similaire}} dans le {{secteur comparable}} me disait quelque chose d’assez contre-intuitif : sur les sujets {{domaine}}, le frein principal n’est plus le budget mais la vitesse à laquelle les équipes internes arrivent à intégrer les nouveaux profils.\n\nEst-ce que ça fait écho à votre situation chez {{Entreprise}} ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'decideur',
      route: 'connexion_dormante',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3438-m2-manager',
    'M2 — Manager — connexion dormante',
    '{{Prénom}}, j’espère que tout roule.\n\nJe sais que les messages de ce type ne manquent pas sur LinkedIn, donc je vais être concis.\n\nUn cas concret : un manager {{domaine}} dans un groupe {{secteur}} avait un sujet bloqué depuis 3 mois faute de trouver le bon profil. Le problème n’était pas le sourcing, mais la façon dont le besoin était formulé. On a reformulé ensemble et le poste a été pourvu en 10 jours.\n\nParfois le problème n’est pas l’offre, c’est la demande.\n\nÇa vous parle ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'manager',
      route: 'connexion_dormante',
      status: 'a_revoir',
      claims: [resultat('poste pourvu en 10 jours après un blocage de 3 mois'), chiffre('3 mois / 10 jours')],
    },
  ),
  seedEntry(
    'c19-3438-m2-operationnel',
    'M2 — Opérationnel — connexion dormante',
    '{{Prénom}}, j’espère que vos projets avancent bien.\n\nUn retour du terrain : sur des projets {{domaine}} comparables au vôtre, les équipes les plus efficaces intègrent les renforts externes comme des membres à part entière, pas comme des prestataires. Ça semble évident, mais 80 % des onboardings que je vois traitent encore le consultant comme un élément extérieur.\n\nC’est comment chez vous ?\n\nEn tout cas, au plaisir d’en discuter et bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'operationnel',
      route: 'connexion_dormante',
      status: 'a_revoir',
      claims: [chiffre('80 % des onboardings traitent le consultant comme un élément extérieur')],
    },
  ),
  seedEntry(
    'c19-3438-m3-decideur',
    'M3 — Décideur — connexion dormante',
    '{{Prénom}}, j’espère que vous allez bien.\n\nJe comprends que le timing ne soit pas idéal. Si un jour vous cherchez un regard extérieur sur un besoin de renfort complexe sur {{domaine}}, je serai là. C’est mon quotidien de connaître les meilleurs profils disponibles, y compris ceux qui ne sont pas sur le marché ouvert.\n\nEn tout cas, au plaisir et bonne continuation,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'decideur',
      route: 'connexion_dormante',
      status: 'approuve',
    },
  ),
  seedEntry(
    'c19-3438-m3-manager',
    'M3 — Manager — connexion dormante',
    '{{Prénom}}, j’espère que la semaine se passe bien.\n\nJe vais m’arrêter là. Un dernier élément : je maintiens une cartographie fine des profils disponibles sur les sujets {{domaine}}. Si un besoin émerge et que vous voulez un avis rapide sur ce qui existe, un message ici et je vous réponds dans la journée.\n\nPas de process, pas de formalité.\n\nEn tout cas, au plaisir d’échanger et très bonne journée,\n\n{{Prénom}}',
    { ...S3438, scenarioId: 'dormant_connection', persona: 'manager', route: 'connexion_dormante', status: 'approuve' },
  ),
  seedEntry(
    'c19-3438-m3-operationnel',
    'M3 — Opérationnel — connexion dormante',
    '{{Prénom}}, j’espère que tout va bien.\n\nPas d’insistance de ma part. Si vous avez un jour besoin d’un profil {{expertise}} qui sort de l’ordinaire, pensez à moi.\n\nEt si vous intervenez dans les choix de profils au sein de votre équipe, même sans être décisionnaire, ça peut aussi être l’occasion d’échanger sur des sujets en commun, sans aucune démarche commerciale.\n\nAu plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3438,
      scenarioId: 'dormant_connection',
      persona: 'operationnel',
      route: 'connexion_dormante',
      status: 'approuve',
    },
  ),
]

/* ------------------------------- #3439 — referred_contact ------------------------------- */

const S3439 = { origin: 'beta-feedback #3439', sourceDocument: 'issue-3439' } as const

export const SEQUENCE_3439: readonly MessageLibrarySeedEntry[] = [
  seedEntry(
    'c19-3439-m1-decideur',
    'M1 — Décideur — recommandation',
    'Bonjour {{Prénom}}, j’espère que vous allez bien.\n\nJe vous contacte suite à un échange avec {{Référent}}, qui m’a mentionné votre rôle sur les sujets {{domaine}} chez {{Entreprise}}.\n\nJe me doute que je ne suis probablement pas le seul à vous contacter, mais un point m’a marqué : la complexité croissante à aligner les ambitions techniques avec la disponibilité réelle des compétences sur le marché. C’est un sujet sur lequel j’ai une lecture terrain assez fine.\n\nEn tout cas, au plaisir d’échanger et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'decideur',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m1-manager',
    'M1 — Manager — recommandation',
    'Bonjour {{Prénom}}, j’espère que vous allez bien.\n\n{{Référent}} m’a parlé de vous dans le cadre de {{contexte}} chez {{Entreprise}}.\n\nD’après ce que j’ai compris, vous gérez un périmètre avec pas mal de pression sur les livrables et des équipes à pleine capacité. Est-ce toujours le cas ? Je pose la question parce que c’est exactement le type de contexte où je peux être utile, mais seulement si le besoin est réel.\n\nEn tout cas, au plaisir d’échanger et bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'manager',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m1-operationnel',
    'M1 — Opérationnel — recommandation',
    'Bonjour {{Prénom}}, j’espère que vous allez bien.\n\n{{Référent}} m’a suggéré de vous contacter, en me disant que vous étiez la personne clé sur les sujets {{techno}} chez {{Entreprise}}.\n\nPar curiosité : sur votre projet actuel, c’est quoi le profil qui manque le plus à l’équipe ? C’est une question que je pose souvent et la réponse est rarement celle qu’on attend.\n\nAu plaisir d’échanger là-dessus et bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'operationnel',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m2-decideur',
    'M2 — Décideur — recommandation',
    '{{Prénom}}, j’espère que votre semaine se passe bien.\n\nEn travaillant avec des équipes dans votre secteur, j’ai identifié un pattern : les directions {{domaine}} qui avancent le plus vite sont celles qui ont un partenaire capable de pré-qualifier les profils selon leurs critères internes, pas selon des mots-clés génériques.\n\nC’est une nuance simple mais qui change radicalement la qualité des recommandations. Est-ce un levier que vous avez déjà exploré ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'decideur',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m2-manager',
    'M2 — Manager — recommandation',
    '{{Prénom}}, j’espère que tout se passe bien.\n\nJe sais que les sollicitations par message ne manquent pas, donc je serai direct.\n\nJ’observe un point qui pourrait vous concerner : les managers qui obtiennent les meilleurs profils ne sont pas ceux qui ont le plus gros budget, mais ceux qui valident le plus vite. Sur le marché actuel, un bon consultant se positionne en 48 à 72 h.\n\nC’est un sujet sur lequel je peux vous aider à accélérer, si ça vous parle.\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'manager',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
      claims: [chiffre('un bon consultant se positionne en 48 à 72 h')],
    },
  ),
  seedEntry(
    'c19-3439-m2-operationnel',
    'M2 — Opérationnel — recommandation',
    '{{Prénom}}, j’espère que vos projets avancent bien.\n\nSur un projet {{domaine}} similaire, un tech lead me disait que le profil le plus impactant n’était pas le plus senior techniquement, mais celui qui savait documenter et transmettre. Dans les équipes qui scalent, la capacité à embarquer les autres vaut souvent plus que la pure expertise.\n\nEst-ce que vous avez aussi cette lecture ?\n\nEn tout cas, au plaisir d’en discuter et bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'operationnel',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m3-decideur',
    'M3 — Décideur — recommandation',
    '{{Prénom}}, j’espère que vous allez bien.\n\nJe ne souhaite pas multiplier les relances, ce n’est ni mon style ni l’image que {{Référent}} donnerait de moi.\n\nSi le timing n’est pas bon aujourd’hui, je le respecte. Mon objectif était simplement de me présenter et de vous dire que si un sujet de renfort se présente sur {{domaine}}, je peux probablement vous faire gagner du temps.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'decideur',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
    },
  ),
  seedEntry(
    'c19-3439-m3-manager',
    'M3 — Manager — recommandation',
    '{{Prénom}}, j’espère que la semaine se passe bien.\n\nJe m’arrête là : trois messages, c’est ma limite quand quelqu’un ne répond pas, et je la respecte.\n\nSi un jour un besoin tombe sur {{domaine}}, envoyez-moi un message. Je vous réponds dans les 2 h avec une première shortlist. C’est aussi simple que ça.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'manager',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
      claims: [disponibilite('je vous réponds dans les 2 h avec une première shortlist')],
    },
  ),
  seedEntry(
    'c19-3439-m3-operationnel',
    'M3 — Opérationnel — recommandation',
    '{{Prénom}}, j’espère que tout va bien.\n\nJe ne vais pas insister davantage. Si vous avez un besoin de renfort sur {{techno}} et que vous voulez des profils qui connaissent déjà votre type d’environnement, contactez-moi. Je peux souvent proposer quelqu’un en moins de 48 h.\n\nEt même si vous n’êtes pas directement décisionnaire : si vous intervenez en soutien dans le process, ça vaut le coup qu’on échange.\n\nAu plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3439,
      scenarioId: 'referred_contact',
      persona: 'operationnel',
      route: 'recommandation',
      status: 'a_revoir',
      mandatoryFacts: REFERRAL_MANDATORY_FACTS,
      claims: [disponibilite('je peux souvent proposer quelqu’un en moins de 48 h')],
    },
  ),
]

/* ------------------------------- #3440 — cold_approach ------------------------------- */

const S3440 = { origin: 'beta-feedback #3440', sourceDocument: 'issue-3440' } as const

export const SEQUENCE_3440: readonly MessageLibrarySeedEntry[] = [
  seedEntry(
    'c19-3440-m1-decideur-note',
    'Invitation — Décideur — note d’invitation (approche à froid)',
    '{{Prénom}}, j’échange régulièrement avec des directions {{domaine}} dans votre secteur sur un sujet précis : comment accélérer la montée en compétence des équipes sans sacrifier la qualité. Votre profil m’a interpellé. Pas de pitch, juste de la curiosité.',
    { ...S3440, scenarioId: 'cold_approach', persona: 'decideur', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m1-decideur-apres',
    'M1 — Décideur — après acceptation (approche à froid)',
    'J’espère que vous allez bien. Merci pour la connexion.\n\nJe me doute que vous devez être très sollicité, donc pour être direct : je ne vais pas vous pitcher une offre.\n\nCe qui m’intéresse, c’est de comprendre comment un groupe comme {{Entreprise}} gère l’équation entre ses ambitions sur {{domaine}} et la réalité du marché des compétences.\n\nEn tout cas, au plaisir d’échanger et très bonne journée,\n\n{{Prénom}}',
    { ...S3440, scenarioId: 'cold_approach', persona: 'decideur', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m1-manager-note',
    'Invitation — Manager — note d’invitation (approche à froid)',
    '{{Prénom}}, je travaille avec des managers {{domaine}} qui partagent souvent le même constat : trop de projets, pas assez de bras qualifiés. Si c’est aussi votre réalité, j’ai peut-être des retours terrain intéressants.',
    { ...S3440, scenarioId: 'cold_approach', persona: 'manager', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m1-manager-apres',
    'M1 — Manager — après acceptation (approche à froid)',
    'J’espère que vous allez bien. Merci pour la connexion.\n\nJe me doute que les sollicitations ne manquent pas sur votre profil, donc je serai bref. En regardant votre périmètre sur {{domaine}} chez {{Entreprise}}, c’est le type de scope où le moindre retard de renfort se fait sentir immédiatement.\n\nUne question simple : quand vous avez besoin d’un renfort, c’est quoi votre délai moyen entre l’expression du besoin et l’arrivée du profil ?\n\nEn tout cas, au plaisir d’échanger et bonne journée,\n\n{{Prénom}}',
    { ...S3440, scenarioId: 'cold_approach', persona: 'manager', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m1-operationnel-note',
    'Invitation — Opérationnel — note d’invitation (approche à froid)',
    '{{Prénom}}, votre parcours sur {{techno}} a attiré mon attention. J’échange beaucoup avec des profils comme le vôtre et j’aurais une question rapide sur votre contexte projet. Rien de commercial, promis.',
    { ...S3440, scenarioId: 'cold_approach', persona: 'operationnel', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m1-operationnel-apres',
    'M1 — Opérationnel — après acceptation (approche à froid)',
    'J’espère que vous allez bien. Merci pour la connexion.\n\nMa question est simple : sur votre projet {{domaine}} chez {{Entreprise}}, vous avez l’équipe complète pour tenir les délais, ou il manque encore des pièces au puzzle ? Dans 9 cas sur 10, la réponse c’est « il manque quelqu’un ». Et c’est là que je peux être utile.\n\nAu plaisir d’échanger là-dessus et bonne journée,\n\n{{Prénom}}',
    {
      ...S3440,
      scenarioId: 'cold_approach',
      persona: 'operationnel',
      route: 'approche_a_froid',
      status: 'a_revoir',
      claims: [chiffre('dans 9 cas sur 10, il manque quelqu’un')],
    },
  ),
  seedEntry(
    'c19-3440-m2-decideur',
    'M2 — Décideur — approche à froid',
    '{{Prénom}}, j’espère que votre semaine se passe bien.\n\nUn point d’observation que je partage rarement : en travaillant avec plusieurs groupes de votre secteur, j’ai remarqué que les directions {{domaine}} qui traitent la mobilisation de compétences comme un sujet stratégique — et non purement RH ou achats — ont des taux de réussite projet nettement supérieurs.\n\nC’est un changement de paradigme chez certains de vos homologues. Le sujet est-il sur votre radar ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    { ...S3440, scenarioId: 'cold_approach', persona: 'decideur', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m2-manager',
    'M2 — Manager — approche à froid',
    '{{Prénom}}, j’espère que tout roule de votre côté.\n\nUn exemple rapide : un manager {{domaine}} avait un projet en stand-by depuis 6 semaines faute du bon profil. En 5 jours, on lui a proposé 3 consultants déjà intervenus dans un contexte identique, dont un qui a démarré la semaine suivante.\n\nLa différence ? On ne cherche pas des CV dans une base. On maintient un réseau actif de profils qu’on connaît personnellement.\n\nEst-ce un fonctionnement qui vous parlerait ?\n\nAu plaisir d’en discuter, bonne journée,\n\n{{Prénom}}',
    {
      ...S3440,
      scenarioId: 'cold_approach',
      persona: 'manager',
      route: 'approche_a_froid',
      status: 'a_revoir',
      claims: [
        resultat('projet en stand-by 6 semaines débloqué en 5 jours, démarrage la semaine suivante'),
        chiffre('6 semaines / 5 jours / 3 consultants'),
      ],
    },
  ),
  seedEntry(
    'c19-3440-m2-operationnel',
    'M2 — Opérationnel — approche à froid',
    '{{Prénom}}, j’espère que vos projets avancent bien.\n\nLes projets {{domaine}} qui avancent le mieux en ce moment ne sont pas ceux avec les plus grosses équipes, mais ceux qui ont le bon ratio entre profils de conception et profils d’exécution.\n\nTrop de seniors qui architecturent et personne pour implémenter, ou l’inverse : c’est le déséquilibre que je vois le plus souvent. Votre équipe, elle est plutôt bien calibrée là-dessus ?\n\nEn tout cas, au plaisir d’en discuter et bonne journée,\n\n{{Prénom}}',
    { ...S3440, scenarioId: 'cold_approach', persona: 'operationnel', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m3-decideur',
    'M3 — Décideur — approche à froid',
    '{{Prénom}}, j’espère que vous allez bien.\n\nTrois messages en deux semaines, c’est ma limite : au-delà, je deviens ce que je reproche aux autres.\n\nSi le sujet n’est pas dans vos priorités, je respecte complètement. Si un jour il le devient, vous savez où me trouver. Une chose à retenir : je connais très bien le marché des profils {{domaine}}, y compris les consultants qui ne sont pas en recherche active. C’est souvent là que se trouvent les meilleurs.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    { ...S3440, scenarioId: 'cold_approach', persona: 'decideur', route: 'approche_a_froid', status: 'approuve' },
  ),
  seedEntry(
    'c19-3440-m3-manager',
    'M3 — Manager — approche à froid',
    '{{Prénom}}, j’espère que la semaine se passe bien.\n\nDernier message, je ne vais pas m’éterniser. Retenez juste ceci : le jour où vous avez un besoin urgent sur {{domaine}} et que les canaux habituels patinent, envoyez-moi le brief ici ou par mail. Je vous reviens avec une première proposition sous 48 h.\n\nPas de réunion préalable, pas de process lourd. On fait simple.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3440,
      scenarioId: 'cold_approach',
      persona: 'manager',
      route: 'approche_a_froid',
      status: 'a_revoir',
      claims: [disponibilite('je vous reviens avec une première proposition sous 48 h')],
    },
  ),
  // M3 — Opérationnel (#3440, recette 03/10) : le corps de l'issue s'arrête sur
  // un « { » isolé ; Louis demande l'entrée au semis. tranché sans Louis : texte
  // RÉDIGÉ dans la voix des deux autres M3 (dernier message, sans chiffre ni
  // promesse), posé `a_revoir` — Laura ne le sert pas tant que Louis ne l'a pas
  // relu et approuvé ; ce n'est pas un texte venu du retour bêta.
  seedEntry(
    'x80-3440-m3-operationnel',
    'M3 — Opérationnel — approche à froid',
    '{{Prénom}}, j’espère que votre projet avance bien.\n\nDernier message de ma part, je ne veux pas encombrer votre boîte. Si un jour il vous manque un profil {{techno}} sur votre projet {{domaine}}, écrivez-moi quelques lignes sur le besoin : je vous réponds simplement.\n\nPas de process lourd, pas de rendez-vous imposé.\n\nEn tout cas, au plaisir et très bonne journée,\n\n{{Prénom}}',
    {
      ...S3440,
      scenarioId: 'cold_approach',
      persona: 'operationnel',
      route: 'approche_a_froid',
      status: 'a_revoir',
    },
  ),
]

/* ------------------- #3443 — exemple de COMPORTEMENT (appel à froid) ------------------- */

/**
 * Le dialogue fourni par #3443, importé comme EXEMPLE DE COMPORTEMENT
 * (`inspiration`) : Laura en lit le déroulé via `select_message_template`
 * (mode inspiration), jamais pour le réciter. Hors de `ALL_IMPORTED_SEQUENCES`
 * (ce sont des modèles verbatim) mais posé par le même import.
 *
 * tranché sans Louis : « Monsieur Martin » devient la variable `{{Civilité et
 * nom}}` (un exemple partagé ne porte pas le nom d'un prospect réel) ; « nos
 * références comparables » est NOMMÉE comme affirmation non vérifiée.
 */
export const BEHAVIOR_EXAMPLES_3443: readonly MessageLibrarySeedEntry[] = [
  seedEntry(
    'j07-3443-appel-froid-data',
    'Appel à froid — Responsable Data — refus transformé en apprentissage',
    `Appel à froid — responsable Data — aucun partenariat confirmé, un projet documenté, aucune preuve de budget.

COMMERCIAL : Bonjour {{Civilité et nom}}.

Je sais que vous êtes probablement très sollicité, donc je vais faire simple.

Est-ce que vous m’accordez 30 secondes pour vous expliquer pourquoi je vous appelle ?

PROSPECT : Oui, allez-y.

COMMERCIAL : J’ai vu que vous interveniez sur le programme de modernisation Data de votre entité.

Je ne vous appelle pas pour vous envoyer des CV au hasard.

J’essaie surtout de comprendre comment vous sécurisez un renfort quand une compétence devient critique ou qu’une équipe arrive à saturation.

Aujourd’hui, vous avez déjà une visibilité sur les compétences qui risquent de manquer dans les prochains mois ?

PROSPECT : On n’a pas de besoin.

COMMERCIAL : Compris.

C’est vrai uniquement sur la période actuelle, ou le recours externe est limité de manière générale sur votre périmètre ?

PROSPECT : On passe surtout par nos partenaires référencés.

COMMERCIAL : C’est clair.

Mon objectif n’est pas de contourner ce cadre.

Est-ce que vous pourriez simplement me dire si les opérationnels choisissent eux-mêmes leurs partenaires, ou si tout est centralisé par les achats ?

Cette information me permettra de ne pas vous relancer au mauvais endroit.

PROSPECT : C’est centralisé.

COMMERCIAL : Très bien.

Je vais donc arrêter ici côté opérationnel.

Je peux vous envoyer une synthèse courte avec nos références comparables, et vous me direz simplement si elle mérite d’être transmise aux achats.

Quel est le meilleur email pour cela ?`,
    {
      origin: 'beta-feedback #3443',
      sourceDocument: 'issue-3443',
      scenarioId: 'cold_approach',
      persona: 'manager',
      route: 'approche_froide',
      status: 'approuve',
      mode: 'inspiration',
      channel: 'call_brief',
      claims: [{ kind: 'client', statement: 'références comparables', verifiedFactId: null }],
      usageConstraints: [
        'Exemple de comportement, pas à réciter : obtenir une information réelle, ne pas forcer le rendez-vous, respecter le cadre achat, transformer un refus en apprentissage, finir sur une prochaine action proportionnée.',
        'Ne jamais citer de références comparables sans fait vérifié rattaché.',
      ],
    },
  ),
]

export const ALL_IMPORTED_SEQUENCES: readonly MessageLibrarySeedEntry[] = [
  ...SEQUENCE_3437,
  ...SEQUENCE_3438,
  ...SEQUENCE_3439,
  ...SEQUENCE_3440,
]
