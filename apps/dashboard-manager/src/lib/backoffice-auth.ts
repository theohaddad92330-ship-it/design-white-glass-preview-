import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * La vérification d'identité du back-office : mot de passe + TOTP, sur le MÊME
 * Supabase que le produit (#1668).
 *
 * POURQUOI SUPABASE ET PAS UN SECRET DE PLUS
 * « Une authentification par identité, sur le même Supabase que le produit. »
 * Le produit vérifie déjà les mots de passe par ce chemin
 * (`apps/api/src/modules/auth/credentials-auth.service.ts`), et le MFA de
 * Supabase stocke le secret TOTP : le back-office n'a donc AUCUN secret
 * d'authentification à garder — ni mot de passe, ni graine TOTP.
 *
 * ⚠️ CE MODULE EST SERVEUR UNIQUEMENT. Il n'est importé que par des gestionnaires
 * de route (`app/api/auth/**`), jamais par un composant. La clé anon est
 * publique par nature, mais l'y laisser côté navigateur ferait un deuxième
 * chemin d'authentification que personne ne surveillerait.
 *
 * ⚠️ L'ORDRE COMPTE : la liste d'accès est vérifiée AVANT d'appeler Supabase.
 * Une adresse hors liste ne déclenche aucune tentative de connexion — sans quoi
 * la console servirait d'oracle pour savoir quels comptes existent.
 */

type ConfigurationSupabase = { url: string; anonKey: string }

/** `null` = le back-office ne peut pas vérifier une identité, et le DIT. */
export function configurationSupabase(): ConfigurationSupabase | null {
  const url = process.env['SUPABASE_URL']
  const anonKey = process.env['SUPABASE_ANON_KEY']
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/** Ce qui manque, nommé — « non configuré » ne se devine pas depuis un échec. */
export function variablesManquantes(): string[] {
  const manquantes: string[] = []
  if (!process.env['SUPABASE_URL']) manquantes.push('SUPABASE_URL')
  if (!process.env['SUPABASE_ANON_KEY']) manquantes.push('SUPABASE_ANON_KEY')
  return manquantes
}

type FormatCle = 'absente' | 'legacy' | 'publiable' | 'secrete' | 'inconnue'

/**
 * QUELLE clé est posée — jamais la clé elle-même.
 *
 * Supabase a deux générations de clés : le JWT « legacy » (`eyJ…`) et le
 * nouveau format (`sb_publishable_…`). Un projet qui bascule peut désactiver
 * les legacy, et TOUT échoue alors exactement comme un mot de passe faux. Un
 * back-office qui ne sait pas dire laquelle il tient ne peut pas être dépanné.
 *
 * ⚠️ `sb_secret_…` est signalé à part : ce n'est pas une clé anon, elle
 * contourne le RLS. La poser ici serait une faille, pas une erreur de frappe.
 */
export function formatCleAnon(): FormatCle {
  const cle = process.env['SUPABASE_ANON_KEY']
  if (!cle) return 'absente'
  if (cle.startsWith('sb_secret_')) return 'secrete'
  if (cle.startsWith('sb_publishable_')) return 'publiable'
  if (cle.startsWith('eyJ')) return 'legacy'
  return 'inconnue'
}

type VerdictCle =
  | { etat: 'non_configure'; manquantes: string[] }
  | { etat: 'acceptee' }
  | { etat: 'refusee'; statut: number; message: string }
  | { etat: 'injoignable'; message: string }

/**
 * La clé anon est-elle ACCEPTÉE par Supabase ? Une question qui ne parle
 * d'aucun compte.
 *
 * `/auth/v1/settings` ne demande qu'une clé et ne rend que la configuration
 * publique du projet : interroger cette route ne dit rien sur qui existe, et
 * répond en une requête à ce qu'une tentative de connexion laissait deviner.
 *
 * ⚠️ « Injoignable » n'est pas « refusée ». Un réseau muet ne prouve rien sur
 * la clé, et conclure d'un silence est exactement ce que ce dépôt refuse.
 */
export async function verifierCleAnon(): Promise<VerdictCle> {
  const config = configurationSupabase()
  if (!config) return { etat: 'non_configure', manquantes: variablesManquantes() }

  try {
    // La clé voyage en en-tête : dans l'URL, elle finirait dans les journaux
    // d'accès de tout ce qui se trouve sur le chemin.
    const reponse = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.anonKey } })
    if (reponse.ok) return { etat: 'acceptee' }
    const texte = await reponse.text().catch(() => '')
    return { etat: 'refusee', statut: reponse.status, message: texte.slice(0, 200) }
  } catch (err) {
    return { etat: 'injoignable', message: err instanceof Error ? err.message : String(err) }
  }
}

