from flask import Blueprint, jsonify, request
from database import supabase
import os, json
from datetime import date

bp = Blueprint("ai", __name__)
from utils import get_token



# POST /ai/analizza
# Riceve: { "testo": "...", "categorie": [...] }
# Restituisce: { "importo": float, "is_entrata": bool, "categoria_suggerita": str, "data": "YYYY-MM-DD" }
@bp.route("/ai/analizza", methods=["POST"])
def analizza_testo():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    data = request.get_json()
    testo = data.get("testo", "").strip()
    categorie = data.get("categorie", [])   # lista di nomi di categoria disponibili

    if not testo:
        return jsonify({"error": "Testo vuoto"}), 400

    mistral_key = os.getenv("MISTRAL_API_KEY", "")
    if not mistral_key:
        return jsonify({"error": "MISTRAL_API_KEY non configurata. Verifica il file .env"}), 500

    try:
        from mistralai.client import Mistral

        client = Mistral(api_key=mistral_key)

        oggi = date.today().isoformat()
        lista_cat = ", ".join(categorie) if categorie else "Cibo, Trasporti, Svago, Shopping, Casa, Salute, Lavoro, Altro"

        system_prompt = (
            "Sei un assistente finanziario intelligente e preciso. "
            "Il tuo compito è estrarre informazioni da un testo in italiano su una transazione. "
            "Rispondi SOLO con un oggetto JSON valido, senza markdown, senza spiegazioni. "
            "Il JSON deve avere esattamente questi campi:\n"
            '  "importo": numero positivo (float, es. 15.50)\n'
            '  "is_entrata": true se è un guadagno, false se è una spesa\n'
            '  "categoria_suggerita": stringa (Capitalizzata, es. "Benzina", "Abbigliamento"). '
            "REGOLA CRITICA: Se la spesa è molto specifica (es. benzina, farmacia, stipendio, netflix), "
            "CREA una nuova categoria adatta. Usa una delle categorie 'disponibili' SOLO se descrive "
            "perfettamente l'acquisto. Sentiti libero di inventare categorie specifiche ma brevi (1-2 parole).\n"
            '  "data": data in formato YYYY-MM-DD (usa oggi se non specificata)\n'
            '  "descrizione": brevissima descrizione (max 6 parole)\n'
            f"Oggi è {oggi}.\n"
            f"Categorie già esistenti: {lista_cat}."
        )

        response = client.chat.complete(
            model="mistral-small-latest",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": testo}
            ],
            temperature=0.1,
            max_tokens=200,
        )

        raw = response.choices[0].message.content.strip()

        # Pulizia markdown se presente
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        risultato = json.loads(raw)

        # Validazione minimale
        if "importo" not in risultato or "is_entrata" not in risultato:
            return jsonify({"error": "Risposta AI non valida"}), 500

        return jsonify({
            "importo":             float(risultato["importo"]),
            "is_entrata":          bool(risultato["is_entrata"]),
            "categoria_suggerita": str(risultato.get("categoria_suggerita", "Altro")),
            "data":                str(risultato.get("data", oggi)),
            "descrizione":         str(risultato.get("descrizione", "")),
        })

    except json.JSONDecodeError:
        return jsonify({"error": "Impossibile interpretare la risposta AI"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
