import type {
  ApolloContactProfile,
  ContactActivity,
  ContactRelation,
  ContactSignal,
  MarketLocale,
} from '@bellum/contracts'

/**
 * Fiche contact COMPLÈTE en espace de démonstration.
 *
 * Le problème que ce fichier résout : une fiche de démo n'avait que ce que le
 * jeu de données écrivait à la main — nom, titre, rôle, messages. Tout ce
 * qu'une vraie analyse remplit ensuite (périmètre, pouvoir budgétaire, script
 * d'appel, cadence, signaux, activité, relations, profil enrichi) restait vide,
 * et la fiche s'ouvrait sur des onglets « Aucune relation identifiée ».
 *
 * Pourquoi DÉRIVER plutôt qu'écrire quinze fiches à la main : un contact ajouté
 * au jeu de données ne doit pas pouvoir arriver à moitié rempli. Ici, tout
 * contact obtient sa fiche complète du seul fait d'exister — c'est la garantie
 * « tous les contacts, à 100 % », et elle ne dépend de la vigilance de personne.
 *
 * Rien n'est inventé au-delà du périmètre déjà fictif du jeu de démonstration :
 * ces personnes n'existent pas, leurs entreprises non plus, et tout ce qui est
 * produit ici en découle mécaniquement (rôle de décision, famille, entité,
 * ville du siège). Les adresses restent sur `.example` (RFC 2606).
 */

/** Ce que le générateur a besoin de savoir d'un contact. */
export type DemoContactSeed = {
  full_name: string
  title: string
  entity: string
  family: string
  // #2648.1 — `null` : un contact rencontré sans même que son rôle de décision
  // soit connu (pas seulement l'entreprise, comme `DEMO_UNQUALIFIED_CONTACTS`).
  // La colonne SQL `contacts.decision_role` est déjà nullable (pas de
  // `NOT NULL`, `contacts_decision_role_check` accepte `NULL`) : ce type
  // s'aligne sur la vraie contrainte plutôt que d'imposer une chaîne partout.
  decision_role: string | null
  priority: number | null
  seniority: string
  key_points: string[]
  why_contact: string
}

/** Ce que le générateur a besoin de savoir du dossier qui porte le contact. */
export type DemoDossierSeed = {
  company_name: string
  sector: string
  headquarters: string
  recent_signals: {
    signal?: string | null
    source?: string | null
    type?: string | null
    date?: string | null
    url?: string | null
    location?: string | null
  }[]
}

/** Retire les accents et tout ce qui n'est pas alphanumérique (mêmes règles que
 *  `demo-enrichment.ts` — les deux fabriquent des identifiants lisibles). */
