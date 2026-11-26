import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { KpiTile } from '@/ui'
import { fetchManagerDependenciesStatus } from '@/lib/manager-dependencies'
import { operateurDepuisJeton } from '@/lib/guard'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { DependencyRow } from './_components/dependency-row'
import { resumeParPresence } from './dependances.logic'

export const dynamic = 'force-dynamic'

/**
 * DÉPENDANCES DU MANAGER — #1676.2.
 *
 * ⚠️ DISTINCTION EXPLICITE (demandée par l'issue) : `/health` liste les onze
 * dépendances DU PRODUIT (ce dont l'analyse et le copilote ont besoin) ;
 * `/integrations` liste les connecteurs DU PRODUIT CLIENT (CRM, messagerie,
 * agenda — ce que CHAQUE espace branche). Cette page-ci liste ce dont LE
 * MANAGER LUI-MÊME dépend pour fonctionner : sa facturation récurrente
 * (Stripe), son identité d'opérateur (Supabase), ses alertes sortantes
 * (Slack), ses e-mails sortants (Resend), son hébergement (Vercel), le
 * commit qu'il sert (GitHub). Trois écrans, trois questions.
 *
 * « Sain n'est jamais déclaré, il est dérivé d'un test réel » : la PRÉSENCE
 * (configuré / non configuré / non mesuré) s'affiche à l'ouverture ; l'état
 * réel — l'API a-t-elle RÉPONDU, maintenant — demande le bouton « Tester ».
 *
 * Rôle exigé : `audit.read` (plancher `operator`) — même porte que la route
 * de test, cohérente avec l'écran sécurité voisin.
 */
export default async function DependancesManagerPage() {
  if (listeDacces().etat === 'active') {
    const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)
    if (!operateur || !peut(operateur.role, 'audit.read')) redirect('/acces-refuse')
  }

  const dependencies = await fetchManagerDependenciesStatus()
  const resume = resumeParPresence(dependencies)

  return (
    <main className="wrap">
      <h1>Dépendances du manager</h1>
      <p className="subtitle">
        Ce dont CETTE console dépend pour fonctionner — distinct de « Santé système » (les dépendances du produit) et
        d’« Intégrations » (les connecteurs de chaque client). Chaque ligne se teste réellement, à la demande.
      </p>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <KpiTile label="Configurées" value={resume.configurees} />
        <KpiTile label="Non configurées" value={resume.nonConfigurees} />
        <KpiTile label="Non mesurées" value={resume.nonMesurees} />
      </section>

      <section style={{ margin: '20px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={ENTETE}>Dépendance</th>
              <th style={ENTETE}>Rôle</th>
              <th style={ENTETE}>Présence</th>
              <th style={ENTETE}>Test</th>
            </tr>
          </thead>
          <tbody>
            {dependencies.map(dependency => (
              <DependencyRow key={dependency.id} dependency={dependency} />
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
