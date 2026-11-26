import { cookies } from 'next/headers'
import { operateurDepuisJeton } from '@/lib/guard'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { CockpitBusinessPanel } from './_components/cockpit-business-panel'

/**
 * LE COCKPIT BUSINESS — la page d'accueil du back-office (#1646).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE ROUTE ÉTAIT, ET CE QU'ELLE DEVIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `/` redirigeait vers `/monitoring?view=cockpit` — le cockpit de TÉLÉMÉTRIE IA
 * (coût, durée, statut d'une analyse). #1646 demande un AUTRE cockpit, business
 * celui-là : MRR, marge, burn, runway, ce qui demande une décision. Les deux
 * cockpits ne sont pas la même question, et la confusion entre eux était le
 * point de départ de cette issue.
 *
 * ⚠️ LA TÉLÉMÉTRIE IA RESTE ATTEIGNABLE EN CLIQUANT — elle n'a pas bougé d'une
 * ligne. Le lien permanent du rail latéral (icône ◆, label « Cockpit »,
 * `nav-sections.ts`, hors périmètre de ce lot) pointe TOUJOURS directement vers
 * `/monitoring?view=cockpit`, indépendamment de cette route. `/acces-refuse`
 * y renvoie aussi (« Retour au cockpit »). Cette page n'y redirige plus, elle
 * ne la remplace pas non plus : les deux cockpits coexistent, chacun à son URL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN RÔLE SE VÉRIFIE ICI — CE N'EST PAS DANS LE DIAGNOSTIC DE L'ISSUE
 * ─────────────────────────────────────────────────────────────────────────────
 * MRR, marge, burn et runway sont exactement ce que `ECRANS_PROPRIETAIRE`
 * (`src/lib/roles.ts`) ferme déjà sur `/revenus` et `/revenus/tresorerie`. Les
 * rendre sur `/` sans vérifier de rôle ouvrirait le chiffre d'affaires de
 * l'entreprise à `operator`/`viewer` par un simple changement de route — une
 * régression d'accès. `middleware.ts` et `roles.ts` sont hors du périmètre de
 * ce lot (fichiers interdits), donc le filtre ne peut pas s'ajouter au préfixe
 * `ECRANS_PROPRIETAIRE` : il se pose ICI, avec le MÊME mécanisme que
 * `audit/page.tsx` (`operateurDepuisJeton` + `peut(role, 'treasury.read')`),
 * pas un nouveau chemin de vérification. `treasury.read` existe déjà dans la
 * matrice de #1669 et nomme exactement cette classe de données.
 *
 * Ce que ça change concrètement : un `operator`/`viewer` voit toujours la file
 * de décision et la heatmap d'utilisation sur `/`, mais pas les six tuiles
 * financières ni les deux graphiques — remplacés par une phrase qui dit
 * pourquoi, avec un lien implicite vers ce qu'il voit déjà ailleurs.
 *
 * ⚠️ COUCHE INERTE = COMPORTEMENT D'AVANT (#1668). Sans `DM_ALLOWED_EMAILS`, il
 * n'y a pas de rôle à opposer : tout s'affiche, comme avant ce commit.
 */
export const dynamic = 'force-dynamic'

export default async function Home() {
  const liste = listeDacces()
  const operateur =
    liste.etat === 'active' ? await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value) : null
  const estProprietaire = liste.etat !== 'active' || (operateur != null && peut(operateur.role, 'treasury.read'))

  return (
    <main className="wrap">
      <h1>Cockpit</h1>
      <p className="subtitle">
        L’état business de BellumAI en un écran : MRR, marge, burn et runway, la décomposition du mois et douze mois de
        tendance, ce qui demande une décision, et quand le produit est utilisé. / The business state of BellumAI at a
        glance — MRR, margin, burn, runway, this month’s breakdown and twelve months of trend, what needs a decision,
        and when the product gets used.
      </p>
      <CockpitBusinessPanel estProprietaire={estProprietaire} />
    </main>
  )
}
