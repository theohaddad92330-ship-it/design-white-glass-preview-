# Rapport — rattrapage #4599 / #4586 (01/11/2026)

Branche : `claude/rattrapage-4599-4586-0111`.

**Constat (étape 0)** : le rattrapage des e-mails gabarit existe (`PlaceholderEmailCatchupService`, portes `internal/admin` et
admin d'espace) mais n'a jamais été lancé en prod ; il couvre déjà `prenom.nom@`, `firstname.lastname@`. Les gardes d'écriture
(`refusePlaceholderEmail`) couvrent les imports et `contacts.service` ; je n'ai pas isolé de source d'écriture restante pour
« Recommandés » (pas de reproduction possible hors prod). Le rattrapage des NOMS ne couvrait que « nom = adresse ».

**Livré** : `repairedContactName` (société collée retirée seulement si elle égale le nom du compte ; prénoms répétés par virgules
repliés) ; `displayedContactEmail` (un gabarit n'est plus affiché, liste + détail) ; passe « noms mal formés » ajoutée au rattrapage
`email-name-backfill` (dry-run par défaut, saisie manuelle intacte, ancien nom gardé dans `raw_data.nameBeforeRepair`, idempotent).

**Tests** : jest contact-display-name, contact-email-name-backfill (service + controller), placeholder-email : 65 verts. tsc -p apps/api lancé.
**Non fait** : fermeture d'une porte « Recommandés » (source non identifiée) ; pas de test e2e SQL du filtre Raw.
**Lancer en prod** (par espace) : `POST internal/admin/contacts/email-name-backfill {"workspaceId":"<id>","dryRun":true}` puis `false` ;
e-mails : `POST internal/admin/contacts/placeholder-email-catchup` (même corps).
