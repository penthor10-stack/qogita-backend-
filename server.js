var express = require("express");
var cors = require("cors");
var fetch = require("node-fetch");
var app = express();
var PORT = process.env.PORT || 3001;
var QOGITA = "https://api.qogita.com";
app.use(cors({ origin: "*" }));
app.use(express.json());
app.get("/", function(req, res) {
res.json({ status: "ok", message: "Qogita Sourcing Backend Running" });
});
app.post("/api/login", async function(req, res) {
try {
var email = req.body.email;
var password = req.body.password;
var r = await fetch(QOGITA + "/auth/login/", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email: email, password: password }),
});
var data = await r.json();
if (!r.ok) {
return res.status(r.status).json({ error: data.detail || JSON.stringify(data) });
}
res.json({ accessToken: data.accessToken, user: data.user });
} catch (e) {
res.status(500).json({ error: e.message });
}
});
app.post("/api/scan", async function(req, res) {
try {
var token = req.headers.authorization ? req.headers.authorization.replace("Bearer ", "") : "";
if (!token) return res.status(401).json({ error: "No token" });
var cats = ["hair-care","skin-care","body-care","shampoo","conditioner","hair-styling"];
var all = [];
var results = {};
for (var i = 0; i < cats.length; i++) {
var cat = cats[i];
try {
var r = await fetch(QOGITA + "/v1/catalog/variants/?page_size=200&category=" + cat, {
headers: { "Authorization": "Bearer " + token },
});
if (r.ok) {
var data = await r.json();
var items = (data.results || []).map(function(p) {
return {
gtin: p.gtin || p.ean || "",
name: (p.name || "").substring(0, 80),
brand: p.brand ? (p.brand.name || p.brand) : "",
category: p.category ? (p.category.name || cat) : cat,
price: parseFloat(p.price || p.lowestPrice || 0),
inventory: parseInt(p.inventory || 0),
};
}).filter(function(p) { return p.price > 0 && p.gtin; });
all = all.concat(items);
results[cat] = items.length;
}
} catch(err) {}
}
var seen = {};
all = all.filter(function(p) {
if (seen[p.gtin]) return false;
seen[p.gtin] = true;
return true;
});
res.json({ products: all, total: all.length, byCategory: results });
} catch (e) {
res.status(500).json({ error: e.message });
}
});
app.listen(PORT, function() {
console.log("Running on port " + PORT);
});