function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Ville du siège, à partir des DEUX formes que `headquarters` porte dans le
 * jeu de données : « Ville, Région » (ville en premier) et l'adresse complète
 * des six dossiers réels, « rue, code postal ville » (ville en dernier,
 * précédée d'un code postal). #2165.38 — sans distinguer les deux, la seconde
 * forme rendait la RUE entière comme « ville », donc une localisation fausse,
 * invisible au filtre pays de Découvrir.
 */
function headquartersCity(headquarters: string): string {
  const parts = headquarters
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'Paris'
  const last = parts[parts.length - 1]!
  const afterPostalCode = /^\d{4,6}\s+(.+)$/.exec(last)
  return (afterPostalCode ? afterPostalCode[1] : parts[0])!.trim() || 'Paris'
}

/** Une entité espagnole ne se démontre pas en français : la langue et le fuseau
 *  suivent l'entité, pas le siège du groupe. */
function isIberian(entity: string): boolean {
  return /ib[ée]rica|espa/i.test(entity)
}

/**
 * Ce que la personne CONTRÔLE — la ligne « Périmètre » de l'onglet Rôle.
 * Dérivée de la famille métier et de l'entité : c'est exactement ce que la
 * phase 3 écrit à partir des mêmes signaux.
 */
export function demoScope(seed: DemoContactSeed, dossier: DemoDossierSeed): string {
  const entity = seed.entity || dossier.company_name
  const byFamily: Record<string, string> = {
    IT: `Système d’information de ${entity} : infrastructure, applications métier et budget informatique consolidé.`,
    Dev: `Plateformes et produits numériques de ${entity} : équipes de développement, architecture applicative, delivery.`,
    Cyber: `Sécurité des systèmes d’information de ${entity} : conformité, gestion des vulnérabilités, sensibilisation.`,
    Finance: `Finances de ${entity} : arbitrage des investissements, contrôle de gestion, engagement des dépenses.`,
    Achat: `Achats informatiques de ${entity} : référencement des fournisseurs, conditions contractuelles, appels d’offres.`,
    PMO: `Pilotage des projets de ${entity} : planning, coordination des équipes, suivi des jalons.`,
    'C-Level': `Direction de ${entity} : orientations, arbitrages et engagement des moyens.`,
  }
  return byFamily[seed.family] ?? `Périmètre opérationnel au sein de ${entity}.`
}

/**
 * Ce que la personne PEUT ENGAGER — la ligne « Pouvoir budgétaire ». Dérivée du
 * rôle MEDDIC, seule source honnête : un titre ne dit pas qui signe.
 */
export function demoBudgetAuthority(seed: DemoContactSeed): string {
  const byRole: Record<string, string> = {
    economic: 'Décide — arbitre le budget et signe l’engagement.',
    technical: 'Prescrit — valide la solution sur le fond, ne signe pas seul.',
    procurement: 'Cadre l’achat — référencement, conditions et mise en concurrence.',
    user: 'Exprime le besoin — pas de budget propre, mais son avis conditionne le lancement.',
    champion: 'Relaie en interne — porte le sujet auprès de ceux qui arbitrent.',
    influencer: 'Influence sans budget propre — sa validation débloque ou bloque.',
    blocker: 'Point de passage obligé — peut arrêter le projet sans le financer.',
  }
  return byRole[seed.decision_role ?? ''] ?? 'Rôle dans la décision à confirmer lors du premier échange.'
}

/** Script d'appel (« Préparer mon appel », LUDB.8 bis) — accroche, sujet, deux questions de découverte, demande.
 *  Quatre lignes ; jamais de numéro (il n'est pas inventé). #4975.1 / #4976.1 — AUCUNE objection : elle vit dans le
 *  bloc « Si l'on te répond… » et vient du dossier du compte ; en inventer une ici contredirait « aucune relevée ». */
export function demoPhoneScript(seed: DemoContactSeed, dossier: DemoDossierSeed): string {
  const firstName = seed.full_name.replace(/^Dr\s+/i, '').split(/\s+/)[0] ?? ''
  // #4977.1 — l'appel s'ouvre sur l'OFFRE d'emploi du dossier quand il en porte une (poste ET ville), comme le moteur le
  // fait pour une offre cochée : sans cela, « Régénérer » (indisponible en démo) laissait l'ouverture sur le 1er signal.
  const offer = dossier.recent_signals.find(item => item.type === 'recrutement' && item.signal)
  if (offer?.signal) {
    const city = offer.location?.replace(/\s*\(\d+\)\s*$/, '').trim()
    const offerText = city && !offer.signal.includes(city) ? `${offer.signal} — ${city}` : offer.signal
    return [
      `Accroche — « Bonjour ${firstName}, je vous appelle au sujet de votre offre d’emploi : ${offerText}. »`,
      ...demoPhoneScript(seed, { ...dossier, recent_signals: [] })
        .split('\n')
        .slice(1),
    ].join('\n')
  }
  const signal = dossier.recent_signals[0]?.signal ?? 'votre actualité récente'
  return [
    `Accroche — « Bonjour ${firstName}, je vous appelle au sujet de ${signal.charAt(0).toLowerCase()}${signal.slice(1)}. »`,
    `Sujet — « ${seed.why_contact} »`,
    'Découverte — « Où en est ce sujet chez vous aujourd’hui ? » / « Qui d’autre prend part à la décision ? »',
    'Demande — « Vingt minutes la semaine prochaine pour vous montrer comment nous l’avons fait ailleurs ? »',
  ].join('\n')
}

/** Les trois messages de relance (carte « Cadence »). */
export function demoCadenceMessages(
  seed: DemoContactSeed,
  dossier: DemoDossierSeed,
): { relance: string; preuveSociale: string; closeLoop: string } {
  const firstName = seed.full_name.replace(/^Dr\s+/i, '').split(/\s+/)[0] ?? ''
  return {
    relance: `Bonjour ${firstName}, je reviens vers vous — mon message précédent est peut-être passé au mauvais moment. Le sujet reste d’actualité de votre côté ?`,
    preuveSociale: `Bonjour ${firstName}, nous venons de livrer un chantier comparable dans ${dossier.sector.toLowerCase()}. Je peux vous en partager le déroulé et les écueils si c’est utile.`,
    closeLoop: `Bonjour ${firstName}, sans retour je referme le sujet de mon côté — dites-moi simplement si je dois vous relancer plus tard dans l’année.`,
  }
}

/** Le message de relance long (carte « Séquence »). */
export function demoFollowupMessage(
  seed: DemoContactSeed,
  dossier: DemoDossierSeed,
): { subject: string; body: string } {
  const firstName = seed.full_name.replace(/^Dr\s+/i, '').split(/\s+/)[0] ?? ''
  return {
    subject: `Relance — ${dossier.company_name}`,
    body: [
      `Bonjour ${firstName},`,
      '',
      `Je reviens vers vous après mon message sur ${seed.why_contact.charAt(0).toLowerCase()}${seed.why_contact.slice(1)}`,
      '',
      'Si le sujet n’est pas prioritaire aujourd’hui, dites-le-moi : je reviendrai au bon moment plutôt que d’insister.',
      '',
      'Bien à vous,',
    ].join('\n'),
  }
}

/** Ce que la personne cherche à gagner (« leviers de carrière », onglet Rôle). */
export function demoCareerLevers(seed: DemoContactSeed): string[] {
  const byRole: Record<string, string[]> = {
    economic: ['Tenir la trajectoire de marge', 'Montrer un retour sur investissement mesurable'],
    technical: ['Livrer sans dette technique supplémentaire', 'Être reconnu comme celui qui a sécurisé le chantier'],
    procurement: ['Obtenir de meilleures conditions à qualité égale', 'Réduire le nombre de fournisseurs à piloter'],
    user: ['Que l’outil serve enfin son équipe', 'Ne plus subir des arbitrages pris sans elle'],
    champion: ['Faire aboutir un sujet qu’il porte depuis longtemps', 'Gagner en visibilité auprès de la direction'],
    influencer: ['Voir ses recommandations suivies', 'Être associé en amont, pas consulté après coup'],
    blocker: ['Ne pas être celui par qui l’incident arrive', 'Tenir la conformité sans bloquer le métier'],
  }
  return byRole[seed.decision_role ?? ''] ?? ['Faire avancer son sujet sans prendre de risque inutile']
}

/** Ce que la personne craint sans le dire (« craintes implicites »). */
export function demoImplicitFears(seed: DemoContactSeed): string[] {
  const byRole: Record<string, string[]> = {
    economic: ['Un budget qui dérive sans résultat visible', 'Devoir défendre en comité une dépense mal cadrée'],
    technical: ['Hériter d’une solution qu’il faudra maintenir seul', 'Un prestataire qui part avant la stabilisation'],
    procurement: ['Un référencement contourné par le métier', 'Un contrat mal borné sur les évolutions'],
    user: ['Un outil imposé qui ajoute du travail', 'Ne pas être écouté sur les vrais irritants'],
    champion: ['Porter un sujet qui échoue publiquement', 'Ne pas obtenir l’arbitrage promis'],
    influencer: ['Recommander un partenaire qui déçoit', 'Être court-circuité par la direction'],
    blocker: ['Valider ce qui deviendra une faille', 'Être tenu responsable d’un choix subi'],
  }
  return byRole[seed.decision_role ?? ''] ?? ['Engager sa crédibilité sur un choix qu’il ne maîtrise pas']
}

/**
 * Signaux rattachés à la personne (onglets Résumé et Signaux). Les signaux du
 * compte sont repris tels quels — ils s'appliquent à ses interlocuteurs.
 * #3420 : les `key_points` de la personne ne s'y répètent PLUS — ils se lisent
 * déjà dans « Pourquoi c'est un contact clé » (une phrase, un seul endroit).
 */
export function demoContactSignals(seed: DemoContactSeed, dossier: DemoDossierSeed): ContactSignal[] {
  const fromAccount: ContactSignal[] = dossier.recent_signals.slice(0, 2).map(signal => ({
    label: signal.signal ?? 'Signal du compte',
    source: signal.source ?? 'Analyse du compte (démo)',
    type: signal.type ?? 'compte',
    date: signal.date ?? null,
    // Théo B c5 — la page d'origine suit le signal ; sans URL, pas de lien (rien d'inventé).
    ...(signal.url ? { source_url: signal.url } : {}),
  }))
  return fromAccount
}

/**
 * Journal d'activité de la fiche. Volontairement court et FACTUEL : ce sont les
 * étapes que la plateforme a réellement franchies sur ce contact (détecté,
 * classé, priorisé), jamais un échange commercial qui n'a pas eu lieu.
 */
export function demoContactActivity(seed: DemoContactSeed, dossier: DemoDossierSeed): ContactActivity[] {
  return [
    {
      label: 'Contact détecté',
      detail: `Identifié lors de l’analyse de ${dossier.company_name}.`,
      status: 'done',
      at: null,
    },
    {
      label: 'Rôle qualifié',
      detail: `Classé « ${seed.decision_role} » dans la cartographie de décision, priorité ${seed.priority}.`,
      status: 'done',
      at: null,
    },
    {
      label: 'Messages préparés',
      detail: 'Email, message LinkedIn et script d’appel générés et prêts à envoyer.',
      status: 'done',
      at: null,
    },
  ]
}

/** Langue de travail — suit l'entité, pas le siège du groupe. */
export function demoLanguage(seed: DemoContactSeed): string {
  return isIberian(seed.entity) ? 'es' : 'fr'
}

/** Fuseau horaire — même règle que la langue. */
export function demoTimezone(seed: DemoContactSeed): string {
  return isIberian(seed.entity) ? 'Europe/Madrid' : 'Europe/Paris'
}

/**
 * #2861 (#2437.2) — le niveau DESTINATAIRE (`contacts.locale`), distinct de
 * `language` juste au-dessus : `language` est la langue de TRAVAIL du script
 * d'appel (catalogue libre, `'es'` compris) ; `locale` est le catalogue
 * `marketLocaleSchema` (`fr`/`en`/`de`) qui choisit la LANGUE DU MESSAGE
 * envoyé à CE destinataire. `'es'` n'y figure pas — un contact ibérique
 * reçoit un message en anglais, jamais deviné en `'es'` hors catalogue.
 */
export function demoLocale(seed: DemoContactSeed): MarketLocale {
  return isIberian(seed.entity) ? 'en' : 'fr'
}

/** Ville de rattachement, telle que l'enrichissement la renseigne. */
export function demoLocation(seed: DemoContactSeed, dossier: DemoDossierSeed): string {
  if (isIberian(seed.entity)) return 'Bilbao, Espagne'
  // Recette 31/10 — un siège francilien (75/77/78/91/92/93/94/95) nomme sa région : la zone du profil de
  // démo est « Paris & Île-de-France », « Puteaux, France » ne la recoupait jamais (10/10 « Hors zone »).
  const idf = /\b(?:75|77|78|91|92|93|94|95)\d{3}\b/.test(dossier.headquarters) ? ', Île-de-France' : ''
  // #4556.4 — idem pour l'Occitanie (Airbus, Blagnac 31700) : la zone du profil de démo « Toulouse & Occitanie » ne
  // recoupait jamais « 2 ROND-POINT DEWOITINE, France » (4+ contacts « Hors zone » alors que le siège est en zone).
  const occ = /\b(?:09|11|12|30|31|32|34|46|48|65|66|81|82)\d{3}\b/.test(dossier.headquarters) ? ', Occitanie' : ''
  return `${headquartersCity(dossier.headquarters)}${idf}${occ}, France`
}

/**
 * Le profil enrichi de la fiche, en espace de démonstration.
 *
 * ⚠️ CE QU'IL NE CONTIENT PLUS, et pourquoi. Ce profil fabriquait un parcours
 * professionnel (« poste précédent, 2018-2022 »), une formation (« Master ») et
 * une adresse de profil sur le vrai domaine du réseau professionnel. C'était
 * cohérent tant que les personnes étaient inventées ; les sociétés sont
 * désormais réelles, et leurs mandataires sociaux aussi. Fabriquer une
 * biographie pour quelqu'un qui existe, sur un lien public, est exactement ce
 * que ce produit reproche aux outils qui inventent.
 *
 * Ne reste donc que ce qui est VRAI PAR CONSTRUCTION, parce que dérivé de la
 * fiche elle-même : le titre, l'entité, la ville du siège, la famille métier.
 * Le parcours et la formation sont des listes VIDES — une absence, pas un
 * marque-place.
 */
export function demoApolloProfile(seed: DemoContactSeed, dossier: DemoDossierSeed): ApolloContactProfile {
  const iberian = isIberian(seed.entity)
  const city = iberian ? 'Bilbao' : headquartersCity(dossier.headquarters)
  const region = iberian ? 'Pays basque' : (dossier.headquarters.split(',')[1]?.trim() ?? '')
  const departmentByFamily: Record<string, string> = {
    IT: 'information_technology',
    Dev: 'engineering',
    Data: 'engineering',
    Cyber: 'information_technology',
    Finance: 'finance',
    Achat: 'operations',
    PMO: 'operations',
    RH: 'human_resources',
    'C-Level': 'executive',
  }
  const department = departmentByFamily[seed.family] ?? 'operations'
  return {
    headline: `${seed.title} chez ${seed.entity || dossier.company_name}`,
    seniority: seed.seniority,
    city,
    state: region || null,
    country: iberian ? 'Espagne' : 'France',
    // Aucune adresse de profil : une URL construite sur le vrai domaine du
    // réseau professionnel mène soit nulle part, soit chez un homonyme.
    linkedin_url: null,
    twitter_url: null,
    github_url: null,
    facebook_url: null,
    departments: [department],
    subdepartments: [seed.family.toLowerCase()],
    functions: [department],
    // Parcours et formation : VIDES. Sur ton espace, ces deux listes sont
    // remplies par le fournisseur d'enrichissement ; ici, les inventer
    // écrirait la biographie de quelqu'un qui existe.
    employment_history: [],
    education: [],
    personal_emails: [],
    phone_numbers: [],
  }
}

/**
 * Relations de la personne dans l'organisation (onglet « Relations »).
 *
 * Construites à partir des AUTRES contacts réellement seedés sur le même
 * compte : chaque relation porte donc l'identifiant d'une fiche qui existe, et
 * le lien « Voir la fiche » fonctionne. Inventer un nom de plus produirait une
 * carte cliquable qui ne mène nulle part.
 *
 * `tier` 1 = même entité (lien plein), 2 = autre entité du groupe (pointillés).
 * La nature du lien se déduit de la priorité, qui est l'ordre de séniorité que
 * la phase 3 a déjà établi — on ne devine aucun rattachement hiérarchique
 * au-delà de ce que le dossier affirme.
 */
export function demoContactRelations(
  self: { id: string; entity: string | null; priority: number | null },
  siblings: {
    id: string
    full_name: string
    title: string | null
    entity: string | null
    decision_role: string | null
    priority: number | null
  }[],
): ContactRelation[] {
  const selfPriority = self.priority ?? 99
  return siblings
    .filter(sibling => sibling.id !== self.id)
    .map(sibling => {
      const sameEntity = (sibling.entity ?? '') === (self.entity ?? '')
      const siblingPriority = sibling.priority ?? 99
      const relationship = sameEntity
        ? siblingPriority < selfPriority
          ? 'Responsable hiérarchique probable'
          : siblingPriority === selfPriority
            ? 'Pair — même entité'
            : 'Équipe rattachée'
        : `Interlocuteur d’une autre entité (${sibling.entity ?? 'groupe'})`
      return {
        id: sibling.id,
        name: sibling.full_name,
        title: sibling.title,
        entity: sibling.entity,
        // Le rôle de décision est repris tel quel : c'est une valeur du contrat,
        // pas une étiquette libre. `null` quand la fiche n'en porte pas.
        decision_role: (sibling.decision_role ?? null) as ContactRelation['decision_role'],
        relationship,
        tier: sameEntity ? 1 : 2,
      }
    })
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9))
}
