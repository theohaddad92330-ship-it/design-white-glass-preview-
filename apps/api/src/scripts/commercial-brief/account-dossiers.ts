import type { DossierConversion, JsonObject } from './account-dossier'
import { convertCreditAgricoleDossier } from './dossiers/credit-agricole'
import { convertEnedisDossier } from './dossiers/enedis'
import { convertSafranDossier } from './dossiers/safran'
import { convertVinciDossier } from './dossiers/vinci'
import { convertOrangeDossier, type OrangeAccountJson } from './orange-dossier'

/**
 * REGISTRE des dossiers de compte déposés par le CEO (12/10 Orange, 15/10 Crédit Agricole, VINCI, Enedis, Safran) :
 * un compte = ses fichiers dans le pack + son mapping. Le CLI `convert:account-dossier` les lit tous de la même façon.
 */
type AccountDossier = {
  slug: string
  /** Nom du compte tel que la salle démo le porte (`COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY`). */
  name: string
  accountFile: string
  contactsFile: string
  convert: (input: { account: JsonObject; contactsCsv: string; sourcesCsv: string }) => DossierConversion
}

export const ACCOUNT_DOSSIERS: readonly AccountDossier[] = [
  {
    slug: 'orange',
    name: 'Orange',
    accountFile: 'orange_account.json',
    contactsFile: 'contacts_orange.csv',
    convert: input => convertOrangeDossier({ ...input, account: input.account as unknown as OrangeAccountJson }),
  },
  {
    slug: 'credit-agricole',
    name: 'Crédit Agricole',
    accountFile: 'credit_agricole_account.json',
    contactsFile: 'contacts_credit_agricole.csv',
    convert: convertCreditAgricoleDossier,
  },
  {
    slug: 'vinci',
    name: 'VINCI',
    accountFile: 'vinci_account.json',
    contactsFile: 'contacts_vinci.csv',
    convert: convertVinciDossier,
  },
  {
    slug: 'enedis',
    name: 'Enedis',
    accountFile: 'enedis_account.json',
    contactsFile: 'contacts_enedis.csv',
    convert: convertEnedisDossier,
  },
  {
    slug: 'safran',
    name: 'Safran',
    accountFile: 'safran_account.json',
    contactsFile: 'contacts_safran.csv',
    convert: convertSafranDossier,
  },
]
