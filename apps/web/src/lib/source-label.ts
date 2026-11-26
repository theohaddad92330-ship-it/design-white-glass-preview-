/**
 * Une source lisible, ou rien.
 *
 * Le modèle numérote ses preuves pour raisonner — `[J3]`, `[P1] [P4] [P8]`,
 * `[PR4]`, `[O1] [O2]`, `[signaux_dates]` — et ces jetons finissaient tels quels
 * à l'écran : dans la colonne « Dernier signal » de la Veille et dans le panneau
 * « Sources du dossier ». Vu sur un compte réel le 04/08.
 *
 * Un badge qui affiche « [PR3] » n'apprend rien à un commercial : il ne nomme ni
 * un média, ni un registre, ni une date. Il occupe la place d'une information et
 * fait passer le dossier pour un brouillon de machine.
 *
 * On préfère donc NE RIEN afficher. C'est la même règle que partout ailleurs
 * dans le produit : une valeur illisible vaut `null`, jamais un remplissage —
 * et l'écran sait déjà dire « source inconnue », ce qui est la vérité.
 *
 * La reconnaissance est volontairement prudente : on n'écarte que ce qui est
 * ENTIÈREMENT fait de jetons. « Les Échos [P2] » garde son nom de média, parce
 * qu'il reste quelque chose à lire une fois le jeton retiré.
 */

/** Un jeton de citation : `[J3]`, `[PR12]`, `[O1]`, `[signaux_dates]`…
 *
 *  Pas d'espace à l'intérieur : c'est ce qui distingue un code interne d'une
 *  source réelle mal formatée (« [Option Finance, 1 jour] »), qu'on garde. */
const CITATION_TOKEN = /\[[A-Za-z_]{1,20}\d{0,3}\]/g

/**
 * ⚠️ LES NOMS DE SECTION DU PROMPT, QUE LE MODÈLE CITE SANS CROCHETS.
 *
 * Mesuré en production le 05/09/2026, sur le panneau de la Veille :
 * **« Source : Signaux dates : 1 day ago »**. `signaux_dates` n'est pas une
 * source, c'est le nom de la section du prompt dans laquelle on lui a passé les
 * signaux datés (`apps/ia/app/prompts/fencing.py`). Le modèle l'a repris comme
 * s'il s'agissait d'un média, humanisé au passage — donc sans crochets, donc
 * invisible pour le filtre au-dessus, qui n'a jamais vu que la forme
 * `[signaux_dates]`.
 *
 * Une garde vérifie que cette liste est celle du fichier Python : les deux ne
 * peuvent pas diverger sans que la CI le dise.
 */
const PROMPT_SECTION_NAMES = [
  'web_brave',
  'scrape_firecrawl',
  'legal_pappers',
  'signaux_dates',
  'contexte_utilisateur',
  // R35 — les TITRES des groupes de `apps/ia/app/services/dated_signals.py` (« PRESSE RÉCENTE : »…), que le modèle
  // recopie dans `source` tels quels. Une apostrophe droite ou typographique : il rend l'une ou l'autre.
  'presse récente',
  "offres d['’]emploi it",
  'marchés publics it',
  'marchés attribués',
  'événements légaux',
]

/**
 * `signaux_dates` ET « Signaux dates » — le modèle rend l'une ou l'autre.
 * Ancrée au DÉBUT : « Les Échos, via signaux_dates » garde son média.
 */
const SECTION_PREFIX = new RegExp(
  `^(?:${PROMPT_SECTION_NAMES.map(name => `${name}|${name.replace(/_/g, '[ _]')}`).join('|')})\\b[\\s:—-]*`,
  'i',
)

/**
 * ⚠️ UNE DATE RELATIVE N'EST PAS UNE SOURCE, ET ELLE EST EN ANGLAIS.
 *
 * « 1 day ago » sortait tel quel dans une interface française. Pire : une date
 * relative est fausse dès le lendemain de son écriture — elle a été calculée au
 * moment de l'analyse, pas au moment où on la lit.
 */
const RELATIVE_DATE = /^\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago$/i

/** Ce qui reste d'un titre de section une fois le titre parti : « (1 mois ago) », « (3 jours) ». */
const AGE_RESIDUE = /^\(\s*\d+\s+\p{L}+(?:\s+ago)?\s*\)$/u

/** Le nom d'hôte d'un lien, sans « www. » : un média se nomme par son site. `null` si ce n'est pas un lien http(s). */
function hostOf(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  if (raw === '') return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.replace(/^www\./i, '')
    return host === '' ? null : host
  } catch {
    return null
  }
}

/**
 * @param url le lien du signal : quand la source écrite par le modèle n'est qu'un jeton ou un titre de section, le
 * nom d'hôte du lien (« lesechos.fr ») la remplace — c'est le média, et c'est vrai. Jamais l'inverse : une source
 * lisible n'est pas remplacée. (Un hôte qui serait un de nos fournisseurs est nommé par sa capacité plus loin,
 * `signalSourceLabel` — nos fournisseurs ne se nomment jamais.)
 */
export function readableSource(value: string | null | undefined, url?: string | null): string | null {
  return readableText(value) ?? hostOf(url)
}

function readableText(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (raw === '') return null

  // On RETIRE les jetons du texte plutôt que de découper puis recoller : une
  // liste de sources (« [O1] Pappers.fr, [O2] Societe.com ») doit garder ses
  // virgules, sinon les noms se collent en une seule bouillie illisible.
  const readable = raw
    .replace(CITATION_TOKEN, '')
    .trim()
    // Le nom de section part d'abord : ce qui suit peut être une vraie source. Deux fois : « signaux_dates : Presse
    // récente » porte le nom de la section PUIS le titre du groupe.
    .replace(SECTION_PREFIX, '')
    .trim()
    .replace(SECTION_PREFIX, '')
    .replace(/\s+/g, ' ')
    // Séparateurs devenus orphelins une fois le jeton parti.
    .replace(/\s+([,;])/g, '$1')
    .replace(/([,;])\s*(?=[,;])/g, '')
    .replace(/^[\s,;]+|[\s,;]+$/g, '')

  if (readable === '') return null
  // Ce qui reste n'est qu'une date relative : ce n'est pas une source, et
  // l'écran sait dire « source inconnue », ce qui est la vérité.
  if (RELATIVE_DATE.test(readable) || AGE_RESIDUE.test(readable)) return null
  return readable
}