function client(config: ConfigurationSupabase): SupabaseClient {
  // Un client PAR REQUÊTE, sans persistance : deux opérateurs qui se connectent
  // en même temps ne doivent jamais partager une session en mémoire.
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Ce que Supabase a RÉELLEMENT répondu — pour le journal serveur, jamais pour
 * l'écran (#1668 §3).
 *
 * `statut` est le champ qui tranche : GoTrue rend **401 « Invalid API key »**
 * quand la CLÉ est refusée, et **400 `invalid_credentials`** quand ce sont les
 * identifiants. Sans ce chiffre, les deux causes tiennent dans le même mot.
 */
type DiagnosticSupabase = { code?: string; statut?: number; nom?: string; message?: string }

export type EchecConnexion =
  | { etat: 'non_configure'; manquantes: string[] }
  | { etat: 'identifiants_refuses'; diagnostic?: DiagnosticSupabase }
  | { etat: 'mfa_absent' }
  | { etat: 'mfa_deja_pose' }
  | { etat: 'code_refuse'; diagnostic?: DiagnosticSupabase }
  | { etat: 'panne'; message: string }

/** Le peu qu'une erreur Supabase porte, sans jamais rien inventer de ce qu'elle n'a pas. */
function diagnostiquer(erreur: unknown): DiagnosticSupabase | undefined {
  if (!erreur || typeof erreur !== 'object') return undefined
  const e = erreur as { code?: unknown; status?: unknown; name?: unknown; message?: unknown }
  const diagnostic: DiagnosticSupabase = {}
  if (typeof e.code === 'string') diagnostic.code = e.code
  if (typeof e.status === 'number') diagnostic.statut = e.status
  if (typeof e.name === 'string') diagnostic.nom = e.name
  // Le message de GoTrue est un texte FIXE côté serveur (« Invalid API key »,
  // « Invalid login credentials ») : il ne contient jamais ce qui a été saisi.
  if (typeof e.message === 'string') diagnostic.message = e.message.slice(0, 200)
  return Object.keys(diagnostic).length > 0 ? diagnostic : undefined
}

type ResultatConnexion = { etat: 'ok' } | EchecConnexion

type ResultatEnrolement = { etat: 'ok'; facteurId: string; qrCode: string; secret: string } | EchecConnexion

/** Ouvre une session Supabase, ou dit pourquoi elle ne s'ouvre pas. */
async function ouvrir(
  email: string,
  motDePasse: string,
): Promise<{ ok: true; sb: SupabaseClient } | { ok: false; echec: EchecConnexion }> {
  const config = configurationSupabase()
  if (!config) return { ok: false, echec: { etat: 'non_configure', manquantes: variablesManquantes() } }

  const sb = client(config)
  const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse })
  // Supabase ne distingue pas « mauvais mot de passe » de « compte inconnu », et
  // c'est ce qu'on veut : le message ne doit pas dire lequel des deux.
  //
  // ⚠️ Mais l'ÉTAT et le DIAGNOSTIC ne servent pas le même lecteur. L'état fait
  // le message d'écran, indistinct par décision. Le diagnostic ne part que dans
  // le journal serveur — sans lui, « clé anon refusée » et « mot de passe faux »
  // sont le même mot, et c'est ce qui a bloqué tout le monde le 07/09.
  if (error) return { ok: false, echec: { etat: 'identifiants_refuses', diagnostic: diagnostiquer(error) } }
  return { ok: true, sb }
}

