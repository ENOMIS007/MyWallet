from flask import Blueprint, jsonify, request
from database import supabase, get_supabase_client
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

bp = Blueprint("programmazione", __name__)


def get_token():
    """Estrae il JWT dall'header Authorization."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]
    return None


def get_user_id(token):
    """Ricava lo user_id dal token JWT."""
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        return None


def calcola_prossima_data(data_prossima: date, frequenza: str) -> date:
    """
    Calcola la data successiva in base alla frequenza.
    Usa relativedelta per mesi/anni così gestisce correttamente
    i mesi con diverso numero di giorni.
    """
    if frequenza == "giornaliera":
        return data_prossima + timedelta(days=1)
    elif frequenza == "settimanale":
        return data_prossima + timedelta(weeks=1)
    elif frequenza == "mensile":
        return data_prossima + relativedelta(months=1)
    elif frequenza == "annuale":
        return data_prossima + relativedelta(years=1)
    return data_prossima


# GET /programmate — restituisce tutte le transazioni programmate dell'utente
@bp.route("/programmate", methods=["GET"])
def get_programmate():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        result = db.table("transazione_programmata") \
                   .select("*, categoria(nome)") \
                   .execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /programmate — aggiunge una nuova transazione programmata
@bp.route("/programmate", methods=["POST"])
def add_programmata():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db   = get_supabase_client(token)
        data = request.get_json()

        is_ricorrente = data.get("is_ricorrente", True)
        frequenza     = data.get("frequenza") if is_ricorrente else None
        data_inizio   = data.get("data_inizio")

        nuova = {
            "user_id":      user_id,
            "nome":         data.get("nome"),
            "soldi":        data.get("soldi"),
            "id_categoria": data.get("id_categoria"),
            "is_entrata":   data.get("is_entrata", False),
            "is_ricorrente": is_ricorrente,
            "frequenza":    frequenza,
            "data_inizio":  data_inizio,
            "data_prossima": data_inizio,  # la prima applicazione è alla data di inizio
        }
        result = db.table("transazione_programmata").insert(nuova).execute()
        return jsonify(result.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# DELETE /programmate/<id> — elimina una transazione programmata
@bp.route("/programmate/<string:programmata_id>", methods=["DELETE"])
def delete_programmata(programmata_id):
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db = get_supabase_client(token)
        db.table("transazione_programmata") \
          .delete() \
          .eq("id", programmata_id) \
          .execute()
        return jsonify({"message": "Eliminata"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# POST /programmate/applica — applica le transazioni programmate scadute
#
# Viene chiamato all'avvio dell'app (da api.js).
# Per ogni transazione con data_prossima <= oggi:
#   1. Inserisce una transazione reale
#   2. Se ricorrente: aggiorna data_prossima alla successiva occorrenza
#   3. Se una tantum: la elimina (è già avvenuta)
@bp.route("/programmate/applica", methods=["POST"])
def applica_programmate():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db   = get_supabase_client(token)
        oggi = date.today().isoformat()

        # Recupera tutte le programmate scadute (data_prossima <= oggi)
        scadute = db.table("transazione_programmata") \
                    .select("*") \
                    .lte("data_prossima", oggi) \
                    .execute()

        applicate = 0

        for p in scadute.data:
            data_corrente = date.fromisoformat(p["data_prossima"])

            # Ciclo: applica tutte le occorrenze scadute fino ad oggi
            while data_corrente <= date.today():

                # Inserisce la transazione reale
                db.table("transazione").insert({
                    "user_id":      user_id,
                    "soldi":        p["soldi"],
                    "id_categoria": p["id_categoria"],
                    "is_entrata":   p["is_entrata"],
                    "data":         data_corrente.isoformat(),
                }).execute()

                applicate += 1

                if p["is_ricorrente"] and p["frequenza"]:
                    # Avanza alla prossima occorrenza
                    data_corrente = calcola_prossima_data(data_corrente, p["frequenza"])
                else:
                    # Una tantum: esce dal ciclo e poi elimina
                    data_corrente = date.today() + timedelta(days=1)

            if p["is_ricorrente"] and p["frequenza"]:
                # Aggiorna data_prossima nel DB
                db.table("transazione_programmata") \
                  .update({"data_prossima": data_corrente.isoformat()}) \
                  .eq("id", p["id"]) \
                  .execute()
            else:
                # Una tantum applicata: elimina dal DB
                db.table("transazione_programmata") \
                  .delete() \
                  .eq("id", p["id"]) \
                  .execute()

        return jsonify({"applicate": applicate}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400
