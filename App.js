import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, Share
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const KEY = "aling-nena-pos-v1";
const money = n => "₱" + Number(n || 0).toLocaleString("en-PH", {minimumFractionDigits:2, maximumFractionDigits:2});
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => today().slice(0,7);

const seed = {
  storeName: "Aling Nena",
  products: [],
  sales: [],
  cart: [],
  cashMovements: [],
  refunds: [],
};

export default function App() {
  const [data, setData] = useState(seed);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("Sell");
  const [scanOpen, setScanOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [productModal, setProductModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({name:"", sku:"", barcode:"", price:"", cost:"", stock:"", category:""});
  const [storeEdit, setStoreEdit] = useState("Aling Nena");
  const [reportMonth, setReportMonth] = useState(monthNow());
  const [cashForm, setCashForm] = useState({type:"in", amount:"", note:""});
  const [cashModal, setCashModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setData({...seed, ...JSON.parse(raw)});
      } catch(e) { Alert.alert("Storage error", "Could not load saved store data."); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, [data, loaded]);

  const setField = (k,v) => setForm(f => ({...f,[k]:v}));
  const openNew = () => {
    setEditing(null); setForm({name:"",sku:"",barcode:"",price:"",cost:"",stock:"",category:""});
    setProductModal(true);
  };
  const openEdit = p => {
    setEditing(p.id); setForm({name:p.name,sku:p.sku||"",barcode:p.barcode||"",price:String(p.price),cost:String(p.cost||0),stock:String(p.stock),category:p.category||""});
    setProductModal(true);
  };
  const saveProduct = () => {
    const price = Number(form.price), stock = Number(form.stock), cost = Number(form.cost || 0);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      Alert.alert("Check product details", "Enter a product name, valid price, and whole-number stock quantity."); return;
    }
    if (!editing && data.products.length >= 2000) { Alert.alert("Product limit reached", "This store supports up to 2,000 products."); return; }
    const duplicate = data.products.find(p => p.id !== editing && ((form.sku && p.sku === form.sku.trim()) || (form.barcode && p.barcode === form.barcode.trim())));
    if (duplicate) { Alert.alert("Duplicate code", "That SKU or barcode is already assigned to " + duplicate.name + "."); return; }
    const item = {id: editing || String(Date.now()), name:form.name.trim(), sku:form.sku.trim(), barcode:form.barcode.trim(), price, cost, stock, category:form.category.trim()};
    setData(d => ({...d, products: editing ? d.products.map(p => p.id===editing ? item : p) : [...d.products,item]}));
    setProductModal(false);
  };
  const addToCart = p => {
    if (p.stock <= 0) { Alert.alert("Out of stock", p.name + " has no available stock."); return; }
    setData(d => {
      const found = d.cart.find(x => x.productId === p.id);
      if (found && found.qty >= p.stock) return d;
      return {...d, cart: found ? d.cart.map(x => x.productId===p.id ? {...x,qty:x.qty+1} : x) : [...d.cart,{productId:p.id,name:p.name,price:p.price,cost:p.cost,qty:1}]};
    });
  };
  const changeQty = (id, delta) => setData(d => {
    const p = d.products.find(x=>x.id===id);
    const cartItem = d.cart.find(x=>x.productId===id);
    const next = (cartItem?.qty || 0) + delta;
    if (next > (p?.stock || 0)) return d;
    return {...d, cart: next <= 0 ? d.cart.filter(x=>x.productId!==id) : d.cart.map(x=>x.productId===id?{...x,qty:next}:x)};
  });
  const checkout = () => {
    if (!data.cart.length) return;
    const total = data.cart.reduce((s,x)=>s+x.price*x.qty,0);
    const sale = {id:String(Date.now()), date:new Date().toISOString(), items:data.cart.map(x=>({...x})), total,
      profit:data.cart.reduce((s,x)=>s+(x.price-(x.cost||0))*x.qty,0)};
    setData(d => ({...d, sales:[sale,...d.sales], products:d.products.map(p=>{
      const line=d.cart.find(x=>x.productId===p.id); return line?{...p,stock:p.stock-line.qty}:p;
    }), cart:[]}));
    Alert.alert("Sale completed", "Total collected: " + money(total));
  };


  const receiptHtml = sale => {
    const rows = sale.items.map(x => `<tr><td>${String(x.name).replace(/[<>&]/g,"")}</td><td>${x.qty}</td><td>${money(x.price*x.qty)}</td></tr>`).join("");
    return `<html><body style="font-family:Arial;padding:20px"><h2>${data.storeName}</h2><p>Sales receipt<br>${new Date(sale.date).toLocaleString()}<br>Receipt: ${sale.id}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="8"><tr><th>Item</th><th>Qty</th><th>Total</th></tr>${rows}</table><h2 style="text-align:right">TOTAL ${money(sale.total)}</h2><p>Thank you for shopping with us!</p></body></html>`;
  };
  const printReceipt = async sale => {
    try { await Print.printAsync({html:receiptHtml(sale)}); }
    catch(e) { Alert.alert("Receipt", "Could not open the print dialog on this device."); }
  };
  const exportSalesCsv = async () => {
    const rows = [["Receipt","Date","Items","Sales PHP","Estimated profit PHP"]];
    data.sales.forEach(s=>rows.push([s.id,new Date(s.date).toLocaleString(),s.items.map(i=>`${i.name} x${i.qty}`).join("; "),s.total,s.profit||0]));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const path=FileSystem.cacheDirectory+"aling-nena-sales.csv";
    await FileSystem.writeAsStringAsync(path,csv);
    if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(path,{mimeType:"text/csv",dialogTitle:"Export sales report"});
    else Alert.alert("Export saved",path);
  };
  const exportProductsCsv = async () => {
    const rows=[["name","sku","barcode","category","price","cost","stock"]];
    data.products.forEach(p=>rows.push([p.name,p.sku,p.barcode,p.category,p.price,p.cost,p.stock]));
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const path=FileSystem.cacheDirectory+"aling-nena-products.csv";
    await FileSystem.writeAsStringAsync(path,csv);
    if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(path,{mimeType:"text/csv",dialogTitle:"Export product list"});
    else Alert.alert("Export saved",path);
  };
  const importProductsCsv = async () => {
    try {
      const pick=await DocumentPicker.getDocumentAsync({type:["text/csv","text/comma-separated-values","application/vnd.ms-excel"],copyToCacheDirectory:true});
      if(pick.canceled) return;
      const csv=await FileSystem.readAsStringAsync(pick.assets[0].uri);
      const lines=csv.split(/\r?\n/).filter(Boolean);
      if(lines.length<2) return Alert.alert("Import", "CSV has no product rows.");
      const parseLine=line => {
        const out=[]; let cur="", quoted=false;
        for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'&&line[i+1]==='"'){cur+='"';i++;} else if(c==='"') quoted=!quoted; else if(c===","&&!quoted){out.push(cur);cur="";} else cur+=c;}
        out.push(cur); return out;
      };
      const headers=parseLine(lines[0]).map(x=>x.trim().toLowerCase());
      const idx=k=>headers.indexOf(k);
      const imported=lines.slice(1).map(parseLine).map(r=>({
        id:String(Date.now())+Math.random().toString(16).slice(2),
        name:r[idx("name")]||"",sku:r[idx("sku")]||"",barcode:r[idx("barcode")]||"",
        category:r[idx("category")]||"",price:Number(r[idx("price")]||0),
        cost:Number(r[idx("cost")]||0),stock:Number(r[idx("stock")]||0)
      })).filter(p=>p.name && Number.isFinite(p.price)&&Number.isInteger(p.stock)&&p.stock>=0);
      setData(d=>{
        const byCode=new Map(d.products.map(p=>[p.barcode||p.sku,p]));
        imported.forEach(p=>{const code=p.barcode||p.sku;if(code&&byCode.has(code)){const old=byCode.get(code);Object.assign(old,p,{id:old.id});}else byCode.set(code||p.id,p);});
        const products=Array.from(byCode.values());
        if(products.length>2000){Alert.alert("Import limit","Import would exceed 2,000 products.");return d;}
        return {...d,products};
      });
      Alert.alert("Import complete",`${imported.length} valid product rows processed.`);
    } catch(e){Alert.alert("Import failed","Please check the CSV format and try again.");}
  };
  const backupData = async () => {
    try {
      const path=FileSystem.cacheDirectory+"aling-nena-backup.json";
      await FileSystem.writeAsStringAsync(path,JSON.stringify(data,null,2));
      if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(path,{mimeType:"application/json",dialogTitle:"Back up Aling Nena data"});
      else Alert.alert("Backup created",path);
    } catch(e){Alert.alert("Backup failed","Could not create backup file.");}
  };
  const restoreData = async () => {
    try {
      const pick=await DocumentPicker.getDocumentAsync({type:["application/json"],copyToCacheDirectory:true});
      if(pick.canceled)return;
      const restored=JSON.parse(await FileSystem.readAsStringAsync(pick.assets[0].uri));
      if(!Array.isArray(restored.products)||!Array.isArray(restored.sales)||restored.products.length>2000) throw new Error("Invalid backup");
      Alert.alert("Restore backup","Replace the current store data with this backup?",[
        {text:"Cancel",style:"cancel"},{text:"Restore",style:"destructive",onPress:()=>setData({...seed,...restored,cart:[]})}
      ]);
    } catch(e){Alert.alert("Restore failed","This file is not a valid Aling Nena backup.");}
  };
  const saveCashMovement = () => {
    const amount=Number(cashForm.amount);
    if(!Number.isFinite(amount)||amount<=0){Alert.alert("Enter amount","Amount must be greater than zero.");return;}
    const movement={id:String(Date.now()),date:new Date().toISOString(),type:cashForm.type,amount,note:cashForm.note.trim()};
    setData(d=>({...d,cashMovements:[movement,...(d.cashMovements||[])]}));
    setCashModal(false);setCashForm({type:"in",amount:"",note:""});
  };
  const refundSale = sale => Alert.alert("Refund sale",`Record a full refund of ${money(sale.total)}? Stock will be returned to inventory.`,[
    {text:"Cancel",style:"cancel"},
    {text:"Refund",style:"destructive",onPress:()=>{
      if((data.refunds||[]).some(r=>r.saleId===sale.id)) return Alert.alert("Already refunded","This sale has already been refunded.");
      setData(d=>({...d,refunds:[{saleId:sale.id,date:new Date().toISOString(),amount:sale.total},...(d.refunds||[])],
        products:d.products.map(p=>{const line=sale.items.find(i=>i.productId===p.id);return line?{...p,stock:p.stock+line.qty}:p;})}));
    }}
  ]);

  const onBarcode = ({data: code}) => {
    setScanOpen(false);
    const p = data.products.find(x=>x.barcode===code || x.sku===code);
    if (p) { addToCart(p); setTab("Sell"); }
    else Alert.alert("Product not found", "No product matches code: " + code + ". Add it in Inventory first.");
  };

  const filtered = useMemo(() => data.products.filter(p => (p.name+" "+p.sku+" "+p.barcode+" "+p.category).toLowerCase().includes(search.toLowerCase())), [data.products,search]);
  const dailySales = data.sales.filter(s=>s.date.slice(0,10)===today());
  const monthSales = data.sales.filter(s=>s.date.slice(0,7)===reportMonth);
  const sum = arr => arr.reduce((a,s)=>a+s.total,0);
  const profit = arr => arr.reduce((a,s)=>a+(s.profit||0),0);
  const lowStock = data.products.filter(p=>p.stock<=5).length;
  const cartTotal = data.cart.reduce((s,x)=>s+x.price*x.qty,0);

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert("Camera permission needed", "Allow camera access to scan barcodes and QR codes."); return; }
    }
    setScanOpen(true);
  };

  const Header = () => <View style={styles.header}>
    <View><Text style={styles.brand}>{data.storeName || "My Store"}</Text><Text style={styles.subbrand}>STORE MANAGEMENT & POS</Text></View>
    <View style={styles.countPill}><Text style={styles.countText}>{data.products.length}/2000 ITEMS</Text></View>
  </View>;
  const Btn = ({title,onPress,kind="primary",small=false}) => <TouchableOpacity onPress={onPress} style={[styles.btn,kind==="secondary"&&styles.secondary,kind==="danger"&&styles.danger,small&&styles.smallBtn]}><Text style={[styles.btnText,kind==="secondary"&&styles.secondaryText]}>{title}</Text></TouchableOpacity>;
  const Metric = ({label,value,detail}) => <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text>{detail?<Text style={styles.metricDetail}>{detail}</Text>:null}</View>;

  if (!loaded) return <SafeAreaView style={styles.center}><Text>Loading Aling Nena POS…</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark"/>
    <Header/>
    <View style={styles.tabs}>
      {["Sell","Inventory","Reports","Settings"].map(t=><TouchableOpacity key={t} onPress={()=>setTab(t)} style={[styles.tab,tab===t&&styles.activeTab]}><Text style={[styles.tabText,tab===t&&styles.activeTabText]}>{t}</Text></TouchableOpacity>)}
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {tab==="Sell" && <>
        <Text style={styles.heading}>Point of sale</Text>
        <View style={styles.row}><View style={{flex:1}}><Text style={styles.muted}>Current cart</Text><Text style={styles.bigTotal}>{money(cartTotal)}</Text></View><Btn title="Scan code" onPress={startScan}/></View>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search product, SKU or barcode…" style={styles.input}/>
        {filtered.map(p=><TouchableOpacity key={p.id} style={styles.productRow} onPress={()=>addToCart(p)}>
          <View style={{flex:1}}><Text style={styles.productName}>{p.name}</Text><Text style={styles.muted}>{p.sku || "No SKU"} · Stock: {p.stock}</Text></View><Text style={styles.price}>{money(p.price)}</Text><Text style={styles.add}>＋</Text>
        </TouchableOpacity>)}
        <Text style={styles.sectionTitle}>Cart ({data.cart.length})</Text>
        {data.cart.map(x=><View key={x.productId} style={styles.cartRow}><View style={{flex:1}}><Text style={styles.productName}>{x.name}</Text><Text style={styles.muted}>{money(x.price)} each</Text></View><TouchableOpacity onPress={()=>changeQty(x.productId,-1)} style={styles.qty}><Text>−</Text></TouchableOpacity><Text style={styles.qtyNum}>{x.qty}</Text><TouchableOpacity onPress={()=>changeQty(x.productId,1)} style={styles.qty}><Text>＋</Text></TouchableOpacity></View>)}
        <Btn title={"Complete sale · "+money(cartTotal)} onPress={checkout} />
        <Btn title="Clear cart" kind="secondary" onPress={()=>setData(d=>({...d,cart:[]}))}/>
      </>}
      {tab==="Inventory" && <>
        <Text style={styles.heading}>Inventory</Text>
        <View style={styles.metrics}><Metric label="PRODUCTS" value={data.products.length+"/2000"}/><Metric label="LOW STOCK" value={lowStock} detail="5 units or fewer"/></View>
        <Btn title="＋ Add product" onPress={openNew}/>
        <View style={styles.row}><Btn title="Import CSV" small kind="secondary" onPress={importProductsCsv}/><Btn title="Export products" small kind="secondary" onPress={exportProductsCsv}/></View>
        <TextInput value={search} onChangeText={setSearch} placeholder="Search inventory…" style={styles.input}/>
        {filtered.map(p=><TouchableOpacity key={p.id} onPress={()=>openEdit(p)} style={styles.productRow}>
          <View style={{flex:1}}><Text style={styles.productName}>{p.name}</Text><Text style={styles.muted}>{p.category||"Uncategorized"} · {p.sku||"No SKU"}</Text><Text style={styles.muted}>Barcode/QR: {p.barcode||"Not set"}</Text></View>
          <View style={{alignItems:"flex-end"}}><Text style={styles.price}>{money(p.price)}</Text><Text style={[styles.stock,p.stock<=5&&{color:"#b45309"}]}>{p.stock} in stock</Text></View>
        </TouchableOpacity>)}
        {!filtered.length&&<Text style={styles.empty}>No products yet. Add your first item.</Text>}
      </>}
      {tab==="Reports" && <>
        <Text style={styles.heading}>Sales reports</Text>
        <Text style={styles.sectionTitle}>Today · {today()}</Text>
        <View style={styles.metrics}><Metric label="SALES" value={money(sum(dailySales))} detail={dailySales.length+" transactions"}/><Metric label="EST. PROFIT" value={money(profit(dailySales))}/></View>
        <Text style={styles.sectionTitle}>Monthly report</Text>
        <TextInput value={reportMonth} onChangeText={setReportMonth} placeholder="YYYY-MM" style={styles.input} maxLength={7}/>
        <View style={styles.metrics}><Metric label="MONTHLY SALES" value={money(sum(monthSales))} detail={monthSales.length+" transactions"}/><Metric label="EST. PROFIT" value={money(profit(monthSales))}/></View>
        <View style={styles.row}><Text style={styles.sectionTitle}>Transactions</Text><Btn title="Export sales CSV" small onPress={exportSalesCsv}/></View>
        {data.sales.filter(s=>s.date.slice(0,7)===reportMonth).map(s=><View key={s.id} style={styles.productRow}><View style={{flex:1}}><Text style={styles.productName}>{new Date(s.date).toLocaleString()}</Text><Text style={styles.muted}>{s.items.reduce((n,x)=>n+x.qty,0)} items · {s.id}</Text>{(data.refunds||[]).some(r=>r.saleId===s.id)&&<Text style={{color:"#b91c1c",fontSize:11,fontWeight:"800"}}>REFUNDED</Text>}</View><View><Text style={styles.price}>{money(s.total)}</Text><TouchableOpacity onPress={()=>printReceipt(s)}><Text style={styles.link}>Print receipt</Text></TouchableOpacity>{!(data.refunds||[]).some(r=>r.saleId===s.id)&&<TouchableOpacity onPress={()=>refundSale(s)}><Text style={styles.refund}>Refund sale</Text></TouchableOpacity>}</View></View>)}
        {!monthSales.length&&<Text style={styles.empty}>No sales recorded for this month.</Text>}
        <Text style={styles.sectionTitle}>Cash in / cash out</Text>
        <Btn title="＋ Record cash movement" onPress={()=>setCashModal(true)}/>
        <View style={styles.metrics}>
          <Metric label="CASH IN" value={money((data.cashMovements||[]).filter(x=>x.date.slice(0,7)===reportMonth&&x.type==="in").reduce((a,x)=>a+x.amount,0))}/>
          <Metric label="CASH OUT" value={money((data.cashMovements||[]).filter(x=>x.date.slice(0,7)===reportMonth&&x.type==="out").reduce((a,x)=>a+x.amount,0))}/>
        </View>
        {(data.cashMovements||[]).filter(x=>x.date.slice(0,7)===reportMonth).map(x=><View key={x.id} style={styles.productRow}><View style={{flex:1}}><Text style={styles.productName}>{x.type==="in"?"Cash in":"Cash out"}</Text><Text style={styles.muted}>{new Date(x.date).toLocaleString()} · {x.note||"No note"}</Text></View><Text style={styles.price}>{money(x.amount)}</Text></View>)}
      </>}
      {tab==="Settings" && <>
        <Text style={styles.heading}>Store settings</Text>
        <Text style={styles.label}>Store name</Text>
        <TextInput value={storeEdit} onChangeText={setStoreEdit} placeholder="Store name" style={styles.input}/>
        <Btn title="Save store name" onPress={()=>{if(!storeEdit.trim())return Alert.alert("Enter a store name");setData(d=>({...d,storeName:storeEdit.trim()}));Alert.alert("Saved","Store name updated.");}}/>
        <Text style={styles.sectionTitle}>Store profile</Text>
        <View style={styles.info}><Text style={styles.muted}>Currency</Text><Text style={styles.productName}>Philippine Peso (₱ PHP)</Text></View>
        <View style={styles.info}><Text style={styles.muted}>Access</Text><Text style={styles.productName}>Single owner / administrator</Text></View>
        <View style={styles.info}><Text style={styles.muted}>Product capacity</Text><Text style={styles.productName}>Up to 2,000 items</Text></View>
        <Text style={styles.sectionTitle}>Data backup</Text>
        <Btn title="Create backup file" onPress={backupData}/>
        <Btn title="Restore from backup" kind="secondary" onPress={restoreData}/>
        <Text style={styles.note}>Data is stored locally on this device. Create backups regularly and keep a copy somewhere safe. Restore replaces current data. CSV product import expects columns: name, sku, barcode, category, price, cost, stock.</Text>
      </>}
    </ScrollView>

    <Modal visible={productModal} animationType="slide" onRequestClose={()=>setProductModal(false)}>
      <SafeAreaView style={styles.modal}>
        <Text style={styles.heading}>{editing?"Edit product":"Add product"}</Text>
        {[
          ["name","Product name"],["sku","SKU"],["barcode","Barcode or QR value"],["category","Category"],["price","Selling price (₱)"],["cost","Cost price (₱)"],["stock","Opening stock (whole number)"]
        ].map(([k,label])=><View key={k}><Text style={styles.label}>{label}</Text><TextInput value={form[k]} onChangeText={v=>setField(k,v)} placeholder={label} style={styles.input} keyboardType={["price","cost","stock"].includes(k)?"decimal-pad":"default"}/></View>)}
        <Btn title="Save product" onPress={saveProduct}/>
        <Btn title="Cancel" kind="secondary" onPress={()=>setProductModal(false)}/>
      </SafeAreaView>
    </Modal>

    <Modal visible={cashModal} animationType="slide" transparent onRequestClose={()=>setCashModal(false)}>
      <View style={styles.modalBackdrop}><View style={styles.cashCard}>
        <Text style={styles.heading}>Cash movement</Text>
        <View style={styles.row}>
          <Btn title="Cash in" kind={cashForm.type==="in"?"primary":"secondary"} small onPress={()=>setCashForm(f=>({...f,type:"in"}))}/>
          <Btn title="Cash out" kind={cashForm.type==="out"?"primary":"secondary"} small onPress={()=>setCashForm(f=>({...f,type:"out"}))}/>
        </View>
        <Text style={styles.label}>Amount (₱)</Text><TextInput value={cashForm.amount} onChangeText={v=>setCashForm(f=>({...f,amount:v}))} keyboardType="decimal-pad" placeholder="0.00" style={styles.input}/>
        <Text style={styles.label}>Note / reason</Text><TextInput value={cashForm.note} onChangeText={v=>setCashForm(f=>({...f,note:v}))} placeholder="e.g. petty cash, supplier payment" style={styles.input}/>
        <Btn title="Save cash movement" onPress={saveCashMovement}/>
        <Btn title="Cancel" kind="secondary" onPress={()=>setCashModal(false)}/>
      </View></View>
    </Modal>

    <Modal visible={scanOpen} animationType="slide" onRequestClose={()=>setScanOpen(false)}>
      <SafeAreaView style={styles.scanScreen}>
        <Text style={styles.heading}>Scan barcode or QR code</Text>
        <Text style={styles.muted}>Point your camera at a product code.</Text>
        <View style={styles.cameraWrap}>
          <CameraView style={{flex:1}} facing="back" onBarcodeScanned={onBarcode} barcodeScannerSettings={{barcodeTypes:["qr","ean13","ean8","upc_a","upc_e","code128","code39","itf14","pdf417","datamatrix"]}}/>
        </View>
        <Btn title="Close scanner" kind="secondary" onPress={()=>setScanOpen(false)}/>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#f6f7fb"},center:{flex:1,alignItems:"center",justifyContent:"center"},
 header:{paddingHorizontal:18,paddingTop:12,paddingBottom:14,backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
 brand:{fontSize:24,fontWeight:"900",color:"#172554"},subbrand:{fontSize:10,letterSpacing:1.5,color:"#64748b",marginTop:3},
 countPill:{backgroundColor:"#e0e7ff",paddingHorizontal:10,paddingVertical:7,borderRadius:20},countText:{fontSize:10,fontWeight:"800",color:"#3730a3"},
 tabs:{flexDirection:"row",backgroundColor:"#fff",borderTopWidth:1,borderBottomWidth:1,borderColor:"#e5e7eb"},
 tab:{flex:1,paddingVertical:13,alignItems:"center"},activeTab:{borderBottomWidth:3,borderColor:"#4f46e5"},tabText:{fontSize:12,color:"#64748b",fontWeight:"700"},activeTabText:{color:"#3730a3"},
 content:{padding:16,paddingBottom:40},heading:{fontSize:24,fontWeight:"900",color:"#172554",marginBottom:16},row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:14},
 muted:{fontSize:12,color:"#64748b",marginTop:3},bigTotal:{fontSize:28,fontWeight:"900",color:"#111827",marginTop:4},
 btn:{backgroundColor:"#4f46e5",padding:14,borderRadius:12,alignItems:"center",marginVertical:6},btnText:{color:"#fff",fontWeight:"800"},secondary:{backgroundColor:"#eef2ff"},secondaryText:{color:"#3730a3"},danger:{backgroundColor:"#b91c1c"},smallBtn:{padding:8},
 input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e8f0",borderRadius:11,padding:12,fontSize:14,marginVertical:7,color:"#111827"},
 productRow:{backgroundColor:"#fff",padding:13,borderRadius:12,marginVertical:5,flexDirection:"row",alignItems:"center",gap:10,borderWidth:1,borderColor:"#eef0f5"},
 productName:{fontWeight:"800",fontSize:14,color:"#1f2937"},price:{fontWeight:"900",color:"#3730a3"},add:{fontSize:24,color:"#4f46e5",fontWeight:"700"},stock:{fontSize:12,color:"#15803d",marginTop:4},
 sectionTitle:{fontSize:16,fontWeight:"900",color:"#1f2937",marginTop:18,marginBottom:8},cartRow:{backgroundColor:"#fff",padding:12,borderRadius:10,marginVertical:4,flexDirection:"row",alignItems:"center",gap:10},
 qty:{width:30,height:30,borderRadius:8,backgroundColor:"#eef2ff",alignItems:"center",justifyContent:"center"},qtyNum:{fontWeight:"800",minWidth:18,textAlign:"center"},
 metrics:{flexDirection:"row",gap:10,marginVertical:8},metric:{flex:1,backgroundColor:"#fff",borderRadius:13,padding:14,borderWidth:1,borderColor:"#edf0f5"},metricLabel:{fontSize:10,color:"#64748b",fontWeight:"800"},metricValue:{fontSize:19,fontWeight:"900",color:"#172554",marginTop:7},metricDetail:{fontSize:11,color:"#64748b",marginTop:4},
 empty:{textAlign:"center",color:"#64748b",padding:22},link:{color:"#3730a3",fontSize:11,fontWeight:"800",marginTop:5},refund:{color:"#b91c1c",fontSize:11,fontWeight:"800",marginTop:5},modalBackdrop:{flex:1,backgroundColor:"rgba(15,23,42,0.45)",justifyContent:"center",padding:18},cashCard:{backgroundColor:"#f6f7fb",borderRadius:18,padding:18},label:{fontSize:12,fontWeight:"800",color:"#475569",marginTop:8},modal:{flex:1,backgroundColor:"#f6f7fb",padding:18},info:{backgroundColor:"#fff",padding:14,borderRadius:11,marginVertical:5},note:{fontSize:12,lineHeight:18,color:"#64748b",marginTop:18},
 scanScreen:{flex:1,padding:16,backgroundColor:"#f6f7fb"},cameraWrap:{height:430,overflow:"hidden",borderRadius:16,marginVertical:18,backgroundColor:"#111"}
});
