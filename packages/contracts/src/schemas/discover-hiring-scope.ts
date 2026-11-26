// ── Découvrir : une offre HORS des métiers de l'ESN ne s'affiche pas (#3901.p) ──
// ⚠️⚠️ RENVERSEMENT ASSUMÉ ET DATÉ — décision Louis 16/10/2026 (capture prod : la carte LA POSTE
// montrait « CDD Facteur », « Conseiller en Service Relation Client » ; « j'en ai rien à foutre
// d'avoir des offres sur des facteurs »). Elle renverse « hors domaine = rang, jamais effacé »
// (#3901.w / #4088.7) POUR DÉCOUVRIR : l'offre hors métier n'est plus rangée en fin, elle sort de
// la carte, du classement et de « Ce qui a pesé ». La fiche compte garde « Autres recrutements (N) »
// replié (#3901.6 du 15/10, inchangé). Le registre : agent_docs/doctrine.md.
//
// Les métiers de l'ESN = métiers DÉCLARÉS ; à défaut, métiers DÉDUITS (lot du 11/10,
// `inferred_placed_roles`) ; jamais une liste IT fixe (une ESN industrie garde ses offres industrie).
// Ni déclarés ni déduits : l'offre n'est pas un signal fort et l'écran le DIT (on n'affiche pas ce
// qu'on n'a pas). Un poste que ne place clairement aucune ESN (facteur, livreur, caissier…) n'est
// jamais un signal fort, quel que soit le profil — mais la règle principale reste par MÉTIER.
// `recruitsForClients` (14/10, #1124.1) garde sa place : un placeur en CDI garde toute ouverture
// qui n'est pas un poste clairement non placé.
//
// UN seul endroit décide (GA-26). Jumeau Python : `hiring_scope_verdict`
// (apps/ia/app/services/discover_hiring_scope.py), même jeu de cas :
// `fixtures/discover-hiring-scope.json`.

import { foldForRoleMatch, offerMatchesRoleTerms } from './placed-roles-inference.js'

export type HiringScopeProfile = {
  /** `esn_profiles.placed_roles` — DÉCLARÉS. */
  placedRoles: readonly string[]
  /** Métiers DÉDUITS (lot du 11/10) : ne pèsent que si rien n'est déclaré. */
  inferredPlacedRoles?: readonly { role: string; terms: readonly string[] }[]
  recruitsForClients?: boolean
}

type HiringScopeReason = 'non_placed' | 'off_trade' | 'no_roles'
type HiringScopeVerdict = { keep: true } | { keep: false; reason: HiringScopeReason }

