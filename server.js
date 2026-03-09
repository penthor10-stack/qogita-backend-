var express = require("express");
var cors = require("cors");
var fetch = require("node-fetch");
var app = express();
app.use(cors({origin:"*"}));
app.use(express.json());
var QOGITA = "https://api.qogita.com";
var KEEPA = "https://api.keepa.com";
app.get("/",function(req,res){res.json({status:"ok",message:"Qogita Backend Running"});});
app.post("/api/login",async function(req,res){
try{
var r=await fetch(QOGITA+"/auth/login/",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:req.body.email,password:req.body.password})});
var d=await r.json();
if(!r.ok)return res.status(r.status).json({error:d.detail||"Login failed"});
res.json({accessToken:d.accessToken,user:d.user});
}catch(e){res.status(500).json({error:e.message});}
});
app.get("/testk",async function(req,res){
var k=req.query.k;
var urls=[
KEEPA+"/product?key="+k+"&domain=2&code=5000386005168&stats=90",
KEEPA+"/product?key="+k+"&domain=2&asin=B00004NKIQ&stats=90",
KEEPA+"/search?key="+k+"&domain=2&type=product&term=wella"
];
var results={};
for(var i=0;i<urls.length;i++){
try{
var r=await fetch(urls[i]);
var d=await r.json();
results["test"+i]={status:r.status,tokens:d.tokensLeft,error:d.error,products:d.products?d.products.length:0};
}catch(e){results["test"+i]={error:e.message};}
}
res.json(results);
});
app.post("/api/scan",async function(req,res){
try{
var t=req.headers.authorization.replace("Bearer ","");
var cat=req.body.category||"Hair";
var brands=req.body.brands||[];
var keepaKey=req.body.keepaKey||"";
console.log("SCAN cat:"+cat+" keepa:"+(keepaKey?"YES":"NO"));
var url=QOGITA+"/search/offers/?stock_availability=in_stock&size=100";
if(brands.length>0){
brands.forEach(function(b){url=url+"&brand_name="+encodeURIComponent(b);});
}else{
url=url+"&category_name="+encodeURIComponent(cat);
}
var r=await fetch(url,{headers:{Authorization:"Bearer "+t}});
var d=await r.json();
var items=(d.results||[]).map(function(p){
var brand=p.brand&&p.brand.name?p.brand.name:p.brandName||p.brand_name||p.brand||"";
return{gtin:p.gtin||"",name:(p.name||p.title||"").substring(0,80),brand:brand,category:cat,buyPrice:parseFloat(p.minPrice||p.unit_price||p.price||0),inventory:parseInt(p.inventory||p.available_quantity||0),amazonPrice:null,hasRealPrice:false};
}).filter(function(p){return p.buyPrice>0&&p.gtin;});
console.log("QOGITA items:"+items.length);
if(keepaKey&&items.length>0){
var gtins=items.map(function(p){return p.gtin;});
var batches=[];
for(var i=0;i<gtins.length;i+=20){batches.push(gtins.slice(i,i+20));}
var priceMap={};
for(var b=0;b<batches.length;b++){
try{
var kurl=KEEPA+"/product?key="+keepaKey+"&domain=2&code="+batches[b].join(",")+"&stats=90";
var kr=await fetch(kurl);
var kd=await kr.json();
console.log("KEEPA batch "+b+" status:"+kr.status+" tokens:"+kd.tokensLeft+" products:"+(kd.products?kd.products.length:0)+" error:"+JSON.stringify(kd.error));
if(kd.products){
kd.products.forEach(function(kp){
var price=null;
if(kp.stats){
var bb=kp.stats.buyBoxPrice;
var cur=kp.stats.current&&kp.stats.current[1];
price=bb>0?bb/100:cur>0?cur/100:null;
}
(kp.eanList||[]).forEach(function(ean){if(price)priceMap[ean]=price;});
});
}
if(b<batches.length-1){await new Promise(function(r){setTimeout(r,3000);});}
}catch(e){console.log("KEEPA error:"+e.message);}
}
var matched=0;
items=items.map(function(p){
var ap=priceMap[p.gtin]||null;
if(ap)matched++;
return Object.assign({},p,{amazonPrice:ap,hasRealPrice:!!ap});
});
console.log("KEEPA matched:"+matched+"/"+items.length);
}
res.json({products:items,total:items.length});
}catch(e){
console.log("SCAN error:"+e.message);
res.status(500).json({error:e.message});
}
});
app.listen(process.env.PORT||3001,function(){console.log("ok");});
