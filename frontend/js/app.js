// ==========================================
//   STATO GLOBALE
// ==========================================

const NOME_SALDO_INIZIALE = "saldo iniziale";
const CATEGORIE_NASCOSTE = [NOME_SALDO_INIZIALE];

let categorieEntrate = [];
let categorieUscite  = [];
let tutteLeTransazioni = [];

// Istanze Chart.js (per poterle distruggere/ricreare)
let chartSaldo     = null;
let chartDoughnut  = null;
let chartEntrate   = null;
let chartUscite    = null;
let chartAndamento = null;

// Periodo attivo per i grafici analisi
let periodoAttivo = "mese";

// ==========================================
//   GUARD AUTENTICAZIONE
// ==========================================
// Se non c'è un token salvato, rimanda al login
if (!localStorage.getItem("access_token") && !sessionStorage.getItem("access_token")) {
    window.location.href = "/login.html";
}

function isCategoriaNascosta(nome) {
    return CATEGORIE_NASCOSTE.includes(nome.trim().toLowerCase());
}

function isSaldoIniziale(nome) {
    return nome.trim().toLowerCase() === NOME_SALDO_INIZIALE;
}

// ==========================================
//   INIT
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            await logout();
            window.location.href = "/login.html";
        });
    }

    // Mostra email utente nell'header
    const emailEl = document.getElementById("header-email");
    if (emailEl) {
        emailEl.textContent = localStorage.getItem("user_email") || sessionStorage.getItem("user_email") || "";
    }

    // Inizializza flatpickr solo nel pannello manuale (si avvia se il campo #data esiste)
    function inizializzaFlatpickr() {
        const dataInput = document.getElementById("data");
        if (!dataInput || dataInput._flatpickr) return;
        flatpickr("#data", {
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d-m-Y",
            locale: "it",
            position: "auto center",
            defaultDate: "today",
            maxDate: "today",
            onReady: (sd, ds, instance) => {
                setTimeout(() => {
                    adattaLarghezzaMese();
                    trasformaAnnoInSelect(instance);
                }, 0);
            },
            onMonthChange: adattaLarghezzaMese
        });
    }

    const cacheCategorie = localStorage.getItem('cache_categorie');
    if (cacheCategorie) {
        const dati = JSON.parse(cacheCategorie);
        categorieEntrate = dati.entrate;
        categorieUscite  = dati.uscite;
        aggiornaSelectCategorie();
    }

    try {
        const [entrate, uscite] = await Promise.all([
            getCategorieEntrate(),
            getCategorieUscite(),
            caricaSaldo(),
            caricaTransazioni()
        ]);

        // Applica le programmate scadute in background — non blocca il caricamento
        applicaProgrammate().then(async result => {
            if (result && result.applicate > 0) {
                // Se sono state applicate transazioni, ricarica saldo e lista
                await caricaTransazioni();
                await caricaSaldo();
            }
        }).catch(() => {
            // Errore silenzioso — non blocca l'app
        });
        categorieEntrate = entrate;
        categorieUscite  = uscite;
        localStorage.setItem('cache_categorie', JSON.stringify({ entrate, uscite }));
        aggiornaSelectCategorie();
        inizializzaFiltri();

        // Controllo per i nuovi utenti
        if (tutteLeTransazioni.length === 0) {
            mostraModaleSaldoIniziale();
        }

    } catch (err) {
        console.error("Errore nel caricamento dati dal server:", err);
    }

    document.getElementById("tipo").addEventListener("change", () => aggiornaSelectCategorie());

    document.getElementById("categoria").addEventListener("change", async function() {
        if (this.value === "aggiungi") {
            const isEntrata = document.getElementById("tipo").value === "true";
            const nuovoNome = await apriModaleCategoria(isEntrata ? "entrata" : "uscita");

            if (nuovoNome && nuovoNome.trim() !== "") {
                const tempId = Date.now();
                if (isEntrata) categorieEntrate.push({ id: tempId, nome: nuovoNome.trim() });
                else           categorieUscite.push({ id: tempId, nome: nuovoNome.trim() });
                aggiornaSelectCategorie(tempId);
                addCategoria(nuovoNome.trim(), isEntrata).then(realCat => {
                    const lista = isEntrata ? categorieEntrate : categorieUscite;
                    const cat   = lista.find(c => c.id === tempId);
                    if (cat) cat.id = Array.isArray(realCat) ? realCat[0].id : realCat.id;
                    localStorage.setItem('cache_categorie', JSON.stringify({ entrate: categorieEntrate, uscite: categorieUscite }));
                    aggiornaSelectCategorie(cat ? cat.id : null);
                });
            } else {
                this.value = "";
            }
        }
    });

    document.querySelectorAll(".tab-periodo button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-periodo button").forEach(b => b.classList.remove("attivo"));
            btn.classList.add("attivo");
            periodoAttivo = btn.dataset.periodo;
            aggiornaGraficiAnalisi();
        });
    });

    document.getElementById("btn-aggiungi").addEventListener("click", async () => {
        const importoRaw  = document.getElementById("importo").value;
        const dataInput   = document.getElementById("data").value;
        const selectCat   = document.getElementById("categoria");
        const idCategoria = selectCat.value;
        const tipoValore  = document.getElementById("tipo").value;

        if (!importoRaw || !dataInput || !idCategoria || idCategoria === "") {
            alert("Compila tutti i campi!");
            return;
        }

        // Blocca se la categoria è ancora in fase di salvataggio sul server
        if (parseInt(idCategoria) > 1_000_000_000_000) {
            alert("La categoria è ancora in fase di salvataggio, riprova tra un secondo.");
            return;
        }

        const importo   = parseFloat(importoRaw);
        const isEntrata = tipoValore === "true";

        const saldoParsed = tutteLeTransazioni.reduce((acc, t) => t.is_entrata ? acc + t.soldi : acc - t.soldi, 0);
        const nuovoSaldo  = isEntrata ? saldoParsed + importo : saldoParsed - importo;
        aggiornaSaldoUI(nuovoSaldo);

        const nomeCategoria = selectCat.options[selectCat.selectedIndex].text;
        const transazioneOttimista = {
            id:           null,
            soldi:        importo,
            is_entrata:   isEntrata,
            data:         dataInput + "T00:00:00",
            created_at:   new Date().toISOString(),
            id_categoria: parseInt(idCategoria),
            categoria:    { nome: nomeCategoria }
        };
        tutteLeTransazioni = [transazioneOttimista, ...tutteLeTransazioni];

        const tbody = document.getElementById("corpo-tabella");
        const riga  = document.createElement("tr");
        const dataVisualizzata = dataInput.split("-").reverse().join("/");
        riga.innerHTML = `
            <td>${dataVisualizzata}</td>
            <td>${nomeCategoria}</td>
            <td class="${isEntrata ? 'importo-positivo' : 'importo-negativo'}">${isEntrata ? '+' : '-'}${formatImporto(importo)} €</td>
            <td><span class="badge-tipo ${isEntrata ? 'badge-entrata' : 'badge-uscita'}">${isEntrata ? 'Entrata' : 'Uscita'}</span></td>
        `;
        tbody.prepend(riga);

        aggiornaGraficoSaldo();
        aggiornaGraficiAnalisi();

        document.getElementById("importo").value = "";
        document.querySelector("#data")._flatpickr.setDate(new Date());

        addTransazione(importo, parseInt(idCategoria), isEntrata, dataInput)
            .then(async () => {
                const transazioni = await getTransazioni();
                tutteLeTransazioni = transazioni;
                aggiornaGraficoSaldo();
                aggiornaGraficiAnalisi();
            })
            .catch(err => {
                alert("Errore sincronizzazione server.");
                console.error(err);
            });
    });

    //   SWITCH MODALITÀ: AUTOMATICA / MANUALE

    const btnModeAuto    = document.getElementById("btn-mode-auto");
    const btnModeManuale = document.getElementById("btn-mode-manuale");
    const pannelloAI     = document.getElementById("pannello-ai");
    const pannelloMan    = document.getElementById("pannello-manuale");

    let modalitaCorrente = "auto"; // default: automatica

    function switchMode(mode) {
        modalitaCorrente = mode;
        if (mode === "auto") {
            pannelloAI.style.display  = "";
            pannelloMan.style.display = "none";
            btnModeAuto.classList.add("active");
            btnModeManuale.classList.remove("active");
        } else {
            pannelloAI.style.display  = "none";
            pannelloMan.style.display = "";
            btnModeManuale.classList.add("active");
            btnModeAuto.classList.remove("active");
            // Inizializza flatpickr quando si apre la modalità manuale
            inizializzaFlatpickr();
        }
    }

    btnModeAuto.addEventListener("click",    () => switchMode("auto"));
    btnModeManuale.addEventListener("click", () => switchMode("manuale"));

    //   AI — LOGICA ANALISI TESTO

    // Stato temporaneo del risultato AI
    let datiAI = null;

    const btnAnalizza    = document.getElementById("btn-analizza");
    const aiPreview      = document.getElementById("ai-preview");
    const analizzaLabel  = document.getElementById("analizza-label");
    const analizzaSpinner= document.getElementById("analizza-spinner");

    btnAnalizza.addEventListener("click", async () => {
        const testo = document.getElementById("ai-testo").value.trim();
        if (!testo) {
            document.getElementById("ai-testo").classList.add("ai-textarea--shake");
            setTimeout(() => document.getElementById("ai-testo").classList.remove("ai-textarea--shake"), 500);
            return;
        }

        // UI: stato di caricamento
        analizzaLabel.style.display  = "none";
        analizzaSpinner.style.display = "";
        btnAnalizza.disabled          = true;
        aiPreview.style.display       = "none";

        try {
            // Raccoglie tutti i nomi categoria disponibili (escludendo quelle programmate o nascoste)
            const tutteCategorie = [
                ...categorieEntrate.filter(c => !c.is_programmata).map(c => c.nome),
                ...categorieUscite.filter(c => !c.is_programmata).map(c => c.nome)
            ].filter(n => !isCategoriaNascosta(n));

            const risultato = await analizzaTestoIA(testo, tutteCategorie);

            if (risultato.error) {
                throw new Error(risultato.error);
            }

            datiAI = risultato;

            // Popola i chip di anteprima
            document.getElementById("chip-importo").innerHTML =
                `<span class="chip-label">💶 Importo</span><span class="chip-valore">${formatImporto(risultato.importo)} €</span>`;
            document.getElementById("chip-tipo").innerHTML =
                `<span class="chip-label">${risultato.is_entrata ? '📈' : '📉'} Tipo</span><span class="chip-valore ${risultato.is_entrata ? 'chip-entrata' : 'chip-uscita'}">${risultato.is_entrata ? 'Entrata' : 'Uscita'}</span>`;
            document.getElementById("chip-categoria").innerHTML =
                `<span class="chip-label">🏷️ Categoria</span><span class="chip-valore">${risultato.categoria_suggerita}</span>`;

            const dataFormattata = risultato.data.split("-").reverse().join("/");
            document.getElementById("chip-data").innerHTML =
                `<span class="chip-label">📅 Data</span><span class="chip-valore">${dataFormattata}</span>`;

            // Mostra la preview con animazione
            aiPreview.style.display = "";
            aiPreview.classList.remove("ai-preview--in");
            void aiPreview.offsetWidth; // reflow
            aiPreview.classList.add("ai-preview--in");

        } catch (err) {
            alert("Errore AI: " + err.message);
            console.error(err);
        } finally {
            analizzaLabel.style.display   = "";
            analizzaSpinner.style.display = "none";
            btnAnalizza.disabled          = false;
        }
    });

    // Enter nel textarea analizza
    document.getElementById("ai-testo").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            btnAnalizza.click();
        }
    });

    // CONFERMA risultato AI → salva transazione
    document.getElementById("btn-ai-conferma").addEventListener("click", async () => {
        if (!datiAI) return;

        const btnConf = document.getElementById("btn-ai-conferma");
        btnConf.disabled    = true;
        btnConf.textContent = "Salvataggio...";

        try {
            const { importo, is_entrata, categoria_suggerita, data: dataAI } = datiAI;

            // Trova o crea categoria
            const listaGiusta = is_entrata ? categorieEntrate : categorieUscite;
            let cat = listaGiusta.find(c =>
                c.nome.trim().toLowerCase() === categoria_suggerita.trim().toLowerCase()
            );

            if (!cat) {
                // La categoria non esiste → la crea
                const risultatoCat = await addCategoria(categoria_suggerita.trim(), is_entrata);
                cat = Array.isArray(risultatoCat) ? risultatoCat[0] : risultatoCat;
                if (is_entrata) categorieEntrate.push(cat);
                else            categorieUscite.push(cat);
                localStorage.setItem('cache_categorie', JSON.stringify({ entrate: categorieEntrate, uscite: categorieUscite }));
                
                // Aggiorna le select e i filtri in modo da vedere subito la nuova categoria!
                aggiornaSelectCategorie();
                popolaCategorieNelFiltro();
            }

            // Aggiornamento ottimistico UI
            const saldoParsed = tutteLeTransazioni.reduce((acc, t) => t.is_entrata ? acc + t.soldi : acc - t.soldi, 0);
            aggiornaSaldoUI(is_entrata ? saldoParsed + importo : saldoParsed - importo);

            const transazioneOttimista = {
                id: null, soldi: importo, is_entrata,
                data: dataAI + "T00:00:00",
                created_at: new Date().toISOString(),
                id_categoria: cat.id,
                categoria: { nome: cat.nome }
            };
            tutteLeTransazioni = [transazioneOttimista, ...tutteLeTransazioni];

            const tbody = document.getElementById("corpo-tabella");
            const riga  = document.createElement("tr");
            const dataVisualizzata = dataAI.split("-").reverse().join("/");
            riga.innerHTML = `
                <td>${dataVisualizzata}</td>
                <td>${cat.nome}</td>
                <td class="${is_entrata ? 'importo-positivo' : 'importo-negativo'}">${is_entrata ? '+' : '-'}${formatImporto(importo)} €</td>
                <td><span class="badge-tipo ${is_entrata ? 'badge-entrata' : 'badge-uscita'}">${is_entrata ? 'Entrata' : 'Uscita'}</span></td>
            `;
            tbody.prepend(riga);
            aggiornaGraficoSaldo();
            aggiornaGraficiAnalisi();

            // Reset pannello AI
            document.getElementById("ai-testo").value = "";
            aiPreview.style.display = "none";
            datiAI = null;

            // Sync server
            await addTransazione(importo, cat.id, is_entrata, dataAI);
            const transazioni = await getTransazioni();
            tutteLeTransazioni = transazioni;
            aggiornaGraficoSaldo();
            aggiornaGraficiAnalisi();

        } catch (err) {
            alert("Errore nel salvataggio: " + err.message);
            console.error(err);
        } finally {
            btnConf.disabled    = false;
            btnConf.textContent = "✅ Conferma e salva";
        }
    });

    // ANNULLA → apre modalità manuale pre-compilata
    document.getElementById("btn-ai-annulla").addEventListener("click", () => {
        switchMode("manuale");

        if (datiAI) {
            // Pre-compila i campi manuali con i dati AI
            setTimeout(() => {
                document.getElementById("importo").value = datiAI.importo;

                const tipoEl = document.getElementById("tipo");
                tipoEl.value = datiAI.is_entrata ? "true" : "false";
                aggiornaSelectCategorie();

                // Seleziona la categoria se esiste
                const listaGiusta = datiAI.is_entrata ? categorieEntrate : categorieUscite;
                const cat = listaGiusta.find(c =>
                    c.nome.trim().toLowerCase() === datiAI.categoria_suggerita.trim().toLowerCase()
                );
                if (cat) {
                    document.getElementById("categoria").value = cat.id;
                }

                // Imposta la data via flatpickr
                const fp = document.querySelector("#data")?._flatpickr;
                if (fp) fp.setDate(datiAI.data);

            }, 50);
        }
    });

});