/** Postes que NULLE ESN ne place — repliés (sans accents). Un filet, pas la règle : la règle est le métier. */
const NON_PLACED_POSITIONS: readonly RegExp[] = [
  /\b(facteur|factrice|facteurs|factrices)\b/,
  /\b(livreur|livreuse|coursier|coursiere)\b/,
  /\b(caissier|caissiere|hote(sse)? de caisse)\b/,
  // #4403.1 — hôte / hôtesse de vente, d'accueil : « Hôte(sse) de vente » (repli : « hote sse de vente »).
  /\bhote(?: ?sse| ?e)?s? (?:de |d )?(?:vente|accueil)\b/,
  /\b(agent|agente|employe|employee) (d |de |du )?(entretien|proprete|nettoyage|restauration|libre service|rayon)\b/,
  /\b(femme|homme) de menage\b/,
  // #4398.1 — formes inclusives repliées : « Conseiller-ère Vente » → « conseiller ere vente », « Conseiller(e) » → « conseiller e ».
  /\bconseill(er|ere)s?( ere| e)? (de )?(clientele|relation client|relation clientele|accueil|vente)\b/,
  /\bconseill(er|ere)s?( ere| e)? en (service )?(relation client|relation clientele|agence)\b/,
  /\bconseill(er|ere)s?( ere| e)? clientele\b/,
  // #4398.1 — « Technicien-ne Atelier » (repli : « technicien ne atelier ») : poste d'atelier, nulle ESN ne le place.
  /\btechnicien(ne)?s?( ne| e)? (d |de |du )?atelier\b/,
  /\b(chauffeur|cariste|manutentionnaire|magasinier|preparateur de commandes?|agent de securite|agente? ssiap)\b/,
  /\b(serveur|serveuse|cuisinier|cuisiniere|boulanger|boulangere|aide soignant(e)?|auxiliaire de vie)\b/,
  // #3901.p (recette 16/10, Adecco) — postes d'atelier / de chantier : nulle ESN ne les place.
  /\b(ouvrier|ouvriere|operateur de production|agent de fabrication|agent de production|agent de conditionnement)\b/,
  // SIMON-FIX S.14 (recette 20/10, espace ESN IT) — santé, soin, tri de colis : « Infirmier », « Kiné »,
  // « Agent de tri » sortaient 10 sur 10 pour un placeur en CDI (qui garde toute ouverture hors de cette liste).
  /\b(infirmier|infirmiere|infirmiers|infirmieres|kinesitherapeute|kinesitherapeutes|kine|osteopathe|orthophoniste|ergotherapeute|psychomotricien|psychomotricienne|podologue|dieteticien|dieteticienne)\b/,
  /\b(medecin|medecins|pharmacien|pharmacienne|sage femme|chirurgien|chirurgienne|dentiste|ambulancier|ambulanciere|brancardier|brancardiere|puericultrice|auxiliaire de puericulture)\b/,
  /\b(aide|aides) (a domicile|medico psychologique)\b/,
  /\b(manipulateur|manipulatrice) (en )?(radio|radiologie|electroradiologie)\b/,
  /\b(educateur|educatrice) (specialise|specialisee|de jeunes enfants)\b/,
  /\b(assistant|assistante) maternel(le)?\b/,
  /\bagent(e)? de service hospitalier\b/,
  /\b(preparateur|preparatrice) en pharmacie\b/,
  /\b(agent|agente|trieur|trieuse) (de )?(tri|quai)\b/,
  // SIMON-FIX S.14 (recette Simon 20/10, Adecco / Manpower) — « Manœuvre bâtiment », « Plombier » sur une
  // ESN de conseil IT. Le repli sépare « œ » (« man uvre ») : le motif accepte les trois écritures.
  /\bman ?(oe ?)?uvres?\b/,
  /\b(plombier|plombiere|macon|maconne|couvreur|couvreuse|carreleur|carreleuse|plaquiste|charpentier|charpentiere|ferrailleur|coffreur|grutier|zingueur|peintre en batiment|agent de chantier)\b/,
]

/**
 * #3901.p (recette 16/10) — postes de support / métiers d'agence : une ESN peut en placer SI son profil les
 * déclare ou les déduit (supply chain → acheteur, logistique). Un placeur en CDI (`recruitsForClients`) qui
 * n'a aucun métier correspondant ne les garde pas : « Acheteur », « Assistant de gestion », « Assistant
 * d'agence », « Formation », « Logistique » seuls sur la carte n'étaient pas des signaux.
 */
const SUPPORT_POSITIONS: readonly RegExp[] = [
  /\b(acheteur|acheteuse)\b/,
  /\bassistant(e)? (de gestion|d agence|de direction|administratif|administrative|commercial|commerciale)\b/,
  /^(formation|logistique|transport|vente|accueil)$/,
  // #3901.7 (recette 18/10) — « Technicien d'usinage fraisage », « comptable expérimenté », « Pilote de
  // Flux », « Chargé de Développement Commercial » restaient sur la carte d'un placeur en CDI : métiers
  // d'atelier, de comptabilité, de logistique et de vente, gardés SEULEMENT si le profil les nomme.
  /\b(technicien|technicienne|operateur|operatrice) (d |de |du )?(usinage|fraisage|tournage|decoupe|maintenance industrielle)\b/,
  /\b(usinage|fraisage|tourneur|fraiseur|soudeur|soudeuse|chaudronnier|chaudronniere)\b/,
  /\b(comptable|comptables|aide comptable)\b/,
  /\bpilote (de )?flux\b/,
  /\bcharge(e)? (de )?developpement (commercial|commerciale|clientele|des ventes)\b/,
  // V4-CORRECTIFS-C 4284.1 — « Formateur en Pharmacie », « Climate & Carbon Senior Manager » restaient sur les
  // cartes tech/télécom/média d'un placeur : métiers de formation métier et de RSE/climat, gardés SEULEMENT si le profil les nomme.
  /\b(formateur|formatrice|formateurs|formatrices)\b/,
  /\b(climate|carbon|carbone|esg|rse|developpement durable|sustainability|environnement)\b/,
]

