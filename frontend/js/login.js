// Se già loggato, vai direttamente all'app
if (localStorage.getItem("access_token") || sessionStorage.getItem("access_token")) {
    window.location.href = "/";
}

function mostraTab(tab) {
    const isLogin = tab === "login";
    document.getElementById("form-login").style.display    = isLogin ? "flex" : "none";
    document.getElementById("form-register").style.display = isLogin ? "none"  : "flex";
    document.getElementById("tab-login").classList.toggle("attivo", isLogin);
    document.getElementById("tab-register").classList.toggle("attivo", !isLogin);
    nascondiMessaggi();
}

function nascondiMessaggi() {
    document.getElementById("msg-login").className    = "login-messaggio";
    document.getElementById("msg-register").className = "login-messaggio";
}

function mostraMessaggio(id, testo, tipo) {
    const el = document.getElementById(id);
    el.textContent = testo;
    el.className = `login-messaggio ${tipo}`;
}

async function handleLogin() {
    const email    = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn      = document.getElementById("btn-login");

    if (!email || !password) {
        mostraMessaggio("msg-login", "Inserisci email e password.", "errore");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Accesso in corso...";

    try {
        const data = await login(email, password);

        if (data.error) {
            mostraMessaggio("msg-login", data.error || "Credenziali non valide.", "errore");
            return;
        }

        localStorage.setItem("access_token",  data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        localStorage.setItem("user_id",       data.user_id);
        localStorage.setItem("user_email",    data.email);
        window.location.href = "/";

    } catch (err) {
        mostraMessaggio("msg-login", "Errore di connessione al server.", "errore");
    } finally {
        btn.disabled = false;
        btn.textContent = "Accedi";
    }
}

async function handleRegister() {
    const email     = document.getElementById("reg-email").value.trim();
    const password  = document.getElementById("reg-password").value;
    const password2 = document.getElementById("reg-password2").value;
    const btn       = document.getElementById("btn-register");

    if (!email || !password || !password2) {
        mostraMessaggio("msg-register", "Compila tutti i campi.", "errore");
        return;
    }

    if (password !== password2) {
        mostraMessaggio("msg-register", "Le password non coincidono.", "errore");
        return;
    }

    if (password.length < 6) {
        mostraMessaggio("msg-register", "La password deve essere di almeno 6 caratteri.", "errore");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Creazione account...";

    try {
        const data = await register(email, password);

        if (data.error) {
            mostraMessaggio("msg-register", data.error || "Registrazione fallita.", "errore");
            return;
        }

        sessionStorage.setItem("verify_email", email);
        mostraMessaggio("msg-register", "✅ Account creato! Controlla la tua email.", "successo");
        setTimeout(() => window.location.href = "/registrazione.html", 1500);

    } catch (err) {
        mostraMessaggio("msg-register", "Errore di connessione al server.", "errore");
    } finally {
        btn.disabled = false;
        btn.textContent = "Crea account";
    }
}

document.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;

    // Se c'è una modale aperta, non fare nulla (lascia gestire alle modali)
    if (document.querySelector(".modal-overlay") && 
        window.getComputedStyle(document.querySelector(".modal-overlay")).display !== "none") {
        return;
    }

    const formLogin = document.getElementById("form-login");
    if (!formLogin) return;

    // Controlla quale form è visibile
    const loginVisible = window.getComputedStyle(formLogin).display !== "none";
    
    if (loginVisible) {
        handleLogin();
    } else {
        const formRegister = document.getElementById("form-register");
        if (formRegister && window.getComputedStyle(formRegister).display !== "none") {
            handleRegister();
        }
    }
});