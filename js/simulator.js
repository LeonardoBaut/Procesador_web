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

// Colores por tipo de instrucción
const COLORS = {
  R: '#FF1493',  // Rosa fuerte para tipo R
  I: '#00FF00',  // Verde para tipo I
  L: '#FFD700',  // Amarillo para Load
  S: '#FF4500',  // Naranja-rojo para Store
  B: '#00BFFF'   // Azul para Branch
};

let svgElement, mainGroup;
let codeEditor, pcValue, currentInstruction, registerList, zoomLevel, svgContainer;

document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Iniciando simulador...");
  initializeDOM();
  initializeSVG();
  setupEventListeners();
  loadInitialCode();
  updateUI();
});

function initializeDOM() {
  // Ahora el SVG está inline, accedemos directamente
  svgElement = document.getElementById('datapathSVG');
  svgContainer = document.getElementById('svgContainer');
  codeEditor = document.getElementById('codeEditor');
  pcValue = document.getElementById('pcValue');
  currentInstruction = document.getElementById('currentInstruction');
  registerList = document.getElementById('registerList');
  zoomLevel = document.getElementById('zoomLevel');
  
  console.log("✓ DOM inicializado");
}

function initializeSVG() {
  try {
    // Como el SVG está inline, accedemos directamente al elemento
    mainGroup = svgElement.getElementById('mainGroup');
    
    if (!mainGroup) {
      console.error("❌ No se encontró 'mainGroup' en el SVG");
      alert("ERROR: El SVG no tiene el elemento 'mainGroup'. Verifica que copiaste el SVG completo.");
      return;
    }
    
    console.log("✅ SVG inline cargado correctamente!");
    
    // Listar todos los cables
    const allWires = svgElement.querySelectorAll('[id^="wire-"]');
    console.log(`📊 Cables encontrados: ${allWires.length}`);
    
    if (allWires.length === 0) {
      console.warn("⚠️ No se encontraron cables en el SVG");
    } else {
      console.log("🔌 Lista de cables:");
      allWires.forEach(w => console.log(`   • ${w.id}`));
    }
    
    applyTransform();
    
    // Hacer una prueba visual
    testWireHighlight();
    
  } catch (error) {
    console.error("❌ Error inicializando SVG:", error);
  }
}

function testWireHighlight() {
  console.log("\n🧪 PRUEBA: Intentando resaltar wire-pc-to-imem...");
  
  setTimeout(() => {
    const testWire = getSVGElement('wire-pc-to-imem');
    if (testWire) {
      console.log("✓ Cable encontrado, aplicando estilo...");
      testWire.setAttribute('stroke', '#FF0000');
      testWire.setAttribute('stroke-width', '8');
      testWire.setAttribute('opacity', '1');
      console.log("✓ ¡Estilo aplicado! Deberías ver una línea ROJA GRUESA.");
      
      // Resetear después de 3 segundos
      setTimeout(() => {
        testWire.setAttribute('stroke', '#6A9C89');
        testWire.setAttribute('stroke-width', '2');
        testWire.setAttribute('opacity', '0.3');
        console.log("↩️ Estilo reseteado");
      }, 3000);
    } else {
      console.error("✗ NO se encontró el cable 'wire-pc-to-imem'");
      console.log("📋 Verifica que tu SVG tiene elementos con id='wire-...'");
    }
  }, 500);
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
    e.preventDefault();
  });
  
  svgContainer.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const deltaX = e.clientX - state.lastMouse.x;
    const deltaY = e.clientY - state.lastMouse.y;
    state.pan.x += deltaX;
    state.pan.y += deltaY;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    applyTransform();
    e.preventDefault();
  });
  
  svgContainer.addEventListener('mouseup', () => {
    state.isDragging = false;
  });
  
  svgContainer.addEventListener('mouseleave', () => {
    state.isDragging = false;
  });
}