// ==========================================
//   SALDO INIZIALE MODAL
// ==========================================

function mostraModaleSaldoIniziale() {
    const modal = document.getElementById("modal-saldo-iniziale");
    const input = document.getElementById("input-saldo-iniziale");
    const btn = document.getElementById("btn-salva-saldo");
    
    if (!modal) return;
    
    modal.style.display = "flex";
    
    // Supporto tasto Invio
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            btn.click();
        }
    });
    
    btn.onclick = async () => {
        const val = parseFloat(input.value) || 0;
        const isEntrata = val >= 0;
        const importo = Math.abs(val);
        
        btn.disabled = true;
        btn.textContent = "Salvataggio...";
        
        try {
            // Controlla se esiste già una categoria "Saldo Iniziale" del tipo corretto
            let cat = [...categorieEntrate, ...categorieUscite].find(c => isSaldoIniziale(c.nome));
            
            if (!cat) {
                // Crea la categoria
                const resultCat = await addCategoria("Saldo Iniziale", isEntrata);
                cat = Array.isArray(resultCat) ? resultCat[0] : resultCat;
                if (isEntrata) categorieEntrate.push(cat);
                else categorieUscite.push(cat);
                localStorage.setItem('cache_categorie', JSON.stringify({ entrate: categorieEntrate, uscite: categorieUscite }));
                aggiornaSelectCategorie();
            }
            
            // Crea la transazione
            const dataOggi = new Date().toISOString().split("T")[0];
            await addTransazione(importo, cat.id, isEntrata, dataOggi);
            
            // Ricarica i dati (saldo e lista)
            await caricaTransazioni();
            await caricaSaldo();
            
            modal.style.display = "none";
            
            // Avvia il tour guidato per i nuovi utenti
            if (typeof Tour !== 'undefined') {
                setTimeout(() => Tour.start(), 500);
            }
        } catch (err) {
            console.error("Errore salvataggio saldo iniziale", err);
            alert("Si è verificato un errore durante il salvataggio.");
            btn.disabled = false;
            btn.textContent = "Inizia a gestire le finanze";
        }
    };
}

