const BASE_URL = "http://localhost:3000";

// ══════════════════════════════════════════
//   TOKEN
// ══════════════════════════════════════════

function getToken() {
    return localStorage.getItem("access_token") || "";
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
    };
}

// ══════════════════════════════════════════
//   REFRESH TOKEN
//   Chiama /auth/refresh e salva i nuovi token.
//   Se il refresh fallisce, pulisce lo storage e rimanda al login.
// ══════════════════════════════════════════

let _refreshPromise = null;

async function refreshToken() {
    // Mutex: evita refresh simultanei
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
        const refresh = localStorage.getItem("refresh_token");
        if (!refresh) {
            pulisciStorageERedirect();
            return false;
        }
        try {
            const res  = await fetch(`${BASE_URL}/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: refresh })
            });
            const data = await res.json();
            if (!res.ok) {
                pulisciStorageERedirect();
                return false;
            }
            localStorage.setItem("access_token",  data.access_token);
            localStorage.setItem("refresh_token", data.refresh_token);
            return true;
        } catch {
            pulisciStorageERedirect();
            return false;
        } finally {
            _refreshPromise = null;
        }
    })();

    return _refreshPromise;
}

function pulisciStorageERedirect() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("cache_categorie");
    window.location.href = "/login.html";
}

// ══════════════════════════════════════════
//   REFRESH PROATTIVO
// ══════════════════════════════════════════

async function assicuraTokenValido() {
    const token = getToken();
    if (!token) return;

    try {
        const payload    = JSON.parse(atob(token.split(".")[1]));
        const scadenzaMs = payload.exp * 1000;
        const mancano    = scadenzaMs - Date.now();

        if (mancano < 60 * 1000) {
            await refreshToken();
        }
    } catch {
        // Token malformato: lascia che sia il backend a rifiutarlo
    }
}

// ══════════════════════════════════════════
//   FETCH CON REFRESH
// ══════════════════════════════════════════

async function fetchConRefresh(url, options = {}) {
    await assicuraTokenValido();
    options.headers = { ...authHeaders(), ...(options.headers || {}) };
    let res = await fetch(url, options);
    if (res.status === 401) {
        const rinnovato = await refreshToken();
        if (rinnovato) {
            options.headers = { ...authHeaders() };
            res = await fetch(url, options);
        }
    }
    return res;
}

// ══════════════════════════════════════════
//   AUTH
// ══════════════════════════════════════════

async function register(email, password) {
    const response = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    return await response.json();
}

async function login(email, password) {
    const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    return await response.json();
}

async function logout() {
    await fetchConRefresh(`${BASE_URL}/auth/logout`, { method: "POST" });
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("cache_categorie");
}

// Elimina definitivamente l'account e tutti i suoi dati
async function deleteAccount() {
    const response = await fetchConRefresh(`${BASE_URL}/auth/account`, {
        method: "DELETE"
    });
    return await response.json();
}

// ══════════════════════════════════════════
//   SALDO
// ══════════════════════════════════════════

async function getSaldo() {
    const response = await fetchConRefresh(`${BASE_URL}/saldo`);
    return await response.json();
}

// ══════════════════════════════════════════
//   TRANSAZIONI
// ══════════════════════════════════════════

async function getTransazioni() {
    const response = await fetchConRefresh(`${BASE_URL}/transazioni`);
    return await response.json();
}

async function addTransazione(importo, idCategoria, isEntrata, data) {
    const response = await fetchConRefresh(`${BASE_URL}/transazioni`, {
        method: "POST",
        body: JSON.stringify({
            soldi:        importo,
            id_categoria: idCategoria,
            is_entrata:   isEntrata,
            data:         data
        })
    });
    return await response.json();
}

// ══════════════════════════════════════════
//   CATEGORIE
// ══════════════════════════════════════════

async function getCategorieEntrate() {
    const response = await fetchConRefresh(`${BASE_URL}/categorie/entrate`);
    return await response.json();
}

async function getCategorieUscite() {
    const response = await fetchConRefresh(`${BASE_URL}/categorie/uscite`);
    return await response.json();
}

async function addCategoria(nome, isEntrata) {
    const response = await fetchConRefresh(`${BASE_URL}/categorie`, {
        method: "POST",
        body: JSON.stringify({ nome, is_entrata: isEntrata })
    });
    return await response.json();
}

// ══════════════════════════════════════════
//   TRANSAZIONI PROGRAMMATE
// ══════════════════════════════════════════

async function getProgrammate() {
    const response = await fetchConRefresh(`${BASE_URL}/programmate`);
    return await response.json();
}

async function addProgrammata(dati) {
    const response = await fetchConRefresh(`${BASE_URL}/programmate`, {
        method: "POST",
        body: JSON.stringify(dati)
    });
    return await response.json();
}

async function deleteProgrammata(id) {
    const response = await fetchConRefresh(`${BASE_URL}/programmate/${id}`, {
        method: "DELETE"
    });
    return await response.json();
}

async function applicaProgrammate() {
    const response = await fetchConRefresh(`${BASE_URL}/programmate/applica`, {
        method: "POST"
    });
    return await response.json();
}