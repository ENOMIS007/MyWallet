from flask import Blueprint, jsonify, request
from database import supabase, get_supabase_client
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

bp = Blueprint("programmazione", __name__)


def get_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]
    return None


def get_user_id(token):
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        return None


def calcola_prossima_data(data_corrente: date, frequenza: str) -> date:
    if frequenza == "giornaliera":
        return data_corrente + timedelta(days=1)
    elif frequenza == "settimanale":
        return data_corrente + timedelta(weeks=1)
    elif frequenza == "mensile":
        return data_corrente + relativedelta(months=1)
    elif frequenza == "annuale":
        return data_corrente + relativedelta(years=1)
    return data_corrente


def get_o_crea_categoria(db, user_id: str, nome: str, is_entrata: bool) -> int:
    """
    Cerca una categoria con quel nome per l'utente.
    Se non esiste la crea. Restituisce l'id.
    """
    result = db.table("categoria").select("id").eq("nome", nome).execute()
    if result.data:
        return result.data[0]["id"]
    # Crea la categoria
    nuova = db.table("categoria").insert({
        "nome":       nome,
        "is_entrata": is_entrata,
        "user_id":    user_id,
        "is_default": False,
        "is_programmata": True,
    }).execute()
    return nuova.data[0]["id"]


# GET /programmate
@bp.route("/programmate", methods=["GET"])
def get_programmate():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        result = db.table("transazione_programmata").select("*").execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /programmate
@bp.route("/programmate", methods=["POST"])
def add_programmata():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db = get_supabase_client(token)
        data = request.get_json()
        data_inizio = data.get("data_inizio")

        nuova = {
            "user_id":       user_id,
            "nome":          data.get("nome"),
            "soldi":         data.get("soldi"),
            "is_entrata":    data.get("is_entrata", False),
            "frequenza":     data.get("frequenza", "mensile"),
            "data_inizio":   data_inizio,
            "data_prossima": data_inizio,
        }
        result = db.table("transazione_programmata").insert(nuova).execute()
        return jsonify(result.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# DELETE /programmate/<id>
@bp.route("/programmate/<string:programmata_id>", methods=["DELETE"])
def delete_programmata(programmata_id):
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        db.table("transazione_programmata").delete().eq("id", programmata_id).execute()
        return jsonify({"message": "Eliminata"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# POST /programmate/applica
@bp.route("/programmate/applica", methods=["POST"])
def applica_programmate():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db = get_supabase_client(token)
        oggi = date.today()

        scadute = db.table("transazione_programmata") \
                    .select("*") \
                    .lte("data_prossima", oggi.isoformat()) \
                    .execute()

        applicate = 0

        for p in scadute.data:
            data_corrente = date.fromisoformat(p["data_prossima"])

            # Ottieni o crea la categoria con il nome della programmata
            id_cat = get_o_crea_categoria(db, user_id, p["nome"], p["is_entrata"])

            # Se la data è nel passato, avanza fino alla prossima occorrenza futura
            # senza inserire transazioni per le date già passate
            while data_corrente <= oggi:
                data_corrente = calcola_prossima_data(data_corrente, p["frequenza"])

            # Inserisce solo la transazione per oggi se è esattamente oggi
            if date.fromisoformat(p["data_prossima"]) == oggi:
                db.table("transazione").insert({
                    "user_id":      user_id,
                    "soldi":        p["soldi"],
                    "id_categoria": id_cat,
                    "is_entrata":   p["is_entrata"],
                    "data":         oggi.isoformat(),
                }).execute()
                applicate += 1

            # Aggiorna data_prossima alla prossima occorrenza futura
            db.table("transazione_programmata") \
              .update({"data_prossima": data_corrente.isoformat()}) \
              .eq("id", p["id"]) \
              .execute()

        return jsonify({"applicate": applicate}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400