// ==========================================
//   SALDO
// ==========================================

function aggiornaSaldoUI(valore) {
    const saldoEl = document.getElementById("saldo");
    saldoEl.textContent = formatValuta(valore);
    saldoEl.style.color = valore >= 0 ? "var(--positive)" : "var(--negative)";
}

async function caricaSaldo() {
    const result = await getSaldo();
    aggiornaSaldoUI(result.saldo);
    return result;
}

// ==========================================
//   TRANSAZIONI
// ==========================================

async function caricaTransazioni() {
    const transazioni = await getTransazioni();
    tutteLeTransazioni = transazioni;
    renderTransazioni(transazioni);
    aggiornaGraficoSaldo();
    aggiornaGraficiAnalisi();
    return transazioni;
}

function renderTransazioni(transazioni) {
    const tbody = document.getElementById("corpo-tabella");
    tbody.innerHTML = "";

    if (!transazioni.length) {
        const riga = document.createElement("tr");
        const td   = document.createElement("td");
        td.colSpan     = 4;
        td.className   = "tabella-vuota";
        td.textContent = "Nessuna transazione";
        riga.appendChild(td);
        tbody.appendChild(riga);
        return;
    }

    const ordinate = [...transazioni].sort((a, b) => {
        const dataDiff = new Date(b.data) - new Date(a.data);
        if (dataDiff !== 0) return dataDiff;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    ordinate.forEach(t => {
        const riga      = document.createElement("tr");
        const data      = new Date(t.data.slice(0,10) + "T12:00:00").toLocaleDateString("it-IT");
        const isEntrata = t.is_entrata;
        const importo   = `${isEntrata ? '+' : '-'}${formatImporto(t.soldi)} €`;
        riga.innerHTML = `
            <td>${data}</td>
            <td>${t.categoria.nome}</td>
            <td class="${isEntrata ? 'importo-positivo' : 'importo-negativo'}">${importo}</td>
            <td><span class="badge-tipo ${isEntrata ? 'badge-entrata' : 'badge-uscita'}">${isEntrata ? 'Entrata' : 'Uscita'}</span></td>
        `;
        tbody.appendChild(riga);
    });
}

// ==========================================
//   CATEGORIE SELECT
// ==========================================

function aggiornaSelectCategorie(idDaSelezionare = null) {
    const isEntrata = document.getElementById("tipo").value === "true";
    const filtrate  = isEntrata ? categorieEntrate : categorieUscite;
    const select    = document.getElementById("categoria");
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value       = "";
    placeholder.disabled    = true;
    placeholder.selected    = (idDaSelezionare === null);
    placeholder.textContent = "Seleziona categoria";
    select.appendChild(placeholder);

    filtrate.filter(cat => !isCategoriaNascosta(cat.nome) && !cat.is_programmata).forEach(cat => {
        const option = document.createElement("option");
        option.value = cat.id;
        option.textContent = cat.nome;
        if (idDaSelezionare && cat.id == idDaSelezionare) option.selected = true;
        select.appendChild(option);
    });

    const optionAggiungi = document.createElement("option");
    optionAggiungi.value       = "aggiungi";
    optionAggiungi.textContent = "+ Nuova categoria";
    select.appendChild(optionAggiungi);
}

// ==========================================
//   GRAFICO SALDO (storico completo)
// ==========================================

function aggiornaGraficoSaldo() {
    const ctx = document.getElementById("chart-saldo").getContext("2d");
    if (chartSaldo) { chartSaldo.destroy(); chartSaldo = null; }

    if (!tutteLeTransazioni.length) return;

    const perGiorno = {};
    [...tutteLeTransazioni]
        .sort((a, b) => a.data.slice(0,10).localeCompare(b.data.slice(0,10)))
        .forEach(t => {
            const g = t.data.slice(0, 10);
            if (!perGiorno[g]) perGiorno[g] = 0;
            perGiorno[g] += t.is_entrata ? t.soldi : -t.soldi;
        });

    const giorni = Object.keys(perGiorno).sort();
    let cum = 0;
    const cumulativi = giorni.map(g => {
        cum += perGiorno[g];
        return parseFloat(cum.toFixed(2));
    });

    const indici = campionaIndici(cumulativi, 20);
    const labels = indici.map(i => new Date(giorni[i] + "T12:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }));
    const dati = indici.map(i => cumulativi[i]);

    const getGradient = (chart) => {
        const {ctx, chartArea, scales} = chart;
        if (!chartArea) return null;

        const zeroY = scales.y.getPixelForValue(0);
        const p = Math.min(Math.max((zeroY - chartArea.top) / (chartArea.bottom - chartArea.top), 0), 1);

        const borderGrad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        borderGrad.addColorStop(0, "#3ecf8e");
        borderGrad.addColorStop(p, "#3ecf8e");
        borderGrad.addColorStop(p, "#f06880");
        borderGrad.addColorStop(1, "#f06880");

        const fillGrad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        fillGrad.addColorStop(0, "rgba(62, 207, 142, 0.25)");
        fillGrad.addColorStop(p, "rgba(62, 207, 142, 0.05)");
        fillGrad.addColorStop(p, "rgba(240, 104, 128, 0.05)");
        fillGrad.addColorStop(1, "rgba(240, 104, 128, 0.25)");

        return { border: borderGrad, fill: fillGrad };
    };

    chartSaldo = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Saldo",
                data: dati,
                borderColor: context => context.chart.chartArea ? getGradient(context.chart).border : "#3ecf8e",
                backgroundColor: context => context.chart.chartArea ? getGradient(context.chart).fill : "transparent",
                borderWidth: 2.5,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointBackgroundColor: context => {
                    const val = context.raw;
                    return val >= 0 ? "#3ecf8e" : "#f06880";
                }
            }]
        },
        options: opzioniLineaSaldo()
    });
}

