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
  res.json({ status: "ok" });
});

// ── DEBUG: Test all possible endpoints ────────────────────
app.post("/api/debug", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token" });
  }

  console.log("[DEBUG] Testing endpoints with token:", token.substring(0, 20) + "...");

  const endpoints = [
    "/variants/",
    "/variants/?page=1&page_size=10",
    "/v1/variants/",
    "/catalog/variants/",
    "/v1/catalog/variants/",
    "/products/",
    "/v1/products/",
    "/offers/",
    "/v1/offers/",
  ];

  const results = {};

  for (const ep of endpoints) {
    try {
      console.log(`[DEBUG] Testing: ${QOGITA}${ep}`);
      
      const r = await fetch(`${QOGITA}${ep}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text.substring(0, 300);
      }

      results[ep] = {
        status: r.status,
        ok: r.ok,
        hasResults: Array.isArray(data?.results),
        resultsCount: data?.results?.length || 0,
        keys: typeof data === "object" ? Object.keys(data) : [],
        sample: data?.results?.[0] || null,
        raw: typeof data === "string" ? data : null,
      };

      console.log(`[DEBUG] ${ep} → ${r.status}, results: ${data?.results?.length || 0}`);
    } catch (e) {
      results[ep] = { error: e.message };
      console.log(`[DEBUG] ${ep} → ERROR: ${e.message}`);
    }
  }

  res.json({ results });
});

// ── Login to Qogita ───────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    console.log(`[LOGIN] Attempting: ${email}`);

    const r = await fetch(`${QOGITA}/auth/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const text = await r.text();
    console.log(`[LOGIN] Status: ${r.status}`);
    console.log(`[LOGIN] Response: ${text.substring(0, 500)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: "Invalid JSON response", raw: text.substring(0, 200) });
    }

    if (!r.ok) {
      return res.status(r.status).json({ error: data.detail || data.message || "Login failed" });
    }

    // Try all possible token fields
    const token = data.access || data.accessToken || data.token || data.access_token;

    console.log(`[LOGIN] Token found: ${token ? "YES" : "NO"}`);
    console.log(`[LOGIN] Response keys:`, Object.keys(data));

    if (!token) {
      return res.status(500).json({ 
        error: "No token in response", 
        keys: Object.keys(data),
        data: data 
      });
    }

    res.json({
      accessToken: token,
      refreshToken: data.refresh || data.refreshToken || "",
      email: data.user?.email || email,
      debug: { keys: Object.keys(data) },
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
    let debugInfo = [];

    console.log(`[SCAN] Starting with token: ${token.substring(0, 20)}...`);

    while (page <= maxPages) {
      const url = `${QOGITA}/variants/?page=${page}&page_size=${pageSize}`;
      console.log(`[SCAN] Fetching: ${url}`);

      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const text = await r.text();
      console.log(`[SCAN] Page ${page} status: ${r.status}`);
      console.log(`[SCAN] Page ${page} response: ${text.substring(0, 300)}`);

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        debugInfo.push({ page, error: "Invalid JSON", raw: text.substring(0, 200) });
        break;
      }

      if (!r.ok) {
        debugInfo.push({ page, status: r.status, error: data.detail || data });
        if (page === 1) {
          return res.status(r.status).json({ 
            error: `API error: ${r.status}`, 
            detail: data.detail || data,
            debug: debugInfo 
          });
        }
        break;
      }

      // Try different response structures
      const results = data.results || data.data || data.variants || data.products || [];
      
      debugInfo.push({ 
        page, 
        status: r.status, 
        keys: Object.keys(data),
        resultsCount: results.length,
        sampleKeys: results[0] ? Object.keys(results[0]) : [],
      });

      console.log(`[SCAN] Page ${page}: ${results.length} items, keys: ${Object.keys(data).join(", ")}`);

      if (results.length === 0) break;

      const items = results
        .map((p) => ({
          gtin: p.gtin || p.ean || p.upc || p.barcode || "",
          name: p.name || p.title || p.productName || "",
          brand: p.brand?.name || p.brandName || p.brand || "",
          category: p.category?.name || p.categoryName || p.category || "",
          qogitaCost: parseFloat(p.unit_price || p.unitPrice || p.price || p.lowestPrice || p.best_offer_price || p.cost || 0),
          inventory: parseInt(p.available_quantity || p.availableQuantity || p.inventory || p.stock || p.qty || 0, 10),
          moq: parseInt(p.minimum_order_quantity || p.moq || p.minQty || 1, 10),
          imageUrl: p.image_url || p.imageUrl || p.image || p.thumbnail || "",
          qid: p.qid || p.id || p.sku || "",
        }))
        .filter((p) => p.qogitaCost > 0 && p.gtin && p.gtin.length >= 8);

      console.log(`[SCAN] Page ${page}: ${items.length} valid items after filtering`);

      allProducts.push(...items);

      if (!data.next) break;
      page++;
    }

    // Deduplicate
    const seen = new Set();
    allProducts = allProducts.filter((p) => {
      if (seen.has(p.gtin)) return false;
      seen.add(p.gtin);
      return true;
    });

    console.log(`[SCAN] Final: ${allProducts.length} unique products`);

    res.json({
      products: allProducts,
      total: allProducts.length,
      pagesScanned: page,
      debug: debugInfo,
    });
  } catch (e) {
    console.error("[SCAN] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   POST /api/login → Login`);
  console.log(`   POST /api/scan  → Scan products`);
  console.log(`   POST /api/debug → Test all endpoints`);
});
