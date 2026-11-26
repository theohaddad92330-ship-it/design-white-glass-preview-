import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
  Text,
} from '@bellum/ui'
import type { Account, Contact } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCreateContact } from '../hooks/useRecordEdit'

/**
 * Ajouter un contact à la main.
 *
 * Un contact ne naissait que d'une analyse ou d'un import : le commercial qui
 * rencontre quelqu'un en salon n'avait nulle part où le mettre, et la relation
 * restait dans son téléphone. Un nom suffit à créer la fiche — exiger l'adresse
 * ferait renoncer à la saisie au moment précis où l'information est fraîche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1317 — « la création d'un contact est trop liée à un dossier déjà existant »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Le geste empêché, dans les mots du retour : *« je peux ajouter Marie Dupont,
 * la rattacher à BNP Paribas, entité Cardif, sans avoir encore lancé une
 * analyse complète BNP »*. Le sélecteur ne listait que les comptes DÉJÀ créés,
 * donc déjà analysés — et il s'appelait « Dossier », ce qui laissait croire
 * qu'il fallait une analyse.
 *
 * Trois changements, et un refus :
 *
 * - `.1` **l'entreprise se crée à la volée**. Créer un compte ne lance AUCUNE
 *   analyse : c'est une fiche vide qu'on remplira plus tard. C'est ce qui
 *   débloque le cas concret du retour, sans toucher au modèle — `account_id`
 *   reste `NOT NULL` sur `contacts`.
 * - `.2` **l'entité / filiale / BU** est saisissable. Le champ existait dans le
 *   contrat (`createContactSchema.entity`) et l'API l'acceptait : la modale ne
 *   l'envoyait simplement jamais. Le défaut n°1 du dépôt, vu de l'écran.
 * - `.3` `.5` **l'import de fichier a sa porte ici**. L'assistant complet —
 *   prévisualisation, choix des colonnes, détection de doublons, reprise —
 *   existe depuis des mois sur `/settings/import` ; ce qui manquait, c'est
 *   qu'on le trouve depuis l'endroit où l'on ajoute des contacts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1473 — « laisser le contact en contact libre / à qualifier »
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ce point était REFUSÉ ici tant que `contacts.account_id` était `NOT NULL`.
 * Il est tranché : la colonne est élargie et l'entreprise devient FACULTATIVE
 * dans cette modale. Deux cas distincts, à ne pas confondre :
 *
 * - l'entreprise est CONNUE mais pas encore analysée → elle se crée à la volée
 *   (#1317.1, déjà là) ;
 * - l'entreprise n'est PAS connue — un salon, une recommandation sans société →
 *   « je ne connais pas encore l'entreprise ». Le contact part « à qualifier »,
 *   et le rattachement se fait quand l'information arrive. Lui inventer une
 *   fiche « société inconnue » aurait été une donnée fictive.
 *
 * ⚠️ Ce qui N'EST PAS fait, et pourquoi :
 *
 * - **lire un profil LinkedIn pour en tirer nom, poste et société** : ça
 *   suppose de se faire passer pour un navigateur connecté, ce que la doctrine
 *   du dépôt exclut nommément. L'URL se saisit et se conserve — c'est la porte
 *   de sortie que le retour écrit lui-même — et l'enrichissement part ensuite
 *   par la cascade de fournisseurs déjà branchée, sur nom + société.
 */