function opzioniLineaSaldo() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                filter: item => item.parsed.y !== null,
                callbacks: { label: ctx => formatValuta(ctx.parsed.y) }
            }
        },
        scales: {
            x: {
                grid: { color: "rgba(255,255,255,0.04)" },
                ticks: {
                    color: "#8c87a8",
                    font: { family: "Inter", size: 11 },
                    maxRotation: 0,
                    callback: function(val) {
                        const label = this.getLabelForValue(val);
                        return label || null;
                    }
                }
            },
            y: {
                grid: { color: "rgba(255,255,255,0.04)" },
                ticks: { color: "#8c87a8", font: { family: "Inter", size: 11 }, callback: v => formatValuta(v) }
            }
        }
    };
}

// ==========================================
//   GRAFICI ANALISI (periodo)
// ==========================================

function getTransazioniFiltrate(periodo) {
    if (periodo === "tutto") return tutteLeTransazioni;

    const oggi = new Date();
    let dataInizio, dataFine;

    if (periodo === "settimana") {
        // Lunedì della settimana corrente (domenica = 0 → offset -6)
        const giornoSettimana = oggi.getDay();
        const diffLunedi = (giornoSettimana === 0) ? -6 : 1 - giornoSettimana;
        dataInizio = new Date(oggi);
        dataInizio.setDate(oggi.getDate() + diffLunedi);
        // Domenica della settimana corrente
        dataFine = new Date(dataInizio);
        dataFine.setDate(dataInizio.getDate() + 6);
    } else if (periodo === "mese") {
        // Primo giorno del mese corrente
        dataInizio = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
        // Ultimo giorno del mese corrente
        dataFine   = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0);
    } else {
        // Primo e ultimo giorno dell'anno corrente
        dataInizio = new Date(oggi.getFullYear(), 0, 1);
        dataFine   = new Date(oggi.getFullYear(), 11, 31);
    }

    const inizioStr = dateToStringLocale(dataInizio);
    const fineStr   = dateToStringLocale(dataFine);
    return tutteLeTransazioni.filter(t => {
        const d = t.data.slice(0, 10);
        return d >= inizioStr && d <= fineStr;
    });
}

