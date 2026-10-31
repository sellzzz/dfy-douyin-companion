import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
function edit(path,fn){if(existsSync(path)){const before=readFileSync(path,'utf8'); const after=fn(before); if(after!==before)writeFileSync(path,after);}}
const create=`
    // DouPet: a native close button inside the existing interactive body area.
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'doupet-close';
    closeButton.textContent = '×';
    closeButton.title = '关闭桌宠';
    closeButton.setAttribute('aria-label', '关闭桌宠');
    closeButton.addEventListener('pointerdown', (event) => { event.stopPropagation(); });
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      window.close();
    });
    this.hit.appendChild(closeButton);
`;
const css=`
      /* DouPet close button: stays within the native clickable body rectangle. */
      .doupet-close {
        position: absolute; top: 0; right: 0; z-index: 10;
        width: 28px; height: 28px; padding: 0;
        border: 1px solid rgba(255,255,255,.85); border-radius: 50%;
        background: #fff; color: #525866; box-shadow: 0 2px 8px #0003;
        font: 23px/24px 'Segoe UI', sans-serif;
        cursor: pointer; pointer-events: auto;
      }
      .doupet-close:hover, .doupet-close:focus-visible {background:#e5484d;color:#fff;outline:2px solid #fff;}
`;
for(const base of ['work/runtime/node_modules/dsh-pet','work/dsh-home/profiles/web/node_modules/dsh-pet','work/dsh-pet/dsh-pet']){
 const dir=resolve(root,base,'runtime/electron-helper');
 const sprite=existsSync(resolve(dir,'sprite/init.js'))?resolve(dir,'sprite/init.js'):resolve(dir,'sprite.js');
 edit(sprite,s=>{if(s.includes("className = 'doupet-close'"))return s; const anchor="    this.hit.className = 'pet-hit';"; if(!s.includes(anchor))throw Error('Unknown sprite layout');return s.replace(anchor,anchor+create);});
 edit(resolve(dir,'index.html'),s=>s.includes('.doupet-close {')?s:s.replace('    </style>',css+'    </style>'));
 for(const lib of ['index.js','standalone.js'])edit(resolve(root,base,'lib',lib),s=>s.replace(/(child\.once\("exit", \(code, signal\) => \{[\s\S]{0,220}?)if \(!this\.stopping\) \{/g,'$1if (!this.stopping && code !== 0) {'));
}
edit(resolve(root,'work/dsh-pet/dsh-pet/src/host/helper/child.ts'),s=>s.replace(/(child\.once\('exit', \(code, signal\) => \{[\s\S]{0,220}?)if \(!this\.stopping\) \{/g,'$1if (!this.stopping && code !== 0) {'));
console.log('Close button applied to source and both installed desktop runtimes.');
