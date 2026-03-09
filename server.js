
var express = require("express");
var cors = require("cors");
var app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.get("/", function(req, res) {
res.json({ status: "ok", message: "Backend Running" });
});
app.listen(process.env.PORT || 3001, function() {
console.log("Running");
});

