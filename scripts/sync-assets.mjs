import './sync-materials.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUILD_VERSION,API_VERSION,PRELOAD_APP} from '../assets/js/build-version.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
if(!read('apps-script/Config.gs').includes("apiVersion: '"+API_VERSION+"'"))throw Error('Client/GAS API_VERSION must match before publishing.');
let html=read('index.html').replace(/\r\n/g,'\n');
const files=fs.readdirSync(path.join(root,'assets/js')).filter(f=>f.endsWith('.js')).sort();
const imports=Object.fromEntries(files.map(f=>['./assets/js/'+f,'./assets/js/'+f+'?v='+encodeURIComponent(BUILD_VERSION)]));
const map='<script type="importmap" id="asset-importmap">'+JSON.stringify({imports})+'</script>';
if(html.includes('id="asset-importmap"'))html=html.replace(/<script type="importmap" id="asset-importmap">[\s\S]*?<\/script>/,map);
else html=html.replace('  <script defer', '  '+map+'\n  <script defer');
html=html.replace(/href="\.\/assets\/css\/styles\.css[^"]*"/,'href="./assets/css/styles.css?v='+BUILD_VERSION+'"');
html=html.replace(/src="\.\/assets\/js\/bootstrap\.js[^"]*"/,'src="./assets/js/bootstrap.js?v='+BUILD_VERSION+'"');
// Import maps version the entire transitive graph, without changing Node imports.
// Only the measured common app is preloaded; no route-specific/PDF/image preloads.
html=html.replace(/\s*<link rel="modulepreload"[^>]*>/g,'');
html=html.replace(/\s*<link rel="stylesheet"[^>]*materials\.css[^>]*>/g,'');
html=html.replace('  <script type="importmap"','  <link rel="stylesheet" href="./assets/css/materials.css?v='+BUILD_VERSION+'">\n  <script type="importmap"');
if(PRELOAD_APP || process.argv.includes('--preload'))html=html.replace('  <script defer','  <link rel="modulepreload" href="./assets/js/app.js?v='+BUILD_VERSION+'">\n  <script defer');
if(process.argv.includes('--check')) {if(html!==read('index.html').replace(/\r\n/g,'\n'))throw Error('Run npm run sync-assets after changing BUILD_VERSION or JS files.');}
else fs.writeFileSync(path.join(root,'index.html'),html);
console.log('Asset map: '+BUILD_VERSION+' ('+files.length+' modules)');
