// Estado del simulador
let state = {
  pc: 0,
  registers: Array(32).fill(0),
  memory: Array(256).fill(0),
  program: [],
  running: false,
  signalStates: {},
  logs: [],
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDragging: false,
  lastMouse: { x: 0, y: 0 }
};

const datapathWidth = 1400;
const datapathHeight = 700;

const components = {
  pc: { x: 50, y: 100, w: 80, h: 50, label: 'PC', color: '#B8E0D2', border: '#6A9C89' },
  pcAdder: { x: 50, y: 200, w: 80, h: 50, label: 'PC+4', color: '#A8DADC', border: '#457B9D' },
  muxPC: { x: 100, y: 30, w: 40, h: 60, label: 'MUX\nPC', color: '#D4D4D4', border: '#8E8E8E' },
  instMem: { x: 220, y: 50, w: 140, h: 180, label: 'Memoria de\nInstrucciones', color: '#D5B9E0', border: '#8B7BA8' },
  regBank: { x: 480, y: 80, w: 150, h: 160, label: 'Banco de\nRegistros', color: '#C7E9C0', border: '#7BA97C' },
  signExtend: { x: 400, y: 280, w: 100, h: 50, label: 'Sign\nExtend', color: '#E8DFF5', border: '#9B8FC2' },
  muxImmRd: { x: 400, y: 200, w: 40, h: 60, label: 'MUX\nImm', color: '#D4D4D4', border: '#8E8E8E' },
  muxAluSrc: { x: 670, y: 150, w: 40, h: 60, label: 'MUX\nALU\nsrc', color: '#D4D4D4', border: '#8E8E8E' },
  alu: { x: 740, y: 120, w: 120, h: 100, label: 'ALU', color: '#F4C4C4', border: '#C17B7B' },
  muxAlu2Reg: { x: 900, y: 130, w: 40, h: 60, label: 'MUX\nALU\n2reg', color: '#D4D4D4', border: '#8E8E8E' },
  dataMem: { x: 980, y: 80, w: 140, h: 160, label: 'Memoria de\nDatos', color: '#FFD6A5', border: '#D4A574' },
  ordenamiento: { x: 220, y: 280, w: 100, h: 50, label: 'Branch\nOffset', color: '#FFE5B4', border: '#D4A574' },
  sumadorBranch: { x: 150, y: 280, w: 80, h: 50, label: 'PC+\nOffset', color: '#A8DADC', border: '#457B9D' },
  control: { x: 450, y: 380, w: 200, h: 80, label: 'Unidad de Control', color: '#E0D4F7', border: '#9B8FC2' }
};

let svg, mainGroup, codeEditor, pcValue, currentInstruction, registerList, zoomLevel, svgContainer;

document.addEventListener('DOMContentLoaded', () => {
  initializeDOM();
  setupEventListeners();
  loadInitialCode();
  updateUI();
  drawDatapath();
});

function initializeDOM() {
  svg = document.getElementById('datapathSVG');
  mainGroup = document.getElementById('mainGroup');
  svgContainer = document.getElementById('svgContainer');
  codeEditor = document.getElementById('codeEditor');
  pcValue = document.getElementById('pcValue');
  currentInstruction = document.getElementById('currentInstruction');
  registerList = document.getElementById('registerList');
  zoomLevel = document.getElementById('zoomLevel');
}

function setupEventListeners() {
  document.getElementById('loadBtn').addEventListener('click', loadCode);
  document.getElementById('stepBtn').addEventListener('click', step);
  document.getElementById('runBtn').addEventListener('click', toggleRun);
  document.getElementById('resetBtn').addEventListener('click', reset);
  
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    state.zoom = Math.min(2.5, state.zoom * 1.2);
    updateZoomDisplay();
    applyTransform();
  });
  
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    state.zoom = Math.max(0.5, state.zoom / 1.2);
    updateZoomDisplay();
    applyTransform();
  });
  
  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    state.zoom = 1;
    state.pan = { x: 0, y: 0 };
    updateZoomDisplay();
    applyTransform();
  });
  
  svgContainer.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
  });
  
  svgContainer.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const deltaX = e.clientX - state.lastMouse.x;
    const deltaY = e.clientY - state.lastMouse.y;
    state.pan.x += deltaX;
    state.pan.y += deltaY;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    applyTransform();
  });
  
  svgContainer.addEventListener('mouseup', () => {
    state.isDragging = false;
  });
  
  svgContainer.addEventListener('mouseleave', () => {
    state.isDragging = false;
  });
}

