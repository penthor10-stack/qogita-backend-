require(“dotenv”).config();
const express = require(“express”);
const cors = require(“cors”);
const fetch = require(“node-fetch”);

const app = express();
const PORT = process.env.PORT || 3001;
const QOGITA = “https://api.qogita.com”;

app.use(cors({ origin: “*” }));
app.use(express.json());

// ── Health check ─────────────────────────────────────────
app.get(”/”, (req, res) => {
res.json({ status: “ok”, message: “Qogita Sourcing Backend Running” });
});

// ── Login to Qogita ───────────────────────────────────────
app.post(”/api/login”, async (req, res) => {
try {
const { email, password } = req.body;
if (!email || !password) return res.status(400).json({ error: “Email and password required” });

```
const r = await fetch(`${QOGITA}/auth/login/`, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email, password }),
});

const data = await r.json();
if (!r.ok) return res.status(r.status).json({ error: data.detail || "Login failed" });

res.json({
accessToken: data.accessToken,
user: {
firstName: data.user?.firstName || "",
email: data.user?.email || email,
activeCartQid: data.user?.activeCartQid || "",
},
});
```

} catch (e) {
res.status(500).json({ error: e.message });
}
});

// ── Fetch catalog from Qogita ─────────────────────────────
app.get(”/api/catalog”, async (req, res) => {
try {
const token = req.headers.authorization?.replace(“Bearer “, “”);
const category = req.query.category || “hair-care”;
const pageSize = req.query.page_size || 200;

```
if (!token) return res.status(401).json({ error: "No token provided" });

const r = await fetch(`${QOGITA}/v1/catalog/variants/search/?page_size=${pageSize}&category=${category}`, {
headers: { "Authorization": `Bearer ${token}` },
});

const data = await r.json();
if (!r.ok) return res.status(r.status).json({ error: data.detail || "Catalog fetch failed" });

const products = (data.results || []).map(p => ({
gtin: p.gtin || p.ean || "",
name: (p.name || "").substring(0, 80),
brand: p.brand?.name || p.brand || "",
category: p.category?.name || category,
price: parseFloat(p.price || p.lowestPrice || 0),
inventory: parseInt(p.inventory || 0),
numOffers: parseInt(p.offersCount || 1),
})).filter(p => p.price > 0 && p.gtin);

res.json({ products, total: products.length, next: data.next });
```

} catch (e) {
res.status(500).json({ error: e.message });
}
});

// ── Fetch all categories at once ──────────────────────────
app.post(”/api/scan”, async (req, res) => {
try {
const token = req.headers.authorization?.replace(“Bearer “, “”);
if (!token) return res.status(401).json({ error: “No token provided” });

```
const categories = [
"hair-care", "skin-care", "body-care", "shampoo",
"conditioner", "hair-styling", "face-care", "hair-colour"
];

let allProducts = [];
const results = {};

for (const cat of categories) {
try {
const r = await fetch(`${QOGITA}/v1/catalog/variants/?page_size=200&category=${cat}`, {
headers: { "Authorization": `Bearer ${token}` },
});
if (r.ok) {
const data = await r.json();
const items = (data.results || []).map(p => ({
gtin: p.gtin || p.ean || "",
name: (p.name || "").substring(0, 80),
brand: p.brand?.name || p.brand || "",
category: p.category?.name || cat,
price: parseFloat(p.price || p.lowestPrice || 0),
inventory: parseInt(p.inventory || 0),
})).filter(p => p.price > 0 && p.gtin);
allProducts.push(...items);
results[cat] = items.length;
}
} catch {}
}

// Deduplicate by GTIN
const seen = new Set();
allProducts = allProducts.filter(p => {
if (seen.has(p.gtin)) return false;
seen.add(p.gtin); return true;
});

res.json({ products: allProducts, total: allProducts.length, byCategory: results });
```

} catch (e) {
res.status(500).json({ error: e.message });
}
});

// ── Keepa price lookup ────────────────────────────────────
app.post(”/api/keepa”, async (req, res) => {
try {
const { gtins, keepaKey } = req.body;
if (!keepaKey) return res.status(400).json({ error: “No Keepa key provided” });
if (!gtins || !gtins.length) return res.status(400).json({ error: “No GTINs provided” });

```
// Keepa API: look up by EAN/GTIN
const codes = gtins.slice(0, 100).join(",");
const r = await fetch(
`https://api.keepa.com/product?key=${keepaKey}&domain=2&code=${codes}&stats=180&history=0`,
);
const data = await r.json();
if (!r.ok || data.error) return res.status(400).json({ error: data.error?.message || "Keepa error" });

// Extract current buy box prices
const prices = {};
(data.products || []).forEach(p => {
if (p.eanList) {
p.eanList.forEach(ean => {
// Keepa prices are in cents, divide by 100
const buyBox = p.stats?.current?.[18]; // index 18 = buy box price
if (buyBox && buyBox > 0) prices[ean] = +(buyBox / 100).toFixed(2);
});
}
});

res.json({ prices, found: Object.keys(prices).length });
```

} catch (e) {
res.status(500).json({ error: e.message });
}
});

app.listen(PORT, () => console.log(`✅ Qogita Backend running on port ${PORT}`));