function aggiornaGraficiAnalisi() {
    const transazioni = getTransazioniFiltrate(periodoAttivo);
    disegnaGraficoDoughnut(transazioni);
    disegnaGraficoAndamento(transazioni);
    disegnaGraficoEntrate(transazioni);
    disegnaGraficoUscite(transazioni);
}

function disegnaGraficoDoughnut(transazioni) {
    const totEntrate = transazioni.filter(t =>  t.is_entrata).reduce((s, t) => s + t.soldi, 0);
    const totUscite  = transazioni.filter(t => !t.is_entrata).reduce((s, t) => s + t.soldi, 0);

    const ctx = document.getElementById("chart-doughnut").getContext("2d");

    const nuoviDati = (!totEntrate && !totUscite)
        ? { data: [1, 1], backgroundColor: ["rgba(62,207,142,0.15)", "rgba(240,104,128,0.15)"], borderColor: ["rgba(62,207,142,0.3)", "rgba(240,104,128,0.3)"], borderWidth: 1.5 }
        : { data: [totEntrate, totUscite], backgroundColor: ["rgba(62,207,142,0.85)", "rgba(240,104,128,0.85)"], borderColor: ["#3ecf8e", "#f06880"], borderWidth: 1.5, hoverOffset: 6 };

    if (chartDoughnut) {
        chartDoughnut.data.datasets[0] = nuoviDati;
        chartDoughnut.options.plugins.tooltip.enabled = !(!totEntrate && !totUscite);
        chartDoughnut.update();
        return;
    }

    chartDoughnut = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Entrate", "Uscite"],
            datasets: [nuoviDati]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: { position: "bottom", labels: { color: "#8c87a8", font: { family: "Inter", size: 11 }, padding: 16, boxWidth: 12, boxHeight: 12 } },
                tooltip: { callbacks: { label: ctx => ` ${formatValuta(ctx.parsed)}` } }
            }
        }
    });
}

function disegnaGraficoAndamento(transazioni) {
    const ctx = document.getElementById("chart-andamento").getContext("2d");
    const mostraAnno = periodoAttivo === "anno" || periodoAttivo === "tutto";

    const perGiorno = {};
    transazioni.forEach(t => {
        const g = t.data.slice(0, 10);
        if (!perGiorno[g]) perGiorno[g] = { entrate: 0, uscite: 0 };
        if (t.is_entrata) perGiorno[g].entrate += t.soldi;
        else              perGiorno[g].uscite  += t.soldi;
    });

    const giorniTutti = Object.keys(perGiorno).sort();
    const valEntrate  = giorniTutti.map(g => parseFloat(perGiorno[g].entrate.toFixed(2)));
    const valUscite   = giorniTutti.map(g => parseFloat(perGiorno[g].uscite.toFixed(2)));

    const indiciE = campionaIndici(valEntrate.length ? valEntrate : [0], 16);
    const indiciU = campionaIndici(valUscite.length  ? valUscite  : [0], 16);
    const indici  = [...new Set([...indiciE, ...indiciU])].sort((a, b) => a - b);

    const toLabel = g => {
        const d = new Date(g + "T12:00:00");
        return mostraAnno
            ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
            : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    };

    const labels   = giorniTutti.length ? indici.map(i => toLabel(giorniTutti[i])) : [dateToStringLocale(new Date())];
    const datiE    = giorniTutti.length ? indici.map(i => valEntrate[i]) : [0];
    const datiU    = giorniTutti.length ? indici.map(i => valUscite[i])  : [0];

    if (chartAndamento) {
        chartAndamento.data.labels            = labels;
        chartAndamento.data.datasets[0].data  = datiE;
        chartAndamento.data.datasets[1].data  = datiU;
        chartAndamento.options.scales.x.ticks.maxRotation = mostraAnno ? 30 : 0;
        chartAndamento.update();
        return;
    }

    chartAndamento = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "Entrate", data: datiE, borderColor: "#3ecf8e", backgroundColor: "rgba(62,207,142,0.08)", borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, fill: true, tension: 0.4 },
                { label: "Uscite",  data: datiU, borderColor: "#f06880", backgroundColor: "rgba(240,104,128,0.08)", borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, fill: true, tension: 0.4 }
            ]
        },
        options: opzioniLineaAndamento(mostraAnno)
    });
}

function opzioniLineaAndamento(mostraAnno) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: "bottom", labels: { color: "#8c87a8", font: { family: "Inter", size: 11 }, padding: 14, boxWidth: 12, boxHeight: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${formatValuta(ctx.parsed.y)}` } }
        },
        scales: {
            x: {
                grid: { color: "rgba(255,255,255,0.04)" },
                ticks: { color: "#8c87a8", font: { family: "Inter", size: 10 }, maxRotation: mostraAnno ? 30 : 0 }
            },
            y: {
                grid: { color: "rgba(255,255,255,0.04)" },
                ticks: { color: "#8c87a8", font: { family: "Inter", size: 10 }, callback: v => formatValuta(v) }
            }
        }
    };
}

function disegnaGraficoEntrate(transazioni) {
    const entrate = transazioni.filter(t => t.is_entrata);
    const perCat  = aggregaPerCategoria(entrate);
    const canvas  = document.getElementById("chart-entrate");
    if (chartEntrate) { chartEntrate.destroy(); chartEntrate = null; }

    if (!perCat.length) {
        chartEntrate = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: { labels: ["—"], datasets: [{ data: [0], backgroundColor: "rgba(62,207,142,0.15)", borderColor: "rgba(62,207,142,0.3)", borderWidth: 1.5, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 4,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: "#8c87a8", font: { family: "Inter", size: 11 } } },
                    y: { grid: { color: "rgba(255,255,255,0.04)" }, min: 0, max: 1, ticks: { color: "#8c87a8", font: { family: "Inter", size: 10 }, callback: v => formatValuta(v) } }
                }
            }
        });
        return;
    }

    chartEntrate = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: perCat.map(c => c.nome),
            datasets: [{ data: perCat.map(c => c.totale), backgroundColor: "rgba(62,207,142,0.7)", borderColor: "#3ecf8e", borderWidth: 1.5, borderRadius: 4 }]
        },
        options: opzioniBarreCategorie()
    });
}

function disegnaGraficoUscite(transazioni) {
    const uscite = transazioni.filter(t => !t.is_entrata);
    const perCat = aggregaPerCategoria(uscite);
    const canvas = document.getElementById("chart-uscite");
    if (chartUscite) { chartUscite.destroy(); chartUscite = null; }

    if (!perCat.length) {
        chartUscite = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: { labels: ["—"], datasets: [{ data: [0], backgroundColor: "rgba(240,104,128,0.15)", borderColor: "rgba(240,104,128,0.3)", borderWidth: 1.5, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 4,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: "#8c87a8", font: { family: "Inter", size: 11 } } },
                    y: { grid: { color: "rgba(255,255,255,0.04)" }, min: 0, max: 1, ticks: { color: "#8c87a8", font: { family: "Inter", size: 10 }, callback: v => formatValuta(v) } }
                }
            }
        });
        return;
    }

    chartUscite = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels: perCat.map(c => c.nome),
            datasets: [{ data: perCat.map(c => c.totale), backgroundColor: "rgba(240,104,128,0.7)", borderColor: "#f06880", borderWidth: 1.5, borderRadius: 4 }]
        },
        options: opzioniBarreCategorie()
    });
}

function opzioniBarreCategorie() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${formatValuta(ctx.parsed.y)}` } }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: "#8c87a8", font: { family: "Inter", size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 }
            },
            y: {
                grid: { color: "rgba(255,255,255,0.04)" },
                ticks: { color: "#8c87a8", font: { family: "Inter", size: 10 }, callback: v => formatValuta(v) }
            }
        }
    };
}