function applyTransform() {
  mainGroup.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
}

function loadInitialCode() {
  const initialCode = `# Programa de ejemplo: Fibonacci
addi x10, x0, 0
addi x11, x0, 1
addi x5, x0, 500
addi x7, x0, 0
add x12, x10, x11
addi x7, x7, 1
bge x12, x5, 2
add x10, x0, x11
add x11, x0, x12
beq x0, x0, -5`;
  codeEditor.value = initialCode;
}

function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  state.logs.push({ time, msg, type });
  if (state.logs.length > 50) state.logs.shift();
}

function signExtend(value, bits) {
  const signBit = (value >> (bits - 1)) & 1;
  if (signBit === 1) {
    const mask = (-1) << bits;
    return value | mask;
  }
  return value;
}

function parseInstruction(line) {
  line = line.trim().split('#')[0].trim();
  if (!line) return null;
  
  const loadStoreMatch = line.match(/^(lw|sw)\s+(\w+),\s*(-?\d+)\((\w+)\)/);
  if (loadStoreMatch) {
    return {
      raw: line,
      opcode: loadStoreMatch[1].toLowerCase(),
      operands: [loadStoreMatch[2], loadStoreMatch[3], loadStoreMatch[4]]
    };
  }
  
  const parts = line.split(/[\s,()]+/).filter(x => x);
  if (parts.length === 0) return null;
  
  return {
    raw: line,
    opcode: parts[0].toLowerCase(),
    operands: parts.slice(1)
  };
}

function getRegIndex(reg) {
  if (reg.startsWith('x')) return parseInt(reg.substring(1));
  return 0;
}

function loadCode() {
  const code = codeEditor.value;
  const lines = code.split('\n');
  const newProgram = [];
  
  for (let line of lines) {
    const inst = parseInstruction(line);
    if (inst) newProgram.push(inst);
  }
  
  state.pc = 0;
  state.registers = Array(32).fill(0);
  state.memory = Array(256).fill(0);
  state.signalStates = {};
  state.program = newProgram;
  state.logs = [];
  
  addLog(`Cargadas ${newProgram.length} instrucciones`, 'success');
  updateUI();
  drawDatapath();
}