function applyTransform() {
  if (mainGroup) {
    mainGroup.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
  }
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
  console.log(`[${type.toUpperCase()}] ${msg}`);
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
  if (reg === 'zero') return 0;
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
  resetWires();
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
        signals = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
        if (newRegs[rs1] === newRegs[rs2]) {
          newPc += offset;
          state.registers = newRegs;
          state.memory = newMem;
          state.pc = newPc;
          state.signalStates = signals;
          addLog(`PC=${state.pc - offset}: ${inst.raw} [TOMADO]`, 'success');
          updateUI();
          highlightWires();
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
          highlightWires();
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
          highlightWires();
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
    highlightWires();
    
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
  resetWires();
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

// ==================== FUNCIONES SVG ====================

function getSVGElement(id) {
  if (!svgElement) {
    console.error("❌ svgElement no está disponible");
    return null;
  }
  return svgElement.getElementById(id);
}

function highlightWires() {
  console.log("\n" + "=".repeat(50));
  
  if (!svgElement) {
    console.error("❌ ERROR: No hay acceso al SVG");
    return;
  }
  
  resetWires();
  
  const signals = state.signalStates;
  if (!signals.type) {
    console.log("⚠️ No hay tipo de instrucción definido");
    return;
  }
  
  const color = COLORS[signals.type];
  console.log(`🎨 ACTIVANDO CAMINO TIPO ${signals.type} - COLOR: ${color}`);
  console.log("=".repeat(50));
  
  const wiresToActivate = getWiresForType(signals.type);
  
  let successCount = 0;
  let failCount = 0;
  
  wiresToActivate.forEach(wireId => {
    const success = activateWire(wireId, color);
    if (success) successCount++;
    else failCount++;
  });
  
  console.log("\n📊 RESUMEN:");
  console.log(`  ✓ Activados: ${successCount}`);
  console.log(`  ✗ Fallidos: ${failCount}`);
  console.log("=".repeat(50) + "\n");
}

function getWiresForType(type) {
  const wireMap = {
    'R': [
      'wire-pc-to-imem',
      'wire-imem-to-reg',
      'wire-reg-rs1-to-alu',
      'wire-reg-rs2-to-mux',
      'wire-mux-to-alu',
      'wire-alu-to-mux2',
      'wire-wb-to-reg'
    ],
    'I': [
      'wire-pc-to-imem',
      'wire-imem-to-reg',
      'wire-imem-to-signext',
      'wire-reg-rs1-to-alu',
      'wire-signext-to-mux',
      'wire-mux-to-alu',
      'wire-alu-to-mux2',
      'wire-wb-to-reg'
    ],
    'L': [
      'wire-pc-to-imem',
      'wire-imem-to-reg',
      'wire-imem-to-signext',
      'wire-reg-rs1-to-alu',
      'wire-signext-to-mux',
      'wire-mux-to-alu',
      'wire-alu-to-dmem',
      'wire-dmem-to-mux2',
      'wire-wb-to-reg'
    ],
    'S': [
      'wire-pc-to-imem',
      'wire-imem-to-reg',
      'wire-imem-to-signext',
      'wire-reg-rs1-to-alu',
      'wire-reg-to-dmem',
      'wire-signext-to-mux',
      'wire-mux-to-alu',
      'wire-alu-to-dmem'
    ],
    'B': [
      'wire-pc-to-imem',
      'wire-imem-to-reg',
      'wire-imem-to-branch',
      'wire-reg-rs1-to-alu',
      'wire-reg-rs2-to-mux',
      'wire-mux-to-alu',
      'wire-branchoff-to-add',
      'wire-pc4-to-branchadd',
      'wire-branchadd-to-mux',
      'wire-pc-to-pcadd'
    ]
  };
  
  return wireMap[type] || [];
}

function activateWire(wireId, color) {
  const wire = getSVGElement(wireId);
  if (wire) {
    console.log(`  ✓ Activando: ${wireId}`);
    
    // Guardar el color original
    const originalStroke = wire.getAttribute('stroke');
    wire.setAttribute('data-original-stroke', originalStroke);
    
    // Aplicar nuevo estilo
    wire.setAttribute('stroke', color);
    wire.setAttribute('stroke-width', '5');
    wire.setAttribute('opacity', '1');
    wire.classList.add('active');
    
    return true;
  } else {
    console.warn(`  ✗ Cable no encontrado: ${wireId}`);
    return false;
  }
}

function resetWires() {
  if (!svgElement) return;
  
  const wires = svgElement.querySelectorAll('.wire');
  wires.forEach(wire => {
    wire.classList.remove('active');
    const originalStroke = wire.getAttribute('data-original-stroke');
    if (originalStroke) {
      wire.setAttribute('stroke', originalStroke);
    }
    wire.setAttribute('stroke-width', '2');
    wire.setAttribute('opacity', '0.3');
  });
}

// Función de debug
function debugSVG() {
  if (svgElement) {
    console.log("Elementos en SVG:");
    const allElements = svgElement.querySelectorAll('*[id]');
    allElements.forEach(el => {
      console.log(`- ${el.id} (${el.tagName})`);
    });
  } else {
    console.log("SVG no cargado aún");
  }
}