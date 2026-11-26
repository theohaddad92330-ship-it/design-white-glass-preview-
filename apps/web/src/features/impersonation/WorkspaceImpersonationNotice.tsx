import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner } from '@/components/layout/Banner'
import { fetchImpersonationVisibility } from './api'
import { readImpersonationState } from './impersonation-state'

/** Toutes les minutes : assez pour qu'un client le voie, assez peu pour ne rien coûter. */
const INTERVALLE_MS = 60_000

/**
 * « Un membre de l'équipe BellumAI est connecté sur votre espace. » (#1670.2)
 *
 * POURQUOI CE BANDEAU EXISTE, ET POURQUOI CE N'EST PAS LE MÊME QUE L'AUTRE
 * `ImpersonationBanner` dit « Tu incarnes … » : il s'adresse à l'OPÉRATEUR,
 * dans SA session. Celui-ci s'adresse aux membres RÉELS de l'espace, dans la
 * leur. Les deux noms se ressemblent au point qu'on peut croire le second déjà
 * livré ; ils n'ont ni le même public, ni le même texte, ni la même raison.
 *
 * L'issue pose ce point comme non négociable : « Une console qui permet de lire
 * les données d'un client sans qu'il le sache est un problème de conformité ET
 * de confiance. Le jour où un client le découvre autrement, c'est fini. »
 *
 * CE QU'IL NE DIT PAS
 * Ni qui est incarné, ni qui incarne. Dire « quelqu'un est connecté en tant que
 * Sarah » à toute l'équipe de Sarah créerait un problème que personne n'a
 * demandé de créer ; et le nom de l'opérateur est une identité interne. Le
 * serveur ne les envoie pas — ce n'est pas l'écran qui s'en abstient.
 *
 * EN FLUX, PAS EN SURCOUCHE : il pousse le contenu au lieu de le recouvrir.
 * Un bandeau flottant demanderait un cran d'empilement, masquerait la première
 * ligne de l'écran, et se ferait fermer. Celui-ci se voit et ne gêne pas.
 */
export function WorkspaceImpersonationNotice() {
  const { t } = useTranslation('impersonation')
  const [active, setActive] = useState(false)

  useEffect(() => {
    // ⚠️ NE PAS conditionner cet appel à `hasLoggedInCookie()`.
    // La tentation est réelle — ça éviterait un GET par minute sur l'écran de
    // connexion. Mais ce sentinelle est ILLISIBLE quand l'API vit sur un hôte
    // cross-site (c'est écrit dans `logged-in-cookie.ts`), et le bandeau
    // deviendrait alors silencieusement mort : aucune erreur, aucun test rouge,
    // et un client qui ne sait plus qu'on est chez lui. Un bandeau de
    // conformité qui s'éteint sans bruit coûte infiniment plus qu'une requête
    // par minute. Sur une session absente, l'API rend simplement « inactif ».
    //
    // Dans une session d'incarnation, l'opérateur a DÉJÀ son bandeau. Lui en
    // montrer un second, rédigé pour le client, ferait croire qu'une deuxième
    // personne est là. Le serveur le refuse aussi — deux verrous, parce que
    // celui-ci saute au premier écran qui oublierait la condition.
    if (readImpersonationState()) return
    let vivant = true
    const relever = () => {
      void fetchImpersonationVisibility().then(vu => {
        if (vivant) setActive(vu.active)
      })
    }
    relever()
    const timer = window.setInterval(relever, INTERVALLE_MS)
    return () => {
      vivant = false
      window.clearInterval(timer)
    }
  }, [])

  if (!active) return null

  return (
    <Banner layout="app" tone="warning" icon={Info} aria-live="polite">
      {t('workspaceNotice')}
    </Banner>
  )
}
