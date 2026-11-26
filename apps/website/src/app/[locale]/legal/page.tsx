import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: 'Mentions légales',
    description: "Mentions légales de l'éditeur du site BellumAI.",
  },
  en: {
    title: 'Legal notice',
    description: 'Legal notice for the publisher of the BellumAI website.',
  },
  de: {
    title: 'Impressum',
    description: 'Impressum des Herausgebers der BellumAI-Website.',
  },
  nl: {
    title: 'Juridische vermeldingen',
    description: 'Juridische vermeldingen van de uitgever van de BellumAI-website.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/legal'),
  }
}

const EMAIL_LINK = 'text-violet-300 transition-colors hover:text-violet-200'

export default async function MentionsLegalesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Impressum"
        lastUpdated="25. Mai 2026"
        intro="Gemäß dem französischen Gesetz Nr. 2004-575 vom 21. Juni 2004 für das Vertrauen in die digitale Wirtschaft (LCEN) sowie der Datenschutz-Grundverordnung (DSGVO) wird dieses Impressum allen Nutzern der Website www.bellum-ai.com und der BellumAI-Plattform (nachfolgend zusammen die „Website“) zur Kenntnis gebracht."
        sections={[
          {
            id: 'editeur',
            title: 'Herausgeber der Website',
            body: (
              <>
                <p>
                  Die Website wird herausgegeben von BELLUM, einer vereinfachten Aktiengesellschaft mit einem
                  Alleingesellschafter nach französischem Recht (SASU) mit einem Stammkapital von 1.000,00 Euro,
                  eingetragen im Handels- und Gesellschaftsregister von Paris unter der Nummer 931 750 681, mit Sitz in
                  90, rue des Archives, 75003 Paris.
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>SIRET-Nummer (Sitz): 931 750 681 00013.</li>
                  <li>APE-Code: 62.01Z (Computerprogrammierung).</li>
                  <li>Innergemeinschaftliche USt-IdNr.: FR48931750681.</li>
                  <li>
                    Verantwortlicher für die Veröffentlichung: Herr Théo Haddad, in seiner Eigenschaft als Präsident von
                    BELLUM.
                  </li>
                  <li>Datenschutzbeauftragter: Herr Théo Haddad.</li>
                  <li>
                    E-Mail-Adresse:{' '}
                    <a href="mailto:contact@bellum-it.com" className={EMAIL_LINK}>
                      contact@bellum-it.com
                    </a>
                    .
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'hebergement',
            title: 'Hosting',
            body: (
              <>
                <p>
                  Die Website wird gehostet von Vercel Inc., mit Sitz in 340 S Lemon Ave #4133, Walnut, CA 91789,
                  Vereinigte Staaten von Amerika. Telefon: +1 (559) 288-7060. Website:{' '}
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={EMAIL_LINK}>
                    https://vercel.com
                  </a>
                  .
                </p>
                <p>
                  Es wird klargestellt, dass sämtliche Anwendungsdaten, insbesondere personenbezogene Daten, im Gebiet
                  der Europäischen Union gehostet werden, im Einklang mit den Anforderungen der DSGVO.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Geistiges Eigentum',
            body: (
              <>
                <p>
                  Alle Marken, Fotografien, Texte, Kommentare, Illustrationen, bewegte und unbewegte Bilder,
                  Videosequenzen, Töne sowie alle Computeranwendungen, die zum Betrieb der Website verwendet werden
                  könnten, und allgemein alle auf der Website wiedergegebenen oder verwendeten Elemente sind durch die
                  geltenden Gesetze zum Schutz des geistigen Eigentums geschützt.
                </p>
                <p>
                  Sie sind, sofern nicht anders angegeben, vollständiges und ausschließliches Eigentum von BELLUM. Jede
                  Vervielfältigung, Darstellung, Anpassung, Übersetzung oder allgemein jede vollständige oder teilweise
                  Nutzung der Website und ihrer Inhalte, in welcher Form auch immer, einschließlich Computeranwendungen,
                  ist ohne vorherige schriftliche Zustimmung von BELLUM strengstens untersagt.
                </p>
                <p>
                  Die Missachtung dieses Verbots stellt eine Schutzrechtsverletzung dar, die die zivil- und
                  strafrechtliche Haftung des Verletzers begründen kann.
                </p>
              </>
            ),
          },
          {
            id: 'responsabilite',
            title: 'Haftung',
            body: (
              <>
                <p>
                  BELLUM behält sich das Recht vor, den Inhalt der Website jederzeit zu ändern. BELLUM verwaltet deren
                  Aktualisierungen, garantiert jedoch nicht die Abwesenheit von Fehlern oder Ungenauigkeiten auf der
                  Website.
                </p>
                <p>
                  Die von der BellumAI-Plattform erzeugten Analysen, Kontakte, Empfehlungen und Daten dienen
                  ausschließlich Informations- und Orientierungszwecken. Sie stellen in keinem Fall eine rechtliche,
                  finanzielle oder geschäftliche Beratung dar. Der Nutzer bleibt allein verantwortlich für die
                  Verwendung der von der Plattform bereitgestellten Informationen, insbesondere für die Überprüfung der
                  Richtigkeit der Daten vor jeder geschäftlichen Handlung.
                </p>
                <p>
                  BELLUM lehnt jede Haftung für materielle oder immaterielle Schäden ab, die direkt oder indirekt durch
                  den Zugriff auf die Website oder die Nutzung der Plattform verursacht werden könnten.
                </p>
              </>
            ),
          },
          {
            id: 'liens-hypertextes',
            title: 'Hyperlinks',
            body: (
              <>
                <p>
                  Die Website kann Hyperlinks enthalten, die zu anderen Websites führen, die von Dritten und nicht von
                  BELLUM herausgegeben und verwaltet werden. BELLUM kann weder direkt noch indirekt haftbar gemacht
                  werden, falls diese Drittseiten die geltenden gesetzlichen Bestimmungen nicht einhalten.
                </p>
                <p>
                  Hyperlinks auf die Website dürfen nur mit vorheriger schriftlicher Genehmigung von BELLUM gesetzt
                  werden.
                </p>
              </>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Anwendbares Recht',
            body: (
              <p>
                Dieses Impressum unterliegt französischem Recht. Im Streitfall sind, nach einem Versuch der gütlichen
                Einigung, ausschließlich die zuständigen Gerichte von Paris zuständig.
              </p>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'nl') {
    return (
      <LegalPage
        title="Juridische vermeldingen"
        lastUpdated="25 mei 2026"
        intro='Overeenkomstig de Franse wet nr. 2004-575 van 21 juni 2004 voor het vertrouwen in de digitale economie (LCEN) en de Algemene Verordening Gegevensbescherming (GDPR) worden deze juridische vermeldingen ter kennis gebracht van elke gebruiker van de website www.bellum-ai.com en van het BellumAI-platform (hierna samen de "Site" genoemd).'
        sections={[
          {
            id: 'editeur',
            title: 'Uitgever van de Site',
            body: (
              <>
                <p>
                  De Site wordt uitgegeven door BELLUM, een vereenvoudigde eenpersoonsvennootschap op aandelen naar
                  Frans recht (SASU) met een maatschappelijk kapitaal van 1.000,00 euro, ingeschreven in het handels- en
                  vennootschapsregister van Parijs onder nummer 931 750 681, met maatschappelijke zetel te 90, rue des
                  Archives, 75003 Parijs.
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>SIRET-nummer (zetel): 931 750 681 00013.</li>
                  <li>APE-code: 62.01Z (Computerprogrammering).</li>
                  <li>Intracommunautair btw-nummer: FR48931750681.</li>
                  <li>
                    Verantwoordelijke voor de publicatie: de heer Théo Haddad, in zijn hoedanigheid van voorzitter van
                    BELLUM.
                  </li>
                  <li>Functionaris voor gegevensbescherming: de heer Théo Haddad.</li>
                  <li>
                    E-mailadres:{' '}
                    <a href="mailto:contact@bellum-it.com" className={EMAIL_LINK}>
                      contact@bellum-it.com
                    </a>
                    .
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'hebergement',
            title: 'Hosting',
            body: (
              <>
                <p>
                  De Site wordt gehost door Vercel Inc., met maatschappelijke zetel te 340 S Lemon Ave #4133, Walnut, CA
                  91789, Verenigde Staten van Amerika. Telefoon: +1 (559) 288-7060. Website:{' '}
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={EMAIL_LINK}>
                    https://vercel.com
                  </a>
                  .
                </p>
                <p>
                  Er wordt verduidelijkt dat alle applicatiegegevens, en in het bijzonder de persoonsgegevens, worden
                  gehost op het grondgebied van de Europese Unie, overeenkomstig de vereisten van de GDPR.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Intellectuele eigendom',
            body: (
              <>
                <p>
                  Alle merken, foto's, teksten, commentaren, illustraties, al dan niet bewegende beelden,
                  videosequenties, geluiden, evenals alle computertoepassingen die kunnen worden gebruikt om de Site te
                  laten werken en, meer in het algemeen, alle op de Site gereproduceerde of gebruikte elementen, worden
                  beschermd door de geldende wetgeving inzake intellectuele eigendom.
                </p>
                <p>
                  Zij zijn de volledige en exclusieve eigendom van BELLUM, tenzij anders vermeld. Elke reproductie,
                  weergave, aanpassing, vertaling of, meer in het algemeen, elk gebruik van de Site en zijn inhoud,
                  geheel of gedeeltelijk, in welke vorm dan ook, met inbegrip van computertoepassingen, is strikt
                  verboden zonder voorafgaande schriftelijke toestemming van BELLUM.
                </p>
                <p>
                  Niet-naleving van dit verbod vormt een inbreuk die de burgerlijke en strafrechtelijke
                  aansprakelijkheid van de inbreukmaker in het gedrang kan brengen.
                </p>
              </>
            ),
          },
          {
            id: 'responsabilite',
            title: 'Aansprakelijkheid',
            body: (
              <>
                <p>
                  BELLUM behoudt zich het recht voor om de inhoud van de Site op elk moment te wijzigen. BELLUM beheert
                  de updates ervan, maar garandeert niet dat de Site vrij is van fouten of onnauwkeurigheden.
                </p>
                <p>
                  De analyses, contacten, aanbevelingen en gegevens die door het BellumAI-platform worden gegenereerd,
                  worden uitsluitend ter informatie en ter indicatie verstrekt. Zij vormen in geen geval juridisch,
                  financieel of commercieel advies. De gebruiker blijft als enige verantwoordelijk voor het gebruik dat
                  hij maakt van de door het platform verstrekte informatie, en in het bijzonder voor het verifiëren van
                  de juistheid van de gegevens vóór elke commerciële stap.
                </p>
                <p>
                  BELLUM wijst elke aansprakelijkheid af voor materiële of immateriële schade die direct of indirect zou
                  kunnen worden veroorzaakt door de toegang tot de Site of het gebruik van het platform.
                </p>
              </>
            ),
          },
          {
            id: 'liens-hypertextes',
            title: 'Hyperlinks',
            body: (
              <>
                <p>
                  De Site kan hyperlinks bevatten die toegang geven tot andere websites die door derden en niet door
                  BELLUM worden uitgegeven en beheerd. BELLUM kan niet direct of indirect aansprakelijk worden gesteld
                  indien deze sites van derden de toepasselijke wettelijke bepalingen niet naleven.
                </p>
                <p>
                  Hyperlinks naar de Site mogen alleen worden aangemaakt met de voorafgaande schriftelijke toestemming
                  van BELLUM.
                </p>
              </>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Toepasselijk recht',
            body: (
              <p>
                Deze juridische vermeldingen worden beheerst door het Franse recht. In geval van geschil, en na een
                poging tot minnelijke schikking, zijn uitsluitend de bevoegde rechtbanken van Parijs bevoegd.
              </p>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'en') {
    return (
      <LegalPage
        title="Legal notice"
        lastUpdated="May 25, 2026"
        intro='In accordance with French Law No. 2004-575 of 21 June 2004 for confidence in the digital economy (LCEN), as well as the General Data Protection Regulation (GDPR), this legal notice is brought to the attention of all users of the website www.bellum-ai.com and of the BellumAI platform (together referred to hereinafter as the "Site").'
        sections={[
          {
            id: 'editeur',
            title: 'Site publisher',
            body: (
              <>
                <p>
                  The Site is published by BELLUM, a French simplified joint-stock company (SASU) with a share capital
                  of 1,000.00 euros, registered with the Paris Trade and Companies Register under number 931 750 681,
                  whose registered office is located at 90, rue des Archives, 75003 Paris.
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>SIRET number (registered office): 931 750 681 00013.</li>
                  <li>APE code: 62.01Z (Computer programming).</li>
                  <li>Intra-community VAT number: FR48931750681.</li>
                  <li>Publication director: Mr Théo Haddad, in his capacity as President of BELLUM.</li>
                  <li>Data protection officer: Mr Théo Haddad.</li>
                  <li>
                    Email address:{' '}
                    <a href="mailto:contact@bellum-it.com" className={EMAIL_LINK}>
                      contact@bellum-it.com
                    </a>
                    .
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'hebergement',
            title: 'Hosting',
            body: (
              <>
                <p>
                  The Site is hosted by Vercel Inc., whose registered office is located at 340 S Lemon Ave #4133,
                  Walnut, CA 91789, United States of America. Telephone: +1 (559) 288-7060. Website:{' '}
                  <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={EMAIL_LINK}>
                    https://vercel.com
                  </a>
                  .
                </p>
                <p>
                  It is specified that all application data, and in particular personal data, is hosted within the
                  territory of the European Union, in accordance with the requirements of the GDPR.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Intellectual property',
            body: (
              <>
                <p>
                  All trademarks, photographs, texts, comments, illustrations, animated or still images, video
                  sequences, sounds, as well as all computer applications that may be used to operate the Site and, more
                  generally, all elements reproduced or used on the Site, are protected by the laws in force relating to
                  intellectual property.
                </p>
                <p>
                  They are the full and exclusive property of BELLUM, save where otherwise indicated. Any reproduction,
                  representation, adaptation, translation or, more generally, any use of the Site and its content,
                  whether in whole or in part, in any form whatsoever, including computer applications, is strictly
                  prohibited without the prior written consent of BELLUM.
                </p>
                <p>
                  Failure to comply with this prohibition constitutes an infringement that may engage the civil and
                  criminal liability of the infringer.
                </p>
              </>
            ),
          },
          {
            id: 'responsabilite',
            title: 'Liability',
            body: (
              <>
                <p>
                  BELLUM reserves the right to modify the content of the Site at any time. It manages the updates
                  thereof. However, it does not guarantee the absence of any error or inaccuracy on the Site.
                </p>
                <p>
                  The analyses, contacts, recommendations and data generated by the BellumAI platform are produced for
                  information and guidance purposes only. They in no way constitute legal, financial or commercial
                  advice. The user remains solely responsible for the use they make of the information provided by the
                  platform, and in particular for verifying the accuracy of the data before undertaking any commercial
                  action.
                </p>
                <p>
                  BELLUM disclaims all liability for any material or immaterial damage that may be directly or
                  indirectly caused as a result of accessing the Site or using the platform.
                </p>
              </>
            ),
          },
          {
            id: 'liens-hypertextes',
            title: 'Hyperlinks',
            body: (
              <>
                <p>
                  The Site may contain hyperlinks giving access to other websites published and managed by third parties
                  and not by BELLUM. BELLUM cannot be held liable, directly or indirectly, in the event that such
                  third-party sites fail to comply with the applicable legal provisions.
                </p>
                <p>
                  The creation of hyperlinks to the Site may only be carried out with the prior written authorisation of
                  BELLUM.
                </p>
              </>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Governing law',
            body: (
              <p>
                This legal notice is governed by French law. In the event of a dispute, and after an attempt at amicable
                resolution, the competent courts of Paris shall have sole jurisdiction.
              </p>
            ),
          },
        ]}
      />
    )
  }
  return (
    <LegalPage
      title="Mentions légales"
      lastUpdated="25 mai 2026"
      intro="Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), ainsi qu'au Règlement général sur la protection des données (RGPD), les présentes mentions légales sont portées à la connaissance de tout utilisateur du site internet www.bellum-ai.com et de la plateforme BellumAI (désignés ensemble ci-après le « Site »)."
      sections={[
        {
          id: 'editeur',
          title: 'Éditeur du Site',
          body: (
            <>
              <p>
                Le Site est édité par la société BELLUM, société par actions simplifiée unipersonnelle (SASU) au capital
                social de 1 000,00 euros, immatriculée au Registre du commerce et des sociétés de Paris sous le numéro
                931 750 681, dont le siège social est situé au 90, rue des Archives, 75003 Paris.
              </p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Numéro SIRET (siège) : 931 750 681 00013.</li>
                <li>Code APE : 62.01Z (Programmation informatique).</li>
                <li>Numéro de TVA intracommunautaire : FR48931750681.</li>
                <li>
                  Directeur de la publication : Monsieur Théo Haddad, en sa qualité de Président de la société BELLUM.
                </li>
                <li>Délégué à la protection des données : Monsieur Théo Haddad.</li>
                <li>
                  Adresse de courrier électronique :{' '}
                  <a href="mailto:contact@bellum-it.com" className={EMAIL_LINK}>
                    contact@bellum-it.com
                  </a>
                  .
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'hebergement',
          title: 'Hébergement',
          body: (
            <>
              <p>
                Le Site est hébergé par la société Vercel Inc., dont le siège social est situé au 340 S Lemon Ave #4133,
                Walnut, CA 91789, États-Unis d'Amérique. Téléphone : +1 (559) 288-7060. Site internet :{' '}
                <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className={EMAIL_LINK}>
                  https://vercel.com
                </a>
                .
              </p>
              <p>
                Il est précisé que l'ensemble des données applicatives, et notamment les données à caractère personnel,
                est hébergé sur le territoire de l'Union européenne, conformément aux exigences du RGPD.
              </p>
            </>
          ),
        },
        {
          id: 'propriete-intellectuelle',
          title: 'Propriété intellectuelle',
          body: (
            <>
              <p>
                Toutes les marques, photographies, textes, commentaires, illustrations, images animées ou non, séquences
                vidéo, sons, ainsi que toutes les applications informatiques qui pourraient être utilisées pour faire
                fonctionner le Site et, plus généralement, tous les éléments reproduits ou utilisés sur le Site, sont
                protégés par les lois en vigueur au titre de la propriété intellectuelle.
              </p>
              <p>
                Ils sont la propriété pleine et entière de la société BELLUM, sauf mentions particulières. Toute
                reproduction, représentation, adaptation, traduction ou, de manière générale, toute utilisation du Site
                et de son contenu, qu'elle soit totale ou partielle, sous quelque forme que ce soit, y compris les
                applications informatiques, est strictement interdite sans l'accord préalable et écrit de la société
                BELLUM.
              </p>
              <p>
                Le non-respect de cette interdiction constitue une contrefaçon susceptible d'engager la responsabilité
                civile et pénale du contrefacteur.
              </p>
            </>
          ),
        },
        {
          id: 'responsabilite',
          title: 'Responsabilité',
          body: (
            <>
              <p>
                La société BELLUM se réserve le droit de modifier à tout moment le contenu du Site. Elle en gère les
                mises à jour. Cependant, elle ne garantit pas l'absence d'erreur ou d'inexactitude sur le Site.
              </p>
              <p>
                Les analyses, contacts, recommandations et données générés par la plateforme BellumAI sont produits à
                titre informatif et indicatif. Ils ne constituent en aucun cas un conseil juridique, financier ou
                commercial. L'utilisateur demeure seul responsable de l'usage qu'il fait des informations fournies par
                la plateforme, et notamment de la vérification de l'exactitude des données avant toute démarche
                commerciale.
              </p>
              <p>
                La société BELLUM décline toute responsabilité sur les dommages matériels ou immatériels qui pourraient
                être directement ou indirectement causés à la suite de l'accès au Site ou de l'utilisation de la
                plateforme.
              </p>
            </>
          ),
        },
        {
          id: 'liens-hypertextes',
          title: 'Liens hypertextes',
          body: (
            <>
              <p>
                Le Site peut contenir des liens hypertextes donnant accès à d'autres sites internet édités et gérés par
                des tiers et non par la société BELLUM. La société BELLUM ne pourra être tenue responsable, directement
                ou indirectement, dans le cas où lesdits sites tiers ne respecteraient pas les dispositions légales.
              </p>
              <p>
                La création de liens hypertextes vers le Site ne peut être faite qu'avec l'autorisation écrite et
                préalable de la société BELLUM.
              </p>
            </>
          ),
        },
        {
          id: 'droit-applicable',
          title: 'Droit applicable',
          body: (
            <p>
              Les présentes mentions légales sont régies par le droit français. En cas de litige, et après tentative de
              résolution amiable, les tribunaux compétents de Paris seront seuls compétents.
            </p>
          ),
        },
      ]}
    />
  )
}
