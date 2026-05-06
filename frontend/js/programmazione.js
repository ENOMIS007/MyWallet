// ==========================================
//   STATO
// ==========================================

let programmateCache = [];   // tutte le transazioni programmate caricate
let calAnno  = new Date().getFullYear();
let calMese  = new Date().getMonth();  // 0-based

// ==========================================
//   INIT
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {

    // ── Email header ─────────────────────────
    const emailEl = document.getElementById("header-email");
    if (emailEl) emailEl.textContent = localStorage.getItem("user_email") || "";

    // ── Flatpickr data nella modale ──────────
    flatpickr("#prog-data", {
        dateFormat: "Y-m-d",
        altInput:   true,
        altFormat:  "d-m-Y",
        locale:     "it",
        position:   "auto center",
        defaultDate: "today",
        minDate:    "today"
    });

    // ── Carica dati iniziali ─────────────────
    await caricaProgrammate();

    // ── Navigazione calendario ───────────────
    document.getElementById("cal-prev").addEventListener("click", () => {
        calMese--;
        if (calMese < 0) { calMese = 11; calAnno--; }
        renderCalendario();
    });

    document.getElementById("cal-next").addEventListener("click", () => {
        calMese++;
        if (calMese > 11) { calMese = 0; calAnno++; }
        renderCalendario();
    });

    // ── Modale: apri ────────────────────────
    document.getElementById("btn-apri-modale-prog").addEventListener("click", () => {
        apriModale();
    });

    // ── Modale: annulla ──────────────────────
    document.getElementById("btn-annulla-prog").addEventListener("click", chiudiModale);

    // ── Modale: click fuori chiude ───────────
    document.getElementById("modal-nuova-programmata").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) chiudiModale();
    });

    // ── Modale: salva ────────────────────────
    document.getElementById("btn-salva-prog").addEventListener("click", handleSalva);

    // ── Invio con Enter nella modale ─────────
    document.getElementById("modal-nuova-programmata").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSalva();
        if (e.key === "Escape") chiudiModale();
    });
});

// ==========================================
//   CARICA PROGRAMMATE DAL SERVER
// ==========================================

async function caricaProgrammate() {
    try {
        programmateCache = await getProgrammate();
    } catch (e) {
        console.error("Errore caricamento programmate", e);
        programmateCache = [];
    }
    renderCalendario();
    renderLista();
}

// ==========================================
//   CALENDARIO
// ==========================================

/**
 * Costruisce una mappa  "YYYY-MM-DD" → [array di programmata]
 * per il mese visualizzato, usando data_prossima come riferimento
 * e proiettando ogni ricorrenza su tutti i giorni del mese in cui cade.
 */
function buildEventMap(anno, mese) {
    const map = {};

    const primoGiorno  = new Date(anno, mese, 1, 0, 0, 0);
    const ultimoGiorno = new Date(anno, mese + 1, 0, 23, 59, 59); // fine giornata dell'ultimo giorno

    programmateCache.forEach(p => {
        // Genera tutte le occorrenze della programmata che cadono nel mese
        const occorrenze = getOccorrenzeNelMese(p, primoGiorno, ultimoGiorno);
        occorrenze.forEach(dateStr => {
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push(p);
        });
    });

    return map;
}

/**
 * Dato una programmata, restituisce un array di stringhe "YYYY-MM-DD"
 * corrispondenti alle occorrenze che cadono nell'intervallo [da, a].
 */
function getOccorrenzeNelMese(p, da, a) {
    const risultati = [];

    // Partiamo dalla data_inizio oppure dalla data_prossima (la prima disponibile)
    let corrente = new Date(p.data_inizio + "T00:00:00"); // mezzanotte, coerente con da/a

    // Se la data di inizio è successiva al mese visualizzato, non c'è nulla
    if (corrente > a) return risultati;

    // Avanziamo fino alla prima occorrenza che tocca o supera l'inizio del mese
    while (corrente < da) {
        corrente = avanzaData(corrente, p.frequenza);
    }

    // Raccogliamo tutte le occorrenze dentro il mese
    while (corrente <= a) {
        risultati.push(dateToStr(corrente));
        corrente = avanzaData(corrente, p.frequenza);
    }

    return risultati;
}

/** Avanza una data di una unità in base alla frequenza */
function avanzaData(data, frequenza) {
    const d = new Date(data);
    switch (frequenza) {
        case "giornaliera":
            d.setDate(d.getDate() + 1);
            break;
        case "settimanale":
            d.setDate(d.getDate() + 7);
            break;
        case "mensile":
            d.setMonth(d.getMonth() + 1);
            break;
        case "annuale":
            d.setFullYear(d.getFullYear() + 1);
            break;
    }
    return d;
}

