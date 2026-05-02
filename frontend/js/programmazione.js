// ==========================================
//   STATO
// ==========================================
let categorieEntrateProg = [];
let categorieUsciteProg  = [];

// ==========================================
//   INIT
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {

    // Logout
    document.getElementById("btn-logout").addEventListener("click", async () => {
        await logout();
        window.location.href = "/login.html";
    });

    // Email header
    const emailEl = document.getElementById("header-email");
    if (emailEl) emailEl.textContent = localStorage.getItem("user_email") || "";

    // Flatpickr data
    flatpickr("#prog-data", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d-m-Y",
        locale: "it",
        defaultDate: "today"
    });

    // Toggle frequenza in base a ricorrente/una tantum
    document.getElementById("prog-ricorrente").addEventListener("change", function() {
        const gruppoFreq = document.getElementById("gruppo-frequenza");
        gruppoFreq.style.display = this.value === "true" ? "" : "none";
    });

    // Carica categorie
    try {
        const [entrate, uscite] = await Promise.all([
            getCategorieEntrate(),
            getCategorieUscite()
        ]);
        categorieEntrateProg = entrate;
        categorieUsciteProg  = uscite;
        aggiornaSelectCategorieProg();
    } catch(e) {
        console.error("Errore caricamento categorie", e);
    }

    // Aggiorna categorie al cambio tipo
    document.getElementById("prog-tipo").addEventListener("change", aggiornaSelectCategorieProg);

    // Carica lista programmate
    await caricaProgrammate();

    // Aggiungi nuova programmata
    document.getElementById("btn-aggiungi-programmata").addEventListener("click", async () => {
        const nome        = document.getElementById("prog-nome").value.trim();
        const importo     = parseFloat(document.getElementById("prog-importo").value);
        const isEntrata   = document.getElementById("prog-tipo").value === "true";
        const idCategoria = parseInt(document.getElementById("prog-categoria").value);
        const isRicorrente = document.getElementById("prog-ricorrente").value === "true";
        const frequenza   = isRicorrente ? document.getElementById("prog-frequenza").value : null;
        const dataInizio  = document.getElementById("prog-data").value;

        if (!nome || !importo || !idCategoria || !dataInizio) {
            alert("Compila tutti i campi!");
            return;
        }

        const btn = document.getElementById("btn-aggiungi-programmata");
        btn.disabled = true;
        btn.textContent = "Salvataggio...";

        try {
            await addProgrammata({
                nome,
                soldi:        importo,
                id_categoria: idCategoria,
                is_entrata:   isEntrata,
                is_ricorrente: isRicorrente,
                frequenza,
                data_inizio:  dataInizio
            });

            // Reset form
            document.getElementById("prog-nome").value    = "";
            document.getElementById("prog-importo").value = "";
            document.querySelector("#prog-data")._flatpickr.setDate(new Date());

            await caricaProgrammate();
        } catch(e) {
            alert("Errore durante il salvataggio.");
            console.error(e);
        } finally {
            btn.disabled = false;
            btn.textContent = "Aggiungi";
        }
    });
});

// ==========================================
//   CATEGORIE SELECT
// ==========================================
function aggiornaSelectCategorieProg() {
    const isEntrata = document.getElementById("prog-tipo").value === "true";
    const filtrate  = isEntrata ? categorieEntrateProg : categorieUsciteProg;
    const select    = document.getElementById("prog-categoria");
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value    = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Seleziona categoria";
    select.appendChild(placeholder);

    filtrate.forEach(cat => {
        const option = document.createElement("option");
        option.value       = cat.id;
        option.textContent = cat.nome;
        select.appendChild(option);
    });
}

// ==========================================
//   CARICA E RENDERIZZA LISTA
// ==========================================
async function caricaProgrammate() {
    try {
        const dati = await getProgrammate();
        const ricorrenti = dati.filter(p => p.is_ricorrente);
        const tantum     = dati.filter(p => !p.is_ricorrente);
        renderLista("lista-ricorrenti", ricorrenti, "Nessuna transazione ricorrente");
        renderLista("lista-tantum",     tantum,     "Nessuna transazione una tantum");
    } catch(e) {
        console.error("Errore caricamento programmate", e);
    }
}

function renderLista(containerId, items, testoVuoto) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `<p class="lista-vuota">${testoVuoto}</p>`;
        return;
    }

    items.forEach(p => {
        const card = document.createElement("div");
        card.className = "card-programmata";

        const segno     = p.is_entrata ? "+" : "-";
        const classeImp = p.is_entrata ? "positivo" : "negativo";
        const nomeCateg = p.categoria?.nome || "—";
        const freq      = p.frequenza ? capitalizza(p.frequenza) : "Una tantum";
        const dataPross = new Date(p.data_prossima + "T12:00:00").toLocaleDateString("it-IT");

        card.innerHTML = `
            <div class="card-programmata-info">
                <span class="card-programmata-nome">${p.nome}</span>
                <span class="card-programmata-dettagli">${nomeCateg} · prossima: ${dataPross}</span>
            </div>
            <span class="card-programmata-freq">${freq}</span>
            <span class="card-programmata-importo ${classeImp}">${segno}${formatImportoProg(p.soldi)} €</span>
            <button class="btn-elimina-programmata" data-id="${p.id}">Elimina</button>
        `;

        card.querySelector(".btn-elimina-programmata").addEventListener("click", async (e) => {
            const id = e.target.dataset.id;
            if (!confirm(`Eliminare "${p.nome}"?`)) return;
            await deleteProgrammata(id);
            await caricaProgrammate();
        });

        container.appendChild(card);
    });
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
