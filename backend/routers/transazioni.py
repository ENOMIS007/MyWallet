from flask import Blueprint, jsonify, request
from database import supabase, get_supabase_client

bp = Blueprint("transazioni", __name__)
from utils import get_token, get_user_id



# GET /transazioni — restituisce tutte le transazioni dell'utente
@bp.route("/transazioni", methods=["GET"])
def get_transazioni():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        result = db.table("transazione").select("*, categoria(nome)").execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /transazioni — aggiunge una nuova transazione
@bp.route("/transazioni", methods=["POST"])
def add_transazione():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db = get_supabase_client(token)
        data = request.get_json()
        nuova = {
            "soldi":        data.get("soldi"),
            "id_categoria": data.get("id_categoria"),
            "is_entrata":   data.get("is_entrata"),
            "data":         data.get("data"),
            "user_id":      user_id
        }
        result = db.table("transazione").insert(nuova).execute()
        return jsonify(result.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# GET /saldo — calcola il saldo attuale dell'utente
@bp.route("/saldo", methods=["GET"])
def get_saldo():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        result = db.table("transazione").select("soldi, is_entrata").execute()
        saldo = 0
        for t in result.data:
            if t["is_entrata"]:
                saldo += t["soldi"]
            else:
                saldo -= t["soldi"]
        return jsonify({"saldo": saldo})
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /transazioni/saldo-iniziale — imposta il saldo iniziale del nuovo utente
#
# Cerca la categoria "Saldo Iniziale" di default già presente nel DB per l'utente
# (visibile tramite RLS ma esclusa dai normali endpoint /categorie).
# Non la crea mai: se non esiste restituisce errore.
# Inserisce la transazione con il valore e il segno corretti.
@bp.route("/transazioni/saldo-iniziale", methods=["POST"])
def set_saldo_iniziale():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    data = request.get_json()
    valore = data.get("valore")

    if valore is None:
        return jsonify({"error": "Campo 'valore' obbligatorio"}), 400

    try:
        db = get_supabase_client(token)

        # Cerca la categoria "Saldo Iniziale" senza filtri aggiuntivi.
        # La RLS garantisce che vengano restituite solo le categorie dell'utente
        # (default comprese), quindi non serve passare user_id esplicitamente.
        cat_result = db.table("categoria").select("id, is_entrata") \
                       .eq("nome", "Saldo Iniziale") \
                       .execute()

        if not cat_result.data:
            return jsonify({"error": "Categoria 'Saldo Iniziale' non trovata"}), 404

        cat = cat_result.data[0]

        # Il segno della transazione dipende dal valore inserito dall'utente,
        # non da come è_entrata la categoria sul DB: un saldo negativo viene
        # salvato come uscita, uno zero o positivo come entrata.
        is_entrata = float(valore) >= 0
        importo    = abs(float(valore))
        data_oggi  = data.get("data")  # opzionale, il frontend può passarla

        if not data_oggi:
            from datetime import date
            data_oggi = date.today().isoformat()

        nuova = {
            "soldi":        importo,
            "id_categoria": cat["id"],
            "is_entrata":   is_entrata,
            "data":         data_oggi,
            "user_id":      user_id
        }
        result = db.table("transazione").insert(nuova).execute()
        return jsonify(result.data), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400