/** Renderizza il calendario per il mese calAnno/calMese */
function renderCalendario() {
    // ── Titolo ───────────────────────────────
    const nomiMesi = [
        "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
        "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"
    ];
    document.getElementById("cal-title").textContent = `${nomiMesi[calMese]} ${calAnno}`;

    // ── Mappa eventi del mese ────────────────
    const eventMap = buildEventMap(calAnno, calMese);

    // ── Calcolo giorni da mostrare ───────────
    // Il primo giorno del mese (0=Dom → convertiamo a Lun=0)
    const primoDelMese = new Date(calAnno, calMese, 1);
    let offsetInizio = primoDelMese.getDay() - 1;  // Lunedì = 0
    if (offsetInizio < 0) offsetInizio = 6;         // Domenica → 6

    const giorniNelMese = new Date(calAnno, calMese + 1, 0).getDate();

    // Giorni del mese precedente da mostrare
    const giorniPrecMese = new Date(calAnno, calMese, 0).getDate();

    const oggiStr = dateToStr(new Date());

    // ── Svuota e ricostruisce la griglia ─────
    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // Celle mese precedente (ghost)
    for (let i = offsetInizio - 1; i >= 0; i--) {
        const giorno = giorniPrecMese - i;
        grid.appendChild(creaCella(giorno, "other-month", null, null));
    }

    // Celle mese corrente
    for (let g = 1; g <= giorniNelMese; g++) {
        const dateStr = `${calAnno}-${String(calMese + 1).padStart(2,"0")}-${String(g).padStart(2,"0")}`;
        const eventi  = eventMap[dateStr] || [];
        const isOggi  = dateStr === oggiStr;
        grid.appendChild(creaCella(g, "current-month", eventi, dateStr, isOggi));
    }

    // Celle mese successivo (ghost) per completare l'ultima riga
    const totCelle = offsetInizio + giorniNelMese;
    const rimanenti = totCelle % 7 === 0 ? 0 : 7 - (totCelle % 7);
    for (let i = 1; i <= rimanenti; i++) {
        grid.appendChild(creaCella(i, "other-month", null, null));
    }
}

/** Crea e restituisce un elemento .cal-day */
function creaCella(numero, tipoClasse, eventi, dateStr, isOggi = false) {
    const cell = document.createElement("div");
    cell.className = `cal-day ${tipoClasse}`;
    if (isOggi) cell.classList.add("today");

    // Numero giorno
    const num = document.createElement("span");
    num.className = "cal-day-num";
    num.textContent = numero;
    cell.appendChild(num);

    if (eventi && eventi.length > 0) {
        cell.classList.add("has-events");

        // Pallini colorati (max 4 visibili)
        const dots = document.createElement("div");
        dots.className = "cal-dots";
        const visibili = eventi.slice(0, 4);
        visibili.forEach(ev => {
            const dot = document.createElement("span");
            dot.className = `cal-dot ${ev.is_entrata ? "entrata" : "uscita"}`;
            dots.appendChild(dot);
        });
        if (eventi.length > 4) {
            // Piccolo indicatore "ce ne sono altri"
            const extra = document.createElement("span");
            extra.style.cssText = "font-size:0.5rem;color:var(--text-muted);line-height:1;";
            extra.textContent = `+${eventi.length - 4}`;
            dots.appendChild(extra);
        }
        cell.appendChild(dots);

        // Tooltip
        const tooltip = document.createElement("div");
        tooltip.className = "cal-tooltip";

        const titolo = document.createElement("div");
        titolo.className = "cal-tooltip-title";
        // Formato "3 mag" oppure "15 gen"
        const d = new Date(dateStr + "T12:00:00");
        titolo.textContent = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
        tooltip.appendChild(titolo);

        eventi.forEach(ev => {
            const item = document.createElement("div");
            item.className = "cal-tooltip-item";

            const dot = document.createElement("span");
            dot.className = `cal-tooltip-dot ${ev.is_entrata ? "entrata" : "uscita"}`;

            const nome = document.createElement("span");
            nome.className = "cal-tooltip-nome";
            nome.textContent = ev.nome;

            const importo = document.createElement("span");
            importo.className = `cal-tooltip-importo ${ev.is_entrata ? "positivo" : "negativo"}`;
            importo.textContent = `${ev.is_entrata ? "+" : "-"}${formatImportoProg(ev.soldi)} €`;

            item.appendChild(dot);
            item.appendChild(nome);
            item.appendChild(importo);
            tooltip.appendChild(item);
        });

        cell.appendChild(tooltip);
    }

    return cell;
}

// ==========================================
//   LISTA RICORRENTI
// ==========================================

