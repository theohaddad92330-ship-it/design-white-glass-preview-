import type { BackofficeAccessEvent } from '@bellum/contracts'
import { NextResponse } from 'next/server'
import type { EchecConnexion } from '@/lib/backoffice-auth'
import { normaliserEmail, type Role } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'

/**
 * Ce que les quatre routes de `/api/auth/**` partagent (#1668).
 *
 * Rangé ici plutôt que recopié quatre fois : le message d'un refus est une
 * décision de sécurité (il ne doit jamais dire SI un compte existe), et une
 * décision recopiée quatre fois diverge à la première correction.
 */

type Identifiants = { email: string; motDePasse: string; code: string }

/** Lit le corps sans jamais faire confiance à sa forme. */
export async function lireIdentifiants(req: Request): Promise<Identifiants> {
  const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return {
    email: typeof corps['email'] === 'string' ? normaliserEmail(corps['email']) : '',
    motDePasse: typeof corps['password'] === 'string' ? corps['password'] : '',
    code: typeof corps['code'] === 'string' ? corps['code'].replace(/\s/g, '') : '',
  }
}

export function journaliser(event: string, champs: Record<string, unknown>): void {
  console.warn(JSON.stringify({ event, ...champs, at: new Date().toISOString() }))
}

/**
 * L'ORIGINE d'une requête, telle que le bord la connaît (#1671.2).
 *
 * ⚠️ CES TROIS VALEURS N'ÉTAIENT PAS SEULEMENT NON STOCKÉES — ELLES N'ÉTAIENT
 * JAMAIS LUES. L'issue demande « depuis quelle IP, quel navigateur » ; aucune
 * route d'authentification ne regardait un seul en-tête. Elles sont gratuites
 * derrière Vercel, qui les pose lui-même.
 *
 * ⚠️ `null` PLUTÔT QU'UNE CHAÎNE DE REMPLISSAGE. Vercel les fournit presque
 * toujours, et « presque » n'est pas « toujours » : hors de son réseau (un test,
 * une exécution locale), il n'y a rien à lire. Écrire `'inconnu'` ferait d'une
 * lacune un fait — et l'alerte « pays inhabituel » de #1671.3 compterait
 * `'inconnu'` comme un pays de plus, donc s'éteindrait toute seule.
 */
export function origineDeLaRequete(req: Request): {
  ip: string | null
  userAgent: string | null
  country: string | null
} {
  const transmise = req.headers.get('x-forwarded-for')
  return {
    // Le premier de la liste est le client ; les suivants sont les relais.
    ip: transmise?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent')?.slice(0, 500) || null,
    country: req.headers.get('x-vercel-ip-country') || null,
  }
}

/**
 * LA PORTE UNIQUE DU JOURNAL D'ACCÈS (#1671.2).
 *
 * Elle fait DEUX choses, et les deux comptent :
 *  · `console.warn`, comme avant — c'est ce qu'on lit en direct pendant un
 *    incident, et c'est arrivé dans l'heure qui a précédé ce lot ;
 *  · un enregistrement PERSISTANT, via l'API, parce que les journaux
 *    d'exécution de Vercel vivent quelques heures à quelques jours, jamais les
 *    douze mois demandés — et surtout parce qu'on ne compte pas « quatre
 *    échecs » dans une ligne de log, ce dont l'alerte de #1671.3 a besoin.
 *
 * ⚠️ AU MIEUX, ET JAMAIS BLOQUANTE. Une trace n'est pas une porte : si l'API est
 * injoignable, un opérateur doit quand même pouvoir se connecter. L'appel n'est
 * pas attendu par l'appelant et son échec ne remonte pas — mais il part dans
 * `console.warn`, donc il se voit.
 *
 * ⚠️ La console n'écrit PAS en base directement : elle n'a que la clé anon de
 * Supabase, soumise au RLS, et y poser une clé de service serait exactement la
 * faille que `backoffice-auth.ts` signale. Elle passe par l'API avec le secret
 * interne, qui ne touche jamais le navigateur.
 */