// ==========================================
//   UTILITY
// ==========================================

function aggregaPerCategoria(transazioni) {
    const map = {};
    transazioni.forEach(t => {
        const nome = t.categoria.nome;
        if (!map[nome]) map[nome] = 0;
        map[nome] += t.soldi;
    });
    return Object.entries(map)
        .map(([nome, totale]) => ({ nome, totale: parseFloat(totale.toFixed(2)) }))
        .sort((a, b) => b.totale - a.totale);
}

function campionaIndici(valori, N) {
    const len = valori.length;
    if (len <= N) return valori.map((_, i) => i);
    const iMin = valori.indexOf(Math.min(...valori));
    const iMax = valori.indexOf(Math.max(...valori));
    const obbligatori = new Set([0, len - 1, iMin, iMax]);
    const nLiberi = Math.max(0, N - obbligatori.size);
    if (nLiberi > 0) {
        const step = (len - 1) / (nLiberi + 1);
        for (let i = 1; i <= nLiberi; i++) obbligatori.add(Math.round(i * step));
    }
    return [...obbligatori].sort((a, b) => a - b);
}

function formatValuta(n) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function formatImporto(n) {
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

function dateToStringLocale(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDataBreve(date) {
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ==========================================
//   SISTEMA FILTRI
// ==========================================

const filtriAttivi = {
    tipo: null,
    categoria: null,
    importoMin: null,
    importoMax: null,
    dataInizio: null,
    dataFine: null
};

function inizializzaFiltri() {

    const fpFiltroData = flatpickr("#data-range-filtro", {
        mode: "single",
        dateFormat: "Y-m-d",
        locale: "it",
        positionElement: document.querySelector("#filtro-data .filtro-btn"),
        onMonthChange: adattaLarghezzaMese,

        onReady(selectedDates, dateStr, instance) {
            const toolbar = document.createElement("div");
            toolbar.style.cssText = `display:flex;gap:6px;padding:8px 8px 4px 8px;justify-content:center;flex-wrap:wrap;`;

            const stileAttivo   = `flex:1;min-width:60px;padding:5px 8px;font-size:0.78rem;font-family:'Inter',sans-serif;border-radius:6px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:500;`;
            const stileInattivo = `flex:1;min-width:60px;padding:5px 8px;font-size:0.78rem;font-family:'Inter',sans-serif;border-radius:6px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-weight:400;`;

            const btnEsatta = Object.assign(document.createElement("button"), { textContent: "Giorno" });
            const btnRange  = Object.assign(document.createElement("button"), { textContent: "Più giorni" });
            const btnMese   = Object.assign(document.createElement("button"), { textContent: "Mese" });
            const btnAnno   = Object.assign(document.createElement("button"), { textContent: "Anno" });
            btnEsatta.style.cssText = stileAttivo;
            [btnRange, btnMese, btnAnno].forEach(b => b.style.cssText = stileInattivo);
            const tutti = [btnEsatta, btnRange, btnMese, btnAnno];

            const selectPanel = document.createElement("div");
            selectPanel.style.cssText = `display:none;padding:8px 8px 4px 8px;gap:6px;flex-direction:column;`;

            const mesiNomi     = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
            const annoCorrente = new Date().getFullYear();
            const stileSelect  = `width:100%;background:var(--bg-secondary);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--text-primary);font-size:0.85rem;padding:6px 8px;font-family:'Inter',sans-serif;outline:none;appearance:none;-webkit-appearance:none;`;

            const selectMese = document.createElement("select");
            mesiNomi.forEach((nome, i) => { const o = document.createElement("option"); o.value = i+1; o.textContent = nome; selectMese.appendChild(o); });
            selectMese.value = new Date().getMonth() + 1;
            selectMese.style.cssText = stileSelect;

            const selectAnnoMese = document.createElement("select");
            const selectAnnoAnno = document.createElement("select");
            for (let y = annoCorrente; y >= annoCorrente - 10; y--) {
                const o1 = document.createElement("option"); o1.value = y; o1.textContent = y; selectAnnoMese.appendChild(o1);
                const o2 = document.createElement("option"); o2.value = y; o2.textContent = y; selectAnnoAnno.appendChild(o2);
            }
            selectAnnoMese.style.cssText = stileSelect;
            selectAnnoAnno.style.cssText = stileSelect;

            let modalita = "giorno";

            function impostaModalita(nuova) {
                modalita = nuova;
                tutti.forEach(b => b.style.cssText = stileInattivo);
                ({ giorno: btnEsatta, range: btnRange, mese: btnMese, anno: btnAnno }[modalita]).style.cssText = stileAttivo;

                const calDays  = instance.calendarContainer.querySelector(".flatpickr-innerContainer");
                const monthNav = instance.calendarContainer.querySelector(".flatpickr-months");

                if (modalita === "mese" || modalita === "anno") {
                    calDays.style.display  = "none";
                    monthNav.style.display = "none";
                    selectPanel.style.display = "flex";
                    selectPanel.innerHTML = "";
                    if (modalita === "mese") { selectPanel.appendChild(selectMese); selectPanel.appendChild(selectAnnoMese); }
                    else { selectPanel.appendChild(selectAnnoAnno); }

                    const btnApplica = document.createElement("button");
                    btnApplica.textContent = "Applica";
                    btnApplica.style.cssText = `width:100%;margin-top:4px;padding:7px 8px;font-size:0.82rem;font-family:'Inter',sans-serif;border-radius:6px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:500;`;
                    btnApplica.addEventListener("click", e => { e.stopPropagation(); modalita === "mese" ? applicaFiltroMese() : applicaFiltroAnno(); });
                    selectPanel.appendChild(btnApplica);
                } else {
                    calDays.style.display  = "";
                    monthNav.style.display = "";
                    selectPanel.style.display = "none";
                    instance.set("mode", modalita === "range" ? "range" : "single");
                    instance.clear();
                }
            }

            function applicaFiltroMese() {
                const mese   = parseInt(selectMese.value);
                const anno   = parseInt(selectAnnoMese.value);
                const ultimo = new Date(anno, mese, 0).getDate();
                filtriAttivi.dataInizio = `${anno}-${String(mese).padStart(2,"0")}-01`;
                filtriAttivi.dataFine   = `${anno}-${String(mese).padStart(2,"0")}-${ultimo}`;
                impostaFiltroAttivo("filtro-data", `${mesiNomi[mese-1]} ${anno}`);
                applicaFiltri();
                ignoraOnClose = true;
                instance.close();
            }

            function applicaFiltroAnno() {
                const anno = parseInt(selectAnnoAnno.value);
                filtriAttivi.dataInizio = `${anno}-01-01`;
                filtriAttivi.dataFine   = `${anno}-12-31`;
                impostaFiltroAttivo("filtro-data", `${anno}`);
                applicaFiltri();
                ignoraOnClose = true;
                instance.close();
            }

            btnEsatta.addEventListener("click", e => { e.stopPropagation(); impostaModalita("giorno"); });
            btnRange.addEventListener("click",  e => { e.stopPropagation(); impostaModalita("range"); });
            btnMese.addEventListener("click",   e => { e.stopPropagation(); impostaModalita("mese"); });
            btnAnno.addEventListener("click",   e => { e.stopPropagation(); impostaModalita("anno"); });

            tutti.forEach(b => toolbar.appendChild(b));
            instance.calendarContainer.append(toolbar);
            instance.calendarContainer.append(selectPanel);

            setTimeout(() => {
                adattaLarghezzaMese();
                trasformaAnnoInSelect(instance);
            }, 0);
        },

        onClose(selectedDates) {
            if (ignoraOnClose) { ignoraOnClose = false; return; }
            if (selectedDates.length >= 1) {
                filtriAttivi.dataInizio = dateToStringLocale(selectedDates[0]);
                filtriAttivi.dataFine   = selectedDates.length === 2 ? dateToStringLocale(selectedDates[1]) : filtriAttivi.dataInizio;
                const soloUnGiorno = filtriAttivi.dataInizio === filtriAttivi.dataFine;
                const label = soloUnGiorno
                    ? formatDataBreve(selectedDates[0])
                    : `${formatDataBreve(selectedDates[0])} – ${formatDataBreve(selectedDates[1])}`;
                impostaFiltroAttivo("filtro-data", label);
                applicaFiltri();
            }
        }
    });

    let ignoraOnClose = false;

    document.querySelector("#filtro-data .filtro-btn").addEventListener("click", e => {
        e.stopPropagation();
        if (document.getElementById("filtro-data").classList.contains("attivo")) azzeraFiltro("filtro-data");
        else fpFiltroData.open();
    });

    document.querySelectorAll('input[name="tipo-filtro"]').forEach(radio => {
        radio.addEventListener("change", () => {
            const val = radio.value;
            if (val === "") azzeraFiltro("filtro-tipo");
            else {
                filtriAttivi.tipo = val;
                impostaFiltroAttivo("filtro-tipo", val === "true" ? "Entrata" : "Uscita");
                applicaFiltri();
            }
            chiudiTuttiIPannelli();
        });
    });

    document.querySelector(".btn-applica-importo").addEventListener("click", () => {
        const min = document.getElementById("importo-min").value;
        const max = document.getElementById("importo-max").value;
        if (!min && !max) {
            azzeraFiltro("filtro-importo");
        } else {
            filtriAttivi.importoMin = min !== "" ? parseFloat(min) : null;
            filtriAttivi.importoMax = max !== "" ? parseFloat(max) : null;
            const label = min && max ? `${min} – ${max} €` : min ? `da ${min} €` : `fino a ${max} €`;
            impostaFiltroAttivo("filtro-importo", label);
            applicaFiltri();
        }
        chiudiTuttiIPannelli();
    });

    document.querySelectorAll(".filtro:not(#filtro-data) .filtro-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const filtroId  = btn.closest(".filtro").id;
            const eraAperto = btn.closest(".filtro").classList.contains("aperto");
            if (btn.closest(".filtro").classList.contains("attivo")) { azzeraFiltro(filtroId); return; }
            chiudiTuttiIPannelli();
            if (!eraAperto) btn.closest(".filtro").classList.add("aperto");
        });
    });

    document.addEventListener("click", chiudiTuttiIPannelli);
    document.querySelectorAll(".filtro-pannello").forEach(p => p.addEventListener("click", e => e.stopPropagation()));

    popolaCategorieNelFiltro();
}

