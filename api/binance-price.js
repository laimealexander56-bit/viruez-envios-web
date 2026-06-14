// api/binance-price.js
//
// Esta función corre en el servidor de Vercel (no en el navegador del usuario),
// por eso SI puede llamar a Binance sin problemas de CORS.
//
// Cómo se usa (desde la calculadora):
//   /api/binance-price?fiat=CLP&tradeType=BUY&amount=100000
//   /api/binance-price?fiat=BOB&tradeType=SELL&amount=100000
//
// Parámetros:
//   fiat       -> moneda fiat (CLP, BOB, VES, ARS, etc.)
//   tradeType  -> "BUY" o "SELL"
//                 BUY  = quieres COMPRAR USDT pagando con esa moneda (usado para CLP)
//                 SELL = quieres VENDER USDT y recibir esa moneda (usado para la moneda destino)
//   amount     -> (opcional) monto aproximado, para filtrar anuncios donde ese monto
//                  esté dentro del rango mínimo/máximo del anunciante
//
// Respuesta:
//   { price: 921.43, count: 7, prices: [...] }
//   price = promedio de los mejores anuncios encontrados
//   count = cuántos anuncios se usaron para el promedio
//   prices = lista de precios individuales usados (para depurar / mostrar info)

export default async function handler(req, res) {
  // Permitir que la calculadora (en otro dominio) pueda llamar esta función
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const { fiat, tradeType, amount } = req.query;

  if (!fiat || !tradeType) {
    res.status(400).json({ error: "Faltan parámetros: fiat y tradeType son obligatorios." });
    return;
  }

  if (tradeType !== "BUY" && tradeType !== "SELL") {
    res.status(400).json({ error: "tradeType debe ser BUY o SELL." });
    return;
  }

  try {
    const body = {
      page: 1,
      rows: 10,
      asset: "USDT",
      tradeType: tradeType,
      fiat: String(fiat).toUpperCase(),
      payTypes: [],
      publisherType: null,
    };

    if (amount) {
      body.transAmount = String(amount);
    }

    const response = await fetch(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      res.status(502).json({ error: "Binance respondió con un error.", status: response.status });
      return;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.data) || data.data.length === 0) {
      res.status(404).json({ error: "No se encontraron anuncios para esos parámetros." });
      return;
    }

    // Tomamos entre 3 y 10 anuncios (los que Binance ya devuelve como mejores precios)
    const ads = data.data.slice(0, 10);
    const prices = ads.map((item) => parseFloat(item.adv.price)).filter((p) => !isNaN(p));

    if (prices.length === 0) {
      res.status(404).json({ error: "No se pudieron leer los precios de los anuncios." });
      return;
    }

    const usedPrices = prices.slice(0, Math.max(3, Math.min(10, prices.length)));
    const average = usedPrices.reduce((sum, p) => sum + p, 0) / usedPrices.length;

    res.status(200).json({
      price: average,
      count: usedPrices.length,
      prices: usedPrices,
      fiat: String(fiat).toUpperCase(),
      tradeType: tradeType,
    });
  } catch (err) {
    res.status(500).json({ error: "Error al consultar Binance.", details: String(err) });
  }
}