export function CreateContactDialog({
  accountId,
  open,
  onOpenChange,
  initialValues,
  onCreated,
}: {
  /**
   * #1098 — « dans cette partie contact, ne serait-il pas judicieux d'ajouter
   * des contacts que l'on connaît ? ». Le geste EXISTAIT, mais seulement dans
   * l'onglet Contacts d'un dossier : introuvable depuis la liste globale, là où
   * on le cherche.
   *
   * Absent ⇒ le dossier se CHOISIT dans le dialogue. Un contact appartient
   * toujours à un compte : sans rattachement, la fiche n'apparaîtrait dans
   * aucun dossier et le commercial la croirait perdue. Le dialogue reste le
   * même partout — le dupliquer aurait fait diverger deux formulaires.
   */
  accountId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * #2727 — préremplir depuis un homonyme choisi sur « Découvrir » (recherche
   * par nom). Reste modifiable : préremplir n'est pas verrouiller, et le
   * commercial peut corriger avant d'écrire (aucune écriture sans son geste).
   */
  initialValues?: { fullName?: string; title?: string; entity?: string }
  /** #2727 — une fois la fiche créée, l'appelant peut enchaîner sur le geste
   *  d'enrichissement EXISTANT (la fiche contact) sans qu'on le réinvente ici. */
  onCreated?: (contact: Contact) => void
}) {
  const { t } = useTranslation('crm')
  const [pickedAccountId, setPickedAccountId] = useState('')
  // #1473 — « je ne connais pas encore l'entreprise ». Un CHOIX explicite, pas
  // un état déduit du champ vide : une case vide veut dire « je n'ai pas encore
  // rempli », et confondre les deux créerait des contacts à qualifier par
  // inadvertance, dont personne ne saurait qu'ils attendent un rattachement.
  const [companyUnknown, setCompanyUnknown] = useState(false)
  const needsAccountPicker = !accountId
  const targetAccountId = companyUnknown ? null : (accountId ?? pickedAccountId) || null
  const create = useCreateContact(targetAccountId)
  const [form, setForm] = useState({
    fullName: initialValues?.fullName ?? '',
    title: initialValues?.title ?? '',
    entity: initialValues?.entity ?? '',
    email: '',
    phone: '',
    linkedinUrl: '',
  })

  const reset = () => {
    setForm({ fullName: '', title: '', entity: '', email: '', phone: '', linkedinUrl: '' })
    setPickedAccountId('')
    setCompanyUnknown(false)
  }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm(current => ({ ...current, [key]: event.target.value }))

  const submit = () => {
    // #1473 — le nom reste le SEUL champ obligatoire. L'entreprise ne l'est plus
    // dès lors que « je ne connais pas encore l'entreprise » est coché.
    if (!form.fullName.trim()) return
    if (!companyUnknown && !targetAccountId) return
    create.mutate(
      {
        fullName: form.fullName.trim(),
        title: form.title.trim() || null,
        // #1317.2 — l'entité / filiale / BU. Le contrat la porte depuis
        // toujours ; seule la modale ne l'envoyait pas.
        entity: form.entity.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        linkedinUrl: form.linkedinUrl.trim() || null,
      },
      {
        onSuccess: contact => {
          reset()
          onOpenChange(false)
          onCreated?.(contact)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('createContact.title')}</DialogTitle>
          <DialogDescription>{t('createContact.description')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          {needsAccountPicker ? (
            <Field label={t('createContact.accountLabel')} required={!companyUnknown}>
              {companyUnknown ? null : <AccountPicker value={pickedAccountId} onChange={setPickedAccountId} />}
              {/* #1473 — la porte de sortie du commercial qui revient de salon.
                  Une vraie case à cocher, pas un `<div onClick>` : ça se tabule,
                  ça répond à Espace, et un lecteur d'écran l'annonce (GA-35). */}
              <label className="mt-1.5 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={companyUnknown}
                  onChange={event => {
                    setCompanyUnknown(event.target.checked)
                    if (event.target.checked) setPickedAccountId('')
                  }}
                  className="size-4 shrink-0 accent-[var(--bellum-primary-500)]"
                />
                <Text element="span" size="xs" color="text-muted-foreground">
                  {t('createContact.accountUnknown')}
                </Text>
              </label>
              {companyUnknown ? (
                <Text element="p" size="xs" color="text-muted-foreground">
                  {t('createContact.accountUnknownHint')}
                </Text>
              ) : null}
            </Field>
          ) : null}
          <Field label={t('fields.fullName')} required>
            <Input value={form.fullName} onChange={set('fullName')} aria-label={t('fields.fullName')} autoFocus />
          </Field>
          <Field label={t('fields.title')}>
            <Input value={form.title} onChange={set('title')} aria-label={t('fields.title')} />
          </Field>
          {/* #1317.2 — « je peux préciser filiale / entité ». */}
          <Field label={t('fields.entity')}>
            <Input value={form.entity} onChange={set('entity')} aria-label={t('fields.entity')} />
          </Field>
          <Field label={t('fields.email')}>
            <Input type="email" value={form.email} onChange={set('email')} aria-label={t('fields.email')} />
          </Field>
          <Field label={t('fields.phone')}>
            <Input type="tel" value={form.phone} onChange={set('phone')} aria-label={t('fields.phone')} />
          </Field>
          <Field label={t('fields.linkedinUrl')}>
            <Input value={form.linkedinUrl} onChange={set('linkedinUrl')} aria-label={t('fields.linkedinUrl')} />
          </Field>
        </Box>
        {/* #1317.3 / .5 — « il ne faut pas pouvoir ajouter uniquement les
            contacts un par un ». L'assistant d'import existe en entier —
            prévisualisation, choix des colonnes, détection des doublons,
            reprise après arrêt : ce qui manquait était le CHEMIN depuis ici.
            Un lien, pas un troisième onglet : dupliquer l'assistant dans une
            modale ferait deux imports qui divergent. */}
        <Box className="mt-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
          <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('createContact.importTitle')}
          </Text>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('createContact.importDescription')}
          </Text>
          <Link
            to="/settings/mes-donnees"
            search={{ tab: 'imports' }}
            onClick={() => onOpenChange(false)}
            className="mt-1.5 inline-block text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
          >
            {t('createContact.importCta')}
          </Link>
        </Box>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="black"
            onClick={submit}
            disabled={form.fullName.trim().length === 0 || (!companyUnknown && !targetAccountId)}
            isLoading={create.isPending}
            loadingText={t('common:states.saving')}
          >
            {t('createContact.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Le sélecteur de dossier, monté UNIQUEMENT quand il faut en choisir un.
 *
 * Séparé du dialogue, et pas une branche à l'intérieur : `useAccounts` lit la
 * session, et un hook ne se rend pas conditionnel. Laissé dans le corps du
 * dialogue, il exigeait un `SessionProvider` de tous ses appelants — y compris
 * l'onglet Contacts d'un dossier, qui monte ce dialogue en permanence et n'en a
 * jamais eu besoin. Ici, l'appelant qui connaît déjà son compte ne déclenche ni
 * lecture de session, ni requête.
 */
function AccountPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation('crm')
  const accountsQuery = useAccounts({ limit: 100 })
  const accounts = useMemo(
    () => (accountsQuery.data?.pages.flatMap(page => page.data) ?? []).filter(account => account.company_name?.trim()),
    [accountsQuery.data],
  )
  // #1317.1 — le mode CRÉATION. Il n'est pas un état dérivé du champ (« la
  // saisie ne correspond à rien ») mais un choix explicite : deviner l'intention
  // d'après ce qui est tapé ferait basculer le formulaire pendant la frappe.
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const createAccount = useCreateAccountInline(id => {
    onChange(id)
    setCreating(false)
    setNewName('')
  })

  if (creating) {
    return (
      <Box className="space-y-1.5">
        <Box className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={event => setNewName(event.target.value)}
            aria-label={t('createContact.accountCreateLabel')}
            placeholder={t('createContact.accountCreateLabel')}
            autoFocus
          />
          {/* ⚠️ Vu à la recette du 03/09 : tant que le champ est vide, le
              libellé rendait « Créer «  » » — deux guillemets encadrant du
              vide. Le bouton est désactivé, mais la paire vide se lit comme un
              défaut d'affichage. Sans saisie, le bouton dit simplement ce qu'il
              fait. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={newName.trim().length === 0}
            isLoading={createAccount.isPending}
            onClick={() => createAccount.mutate(newName.trim())}
          >
            {newName.trim()
              ? t('createContact.accountCreate', { name: newName.trim() })
              : t('createContact.accountSwitchToCreate')}
          </Button>
        </Box>
        {/* ⚠️ Créer une entreprise ici ne lance AUCUNE analyse et ne débite
            aucun crédit : c'est une fiche vide. Le dire ôte la seule raison
            d'hésiter devant ce bouton. */}
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('createContact.accountHint')}
        </Text>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
        >
          {t('createContact.accountSwitchToPick')}
        </button>
      </Box>
    )
  }

  return (
    <Box className="space-y-1.5">
      <SelectField
        ariaLabel={t('createContact.accountLabel')}
        value={value}
        onChange={next => onChange(next)}
        emptyOption={{ label: t('createContact.accountPlaceholder') }}
        options={accounts.map(account => ({ value: account.id, label: account.company_name }))}
        size="sm"
        className="w-full"
      />
      {/* Un `<button>`, pas un `<div onClick>` : ça se tabule, ça répond à
          Entrée, et un lecteur d'écran l'annonce (GA-35). */}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
      >
        {t('createContact.accountSwitchToCreate')}
      </button>
    </Box>
  )
}

/**
 * Créer l'entreprise sans quitter la modale — #1317.1.
 *
 * ⚠️ `accountsApi.create` crée une FICHE, il ne lance pas d'analyse : aucun
 * crédit n'est débité et aucun run ne part. C'est précisément ce que le retour
 * demande — *« sans avoir encore lancé une analyse complète »*.
 *
 * Les caches de comptes sont invalidés pour que le sélecteur retrouve la
 * nouvelle entreprise si l'on repasse en mode choix.
 */
function useCreateAccountInline(onCreated: (accountId: string) => void) {
  const { t } = useTranslation('crm')
  const qc = useQueryClient()
  return useMutation<Account, Error, string>({
    mutationFn: companyName => accountsApi.create(companyName),
    onSuccess: account => {
      qc.invalidateQueries({ queryKey: accountKeys.all })
      toast.success(t('createContact.accountCreated'))
      onCreated(account.id)
    },
    onError: error => toast.error(error.message || t('createContact.accountCreateError')),
  })
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <Box className="space-y-1">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Text>
      {children}
    </Box>
  )
}