/** Les facteurs TOTP VÉRIFIÉS. `data.totp` ne contient que ceux-là. */
async function facteurVerifie(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb.auth.mfa.listFactors()
  if (error || !data) return null
  return data.totp[0]?.id ?? null
}

/**
 * Mot de passe + code TOTP, en UNE requête.
 *
 * Un échange en deux temps aurait demandé de garder un jeton Supabase entre les
 * deux — donc de poser dans un cookie exactement ce que le second facteur est
 * censé protéger. Le formulaire garde le mot de passe le temps de la saisie ;
 * rien de Supabase ne touche le navigateur.
 */
export async function connecter(email: string, motDePasse: string, code: string): Promise<ResultatConnexion> {
  const ouverture = await ouvrir(email, motDePasse)
  if (!ouverture.ok) return ouverture.echec
  const { sb } = ouverture

  try {
    const facteurId = await facteurVerifie(sb)
    // ⚠️ L'ORDRE FAIT LA PREMIÈRE CONNEXION POSSIBLE. Le code n'est exigé
    // qu'une fois un facteur enrôlé : sans ça, la toute première connexion —
    // celle qui MÈNE à l'enrôlement — demandait six chiffres que personne ne
    // pouvait avoir. Un code vide n'ouvre jamais rien : il tombe soit sur
    // `mfa_absent` (aucun facteur), soit sur `code_refuse` juste en dessous.
    if (!facteurId) return { etat: 'mfa_absent' }
    if (!code) return { etat: 'code_refuse' }

    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteurId, code })
    if (error) return { etat: 'code_refuse', diagnostic: diagnostiquer(error) }
    return { etat: 'ok' }
  } catch (err) {
    return { etat: 'panne', message: err instanceof Error ? err.message : String(err) }
  } finally {
    await sb.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
}

/**
 * Premier temps de l'enrôlement : rend le QR code et le secret à recopier.
 *
 * ⚠️ Refuse si un facteur VÉRIFIÉ existe déjà — sinon la fenêtre d'enrôlement
 * permettrait d'ajouter un second téléphone à un compte déjà protégé, ce qui
 * annulerait le second facteur au lieu de le poser.
 * Les facteurs NON vérifiés sont retirés d'abord : ils viennent d'une tentative
 * abandonnée, et Supabase refuse deux facteurs de même nom.
 */
export async function demarrerEnrolement(email: string, motDePasse: string): Promise<ResultatEnrolement> {
  const ouverture = await ouvrir(email, motDePasse)
  if (!ouverture.ok) return ouverture.echec
  const { sb } = ouverture

  try {
    const { data: facteurs, error: erreurListe } = await sb.auth.mfa.listFactors()
    if (erreurListe || !facteurs) return { etat: 'panne', message: erreurListe?.message ?? 'Facteurs illisibles.' }
    if (facteurs.totp.length > 0) return { etat: 'mfa_deja_pose' }

    for (const abandonne of facteurs.all.filter(facteur => facteur.status !== 'verified')) {
      await sb.auth.mfa.unenroll({ factorId: abandonne.id }).catch(() => undefined)
    }

    const { data, error } = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'BellumAI Manager',
      issuer: 'BellumAI Manager',
    })
    if (error || !data) return { etat: 'panne', message: error?.message ?? 'Enrôlement refusé.' }
    return { etat: 'ok', facteurId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
  } catch (err) {
    return { etat: 'panne', message: err instanceof Error ? err.message : String(err) }
  } finally {
    await sb.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
}

/** Second temps : le code prouve que le téléphone porte bien le secret. */
export async function confirmerEnrolement(
  email: string,
  motDePasse: string,
  facteurId: string,
  code: string,
): Promise<ResultatConnexion> {
  const ouverture = await ouvrir(email, motDePasse)
  if (!ouverture.ok) return ouverture.echec
  const { sb } = ouverture

  try {
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: facteurId, code })
    if (error) return { etat: 'code_refuse', diagnostic: diagnostiquer(error) }
    return { etat: 'ok' }
  } catch (err) {
    return { etat: 'panne', message: err instanceof Error ? err.message : String(err) }
  } finally {
    await sb.auth.signOut({ scope: 'local' }).catch(() => undefined)
  }
}
