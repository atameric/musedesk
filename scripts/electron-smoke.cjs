// Read-only native smoke of the packaged main/preload/renderer in Electron.
// UserData and screenshots are isolated; no prompt or approval is submitted.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const electron = path.join(root,'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const asar = path.join(root,'out.noindex/MuseDesk-darwin-arm64/MuseDesk.app/Contents/Resources/app.asar');
const stage = fs.mkdtempSync(path.join(os.tmpdir(),'musedesk-native-qa-'));
const proof = path.join(stage,'proof.json');
const image = path.join(stage,'native.png');
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'musedesk-native-qa',version:require('../package.json').version,main:'main.cjs'}));
fs.writeFileSync(path.join(stage,'main.cjs'),`
const {app,BrowserWindow}=require('electron');const fs=require('node:fs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.setPath('userData',${JSON.stringify(path.join(stage,'userdata'))});
require(${JSON.stringify(asar + '/.vite/build/main.js')});
app.on('ready',async()=>{
 try {
  const win=BrowserWindow.getAllWindows()[0];
  await new Promise(r=>win.webContents.once('did-finish-load',r));
  const end=Date.now()+30000;let ready=false;
  while(Date.now()<end){ready=await win.webContents.executeJavaScript("!!document.querySelector('.main') && document.querySelector('.pill')?.textContent.includes('connected')");if(ready)break;await pause(200);}
  if(!ready)throw new Error('Native packaged UI did not reach connected state');
  const results=[];
  for(const [width,height] of [[960,640],[1280,800],[1440,900],[1920,1080]]){
   win.setSize(width,height);await pause(200);
   const result=await win.webContents.executeJavaScript("JSON.stringify({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,composerFits:document.querySelector('.composer').getBoundingClientRect().bottom<=innerHeight,headerFits:document.querySelector('.top-actions').getBoundingClientRect().right<=innerWidth})");
   results.push(JSON.parse(result));
  }
  win.setSize(1280,800);await pause(200);fs.writeFileSync(${JSON.stringify(image)},(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(${JSON.stringify(proof)},JSON.stringify({ready,historyVisible:await win.webContents.executeJavaScript("!!document.querySelector('.chat .msg')"),results,image:${JSON.stringify(image)}}));
 }catch(error){fs.writeFileSync(${JSON.stringify(proof)},JSON.stringify({error:error.message}));}
 app.quit();
});
`);
new (require('node:vm').Script)(fs.readFileSync(path.join(stage,'main.cjs'),'utf8'));
const child = spawn(electron,[stage],{stdio:'ignore',env:{...process.env,ELECTRON_ENABLE_LOGGING:'0'}});
const timer = setTimeout(()=>{child.kill('SIGTERM');},45000);
child.on('error',err=>{clearTimeout(timer);console.error(err.message);process.exitCode=1;});
child.on('exit',()=>{
 clearTimeout(timer);
 if(!fs.existsSync(proof)){console.error('Native QA did not produce proof; files at '+stage);process.exitCode=1;return;}
 const result=JSON.parse(fs.readFileSync(proof,'utf8'));
 console.log(JSON.stringify(result));
 if(result.error || result.results?.some(row=>row.overflow || !row.composerFits || !row.headerFits))process.exitCode=1;
});
