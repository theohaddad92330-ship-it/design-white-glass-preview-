// Local, opt-in commercial cost model. It never reads payroll or invoices.
const MAX_EUR = 1_000_000_000;
const number = (value, min = 0, max = MAX_EUR) => {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw || !/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const optionalNumber = (value, fallback = 0, min = 0, max = MAX_EUR) => String(value ?? '').trim() === '' ? fallback : number(value, min, max);
const text = value => String(value ?? '');
const esc = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(value);
const monthLabel = month => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text(month))) return text(month);
  return new Intl.DateTimeFormat('fr-FR', {month:'long', year:'numeric'}).format(new Date(`${month}-15T12:00:00Z`));
};
const uid = () => globalThis.crypto?.randomUUID?.() || `fin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const field = (label, control, hint = '', attrs = '') => `<label class="finance-field" ${attrs}><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
const input = (name, value, options = '') => `<input name="${name}" type="number" inputmode="decimal" min="0" step="0.01" value="${value ?? ''}" ${options}>`;
const display = value => value === null || value === undefined ? '' : esc(value);

export function normalizeFinanceRecords(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.workspaceKey === 'string' && typeof item.personId === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(item.month || '')).slice(-240);
}

/** Only a direction user can write. Each month/person belongs to one workspace. */
export function saveFinanceRecord(value, form, {workspaceKey, people = [], role, selectedId = null} = {}) {
  if (role !== 'direction') return {error:'Seule la direction peut renseigner les coûts commerciaux.'};
  if (!workspaceKey || !people.length) return {error:'Ajoutez un commercial dans votre organisation avant de renseigner ses coûts.'};
  const get = name => text(form.get(name)).trim();
  const personId = get('personId'), month = get('month');
  if (!people.some(person => person.id === personId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return {error:'Choisissez un commercial et un mois valides.'};
  const salaryMode = get('salaryMode');
  if (!['gross','loaded'].includes(salaryMode)) return {error:'Choisissez le mode de calcul du coût CDI.'};
  const billed = number(get('billed'));
  const margin = number(get('margin'), -MAX_EUR, MAX_EUR);
  const collected = optionalNumber(get('collected'), null);
  const otherCost = optionalNumber(get('otherCost'));
  const fixedBonus = optionalNumber(get('fixedBonus'));
  const salaryGross = salaryMode === 'gross' ? number(get('salaryGross')) : null;
  const employerRate = salaryMode === 'gross' ? number(get('employerRate'), 0, 150) : null;
  const loadedCost = salaryMode === 'loaded' ? number(get('loadedCost')) : null;
  if ([billed,margin,otherCost,fixedBonus].some(n => n === null) || (get('collected') && collected === null)) return {error:'Vérifiez les montants de CA, de marge et de coûts saisis.'};
  if (salaryMode === 'gross' && (salaryGross === null || employerRate === null)) return {error:'Renseignez le brut mensuel et votre taux de charges employeur.'};
  if (salaryMode === 'loaded' && loadedCost === null) return {error:'Renseignez le coût CDI chargé du mois.'};
  const commissionBase = get('commissionBase');
  if (!['none','billed','margin','collected'].includes(commissionBase)) return {error:'Choisissez la base de la prime variable.'};
  const commissionRate = commissionBase === 'none' ? 0 : number(get('commissionRate'), 0, 100);
  if (commissionRate === null || (commissionBase === 'collected' && collected === null)) return {error:'Renseignez un taux de prime valide et l’encaissé si la prime en dépend.'};
  const commissionBasis = commissionBase === 'billed' ? billed : commissionBase === 'margin' ? Math.max(0,margin) : commissionBase === 'collected' ? collected : 0;
  const bonusGross = fixedBonus + commissionBasis * commissionRate / 100;
  const bonusEmployerRate = optionalNumber(get('bonusEmployerRate'), null, 0, 150);
  if (bonusGross > 0 && bonusEmployerRate === null) return {error:'Renseignez votre taux de charges sur prime pour calculer son coût employeur.'};
  if (get('bonusEmployerRate') && bonusEmployerRate === null) return {error:'Vérifiez le taux de charges sur prime.'};
  const records = normalizeFinanceRecords(value);
  const editingId = selectedId === 'new' ? null : selectedId || get('recordId') || null;
  const previous = editingId ? records.find(item => item.id === editingId && item.workspaceKey === workspaceKey) : null;
  if (editingId && !previous) return {error:'Ce calcul n’existe plus dans cet espace. Revenez à la liste des mois.'};
  if (records.some(item => item.workspaceKey === workspaceKey && item.personId === personId && item.month === month && item.id !== previous?.id)) return {error:'Un calcul existe déjà pour cette personne et ce mois. Ouvrez-le pour le modifier.'};
  const record = {id:previous?.id || uid(), workspaceKey, personId, month, salaryMode, salaryGross, employerRate, loadedCost, billed, collected, margin, otherCost, fixedBonus, commissionBase, commissionRate, bonusEmployerRate, updatedAt:new Date().toISOString()};
  return {records:[...records.filter(item => !(item.id === previous?.id && item.workspaceKey === workspaceKey)),record].slice(-240),record,message:`${monthLabel(month)} · calcul de ${people.find(person => person.id === personId)?.name || 'ce commercial'} mis à jour.`};
}

export function removeFinanceRecord(value, id, {workspaceKey,role} = {}) {
  if (role !== 'direction') return {error:'Seule la direction peut supprimer ce calcul.'};
  const records = normalizeFinanceRecords(value);
  const matches = records.flatMap((item,index) => item.id === id && item.workspaceKey === workspaceKey ? [index] : []);
  if (matches.length !== 1) return {error:'Calcul introuvable ou ambigu dans cet espace.'};
  return {records:records.filter((_,index) => index !== matches[0]),message:'Calcul supprimé de cet espace.'};
}

/** Contribution commerciale, not accounting net profit or a payroll statement. */
export function calculateFinanceRecord(record) {
  if (!record) return null;
  const salaryCost = record.salaryMode === 'loaded' ? record.loadedCost : record.salaryGross * (1 + record.employerRate / 100);
  const basis = record.commissionBase === 'billed' ? record.billed : record.commissionBase === 'margin' ? Math.max(0,record.margin) : record.commissionBase === 'collected' ? record.collected : 0;
  if (![salaryCost,basis,record.margin,record.otherCost,record.fixedBonus,record.commissionRate].every(Number.isFinite)) return null;
  const rateBonus = basis * record.commissionRate / 100;
  const bonusGross = rateBonus + record.fixedBonus;
  if (bonusGross > 0 && !Number.isFinite(record.bonusEmployerRate)) return null;
  const bonusCharges = bonusGross * (record.bonusEmployerRate ?? 0) / 100;
  const totalBonus = bonusGross + bonusCharges;
  const totalCost = salaryCost + record.otherCost + totalBonus;
  return {salaryCost,rateBonus,bonusGross,bonusCharges,totalBonus,totalCost,contribution:record.margin-totalCost,marginToCover:Math.max(0,totalCost-record.margin),collectionGap:record.collected === null ? null : record.billed-record.collected};
}

/** Called after a salary-mode change. Hidden inputs keep drafts but are ignored by saveFinanceRecord. */
export function syncFinanceSalaryMode(form) {
  const mode = form?.querySelector?.('[name="salaryMode"]')?.value;
  if (!['gross','loaded'].includes(mode)) return false;
  for (const group of form.querySelectorAll('[data-finance-salary]')) group.hidden = group.dataset.financeSalary !== mode;
  return true;
}

function trend(records, personId) {
  const series = records.filter(item => item.personId === personId).sort((a,b) => a.month.localeCompare(b.month)).slice(-6);
  if (!series.length) return '';
  const values = series.map(item => ({item,result:calculateFinanceRecord(item)})).filter(row => row.result);
  const max = Math.max(1,...values.flatMap(row => [row.item.margin,row.result.totalCost].map(Math.abs)));
  return `<div class="finance-trend" role="group" aria-label="Marge et coût commercial par mois">${values.map(({item,result}) => `<div class="finance-trend-month"><div class="finance-trend-bars"><span class="finance-trend-bar margin ${item.margin<0?'negative':''}" style="height:${Math.max(4,Math.abs(item.margin)/max*100)}%" title="Marge ${esc(monthLabel(item.month))} : ${money(item.margin)}"></span><span class="finance-trend-bar cost" style="height:${Math.max(4,result.totalCost/max*100)}%" title="Coût ${esc(monthLabel(item.month))} : ${money(result.totalCost)}"></span></div><strong>${esc(monthLabel(item.month))}</strong><small>Marge ${money(item.margin)} · coût ${money(result.totalCost)}</small></div>`).join('')}</div><p class="finance-legend"><span>Marge attribuée</span><span>Coût commercial</span></p>`;
}

export function renderFinanceCalculator(value, {workspaceKey,people = [],role = 'sales',selectedId = null,month = new Date().toISOString().slice(0,7)} = {}) {
  const records = normalizeFinanceRecords(value).filter(item => item.workspaceKey === workspaceKey && people.some(person => person.id === item.personId));
  const selected = selectedId === 'new' ? null : records.find(item => item.id === selectedId) || [...records].sort((a,b) => b.month.localeCompare(a.month))[0] || null;
  if (role !== 'direction') return `<section class="glass card finance-calculator" data-finance-calculator><div class="section-title"><div><h2>Coût commercial</h2><p>Le calcul des coûts s’affiche dans la vue Direction.</p></div></div></section>`;
  const result = calculateFinanceRecord(selected);
  const current = selected || {personId:people[0]?.id || '',month,salaryMode:'loaded',commissionBase:'none'};
  const summary = result ? `<div class="finance-results" data-finance-result><div><span>Marge attribuée</span><strong>${money(selected.margin)}</strong></div><div><span>Coût commercial total</span><strong>${money(result.totalCost)}</strong></div><div class="${result.contribution<0?'risk':'positive'}"><span>Contribution après coût commercial</span><strong>${money(result.contribution)}</strong></div></div><p class="finance-equation">${money(selected.margin)} de marge − ${money(result.salaryCost)} de coût CDI − ${money(result.totalBonus)} de coût employeur des primes − ${money(selected.otherCost)} d’autres coûts = <strong>${money(result.contribution)}</strong>.</p><div class="finance-reading"><p>Prime brute ${money(result.bonusGross)} + charges saisies ${money(result.bonusCharges)} = ${money(result.totalBonus)} de coût employeur.</p><p>${result.contribution < 0 ? `Il manque ${money(result.marginToCover)} de marge attribuée pour couvrir le coût commercial renseigné.` : `La marge attribuée dépasse le coût commercial renseigné de ${money(result.contribution)}.`}</p>${selected.collected === null ? '<p>Encaissement non renseigné : aucun retard de paiement déduit.</p>' : `<p>Facturé ${money(selected.billed)} · encaissé ${money(selected.collected)}. L’écart de ${money(result.collectionGap)} dépend des périodes de facturation et de règlement.</p>`}</div>${trend(records,selected.personId)}` : `<div class="finance-empty"><strong>Renseignez un premier mois pour suivre la contribution.</strong><p>Le calcul part de votre marge attribuée et du coût de ce commercial. Aucun résultat n’est déduit des montants globaux de la BU.</p></div>`;
  const list = records.length ? `<div class="finance-record-list"><h3>Mois renseignés</h3>${[...records].sort((a,b) => b.month.localeCompare(a.month)).slice(0,12).map(item => {const person=people.find(person => person.id === item.personId),calc=calculateFinanceRecord(item);return `<button type="button" class="finance-record ${selected?.id===item.id?'active':''}" data-action="finance-select" data-id="${esc(item.id)}"><span><strong>${esc(person?.name || 'Commercial')}</strong><small>${esc(monthLabel(item.month))}</small></span><b>${calc ? money(calc.contribution) : 'À compléter'}</b></button>`}).join('')}</div>` : '';
  if (!people.length) return `<section class="glass card finance-calculator" data-finance-calculator><div class="section-title"><div><h2>Coût commercial et marge</h2><p>Ajoutez d’abord les commerciaux concernés.</p></div></div><button type="button" class="btn btn-primary" data-route="team?tab=administration">Créer une personne dans l’équipe</button></section>`;
  const form = `<details class="finance-editor"><summary>${selected?'Modifier ce mois':'Renseigner un mois'}<span aria-hidden="true">⌄</span></summary><form data-finance-form><input type="hidden" name="recordId" value="${selected?esc(selected.id):''}"><div class="finance-form-grid">${field('Commercial',`<select name="personId" required>${people.map(person => `<option value="${esc(person.id)}" ${current.personId===person.id?'selected':''}>${esc(person.name)}</option>`).join('')}</select>`)}${field('Mois',`<input name="month" type="month" required value="${display(current.month)}">`)}${field('Coût CDI',`<select name="salaryMode" data-finance-salary-mode><option value="loaded" ${current.salaryMode==='loaded'?'selected':''}>Coût chargé exact</option><option value="gross" ${current.salaryMode==='gross'?'selected':''}>Brut + taux saisi</option></select>`)}${field('Coût chargé (€)',input('loadedCost',display(current.loadedCost)),'Coût du CDI hors primes ci-dessous, depuis votre paie ou outil RH.',`data-finance-salary="loaded" ${current.salaryMode==='loaded'?'':'hidden'}`)}${field('Brut mensuel (€)',input('salaryGross',display(current.salaryGross)),'',`data-finance-salary="gross" ${current.salaryMode==='gross'?'':'hidden'}`)}${field('Charges employeur (%)',input('employerRate',display(current.employerRate)),'Votre taux ; aucune valeur réglementaire présumée.',`data-finance-salary="gross" ${current.salaryMode==='gross'?'':'hidden'}`)}${field('CA facturé attribué (€)',input('billed',display(current.billed),'required'))}${field('Marge brute attribuée (€)',`<input name="margin" type="number" inputmode="decimal" step="0.01" value="${display(current.margin)}" required>`,'Après coûts directs des missions ; peut différer du CA facturé sur le mois.')}${field('CA encaissé attribué (€)',input('collected',display(current.collected)),'Facultatif. Ne vaut pas facturé.')}${field('Autres coûts imputés (€)',input('otherCost',display(current.otherCost)))}${field('Prime fixe brute (€)',input('fixedBonus',display(current.fixedBonus)))}${field('Base de la prime variable',`<select name="commissionBase"><option value="none">Aucune</option><option value="margin" ${current.commissionBase==='margin'?'selected':''}>Marge attribuée</option><option value="billed" ${current.commissionBase==='billed'?'selected':''}>CA facturé</option><option value="collected" ${current.commissionBase==='collected'?'selected':''}>CA encaissé</option></select>`)}${field('Taux de prime brute (%)',input('commissionRate',display(current.commissionRate)))}${field('Charges sur primes (%)',input('bonusEmployerRate',display(current.bonusEmployerRate)),'Requis si une prime est due ; votre taux, sans valeur présumée.')}</div><p class="finance-form-note">Le coût chargé exact prévaut si ce mode est choisi. Prime brute = montant fixe + taux × base choisie. Son coût employeur ajoute les charges sur prime saisies. Une marge négative ne déclenche pas de prime sur marge.</p><div class="finance-form-actions"><button type="submit" class="btn btn-primary">Enregistrer ce mois</button>${selected?'<button type="button" class="btn btn-quiet" data-action="finance-new">Nouveau mois</button>':''}</div></form></details>${selected?`<details class="finance-delete-confirm"><summary>Supprimer ce mois</summary><div><p>Effacer ${esc(monthLabel(selected.month))} pour ${esc(people.find(person=>person.id===selected.personId)?.name||'ce commercial')} de cet espace ?</p><button type="button" class="btn btn-quiet" data-action="finance-remove" data-id="${esc(selected.id)}" data-person-id="${esc(selected.personId)}">Confirmer la suppression</button></div></details>`:''}`;
  return `<section class="glass card finance-calculator" data-finance-calculator><div class="section-title"><div><h2>Coût commercial et marge</h2><p>Par commercial et par mois · montants saisis par la direction.</p></div></div>${summary}${list}${form}<p class="finance-footnote">Contribution commerciale = marge brute attribuée − coût CDI chargé − prime − autres coûts. Ce n’est ni le bénéfice comptable ni une fiche de paie. Saisies conservées sur cet appareil ; aucune donnée de paie importée. <a href="https://mon-entreprise.urssaf.fr/simulateurs/salaire-brut-net?view=employeur" target="_blank" rel="noopener noreferrer">Vérifier un coût employeur avec l’Urssaf</a>.</p></section>`;
}
