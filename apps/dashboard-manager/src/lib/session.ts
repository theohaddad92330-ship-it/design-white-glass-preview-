/**
 * Le cookie de session du back-office (#1668) — signé, court, sans état serveur.
 *
 * POURQUOI PAS LA SESSION SUPABASE DIRECTEMENT
 * Le middleware tourne sur le runtime Edge, où l'on veut vérifier une session à
 * chaque requête sans appel réseau ni SDK. Le back-office se contente donc de
 * CONSTATER, une fois, que Supabase a validé le mot de passe ET le TOTP, puis
 * il émet son propre jeton signé. Aucun jeton Supabase ne quitte le serveur.
 *
 * CE QUE LE COOKIE PORTE, ET CE QU'IL NE PORTE PAS
 * Il porte l'e-mail et une échéance. Il ne porte PAS le rôle : celui-ci se relit
 * dans `DM_ALLOWED_EMAILS` à chaque requête, sans quoi rétrograder quelqu'un ne
 * prendrait effet qu'à sa déconnexion — huit heures plus tard (#1669).
 *
 * ⚠️ LA CLÉ DE SIGNATURE EST DÉRIVÉE D'`INTERNAL_API_SECRET`
 * Le back-office la pose déjà, elle est de forte entropie et ne quitte jamais le
 * serveur : une quatrième variable d'environnement à poser à la main aurait été
 * une quatrième occasion de se tromper. Effet de bord assumé et écrit :
 * faire tourner `INTERNAL_API_SECRET` déconnecte tout le monde.
 * Elle est DÉRIVÉE (HMAC avec une étiquette), jamais utilisée telle quelle, pour
 * qu'une signature de cookie ne puisse pas servir ailleurs.
 */

const ETIQUETTE = 'bellum-dm-cookie-v1'

export const COOKIE_SESSION = 'dm_session'
export const COOKIE_ENROLEMENT = 'dm_enroll'

/** « Session de 8 heures, renouvelée à l'activité, expirée sinon » (#1668). */
export const DUREE_SESSION_MS = 8 * 60 * 60 * 1000

/** Le temps de scanner un QR code et de recopier six chiffres. */
export const DUREE_ENROLEMENT_MS = 10 * 60 * 1000

const encodeur = new TextEncoder()
const decodeur = new TextDecoder()

/** Une clé dérivée par secret, gardée le temps de vie de l'instance. */
const cles = new Map<string, Promise<CryptoKey>>()

async function deriver(secret: string): Promise<CryptoKey> {
  const racine = await crypto.subtle.importKey(
    'raw',
    encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const derivee = await crypto.subtle.sign('HMAC', racine, encodeur.encode(ETIQUETTE))
  return crypto.subtle.importKey('raw', derivee, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** `null` quand `INTERNAL_API_SECRET` est absente — rien ne peut être signé. */
function cle(): Promise<CryptoKey> | null {
  const secret = process.env['INTERNAL_API_SECRET']
  if (!secret) return null
  let existante = cles.get(secret)
  if (!existante) {
    existante = deriver(secret)
    cles.set(secret, existante)
  }
  return existante
}

function versB64url(octets: Uint8Array): string {
  let binaire = ''
  for (const octet of octets) binaire += String.fromCharCode(octet)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function depuisB64url(texte: string): Uint8Array | null {
  try {
    const rembourre = texte.replace(/-/g, '+').replace(/_/g, '/')
    const binaire = atob(rembourre + '='.repeat((4 - (rembourre.length % 4)) % 4))
    const octets = new Uint8Array(binaire.length)
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
    return octets
  } catch {
    return null
  }
}

/** Comparaison en temps quasi-constant, comme le Basic Auth d'à côté. */
function egales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

type Usage = 'session' | 'enrolement'

/** Le champ `x` est l'échéance en millisecondes ; il est porté par les deux usages. */
type Charge = { x: number } & Record<string, unknown>

async function signer(usage: Usage, charge: Charge): Promise<string | null> {
  const promesse = cle()
  if (!promesse) return null
  const corps = versB64url(encodeur.encode(JSON.stringify(charge)))
  const signature = await crypto.subtle.sign('HMAC', await promesse, encodeur.encode(`${usage}.${corps}`))
  return `${corps}.${versB64url(new Uint8Array(signature))}`
}

async function verifier(usage: Usage, jeton: string | undefined, maintenant: number): Promise<Charge | null> {
  if (!jeton) return null
  const promesse = cle()
  if (!promesse) return null

  const separateur = jeton.lastIndexOf('.')
  if (separateur <= 0) return null
  const corps = jeton.slice(0, separateur)
  const fournie = jeton.slice(separateur + 1)

  const attendue = await crypto.subtle.sign('HMAC', await promesse, encodeur.encode(`${usage}.${corps}`))
  if (!egales(fournie, versB64url(new Uint8Array(attendue)))) return null

  const octets = depuisB64url(corps)
  if (!octets) return null
  let charge: unknown
  try {
    charge = JSON.parse(decodeur.decode(octets))
  } catch {
    return null
  }
  if (typeof charge !== 'object' || charge === null) return null
  const echeance = (charge as { x?: unknown }).x
  // Une échéance absente ou illisible n'est pas « pas d'expiration » : c'est un
  // jeton qu'on ne sait pas lire, donc un jeton qu'on refuse.
  if (typeof echeance !== 'number' || !Number.isFinite(echeance) || echeance <= maintenant) return null
  return charge as Charge
}

type Session = { email: string }

export async function signerSession(email: string, maintenant = Date.now()): Promise<string | null> {
  return signer('session', { e: email, x: maintenant + DUREE_SESSION_MS })
}

/**
 * La session portée par le cookie, ou `null`.
 *
 * Ne dit RIEN du rôle ni de l'appartenance à la liste d'accès : c'est
 * l'appelant qui recroise avec `DM_ALLOWED_EMAILS`, parce que la liste a pu
 * changer depuis l'émission du jeton.
 */
export async function lireSession(jeton: string | undefined, maintenant = Date.now()): Promise<Session | null> {
  const charge = await verifier('session', jeton, maintenant)
  const email = charge?.['e']
  return typeof email === 'string' && email.length > 0 ? { email } : null
}

type Enrolement = { email: string; facteurId: string }

export async function signerEnrolement(
  email: string,
  facteurId: string,
  maintenant = Date.now(),
): Promise<string | null> {
  return signer('enrolement', { e: email, f: facteurId, x: maintenant + DUREE_ENROLEMENT_MS })
}

export async function lireEnrolement(jeton: string | undefined, maintenant = Date.now()): Promise<Enrolement | null> {
  const charge = await verifier('enrolement', jeton, maintenant)
  const email = charge?.['e']
  const facteurId = charge?.['f']
  if (typeof email !== 'string' || typeof facteurId !== 'string' || !email || !facteurId) return null
  return { email, facteurId }
}

/** Les attributs communs aux deux cookies. `secure` tombe en développement local (http). */
export function optionsCookie(dureeMs: number): {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: Math.floor(dureeMs / 1000),
  }
}
