/* Pure hierarchy and visibility helpers, shared by viewer tests. */
function circuitHierarchy(c){
 if(c.hierarchy)return c.hierarchy;
 const gates=c.logical_instructions||c.instructions,root={id:'__root__',label:'Program',children:[],gate_indices:gates.map((_,i)=>i)};
 let last=null;gates.forEach((g,i)=>{const group=g.group||'ungrouped';if(last?.original!==group){last={id:group+'_'+i,original:group,label:c.groups?.[group]||group,children:[],gate_indices:[]};root.children.push(last)}last.gate_indices.push(i)});
 function stats(n){n.wires=[...new Set(n.gate_indices.flatMap(i=>gates[i].wires))].sort((a,b)=>a-b);n.gate_count=n.gate_indices.length;n.gate_counts={};n.gate_indices.forEach(i=>n.gate_counts[gates[i].name]=(n.gate_counts[gates[i].name]||0)+1);n.children.forEach(stats)}stats(root);return root;
}
function hierarchyIndex(root){const map=new Map();function visit(n,parent=null,level=0){map.set(n.id,{node:n,parent,level});n.children.forEach(child=>visit(child,n,level+1))}visit(root);return map}
function hierarchyLayout(root,open){
 function visit(n){if(n.id!=='__root__'&&!open.has(n.id))return {node:n,width:164,collapsed:true,children:[]};
  const children=n.children.length?n.children.map(visit):n.gate_indices.map(i=>({gate:i,width:72,children:[]}));
  const gap=22,pad=n.id==='__root__'?0:24;
  return {node:n,width:Math.max(92,children.reduce((a,c)=>a+c.width,0)+gap*Math.max(0,children.length-1)+2*pad),collapsed:false,children,pad,gap};
 }
 const layout=visit(root);
 function place(n,x){n.x=x;let next=x+(n.pad||0);n.children.forEach(c=>{place(c,next);next+=c.width+(n.gap||0)})}place(layout,110);return layout;
}
function hierarchyVisibleCoverage(layout){if(layout.gate!==undefined)return [layout.gate];if(layout.collapsed)return layout.node.gate_indices.slice();return layout.children.flatMap(hierarchyVisibleCoverage)}
export {circuitHierarchy, hierarchyIndex, hierarchyLayout, hierarchyVisibleCoverage};
