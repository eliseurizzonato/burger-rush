(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.Placement=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const R=.35,STEP=.4,EPS=1e-6;
  const number=n=>typeof n==='number'&&Number.isFinite(n),finiteRect=o=>o&&['x','z','hw','hd'].every(k=>number(o[k]))&&o.hw>=0&&o.hd>=0;
  const failure=reason=>({ok:false,reason});
  const rotation=a=>{if(!number(a)||Math.abs(a-Math.round(a/(Math.PI/2))*Math.PI/2)>EPS)return null;return ((Math.round(a/(Math.PI/2))%4+4)%4)*Math.PI/2};
  function rect(o){const sideways=o.kind==='station'&&Math.abs(Math.sin(o.rot||0))>.5;return {...o,hw:sideways?o.hd:o.hw,hd:sideways?o.hw:o.hd}}
  const overlap=(a,b,pad=0)=>Math.abs(a.x-b.x)<a.hw+b.hw+pad-EPS&&Math.abs(a.z-b.z)<a.hd+b.hd+pad-EPS;
  function validate(world,change){
    if(!world||!world.bounds||!Array.isArray(world.objects)||world.objects.length>128||!change||typeof change.id!=='string'||!number(change.x)||!number(change.z))return failure('Posição inválida.');
    const b=world.bounds,keys=['left','right','back','front'];if(!keys.every(k=>number(b[k]))||b.right<=b.left||b.front<=b.back||b.right-b.left>64||b.front-b.back>64)return failure('Limites inválidos.');
    if(!world.spawn||!number(world.spawn.x)||!number(world.spawn.z))return failure('Ponto de entrada inválido.');
    const objects=world.objects,obstacles=world.obstacles||[],reserved=world.reserved||[];
    if(obstacles.length>256||reserved.length>128||!obstacles.every(finiteRect)||!reserved.every(finiteRect)||!objects.every(o=>finiteRect(o)&&typeof o.id==='string'&&['cash','table','station'].includes(o.kind)))return failure('Geometria inválida.');
    if(new Set(objects.map(o=>o.id)).size!==objects.length)return failure('Objetos duplicados.');
    const original=objects.find(o=>o.id===change.id);if(!original)return failure('Objeto não encontrado.');
    if(original.locked)return failure('Espere a mesa ficar desocupada para movê-la.');
    const rot=rotation(change.rot===undefined?(original.rot||0):change.rot);if(rot===null||original.kind!=='station'&&rot!==0)return failure('Rotação indisponível para este objeto.');
    const next={id:change.id,x:change.x,z:change.z,rot},target=rect({...original,...next}),pad=target.kind==='cash'?R:0;
    if(target.x-target.hw<b.left||target.x+target.hw>b.right||target.z-target.hd<b.back||target.z+target.hd>b.front)return failure('Mantenha o objeto dentro desta fase do salão.');
    if(target.kind!=='cash'&&overlap(target,{x:0,z:Math.max(0,b.front)/2,hw:1.1,hd:Math.max(0,b.front)/2},.05))return failure('Deixe o corredor central livre.');
    for(const o of obstacles)if(overlap(target,o,pad+.05))return failure('Há uma parede ou equipamento nessa posição.');
    for(const o of objects)if(o.id!==change.id){const other=rect(o);if(overlap(target,other,(target.kind==='cash'||other.kind==='cash')?R:.05))return failure('Essa posição sobrepõe outro objeto.');}
    for(const o of reserved)if(o.id!==change.id&&overlap(target,o,pad+.05))return failure('Reserve esse espaço para uma área ou decoração da loja.');
    const placed=objects.map(o=>rect(o.id===change.id?{...o,...next}:o)),solid=obstacles.concat(placed.filter(o=>o.kind!=='cash'));
    const free=(x,z)=>x>=b.left&&x<=b.right&&z>=b.back&&z<=b.front&&!solid.some(o=>Math.abs(x-o.x)<o.hw+R-EPS&&Math.abs(z-o.z)<o.hd+R-EPS);
    const width=Math.floor((b.right-b.left)/STEP)+1,height=Math.floor((b.front-b.back)/STEP)+1,n=width*height,visited=new Uint8Array(n),queue=new Int32Array(n);
    let head=0,tail=0;
    for(let iz=0;iz<height;iz++)for(let ix=0;ix<width;ix++){const x=b.left+ix*STEP,z=b.back+iz*STEP;if(Math.hypot(x-world.spawn.x,z-world.spawn.z)<=.65&&free(x,z)){const i=iz*width+ix;visited[i]=1;queue[tail++]=i;}}
    if(!tail)return failure('A entrada da cozinha ficou bloqueada.');
    while(head<tail){const i=queue[head++],ix=i%width,iz=Math.floor(i/width);for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=ix+dx,nz=iz+dz,j=nz*width+nx;if(nx<0||nx>=width||nz<0||nz>=height||visited[j]||!free(b.left+nx*STEP,b.back+nz*STEP))continue;visited[j]=1;queue[tail++]=j;}}
    const reachable=(p,radius=.65)=>{if(!p||!number(p.x)||!number(p.z))return false;const ix=Math.round((p.x-b.left)/STEP),iz=Math.round((p.z-b.back)/STEP);const span=Math.ceil(radius/STEP);for(let dz=-span;dz<=span;dz++)for(let dx=-span;dx<=span;dx++){const x=ix+dx,z=iz+dz;if(x>=0&&x<width&&z>=0&&z<height&&visited[z*width+x]&&Math.hypot(b.left+x*STEP-p.x,b.back+z*STEP-p.z)<=radius)return true;}return false};
    if(!(world.points||[]).every(p=>reachable(p)))return failure('O balcão ficou sem caminho livre.');
    for(const o of placed){
      if(o.kind==='cash'&&!reachable(o))return failure('A coleta de moedas ficou inacessível.');
      // O jogo recolhe itens a menos de 1,9 m da máquina, inclusive pela lateral.
      if(o.kind==='station'&&!reachable(o,1.85))return failure('Deixe a frente de '+(o.name||o.id)+' acessível.');
      if(o.kind==='table'&&!reachable({x:o.x,z:o.z+o.hd+.55})&&!reachable({x:o.x,z:o.z-o.hd-.55}))return failure('Uma mesa ficou sem acesso para limpeza.');
    }
    return {ok:true,next,reachableCells:tail};
  }
  return {validate};
});
