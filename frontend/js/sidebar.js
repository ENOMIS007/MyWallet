// ══════════════════════════════════════════
//   SIDEBAR — menu utente + modale elimina account
//   Caricato da index.html e programmazione.html.
//   Gestisce tutto ciò che riguarda la sidebar
//   in un unico posto, senza duplicazioni.
// ══════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {

    const menu    = document.getElementById("sidebar-user-menu");
    const trigger = document.getElementById("btn-user-menu");
    const panel   = menu.querySelector(".sidebar-user-panel");

    // ── Toggle dropdown ────────────────────────────
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("aperto");
    });

    // Chiude cliccando fuori
    document.addEventListener("click", () => menu.classList.remove("aperto"));

    // Impedisce chiusura cliccando dentro il pannello
    panel.addEventListener("click", (e) => e.stopPropagation());

    // ── Logout ─────────────────────────────────────
    document.getElementById("btn-logout").addEventListener("click", async () => {
        menu.classList.remove("aperto");
        await logout();
        window.location.href = "/login.html";
    });

    // ── Apri modale elimina account ────────────────
    document.getElementById("btn-apri-elimina").addEventListener("click", () => {
        menu.classList.remove("aperto");
        apriModaleEliminaAccount();
    });

    // ── Modale elimina account ─────────────────────
    const modal       = document.getElementById("modal-elimina-account");
    const inputEmail  = document.getElementById("input-conferma-email");
    const btnConferma = document.getElementById("btn-conferma-elimina");
    const btnAnnulla  = document.getElementById("btn-annulla-elimina");

    const emailUtente = (
        localStorage.getItem("user_email") ||
        sessionStorage.getItem("user_email") || ""
    ).toLowerCase().trim();

    // Abilita "Elimina tutto" solo quando l'email corrisponde
    inputEmail.addEventListener("input", () => {
        btnConferma.disabled = inputEmail.value.toLowerCase().trim() !== emailUtente;
    });

    btnAnnulla.addEventListener("click", chiudiModaleEliminaAccount);

    // Chiude cliccando sull'overlay
    modal.addEventListener("click", (e) => {
        if (e.target === modal) chiudiModaleEliminaAccount();
    });

    // Conferma eliminazione
    btnConferma.addEventListener("click", async () => {
        btnConferma.disabled    = true;
        btnConferma.textContent = "Eliminazione in corso…";
        btnAnnulla.disabled     = true;

        try {
            const result = await deleteAccount();
            if (result.error) {
                mostraErroreModale(result.error);
                btnConferma.disabled    = false;
                btnConferma.textContent = "Elimina tutto";
                btnAnnulla.disabled     = false;
                return;
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "/login.html";
        } catch {
            mostraErroreModale("Errore di connessione al server.");
            btnConferma.disabled    = false;
            btnConferma.textContent = "Elimina tutto";
            btnAnnulla.disabled     = false;
        }
    });
});

// ── Apre la modale e resetta lo stato ──────────────
function apriModaleEliminaAccount() {
    const modal       = document.getElementById("modal-elimina-account");
    const inputEmail  = document.getElementById("input-conferma-email");
    const btnConferma = document.getElementById("btn-conferma-elimina");
    const btnAnnulla  = document.getElementById("btn-annulla-elimina");
    const errMsg      = modal.querySelector(".modal-error-msg");

    if (errMsg) errMsg.remove();
    inputEmail.value        = "";
    btnConferma.disabled    = true;
    btnConferma.textContent = "Elimina tutto";
    btnAnnulla.disabled     = false;
    modal.style.display     = "flex";
    setTimeout(() => inputEmail.focus(), 80);
}

function chiudiModaleEliminaAccount() {
    document.getElementById("modal-elimina-account").style.display = "none";
}

function mostraErroreModale(testo) {
    const modal   = document.getElementById("modal-elimina-account");
    const vecchio = modal.querySelector(".modal-error-msg");
    if (vecchio) vecchio.remove();
    const el = document.createElement("p");
    el.className = "modal-error-msg";
    el.style.cssText = `font-size:0.82rem;color:var(--negative);background:var(--negative-soft);border:1px solid rgba(240,104,128,0.25);border-radius:var(--radius-xs);padding:10px 14px;margin-bottom:12px;width:100%;text-align:center;`;
    el.textContent = testo;
    modal.querySelector(".modal-card").insertBefore(el, modal.querySelector(".modal-categoria-btn-group"));
}
