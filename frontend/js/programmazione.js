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

    // Flatpickr data — stesso stile della pagina principale
    flatpickr("#prog-data", {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d-m-Y",
        locale: "it",
        position: "auto center",
        defaultDate: "today",
        minDate: "today"  // solo date future o oggi
    });

    // Carica lista ricorrenti
    await caricaProgrammate();

    // Aggiungi nuova ricorrente
    document.getElementById("btn-aggiungi-programmata").addEventListener("click", async () => {
        const nome       = document.getElementById("prog-nome").value.trim();
        const importo    = parseFloat(document.getElementById("prog-importo").value);
        const isEntrata  = document.getElementById("prog-tipo").value === "true";
        const frequenza  = document.getElementById("prog-frequenza").value;
        const dataInizio = document.getElementById("prog-data").value;

        if (!nome || !importo || !dataInizio) {
            alert("Compila tutti i campi!");
            return;
        }

        const btn = document.getElementById("btn-aggiungi-programmata");
        btn.disabled = true;
        btn.textContent = "Salvataggio...";

        try {
            await addProgrammata({
                nome,
                soldi:       importo,
                is_entrata:  isEntrata,
                frequenza,
                data_inizio: dataInizio
            });

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
//   CARICA E RENDERIZZA LISTA
// ==========================================
async function caricaProgrammate() {
    try {
        const dati = await getProgrammate();
        renderLista("lista-ricorrenti", dati);
    } catch(e) {
        console.error("Errore caricamento programmate", e);
    }
}

function renderLista(containerId, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `<p class="lista-vuota">Nessuna transazione ricorrente</p>`;
        return;
    }

    items.forEach(p => {
        const card = document.createElement("div");
        card.className = "card-programmata";

        const segno     = p.is_entrata ? "+" : "-";
        const classeImp = p.is_entrata ? "positivo" : "negativo";
        const freq      = capitalizza(p.frequenza);
        const dataPross = new Date(p.data_prossima + "T12:00:00").toLocaleDateString("it-IT");

        card.innerHTML = `
            <div class="card-programmata-info">
                <span class="card-programmata-nome">${p.nome}</span>
                <span class="card-programmata-dettagli">Prossimo addebito: ${dataPross}</span>
            </div>
            <span class="card-programmata-freq">${freq}</span>
            <span class="card-programmata-importo ${classeImp}">${segno}${formatImportoProg(p.soldi)} €</span>
            <button class="btn-elimina-programmata" data-id="${p.id}">Elimina</button>
        `;

        card.querySelector(".btn-elimina-programmata").addEventListener("click", async (e) => {
            if (!confirm(`Eliminare "${p.nome}"?`)) return;
            await deleteProgrammata(e.target.dataset.id);
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