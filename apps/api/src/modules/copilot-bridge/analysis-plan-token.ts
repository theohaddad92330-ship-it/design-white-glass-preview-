import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * LE JETON QUI REND « ON A DEMANDÉ D'ABORD » STRUCTUREL (#1489).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le copilote doit poser ses questions AVANT de lancer une analyse — parce que
 * lancer débite un crédit, et parce que ce que le commercial sait déjà oriente
 * toute la collecte. On pourrait l'écrire dans le prompt et espérer.
 *
 * ⚠️ Un prompt n'est pas une garantie. Ce dépôt a déjà payé la différence :
 * « retirer le MOYEN, pas la permission ». Le lancement n'accepte donc qu'un
 * jeton que SEULE l'étape de préparation sait produire — celle-là même qui rend
 * les questions. Sans elle, il n'y a rien à envoyer, et aucune formulation
 * habile ne contourne ça.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le jeton est un HMAC sur (utilisateur, entreprise, minute de création). Il ne
 * porte aucun secret, ne survit pas à un changement d'entreprise, expire seul,
 * et ne coûte ni écriture ni migration. Une table donnerait la même garantie au
 * prix d'un état à purger — pour une valeur qui vit trente minutes.
 *
 * ⚠️ Ce qu'il NE prouve pas, et il faut le dire : que le copilote a bien MONTRÉ
 * les questions. Il prouve qu'il les a demandées. Le reste est du ressort du
 * prompt, et c'est la limite honnête de ce mécanisme.
 */

/** Trente minutes : le temps d'une conversation, pas d'une session. */
const TTL_MS = 30 * 60 * 1000

function secret(): string {
  return (process.env.INTERNAL_API_SECRET ?? '').trim()
}

/**
 * La forme comparée des deux côtés. Le nom d'entreprise est normalisé — sinon
 * « OGF » et « ogf  » produiraient deux jetons, et le second lancement échouerait
 * sur une différence de casse que personne ne verrait.
 */
function canonical(userId: string, company: string, issuedAt: number): string {
  return `${userId}|${company.trim().toLowerCase().replace(/\s+/g, ' ')}|${issuedAt}`
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** Un jeton de préparation, valable trente minutes pour CE couple. */
export function issueAnalysisPlanToken(userId: string, company: string, now: number = Date.now()): string {
  return `${now}.${sign(canonical(userId, company, now))}`
}

/**
 * Le jeton correspond-il à ce couple, et est-il encore vivant ?
 *
 * ⚠️ Comparaison à temps constant. Ce jeton n'ouvre pas grand-chose — une
 * analyse qu'on aurait pu lancer par l'écran — mais un HMAC comparé avec `===`
 * est une habitude qui finit par se retrouver ailleurs.
 */
export function verifyAnalysisPlanToken(
  token: string,
  userId: string,
  company: string,
  now: number = Date.now(),
): boolean {
  if (!secret()) return false
  const [issuedRaw, signature] = (token ?? '').split('.')
  if (!issuedRaw || !signature) return false

  const issuedAt = Number(issuedRaw)
  if (!Number.isFinite(issuedAt)) return false
  // Un jeton daté du futur est un jeton fabriqué : on ne l'accepte pas plus
  // qu'un jeton périmé.
  if (issuedAt > now || now - issuedAt > TTL_MS) return false

  const expected = Buffer.from(sign(canonical(userId, company, issuedAt)))
  const given = Buffer.from(signature)
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}
