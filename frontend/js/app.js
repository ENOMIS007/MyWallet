// ==========================================
//   STATO GLOBALE
// ==========================================

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

// ==========================================
//   INIT
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    // ── LOGOUT ──────────────────────────────────
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

    flatpickr("#data", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d-m-Y",
        locale: "it",
        position: "auto center",
        defaultDate: "today",
        onReady: (sd, ds, instance) => {
            setTimeout(() => {
                adattaLarghezzaMese();
                trasformaAnnoInSelect(instance);
            }, 0);
        },
        onMonthChange: adattaLarghezzaMese
    });

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
            caricaTransazioni(),
            applicaProgrammate()  // applica le transazioni programmate scadute
        ]);
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
            const nuovoNome = prompt("Nome della nuova categoria:");
            if (nuovoNome && nuovoNome.trim() !== "") {
                const isEntrata = document.getElementById("tipo").value === "true";
                const tempId = Date.now();
                if (isEntrata) categorieEntrate.push({ id: tempId, nome: nuovoNome.trim() });
                else           categorieUscite.push({ id: tempId, nome: nuovoNome.trim() });
                aggiornaSelectCategorie(tempId);
                addCategoria(nuovoNome.trim(), isEntrata).then(realCat => {
                    const lista = isEntrata ? categorieEntrate : categorieUscite;
                    const cat   = lista.find(c => c.id === tempId);
                    if (cat) cat.id = Array.isArray(realCat) ? realCat[0].id : realCat.id;
                    localStorage.setItem('cache_categorie', JSON.stringify({ entrate: categorieEntrate, uscite: categorieUscite }));
                    // Aggiorna la select con l'ID reale
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
    
    btn.onclick = async () => {
        const val = parseFloat(input.value) || 0;
        const isEntrata = val >= 0;
        const importo = Math.abs(val);
        
        btn.disabled = true;
        btn.textContent = "Salvataggio...";
        
        try {
            // Controlla se esiste già una categoria "Saldo Iniziale" del tipo corretto
            const listCat = isEntrata ? categorieEntrate : categorieUscite;
            let cat = listCat.find(c => c.nome.toLowerCase() === "saldo iniziale");
            
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

    filtrate.forEach(cat => {
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
    let dataInizio;
    if (periodo === "settimana") {
        dataInizio = new Date(oggi);
        dataInizio.setDate(oggi.getDate() - 6);
    } else if (periodo === "mese") {
        dataInizio = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    } else {
        dataInizio = new Date(oggi.getFullYear(), 0, 1);
    }

    const inizioStr = dateToStringLocale(dataInizio);
    const fineStr   = dateToStringLocale(oggi);
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
    if (chartDoughnut) { chartDoughnut.destroy(); chartDoughnut = null; }

    if (!totEntrate && !totUscite) {
        chartDoughnut = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: ["Entrate", "Uscite"],
                datasets: [{ data: [1, 1], backgroundColor: ["rgba(62,207,142,0.15)", "rgba(240,104,128,0.15)"], borderColor: ["rgba(62,207,142,0.3)", "rgba(240,104,128,0.3)"], borderWidth: 1.5 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "68%",
                plugins: {
                    legend: { position: "bottom", labels: { color: "#8c87a8", font: { family: "Inter", size: 11 }, padding: 16, boxWidth: 12, boxHeight: 12 } },
                    tooltip: { enabled: false }
                }
            }
        });
        return;
    }

    chartDoughnut = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Entrate", "Uscite"],
            datasets: [{
                data: [totEntrate, totUscite],
                backgroundColor: ["rgba(62,207,142,0.85)", "rgba(240,104,128,0.85)"],
                borderColor: ["#3ecf8e", "#f06880"],
                borderWidth: 1.5,
                hoverOffset: 6
            }]
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
    if (chartAndamento) { chartAndamento.destroy(); chartAndamento = null; }

    const mostraAnno = periodoAttivo === "anno" || periodoAttivo === "tutto";

    if (!transazioni.length) {
        chartAndamento = new Chart(ctx, {
            type: "line",
            data: {
                labels: [dateToStringLocale(new Date())],
                datasets: [
                    { label: "Entrate", data: [0], borderColor: "#3ecf8e", backgroundColor: "rgba(62,207,142,0.08)", borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4 },
                    { label: "Uscite",  data: [0], borderColor: "#f06880", backgroundColor: "rgba(240,104,128,0.08)", borderWidth: 2, pointRadius: 3, fill: true, tension: 0.4 }
                ]
            },
            options: opzioniLineaAndamento(mostraAnno)
        });
        return;
    }

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

    const indiciE = campionaIndici(valEntrate, 16);
    const indiciU = campionaIndici(valUscite, 16);
    const indici  = [...new Set([...indiciE, ...indiciU])].sort((a, b) => a - b);

    const toLabel = g => {
        const d = new Date(g + "T12:00:00");
        return mostraAnno
            ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" })
            : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    };

    chartAndamento = new Chart(ctx, {
        type: "line",
        data: {
            labels: indici.map(i => toLabel(giorniTutti[i])),
            datasets: [
                { label: "Entrate", data: indici.map(i => valEntrate[i]), borderColor: "#3ecf8e", backgroundColor: "rgba(62,207,142,0.08)", borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, fill: true, tension: 0.4 },
                { label: "Uscite",  data: indici.map(i => valUscite[i]),  borderColor: "#f06880", backgroundColor: "rgba(240,104,128,0.08)", borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, fill: true, tension: 0.4 }
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

    categorieEntrate.forEach(cat => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="radio" name="cat-filtro" value="${cat.id}"> ${cat.nome}`;
        container.appendChild(label);
    });

    categorieUscite.forEach(cat => {
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


// ── FLATPICKR: adatta larghezza select mese al testo ──
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

// ── FLATPICKR: sostituisce input anno con select ──
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