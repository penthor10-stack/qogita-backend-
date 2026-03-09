var express = require("express");
var cors = require("cors");
var fetch = require("node-fetch");
var app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
app.get("/",function(req,res){
res.json({status:"ok"});
});
app.post("/api/login",async function(req,res){
try{
var r=await fetch("https://api.qogita.com/auth/login/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:req.body.email,password:req.body.password})});
var d=await r.json();
if(!r.ok)return res.status(r.status).json({error:d.detail});
res.json({accessToken:d.accessToken,user:d.user});
}catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/scan",async function(req,res){
try{
var t=req.headers.authorization.replace("Bearer ","");
var r=await fetch("https://api.qogita.com/search/offers/?category_name=hair-care&stock_availability=in_stock&size=400",{headers:{Authorization:"Bearer "+t}});
var d=await r.json();
var items=(d.results||[]).map(function(p){return{gtin:p.gtin,name:p.name,brand:p.brandName,category:"hair-care",price:parseFloat(p.minPrice||0),inventory:parseInt(p.inventory||0)};}).filter(function(p){return p.price>0;});
res.json({products:items,total:items.length});
}catch(e){res.status(500).json({error:e.message});}
});
app.listen(process.env.PORT||3001,function(){console.log("ok");});

