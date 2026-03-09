require(“dotenv”).config();
var express = require(“express”);
var cors = require(“cors”);
var fetch = require(“node-fetch”);

var app = express();
var PORT = process.env.PORT || 3001;
var QOGITA = “https://api.qogita.com”;

app.use(cors({ origin: “*” }));
app.use(express.json());

app.get(”/”, function(req, res) {
res.json({ status: “ok”, message: “Qogita Sourcing Backend Running” });
});

app.post(”/api/login”, async function(req, res) {
try {
var email = req.body.email;
var password = req.body.password;
if (!email || !password) {
return res.status(400).json({ error: “Email and password required” });
}
var r = await fetch(QOGITA + “/auth/login/”, {
method: “POST”,
headers: { “Content-Type”: “application/json” },
body: JSON.stringify({ email: email, password: password }),
});
var data = await r.json();
if (!r.ok) {
return res.status(r.status).json({ error: data.detail || “Login failed” });
}
res.json({
accessToken: data.accessToken,
user: {
firstName: data.user ? data.user.firstName : “”,
email: data.user ? data.user.email : email,
activeCartQid: data.user ? data.user.activeCartQid : “”,
},
});
} catch (e) {
res.status(500).json({ error: e.message });
}
});

app.post(”/api/scan”, async function(req, res) {
try {
var token = req.headers.authorization ? req.headers.authorization.replace(“Bearer “, “”) : “”;
if (!token) {
return res.status(401).json({ error: “No token provided” });
}
var categories = [
“hair-care”, “skin-care”, “body-care”, “shampoo”,
“conditioner”, “hair-styling”, “face-care”, “hair-colour”
];
var allProducts = [];
var results = {};
for (var i = 0; i < categories.length; i++) {
var cat = categories[i];
try {
var r = await fetch(QOGITA + “/v1/catalog/variants/?page_size=200&category=” + cat, {
headers: { “Authorization”: “Bearer “ + token },
});
if (r.ok) {
var data = await r.json();
var items = (data.results || []).map(function(p) {
return {
gtin: p.gtin || p.ean || “”,
name: (p.name || “”).substring(0, 80),
brand: p.brand ? (p.brand.name || p.brand) : “”,
category: p.category ? (p.category.name || cat) : cat,
price: parseFloat(p.price || p.lowestPrice || 0),
inventory: parseInt(p.inventory || 0),
};
}).filter(function(p) {
return p.price > 0 && p.gtin;
});
allProducts = allProducts.concat(items);
results[cat] = items.length;
}
} catch(err) {}
}
var seen = {};
allProducts = allProducts.filter(function(p) {
if (seen[p.gtin]) return false;
seen[p.gtin] = true;
return true;
});
res.json({ products: allProducts, total: allProducts.length, byCategory: results });
} catch (e) {
res.status(500).json({ error: e.message });
}
});

app.post(”/api/keepa”, async function(req, res) {
try {
var keepaKey = req.body.keepaKey;
var gtins = req.body.gtins;
if (!keepaKey) return res.status(400).json({ error: “No Keepa key” });
if (!gtins || !gtins.length) return res.status(400).json({ error: “No GTINs” });
var codes = gtins.slice(0, 100).join(”,”);
var r = await fetch(“https://api.keepa.com/product?key=” + keepaKey + “&domain=2&code=” + codes + “&stats=180&history=0”);
var data = await r.json();
if (!r.ok || data.error) {
return res.status(400).json({ error: “Keepa error” });
}
var prices = {};
(data.products || []).forEach(function(p) {
if (p.eanList) {
p.eanList.forEach(function(ean) {
var buyBox = p.stats && p.stats.current ? p.stats.current[18] : null;
if (buyBox && buyBox > 0) {
prices[ean] = parseFloat((buyBox / 100).toFixed(2));
}
});
}
});
res.json({ prices: prices, found: Object.keys(prices).length });
} catch (e) {
res.status(500).json({ error: e.message });
}
});

app.listen(PORT, function() {
console.log(“Qogita Backend running on port “ + PORT);
});
