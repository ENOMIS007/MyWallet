const BASE_URL = "http://localhost:3000";

// ══════════════════════════════════════════
//   STEP MACHINE
// ══════════════════════════════════════════
function goToStep(n) {
    [1, 2, 3].forEach(i => {
        document.getElementById(`panel${i}`).classList.toggle("visible", i === n);
        const sn = document.getElementById(`sn${i}`);
        sn.classList.remove("active", "done");
        if (i < n) sn.classList.add("done");
        if (i === n) sn.classList.add("active");
        if (i < n) document.getElementById(`sc${i}`).textContent = "✓";
    });
    if (n > 1) document.getElementById("sl1").classList.toggle("done", n > 1);
    if (n > 2) document.getElementById("sl2").classList.toggle("done", n > 2);

    if (n === 2) avviaPolling();
    else fermaPolling();
}

// ══════════════════════════════════════════
//   CONTROLLA HASH ALL'AVVIO
// ══════════════════════════════════════════
window.addEventListener("load", () => {
    const hash   = new URLSearchParams(window.location.hash.substring(1));
    const params = new URLSearchParams(window.location.search);

    const accessToken  = hash.get("access_token")  || params.get("access_token");
    const refreshToken = hash.get("refresh_token") || params.get("refresh_token");
    const errorDesc    = hash.get("error_description") || params.get("error_description");

    if (errorDesc) {
        goToStep(1);
        mostraMsg("msg1", "errore", "⚠️ " + decodeURIComponent(errorDesc));
        return;
    }

    if (accessToken) {
        processoVerifica(accessToken, refreshToken);
        return;
    }

    const savedStep = sessionStorage.getItem("reg_step");
    if (savedStep === "2") {
        const email = sessionStorage.getItem("verify_email") || "";
        document.getElementById("displayEmail").textContent = email || "—";
        goToStep(2);
    }
});

// ══════════════════════════════════════════
//   STEP 1: REGISTRAZIONE
// ══════════════════════════════════════════
async function handleRegister() {
    const email = document.getElementById("reg-email").value.trim();
    const pass  = document.getElementById("reg-password").value;
    const pass2 = document.getElementById("reg-password2").value;
    const btn   = document.getElementById("btnRegistra");

    if (!email || !pass || !pass2) { mostraMsg("msg1", "errore", "Compila tutti i campi."); return; }
    if (pass !== pass2)            { mostraMsg("msg1", "errore", "Le password non coincidono."); return; }
    if (pass.length < 6)           { mostraMsg("msg1", "errore", "La password deve essere di almeno 6 caratteri."); return; }

    btn.disabled = true;
    btn.textContent = "Creazione account…";

    try {
        const res  = await fetch(`${BASE_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();

        if (!res.ok) {
            mostraMsg("msg1", "errore", data.error || "Registrazione fallita.");
            btn.disabled = false;
            btn.textContent = "Crea account";
            return;
        }

        sessionStorage.setItem("verify_email", email);
        sessionStorage.setItem("verify_pass",  pass);
        sessionStorage.setItem("reg_step", "2");
        document.getElementById("displayEmail").textContent = email;
        goToStep(2);

    } catch (e) {
        mostraMsg("msg1", "errore", "Errore di connessione al server.");
        btn.disabled = false;
        btn.textContent = "Crea account";
    }
}

// ══════════════════════════════════════════
//   STEP 3: TOKEN VERIFICATO
// ══════════════════════════════════════════
function processoVerifica(accessToken, refreshToken) {
    try {
        const payload = JSON.parse(atob(accessToken.split(".")[1]));
        localStorage.setItem("access_token", accessToken);
        if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
        localStorage.setItem("user_id",    payload.sub   || "");
        localStorage.setItem("user_email", payload.email || sessionStorage.getItem("verify_email") || "");
    } catch {
        localStorage.setItem("access_token", accessToken);
        if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
    }

    sessionStorage.removeItem("verify_email");
    sessionStorage.removeItem("verify_pass");
    sessionStorage.removeItem("reg_step");

    document.getElementById("sl1").classList.add("done");
    document.getElementById("sl2").classList.add("done");
    goToStep(3);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById("redirectFill").style.width = "100%";
    }));
    setTimeout(() => { window.location.href = "/"; }, 3200);
}

// ══════════════════════════════════════════
//   POLLING VERIFICA EMAIL
// ══════════════════════════════════════════
let pollingInterval = null;

function avviaPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(async () => {
        const email = sessionStorage.getItem("verify_email");
        const pass  = sessionStorage.getItem("verify_pass");
        if (!email || !pass) return;

        try {
            const res  = await fetch(`${BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password: pass })
            });
            const data = await res.json();

            if (res.ok && data.access_token) {
                fermaPolling();
                processoVerifica(data.access_token, data.refresh_token);
            }
        } catch {
            // Errore di rete: ignora e riprova
        }
    }, 3000);
}

function fermaPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// ══════════════════════════════════════════
//   REINVIA EMAIL
// ══════════════════════════════════════════
let cooldown = false;

async function reinviaEmail() {
    if (cooldown) return;
    const email = sessionStorage.getItem("verify_email") || "";
    if (!email) {
        mostraMsg("msg2", "errore", "Email non disponibile. Ricomincia la registrazione.");
        return;
    }

    cooldown = true;
    const btn = document.getElementById("btnResend");
    btn.disabled = true;
    btn.textContent = "Invio…";

    try {
        const res  = await fetch(`${BASE_URL}/auth/resend-verification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (!res.ok) {
            mostraMsg("msg2", "errore", data.error || "Impossibile reinviare l'email.");
            cooldown = false;
            btn.disabled = false;
            btn.innerHTML = "📨 &nbsp;Rinvia email";
            return;
        }

        mostraMsg("msg2", "successo", "✅ Email reinviata! Controlla la casella.");
        avviaCountdown(60);

    } catch {
        mostraMsg("msg2", "errore", "Errore di connessione al server.");
        cooldown = false;
        btn.disabled = false;
        btn.innerHTML = "📨 &nbsp;Rinvia email";
    }
}

function avviaCountdown(sec) {
    const btn = document.getElementById("btnResend");
    const tmr = document.getElementById("resendTimer");
    btn.innerHTML = "📨 &nbsp;Rinvia email";
    tmr.style.display = "block";
    let r = sec;
    const iv = setInterval(() => {
        tmr.textContent = `Puoi rinviare tra ${--r}s`;
        if (r <= 0) {
            clearInterval(iv);
            tmr.style.display = "none";
            btn.disabled = false;
            cooldown = false;
        }
    }, 1000);
}

// ══════════════════════════════════════════
//   HELPER
// ══════════════════════════════════════════
function mostraMsg(id, tipo, testo) {
    const el = document.getElementById(id);
    el.textContent = testo;
    el.className = `reg-msg ${tipo}`;
}

// Invio con Enter (solo step 1)
document.addEventListener("keydown", e => {
    if (e.key === "Enter" && document.getElementById("panel1").classList.contains("visible")) {
        handleRegister();
    }
});