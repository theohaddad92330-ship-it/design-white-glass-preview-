import { Button } from '@bellum/ui'
import { RefreshCcw, Upload, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmConfrontationDialog } from '../tabs/contacts/CrmConfrontationDialog'

/**
 * #2120.46 / #2120.47 — AJOUTER ET IMPORTER, SANS DÉFILER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 14/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Section Personnes d'un dossier, fenêtre de 807 px de haut : « Ajouter un
 * contact » et « Importer » étaient à **y = 3 226 px** — plus de trois écrans
 * de défilement. La demande disait « visible en haut de l'onglet Contacts, sans
 * défilement ».
 *
 * Les deux boutons n'avaient pas bougé : ils vivaient bien en haut de
 * `TabContacts`. Ce qui a bougé, c'est l'écran autour d'eux — depuis #2115, la
 * section Personnes EMPILE l'organigramme, les contacts puis la couverture, et
 * l'organigramme fait à lui seul près de trois écrans. « En haut de l'onglet »
 * ne veut plus dire « en haut de la section » ; c'est la section qui est
 * désormais l'unité de lecture, donc c'est elle qui doit porter les gestes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE DE LECTURE N'EST PAS CASSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La section répond d'abord « avec qui commencer » : l'organigramme reste le
 * premier CONTENU, et #1817 (« je devrais avoir un organigramme toujours par
 * défaut ») tient. Ces deux gestes sont au SECOND rang visuel — alignés à
 * droite, en `outline`, à la taille d'une action de barre — au-dessus du
 * contenu mais jamais à sa place : ce ne sont pas des appels à l'action, ce
 * sont des raccourcis qu'on doit pouvoir atteindre sans chercher.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS DEUX FOIS LE MÊME GESTE (loi 4 du tome 7)
 * ─────────────────────────────────────────────────────────────────────────────
 * Quand le dossier n'a AUCUN contact, ces deux gestes descendent au centre de
 * l'état vide (`ContactsEmptyState`, #1130) — là où la question se pose — et
 * cette barre ne se rend pas. L'appelant tranche sur le nombre de contacts ;
 * `TabContacts`, lui, n'a plus de barre d'actions du tout.
 */
export function PeopleSectionActions({
  accountId,
  onCreateContact,
  onImportCsv,
}: {
  /** #2120.48 — le compte dont on confronte les contacts avec le CRM. */
  accountId: string
  /** Ouvre la saisie manuelle d'un contact. */
  onCreateContact: () => void
  /** Ouvre l'import CSV. */
  onImportCsv: () => void
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tCrm } = useTranslation('crm')
  // #2120.48 — « Confronter avec mon CRM », dernier des quatre boutons
  // d'ajout terrain de #2120.50, posé au MÊME rang que les deux ci-dessous :
  // en haut de la section, jamais relégué en bas de page.
  const [confrontOpen, setConfrontOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* Saisir un contact à la main : sans ce bouton, la personne rencontrée
          en salon reste dans le téléphone du commercial. */}
      {/* `type="button"` explicite : `Button` ne pose pas de défaut, et un
          bouton sans type SOUMET le formulaire qui l'entoure. Il n'y en a pas
          ici aujourd'hui — c'est demain que ça coûte. */}
      <Button type="button" size="sm" variant="outline" icon={UserPlus} onClick={onCreateContact} className="gap-2">
        {tCrm('createContact.open')}
      </Button>
      <Button type="button" size="sm" variant="outline" icon={Upload} onClick={onImportCsv} className="gap-2">
        {t('contactsTab.importCsv')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={RefreshCcw}
        onClick={() => setConfrontOpen(true)}
        className="gap-2"
      >
        {tCrm('confrontation.button')}
      </Button>
      <CrmConfrontationDialog accountId={accountId} open={confrontOpen} onOpenChange={setConfrontOpen} />
    </div>
  )
}
