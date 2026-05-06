
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
                position: "right",
                fixed: true,
                offset: { x: 110, y: 0 }
            },
            {
                element: "#sezione-saldo",
                title: "Il tuo Saldo",
                description: "Qui vedrai sempre la tua situazione finanziaria aggiornata in tempo reale.",
                position: "bottom",
                offset: { x: 0, y: 20 }
            },
            {
                element: "#sezione-form",
                title: "Nuova Transazione",
                description: "Per registrare una nuova entrata o uscita compila i campi in modalità manuale, oppure scrivi in una frase in modalità automatica e l'IA lo farà al posto tuo.",
                position: "bottom",
                offset: { x: 0, y: 20 }
            },
            {
                element: "#sezione-grafici",
                title: "Analisi Avanzata",
                description: "Monitora le tue abitudini di spesa con grafici dettagliati per categoria e andamento temporale.",
                position: "right",
                offset: { x: 880, y: -30 }
            },
            {
                element: "#sezione-storico",
                title: "Storico Movimenti",
                description: "Controlla ogni singola operazione, usa i filtri per trovare ciò che cerchi.",
                position: "top",
                offset: { x: 0, y: -10 }
            }
        ],
        "programmazione.html": [
            {
                element: "#sezione-calendario",
                title: "Calendario",
                description: "In questa sezione puoi vedere le proiezioni dei tuoi movimenti futuri.",
                position: "right",
                offset: { x: 880, y: 0 }
            },
            {
                element: "#sezione-ricorrenti",
                title: "Ricorrenti",
                description: "Qui puoi vedere tutti i tuoi abbonamenti o entrate fisse (es. Netflix, Affitto, Stipendio).",
                position: "top",
                offset: { x: 0, y: -40 }
            },
            {
                element: "#btn-apri-modale-prog",
                title: "Programma ora",
                description: "Crea una nuova transazione che si ripete nel tempo in pochi clic.",
                position: "bottom",
                offset: { x: 0, y: 20 }
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

        this.tooltip.classList.add("tour-content-fade");
        document.querySelectorAll(".tour-highlight").forEach(e => e.classList.remove("tour-highlight"));

        if (el) {
            el.classList.add("tour-highlight");
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => {
                const rect = el.getBoundingClientRect();
                const tooltipWidth = 320;
                const tooltipHeight = this.tooltip.offsetHeight || 180;
                let top = 0, left = 0;
                const margin = 12;

                this.tooltip.classList.remove("tour-pos-right", "tour-pos-bottom", "tour-pos-top", "tour-pos-left");

                // Gestione FIXED vs ABSOLUTE
                const isFixed = step.fixed || false;
                this.tooltip.style.position = isFixed ? "fixed" : "absolute";
                const scrollY = isFixed ? 0 : window.scrollY;
                const scrollX = isFixed ? 0 : window.scrollX;

                if (step.position === "right") {
                    top = rect.top + scrollY + (rect.height / 2) - (tooltipHeight / 2);
                    left = rect.left + scrollX + margin;
                    this.tooltip.classList.add("tour-pos-right");
                } else if (step.position === "left") {
                    top = rect.top + scrollY + (rect.height / 2) - (tooltipHeight / 2);
                    left = rect.left + scrollX - tooltipWidth - margin;
                    this.tooltip.classList.add("tour-pos-left");
                } else if (step.position === "bottom") {
                    top = rect.bottom + scrollY + margin;
                    left = rect.left + scrollX + (rect.width / 2) - (tooltipWidth / 2);
                    this.tooltip.classList.add("tour-pos-bottom");
                } else if (step.position === "top") {
                    top = rect.top + scrollY - tooltipHeight - margin;
                    left = rect.left + scrollX + (rect.width / 2) - (tooltipWidth / 2);
                    this.tooltip.classList.add("tour-pos-top");
                }

                // Applicazione OFFSET personalizzato
                if (step.offset) {
                    top += step.offset.y;
                    left += step.offset.x;
                }

                this.tooltip.style.top = `${top}px`;
                this.tooltip.style.left = `${left}px`;

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

            }, 50);
        }
    },

    next() {
        const pageSteps = this.steps[this.currentPage];
        if (this.currentStep < pageSteps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else if (this.currentPage === "index.html") {
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

Tour.init();
