import { usablePhotoUrl } from '@bellum/contracts'
import { apiUrl } from '@/lib/api-origin'

/**
 * Logo d'entreprise — URL d'AFFICHAGE, servie par notre propre origine.
 *
 * Le front ne pointe plus directement sur les hôtes tiers. Deux raisons :
 *
 *  1. `accounts.logo_url` (logo réel Apollo) pointe sur le S3 d'Apollo, qui ne
 *     renvoie AUCUN `Cache-Control` → le navigateur revalidait le logo à chaque
 *     chargement de page. Et `AvatarImage` (Radix) construit un `new Image()` à
 *     chaque montage : le moindre re-render (filtre, tri, `motion.div`)
 *     relançait la requête.
 *  2. Le favicon de secours était construit ici, côté client, vers Google —
 *     même problème, et une deuxième origine tierce à la charge du navigateur.
 *
 * Les deux passent maintenant par `GET /logo` sur l'API, qui relaie les octets
 * sous un `Cache-Control: immutable` d'un mois. Le navigateur télécharge chaque
 * logo UNE fois puis sert tous les montages suivants depuis son cache disque.
 *
 * La donnée reste réelle : soit le logo Apollo persisté, soit le favicon
 * réellement servi par le site. Rien n'est inventé ; sans donnée exploitable →
 * `null`, et l'avatar retombe sur l'initiale.
 */

/** Domaine enregistrable nu depuis une URL de site ("https://www.vinci.com/fr"
 *  → "vinci.com"). `null` quand aucun domaine plausible. Miroir TS de
 *  `apps/ia/app/services/assets.py#website_domain` et du `toDomain` côté API. */
function websiteDomain(website: string | null | undefined): string | null {
  let s = String(website ?? '')
    .trim()
    .toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]!.split('?')[0]!
  s = s.replace(/^www\./, '')
  s = s.replace(/^[. ]+|[. ]+$/g, '')
  // Un domaine est un NOM D'HÔTE, pas une phrase qui en contient un.
  //
  // ⚠️ Trouvé en recette live : le pipeline écrit parfois de la prose dans le
  // champ site — « non identifié explicitement dans les sources fournies (le
  // site officiel blablacar est notoirement blablacar.fr ». L'ancien garde-fou
  // exigeait seulement un point, et la phrase en contenait un : l'écran Comptes
  // partait chercher un logo pour cette phrase entière, un 404 par compte à
  // chaque chargement.
  //
  // La cause racine est en amont — une valeur de ce genre n'a rien à faire dans
  // la colonne — mais l'écran n'a pas à la relayer en attendant.
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null
}

/**
 * URL STABLE et cacheable du logo d'un compte, sur notre origine, ou `null`
 * quand il n'y a rien à afficher.
 *
 * On transmet les deux indices bruts (`src` = logo Apollo persisté, `domain` =
 * domaine du site) ; c'est l'API qui applique la précédence et qui décide quel
 * hôte elle s'autorise à contacter (allow-list anti-SSRF). Le front ne choisit
 * aucun hôte tiers.
 *
 * La stabilité est essentielle : une URL qui change entre deux rendus rate le
 * cache navigateur et reproduit exactement le bug qu'on corrige.
 */
/** Préfixe des visuels illustrés de l'espace de démonstration, servis par l'app
 *  elle-même (`apps/web/public/demo-assets/`). Voir {@link companyLogoSrc}. */
const DEMO_ASSET_PREFIX = '/demo-assets/'

export function companyLogoSrc(logoUrl: string | null | undefined, website: string | null | undefined): string | null {
  const logo = String(logoUrl ?? '').trim()
  // Espace de démonstration : les sociétés sont FICTIVES (domaines `.example`),
  // donc ni logo Apollo ni favicon à relayer — le seed pose un chemin vers un
  // visuel illustré livré avec l'app. On le sert tel quel : même origine que la
  // SPA, aucun hôte tiers, donc rien à relayer et aucune surface SSRF ouverte.
  // Un chemin absolu à UNE seule barre ne peut pas être protocol-relative
  // (`//evil.com`), et le préfixe est fixe : la donnée ne choisit pas d'origine.
  if (logo.startsWith(DEMO_ASSET_PREFIX)) return logo
  // On ne relaie qu'un http(s) — jamais un `javascript:`/`data:` venu des données.
  const src = /^https?:\/\//i.test(logo) ? logo : null
  const domain = websiteDomain(website)
  if (!src && !domain) return null

  const url = apiUrl('/logo')
  if (src) url.searchParams.set('src', src)
  if (domain) url.searchParams.set('domain', domain)
  return url.toString()
}

/**
 * URL STABLE de la PHOTO d'un contact, sur notre origine, ou `null`.
 *
 * Même relais, même raison. La photo d'un contact vient exactement du même
 * stockage que le logo d'une entreprise — c'est le même fournisseur, le même
 * hôte, la même absence de `Cache-Control`. Elle partait pourtant en direct
 * vers cet hôte depuis neuf écrans, alors que les logos passaient par le relais
 * depuis le jour où le problème a été compris.
 *
 * Signalé en bêta : « il manque les photos de profil systématiquement, même
 * quand je clique sur Enrichir ». Une requête d'image tierce qui échoue ne dit
 * rien : l'avatar retombe sur l'initiale, exactement comme s'il n'y avait
 * jamais eu de photo. Le relais retire cette ambiguïté — c'est notre serveur
 * qui va chercher les octets, sous notre origine et notre cache.
 *
 * Aucun `domain` n'est passé : un contact n'a pas de favicon, et le repli d'un
 * visage manquant est son initiale, jamais l'icône d'un site.
 */
export function contactPhotoSrc(photoUrl: string | null | undefined): string | null {
  // Une silhouette générique n'est pas une photo : `usablePhotoUrl` la ramène à
  // `null`, l'avatar affiche l'initiale et le relais n'est pas sollicité pour
  // rien. Les lignes déjà en base en portent une — c'est pour elles que le
  // filtre vit AUSSI ici et pas seulement à la persistance.
  return companyLogoSrc(usablePhotoUrl(photoUrl), null)
}
