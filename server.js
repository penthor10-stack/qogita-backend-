var express = require("express");
var cors = require("cors");
var fetch = require("node-fetch");
var app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
app.get("/",function(req,res){res.json({status:"ok"});});
app.post("/api/login",async function(req,res){
var r=await fetch("https://api.qogita.com/auth/login/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:req.body.email,password:req.body.password})});
var d=await r.json();
if(!r.ok)return res.status(r.status).json({error:d.detail||"failed"});
res.json({accessToken:d.accessToken,user:d.user});
});
app.post("/api/scan",async function(req,res){
var t=req.headers.authorization.replace("Bearer ","");
var r=await fetch("https://api.qogita.com/variants/search/?page_size=100",{headers:{Authorization:"Bearer "+t}});
var d=await r.json();
res.json({products:d.results||[],total:(d.results||[]).length});
});
app.listen(process.env.PORT||3001,function(){console.log("ok");});

