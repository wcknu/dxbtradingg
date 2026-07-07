// netlify/functions/gemini-proxy.js
//
// Proxy sécurisé entre le site et l'API Gemini (Google AI Studio, offre gratuite).
// La clé API est lue depuis une variable d'environnement Netlify (GEMINI_API_KEY),
// jamais exposée au navigateur.
//
// Configuration requise sur Netlify :
//   Site settings → Environment variables → GEMINI_API_KEY = <votre clé AI Studio>

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY absente côté serveur (variable d\'environnement Netlify)' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  const { prompt, useSearch } = body;
  if (!prompt || typeof prompt !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Prompt manquant' }) };
  }

  // Flash-Lite = quota gratuit le plus élevé (≈1500 requêtes/jour, 15-30 req/min).
  // Passer à 'gemini-2.5-flash' si vous voulez une qualité de réponse un peu supérieure
  // (quota gratuit plus restreint mais toujours à 0 €).
  const model = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  };
  if (useSearch) {
    // Grounding avec Google Search — inclus dans le même quota gratuit (≈1500 req/jour partagées).
    payload.tools = [{ google_search: {} }];
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.error) {
      return { statusCode: 502, body: JSON.stringify({ error: data.error.message || 'Erreur API Gemini' }) };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || '').join('\n');

    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Réponse vide (possible filtre de sécurité ou quota atteint)' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
