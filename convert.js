// File converters. All run in the browser, free libraries, nothing is uploaded.
const load=(u)=>import(/* @vite-ignore */u);
const rd=(f)=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsArrayBuffer(f)});
const isAr=(s)=>/[\u0600-\u06FF]/.test(s||'');
export function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
const base=(f)=>f.name.replace(/\.[^.]+$/,'');
async function imgToCanvasPng(file){
  const url=URL.createObjectURL(file);
  const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=url});
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0);
  URL.revokeObjectURL(url);
  return new Promise(ok=>c.toBlob(b=>b.arrayBuffer().then(ok),'image/png'));
}
export async function imagesToPdf(files){
  const {PDFDocument}=await load('https://esm.sh/pdf-lib@1.17.1');
  const pdf=await PDFDocument.create();
  for(const f of files){
    let bytes,img;
    if(f.type==='image/jpeg'){bytes=await rd(f);img=await pdf.embedJpg(bytes)}
    else{bytes=f.type==='image/png'?await rd(f):await imgToCanvasPng(f);img=await pdf.embedPng(bytes)}
    const max=1200,s=Math.min(1,max/Math.max(img.width,img.height));
    const w=img.width*s,h=img.height*s;
    const p=pdf.addPage([w,h]);p.drawImage(img,{x:0,y:0,width:w,height:h});
  }
  const out=await pdf.save();
  return {blob:new Blob([out],{type:'application/pdf'}),name:(files.length>1?'images':base(files[0]))+'.pdf'};
}
async function docxFromBlocks(blocks,rtl){
  const D=await load('https://esm.sh/docx@8.5.0');
  const kids=[];
  for(const b of blocks){
    if(b.type==='p'){
      kids.push(new D.Paragraph({bidirectional:rtl,alignment:rtl?D.AlignmentType.RIGHT:D.AlignmentType.LEFT,children:[new D.TextRun({text:b.text,rightToLeft:rtl,font:rtl?'Arial':undefined})]}));
    }else if(b.type==='table'){
      kids.push(new D.Table({visuallyRightToLeft:rtl,width:{size:100,type:D.WidthType.PERCENTAGE},
        rows:b.rows.map(r=>new D.TableRow({children:r.map(c=>new D.TableCell({children:[new D.Paragraph({bidirectional:rtl,children:[new D.TextRun({text:String(c??''),rightToLeft:rtl})]})]}))}))}));
      kids.push(new D.Paragraph({text:''}));
    }
  }
  const doc=new D.Document({sections:[{children:kids}]});
  return D.Packer.toBlob(doc);
}
export async function pdfToWord(file){
  const pdfjs=await load('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  const doc=await pdfjs.getDocument({data:await rd(file)}).promise;
  const blocks=[];let all='';
  for(let i=1;i<=doc.numPages;i++){
    const pg=await doc.getPage(i);const tc=await pg.getTextContent();
    let line='',lastY=null;
    for(const it of tc.items){
      const y=Math.round(it.transform[5]);
      if(lastY!==null&&Math.abs(y-lastY)>3){if(line.trim())blocks.push({type:'p',text:line.trim()});all+=line;line=''}
      line+=it.str+(it.hasEOL?'\n':'');lastY=y;
    }
    if(line.trim())blocks.push({type:'p',text:line.trim()});all+=line;
  }
  if(!all.trim())throw new Error('الملف عبارة عن صور ممسوحة ضوئيًا ولا يحتوي نصًا قابلًا للنسخ');
  const blob=await docxFromBlocks(blocks,isAr(all));
  return {blob,name:base(file)+'.docx',note:'يتم نقل النص فقط. الصور والتنسيق المعقد لا تُنقل.'};
}
export async function wordToPdf(file){
  const m=await load('https://esm.sh/mammoth@1.8.0');
  const r=await m.default.convertToHtml({arrayBuffer:await rd(file)});
  const rtl=isAr(r.value.replace(/<[^>]+>/g,''));
  const w=window.open('','_blank');
  if(!w)throw new Error('اسمح بالنوافذ المنبثقة ثم أعد المحاولة');
  w.document.write(`<!doctype html><html dir="${rtl?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${base(file)}</title><style>body{font-family:Arial,sans-serif;font-size:14px;line-height:1.7;padding:24px}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%}</style></head><body>${r.value}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
  w.document.close();
  return {note:'اختر "حفظ كـ PDF" من نافذة الطباعة.'};
}
export async function excelToWord(file){
  const X=await load('https://esm.sh/xlsx@0.18.5');
  const wb=X.read(await rd(file));
  const blocks=[];let all='';
  for(const n of wb.SheetNames){
    const rows=X.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:''});
    if(!rows.length)continue;
    if(wb.SheetNames.length>1)blocks.push({type:'p',text:n});
    blocks.push({type:'table',rows});all+=JSON.stringify(rows);
  }
  const blob=await docxFromBlocks(blocks,isAr(all));
  return {blob,name:base(file)+'.docx'};
}
export async function wordToExcel(file){
  const m=await load('https://esm.sh/mammoth@1.8.0');
  const X=await load('https://esm.sh/xlsx@0.18.5');
  const r=await m.default.convertToHtml({arrayBuffer:await rd(file)});
  const div=document.createElement('div');div.innerHTML=r.value;
  const wb=X.utils.book_new();
  const tables=[...div.querySelectorAll('table')];
  if(tables.length){
    tables.forEach((t,i)=>{
      const rows=[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim()));
      X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'جدول '+(i+1));
    });
  }else{
    const rows=[...div.querySelectorAll('p,h1,h2,h3,li')].map(p=>[p.textContent.trim()]).filter(r=>r[0]);
    X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'نص');
  }
  const out=X.write(wb,{bookType:'xlsx',type:'array'});
  return {blob:new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name:base(file)+'.xlsx',
    note:tables.length?null:'لم أجد جداول في الملف، فوضعت كل فقرة في صف. التحويل أدق مع الجداول.'};
}
export const TOOLS=[
 {id:'img2pdf',name:'صورة إلى PDF',accept:'image/*',multiple:true,run:imagesToPdf},
 {id:'pdf2word',name:'PDF إلى Word',accept:'.pdf',run:(f)=>pdfToWord(f[0])},
 {id:'word2pdf',name:'Word إلى PDF',accept:'.docx',run:(f)=>wordToPdf(f[0])},
 {id:'xls2word',name:'Excel إلى Word',accept:'.xlsx,.xls,.csv',run:(f)=>excelToWord(f[0])},
 {id:'word2xls',name:'Word إلى Excel',accept:'.docx',run:(f)=>wordToExcel(f[0])},
];