// ── L1 (#4284.1, #4396, #4398, #4403 — recette 21/10) : la LISTE BLANCHE par familles de métiers ──
// Un profil déduit peut porter un terme large (« technicien », « ingénieur ») qui laisse passer « technicien
// maintenance des trains ». Les familles dérivent du profil (métiers déclarés ou termes déduits) : une offre
// d'une famille que le profil ne couvre pas est hors métier ; une offre d'une famille couverte est dans le
// métier (industrie → industrie : « Électrotechnicien » chez une ESN industrie). La liste noire reste le filet.
type TradeFamily = 'numerique' | 'industrie'
const TRADE_FAMILIES: Readonly<Record<TradeFamily, readonly RegExp[]>> = {
  numerique: [
    /\b(developpeur|developpeuse|devops|sre|data|donnees|bi|cloud|cyber|cybersecurite|soc|pentest|rssi)\b/,
    /\b(informatique|numerique|logiciel|software|fullstack|full stack|frontend|backend|java|python|javascript|react|angular|php|net|kubernetes|aws|azure|linux)\b/,
    // #4396/#4398 (recette prod 25/10) — « exploitation » seul laissait passer « Agent d'exploitation en mobilier
    // urbain » : le mot n'est du numérique qu'avec son objet (exploitation informatique / SI / systèmes) ou son rôle.
    /\b(exploitation (informatique|si|it|systemes?|reseaux?|production it)|(ingenieur|administrateur|admin|pilote) (d |de )?exploitation)\b/,
    /\b(sap|erp|salesforce|servicenow|oracle|scrum|product owner|pmo|amoa|test|tests|testeur|qa|helpdesk|service desk|telecom|telecoms|reseau|reseaux|systemes?|architecte si|it)\b/,
  ],
  industrie: [
    /\b(industrie|industriel|industrielle|electrotechnicien|electrotechnique|electricien|automaticien|automatisme|automatismes|mecanique|mecanicien|mecatronique|hse|process|usine|ferroviaire|train|trains|chantier|bureau d etudes|cao|dao|genie civil|genie electrique|instrumentation|chaudronnerie|soudeur|maintenance)\b/,
  ],
}

function tradeFamiliesOf(text: string): Set<TradeFamily> {
  const folded = foldForRoleMatch(text)
  const found = new Set<TradeFamily>()
  for (const [family, patterns] of Object.entries(TRADE_FAMILIES) as [TradeFamily, readonly RegExp[]][])
    if (patterns.some(pattern => pattern.test(folded))) found.add(family)
  return found
}

function profileFamilies(profile: HiringScopeProfile): Set<TradeFamily> {
  const found = new Set<TradeFamily>()
  const declared = declaredRoles(profile)
  // le déclaré gagne sur le déduit : les termes déduits ne comptent que si rien n'est déclaré.
  for (const text of declared.length > 0 ? declared : deducedTerms(profile))
    for (const family of tradeFamiliesOf(text)) found.add(family)
  return found
}

/** La famille de l'offre est-elle couverte (true), hors du profil (false), ou indéterminée (null) ? */
function familyFit(label: string, profile: HiringScopeProfile): boolean | null {
  const mine = profileFamilies(profile)
  const offer = tradeFamiliesOf(label)
  if (mine.size === 0 || offer.size === 0) return null
  return [...offer].some(family => mine.has(family))
}

/**
 * #4403.1 — un poste que NULLE ESN ne place, quel que soit le profil (même placeur en CDI, même profil sans métier) :
 * /mes-cibles et la fiche compte le MARQUENT hors métier avec ce même prédicat (GA-26).
 */
export function isNonPlacedPosition(label: string): boolean {
  const folded = foldForRoleMatch(label)
  return NON_PLACED_POSITIONS.some(pattern => pattern.test(folded))
}

function declaredRoles(profile: HiringScopeProfile): string[] {
  return profile.placedRoles.map(role => role.trim()).filter(role => role.length > 0)
}