function renderLista() {
    const container = document.getElementById("lista-ricorrenti");
    container.innerHTML = "";

    if (!programmateCache.length) {
        container.innerHTML = `<p class="lista-vuota">Nessuna transazione programmata</p>`;
        return;
    }

    // Ordina per data_prossima ascendente
    const ordinate = [...programmateCache].sort((a, b) =>
        a.data_prossima.localeCompare(b.data_prossima)
    );

    ordinate.forEach(p => {
        const card = document.createElement("div");
        card.className = "card-programmata";

        const segno     = p.is_entrata ? "+" : "-";
        const classeImp = p.is_entrata ? "positivo" : "negativo";

        card.innerHTML = `
            <div class="card-programmata-info">
                <span class="card-programmata-nome">${p.nome}</span>
                <span class="card-programmata-ricorrenza">${labelRicorrenza(p)}</span>
            </div>
            <span class="card-programmata-freq">${capitalizza(p.frequenza)}</span>
            <span class="card-programmata-importo ${classeImp}">
                ${segno}${formatImportoProg(p.soldi)} €
            </span>
            <button class="btn-elimina-programmata" data-id="${p.id}">Elimina</button>
        `;

        card.querySelector(".btn-elimina-programmata").addEventListener("click", async (e) => {
            if (!confirm(`Eliminare "${p.nome}"?`)) return;
            try {
                await deleteProgrammata(e.target.dataset.id);
                await caricaProgrammate();
            } catch (err) {
                alert("Errore durante l'eliminazione.");
                console.error(err);
            }
        });

        container.appendChild(card);
    });
}

/**
 * Genera una stringa leggibile per la ricorrenza.
 * Esempi:
 *   giornaliera  → "ogni giorno"
 *   settimanale  → "ogni lunedì"   (giorno della settimana da data_inizio)
 *   mensile      → "ogni mese il 15"
 *   annuale      → "ogni anno il 3 gen"
 */
function labelRicorrenza(p) {
    const data = new Date(p.data_inizio + "T12:00:00");

    switch (p.frequenza) {
        case "giornaliera":
            return "ogni giorno";

        case "settimanale": {
            const giorni = ["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
            return `ogni ${giorni[data.getDay()]}`;
        }

        case "mensile":
            return `ogni mese il ${data.getDate()}`;

        case "annuale": {
            const mesi = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
            return `ogni anno il ${data.getDate()} ${mesi[data.getMonth()]}`;
        }

        default:
            return capitalizza(p.frequenza);
    }
}

// ==========================================
//   MODALE
// ==========================================

function apriModale() {
    // Reset campi
    document.getElementById("prog-nome").value    = "";
    document.getElementById("prog-importo").value = "";
    document.getElementById("prog-tipo").value     = "false";
    document.getElementById("prog-frequenza").value = "mensile";

    // Reset flatpickr alla data odierna
    const fp = document.querySelector("#prog-data")._flatpickr;
    if (fp) fp.setDate(new Date());

    document.getElementById("modal-nuova-programmata").style.display = "flex";
    setTimeout(() => document.getElementById("prog-nome").focus(), 80);
}

function chiudiModale() {
    document.getElementById("modal-nuova-programmata").style.display = "none";
}

async function handleSalva() {
    const nome       = document.getElementById("prog-nome").value.trim();
    const importo    = parseFloat(document.getElementById("prog-importo").value);
    const isEntrata  = document.getElementById("prog-tipo").value === "true";
    const frequenza  = document.getElementById("prog-frequenza").value;
    const dataInizio = document.getElementById("prog-data").value;

    if (!nome) {
        document.getElementById("prog-nome").focus();
        return;
    }
    if (!importo || importo <= 0) {
        document.getElementById("prog-importo").focus();
        return;
    }
    if (!dataInizio) {
        return;
    }

    const btn = document.getElementById("btn-salva-prog");
    btn.disabled    = true;
    btn.textContent = "Salvataggio…";

    try {
        await addProgrammata({
            nome,
            soldi:       importo,
            is_entrata:  isEntrata,
            frequenza,
            data_inizio: dataInizio
        });
        chiudiModale();
        await caricaProgrammate();
    } catch (e) {
        alert("Errore durante il salvataggio.");
        console.error(e);
    } finally {
        btn.disabled    = false;
        btn.textContent = "Aggiungi";
    }
}

// ==========================================
//   UTILITY
// ==========================================

function capitalizza(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatImportoProg(n) {
    return Number.isInteger(n) ? n.toString() : parseFloat(n).toFixed(2);
}

/** Converte un oggetto Date in "YYYY-MM-DD" senza problemi di fuso orario */
function dateToStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}