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
var results={};
var tests=[
{name:"ean_code",url:KEEPA+"/product?key="+k+"&domain=2&code=5000386005168&stats=90"},
{name:"ean_history0",url:KEEPA+"/product?key="+k+"&domain=2&history=0&code=5000386005168"},
{name:"asin_uk",url:KEEPA+"/product?key="+k+"&domain=2&asin=B07DFHTZJ2&stats=90"}
];
for(var i=0;i<tests.length;i++){
try{
var r=await fetch(tests[i].url);
var d=await r.json();
results[tests[i].name]={status:r.status,tokens:d.tokensLeft,error:d.error,products:d.products?d.products.length:0,sample:d.products&&d.products[0]?{title:d.products[0].title,eans:d.products[0].eanList}:null};
}catch(e){results[tests[i].name]={error:e.message};}
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
console.log("FETCH:"+url.substring(0,150));
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
var bsr=null;
var monthlySales=null;
if(kp.stats){
var bb=kp.stats.buyBoxPrice;
var cur=kp.stats.current&&kp.stats.current[1];
price=bb>0?bb/100:cur>0?cur/100:null;
var bsrVal=kp.stats.current&&kp.stats.current[3];
if(bsrVal&&bsrVal>0){
bsr=bsrVal;
if(bsr<1000)monthlySales=500;
else if(bsr<5000)monthlySales=200;
else if(bsr<10000)monthlySales=100;
else if(bsr<20000)monthlySales=60;
else if(bsr<50000)monthlySales=30;
else if(bsr<100000)monthlySales=15;
else if(bsr<200000)monthlySales=8;
else if(bsr<500000)monthlySales=3;
else monthlySales=1;
}
}
(kp.eanList||[]).forEach(function(ean){
if(price)priceMap[ean]={price:price,bsr:bsr,monthlySales:monthlySales};
});
});
}
if(b<batches.length-1){await new Promise(function(r){setTimeout(r,3000);});}
}catch(e){console.log("KEEPA error:"+e.message);}
}
var matched=0;
items=items.map(function(p){
var kp=priceMap[p.gtin]||null;
if(kp)matched++;
return Object.assign({},p,{
amazonPrice:kp?kp.price:null,
bsr:kp?kp.bsr:null,
monthlySales:kp?kp.monthlySales:null,
hasRealPrice:!!kp
});
});
console.log("KEEPA matched:"+matched+"/"+items.length);
}
res.json({products:items,total:items.length});
}catch(e){
console.log("SCAN error:"+e.message);
res.status(500).json({error:e.message});
}
});
// LOOKUP: get product by QID
app.post("/api/lookup",async function(req,res){
  const {token,qid}=req.body;
  if(!token||!qid)return res.json({error:"Missing token or qid"});
  try{
    const r=await fetch("https://api.qogita.com/variants/"+qid+"/",{headers:{Authorization:"Bearer "+token}});
    if(!r.ok)return res.json({error:"Product not found on Qogita"});
    const d=await r.json();
    const price=d.minPrice||d.price||null;
    res.json({name:d.name||d.title||"Unknown",brand:d.brandName||d.brand||"Unknown",gtin:d.gtin||d.ean||qid,price:price?parseFloat(price):0,image:d.imageUrl||null});
  }catch(e){res.json({error:"Lookup failed: "+e.message});}
});

// WATCHCHECK: check current prices for watchlist QIDs
app.post("/api/watchcheck",async function(req,res){
  const {token,items}=req.body;
  if(!token||!items||!items.length)return res.json({results:[]});
  try{
    const results=[];
    for(const qid of items){
      try{
        const r=await fetch("https://api.qogita.com/variants/"+qid+"/",{headers:{Authorization:"Bearer "+token}});
        if(r.ok){const d=await r.json();const price=d.minPrice||d.price||null;results.push({qid,price:price?parseFloat(price):0});}
      }catch(e){console.log("watchcheck error "+qid+":"+e.message);}
      await new Promise(function(resolve){setTimeout(resolve,300);});
    }
    res.json({results});
  }catch(e){res.json({results:[],error:e.message});}
});

app.listen(process.env.PORT||3001,function(){console.log("ok");});
