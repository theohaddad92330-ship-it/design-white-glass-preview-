/**
 * PUBLIC_PRODUCT_KB — la SEULE base documentaire à laquelle Laura a accès.
 *
 * Le rapport du 17/08 en fait le premier point de sa checklist P0 : « créer
 * PUBLIC_PRODUCT_KB séparée de toute documentation interne ». Séparée
 * physiquement, pas par convention — ce fichier vit dans l'app du SITE, qui n'a
 * accès ni à la base BellumAI, ni aux prompts applicatifs, ni au CRM, ni aux
 * données des bêta-testeurs. Il n'y a donc rien à filtrer : il n'y a rien.
 *
 * Ce qu'on écrit ici est ce qu'on assume de dire à un inconnu. Toute réponse
 * commerciale de Laura doit s'appuyer sur une de ces entrées ; ce qui n'y figure
 * pas ne s'invente pas, se reconnaît comme inconnu, et se transmet à l'équipe.
 *
 * Les TARIFS et les STATUTS DE FONCTION n'y sont volontairement pas figés : ils
 * bougent, et un prix périmé dans un prompt est pire qu'une absence de prix. Ils
 * sont servis dynamiquement (`getPublicPricing`, `getPublicFeatureStatus`).
 */

type KbTopic =
  | 'what_is_bellum'
  | 'vs_chatgpt'
  | 'vs_crm'
  | 'vs_ats'
  | 'demo'
  | 'automation'
  | 'data_reliability'
  | 'gdpr'
  | 'small_esn'
  | 'already_equipped'
  | 'own_account'

type KbEntry = {
  topic: KbTopic
  /** Les formulations sous lesquelles un visiteur pose la question. */
  asks: readonly string[]
  answer: string
}

/**
 * La banque de réponses du §6, mot pour mot ou presque.
 *
 * Écrite plutôt que générée : ce sont les phrases qu'on accepte de voir dites au
 * nom de l'entreprise, et les faire produire par un modèle à chaque fois
 * garantit qu'elles finiront par dire autre chose.
 *
 * ⚠️ LEXIQUE — cinq formulations ont été ABANDONNÉES et ne se réécrivent pas
 * ici : « Copilote commercial IA », « Revenue Operating System », « CRM + ATS +
 * ERP avec de l'IA », « Nous remplaçons X », « L'IA fait la prospection à votre
 * place ». Le positionnement retenu est « copilote d'intelligence commerciale ».
 * « Laura » est un NOM, « copilote » est le nom commun de la CATÉGORIE.
 * Tenu par `public-kb.test.ts`.
 */
