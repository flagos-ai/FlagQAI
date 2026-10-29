/* Local diagnostics for the platform's straight-line OpenQASM subset. No code executes. */
function lintOpenQASM(source){
 const diagnostics=[],registers=new Map(),classical=new Map();let version=null,gates=0;
 const add=(message,start,length=1,severity='error')=>{const before=source.slice(0,start).split('\n');diagnostics.push({message,line:before.length,column:before.at(-1).length+1,start,length:Math.max(1,length),severity})};
 if(!source.trim()){add('Enter an OpenQASM model.',0);return diagnostics}
 if(new TextEncoder().encode(source).length>32768)add('Model exceeds the 32 KiB backend limit.',0);
 // Mask comments while preserving every character's source position.
 const masked=source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' '));
 const blockStart=masked.indexOf('/*');if(blockStart>=0)add('Unclosed block comment.',blockStart,2);
 const statements=[];let start=0,quoted=false;
 for(let i=0;i<masked.length;i++){if(masked[i]==='"'&&masked[i-1]!=='\\')quoted=!quoted;if(masked[i]===';'&&!quoted){statements.push({text:masked.slice(start,i),start});start=i+1}}
 if(masked.slice(start).trim())statements.push({text:masked.slice(start),start,unterminated:true});
 const reference=(text,offset,map)=>{const match=text.trim().match(/^([A-Za-z_]\w*)(?:\s*\[\s*(\d+)\s*\])?$/);if(!match){add('Expected a register or indexed operand, e.g. q[0].',offset,text.length);return null}const r=map.get(match[1]);if(!r){add('Undeclared register "'+match[1]+'".',offset,text.length);return null}if(match[2]!==undefined&&Number(match[2])>=r.size){add('Index '+match[2]+' is out of range for '+match[1]+'['+r.size+'].',offset,text.length);return null}return {name:match[1],index:match[2]===undefined?null:Number(match[2]),size:match[2]===undefined?r.size:1}};
 const specs={id:[1,0],i:[1,0],h:[1,0],x:[1,0],y:[1,0],z:[1,0],s:[1,0],sdg:[1,0],t:[1,0],tdg:[1,0],sx:[1,0],sxdg:[1,0],rx:[1,1],ry:[1,1],rz:[1,1],p:[1,1],u1:[1,1],u2:[1,2],u3:[1,3],u:[1,3],cx:[2,0],cy:[2,0],cz:[2,0],ch:[2,0],cp:[2,1],crx:[2,1],cry:[2,1],crz:[2,1],cu1:[2,1],cu3:[2,3],swap:[2,0],ccx:[3,0],cswap:[3,0],rxx:[2,1],ryy:[2,1],rzz:[2,1]};
 for(const statement of statements){let text=statement.text.trim(),pos=statement.start+statement.text.indexOf(text);if(!text)continue;
  if(statement.unterminated)add('Missing semicolon at the end of this statement.',pos+text.length-1);
  let m;
  if((m=text.match(/^OPENQASM\s+(2\.0|3(?:\.0)?)$/))){if(version)add('Duplicate OPENQASM declaration.',pos,text.length);if(statements[0]!==statement)add('OPENQASM declaration must be first.',pos,text.length);version=m[1];continue}
  if(/^OPENQASM\b/.test(text)){add('Expected OPENQASM 2.0; or OPENQASM 3.0;',pos,text.length);continue}
  if((m=text.match(/^include\s+"([^"\n]+)"$/))){if(!['qelib1.inc','stdgates.inc'].includes(m[1]))add('Include support must be checked by the remote compiler.',pos,text.length,'warning');continue}
  if((m=text.match(/^(qreg|creg)\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\]$/))||(m=text.match(/^(qubit|bit)(?:\s*\[\s*(\d+)\s*\])?\s+([A-Za-z_]\w*)$/))){let kind=m[1],name=/reg$/.test(kind)?m[2]:m[3],size=Number(/reg$/.test(kind)?m[3]:m[2]||1);if(registers.has(name)||classical.has(name))add('Duplicate register "'+name+'".',pos,text.length);if(size<1||size>16)add('Register size must be between 1 and 16.',pos,text.length);(/^(qreg|qubit)$/.test(kind)?registers:classical).set(name,{size});continue}
  if(/^(qreg|creg|qubit|bit)\b/.test(text)){add('Invalid register declaration.',pos,text.length);continue}
  if((m=text.match(/^measure\s+(.+?)\s*->\s*(.+)$/))||(m=text.match(/^(.+?)\s*=\s*measure\s+(.+)$/))){let q,c;if(text.startsWith('measure')){q=m[1];c=m[2]}else{c=m[1];q=m[2]}const qr=reference(q,pos+text.indexOf(q),registers),cr=reference(c,pos+text.lastIndexOf(c),classical);if(qr&&cr&&qr.size!==cr.size)add('Measurement source and target widths must match.',pos,text.length);continue}
  if((m=text.match(/^measure\s+(.+)$/))){reference(m[1],pos+text.indexOf(m[1]),registers);continue}
  if((m=text.match(/^(barrier|reset)\s+(.+)$/))){m[2].split(',').forEach(v=>reference(v,pos+text.indexOf(v),registers));continue}
  if(/^(gate|def|for|while|if|input|output|const|let)\b/.test(text)){add('This construct requires compiler validation; local checking supports straight-line circuits.',pos,text.length,'warning');continue}
  m=text.match(/^([A-Za-z_]\w*)\s*(?:\((.*)\))?\s+(.+)$/);
  if(!m){add('Invalid OpenQASM statement: '+text.slice(0,70),pos,text.length);continue}
  const spec=specs[m[1].toLowerCase()];if(!spec){add('Unknown gate "'+m[1]+'". Check the gate name or compiler support.',pos,m[1].length);continue}
  const params=m[2]===undefined?[]:m[2].split(',').map(p=>p.trim());if(params.length!==spec[1]||params.some(p=>!p))add(m[1]+' expects '+spec[1]+' parameter(s).',pos,m[1].length);
  for(const param of params){if(!/^[\d\s.eE+*/^()\-a-zA-Z_]+$/.test(param))add('Invalid angle expression.',pos+text.indexOf(param),param.length);const names=param.match(/[A-Za-z_]\w*/g)||[];if(names.some(n=>!['pi','e','sin','cos','tan','sqrt','exp','ln'].includes(n)))add('Angle expressions with named values require compiler validation.',pos+text.indexOf(param),param.length,'warning')}
  const operands=m[3].split(',').map(v=>v.trim());if(operands.length!==spec[0])add(m[1]+' expects '+spec[0]+' qubit operand(s).',pos,text.length);
  const refs=operands.map(v=>reference(v,pos+text.lastIndexOf(v),registers)).filter(Boolean);
  const keys=refs.map(r=>r.name+':'+r.index);if(new Set(keys).size!==keys.length)add('Gate operands must refer to distinct qubits.',pos,text.length);
  gates++;
 }
 if(!version)add('Missing OPENQASM 2.0; or OPENQASM 3.0; declaration.',0);
 if(!registers.size)add('Declare at least one quantum register.',0);
 if([...registers.values()].reduce((n,r)=>n+r.size,0)>16)add('Total qubit count exceeds the backend limit of 16.',0);
 if(gates>2000)add('Circuit exceeds the backend limit of 2000 gates.',0);
 return diagnostics.sort((a,b)=>a.start-b.start);
}
export {lintOpenQASM};
