const path=require('node:path');
const koffi=require('koffi');
const user=koffi.load('user32.dll'),dwm=koffi.load('dwmapi.dll');
const Rect=koffi.struct('DouPetRect',{left:'long',top:'long',right:'long',bottom:'long'});
const Point=koffi.struct('DouPetPoint',{x:'long',y:'long'});
const top=user.func('uintptr_t __stdcall GetTopWindow(uintptr_t hwnd)');
const next=user.func('uintptr_t __stdcall GetWindow(uintptr_t hwnd, unsigned int command)');
const visible=user.func('bool __stdcall IsWindowVisible(uintptr_t hwnd)');
const iconic=user.func('bool __stdcall IsIconic(uintptr_t hwnd)');
const rect=user.func('bool __stdcall GetWindowRect(uintptr_t hwnd, _Out_ DouPetRect *rect)');
const cursor=user.func('bool __stdcall GetCursorPos(_Out_ DouPetPoint *point)');
const text=user.func('int __stdcall GetWindowTextW(uintptr_t hwnd, void *text, int length)');
const attr=dwm.func('long __stdcall DwmGetWindowAttribute(uintptr_t hwnd, unsigned int attribute, void *value, unsigned int size)');
function title(hwnd){const b=Buffer.alloc(2048);const n=text(hwnd,b,1024);return b.toString('utf16le',0,n*2);}
function bounds(hwnd){const r={};if(!rect(hwnd,r))return null;const b=Buffer.alloc(16);if(attr(hwnd,9,b,16)===0){r.left=b.readInt32LE(0);r.top=b.readInt32LE(4);r.right=b.readInt32LE(8);r.bottom=b.readInt32LE(12);}return r;}
function details(hwnd){return {hwnd:Number(hwnd),title:title(hwnd),bounds:bounds(hwnd),minimized:iconic(hwnd),visible:visible(hwnd)};}
function dropTarget(skipHandles=[],atPoint=null){
 const p=atPoint||{};if(!atPoint&&!cursor(p))return null;const skip=new Set(skipHandles.map(Number));
 let h=top(0),steps=0;
 while(h&&steps++<1000){
  const id=Number(h),t=title(h);
  const cloak=Buffer.alloc(4);const isCloaked=attr(h,14,cloak,4)===0&&cloak.readUInt32LE()!==0;
  if(!skip.has(id)&&visible(h)&&!iconic(h)&&!isCloaked&&!/dsh-pet 桌宠|DouPet 窗口陪看/.test(t)){
   const r=bounds(h);
   if(r&&r.right>r.left&&r.bottom>r.top&&p.x>=r.left&&p.x<r.right&&p.y>=r.top&&p.y<r.bottom){
    // The first real window beneath the pet must be the target; never capture an obscured browser.
    if(!/抖音/.test(t)||!/Google Chrome|Microsoft Edge/.test(t))return null;
    return {...details(h),point:p,anchor:{x:(p.x-r.left)/(r.right-r.left),y:(p.y-r.top)/(r.bottom-r.top)}};
   }
  }
  h=next(h,2);
 }
 return null;
}
module.exports={dropTarget,details};
