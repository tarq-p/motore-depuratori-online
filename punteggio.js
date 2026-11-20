// Punteggio «Quanto conviene contattarlo», da 0 a 100, per il motore depuratori.
// Regole dichiarate, senza dati storici di vendita: e' una stima per decidere da chi partire.
// Ogni indicatore vale da 0 a 100, oppure null se non lo sappiamo: quelli che non sappiamo
// non abbassano il punteggio, i pesi si ridistribuiscono sugli altri.
(function(){
  // tipi in ordine di priorita' del cliente
  const TIPI = {
    ristorante:{label:'Ristoranti e sale ricevimenti', rango:1, problema:80},
    pizzeria:  {label:'Pizzerie', rango:2, problema:75},
    bar:       {label:'Bar e caffetterie', rango:3, problema:90},
    hotel:     {label:'Hotel e B&B', rango:4, problema:70, stagione:true},
    azienda:   {label:'Uffici e aziende', rango:5, problema:70},
    benessere: {label:'Palestre e centri estetici', rango:6, problema:55},
    mensa:     {label:'Mense e catering', rango:7, problema:75},
    lido:      {label:'Stabilimenti balneari', rango:8, problema:50, stagione:true}
  };
  const NOMI = {A:'Quanta acqua usa', B:'Il problema tipico del suo settore', E:'Come contattarlo'};
  const PESI = {A:.45, B:.35, E:.20};

  function scala(n, soglie){ for(const [s,v] of soglie) if(n>=s) return v; return soglie[soglie.length-1][1]; }

  // ---- AZIENDE: criteri loro (dimensione e segnali di bisogno)
  const NOMI_AZ = {A:'Quanto è grande', B:'Segnali che serve acqua per le persone', E:'Come contattarla'};
  const PESI_AZ = {A:.50, B:.30, E:.20};
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  // forma giuridica dal nome: una ditta individuale con dieci dipendenti è rara, una S.p.A. no
  function forma(nome){
    const n = ' '+norm(nome).replace(/[.,]/g,' ').replace(/\s+/g,' ')+' ';
    if(/ s ?p ?a | spa /.test(n)) return {k:'spa', label:'S.p.A.', v:85};
    if(/ s ?r ?l ?s | srls | semplificata /.test(n)) return {k:'srls', label:'S.r.l. semplificata', v:40};
    if(/ s ?r ?l | srl /.test(n)) return {k:'srl', label:'S.r.l.', v:60};
    if(/ coop| cooperativa /.test(n)) return {k:'coop', label:'cooperativa', v:55};
    if(/ s ?a ?s | sas | s ?n ?c | snc /.test(n)) return {k:'pers', label:'società di persone (s.a.s. o s.n.c.)', v:40};
    if(/ di [a-z]+ [a-z]+ *$/.test(n)) return {k:'ind', label:'ditta individuale («di» + nome e cognome)', v:25};
    return null;
  }
  const CAT_GRANDI = /manufacturer|industrial|warehouse|wholesale|distribution|logistics/;

  function calcolaAzienda(l){
    const li = (l.li && l.li.vivo) ? l.li : null;
    const ind = {}, perche = [], manca = [], crit = [];
    // A · quanto è grande: il numero di dipendenti se il sito lo dice, altrimenti una stima dichiarata
    let A, dimNota = false;
    if(li && li.dipendenti){
      A = scala(li.dipendenti, [[50,100],[10,80],[0,25]]); dimNota = true;
      perche.push('Sul sito parla di circa '+li.dipendenti+' persone.');
    }else{
      const f = forma(l.nome);
      A = f ? f.v : 45;
      if(f) (f.v>=60?perche:crit).push('Dal nome: '+f.label+'.');
      if(CAT_GRANDI.test(l.cat||'')){ A += 10; perche.push('Produce, distribuisce o ha un magazzino: di solito ha più persone di un ufficio.'); }
      if(li && li.struttura>0){ A += 10; perche.push('Sul sito parla di stabilimento, produzione, turni o magazzino.'); }
      if(li && li.iso>0){ A += 10; perche.push('Ha certificazioni di qualità o di sicurezza: è un\'azienda strutturata.'); }
      if(li && (li.team>0 || li.lavoro>0)) A += 5;
      A = Math.min(95, A);
      manca.push('Quanti dipendenti ha davvero: il suo sito non lo dice. Si controlla su ufficiocamerale.it (gratis, una scheda alla volta).');
    }
    ind.A = A;
    const dieci = dimNota ? li.dipendenti>=10 : A>=60;

    // B · segnali che serve acqua per le persone: solo dal sito, se non c'è non lo sappiamo
    let B = null;
    if(li){
      B = 50;
      if(li.pausa>0){ B = 85; perche.push('Sul sito parla di area break, mensa, distributori o welfare per i dipendenti.'); }
      if(li.struttura>0) B += 10;
      if(li.caffe>0){ B += 10; perche.push('Parla di caffè: l\'acqua serve anche alla macchina.'); }
      if(li.plastica>0){ B += 10; perche.push('Parla di sostenibilità o plastica.'); }
      B = Math.min(100, B);
    }else manca.push('Se ha già acqua per i dipendenti (boccioni, erogatori): il sito non è stato letto, e lo dice comunque solo una telefonata.');
    ind.B = B;

    // un'azienda risponde anche al telefono e all'email: pesano più che per un bar
    ind.E = l.canale===0?100 : l.canale===1?85 : l.canale===2?60 : 0;

    let s=0, w=0;
    for(const k of Object.keys(PESI_AZ)) if(ind[k]!=null){ s+=ind[k]*PESI_AZ[k]; w+=PESI_AZ[k]; }
    let lead = w ? Math.round(s/w) : 0;
    let gia = false;
    if(li && ((li.concorrenti||[]).length || li.giaFiltrata>0)){
      gia = true; lead = Math.max(0, lead-25);
      crit.push('Sul sito parla di acqua filtrata o nomina un fornitore. Chiedi se ha già un impianto e quando scade il contratto.');
    }
    const catena = (l.sedi||1)>=2 || (li && li.sedi>=2);
    if(catena){ lead = Math.min(100, lead+5); perche.push('Ha più sedi: una trattativa, più impianti.'); }
    if(!dieci){ lead = Math.round(lead*0.8); crit.push('Sotto i 10 dipendenti (stima dal nome e dalla categoria): pochi boccioni, conviene meno.'); }
    if(!dimNota) crit.push('La dimensione è una stima dal nome e dalla categoria, non un dato.');
    const classe = lead>=70?'hi' : lead>=55?'mid' : lead>=40?'val' : 'low';
    return {lead, classe, ind, pesi:PESI_AZ, nomi:NOMI_AZ, perche, manca, crit, gia, catena, conf:Math.round(100*w), stagione:false, dieci, dimNota};
  }

  // l: {type, nome, cat, canale (0 WhatsApp, 1 email, 2 telefono), li (cosa dice il sito), sedi}
  // quello che arriva dal sito letto resta salvato nel browser: se un dato vecchio o rovinato non ha la forma giusta, lo sistemo
  function pulisci(li){
    if(!li || typeof li!=='object') return null;
    const o={...li};
    o.concorrenti = Array.isArray(li.concorrenti) ? li.concorrenti.filter(x=>typeof x==='string').slice(0,10) : [];
    for(const k of ['coperti','camere','dipendenti','sedi']){ const n=+li[k]; o[k] = Number.isFinite(n)&&n>0 ? Math.min(n,3000) : null; }
    for(const k of ['cerimonie','catering','caffe','plastica','giaFiltrata','pausa','struttura','iso','team','lavoro']){ const n=+li[k]; o[k] = Number.isFinite(n)&&n>0 ? n : 0; }
    return o;
  }

  function calcola(l, ctx){
    l = {...l, li:pulisci(l.li)}; ctx = ctx || {};
    if(l.type==='azienda') return calcolaAzienda(l);
    const li = (l.li && l.li.vivo) ? l.li : null;
    const ind = {}, perche = [], manca = [], crit = [];
    const t = TIPI[l.type] || {problema:50};

    // A · quanta acqua usa: solo da quello che dice il suo sito
    let A = null;
    if(li){
      const v = [];
      if(li.coperti) v.push(scala(li.coperti, [[150,100],[80,80],[40,55],[0,30]]));
      if(li.camere) v.push(scala(li.camere, [[40,100],[15,80],[5,50],[0,25]]));
      if(li.dipendenti) v.push(scala(li.dipendenti, [[50,100],[10,80],[0,30]]));
      if(li.cerimonie>0) v.push(90);
      if(li.catering>0) v.push(80);
      if(v.length) A = Math.max(...v);
      if(li.cerimonie>0) perche.push('Organizza cerimonie o banchetti: è lì che le bottiglie pesano di più.');
      if(li.coperti) perche.push('Sul sito parla di circa '+li.coperti+' coperti.');
      if(li.camere) perche.push('Sul sito parla di circa '+li.camere+' camere.');
      if(li.dipendenti) perche.push('Sul sito parla di circa '+li.dipendenti+' persone.');
    }
    if(A==null) manca.push('Quanto è grande (coperti, camere, persone): non lo dice nessun dato aperto.');
    ind.A = A;

    // B · il problema tipico del settore, piu' quello che dice il sito
    let B = t.problema;
    if(li){
      if(li.caffe>0 && l.type!=='bar'){ B += 10; perche.push('Serve caffè: il calcare nella macchina è un problema anche qui.'); }
      if(li.plastica>0){ B += 10; perche.push('Sul sito parla di plastica o sostenibilità.'); }
    }
    if(l.type==='bar') perche.push('Nei bar l\'acqua si usa tutto il giorno, al banco e per i clienti.');
    ind.B = Math.min(100, B);

    // E · come contattarlo
    ind.E = l.canale===0?100 : l.canale===1?70 : l.canale===2?45 : 0;
    if(l.canale===2) crit.push('Solo telefono: niente WhatsApp né email.');

    let s = 0, w = 0;
    for(const k of Object.keys(PESI)) if(ind[k]!=null){ s += ind[k]*PESI[k]; w += PESI[k]; }
    let lead = w ? Math.round(s/w) : 0;

    // segnali che non entrano negli indicatori ma cambiano la scelta
    let gia = false;
    if(li && ((li.concorrenti||[]).length || li.giaFiltrata>0)){
      gia = true; lead = Math.max(0, lead-25);
      crit.push((li.concorrenti||[]).length
        ? 'Sul sito nomina '+li.concorrenti.join(', ')+'. Chiedi se ha già un impianto e quando scade il contratto.'
        : 'Sul sito parla di acqua filtrata o microfiltrata. Chiedi se ha già un impianto e quando scade il contratto.');
    }
    const catena = (l.sedi||1)>=2 || (li && li.sedi>=2);
    if(catena){ lead = Math.min(100, lead+5); perche.push('Ha più sedi: una trattativa, più impianti.'); }
    if(t.stagione) crit.push('Lavora a stagione: il momento giusto per proporre è febbraio-aprile.');
    if(li && li.lavoro>0) perche.push('Cerca personale: sta crescendo.');

    const conf = Math.round(100*w);
    const classe = lead>=70?'hi' : lead>=55?'mid' : lead>=40?'val' : 'low';
    return {lead, classe, ind, pesi:PESI, nomi:NOMI, perche, manca, crit, gia, catena, conf, stagione:!!t.stagione};
  }

  window.MD_PUNTEGGIO = {TIPI, NOMI, PESI, calcola, forma};
})();
