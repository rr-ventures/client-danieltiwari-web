import { getStore } from "@netlify/blobs";
const SITE="d840f88f-717e-4b43-bc21-63522c048198";
const envs=await(await fetch(`https://api.netlify.com/api/v1/accounts/-/env?site_id=${SITE}`,{headers:{Authorization:`Bearer ${process.env.NETLIFY_API_KEY}`}})).json();
const val=k=>envs.find(e=>e.key===k)?.values?.[0]?.value;
const opts={siteID:val("BLOBS_SITE_ID")||SITE,token:val("BLOBS_TOKEN")};
const pages=getStore({name:"assessment-result-pages",...opts});
const results=getStore({name:"assessment-results",...opts});
const {blobs}=await pages.list();
console.log("EVERY WRITTEN RESULT, READ BACK INDEPENDENTLY:");
let missing=0;
for (const b of blobs) {
  const p=await pages.get(b.key,{type:"json"});
  const who=await results.get(b.key,{type:"json"}).catch(()=>null);
  const has=Boolean(p.accessKey);
  if(!has) missing++;
  console.log(`  ${b.key} | ${who?.answers?.email||"?"} | ${p.status} | key present: ${has} | key length: ${p.accessKey?p.accessKey.length:0}`);
}
console.log(`RESULTS WITH NO KEY: ${missing}`);