export const PUBLIC_PRODUCT_KB: readonly KbEntry[] = [
  {
    topic: 'what_is_bellum',
    asks: ["c'est quoi bellum", 'que fait bellum', 'à quoi ça sert', 'what is bellum'],
    answer:
      "BellumAI est un copilote d'intelligence commerciale pensé pour les ESN. Il aide à comprendre un compte, détecter les projets et signaux, trouver les bons interlocuteurs, préparer les messages et transformer tout ça en prochaines actions. Le but n'est pas de t'ajouter une base de données de plus, mais de réduire le temps entre « je veux ouvrir ce compte » et « je sais quoi faire maintenant ».",
  },
  {
    topic: 'vs_chatgpt',
    asks: ['pourquoi pas chatgpt', 'différence chatgpt', 'why not chatgpt'],
    answer:
      "ChatGPT est généraliste. Bellum est construit autour d'objets et de workflows ESN : comptes, entités, projets, contacts, influence, actions, talents, missions et outils connectés. La différence est surtout le contexte structuré et la capacité à relier l'analyse à ton activité commerciale.",
  },
  {
    topic: 'vs_crm',
    asks: ['remplace hubspot', 'remplace un crm', 'vs salesforce', 'vs pipedrive'],
    answer:
      "Ça dépend de ton usage. Un CRM généraliste reste très complet sur le suivi. Bellum vise à ajouter la couche intelligence et exécution spécifique ESN : quels comptes, quels projets, quels contacts, quels messages, quelles actions. Quand le CRM est connecté, l'objectif est justement d'éviter la double saisie.",
  },
  {
    topic: 'vs_ats',
    asks: ['remplace boondmanager', 'vs ats', 'vs erp esn'],
    answer:
      "Pas nécessairement. Un ERP/ATS d'ESN couvre beaucoup de processus de gestion. Bellum se concentre sur l'intelligence commerciale, la détection, la priorisation, le matching et les actions. Certaines briques peuvent se recouvrir progressivement, mais je préfère te dire exactement ce qui est disponible aujourd'hui selon ton besoin.",
  },
  {
    topic: 'demo',
    asks: ['démo gratuite', 'tester', 'essayer', 'free demo'],
    answer:
      'Oui. Tu peux explorer la démo sans toucher à tes propres données. Elle sert à comprendre le parcours, les dossiers de comptes, les contacts, le Copilote et les principales actions.',
  },
  {
    topic: 'automation',
    asks: ['automatiser les relances', 'automatisation', 'envoi automatique'],
    answer:
      "Bellum est pensé pour préparer et orchestrer ce type d'action. Trois niveaux : il lit les informations autorisées, il prépare l'action, et il exécute uniquement selon les droits et validations disponibles. Le niveau d'exécution dépend des intégrations et des droits de ton espace — dis-moi quel outil tu utilises pour tes e-mails et ton CRM et je te dis ce qui est prévu.",
  },
  {
    topic: 'data_reliability',
    asks: ['données fiables', 'fiabilité', 'sources', 'hallucination'],
    answer:
      "Bellum croise plusieurs sources et distingue autant que possible les faits, les signaux et les interprétations. Une donnée externe peut être incomplète ou évoluer : l'interface garde une notion de source, de fraîcheur et de confiance. Pour une action critique, il faut garder une vérification humaine.",
  },
  {
    topic: 'gdpr',
    asks: ['rgpd', 'gdpr', 'conformité', 'données personnelles', 'hébergement'],
    answer:
      "Bellum est conçu pour limiter les données collectées au nécessaire et encadrer les accès par utilisateur et par espace de travail. Pour une réponse juridique ou contractuelle précise, je préfère te renvoyer vers la documentation officielle ou l'équipe plutôt que de te donner une garantie trop large.",
  },
  {
    topic: 'small_esn',
    asks: ['petite esn', 'on est 3', 'ça vaut le coup', 'trop petit'],
    answer:
      "Oui si ton principal enjeu est de mieux choisir tes comptes et de gagner du temps sur la préparation commerciale. Une petite ESN n'a pas intérêt à prospecter tout un groupe comme un grand intégrateur : Bellum peut justement aider à trouver des périmètres plus accessibles et des interlocuteurs plus réalistes.",
  },
  {
    topic: 'already_equipped',
    asks: ['on est déjà équipés', 'on a déjà un crm', 'on a déjà un ats'],
    answer:
      "C'est souvent le meilleur cas pour une intégration : l'objectif n'est pas de jeter ton CRM, ta messagerie ou ton ATS, mais de faire circuler le contexte entre eux et d'automatiser les tâches répétitives. Quels outils sont centraux chez vous aujourd'hui ?",
  },
  {
    topic: 'own_account',
    asks: ['sur mon compte', 'mon cas', 'un compte réel', 'tester sur un client'],
    answer:
      "C'est exactement la bonne façon de l'évaluer. Tu peux d'abord voir la démo, puis réserver un créneau pour confronter Bellum à un de tes comptes réels.",
  },
]

/** Le sujet le plus proche d'une question, ou `null` — jamais une devinette. */
export function findKbEntry(question: string): KbEntry | null {
  const normalized = question.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  let best: { entry: KbEntry; length: number } | null = null
  for (const entry of PUBLIC_PRODUCT_KB) {
    for (const ask of entry.asks) {
      const needle = ask.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      // Le libellé le PLUS LONG gagne : « remplace hubspot » doit battre
      // « démo » quand les deux apparaissent dans la même phrase.
      if (normalized.includes(needle) && (!best || needle.length > best.length)) {
        best = { entry, length: needle.length }
      }
    }
  }
  return best?.entry ?? null
}

/** Les pains que Bellum couvre RÉELLEMENT — sert le score de qualification.
 *  Un pain hors de cette liste compte moins, il ne disqualifie pas. */
export const COVERED_PAINS: readonly string[] = [
  'trouver les bons comptes',
  'comprendre les grands comptes / filiales',
  'détecter des projets et signaux',
  'trouver les bons décideurs',
  'enrichir emails / téléphones',
  'rédiger messages et relances',
  'maintenir le crm à jour',
  'automatiser les actions commerciales',
  'sourcer / matcher des profils',
  'suivre missions / renouvellements',
]

export function isPainCovered(pain: string | undefined): boolean {
  if (!pain) return false
  const normalized = pain.trim().toLowerCase()
  return COVERED_PAINS.some(covered => covered === normalized)
}
