import { NextResponse } from 'next/server'
import { formatCleAnon, verifierCleAnon } from '@/lib/backoffice-auth'
import { listeDacces } from '@/lib/roles-env'

/**
 * « Est-ce MOI qui suis mal configuré ? » — la question que le refus de
 * connexion ne pouvait pas distinguer (#1668 §3).
 *
 * POURQUOI CETTE ROUTE EXISTE
 * Le 07/09/2026, personne n'a pu se connecter en production. Le serveur rendait
 * « Adresse, mot de passe ou code refusé », et deux causes tenaient dans ce même
 * message : un mot de passe faux, ou une clé anon que Supabase refuse (le projet
 * a deux générations de clés, et les « legacy » peuvent être désactivées). Il
 * n'existait AUCUN moyen de les séparer sans une tentative de connexion — c'est
 * à dire sans un compte, un mot de passe, et un aller-retour avec un humain.
 *
 * Cette route répond en une requête, et ne parle d'AUCUN compte : elle demande
 * à Supabase si NOTRE clé est acceptée, rien d'autre.
 *
 * ⚠️ CE QU'ELLE NE REND JAMAIS : la clé (ni entière, ni tronquée), l'URL du
 * projet, une adresse de la liste d'accès. Seulement la FORME de la clé, le
 * verdict de Supabase, et un COMPTE d'adresses autorisées. Elle est par ailleurs
 * derrière le Basic Auth, comme tout le reste de la console.
 *
 * ⚠️ Elle est PUBLIQUE au sens de la seconde couche (pas de session exigée), et
 * elle doit l'être : sa raison d'être est de répondre quand plus personne ne
 * peut se connecter. Une porte de diagnostic derrière la porte qu'on diagnostique
 * ne sert à rien.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  const liste = listeDacces()
  const cle = await verifierCleAnon()

  return NextResponse.json({
    ok: true,
    // Absente ≠ vide : la première dit « couche éteinte », la seconde « mal posée ».
    listeDacces:
      liste.etat === 'absente'
        ? { etat: 'absente' }
        : liste.etat === 'vide'
          ? { etat: 'vide' }
          : { etat: 'posee', adresses: liste.roles.size },
    supabaseUrl: process.env['SUPABASE_URL'] ? 'posee' : 'absente',
    formatCleAnon: formatCleAnon(),
    cleAnon: cle,
    enrolementOuvert: (process.env['DM_ENROLLMENT_OPEN'] ?? '').trim() !== '',
    internalApiSecret: process.env['INTERNAL_API_SECRET'] ? 'posee' : 'absente',
  })
}
