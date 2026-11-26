#!/usr/bin/env node
// Contrat des vues premium : carte trouvable, périmètre cohérent, un seul rail.
// La recette navigateur reste nécessaire pour les pixels, le clavier et le mouvement.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const expectedTheme=process.env.BELLUM_EXPECT_THEME;
const index=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const defaultTheme=index.match(/<meta name="bellum-default-theme" content="([^"]+)"/)?.[1]||'light';
const storage=new Map([['bellum-white-commercial-v1',JSON.stringify({mode:'scenario',role:'direction',teamTab:'vue',mapCity:'Paris',mapBu:'all'})]]);
const listeners={};
const element=()=>({innerHTML:'',scrollTop:0,dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},append(){},after(){},remove(){},querySelector(){return null},querySelectorAll(){return []},scrollIntoView(){},focus(){}});
const dom=Object.fromEntries(['#app','#overlay-root','#toast-root','#laura-root','#page-scroll'].map(key=>[key,element()]));
globalThis.document={querySelector:key=>key==='meta[name="bellum-default-theme"]'?{content:defaultTheme}:dom[key]||null,getElementById:id=>dom[`#${id}`]||null,createElement:element,documentElement:{dataset:{}},body:{classList:{toggle(){}}},addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.window={addEventListener:(key,fn)=>{listeners[key]=fn}};
globalThis.location={hash:'#today',search:''};
globalThis.history={replaceState(_state,_title,hash){location.hash=hash}};
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.requestAnimationFrame=fn=>fn();
const html=()=>dom['#app'].innerHTML;
const state=()=>JSON.parse(storage.get('bellum-white-commercial-v1'));
const click=(dataset)=>{const node={dataset,classList:{contains:()=>false}};listeners.click({target:{closest:()=>node},preventDefault(){}});listeners.hashchange?.()};
const contains=(pattern,message)=>assert.ok(pattern.test(html()),message);
const lacks=(pattern,message)=>assert.ok(!pattern.test(html()),message);

await import('../dist/performance.js?premium=audit');
if(expectedTheme)assert.equal(document.documentElement.dataset.theme,expectedTheme,`Le thème ${expectedTheme} doit être appliqué à la racine`);
contains(/Bonjour Pierre/,'Ma journée s’adresse à Pierre');
contains(/Groupe Sillage/,'Le contexte entreprise est présent');
contains(/Données d’exemple arrêtées/,'Les chiffres de démonstration sont identifiés');
contains(/data-action="go-map"/,'La direction trouve la carte depuis Ma journée');
assert.equal((html().match(/<aside class="sidebar\b/g)||[]).length,1,'Un seul rail latéral');
assert.equal((html().match(/<nav class="nav-list\b/g)||[]).length,1,'Une seule navigation principale');

click({action:'go-map'});
assert.equal(location.hash,'#team?tab=administration');
contains(/class="france-canvas"/,'La carte est visible sans chercher un sixième sous-onglet');
contains(/data-action="map-city" data-value="Lyon"/,'Lyon peut être choisi sur la carte');
click({action:'map-city',value:'Lyon'});
assert.equal(state().mapCity,'Lyon');
assert.equal(state().mapBu,'all','Changer de ville efface la BU précédente');
assert.match(location.hash,/^#team\?tab=administration&city=Lyon/);
contains(/data-action="map-bu" data-value="ind"/,'La BU lyonnaise est disponible');
click({action:'map-bu',value:'ind'});
assert.equal(state().mapBu,'ind');
assert.match(location.hash,/bu=ind/);
contains(/Atelieria/,'La BU ouvre ses comptes et affaires');
click({action:'city-focus',value:'deals'});
assert.equal(state().adminView,'affaires');
contains(/Affaires à faire avancer/,'Le détail ouvre les affaires');
assert.doesNotMatch(html().match(/<div class="admin-detail"[^>]*>[\s\S]*?<\/div>/)?.[0]||'',/Altiver/,'Le détail de Lyon ne mélange pas les affaires de Paris');

// La vue Équipe standard doit aussi annoncer le territoire dès l'entrée.
location.hash='#team';
click({route:'team'});
contains(/france-canvas|tw-map-shape/,'L’entrée Équipe affiche la géographie, sans exiger un autre onglet');

// Le manager et le Business Manager n'obtiennent pas l'administration nationale
// en rejouant un lien Direction enregistré dans le navigateur.
for(const role of ['manager','sales']){
  storage.set('bellum-white-commercial-v1',JSON.stringify({...state(),role,teamTab:'vue',mapCity:'Paris',mapBu:'all'}));
  location.hash='#team?tab=administration';
  await import(`../dist/performance.js?premium=${role}`);
  assert.notEqual(location.hash,'#team?tab=administration',`${role} ne voit pas le panneau Direction`);
  lacks(/data-action="admin-view"/,'Aucun panneau de décision Direction hors rôle');
  if(role==='manager'){
    click({action:'go-map'});
    assert.equal(state().role,'manager','Un accès territorial ne change jamais la fonction du manager');
    lacks(/data-action="admin-view"/,'Le manager ne reçoit pas les décisions Direction après ce raccourci');
  }
}

const css=await readFile(new URL('../dist/performance.css',import.meta.url),'utf8');
assert.match(css,/@media \(prefers-reduced-motion:\s*reduce\)/,'Le mouvement réduit conserve une règle dédiée');
assert.match(css,/\.france-canvas::before[\s\S]*?france-territories\.svg/,'La carte utilise une géographie explicite');
const theme=expectedTheme||'light';
const themeFile=theme==='dark'?'premium-dark.css':'premium-white.css';
const themeCss=await readFile(new URL(`../dist/${themeFile}`,import.meta.url),'utf8');
assert.ok(index.includes(`data-theme="${theme}"`),`Le premier affichage annonce le thème ${theme}`);
assert.ok(index.indexOf(`href="${themeFile}"`)>index.indexOf('href="performance.css"'),`La couche ${themeFile} est chargée après les styles de base`);
if(theme==='dark'&&index.includes('href="premium-white.css"'))assert.ok(index.indexOf('href="premium-dark.css"')>index.indexOf('href="premium-white.css"'),'La couche sombre vient après la couche blanche');
assert.match(themeCss,new RegExp(`html\\[data-theme="${theme}"\\]`),`Les styles ${theme} sont isolés par thème`);
assert.match(themeCss,/@media \(prefers-reduced-motion: reduce\)/,'Le thème respecte la réduction du mouvement');
assert.match(themeCss,/@media \(prefers-reduced-transparency: reduce\), \(forced-colors: active\)/,'Le thème fournit un fond opaque en accessibilité');
location.search='?theme=dark';listeners.hashchange();
assert.equal(document.documentElement.dataset.theme,'dark','Le lien sombre active uniquement le thème sombre');
location.search='?theme=white';listeners.hashchange();
assert.equal(document.documentElement.dataset.theme,'light','Le lien blanc restaure le thème blanc');
location.search='';listeners.hashchange();
assert.equal(document.documentElement.dataset.theme,defaultTheme,'Le lien sans paramètre suit le thème publié');
console.log(`Parcours premium ${expectedTheme||'Site'} : carte immédiate, ville → BU → affaires, rôles, navigation unique et mouvement réduit OK`);
