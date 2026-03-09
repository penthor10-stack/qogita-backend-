require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3001;
const QOGITA = "https://api.qogita.com";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Health check ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Qogita Scanner Running" });
});

// ── Login to Qogita ───────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    console.log(`[LOGIN] ${email}`);

    const r = await fetch(`${QOGITA}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data.detail || "Login failed" });
    }

    const token = data.access || data.accessToken || data.token;

    if (!token) {
      return res.status(500).json({ error: "No token in response" });
    }

    res.json({
      accessToken: token,
      refreshToken: data.refresh || "",
      email: data.user?.email || email,
    });
  } catch (e) {
    console.error("[LOGIN] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Scan Qogita products ──────────────────────────────────
app.post("/api/scan", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { maxPages = 5, pageSize = 200 } = req.body;
    let allProducts = [];
    let page = 1;

    console.log(`[SCAN] Starting - maxPages: ${maxPages}, pageSize: ${pageSize}`);

    while (page <= maxPages) {
      console.log(`[SCAN] Fetching page ${page}...`);

      const r = await fetch(`${QOGITA}/variants/?page=${page}&page_size=${pageSize}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!r.ok) {
        console.error(`[SCAN] Page ${page} failed: ${r.status}`);
        if (page === 1) {
          return res.status(r.status).json({ error: `API error: ${r.status}` });
        }
        break;
      }

      const data = await r.json();
      const results = data.results || [];

      console.log(`[SCAN] Page ${page}: ${results.length} products`);

      if (results.length === 0) break;

      const items = results
        .map((p) => ({
          gtin: p.gtin || p.ean || "",
          name: p.name || "",
          brand: p.brand?.name || p.brand || "",
          category: p.category?.name || "",
          qogitaCost: parseFloat(p.unit_price || p.price || p.best_offer_price || 0),
          inventory: parseInt(p.available_quantity || p.inventory || 0, 10),
          moq: parseInt(p.minimum_order_quantity || 1, 10),
          imageUrl: p.image_url || "",
          qid: p.qid || "",
        }))
        .filter((p) => p.qogitaCost > 0 && p.gtin && p.gtin.length >= 8);

      allProducts.push(...items);

      if (!data.next) break;
      page++;
    }

    // Deduplicate by GTIN
    const seen = new Set();
    allProducts = allProducts.filter((p) => {
      if (seen.has(p.gtin)) return false;
      seen.add(p.gtin);
      return true;
    });

    console.log(`[SCAN] Done: ${allProducts.length} unique products`);

    res.json({
      products: allProducts,
      total: allProducts.length,
      pagesScanned: page,
    });
  } catch (e) {
    console.error("[SCAN] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Keepa lookup (placeholder for later) ──────────────────
app.post("/api/keepa", async (req, res) => {
  const { keepaKey } = req.body;

  if (!keepaKey) {
    return res.status(400).json({
      error: "No Keepa API key provided",
      message: "Add your Keepa key to enable Amazon price lookups",
    });
  }

  // TODO: Add Keepa integration when you have the key
  res.json({ message: "Keepa integration ready - add your key to enable" });
});

// ── Start server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Qogita Scanner running on port ${PORT}`);
  console.log(`   POST /api/login → Login`);
  console.log(`   POST /api/scan  → Scan products`);
  console.log(`   POST /api/keepa → (Coming soon)`);
});
