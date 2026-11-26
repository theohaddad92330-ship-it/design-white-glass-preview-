import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: "Conditions générales d'utilisation",
    description: "Conditions générales d'utilisation de la plateforme BellumAI.",
  },
  en: {
    title: 'General terms of use',
    description: 'General terms of use of the BellumAI platform.',
  },
  de: {
    title: 'Allgemeine Nutzungsbedingungen',
    description: 'Allgemeine Nutzungsbedingungen der Plattform BellumAI.',
  },
  nl: {
    title: 'Algemene gebruiksvoorwaarden',
    description: 'Algemene gebruiksvoorwaarden van het platform BellumAI.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/cgu'),
  }
}

const LINK = 'text-violet-300 transition-colors hover:text-violet-200'
const TERM = 'font-medium text-white'

export default async function CguPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Allgemeine Nutzungsbedingungen"
        lastUpdated="25. Mai 2026"
        sections={[
          {
            id: 'application',
            title: 'Anwendungsbereich',
            body: (
              <>
                <p>
                  BELLUM ist ein Entwickler und Herausgeber von Software. Das Unternehmen hat die Plattform BellumAI
                  entwickelt, eine SaaS-Lösung für Vertriebsintelligenz, die ein Hilfsmittel für Fachleute bei der
                  Neukundengewinnung und der Erschließung von Zielkunden darstellt (nachstehend die „Plattform“).
                </p>
                <p>
                  Die vorliegenden allgemeinen Nutzungsbedingungen (nachstehend die „Nutzungsbedingungen“) regeln die
                  Beziehungen zwischen BELLUM, einer SASU (vereinfachte Aktiengesellschaft mit Alleingesellschafter nach
                  französischem Recht) mit einem Stammkapital von 1.000,00 Euro, mit Sitz in 90, rue des Archives, 75003
                  Paris, eingetragen im Handelsregister (R.C.S.) Paris unter der Nummer 931 750 681 (nachstehend „die
                  Gesellschaft“ oder „BELLUM“), und jeder Person, die die Plattform nutzt (nachstehend der „Nutzer“).
                </p>
                <p>
                  Die Nutzung der Plattform gilt als Annahme der vorliegenden Nutzungsbedingungen durch den Nutzer und
                  insbesondere als Annahme der folgenden Bedingungen: als Fachperson im Rahmen der eigenen gewerblichen
                  Tätigkeit zu handeln, Inhaber eines Nutzerkontos zu sein und jede betrügerische Nutzung der Plattform
                  zu unterlassen. Die Erstellung eines Kontos mit falschen Angaben stellt einen Verstoß gegen die
                  vorliegenden Nutzungsbedingungen dar.
                </p>
                <p>
                  Die Gesellschaft behält sich das Recht vor, die Nutzungsbedingungen jederzeit zu ändern. Änderungen
                  werden den Nutzern per E-Mail oder durch eine Benachrichtigung innerhalb der Plattform mindestens
                  fünfzehn Tage vor ihrem Inkrafttreten mitgeteilt. Die fortgesetzte Nutzung der Plattform nach dem
                  Inkrafttreten der neuen Nutzungsbedingungen gilt als Annahme. Anwendbar sind die Nutzungsbedingungen
                  in der zum Zeitpunkt der Nutzung der Plattform geltenden Fassung.
                </p>
              </>
            ),
          },
          {
            id: 'definitions',
            title: 'Begriffsbestimmungen',
            body: (
              <>
                <p>
                  <b className={TERM}>Plattform</b>: bezeichnet die SaaS-Lösung der Gesellschaft, erreichbar unter
                  https://www.bellum-ai.com/, auf die ein Nutzer mit seinem Nutzerkonto zugreift.
                </p>
                <p>
                  <b className={TERM}>Nutzer</b>: bezeichnet jede natürliche Person, die von einer juristischen Person
                  ordnungsgemäß ermächtigt wurde und auf die von der Gesellschaft auf der Plattform angebotenen Dienste
                  zugreift.
                </p>
                <p>
                  <b className={TERM}>Dienste</b>: bezeichnet die den Nutzern über die Plattform erbrachten
                  Dienstleistungen, wie in den AVB beschrieben.
                </p>
                <p>
                  <b className={TERM}>Analyse</b>: bezeichnet den automatisierten Prozess, mit dem die Plattform ein
                  Vertriebsintelligenz-Dossier zu einem Zielunternehmen erstellt, bestehend aus einem
                  Unternehmensprofil, einer Liste beruflicher Kontakte, strategischen Empfehlungen und personalisierten
                  Nachrichten.
                </p>
                <p>
                  <b className={TERM}>Credit</b>: bezeichnet die Verbrauchseinheit, mit der eine Analyse auf der
                  Plattform gestartet werden kann.
                </p>
              </>
            ),
          },
          {
            id: 'inscription-compte',
            title: 'Registrierung und Nutzerkonto',
            body: (
              <>
                <p>
                  Der Zugang zu den Diensten erfordert die Erstellung eines Nutzerkontos. Die Registrierung erfolgt
                  durch das Ausfüllen eines Online-Formulars mit Vorname, Nachname, beruflicher E-Mail-Adresse und der
                  Erstellung eines Passworts, gefolgt von der ausdrücklichen Annahme der vorliegenden
                  Nutzungsbedingungen und der{' '}
                  <Link href="/privacy" className={LINK}>
                    Datenschutzerklärung
                  </Link>
                  .
                </p>
                <p>
                  Der Nutzer verpflichtet sich, richtige, vollständige und aktuelle Angaben zu machen und diese
                  regelmäßig zu aktualisieren. Er verpflichtet sich, die Vertraulichkeit seiner Zugangsdaten zu wahren.
                  Das Nutzerkonto ist ausschließlich zur persönlichen Nutzung durch den Nutzer bestimmt, unter
                  Ausschluss jeder dritten natürlichen oder juristischen Person.
                </p>
                <p>
                  Der Nutzer ist allein für jede Nutzung seines Kontos verantwortlich, auch im Falle einer
                  betrügerischen Nutzung. Im Falle einer unbefugten Nutzung seines Kontos verpflichtet sich der Nutzer,
                  die Gesellschaft unverzüglich per E-Mail an{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  zu informieren.
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Einsatz künstlicher Intelligenz',
            body: (
              <>
                <p>
                  Die Plattform verwendet Technologien der künstlichen Intelligenz, um Analysen, Empfehlungen,
                  Nachrichten und Aktionspläne zu erstellen. Gemäß der Verordnung (EU) 2024/1689 vom 13. Juni 2024
                  (KI-Verordnung) wird der Nutzer darüber informiert, dass die von der Plattform erzeugten Inhalte durch
                  künstliche Intelligenz generiert oder unterstützt werden.
                </p>
                <p>
                  Der Nutzer erkennt an und akzeptiert, dass: die generierten Inhalte lediglich unverbindliche
                  Vorschläge darstellen; die Qualität der Ergebnisse von den vom Nutzer bereitgestellten Informationen
                  und von der Verfügbarkeit der Quellen abhängt; die Daten Ungenauigkeiten enthalten können; es ihm
                  obliegt, die Richtigkeit der Informationen vor jeder geschäftlichen Maßnahme zu überprüfen; die
                  künstliche Intelligenz keine autonome Entscheidung im Namen des Nutzers trifft.
                </p>
              </>
            ),
          },
          {
            id: 'comportements-interdits',
            title: 'Verbotene Verhaltensweisen',
            body: (
              <p>
                Der Nutzer verpflichtet sich, Folgendes zu unterlassen: die Nutzung der Plattform zu rechtswidrigen oder
                gegen die vorliegenden Nutzungsbedingungen verstoßenden Zwecken; den Versuch, die technischen
                Beschränkungen der Plattform zu umgehen, insbesondere das Credit-System oder die
                Zugangskontrollmechanismen; die systematische oder massenhafte Extraktion von Daten aus der Plattform
                mit welchen Mitteln auch immer; den Weiterverkauf, die Abtretung oder die Überlassung des Zugangs zu
                seinem Konto oder der Rohergebnisse der Plattform an Dritte zu Wettbewerbszwecken; die Beeinträchtigung
                der Sicherheit, der Integrität oder der Verfügbarkeit der Plattform; die Nutzung der Plattform zum
                Versand von Mitteilungen, die Spam darstellen.
              </p>
            ),
          },
          {
            id: 'usage-contacts',
            title: 'Verantwortungsvoller Umgang mit beruflichen Kontakten',
            body: (
              <>
                <p>
                  Die von der Plattform bereitgestellten beruflichen Kontaktdaten sind ausschließlich für die
                  geschäftliche Akquise im Geschäftsverkehr zwischen Unternehmen (B2B) bestimmt, unter Einhaltung der
                  Bestimmungen der DSGVO, der Richtlinie 2002/58/EG (ePrivacy-Richtlinie) und des anwendbaren
                  französischen Rechts.
                </p>
                <p>
                  Der Nutzer verpflichtet sich: die für die elektronische Geschäftsakquise geltenden Regeln einzuhalten;
                  keine unaufgeforderten elektronischen Mitteilungen massenhaft zu versenden; das Widerspruchsrecht der
                  kontaktierten Personen zu respektieren; die Daten verhältnismäßig und ausschließlich im Rahmen einer
                  legitimen Geschäftsakquise zu verwenden; keine privaten Kontaktdaten (private E-Mail-Adressen wie
                  Gmail, Hotmail usw.) ohne vorherige Einwilligung der betroffenen Personen für die Geschäftsakquise zu
                  nutzen.
                </p>
                <p>
                  BELLUM lehnt jede Haftung für die Verwendung der von der Plattform bereitgestellten Kontaktdaten durch
                  den Nutzer ab. Der Nutzer ist allein für die Einhaltung der im Rahmen seiner geschäftlichen
                  Tätigkeiten anwendbaren Vorschriften verantwortlich.
                </p>
              </>
            ),
          },
          {
            id: 'disponibilite',
            title: 'Verfügbarkeit des Dienstes',
            body: (
              <p>
                Die Gesellschaft bemüht sich, die Verfügbarkeit der Plattform rund um die Uhr an sieben Tagen in der
                Woche sicherzustellen, ohne diese jedoch absolut garantieren zu können. Der Dienst kann für
                Wartungsarbeiten, technische Aktualisierungen oder im Falle höherer Gewalt im Sinne von Artikel 1218 des
                französischen Zivilgesetzbuchs (Code civil) unterbrochen werden. Die Gesellschaft haftet nicht für
                Dienstunterbrechungen, Antwortzeiten, Fehler oder vorübergehende Nichtverfügbarkeiten der Plattform.
              </p>
            ),
          },
          {
            id: 'informations-publiees',
            title: 'Auf der Plattform veröffentlichte Informationen',
            body: (
              <p>
                Die von der Plattform erzeugten Analyseergebnisse (Unternehmensprofile, Kontaktlisten, Aktionspläne,
                Nachrichten) können vom Nutzer in seinem persönlichen Bereich eingesehen werden. Die Verwendung dieser
                Informationen erfolgt auf eigenes Risiko des Nutzers. Die Gesellschaft ist nicht verpflichtet, bestimmte
                Informationen auf der Plattform zu veröffentlichen oder aufrechtzuerhalten, und kann deren Inhalt
                jederzeit ändern oder löschen.
              </p>
            ),
          },
          {
            id: 'suspension-resiliation',
            title: 'Sperrung und Kündigung des Kontos',
            body: (
              <>
                <p>
                  Die Gesellschaft kann den Zugang zum Konto eines Nutzers bei einem schwerwiegenden Verstoß gegen die
                  vorliegenden Nutzungsbedingungen unverzüglich sperren, insbesondere bei missbräuchlicher Nutzung der
                  Plattform, dem Versuch, die Sicherheitsmaßnahmen zu umgehen, massenhafter Datenextraktion, einer Spam
                  darstellenden Nutzung, Betrug, Diebstahl oder jeder anderen durch die Nutzung der Plattform begangenen
                  Straftat. Der gesperrte Nutzer wird per E-Mail über die Sperrung oder Kündigung seines Kontos
                  informiert. In diesem Fall ist es dem Nutzer untersagt, sich erneut auf der Plattform zu registrieren.
                </p>
                <p>
                  Der Nutzer kann die Löschung seines Kontos jederzeit per E-Mail an{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  beantragen. Die Löschung des Kontos führt zur endgültigen Löschung der zugehörigen Daten innerhalb von
                  dreißig Tagen, vorbehaltlich der in der{' '}
                  <Link href="/privacy" className={LINK}>
                    Datenschutzerklärung
                  </Link>{' '}
                  genannten gesetzlichen Aufbewahrungspflichten.
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
                  Die Marke BELLUM sowie sämtliche Bild- und Wortmarken und ganz allgemein alle anderen Marken,
                  Illustrationen, Bilder, Logos, Datenbanken, Algorithmen und Softwarekomponenten der Gesellschaft, ob
                  eingetragen oder nicht, sind und bleiben das ausschließliche Eigentum der Gesellschaft.
                </p>
                <p>
                  Jede vollständige oder teilweise Vervielfältigung, Änderung oder Nutzung dieser Elemente, aus welchem
                  Grund und auf welchem Medium auch immer, ohne die ausdrückliche vorherige Zustimmung der Gesellschaft
                  ist strengstens untersagt und würde eine Rechtsverletzung im Sinne der Artikel L. 335-2 ff. des
                  französischen Gesetzbuchs über geistiges Eigentum (Code de la propriété intellectuelle) darstellen.
                </p>
              </>
            ),
          },
          {
            id: 'mode-preuve',
            title: 'Beweismittel',
            body: (
              <p>
                Im Falle einer Streitigkeit mit einem Dritten oder zum Nachweis von Tatsachen erklärt sich der Nutzer
                ausdrücklich damit einverstanden, dass sämtliche über seine Aktivität auf der Plattform erhobenen Daten
                (Verbindungsprotokolle, durchgeführte Aktionen, Zeitstempel) als Beweismittel zugelassen werden.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Unwirksamkeit einer Klausel',
            body: (
              <p>
                Sollte eine der Bestimmungen der vorliegenden Nutzungsbedingungen für nichtig erklärt werden, so berührt
                diese Nichtigkeit nicht die Wirksamkeit der übrigen Bestimmungen der Nutzungsbedingungen, die in Kraft
                bleiben.
              </p>
            ),
          },
          {
            id: 'contact',
            title: 'Kontakt',
            body: (
              <p>
                BELLUM, 90 rue des Archives, 75003 Paris, Frankreich. Verantwortlicher: Herr Théo Haddad. E-Mail:{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                .
              </p>
            ),
          },
          {
            id: 'loi-applicable',
            title: 'Anwendbares Recht und Gerichtsstand',
            body: (
              <p>
                Die vorliegenden Nutzungsbedingungen unterliegen französischem Recht. Für alle Streitigkeiten aus dem
                Zustandekommen, der Auslegung oder der Erfüllung der vorliegenden Nutzungsbedingungen sind, sofern keine
                gütliche Einigung erzielt wird, ausschließlich die Gerichte von Paris zuständig, ungeachtet einer
                Mehrheit von Beklagten oder einer Streitverkündung.
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
        title="Algemene gebruiksvoorwaarden"
        lastUpdated="25 mei 2026"
        sections={[
          {
            id: 'application',
            title: 'Toepassing',
            body: (
              <>
                <p>
                  BELLUM is een ontwerper en uitgever van software. Zij heeft het platform BellumAI ontwikkeld, een
                  SaaS-oplossing voor commerciële intelligence die een hulpmiddel vormt voor professionals bij
                  prospectie en het veroveren van accounts (hierna het 'Platform' genoemd).
                </p>
                <p>
                  Deze algemene gebruiksvoorwaarden (hierna de 'Gebruiksvoorwaarden') regelen de betrekkingen tussen
                  BELLUM, een SASU (vereenvoudigde aandelenvennootschap met één aandeelhouder naar Frans recht) met een
                  kapitaal van 1.000,00 euro, waarvan de zetel gevestigd is te 90, rue des Archives, 75003 Paris,
                  ingeschreven in het handelsregister (R.C.S.) van Parijs onder nummer 931 750 681 (hierna 'de
                  Vennootschap' of 'BELLUM' genoemd), en elke persoon die het Platform gebruikt (hierna de 'Gebruiker'
                  genoemd).
                </p>
                <p>
                  Het gebruik van het Platform geldt als aanvaarding van deze Gebruiksvoorwaarden door de Gebruiker, en
                  in het bijzonder als aanvaarding van de volgende voorwaarden: een professional zijn die handelt in het
                  kader van zijn commerciële activiteit, houder zijn van een Gebruikersaccount, en zich onthouden van
                  elk frauduleus gebruik van het Platform. Het aanmaken van een account met onjuiste gegevens vormt een
                  schending van deze Gebruiksvoorwaarden.
                </p>
                <p>
                  De Vennootschap behoudt zich het recht voor de Gebruiksvoorwaarden te allen tijde te wijzigen.
                  Wijzigingen worden ten minste vijftien dagen vóór hun inwerkingtreding per e-mail of via een melding
                  binnen het Platform aan de Gebruikers meegedeeld. Het voortgezette gebruik van het Platform na de
                  inwerkingtreding van de nieuwe Gebruiksvoorwaarden geldt als aanvaarding. De toepasselijke
                  Gebruiksvoorwaarden zijn die welke gelden op de datum van het gebruik van het Platform.
                </p>
              </>
            ),
          },
          {
            id: 'definitions',
            title: 'Definities',
            body: (
              <>
                <p>
                  <b className={TERM}>Platform</b>: verwijst naar de SaaS-oplossing van de Vennootschap, toegankelijk
                  via https://www.bellum-ai.com/, waartoe een Gebruiker toegang heeft met zijn Gebruikersaccount.
                </p>
                <p>
                  <b className={TERM}>Gebruiker</b>: verwijst naar elke natuurlijke persoon die, daartoe rechtsgeldig
                  gemachtigd door een rechtspersoon, toegang heeft tot de Diensten die de Vennootschap op het Platform
                  aanbiedt.
                </p>
                <p>
                  <b className={TERM}>Diensten</b>: verwijst naar de diensten die door het Platform aan de Gebruikers
                  worden geleverd, zoals beschreven in de Verkoopvoorwaarden.
                </p>
                <p>
                  <b className={TERM}>Analyse</b>: verwijst naar het geautomatiseerde proces waarmee het Platform een
                  commercieel intelligence-dossier over een doelonderneming genereert, bestaande uit een
                  bedrijfsprofiel, een lijst van professionele contacten, strategische aanbevelingen en
                  gepersonaliseerde berichten.
                </p>
                <p>
                  <b className={TERM}>Credit</b>: verwijst naar de verbruikseenheid waarmee een Analyse op het Platform
                  kan worden gestart.
                </p>
              </>
            ),
          },
          {
            id: 'inscription-compte',
            title: 'Registratie en Gebruikersaccount',
            body: (
              <>
                <p>
                  Toegang tot de Diensten vereist het aanmaken van een Gebruikersaccount. De registratie gebeurt door
                  het invullen van een onlineformulier met voornaam, achternaam, professioneel e-mailadres en het
                  aanmaken van een wachtwoord, gevolgd door de uitdrukkelijke aanvaarding van deze Gebruiksvoorwaarden
                  en van het{' '}
                  <Link href="/privacy" className={LINK}>
                    Privacybeleid
                  </Link>
                  .
                </p>
                <p>
                  De Gebruiker verbindt zich ertoe juiste, volledige en actuele gegevens te verstrekken en deze
                  regelmatig bij te werken. Hij verbindt zich ertoe de vertrouwelijkheid van zijn inloggegevens te
                  bewaren. Het Gebruikersaccount is strikt persoonlijk en uitsluitend bestemd voor gebruik door de
                  Gebruiker, met uitsluiting van elke derde, natuurlijke persoon of rechtspersoon.
                </p>
                <p>
                  De Gebruiker is als enige verantwoordelijk voor elk gebruik van zijn account, ook in geval van
                  frauduleus gebruik. In geval van ongeoorloofd gebruik van zijn account verbindt de Gebruiker zich
                  ertoe de Vennootschap onmiddellijk per e-mail te informeren via{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Gebruik van artificiële intelligentie',
            body: (
              <>
                <p>
                  Het Platform maakt gebruik van technologieën op het gebied van artificiële intelligentie om analyses,
                  aanbevelingen, berichten en actieplannen te genereren. Overeenkomstig Verordening (EU) 2024/1689 van
                  13 juni 2024 (AI-verordening) wordt de Gebruiker ervan in kennis gesteld dat de door het Platform
                  geproduceerde inhoud door artificiële intelligentie wordt gegenereerd of ondersteund.
                </p>
                <p>
                  De Gebruiker erkent en aanvaardt dat: de gegenereerde inhoud louter indicatieve suggesties betreft; de
                  kwaliteit van de resultaten afhangt van de door de Gebruiker verstrekte informatie en van de
                  beschikbaarheid van de bronnen; de gegevens onjuistheden kunnen bevatten; het aan hem is om de
                  geldigheid van de informatie te controleren alvorens enige commerciële actie te ondernemen; de
                  artificiële intelligentie geen autonome beslissing neemt namens de Gebruiker.
                </p>
              </>
            ),
          },
          {
            id: 'comportements-interdits',
            title: 'Verboden gedragingen',
            body: (
              <p>
                De Gebruiker verbindt zich ertoe niet: het Platform te gebruiken voor onwettige doeleinden of doeleinden
                die in strijd zijn met deze Gebruiksvoorwaarden; te trachten de technische beperkingen van het Platform
                te omzeilen, en met name het creditsysteem of de toegangscontrolemechanismen; op welke wijze dan ook
                over te gaan tot de systematische of massale extractie van gegevens van het Platform; de toegang tot
                zijn account of de ruwe resultaten van het Platform door te verkopen, over te dragen of ter beschikking
                te stellen van derden voor concurrerende doeleinden; afbreuk te doen aan de veiligheid, de integriteit
                of de beschikbaarheid van het Platform; het Platform te gebruiken om berichten te versturen die spam
                vormen.
              </p>
            ),
          },
          {
            id: 'usage-contacts',
            title: 'Verantwoord gebruik van professionele contacten',
            body: (
              <>
                <p>
                  De door het Platform verstrekte professionele contactgegevens zijn uitsluitend bestemd voor
                  commerciële prospectie tussen ondernemingen (B2B), met inachtneming van de bepalingen van de GDPR,
                  Richtlijn 2002/58/EG (ePrivacy-richtlijn) en de toepasselijke Franse wetgeving.
                </p>
                <p>
                  De Gebruiker verbindt zich ertoe: de regels inzake elektronische commerciële prospectie na te leven;
                  geen massale ongevraagde elektronische berichten te versturen; het recht van bezwaar van de
                  gecontacteerde personen te respecteren; de gegevens op evenredige wijze en strikt binnen het kader van
                  legitieme commerciële prospectie te gebruiken; geen persoonlijke contactgegevens (persoonlijke
                  e-mailadressen zoals Gmail, Hotmail, enz.) te gebruiken voor commerciële prospectie zonder de
                  voorafgaande toestemming van de betrokken personen.
                </p>
                <p>
                  BELLUM wijst elke aansprakelijkheid af voor het gebruik dat de Gebruiker maakt van de door het
                  Platform verstrekte contactgegevens. De Gebruiker is als enige verantwoordelijk voor de naleving van
                  de toepasselijke regelgeving in het kader van zijn commerciële activiteiten.
                </p>
              </>
            ),
          },
          {
            id: 'disponibilite',
            title: 'Beschikbaarheid van de dienst',
            body: (
              <p>
                De Vennootschap streeft ernaar de beschikbaarheid van het Platform vierentwintig uur per dag, zeven
                dagen per week te verzekeren, zonder dit evenwel absoluut te kunnen garanderen. De dienst kan worden
                onderbroken voor onderhoudswerkzaamheden, technische updates of in geval van overmacht in de zin van
                artikel 1218 van het Franse Burgerlijk Wetboek (Code civil). De Vennootschap kan niet aansprakelijk
                worden gesteld voor onderbrekingen van de dienst, responstijden, fouten of tijdelijke onbeschikbaarheid
                van het Platform.
              </p>
            ),
          },
          {
            id: 'informations-publiees',
            title: 'Op het Platform gepubliceerde informatie',
            body: (
              <p>
                De door het Platform gegenereerde analyseresultaten (bedrijfsprofielen, contactlijsten, actieplannen,
                berichten) kunnen door de Gebruiker in zijn persoonlijke omgeving worden geraadpleegd. Het gebruik van
                deze informatie gebeurt op eigen risico van de Gebruiker. De Vennootschap heeft geen enkele verplichting
                om specifieke informatie op het Platform te publiceren of te behouden en kan de inhoud ervan te allen
                tijde wijzigen of verwijderen.
              </p>
            ),
          },
          {
            id: 'suspension-resiliation',
            title: 'Schorsing en beëindiging van het account',
            body: (
              <>
                <p>
                  De Vennootschap kan de toegang tot het account van een Gebruiker onmiddellijk schorsen in geval van
                  een ernstige schending van deze Gebruiksvoorwaarden, en met name in geval van misbruik van het
                  Platform, een poging tot omzeiling van de beveiligingsmaatregelen, massale extractie van gegevens,
                  gebruik dat spam vormt, fraude, diefstal of enig ander strafbaar feit gepleegd door het gebruik van
                  het Platform. De verbannen Gebruiker wordt per e-mail op de hoogte gebracht van de schorsing of
                  beëindiging van zijn account. In dat geval is het de Gebruiker verboden zich opnieuw op het Platform
                  te registreren.
                </p>
                <p>
                  De Gebruiker kan te allen tijde om de verwijdering van zijn account verzoeken per e-mail aan{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  . De verwijdering van het account leidt tot de definitieve verwijdering van de bijbehorende gegevens
                  binnen dertig dagen, onder voorbehoud van de wettelijke bewaarplichten bedoeld in het{' '}
                  <Link href="/privacy" className={LINK}>
                    Privacybeleid
                  </Link>
                  .
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
                  Het merk BELLUM, evenals alle beeldmerken en woordmerken en, meer in het algemeen, alle andere merken,
                  illustraties, afbeeldingen, logo's, databanken, algoritmen en softwarecomponenten van de Vennootschap,
                  al dan niet gedeponeerd, zijn en blijven de exclusieve eigendom van de Vennootschap.
                </p>
                <p>
                  Elke gehele of gedeeltelijke reproductie, wijziging of gebruik van deze elementen, om welke reden en
                  op welke drager dan ook, zonder de uitdrukkelijke voorafgaande toestemming van de Vennootschap, is
                  strikt verboden en zou een inbreuk vormen in de zin van de artikelen L. 335-2 en volgende van het
                  Franse Wetboek van intellectuele eigendom (Code de la propriété intellectuelle).
                </p>
              </>
            ),
          },
          {
            id: 'mode-preuve',
            title: 'Bewijsmiddelen',
            body: (
              <p>
                In geval van een geschil met een derde of om feiten aan te tonen, aanvaardt de Gebruiker uitdrukkelijk
                dat alle gegevens die via zijn activiteit op het Platform worden verzameld (verbindingslogboeken,
                uitgevoerde acties, tijdstempels) als bewijsmiddel worden toegelaten.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Nietigheid van een beding',
            body: (
              <p>
                Indien een van de bepalingen van deze Gebruiksvoorwaarden nietig zou worden verklaard, brengt deze
                nietigheid niet de nietigheid van de overige bepalingen van de Gebruiksvoorwaarden met zich mee, die van
                kracht blijven.
              </p>
            ),
          },
          {
            id: 'contact',
            title: 'Contact',
            body: (
              <p>
                BELLUM, 90 rue des Archives, 75003 Paris, Frankrijk. Verantwoordelijke: de heer Théo Haddad. E-mail:{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                .
              </p>
            ),
          },
          {
            id: 'loi-applicable',
            title: 'Toepasselijk recht en bevoegde rechter',
            body: (
              <p>
                Deze Gebruiksvoorwaarden worden beheerst door het Franse recht. Elk geschil dat voortvloeit uit de
                totstandkoming, de uitlegging of de uitvoering van deze Gebruiksvoorwaarden valt, bij gebreke van een
                minnelijke oplossing, onder de exclusieve bevoegdheid van de rechtbanken van Parijs, niettegenstaande
                meerdere verweerders of vrijwaringsoproep.
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
        title="General terms of use"
        lastUpdated="May 25, 2026"
        sections={[
          {
            id: 'application',
            title: 'Application',
            body: (
              <>
                <p>
                  BELLUM is a software designer and publisher. It has developed the BellumAI platform, a SaaS business
                  intelligence solution that constitutes a tool to assist professionals with prospecting and account
                  conquest (hereinafter referred to as the "Platform").
                </p>
                <p>
                  These general terms of use (hereinafter the "GTU") govern the relationship between BELLUM, a SASU with
                  a share capital of 1,000.00 euros, whose registered office is located at 90, rue des Archives, 75003
                  Paris, registered with the Paris R.C.S. under number 931 750 681 (hereinafter referred to as "the
                  Company" or "BELLUM"), and any person using the Platform (hereinafter referred to as the "User").
                </p>
                <p>
                  Use of the Platform constitutes acceptance of these GTU by the User, and in particular acceptance of
                  the following conditions: being a professional acting within the framework of their commercial
                  activity, holding a User account, refraining from any fraudulent use of the Platform. The creation of
                  an account with erroneous information constitutes a breach of these GTU.
                </p>
                <p>
                  The Company reserves the right to modify the GTU at any time. Modifications will be notified to Users
                  by email or by notification within the Platform at least fifteen days before they come into force.
                  Continued use of the Platform after the new GTU come into force constitutes acceptance. The applicable
                  GTU are those in force on the date of use of the Platform.
                </p>
              </>
            ),
          },
          {
            id: 'definitions',
            title: 'Definitions',
            body: (
              <>
                <p>
                  <b className={TERM}>Platform</b>: refers to the Company's SaaS solution, accessible at
                  https://www.bellum-ai.com/, which a User accesses with their User account.
                </p>
                <p>
                  <b className={TERM}>User</b>: refers to any natural person, duly authorised by a legal entity, who
                  accesses the Services offered by the Company on the Platform.
                </p>
                <p>
                  <b className={TERM}>Services</b>: refers to the services delivered to Users by the Platform, as
                  described in the GTS.
                </p>
                <p>
                  <b className={TERM}>Analysis</b>: refers to the automated process by which the Platform generates a
                  business intelligence file on a target company, comprising a company profile, a list of professional
                  contacts, strategic recommendations and personalised messages.
                </p>
                <p>
                  <b className={TERM}>Credit</b>: refers to the unit of consumption enabling an Analysis to be launched
                  on the Platform.
                </p>
              </>
            ),
          },
          {
            id: 'inscription-compte',
            title: 'Registration and User account',
            body: (
              <>
                <p>
                  Access to the Services requires the creation of a User account. Registration is carried out by
                  completing an online form comprising the first name, surname, professional email address and the
                  creation of a password, followed by express acceptance of these GTU and of the{' '}
                  <Link href="/privacy" className={LINK}>
                    Privacy policy
                  </Link>
                  .
                </p>
                <p>
                  The User undertakes to provide accurate, complete and up-to-date information, and to update it
                  regularly. They undertake to maintain the confidentiality of their login credentials. The User account
                  is for the strictly personal use of the User, to the exclusion of any third party, whether a natural
                  or legal person.
                </p>
                <p>
                  The User is solely responsible for any use made of their account, including in the event of fraudulent
                  use. In the event of unauthorised use of their account, the User undertakes to inform the Company
                  immediately by email at{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Use of artificial intelligence',
            body: (
              <>
                <p>
                  The Platform uses artificial intelligence technologies to generate analyses, recommendations, messages
                  and action plans. In accordance with Regulation (EU) 2024/1689 of 13 June 2024 (AI Act), the User is
                  informed that the content produced by the Platform is generated or assisted by artificial
                  intelligence.
                </p>
                <p>
                  The User acknowledges and accepts that: the generated content consists of suggestions provided for
                  guidance only; the quality of the results depends on the information provided by the User and on the
                  availability of sources; the data may contain inaccuracies; it is their responsibility to verify the
                  validity of the information before undertaking any commercial action; the artificial intelligence
                  makes no autonomous decision on behalf of the User.
                </p>
              </>
            ),
          },
          {
            id: 'comportements-interdits',
            title: 'Prohibited conduct',
            body: (
              <p>
                The User undertakes not to: use the Platform for illegal purposes or purposes contrary to these GTU;
                attempt to circumvent the technical limitations of the Platform, and in particular the credit system or
                the access control mechanisms; carry out the systematic or mass extraction of data from the Platform by
                any means whatsoever; resell, assign or make available to third parties access to their account or the
                raw results of the Platform for competing purposes; undermine the security, integrity or availability of
                the Platform; use the Platform to send communications constituting spam.
              </p>
            ),
          },
          {
            id: 'usage-contacts',
            title: 'Responsible use of professional contacts',
            body: (
              <>
                <p>
                  The professional contact details provided by the Platform are intended for the exclusive use of
                  business-to-business (B2B) commercial prospecting, in compliance with the provisions of the GDPR,
                  Directive 2002/58/EC (ePrivacy Directive) and applicable French law.
                </p>
                <p>
                  The User undertakes to: comply with the rules applicable to electronic commercial prospecting; not
                  send unsolicited electronic communications in bulk; respect the right to object of the persons
                  contacted; use the data in a proportionate manner and strictly within the framework of legitimate
                  commercial prospecting; not use personal contact details (personal email addresses such as Gmail,
                  Hotmail, etc.) for commercial prospecting without the prior consent of the persons concerned.
                </p>
                <p>
                  BELLUM disclaims all liability as to the use the User makes of the contact data provided by the
                  Platform. The User is solely responsible for complying with the applicable regulations in connection
                  with their commercial activities.
                </p>
              </>
            ),
          },
          {
            id: 'disponibilite',
            title: 'Availability of the service',
            body: (
              <p>
                The Company endeavours to ensure the availability of the Platform twenty-four hours a day, seven days a
                week, without however being able to guarantee it absolutely. The service may be interrupted for
                maintenance operations, technical updates or in the event of force majeure within the meaning of Article
                1218 of the Civil Code. The Company cannot be held liable for interruptions of service, response times,
                errors or temporary unavailability of the Platform.
              </p>
            ),
          },
          {
            id: 'informations-publiees',
            title: 'Information published on the Platform',
            body: (
              <p>
                The analysis results generated by the Platform (company profiles, contact lists, action plans, messages)
                can be consulted by the User in their personal space. The use of this information is at the User's own
                risk. The Company has no obligation to publish or maintain specific information on the Platform and may
                modify or delete the content thereof at any time.
              </p>
            ),
          },
          {
            id: 'suspension-resiliation',
            title: 'Suspension and termination of the account',
            body: (
              <>
                <p>
                  The Company may immediately suspend access to a User's account in the event of a serious breach of
                  these GTU, and in particular in the event of abusive use of the Platform, an attempt to circumvent the
                  security measures, mass extraction of data, use constituting spam, fraud, theft or any other offence
                  committed through the use of the Platform. The banned User will be informed of the suspension or
                  termination of their account by email. In this case, the User is prohibited from registering again on
                  the Platform.
                </p>
                <p>
                  The User may request the deletion of their account at any time by email sent to{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  . Deletion of the account entails the permanent deletion of the associated data within thirty days,
                  subject to the legal retention obligations referred to in the{' '}
                  <Link href="/privacy" className={LINK}>
                    Privacy policy
                  </Link>
                  .
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
                  The BELLUM trademark, as well as all figurative and non-figurative trademarks and, more generally, all
                  other trademarks, illustrations, images, logos, databases, algorithms and software components of the
                  Company, whether registered or not, are and shall remain the exclusive property of the Company.
                </p>
                <p>
                  Any total or partial reproduction, modification or use of these elements, for any reason and on any
                  medium whatsoever, without the express prior consent of the Company, is strictly prohibited and would
                  constitute an infringement within the meaning of Articles L. 335-2 et seq. of the Intellectual
                  Property Code.
                </p>
              </>
            ),
          },
          {
            id: 'mode-preuve',
            title: 'Means of proof',
            body: (
              <p>
                In the event of a dispute with a third party or in order to establish facts, the User expressly agrees
                that all data collected through their activity on the Platform (connection logs, actions performed,
                timestamps) shall be admitted as a means of proof.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Nullity of a clause',
            body: (
              <p>
                If any of the provisions of these GTU were to be annulled, such nullity would not entail the nullity of
                the other provisions of the GTU, which shall remain in force.
              </p>
            ),
          },
          {
            id: 'contact',
            title: 'Contact',
            body: (
              <p>
                BELLUM, 90 rue des Archives, 75003 Paris, France. Person in charge: Mr Théo Haddad. Email:{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                .
              </p>
            ),
          },
          {
            id: 'loi-applicable',
            title: 'Governing law and jurisdiction',
            body: (
              <p>
                These GTU are governed by French law. Any dispute arising from the formation, interpretation or
                performance of these GTU shall, in the absence of amicable resolution, fall within the exclusive
                jurisdiction of the courts of Paris, notwithstanding a plurality of defendants or third-party
                proceedings.
              </p>
            ),
          },
        ]}
      />
    )
  }
  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      lastUpdated="25 mai 2026"
      sections={[
        {
          id: 'application',
          title: 'Application',
          body: (
            <>
              <p>
                La société BELLUM est un concepteur et un éditeur de logiciels. Elle a développé la plateforme BellumAI,
                solution SaaS d'intelligence commerciale qui constitue un outil d'aide à la prospection et à la conquête
                de comptes pour les professionnels (ci-après désignée la « Plateforme »).
              </p>
              <p>
                Les présentes conditions générales d'utilisation (ci-après les « CGU ») régissent les relations entre la
                société BELLUM, SASU au capital de 1 000,00 euros, dont le siège est sis 90, rue des Archives, 75003
                Paris, immatriculée au R.C.S. de Paris sous le numéro 931 750 681 (ci-après dénommée « la Société » ou «
                BELLUM »), et toute personne utilisatrice de la Plateforme (ci-après dénommée l'« Utilisateur »).
              </p>
              <p>
                L'utilisation de la Plateforme vaut acceptation des présentes CGU par l'Utilisateur, et particulièrement
                l'acceptation des conditions suivantes : être un professionnel agissant dans le cadre de son activité
                commerciale, être titulaire d'un compte Utilisateur, s'interdire tout usage frauduleux de la Plateforme.
                La création d'un compte avec des informations erronées constitue une violation des présentes CGU.
              </p>
              <p>
                La Société se réserve le droit de modifier les CGU à tout moment. Les modifications seront notifiées aux
                Utilisateurs par courrier électronique ou par notification dans la Plateforme au moins quinze jours
                avant leur entrée en vigueur. La poursuite de l'utilisation de la Plateforme après l'entrée en vigueur
                des nouvelles CGU vaut acceptation. Les CGU applicables sont celles en vigueur à la date de
                l'utilisation de la Plateforme.
              </p>
            </>
          ),
        },
        {
          id: 'definitions',
          title: 'Définitions',
          body: (
            <>
              <p>
                <b className={TERM}>Plateforme</b> : désigne la solution SaaS de la Société, accessible à l'adresse
                https://www.bellum-ai.com/, à laquelle un Utilisateur accède avec son compte Utilisateur.
              </p>
              <p>
                <b className={TERM}>Utilisateur</b> : désigne toute personne physique, dûment habilitée par une personne
                morale, qui accède aux Services proposés par la Société sur la Plateforme.
              </p>
              <p>
                <b className={TERM}>Services</b> : désigne les prestations de services délivrées aux Utilisateurs par la
                Plateforme, telles que décrites dans les CGV.
              </p>
              <p>
                <b className={TERM}>Analyse</b> : désigne le processus automatisé par lequel la Plateforme génère un
                dossier d'intelligence commerciale sur une entreprise cible, comprenant une fiche entreprise, une liste
                de contacts professionnels, des recommandations stratégiques et des messages personnalisés.
              </p>
              <p>
                <b className={TERM}>Crédit</b> : désigne l'unité de consommation permettant de lancer une Analyse sur la
                Plateforme.
              </p>
            </>
          ),
        },
        {
          id: 'inscription-compte',
          title: 'Inscription et compte Utilisateur',
          body: (
            <>
              <p>
                L'accès aux Services nécessite la création d'un compte Utilisateur. L'inscription s'effectue par le
                renseignement d'un formulaire en ligne comprenant le prénom, le nom, l'adresse de courrier électronique
                professionnelle et la création d'un mot de passe, suivi de l'acceptation expresse des présentes CGU et
                de la{' '}
                <a href="/privacy" className={LINK}>
                  Politique de confidentialité
                </a>
                .
              </p>
              <p>
                L'Utilisateur s'engage à fournir des informations exactes, complètes et à jour, et à les mettre à jour
                régulièrement. Il s'engage à maintenir la confidentialité de ses identifiants de connexion. Le compte
                Utilisateur est à usage strictement personnel de l'Utilisateur, à l'exclusion de toute tierce personne,
                physique ou morale.
              </p>
              <p>
                L'Utilisateur est seul responsable de toute utilisation faite de son compte, y compris en cas
                d'utilisation frauduleuse. En cas d'utilisation non autorisée de son compte, l'Utilisateur s'engage à en
                informer immédiatement la Société par courrier électronique à l'adresse{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: 'intelligence-artificielle',
          title: "Utilisation de l'intelligence artificielle",
          body: (
            <>
              <p>
                La Plateforme utilise des technologies d'intelligence artificielle pour générer des analyses, des
                recommandations, des messages et des plans d'action. Conformément au Règlement (UE) 2024/1689 du 13 juin
                2024 (Règlement IA), l'Utilisateur est informé que les contenus produits par la Plateforme sont générés
                ou assistés par intelligence artificielle.
              </p>
              <p>
                L'Utilisateur reconnaît et accepte que : les contenus générés sont des suggestions à titre indicatif ;
                la qualité des résultats dépend des informations fournies par l'Utilisateur et de la disponibilité des
                sources ; les données peuvent contenir des inexactitudes ; il lui appartient de vérifier la validité des
                informations avant toute démarche commerciale ; l'intelligence artificielle ne prend aucune décision
                autonome pour le compte de l'Utilisateur.
              </p>
            </>
          ),
        },
        {
          id: 'comportements-interdits',
          title: 'Comportements interdits',
          body: (
            <p>
              L'Utilisateur s'interdit de : utiliser la Plateforme à des fins illégales ou contraires aux présentes CGU
              ; tenter de contourner les limitations techniques de la Plateforme, et notamment le système de crédits ou
              les mécanismes de contrôle d'accès ; procéder à l'extraction systématique ou massive de données de la
              Plateforme par quelque moyen que ce soit ; revendre, céder ou mettre à disposition de tiers l'accès à son
              compte ou aux résultats bruts de la Plateforme à des fins concurrentes ; porter atteinte à la sécurité, à
              l'intégrité ou à la disponibilité de la Plateforme ; utiliser la Plateforme pour envoyer des
              communications constitutives de spam.
            </p>
          ),
        },
        {
          id: 'usage-contacts',
          title: 'Usage responsable des contacts professionnels',
          body: (
            <>
              <p>
                Les coordonnées de contacts professionnels fournies par la Plateforme sont destinées à un usage exclusif
                de prospection commerciale interentreprises (B2B), dans le respect des dispositions du RGPD, de la
                directive 2002/58/CE (directive ePrivacy) et de la législation française applicable.
              </p>
              <p>
                L'Utilisateur s'engage à : respecter les règles applicables en matière de prospection commerciale
                électronique ; ne pas envoyer de communications électroniques non sollicitées en masse ; respecter le
                droit d'opposition des personnes contactées ; utiliser les données de manière proportionnée et dans le
                cadre strict de la prospection commerciale légitime ; ne pas utiliser les coordonnées personnelles
                (adresses électroniques personnelles de type Gmail, Hotmail, etc.) pour de la prospection commerciale
                sans le consentement préalable des personnes concernées.
              </p>
              <p>
                La société BELLUM décline toute responsabilité quant à l'usage que fait l'Utilisateur des données de
                contacts fournies par la Plateforme. L'Utilisateur est seul responsable du respect de la réglementation
                applicable dans le cadre de ses démarches commerciales.
              </p>
            </>
          ),
        },
        {
          id: 'disponibilite',
          title: 'Disponibilité du service',
          body: (
            <p>
              La Société s'efforce d'assurer la disponibilité de la Plateforme vingt-quatre heures sur vingt-quatre,
              sept jours sur sept, sans toutefois pouvoir la garantir de manière absolue. Le service pourra être
              interrompu pour des opérations de maintenance, des mises à jour techniques ou en cas de force majeure au
              sens de l'article 1218 du Code civil. La Société ne saurait être tenue responsable des interruptions de
              service, des temps de réponse, des erreurs ou des indisponibilités temporaires de la Plateforme.
            </p>
          ),
        },
        {
          id: 'informations-publiees',
          title: 'Informations publiées sur la Plateforme',
          body: (
            <p>
              Les résultats d'analyses générés par la Plateforme (fiches entreprises, listes de contacts, plans
              d'action, messages) sont consultables par l'Utilisateur dans son espace personnel. L'utilisation de ces
              informations se fait aux propres risques de l'Utilisateur. La Société n'a aucune obligation de publier ou
              de maintenir des informations spécifiques sur la Plateforme et peut en modifier ou supprimer le contenu à
              tout moment.
            </p>
          ),
        },
        {
          id: 'suspension-resiliation',
          title: 'Suspension et résiliation du compte',
          body: (
            <>
              <p>
                La Société peut suspendre immédiatement l'accès au compte d'un Utilisateur en cas de manquement grave
                aux présentes CGU, et notamment en cas d'utilisation abusive de la Plateforme, de tentative de
                contournement des mesures de sécurité, d'extraction massive de données, d'usage constitutif de spam, de
                fraude, de vol ou de tout autre délit commis par l'utilisation de la Plateforme. L'Utilisateur banni
                sera informé de la suspension ou de la résiliation de son compte par courrier électronique. Dans cette
                hypothèse, l'Utilisateur est frappé d'un interdit de s'inscrire à nouveau sur la Plateforme.
              </p>
              <p>
                L'Utilisateur peut demander la suppression de son compte à tout moment par courrier électronique adressé
                à{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                . La suppression du compte entraîne la suppression définitive des données associées dans un délai de
                trente jours, sous réserve des obligations légales de conservation visées dans la{' '}
                <a href="/privacy" className={LINK}>
                  Politique de confidentialité
                </a>
                .
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
                La marque BELLUM, ainsi que l'ensemble des marques figuratives ou non et, plus généralement, toutes les
                autres marques, illustrations, images, logotypes, bases de données, algorithmes et composants logiciels
                de la Société, qu'ils soient déposés ou non, sont et demeureront la propriété exclusive de la Société.
              </p>
              <p>
                Toute reproduction totale ou partielle, modification ou utilisation de ces éléments, pour quelque motif
                et sur quelque support que ce soit, sans l'accord exprès et préalable de la Société, est strictement
                interdite et constituerait une contrefaçon au sens des articles L. 335-2 et suivants du Code de la
                propriété intellectuelle.
              </p>
            </>
          ),
        },
        {
          id: 'mode-preuve',
          title: 'Mode de preuve',
          body: (
            <p>
              En cas de contentieux avec un tiers ou pour justifier des faits, l'Utilisateur accepte expressément que
              l'ensemble des données collectées à travers son activité sur la Plateforme (journaux de connexion, actions
              réalisées, horodatages) soient admis comme mode de preuve.
            </p>
          ),
        },
        {
          id: 'nullite-clause',
          title: "Nullité d'une clause",
          body: (
            <p>
              Si l'une quelconque des dispositions des présentes CGU était annulée, cette nullité n'entraînerait pas la
              nullité des autres dispositions des CGU qui demeureront en vigueur.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              BELLUM, 90 rue des Archives, 75003 Paris, France. Responsable : Monsieur Théo Haddad. Courrier
              électronique :{' '}
              <a href="mailto:contact@bellum-it.com" className={LINK}>
                contact@bellum-it.com
              </a>
              .
            </p>
          ),
        },
        {
          id: 'loi-applicable',
          title: 'Loi applicable et juridiction compétente',
          body: (
            <p>
              Les présentes CGU sont régies par la loi française. Tout litige résultant de la formation, de
              l'interprétation ou de l'exécution des présentes CGU sera, à défaut de résolution amiable, de la
              compétence exclusive des tribunaux du ressort de Paris, nonobstant pluralité de défendeurs ou appel en
              garantie.
            </p>
          ),
        },
      ]}
    />
  )
}
