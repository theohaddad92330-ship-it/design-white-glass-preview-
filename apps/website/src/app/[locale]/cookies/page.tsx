import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: 'Politique cookies',
    description:
      'Politique relative aux cookies et aux traceurs de BellumAI : définition, types de cookies, gestion du consentement.',
  },
  en: {
    title: 'Cookie policy',
    description: "BellumAI's cookie and tracker policy: definition, types of cookies, consent management.",
  },
  de: {
    title: 'Cookie-Richtlinie',
    description: 'Cookie- und Tracker-Richtlinie von BellumAI: Definition, Cookie-Arten, Verwaltung der Einwilligung.',
  },
  nl: {
    title: 'Cookiebeleid',
    description: 'Cookie- en trackerbeleid van BellumAI: definitie, soorten cookies, beheer van de toestemming.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/cookies'),
  }
}

export default async function CookiesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Cookie- und Tracker-Richtlinie"
        lastUpdated="28. August 2026"
        sections={[
          {
            id: 'definition',
            title: 'Was ist ein Cookie',
            body: (
              <p>
                Ein Cookie ist eine kleine, durch einen Namen gekennzeichnete Textdatei, die beim Besuch einer Website
                in Ihrem Browser oder auf Ihrem Endgerät (Computer, Tablet, Telefon) abgelegt und gespeichert wird. Sie
                wird bei jedem Besuch der Website gesetzt und beim erneuten Aufruf wieder ausgelesen, wodurch Ihr
                Browser oder Ihr Endgerät wiedererkannt werden kann.
              </p>
            ),
          },
          {
            id: 'types',
            title: 'Verwendete Cookie-Arten',
            body: (
              <>
                <p>
                  Für den Betrieb der Website zwingend erforderliche Cookies unterliegen nicht Ihrer Einwilligung. Dazu
                  gehören Authentifizierungs- und Sitzungscookies sowie das Cookie, das Ihre Cookie-Einstellungen
                  speichert. Diese Cookies sind für das ordnungsgemäße Funktionieren der Plattform unerlässlich.
                </p>
                <p>
                  Funktionale Cookies ermöglichen es, Ihre Anzeige- und Navigationseinstellungen zu speichern. Sie
                  unterliegen Ihrer vorherigen Einwilligung.
                </p>
                <p>
                  Analyse-Cookies ermöglichen eine anonymisierte Auswertung des Traffics und der Leistung der Website.
                  Sie unterliegen Ihrer vorherigen Einwilligung.
                </p>
                <p>
                  BELLUM verwendet keinerlei Werbe-Cookies, keine Tracker sozialer Netzwerke (Meta Pixel, LinkedIn
                  Insight Tag usw.) und keine Tracking-Pixel von Drittplattformen zu Zwecken der
                  Werbe-Zielgruppenbildung.
                </p>
              </>
            ),
          },
          {
            id: 'traceurs',
            title: 'Eingesetzte Analysewerkzeuge',
            body: (
              <>
                <p>
                  Auf der Website können drei Messwerkzeuge geladen werden — und zwar ausschließlich nach Ihrer
                  Einwilligung: zwei messen die Reichweite, das dritte die Ladeperformance der Seiten.
                </p>
                <p>
                  <strong>Plausible Analytics</strong>, betrieben von einem unabhängigen Unternehmen mit Sitz in Estland
                  (Europäische Union). Es erfasst die aufgerufene Seite, die Herkunftsseite Ihres Besuchs, Ihren
                  Browser, Ihr Betriebssystem, Ihren Gerätetyp und Ihren ungefähren Standort (Land, Region, Stadt). Nach
                  Angaben des Anbieters setzt es keine Cookies und erzeugt keine dauerhaften Kennungen: Besuche werden
                  über einen Hashwert unterschieden, der aus einem alle vierundzwanzig Stunden erneuerten und gelöschten
                  Zufallswert berechnet wird; die IP-Adresse wird nicht gespeichert. Die Daten werden in der
                  Europäischen Union verarbeitet und gespeichert.
                </p>
                <p>
                  <strong>Vercel Web Analytics</strong>, betrieben von Vercel, dem Hoster der Website. Es erfasst den
                  Zeitstempel des Besuchs, die Adresse der aufgerufenen Seite, die Herkunftsseite, gefilterte
                  URL-Parameter, Ihren ungefähren Standort (Land, Region, Stadt), Ihr Betriebssystem und dessen Version,
                  Ihren Browser und dessen Version sowie Ihren Gerätetyp. Nach der Dokumentation des Anbieters verwendet
                  es keine Cookies von Drittanbietern und unterscheidet Besucher über einen aus der eingehenden Anfrage
                  berechneten Hashwert; die Lebensdauer einer Besuchssitzung wird nicht länger als vierundzwanzig
                  Stunden aufbewahrt.
                </p>
                <p>
                  <strong>Vercel Speed Insights</strong>, betrieben von Vercel, dem Hoster der Website. Es misst nicht
                  Ihr Verhalten, sondern die Ladeperformance der Seiten: die als Core Web Vitals bezeichneten
                  Kennzahlen, darunter die Zeit bis zur ersten Inhaltsdarstellung und die Zeit bis zur größten
                  Inhaltsdarstellung. Mit jeder Messung werden die Route und die Adresse der aufgerufenen Seite, der Typ
                  der Netzwerkverbindung (etwa 4g), Ihr Browser und dessen Version, Ihr Betriebssystem und dessen
                  Version, Ihr Gerätetyp, Ihr Land, das Seitenelement, auf das sich die Messung bezieht, die Version der
                  Messkomponente und der Empfangszeitstempel gespeichert. Nach der Dokumentation des Anbieters erfolgt
                  die Erfassung anonym: Das Werkzeug erhebt und speichert keine Informationen, die es erlauben würden,
                  eine Navigation über mehrere Seiten hinweg nachzuvollziehen oder einen Nutzer zu identifizieren, und
                  die Messungen sind weder einem einzelnen Besucher noch einer IP-Adresse zugeordnet.
                </p>
                <p>
                  Rechtsgrundlage aller drei Verarbeitungen ist Ihre Einwilligung. Solange Sie auf das Banner nicht
                  geantwortet haben, wird keines der drei geladen: es wird kein Skript ausgeführt und keine Anfrage
                  gesendet. Widerrufen Sie Ihre Einwilligung, werden sie nicht mehr geladen; ein während des laufenden
                  Besuchs bereits ausgeführtes Skript endet mit dem nächsten Seitenaufruf.
                </p>
                <p>
                  Diese Angaben stammen aus der von den Anbietern dieser Werkzeuge veröffentlichten Dokumentation,
                  abgerufen am 28. August 2026.
                </p>
              </>
            ),
          },
          {
            id: 'consentement',
            title: 'Verwaltung der Einwilligung',
            body: (
              <p>
                Bei Ihrem ersten Besuch der Website informiert Sie ein Banner über die Verwendung von Cookies und
                ermöglicht es Ihnen, diese zu akzeptieren, abzulehnen oder Ihre Einstellungen anzupassen. Es steht Ihnen
                frei, deren Verwendung zu akzeptieren oder abzulehnen. Ihre Auswahl wird sechs Monate lang gespeichert;
                Sie können Ihre Einstellungen jederzeit über den Link „Cookies verwalten“ im Footer der Website ändern.
              </p>
            ),
          },
          {
            id: 'desactivation',
            title: 'Deaktivierung von Cookies im Browser',
            body: (
              <p>
                Sie können Ihren Browser auch so konfigurieren, dass er Cookies systematisch ablehnt oder Sie warnt,
                sobald ein Cookie gesetzt wird. Jeder Browser wird anders konfiguriert; die Vorgehensweise ist im
                Hilfemenü Ihres Browsers beschrieben. Beachten Sie jedoch, dass die Deaktivierung zwingend
                erforderlicher Cookies das ordnungsgemäße Funktionieren bestimmter Funktionen der Plattform verhindern
                kann.
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
        title="Cookie- en trackerbeleid"
        lastUpdated="28 augustus 2026"
        sections={[
          {
            id: 'definition',
            title: 'Wat is een cookie',
            body: (
              <p>
                Een cookie is een klein tekstbestand, geïdentificeerd door een naam, dat bij het bezoeken van een
                website in uw browser of op uw apparaat (computer, tablet, telefoon) wordt geplaatst en opgeslagen. Het
                wordt bij elk bezoek aan de site geplaatst en opnieuw uitgelezen wanneer u naar de site terugkeert,
                waardoor uw browser of apparaat kan worden herkend.
              </p>
            ),
          },
          {
            id: 'types',
            title: 'Soorten gebruikte cookies',
            body: (
              <>
                <p>
                  Cookies die strikt noodzakelijk zijn voor de werking van de Site zijn niet onderworpen aan uw
                  toestemming. Het gaat onder meer om authenticatie- en sessiecookies, evenals de cookie die uw
                  cookievoorkeuren opslaat. Deze cookies zijn onmisbaar voor de goede werking van het platform.
                </p>
                <p>
                  Functionele cookies maken het mogelijk om uw weergave- en navigatievoorkeuren te onthouden. Zij zijn
                  onderworpen aan uw voorafgaande toestemming.
                </p>
                <p>
                  Analytische cookies maken een geanonimiseerde analyse van het verkeer en de prestaties van de Site
                  mogelijk. Zij zijn onderworpen aan uw voorafgaande toestemming.
                </p>
                <p>
                  BELLUM gebruikt geen enkele advertentiecookie, geen trackers van sociale netwerken (Meta Pixel,
                  LinkedIn Insight Tag, enz.) en geen trackingpixels van derde platformen voor advertentiedoeleinden.
                </p>
              </>
            ),
          },
          {
            id: 'traceurs',
            title: 'Gebruikte analysetools',
            body: (
              <>
                <p>
                  Op de Site kunnen drie meettools worden geladen, en uitsluitend nadat u daarvoor toestemming hebt
                  gegeven: twee meten het publiek, de derde de laadprestaties van de pagina&apos;s.
                </p>
                <p>
                  <strong>Plausible Analytics</strong>, uitgegeven door een onafhankelijke onderneming gevestigd in
                  Estland (Europese Unie). Het meet de geraadpleegde pagina, de pagina waarvan uw bezoek afkomstig is,
                  uw browser, uw besturingssysteem, uw apparaattype en uw geschatte locatie (land, regio, stad). Volgens
                  de uitgever plaatst het geen enkele cookie en maakt het geen blijvende identificatoren aan: bezoeken
                  worden onderscheiden via een hashwaarde die wordt berekend op basis van een waarde die elke
                  vierentwintig uur wordt vernieuwd en gewist; het IP-adres wordt niet bewaard. De gegevens worden in de
                  Europese Unie verwerkt en bewaard.
                </p>
                <p>
                  <strong>Vercel Web Analytics</strong>, uitgegeven door Vercel, de hostingpartij van de Site. Het meet
                  het tijdstip van het bezoek, het adres van de geraadpleegde pagina, de herkomstpagina, gefilterde
                  URL-parameters, uw geschatte locatie (land, regio, stad), uw besturingssysteem en de versie ervan, uw
                  browser en de versie ervan, en uw apparaattype. Volgens de documentatie van de uitgever gebruikt het
                  geen cookies van derden en onderscheidt het bezoekers via een hashwaarde die uit het ontvangen verzoek
                  wordt berekend; de levensduur van een bezoeksessie wordt niet langer dan vierentwintig uur bewaard.
                </p>
                <p>
                  <strong>Vercel Speed Insights</strong>, uitgegeven door Vercel, de hostingpartij van de Site. Het meet
                  niet uw gedrag maar de laadprestaties van de pagina&apos;s: de indicatoren die bekendstaan als Core
                  Web Vitals, waaronder de tijd tot de eerste inhoudsweergave en die tot de grootste inhoudsweergave.
                  Bij elke meting worden de route en het adres van de geraadpleegde pagina, het type netwerkverbinding
                  (bijvoorbeeld 4g), uw browser en de versie ervan, uw besturingssysteem en de versie ervan, uw
                  apparaattype, uw land, het pagina-element waarop de meting betrekking heeft, de versie van de
                  meetcomponent en het tijdstip van ontvangst opgeslagen. Volgens de documentatie van de uitgever is de
                  registratie anoniem: de tool verzamelt en bewaart geen informatie waarmee een navigatie van pagina
                  naar pagina kan worden gereconstrueerd of een gebruiker kan worden geïdentificeerd, en de metingen
                  zijn niet gekoppeld aan een individuele bezoeker of aan een IP-adres.
                </p>
                <p>
                  De rechtsgrond voor alle drie de verwerkingen is uw toestemming. Zolang u niet op de banner hebt
                  geantwoord, wordt geen van de drie geladen: er wordt geen script uitgevoerd en geen enkel verzoek
                  verstuurd. Trekt u uw toestemming in, dan worden ze niet meer geladen; een script dat tijdens het
                  lopende bezoek al is uitgevoerd, stopt bij het volgende laden van een pagina.
                </p>
                <p>
                  Deze informatie is afkomstig uit de door de uitgevers van deze tools gepubliceerde documentatie,
                  geraadpleegd op 28 augustus 2026.
                </p>
              </>
            ),
          },
          {
            id: 'consentement',
            title: 'Beheer van de toestemming',
            body: (
              <p>
                Bij uw eerste bezoek aan de Site informeert een banner u over het gebruik van cookies en kunt u deze
                accepteren, weigeren of uw voorkeuren instellen. Het staat u vrij het gebruik ervan te aanvaarden of te
                weigeren. Uw keuzes worden zes maanden bewaard; u kunt uw voorkeuren op elk moment wijzigen door te
                klikken op de link 'Cookies instellen' in de footer van de Site.
              </p>
            ),
          },
          {
            id: 'desactivation',
            title: 'Cookies uitschakelen via de browser',
            body: (
              <p>
                U kunt uw browser ook zo instellen dat hij cookies systematisch weigert of u waarschuwt wanneer een
                cookie wordt geplaatst. Elke browser wordt anders geconfigureerd; de werkwijze staat beschreven in het
                helpmenu van uw browser. Houd er echter rekening mee dat het uitschakelen van strikt noodzakelijke
                cookies de goede werking van bepaalde functies van het platform kan verhinderen.
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
        title="Cookie and tracker policy"
        lastUpdated="August 28, 2026"
        sections={[
          {
            id: 'definition',
            title: 'What is a cookie',
            body: (
              <p>
                A cookie is a small text file, identified by a name, placed and stored on your browser or device
                (computer, tablet, phone) when you visit a website. It is placed each time you visit the site and
                retrieved when you return to it, making it possible to recognize your browser or device.
              </p>
            ),
          },
          {
            id: 'types',
            title: 'Types of cookies used',
            body: (
              <>
                <p>
                  Cookies that are strictly necessary for the operation of the Site are not subject to your consent.
                  They include authentication and user-session cookies, as well as the cookie that stores your cookie
                  preferences. These cookies are essential for the platform to work properly.
                </p>
                <p>
                  Functional cookies allow your display and browsing preferences to be remembered. They are subject to
                  your prior consent.
                </p>
                <p>
                  Analytics cookies allow anonymized analysis of the Site&apos;s traffic and performance. They are
                  subject to your prior consent.
                </p>
                <p>
                  BELLUM does not use any advertising cookies, any social-network trackers (Meta Pixel, LinkedIn Insight
                  Tag, etc.) or any tracking pixels from third-party platforms for advertising-targeting purposes.
                </p>
              </>
            ),
          },
          {
            id: 'traceurs',
            title: 'The analytics trackers used',
            body: (
              <>
                <p>
                  Three measurement tools may be loaded on the Site, and only once you have agreed to it: two measure
                  audience, the third measures how fast the pages load.
                </p>
                <p>
                  <strong>Plausible Analytics</strong>, published by an independent company incorporated in Estonia
                  (European Union). It measures the page viewed, the page your visit came from, your browser, your
                  operating system, your device type and your approximate location (country, region, city). Its
                  publisher states that it sets no cookie and creates no persistent identifier: visits are told apart
                  through a hash computed from a salt that is rotated and deleted every twenty-four hours, and the IP
                  address is not stored. The data is processed and stored in the European Union.
                </p>
                <p>
                  <strong>Vercel Web Analytics</strong>, published by Vercel, the Site&apos;s host. It measures the
                  timestamp of the visit, the address of the page viewed, the referring page, filtered URL parameters,
                  your approximate location (country, region, city), your operating system and its version, your browser
                  and its version, and your device type. According to its publisher&apos;s documentation it uses no
                  third-party cookie and tells visitors apart through a hash computed from the incoming request; the
                  lifespan of a visitor session is not kept beyond twenty-four hours.
                </p>
                <p>
                  <strong>Vercel Speed Insights</strong>, published by Vercel, the Site&apos;s host. It does not measure
                  your behaviour but how fast the pages load: the indicators known as Core Web Vitals, among them the
                  time to first contentful paint and the time to largest contentful paint. Each measurement is recorded
                  with the route and the address of the page viewed, the network connection type (4g, for instance),
                  your browser and its version, your operating system and its version, your device type, your country,
                  the page element the measurement relates to, the version of the measurement component and the time the
                  event was received. According to its publisher&apos;s documentation the recording is anonymous: the
                  tool neither collects nor stores information that would make it possible to reconstruct browsing from
                  one page to the next or to identify a user, and the measurements are tied to no individual visitor and
                  to no IP address.
                </p>
                <p>
                  The legal basis for all three is your consent. As long as you have not answered the banner, none of
                  them is loaded: no script runs and no request is sent. If you withdraw your consent they stop being
                  loaded; a script already running during the current visit stops at the next page load.
                </p>
                <p>
                  This information comes from the documentation published by the vendors of these tools, consulted on 28
                  August 2026.
                </p>
              </>
            ),
          },
          {
            id: 'consentement',
            title: 'Consent management',
            body: (
              <p>
                On your first visit to the Site, a banner informs you that cookies are used and lets you accept, refuse
                or configure your preferences. You are free to accept or refuse their use. Your choices are kept for six
                months, and you can change your preferences at any time by clicking the &ldquo;Cookie settings&rdquo;
                link available in the Site&apos;s footer.
              </p>
            ),
          },
          {
            id: 'desactivation',
            title: 'Disabling cookies in your browser',
            body: (
              <p>
                You can also configure your browser to systematically refuse cookies or to alert you whenever a cookie
                is placed. Each browser is configured differently, as described in your browser&apos;s help menu. Note,
                however, that disabling strictly necessary cookies may prevent some features of the platform from
                working properly.
              </p>
            ),
          },
        ]}
      />
    )
  }
  return (
    <LegalPage
      title="Politique relative aux cookies et aux traceurs"
      lastUpdated="28 août 2026"
      sections={[
        {
          id: 'definition',
          title: 'Définition des cookies',
          body: (
            <p>
              Un cookie est un petit fichier texte, identifié par un nom, déposé et stocké sur votre navigateur ou votre
              terminal (ordinateur, tablette, téléphone) lors de la consultation d'un site internet. Il y est déposé à
              chaque consultation du site et y est récupéré lorsque vous revenez sur le site en question, permettant
              ainsi de reconnaître votre navigateur ou terminal.
            </p>
          ),
        },
        {
          id: 'types',
          title: 'Types de cookies utilisés',
          body: (
            <>
              <p>
                Les cookies strictement nécessaires au fonctionnement du Site ne sont pas soumis à votre consentement.
                Ils comprennent les cookies d'authentification et de maintien de la session utilisateur, ainsi que le
                cookie de mémorisation de vos choix en matière de cookies. Ces cookies sont indispensables au bon
                fonctionnement de la plateforme.
              </p>
              <p>
                Les cookies fonctionnels permettent la mémorisation de vos préférences d'affichage et de navigation. Ils
                sont soumis à votre consentement préalable.
              </p>
              <p>
                Les cookies analytiques permettent l'analyse anonymisée du trafic et des performances du Site. Ils sont
                soumis à votre consentement préalable.
              </p>
              <p>
                La société BELLUM n'utilise aucun cookie publicitaire, aucun traceur de réseau social (Meta Pixel,
                LinkedIn Insight Tag, etc.) et aucun pixel de suivi provenant de plateformes tierces à des fins de
                ciblage publicitaire.
              </p>
            </>
          ),
        },
        {
          id: 'traceurs',
          title: "Les traceurs de mesure d'audience utilisés",
          body: (
            <>
              <p>
                Trois outils de mesure peuvent être chargés sur le Site, et uniquement après votre accord : deux
                mesurent l'audience, le troisième les performances de chargement des pages.
              </p>
              <p>
                <strong>Plausible Analytics</strong>, édité par une société indépendante établie en Estonie (Union
                européenne). Il mesure la page consultée, la page d'origine de votre visite, votre navigateur, votre
                système d'exploitation, votre type d'appareil et votre localisation approximative (pays, région, ville).
                Son éditeur indique qu'il ne dépose aucun cookie et ne crée aucun identifiant persistant : il distingue
                les visites au moyen d'une empreinte calculée à partir d'une valeur aléatoire renouvelée et supprimée
                toutes les vingt-quatre heures, et l'adresse IP n'est pas conservée. Les données sont traitées et
                conservées dans l'Union européenne.
              </p>
              <p>
                <strong>Vercel Web Analytics</strong>, édité par Vercel, l'hébergeur du Site. Il mesure l'horodatage de
                la visite, l'adresse de la page consultée, la page d'origine, les paramètres d'URL filtrés, votre
                localisation approximative (pays, région, ville), votre système d'exploitation et sa version, votre
                navigateur et sa version, ainsi que votre type d'appareil. D'après la documentation de son éditeur, il
                n'utilise aucun cookie tiers et distingue les visiteurs au moyen d'une empreinte calculée à partir de la
                requête reçue ; la durée de vie d'une session de visite n'est pas conservée au-delà de vingt-quatre
                heures.
              </p>
              <p>
                <strong>Vercel Speed Insights</strong>, édité par Vercel, l'hébergeur du Site. Il ne mesure pas votre
                comportement mais les performances de chargement des pages : les indicateurs dits « Core Web Vitals »,
                parmi lesquels le délai d'affichage du premier contenu et celui du plus grand contenu. Chaque mesure est
                enregistrée avec la route et l'adresse de la page consultée, le type de connexion réseau (par exemple
                4g), votre navigateur et sa version, votre système d'exploitation et sa version, votre type d'appareil,
                votre pays, l'élément de page auquel la mesure se rattache, la version du composant de mesure et
                l'horodatage de réception. D'après la documentation de son éditeur, l'enregistrement est anonyme :
                l'outil ne collecte ni ne conserve d'information permettant de reconstituer une navigation d'une page à
                l'autre ou d'identifier un utilisateur, et les mesures ne sont rattachées ni à un visiteur en
                particulier ni à une adresse IP.
              </p>
              <p>
                La base légale de ces trois traitements est votre consentement. Tant que vous n'avez pas répondu à la
                bannière, aucun des trois n'est chargé : aucun script n'est exécuté et aucune requête n'est émise. Si
                vous retirez votre consentement, ils cessent d'être chargés ; un script déjà exécuté pendant la visite
                en cours s'arrête au chargement de page suivant.
              </p>
              <p>
                Ces informations proviennent de la documentation publiée par les éditeurs de ces outils, consultée le 28
                août 2026.
              </p>
            </>
          ),
        },
        {
          id: 'consentement',
          title: 'Gestion du consentement',
          body: (
            <p>
              Lors de votre première visite sur le Site, une bannière vous informe de l'utilisation de cookies et vous
              permet d'accepter, de refuser ou de paramétrer vos préférences. Vous pouvez choisir librement d'en
              accepter ou d'en refuser l'utilisation. Vos choix sont conservés pendant une durée de six mois, étant
              précisé que vous pouvez modifier vos préférences à tout moment en cliquant sur le lien « Paramétrer les
              cookies » accessible depuis le pied de page du Site.
            </p>
          ),
        },
        {
          id: 'desactivation',
          title: 'Désactivation des cookies via le navigateur',
          body: (
            <p>
              Vous pouvez également configurer votre navigateur pour qu'il refuse systématiquement les cookies ou pour
              qu'il vous alerte lorsqu'un cookie est déposé. La configuration de chaque navigateur est différente. Elle
              est décrite dans le menu d'aide de votre navigateur. Toutefois, la désactivation des cookies strictement
              nécessaires pourrait empêcher le fonctionnement correct de certaines fonctionnalités de la plateforme.
            </p>
          ),
        },
      ]}
    />
  )
}
