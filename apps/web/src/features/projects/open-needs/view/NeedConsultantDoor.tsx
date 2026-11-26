import type { OpenNeedRow } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConsultantFormDialog } from '@/features/consultants/view/ConsultantFormDialog'
import { useCreateConsultant, useTalentSearch } from '@/features/consultants/hooks'
import { toUpsert, type ConsultantFormState } from '@/features/consultants/lib/consultantForm'

/**
 * LA TROISIÈME PORTE — depuis le BESOIN, et SANS passer par le vivier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SOURCE, MOT POUR MOT (PDF-02 du dossier du 26/08, §3.1)
 * ─────────────────────────────────────────────────────────────────────────────
 *     « un commercial qui a un contact en tête doit pouvoir l'enregistrer
 *      depuis le besoin, **sans passer par le vivier** »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT CORRIGE — la porte existait, elle ouvrait le vivier
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bouton était là, atteignable, correctement libellé. C'était un
 * `<Link to="/consultants" search={{ new: true }}>` : il QUITTAIT l'écran pour
 * ouvrir le formulaire dans le vivier — c'est-à-dire exactement le geste que la
 * source refuse. Et la conséquence n'est pas cosmétique : le commercial perd sa
 * liste, ses filtres, sa position, et surtout le BESOIN qu'il avait sous les
 * yeux. Une porte qui déménage n'est pas la même porte.
 *
 * Le formulaire, lui, était déjà réutilisable (`ConsultantFormDialog`, monté
 * deux fois dans le produit). Il s'ouvre donc ici, en place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE GESTE QUI SUIT — et pourquoi il n'est PAS le même que dans le vivier
 * ─────────────────────────────────────────────────────────────────────────────
 * `ConsultantsPage` propose, après un enregistrement, un rapprochement INVERSE :
 * « ce profil, contre tous les besoins ouverts ». C'est le bon geste là-bas —
 * on vient d'écrire une fiche, on ne sait pas encore à quoi elle répond.
 *
 * Ici on le sait : le besoin est celui qu'on regarde. Le geste précis est donc
 * le rapprochement SUR CE BESOIN, qui est déjà le geste n°1 de la ligne. On ne
 * réécrit rien — le panneau appelle le `onMatch` de l'écran, celui-là même que
 * le bouton « Lancer le matching » appelle. Deux dérivations du même fait
 * divergent ; il n'y en a qu'une.
 *
 * ⚠️ Et on ne POSITIONNE personne automatiquement. Un positionnement est une
 * proposition ENVOYÉE à un client : le commercial la décide, l'outil la
 * prépare. Enregistrer une fiche n'est pas décider de la pousser.
 */
export function NeedConsultantDoor({
  need,
  onClose,
  onMatch,
}: {
  /** Le besoin d'où vient le geste. `null` = la porte est fermée. */
  need: OpenNeedRow | null
  onClose: () => void
  /**
   * Le rapprochement sur CE besoin — le `onMatch` de l'écran appelant, et pas
   * une seconde façon de le lancer.
   */
  onMatch: (needId: string) => void
}) {
  const { t } = useTranslation('matching')
  const create = useCreateConsultant()
  /**
   * Le droit de VOIR les montants, lu là où le serveur l'écrit — exactement
   * comme le vivier. `undefined` quand la liste est vide : on ne SAIT pas, et
   * le formulaire montre alors les champs. Masquer une capacité à qui y a droit
   * est pire que la montrer à qui le serveur refusera.
   */
  const pool = useTalentSearch({ page: 1, limit: 1 })
  const financeVisible = pool.data?.items[0]?.financeVisible

  /** La fiche qui vient de naître, et le besoin qu'elle vise. */
  const [justCreated, setJustCreated] = useState<{ name: string; needId: string; needTitle: string } | null>(null)

  const submit = (form: ConsultantFormState, rights: { finance?: boolean }) => {
    if (!need) return
    create
      .mutateAsync(toUpsert(form, rights))
      .then(saved => {
        // `full_name` est nullable depuis D366, mais pas ICI : cette porte
        // CRÉE la fiche à partir du formulaire, qui exige un nom. Le repli est
        // donc ce que l'utilisateur vient de taper — pas une valeur inventée.
        const name = saved.full_name ?? form.full_name
        toast.success(t('door.saved', { name }))
        setJustCreated({ name, needId: need.id, needTitle: need.title })
        onClose()
      })
      .catch((error: Error) => toast.error(error.message || t('launch.failed')))
  }

  return (
    <>
      <ConsultantFormDialog
        open={need !== null}
        consultant={null}
        saving={create.isPending}
        financeVisible={financeVisible}
        onClose={onClose}
        onSubmit={submit}
      />
      {justCreated ? (
        <NextGesture
          name={justCreated.name}
          needTitle={justCreated.needTitle}
          onMatch={() => {
            onMatch(justCreated.needId)
            setJustCreated(null)
          }}
          onDismiss={() => setJustCreated(null)}
        />
      ) : null}
    </>
  )
}

/**
 * « Untel est enregistré. Je le compare à ce besoin ? »
 *
 * Le §3.4 est catégorique : « à l'enregistrement, l'écran ne renvoie pas à une
 * liste ». Il ne renvoie nulle part du tout — le commercial est resté sur son
 * besoin, et le geste suivant lui est proposé là où il est.
 *
 * ⚠️ Le panneau ne DIT AUCUN CHIFFRE. « 3 profils correspondent » avant le
 * rapprochement serait un nombre inventé : la correspondance ne se connaît
 * qu'après. Il dit ce qu'on sait — ce besoin, ce profil — et ce que ça coûte,
 * qui est rien.
 */
function NextGesture({
  name,
  needTitle,
  onMatch,
  onDismiss,
}: {
  name: string
  needTitle: string
  onMatch: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation('matching')
  return (
    <Card className="mt-3 p-4" data-testid="need-door-next-gesture">
      <Text size="sm" weight="semibold">
        {t('door.nextGesture.title', { name, need: needTitle })}
      </Text>
      {/* « Coût annoncé = coût débité », y compris quand il vaut zéro : le
          taire laisserait supposer l'inverse, et on ne clique pas un bouton
          dont on redoute le prix. */}
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('door.nextGesture.free')}
      </Text>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button size="sm" className="pointer-coarse:min-h-11" onClick={onMatch}>
          {t('door.nextGesture.launch')}
        </Button>
        <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onDismiss}>
          {t('door.nextGesture.later')}
        </Button>
      </div>
    </Card>
  )
}
