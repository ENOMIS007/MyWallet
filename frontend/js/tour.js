
/**
 * TOUR GUIDATO - ONBOARDING
 * Sistema multi-pagina per guidare l'utente alla prima configurazione.
 */

const Tour = {
    // Suddivisione passi per pagina
    steps: {
        "index.html": [
            {
                element: "#sidebar",
                title: "Navigazione",
                description: "Usa la barra laterale per spostarti tra le varie schede e gestire il tuo profilo utente.",
                position: "right"
            },
            {
                element: "#sezione-saldo",
                title: "Il tuo Saldo",
                description: "Qui vedrai sempre la tua situazione finanziaria aggiornata in tempo reale.",
                position: "bottom"
            },
            {
                element: "#sezione-form",
                title: "Nuova Transazione",
                description: "Per registrare una nuova entrata o uscita compila i campi in modalità manuale, oppure scrivi in una frase in modalità automatica e l'IA lo farà al posto tuo.",
                position: "bottom"
            },
            {
                element: "#sezione-grafici",
                title: "Analisi Avanzata",
                description: "Monitora le tue abitudini di spesa con grafici dettagliati per categoria e andamento temporale.",
                position: "top"
            },
            {
                element: "#sezione-storico",
                title: "Storico Movimenti",
                description: "Controlla ogni singola operazione, usa i filtri per trovare ciò che cerchi.",
                position: "top"
            }
        ],
        "programmazione.html": [
            {
                element: "#sezione-calendario",
                title: "Calendario",
                description: "In questa sezione puoi vedere le proiezioni dei tuoi movimenti futuri.",
                position: "bottom"
            },
            {
                element: "#sezione-ricorrenti",
                title: "Ricorrenti",
                description: "Qui puoi vedere tutti i tuoi abbonamenti o entrate fisse (es. Netflix, Affitto, Stipendio).",
                position: "top"
            },
            {
                element: "#btn-apri-modale-prog",
                title: "Programma ora",
                description: "Crea una nuova transazione che si ripete nel tempo in pochi clic.",
                position: "bottom"
            }
        ]
    },
    currentStep: 0,
    currentPage: "",
    overlay: null,
    tooltip: null,

    init() {
        // Determina la pagina attuale
        const path = window.location.pathname;
        this.currentPage = path.substring(path.lastIndexOf('/') + 1) || "index.html";

        // Se siamo su una pagina non prevista o tour già fatto, usciamo
        if (!this.steps[this.currentPage]) return;
        if (localStorage.getItem("mywallet_tour_done") && !localStorage.getItem("mywallet_tour_resume")) return;

        // Verifica se dobbiamo riprendere un tour interrotto (cambio pagina)
        const resume = localStorage.getItem("mywallet_tour_resume");
        if (resume === this.currentPage) {
            localStorage.removeItem("mywallet_tour_resume");
            // Aspettiamo che la pagina sia carica e pronta
            window.addEventListener('load', () => {
                setTimeout(() => this.start(), 800);
            });
        }
    },

    createUI() {
        if (this.overlay) return;

        this.overlay = document.createElement("div");
        this.overlay.className = "tour-overlay";
        document.body.appendChild(this.overlay);

        this.tooltip = document.createElement("div");
        this.tooltip.className = "tour-tooltip";
        this.tooltip.innerHTML = `
            <div class="tour-tooltip-header">
                <span class="tour-step-counter"></span>
                <button class="tour-close">&times;</button>
            </div>
            <div class="tour-title"></div>
            <div class="tour-description"></div>
            <div class="tour-actions">
                <button class="tour-btn-skip">Salta tour</button>
                <button class="tour-btn-next">Avanti</button>
            </div>
        `;
        document.body.appendChild(this.tooltip);

        this.tooltip.querySelector(".tour-btn-next").onclick = () => this.next();
        this.tooltip.querySelector(".tour-btn-skip").onclick = () => this.end();
        this.tooltip.querySelector(".tour-close").onclick = () => this.end();
    },

    start() {
        this.createUI();
        this.currentStep = 0;

        // Piccola pausa per far apparire l'overlay prima del tooltip
        this.overlay.classList.add("attivo");

        setTimeout(() => {
            this.tooltip.classList.add("attivo");
            this.showStep();
        }, 100);
    },

    showStep() {
        const pageSteps = this.steps[this.currentPage];
        const step = pageSteps[this.currentStep];
        const el = document.querySelector(step.element);

        // Effetto dissolvenza testo immediato
        this.tooltip.classList.add("tour-content-fade");
        
        // Rimuovi e aggiungi highlight immediatamente per sincronia
        document.querySelectorAll(".tour-highlight").forEach(e => e.classList.remove("tour-highlight"));

        if (el) {
            el.classList.add("tour-highlight");
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Calcoliamo la posizione e avviamo il movimento quasi subito
            setTimeout(() => {
                const rect = el.getBoundingClientRect();
                let top = 0, left = 0;
                const margin = 20;

                if (step.position === "right") {
                    top = rect.top + (rect.height / 2) - 100;
                    left = rect.right + margin;
                } else if (step.position === "bottom") {
                    top = rect.bottom + margin;
                    left = rect.left + (rect.width / 2) - 160;
                } else if (step.position === "top") {
                    top = rect.top - 200 - margin;
                    left = rect.left + (rect.width / 2) - 160;
                }

                left = Math.max(10, Math.min(left, window.innerWidth - 330));
                top = Math.max(10, Math.min(top, window.innerHeight - 250));

                this.tooltip.style.top = `${top}px`;
                this.tooltip.style.left = `${left}px`;

                // Aggiorna i testi a metà del movimento (dopo 400ms dello 0.8s totale)
                setTimeout(() => {
                    const totalAcrossAll = this.steps["index.html"].length + this.steps["programmazione.html"].length;
                    const currentGlobal = this.currentPage === "index.html" ? this.currentStep + 1 : this.steps["index.html"].length + this.currentStep + 1;

                    this.tooltip.querySelector(".tour-step-counter").textContent = `Passaggio ${currentGlobal} di ${totalAcrossAll}`;
                    this.tooltip.querySelector(".tour-title").textContent = step.title;
                    this.tooltip.querySelector(".tour-description").textContent = step.description;
                    
                    let label = "Avanti";
                    if (this.currentPage === "index.html" && this.currentStep === pageSteps.length - 1) label = "Vai a Programmazione";
                    if (this.currentPage === "programmazione.html" && this.currentStep === pageSteps.length - 1) label = "Fine!";
                    
                    this.tooltip.querySelector(".tour-btn-next").textContent = label;
                    
                    this.tooltip.classList.remove("tour-content-fade");
                }, 400);

            }, 50); // Ritardo minimo per permettere al browser di registrare il cambio highlight
        }
    },

    next() {
        const pageSteps = this.steps[this.currentPage];
        if (this.currentStep < pageSteps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else if (this.currentPage === "index.html") {
            // Cambia pagina e riprendi
            localStorage.setItem("mywallet_tour_resume", "programmazione.html");
            window.location.href = "programmazione.html";
        } else {
            this.end();
        }
    },

    end() {
        if (!this.overlay) return;
        this.overlay.classList.remove("attivo");
        this.tooltip.classList.remove("attivo");
        document.querySelectorAll(".tour-highlight").forEach(e => e.classList.remove("tour-highlight"));
        localStorage.setItem("mywallet_tour_done", "true");
        localStorage.removeItem("mywallet_tour_resume");

        setTimeout(() => {
            if (this.overlay) this.overlay.remove();
            if (this.tooltip) this.tooltip.remove();
            this.overlay = null;
            this.tooltip = null;
        }, 400);
    }
};

// Inizializza subito
Tour.init();