function deducedTerms(profile: HiringScopeProfile): string[] {
  return (profile.inferredPlacedRoles ?? []).flatMap(role => [...role.terms])
}

/** Le profil a-t-il des métiers (déclarés ou déduits) pour juger une offre ? */
export function hasHiringRoles(profile: HiringScopeProfile | undefined): boolean {
  return Boolean(profile) && (declaredRoles(profile!).length > 0 || deducedTerms(profile!).length > 0)
}

// #4733 — jumeau de `is_executive_recruitment_title` (apps/ia/app/services/hierarchy_level.py), même jeu de cas.
const EXECUTIVE_ROLE =
  /\bCOO\b|\bCFO\b|\bDAF\b|chief\s+(operating|financial)\s+officer|direct(?:eur|rice)\s+(des\s+op[ée]rations|financi(?:er|[èe]re)|administratif(?:ve)?\s+et\s+financi(?:er|[èe]re))|direct(?:eur|rice)\s+(g[ée]n[ée]ral(?:e)?\s+adjoint(?:e)?\s+)?(des\s+)?op[ée]rations|head\s+of\s+(operations|finance)/i
const EXECUTIVE_ROLE_EXCLUDED =
  /assistant|adjoint(?!\s+(?:des\s+op|financ))|stagiaire|alternan|apprenti|comptable|paie|contr[ôo]leur|technicien|[ée]lectricien|courants?\s+faibles?/i

function isExecutiveRecruitmentTitle(label: string): boolean {
  const title = label.trim()
  return title !== '' && !EXECUTIVE_ROLE_EXCLUDED.test(title) && EXECUTIVE_ROLE.test(title)
}

/**
 * Cette offre de recrutement peut-elle être un signal sur Découvrir ?
 * `profile` absent = pas encore chargé : seul un poste clairement non placé sort (on ne devine pas un vide).
 */
export function hiringScopeVerdict(label: string, profile: HiringScopeProfile | undefined): HiringScopeVerdict {
  if (isNonPlacedPosition(label)) return { keep: false, reason: 'non_placed' }
  // #4733 — un poste de direction n'est pas un métier d'ESN, c'est une porte d'entrée : il ne sort jamais du filtre métier.
  if (isExecutiveRecruitmentTitle(label)) return { keep: true }
  if (!profile) return { keep: true }
  if (profile.recruitsForClients === true) {
    const folded = foldForRoleMatch(label)
    // #4398.1 (mesuré en prod 28/10, SooIT × VINCI ENERGIES : « 12 du métier » pour des électriciens) — « du métier » se
    // juge contre le profil de l'ESPACE : un placeur en CDI garde toute ouverture, SAUF celle d'une famille de métier
    // que son profil ne couvre pas (électricien chez une ESN IT). Famille indéterminée d'un côté ou de l'autre : on garde.
    if (familyFit(label, profile) === false) return { keep: false, reason: 'off_trade' }
    if (!SUPPORT_POSITIONS.some(pattern => pattern.test(folded))) return { keep: true }
    // un support que le profil nomme (déclaré ou déduit) reste : on ne retire pas le métier de l'ESN.
    const named =
      declaredRoles(profile).some(role => folded.includes(foldForRoleMatch(role))) ||
      offerMatchesRoleTerms(label, deducedTerms(profile))
    return named ? { keep: true } : { keep: false, reason: 'off_trade' }
  }
  const declared = declaredRoles(profile)
  const terms = declared.length > 0 ? [] : deducedTerms(profile)
  if (declared.length === 0 && terms.length === 0) return { keep: false, reason: 'no_roles' }
  const folded = foldForRoleMatch(label)
  const direct =
    declared.length > 0
      ? declared.some(role => folded.includes(foldForRoleMatch(role)))
      : offerMatchesRoleTerms(label, terms)
  const fit = familyFit(label, profile)
  // Un recoupement par un terme large ne vaut pas si l'offre est d'une famille que le profil ne couvre pas ;
  // une offre d'une famille couverte est dans le métier même sans recoupement littéral.
  if (direct) return fit === false ? { keep: false, reason: 'off_trade' } : { keep: true }
  return fit === true ? { keep: true } : { keep: false, reason: 'off_trade' }
}