export function journaliserAcces(
  event: BackofficeAccessEvent,
  req: Request | null,
  champs: {
    actorEmail?: string | null
    actorRole?: string | null
    reason?: string | null
    detail?: string | null
    target?: string | null
  } = {},
): void {
  const origine = req ? origineDeLaRequete(req) : { ip: null, userAgent: null, country: null }
  journaliser(`backoffice.${event}`, { ...champs, ...origine })

  const base = process.env['API_BASE_URL']
  const secret = process.env['INTERNAL_API_SECRET']
  if (!base || !secret) return

  void fetch(`${base}/internal/backoffice/access-journal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ event, ...champs, ...origine }),
  }).catch(err => {
    console.warn(
      JSON.stringify({
        event: 'backoffice.journal_acces_perdu',
        raison: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
    )
  })
}

/**
 * Un refus, journalisé avec ce que Supabase a vraiment dit (#1668 §3).
 *
 * ⚠️ LES DEUX MOITIÉS DE LA MÊME DÉCISION. L'écran doit rester indistinct — il
 * ne dira jamais lequel des deux facteurs a échoué. Le JOURNAL, lui, doit
 * porter le code : le 07/09, les trois routes n'écrivaient que
 * `raison: 'identifiants_refuses'`, et « clé anon refusée » était donc le même
 * mot que « mot de passe faux ». Personne n'a pu se connecter, et rien dans le
 * journal ne permettait de dire pourquoi.
 *
 * Rangé ici et pas recopié dans les trois routes : c'est exactement le genre de
 * ligne qu'on corrige à un endroit sur trois.
 */
export function journaliserEchec(
  event: BackofficeAccessEvent,
  req: Request,
  email: string,
  echec: EchecConnexion,
): void {
  const diagnostic = 'diagnostic' in echec ? echec.diagnostic : undefined
  journaliserAcces(event, req, {
    actorEmail: email,
    reason: echec.etat,
    // Le diagnostic n'a jamais existé que pour le journal SERVEUR : c'est lui
    // qui distingue « clé anon refusée » de « mot de passe faux ».
    detail: diagnostic ? JSON.stringify(diagnostic).slice(0, 500) : null,
  })
}

/**
 * La porte d'entrée : l'adresse est-elle sur la liste ?
 *
 * ⚠️ VÉRIFIÉE AVANT TOUT APPEL À SUPABASE (T1). Une adresse hors liste ne
 * déclenche aucune tentative de connexion : sans ça, la console dirait, par sa
 * latence et ses messages, quels comptes existent chez le client.
 */
export function autoriser(
  email: string,
  // #1671.2 — la requête voyage jusqu'ici pour que le refus porte son origine.
  // Optionnelle : la porte reste appelable sans, et l'origine vaut alors `null`
  // plutôt qu'une valeur devinée.
  req?: Request,
): { ok: true; role: Role } | { ok: false; reponse: NextResponse } {
  const liste = listeDacces()

  if (liste.etat === 'absente') {
    // Rien à quoi se connecter : la couche d'identité n'est pas allumée.
    return {
      ok: false,
      reponse: NextResponse.json(
        { ok: false, error: 'La connexion par identité n’est pas activée sur cet environnement.' },
        { status: 404 },
      ),
    }
  }
  if (liste.etat === 'vide') {
    return {
      ok: false,
      reponse: NextResponse.json(
        { ok: false, error: 'Back-office non configuré : DM_ALLOWED_EMAILS ne donne aucune adresse.' },
        { status: 503 },
      ),
    }
  }

  const role = liste.roles.get(email)
  if (!role) {
    // T1 — « email hors liste → 403, journalisé ».
    journaliserAcces('acces_refuse', req ?? null, { actorEmail: email, reason: 'hors_liste' })
    return {
      ok: false,
      reponse: NextResponse.json({ ok: false, error: 'Cette adresse n’a pas accès au back-office.' }, { status: 403 }),
    }
  }

  return { ok: true, role }
}

/**
 * Traduit un échec de Supabase en réponse.
 *
 * ⚠️ `identifiants_refuses` et `code_refuse` rendent la MÊME réponse, message
 * ET champ `code` compris : dire lequel des deux a échoué apprendrait à qui
 * essaie qu'il tient le bon mot de passe. Mettre le discriminant dans le JSON
 * plutôt que dans le texte ne le cachait de personne — un attaquant lit la
 * réponse, pas l'écran. Le formulaire ne se branche que sur `mfa_absent`, donc
 * le retirer ne coûte rien.
 */
export function reponseEchec(echec: EchecConnexion): NextResponse {
  switch (echec.etat) {
    case 'non_configure':
      journaliser('backoffice.auth_non_configuree', { manquantes: echec.manquantes })
      return NextResponse.json(
        {
          ok: false,
          error: `Connexion impossible : ${echec.manquantes.join(', ')} manque${echec.manquantes.length > 1 ? 'nt' : ''} côté serveur.`,
        },
        { status: 503 },
      )
    case 'identifiants_refuses':
    case 'code_refuse':
      return NextResponse.json({ ok: false, error: 'Adresse, mot de passe ou code refusé.' }, { status: 401 })
    case 'mfa_absent':
      return NextResponse.json(
        { ok: false, code: 'mfa_absent', error: 'Aucune application d’authentification n’est enrôlée sur ce compte.' },
        { status: 409 },
      )
    case 'mfa_deja_pose':
      return NextResponse.json(
        { ok: false, code: 'mfa_deja_pose', error: 'Ce compte a déjà une application d’authentification.' },
        { status: 409 },
      )
    case 'panne':
      journaliser('backoffice.auth_en_panne', { message: echec.message })
      return NextResponse.json({ ok: false, error: 'La vérification a échoué. Réessaie.' }, { status: 502 })
  }
}