function popolaCategorieNelFiltro() {
    const container = document.getElementById("lista-categorie-filtro");
    container.innerHTML = "";

    const labelTutte = document.createElement("label");
    labelTutte.innerHTML = `<input type="radio" name="cat-filtro" value=""> Tutte`;
    labelTutte.querySelector("input").checked = true;
    container.appendChild(labelTutte);

    categorieEntrate.filter(cat => !isCategoriaNascosta(cat.nome)).forEach(cat => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="radio" name="cat-filtro" value="${cat.id}"> ${cat.nome}`;
        container.appendChild(label);
    });

    categorieUscite.filter(cat => !isCategoriaNascosta(cat.nome)).forEach(cat => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="radio" name="cat-filtro" value="${cat.id}"> ${cat.nome}`;
        container.appendChild(label);
    });

    container.querySelectorAll("input[type='radio']").forEach(radio => {
        radio.addEventListener("change", () => {
            if (radio.value === "") azzeraFiltro("filtro-categoria");
            else {
                filtriAttivi.categoria = parseInt(radio.value);
                impostaFiltroAttivo("filtro-categoria", radio.parentElement.textContent.trim());
                applicaFiltri();
            }
            chiudiTuttiIPannelli();
        });
    });
}

function applicaFiltri() {
    let risultati = [...tutteLeTransazioni];
    if (filtriAttivi.tipo !== null)       risultati = risultati.filter(t => t.is_entrata === (filtriAttivi.tipo === "true"));
    if (filtriAttivi.categoria !== null)  risultati = risultati.filter(t => t.id_categoria === filtriAttivi.categoria);
    if (filtriAttivi.importoMin !== null) risultati = risultati.filter(t => t.soldi >= filtriAttivi.importoMin);
    if (filtriAttivi.importoMax !== null) risultati = risultati.filter(t => t.soldi <= filtriAttivi.importoMax);
    if (filtriAttivi.dataInizio !== null) risultati = risultati.filter(t => t.data.slice(0,10) >= filtriAttivi.dataInizio);
    if (filtriAttivi.dataFine !== null)   risultati = risultati.filter(t => t.data.slice(0,10) <= filtriAttivi.dataFine);
    renderTransazioni(risultati);
}