function executeInstruction(inst) {
  const op = inst.opcode;
  const ops = inst.operands;
  const newRegs = [...state.registers];
  const newMem = [...state.memory];
  let newPc = state.pc;
  let signals = {};

  try {
    switch(op) {
      case 'add': {
        const rd = getRegIndex(ops[0]);
        const rs1 = getRegIndex(ops[1]);
        const rs2 = getRegIndex(ops[2]);
        if (rd !== 0) newRegs[rd] = (newRegs[rs1] + newRegs[rs2]) | 0;
        signals = { type: 'R', alu_op: 'ADD', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
        break;
      }
      case 'sub': {
        const rd = getRegIndex(ops[0]);
        const rs1 = getRegIndex(ops[1]);
        const rs2 = getRegIndex(ops[2]);
        if (rd !== 0) newRegs[rd] = (newRegs[rs1] - newRegs[rs2]) | 0;
        signals = { type: 'R', alu_op: 'SUB', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
        break;
      }
      case 'addi': {
        const rd = getRegIndex(ops[0]);
        const rs1 = getRegIndex(ops[1]);
        const imm = signExtend(parseInt(ops[2]), 12);
        if (rd !== 0) newRegs[rd] = (newRegs[rs1] + imm) | 0;
        signals = { type: 'I', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
        break;
      }
      case 'lw': {
        const rd = getRegIndex(ops[0]);
        const offset = parseInt(ops[1]);
        const rs1 = getRegIndex(ops[2]);
        const addr = (newRegs[rs1] + offset) | 0;
        if (rd !== 0 && addr >= 0 && addr < newMem.length) {
          newRegs[rd] = newMem[addr];
        }
        signals = { type: 'L', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 0, wem: 0, branch: 0 };
        break;
      }
      case 'sw': {
        const rs2 = getRegIndex(ops[0]);
        const offset = parseInt(ops[1]);
        const rs1 = getRegIndex(ops[2]);
        const addr = (newRegs[rs1] + offset) | 0;
        if (addr >= 0 && addr < newMem.length) {
          newMem[addr] = newRegs[rs2];
        }
        signals = { type: 'S', alu_op: 'ADD', wer: 0, alu_src: 0, alu2reg: 0, wem: 1, branch: 0 };
        break;
      }
      case 'beq': {
        const rs1 = getRegIndex(ops[0]);
        const rs2 = getRegIndex(ops[1]);
        const offset = parseInt(ops[2]);
        const oldPc = state.pc;
        signals = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
        if (newRegs[rs1] === newRegs[rs2]) {
          newPc += offset;
          state.registers = newRegs;
          state.memory = newMem;
          state.pc = newPc;
          state.signalStates = signals;
          addLog(`PC=${state.pc - offset}: ${inst.raw} [TOMADO]`, 'success');
          updateUI();
          drawDatapath();
          return;
        }
        break;
      }
      case 'bne': {
        const rs1 = getRegIndex(ops[0]);
        const rs2 = getRegIndex(ops[1]);
        const offset = parseInt(ops[2]);
        signals = { type: 'B', alu_op: 'NE', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
        if (newRegs[rs1] !== newRegs[rs2]) {
          newPc += offset;
          state.registers = newRegs;
          state.memory = newMem;
          state.pc = newPc;
          state.signalStates = signals;
          addLog(`PC=${state.pc - offset}: ${inst.raw} [TOMADO]`, 'success');
          updateUI();
          drawDatapath();
          return;
        }
        break;
      }
      case 'bge': {
        const rs1 = getRegIndex(ops[0]);
        const rs2 = getRegIndex(ops[1]);
        const offset = parseInt(ops[2]);
        signals = { type: 'B', alu_op: 'SLT', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
        if ((newRegs[rs1] | 0) >= (newRegs[rs2] | 0)) {
          newPc += offset;
          state.registers = newRegs;
          state.memory = newMem;
          state.pc = newPc;
          state.signalStates = signals;
          addLog(`PC=${state.pc - offset}: ${inst.raw} [TOMADO]`, 'success');
          updateUI();
          drawDatapath();
          return;
        }
        break;
      }
      default:
        addLog(`Instrucción no soportada: ${op}`, 'error');
        return;
    }

    newPc++;
    state.registers = newRegs;
    state.memory = newMem;
    state.pc = newPc;
    state.signalStates = signals;
    addLog(`PC=${state.pc - 1}: ${inst.raw}`, 'success');
    updateUI();
    drawDatapath();
    
  } catch (error) {
    addLog(`Error: ${error.message}`, 'error');
    state.running = false;
    updateUI();
  }
}

function step() {
  if (state.pc >= state.program.length) {
    addLog('Programa terminado', 'success');
    return;
  }
  executeInstruction(state.program[state.pc]);
}

function toggleRun() {
  state.running = !state.running;
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = state.running ? 'Pausar' : 'Ejecutar';
  
  if (state.running) runLoop();
}

function runLoop() {
  if (!state.running) return;
  
  if (state.pc < state.program.length) {
    executeInstruction(state.program[state.pc]);
    setTimeout(runLoop, 600);
  } else {
    state.running = false;
    document.getElementById('runBtn').textContent = 'Ejecutar';
    addLog('Programa finalizado', 'success');
  }
}

function reset() {
  state.pc = 0;
  state.registers = Array(32).fill(0);
  state.memory = Array(256).fill(0);
  state.running = false;
  state.signalStates = {};
  document.getElementById('runBtn').textContent = 'Ejecutar';
  addLog('Sistema reiniciado', 'success');
  updateUI();
  drawDatapath();
}

function updateUI() {
  pcValue.textContent = state.pc;
  
  if (state.pc < state.program.length) {
    currentInstruction.textContent = state.program[state.pc].raw;
  } else {
    currentInstruction.textContent = 'Fin del programa';
  }
  
  updateRegisterList();
}

function updateRegisterList() {
  const importantRegs = [0, 5, 6, 7, 10, 11, 12, 28, 29, 30, 31];
  let html = '';
  
  for (let i of importantRegs) {
    html += `
      <div class="list-item">
        <span class="reg-name">x${i}:</span>
        <span class="reg-value">${state.registers[i]}</span>
      </div>
    `;
  }
  
  registerList.innerHTML = html;
}

function updateZoomDisplay() {
  zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
}

function drawDatapath() {
  mainGroup.innerHTML = '';
  
  const svgNS = "http://www.w3.org/2000/svg";
  
  // Grid
  for (let x = 0; x < datapathWidth; x += 50) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', datapathHeight);
    line.setAttribute('stroke', 'rgba(189, 195, 199, 0.2)');
    line.setAttribute('stroke-width', '1');
    mainGroup.appendChild(line);
  }
  
  for (let y = 0; y < datapathHeight; y += 50) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', 0);
    line.setAttribute('y1', y);
    line.setAttribute('x2', datapathWidth);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(189, 195, 199, 0.2)');
    line.setAttribute('stroke-width', '1');
    mainGroup.appendChild(line);
  }
  
  // Wires
  drawWires();
  
  // Components
  for (let comp of Object.values(components)) {
    drawComponent(comp);
  }
  
  // Control signals
  drawControlSignals();
}

function drawComponent(comp) {
  const svgNS = "http://www.w3.org/2000/svg";
  const active = state.signalStates.type !== undefined;
  
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('class', active ? 'component active' : 'component');
  
  const rect = document.createElementNS(svgNS, 'rect');
  rect.setAttribute('x', comp.x);
  rect.setAttribute('y', comp.y);
  rect.setAttribute('width', comp.w);
  rect.setAttribute('height', comp.h);
  rect.setAttribute('fill', comp.color);
  rect.setAttribute('stroke', comp.border);
  rect.setAttribute('stroke-width', active ? '3' : '2');
  rect.setAttribute('filter', 'url(#shadow)');
  g.appendChild(rect);
  
  const lines = comp.label.split('\n');
  const lineHeight = 16;
  const startY = comp.y + comp.h / 2 - (lines.length - 1) * lineHeight / 2;
  
  lines.forEach((line, i) => {
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', comp.x + comp.w / 2);
    text.setAttribute('y', startY + i * lineHeight);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-family', 'monospace');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#2C3E50');
    text.textContent = line;
    g.appendChild(text);
  });
  
  mainGroup.appendChild(g);
}

function drawLine(x1, y1, x2, y2, active, color = '#6A9C89', width = 2) {
  const svgNS = "http://www.w3.org/2000/svg";
  const line = document.createElementNS(svgNS, 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('stroke', active ? color : '#BDC3C7');
  line.setAttribute('stroke-width', active ? width : 1.5);
  line.setAttribute('class', active ? 'wire active' : 'wire');
  
  mainGroup.appendChild(line);
}

function drawWires() {
  const signals = state.signalStates;
  
  // PC a Memoria de Instrucciones
  drawLine(
    components.pc.x + components.pc.w, components.pc.y + components.pc.h / 2,
    components.instMem.x, components.instMem.y + 50,
    true, '#6A9C89', 2
  );
  
  // PC a PC+4
  drawLine(
    components.pc.x + components.pc.w / 2, components.pc.y + components.pc.h,
    components.pcAdder.x + components.pcAdder.w / 2, components.pcAdder.y,
    true, '#6A9C89', 2
  );
  
  // Memoria Inst a Banco Registros
  drawLine(
    components.instMem.x + components.instMem.w, components.instMem.y + 80,
    components.regBank.x, components.regBank.y + 60,
    signals.type !== undefined, '#7BA97C', 2
  );
  
  // Banco Registros a ALU
  drawLine(
    components.regBank.x + components.regBank.w, components.regBank.y + 60,
    components.alu.x, components.alu.y + 30,
    signals.alu_op !== undefined, '#7BA97C', 3
  );
  
  // Banco Registros a MUX ALU_SRC
  drawLine(
    components.regBank.x + components.regBank.w, components.regBank.y + 120,
    components.muxAluSrc.x, components.muxAluSrc.y + components.muxAluSrc.h / 2,
    signals.alu_src !== undefined, '#8B7BA8', 3
  );
  
  // Sign Extend a MUX ALU_SRC
  drawLine(
    components.signExtend.x + components.signExtend.w, components.signExtend.y + 25,
    components.muxAluSrc.x, components.muxAluSrc.y + 40,
    signals.alu_src === 0, '#9B8FC2', 2
  );
  
  // MUX ALU_SRC a ALU
  drawLine(
    components.muxAluSrc.x + components.muxAluSrc.w, components.muxAluSrc.y + components.muxAluSrc.h / 2,
    components.alu.x, components.alu.y + 70,
    signals.alu_op !== undefined, '#457B9D', 3
  );
  
  // ALU a MUX ALU2REG
  drawLine(
    components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
    components.muxAlu2Reg.x, components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2,
    signals.alu2reg === 1, '#C17B7B', 3
  );
  
  // ALU a Memoria Datos
  drawLine(
    components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
    components.dataMem.x, components.dataMem.y + 60,
    signals.wem === 1 || signals.alu2reg === 0, '#D4A574', 2
  );
  
  // Memoria Datos a MUX ALU2REG
  drawLine(
    components.dataMem.x, components.dataMem.y + 120,
    components.muxAlu2Reg.x + components.muxAlu2Reg.w, components.muxAlu2Reg.y + 15,
    signals.alu2reg === 0, '#D4A574', 3
  );
  
  // MUX ALU2REG a Banco Registros (writeback)
  const wbX = components.muxAlu2Reg.x;
  const wbY = components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2;
  drawLine(wbX, wbY, wbX - 30, wbY, signals.wer === 1, '#7BA97C', 3);
  drawLine(wbX - 30, wbY, wbX - 30, components.regBank.y - 20, signals.wer === 1, '#7BA97C', 3);
  drawLine(wbX - 30, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, signals.wer === 1, '#7BA97C', 3);
  drawLine(components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y, signals.wer === 1, '#7BA97C', 3);
  
  // Branch connections
  if (signals.branch === 1) {
    drawLine(
      components.instMem.x + components.instMem.w, components.instMem.y + 150,
      components.ordenamiento.x, components.ordenamiento.y + 25,
      true, '#D4A574', 2
    );
    
    drawLine(
      components.ordenamiento.x, components.ordenamiento.y + 25,
      components.sumadorBranch.x + components.sumadorBranch.w, components.sumadorBranch.y + 25,
      true, '#457B9D', 3
    );
    
    drawLine(
      components.pcAdder.x, components.pcAdder.y + 25,
      components.sumadorBranch.x + components.sumadorBranch.w, components.sumadorBranch.y + 35,
      true, '#6A9C89', 2
    );
    
    drawLine(
      components.sumadorBranch.x, components.sumadorBranch.y + 25,
      components.muxPC.x + 20, components.muxPC.y + 50,
      true, '#457B9D', 2
    );
  }
}

function drawControlSignals() {
  const signals = state.signalStates;
  if (!signals.type) return;
  
  const svgNS = "http://www.w3.org/2000/svg";
  const x = 500;
  const y = 550;
  const spacing = 80;
  
  const controlLabels = [
    { name: 'WER', value: signals.wer },
    { name: 'ALU_SRC', value: signals.alu_src },
    { name: 'ALU2REG', value: signals.alu2reg },
    { name: 'WEM', value: signals.wem },
    { name: 'BRANCH', value: signals.branch }
  ];
  
  controlLabels.forEach((sig, i) => {
    const active = sig.value === 1;
    const cx = x + i * spacing;
    
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', active ? 'control-signal active' : 'control-signal');
    
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', 10);
    circle.setAttribute('fill', active ? '#7BA97C' : '#E8E8E8');
    circle.setAttribute('stroke', active ? '#5A8A5C' : '#BDC3C7');
    circle.setAttribute('stroke-width', active ? '2' : '1.5');
    g.appendChild(circle);
    
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', y + 25);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', 'monospace');
    text.setAttribute('font-size', '11');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', active ? '#2C5F2D' : '#7F8C8D');
    text.textContent = sig.name;
    g.appendChild(text);
    
    mainGroup.appendChild(g);
  });
  
  if (signals.alu_op) {
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', x + controlLabels.length * spacing + 10);
    text.setAttribute('y', y + 5);
    text.setAttribute('text-anchor', 'start');
    text.setAttribute('font-family', 'monospace');
    text.setAttribute('font-size', '13');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#C17B7B');
    text.textContent = `ALU_OP: ${signals.alu_op}`;
    mainGroup.appendChild(text);
  }
}