function impostaFiltroAttivo(filtroId, testo) {
    const filtroEl = document.getElementById(filtroId);
    filtroEl.classList.add("attivo");
    filtroEl.classList.remove("aperto");
    filtroEl.querySelector(".filtro-btn").textContent = "×";
    filtroEl.querySelector(".filtro-btn").title = testo;
    const valoreEl = document.getElementById("valore-" + filtroId);
    if (valoreEl) valoreEl.textContent = testo;
}

function azzeraFiltro(filtroId) {
    const filtroEl = document.getElementById(filtroId);
    filtroEl.classList.remove("attivo", "aperto");
    filtroEl.querySelector(".filtro-btn").textContent = "↓";
    filtroEl.querySelector(".filtro-btn").title = "";

    switch (filtroId) {
        case "filtro-tipo":
            filtriAttivi.tipo = null;
            document.querySelector('input[name="tipo-filtro"][value=""]').checked = true;
            break;
        case "filtro-categoria":
            filtriAttivi.categoria = null;
            const primaCat = document.querySelector('input[name="cat-filtro"][value=""]');
            if (primaCat) primaCat.checked = true;
            break;
        case "filtro-importo":
            filtriAttivi.importoMin = null;
            filtriAttivi.importoMax = null;
            document.getElementById("importo-min").value = "";
            document.getElementById("importo-max").value = "";
            break;
        case "filtro-data":
            filtriAttivi.dataInizio = null;
            filtriAttivi.dataFine   = null;
            document.querySelector("#data-range-filtro")._flatpickr?.clear();
            break;
    }

    const valoreEl = document.getElementById("valore-" + filtroId);
    if (valoreEl) valoreEl.textContent = "";
    applicaFiltri();
}

function chiudiTuttiIPannelli() {
    document.querySelectorAll(".filtro.aperto").forEach(f => f.classList.remove("aperto"));
}


function adattaLarghezzaMese() {
    const selects = document.querySelectorAll(".flatpickr-monthDropdown-months");
    selects.forEach(select => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = "600 0.88rem Inter, sans-serif";
        const testo = select.options[select.selectedIndex]?.text || "";
        const larghezza = ctx.measureText(testo).width;
        select.style.width = (larghezza + 24) + "px"; // 24px = padding laterale (2x 12px)
    });
}

function trasformaAnnoInSelect(instance) {
    const wrapper = instance.calendarContainer.querySelector(".numInputWrapper");
    if (!wrapper || wrapper.dataset.selectified) return;
    wrapper.dataset.selectified = "true";

    const inputAnno = wrapper.querySelector("input.cur-year");
    const annoCorrente = new Date().getFullYear();
    const annoSelezionato = parseInt(inputAnno.value);

    const select = document.createElement("select");
    select.style.cssText = `
        background: transparent;
        border: none;
        color: var(--accent);
        font-family: 'Inter', sans-serif;
        font-size: 0.88rem;
        font-weight: 600;
        outline: none;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
    `;

    for (let y = annoCorrente + 2; y >= annoCorrente - 10; y--) {
        const o = document.createElement("option");
        o.value = y;
        o.textContent = y;
        if (y === annoSelezionato) o.selected = true;
        select.appendChild(o);
    }

    select.addEventListener("change", () => {
        instance.changeYear(parseInt(select.value));
    });

    // Nasconde l'input originale e inserisce la select
    inputAnno.style.display = "none";
    wrapper.appendChild(select);

    // Aggiorna la select quando flatpickr cambia anno internamente
    instance.config.onYearChange = instance.config.onYearChange || [];
    instance.config.onYearChange.push(() => {
        select.value = instance.currentYear;
    });
}
// ==========================================
//   MODALE NUOVA CATEGORIA
// ==========================================

function apriModaleCategoria(tipo) {
    return new Promise((resolve) => {
        const modal    = document.getElementById("modal-nuova-categoria");
        const input    = document.getElementById("input-nuova-categoria");
        const btnSalva = document.getElementById("btn-salva-categoria");
        const btnAnn   = document.getElementById("btn-annulla-categoria");
        const sub      = document.getElementById("modal-categoria-sottotitolo");

        sub.textContent = `Categoria di ${tipo === "entrata" ? "entrata" : "uscita"}.`;
        input.value = "";
        modal.style.display = "flex";
        setTimeout(() => input.focus(), 50);

        function chiudi(valore) {
            modal.style.display = "none";
            btnSalva.removeEventListener("click", onSalva);
            btnAnn.removeEventListener("click", onAnnulla);
            document.removeEventListener("keydown", onKeydown);
            resolve(valore);
        }

        function onSalva() { chiudi(input.value.trim()); }
        function onAnnulla() { chiudi(null); }
        function onKeydown(e) {
            if (e.key === "Enter") chiudi(input.value.trim());
            if (e.key === "Escape") chiudi(null);
        }

        btnSalva.addEventListener("click", onSalva);
        btnAnn.addEventListener("click", onAnnulla);
        document.addEventListener("keydown", onKeydown);
    });
}
