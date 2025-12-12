// Estado del simulador
let state = {
  pc: 0,
  registers: Array(32).fill(0),
  memory: Array(256).fill(0),
  program: [],
  running: false,
  signalStates: {},
  
  // Almacena las etiquetas y sus direcciones
  labels: {},
  
  // Estructura para almacenar los valores que fluyen por las líneas
  wireValues: {
    PC: 0,
    PC_Plus_4: 4,
    Instruction: "---",
    ReadData1: 0,
    ReadData2: 0,
    Immediate: 0,
    ALU_Src_B: 0,
    ALU_Result: 0,
    Data_Mem_Read: 0,
    Branch_Target: 0,
    Write_Data: 0,
  },
  
  logs: [],
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDragging: false,
  lastMouse: { x: 0, y: 0 },
  showWireValues: true,
  
  // Para el SVG
  svgInitialized: false
};

// Mapeo de instrucciones RISC-V soportadas
const RISC_V_INSTRUCTIONS = {
  'add': { type: 'R' }, 'sub': { type: 'R' }, 'and': { type: 'R' }, 'or': { type: 'R' }, 'xor': { type: 'R' },
  'sll': { type: 'R' }, 'srl': { type: 'R' }, 'sra': { type: 'R' }, 'slt': { type: 'R' }, 'sltu': { type: 'R' },
  
  'addi': { type: 'I' }, 'andi': { type: 'I' }, 'ori': { type: 'I' }, 'xori': { type: 'I' }, 'slti': { type: 'I' },
  'sltiu': { type: 'I' }, 'slli': { type: 'I' }, 'srli': { type: 'I' }, 'srai': { type: 'I' },
  
  'lw': { type: 'L' }, 'lh': { type: 'L' }, 'lb': { type: 'L' }, 'lhu': { type: 'L' }, 'lbu': { type: 'L' },
  
  'sw': { type: 'S' }, 'sh': { type: 'S' }, 'sb': { type: 'S' },
  
  'beq': { type: 'B' }, 'bne': { type: 'B' }, 'blt': { type: 'B' }, 'bge': { type: 'B' }, 'bltu': { type: 'B' }, 'bgeu': { type: 'B' },
  
  'jal': { type: 'J' }, 'jalr': { type: 'I' },
  
  'lui': { type: 'U' }, 'auipc': { type: 'U' }
};

// Referencias a elementos del DOM
let codeEditor, pcValue, currentInstruction, registerList, zoomLevel;
let svgElement, mainGroup, svgContainer;

document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Simulador RISC-V iniciando...");
  initializeDOM();
  initializeSVG();
  setupEventListeners();
  loadInitialCode();
  updateUI();
  resetWires();
});

function initializeDOM() {
  // Elementos principales
  codeEditor = document.getElementById('codeEditor');
  pcValue = document.getElementById('pcValue');
  currentInstruction = document.getElementById('currentInstruction');
  registerList = document.getElementById('registerList');
  zoomLevel = document.getElementById('zoomLevel');
  svgContainer = document.getElementById('svgContainer');
  
  console.log("✓ DOM inicializado");
  console.log("📋 Elementos encontrados:");
  console.log("  - Code Editor:", !!codeEditor);
  console.log("  - PC Value:", !!pcValue);
  console.log("  - Current Instruction:", !!currentInstruction);
  console.log("  - Register List:", !!registerList);
  console.log("  - SVG Container:", !!svgContainer);
}

function initializeSVG() {
  svgElement = document.getElementById('datapathSVG');
  if (!svgElement) {
    console.error("❌ No se encontró el SVG con ID 'datapathSVG'");
    return;
  }
  
  // Buscar el mainGroup - puede estar dentro del primer SVG
  mainGroup = svgElement.getElementById('mainGroup');
  if (!mainGroup) {
    // Intentar encontrar el SVG interno
    const innerSVG = svgElement.querySelector('svg');
    if (innerSVG) {
      mainGroup = innerSVG.getElementById('mainGroup');
    }
  }
  
  if (!mainGroup) {
    console.error("❌ No se encontró 'mainGroup' en el SVG");
    return;
  }
  
  console.log("✅ SVG cargado correctamente!");
  state.svgInitialized = true;
  
  // Aplicar transformación inicial
  applyTransform();
}

function applyTransform() {
  if (mainGroup) {
    mainGroup.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
  }
}

function setupEventListeners() {
  // Botones de control
  document.getElementById('loadBtn').addEventListener('click', loadCode);
  document.getElementById('stepBtn').addEventListener('click', step);
  document.getElementById('runBtn').addEventListener('click', toggleRun);
  document.getElementById('resetBtn').addEventListener('click', reset);
  
  // Controles de zoom
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
  
  // Eventos para pan en el SVG
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

function loadInitialCode() {
  const initialCode = `# Programa de ejemplo: Fibonacci
# Inicialización
main:
    addi x10, x0, 0     # F[n-2] = 0
    addi x11, x0, 1     # F[n-1] = 1
    addi x5, x0, 100    # Límite
    addi x7, x0, 0      # Contador
    
loop:
    add x12, x10, x11   # F[n] = F[n-2] + F[n-1]
    addi x7, x7, 1      # contador++
    
    # Verificar límite
    bge x12, x5, end    # if F[n] >= límite, terminar
    
    # Actualizar para siguiente iteración
    add x10, x0, x11    # F[n-2] = F[n-1]
    add x11, x0, x12    # F[n-1] = F[n]
    
    j loop              # repetir
    
end:
    # Guardar resultados
    sw x10, 0(x0)       # memoria[0] = F[n-2]
    sw x11, 4(x0)       # memoria[1] = F[n-1]
    sw x12, 8(x0)       # memoria[2] = F[n]
    
    # Operaciones adicionales
    andi x13, x12, 0xFF
    slli x14, x12, 2
    slt x15, x10, x11`;
  
  codeEditor.value = initialCode;
  console.log("✓ Código inicial cargado");
}

function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  console.log(`[${type.toUpperCase()}] ${time} - ${msg}`);
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
  
  // Verificar si es una etiqueta
  if (line.endsWith(':')) {
    return {
      type: 'LABEL',
      label: line.slice(0, -1)
    };
  }
  
  // Patrones para diferentes tipos de instrucciones
  const loadStoreMatch = line.match(/^(lw|lh|lb|lhu|lbu|sw|sh|sb)\s+(\w+),\s*(-?\d+)\((\w+)\)/);
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
  // Mapeo de registros ABI a índices
  const abiMap = {
    'zero': 0, 'x0': 0,
    'ra': 1, 'x1': 1,
    'sp': 2, 'x2': 2,
    'gp': 3, 'x3': 3,
    'tp': 4, 'x4': 4,
    't0': 5, 'x5': 5,
    't1': 6, 'x6': 6,
    't2': 7, 'x7': 7,
    's0': 8, 'fp': 8, 'x8': 8,
    's1': 9, 'x9': 9,
    'a0': 10, 'x10': 10,
    'a1': 11, 'x11': 11,
    'a2': 12, 'x12': 12,
    'a3': 13, 'x13': 13,
    'a4': 14, 'x14': 14,
    'a5': 15, 'x15': 15,
    'a6': 16, 'x16': 16,
    'a7': 17, 'x17': 17,
    's2': 18, 'x18': 18,
    's3': 19, 'x19': 19,
    's4': 20, 'x20': 20,
    's5': 21, 'x21': 21,
    's6': 22, 'x22': 22,
    's7': 23, 'x23': 23,
    's8': 24, 'x24': 24,
    's9': 25, 'x25': 25,
    's10': 26, 'x26': 26,
    's11': 27, 'x27': 27,
    't3': 28, 'x28': 28,
    't4': 29, 'x29': 29,
    't5': 30, 'x30': 30,
    't6': 31, 'x31': 31,
  };
  
  const regLower = reg.toLowerCase();
  if (abiMap.hasOwnProperty(regLower)) {
    return abiMap[regLower];
  }
  
  if (reg.startsWith('x')) {
    const num = parseInt(reg.substring(1));
    if (!isNaN(num) && num >= 0 && num <= 31) return num;
  }
  
  return 0;
}

function collectLabels(lines) {
  const labels = {};
  let pc_bytes = 0;
  
  for (let line of lines) {
    const inst = parseInstruction(line);
    if (inst && inst.type === 'LABEL') {
      labels[inst.label] = pc_bytes;
    } else if (inst && inst.type !== 'LABEL') {
      pc_bytes += 4;
    }
  }
  return labels;
}

function resolveLabels(program, labels) {
  const resolvedProgram = [];
  
  for (let inst of program) {
    if (inst.type === 'LABEL') continue;
    
    const resolvedInst = { ...inst };
    
    // Resolver etiquetas en saltos
    const lastOperandIndex = inst.operands.length - 1;
    const lastOperand = inst.operands[lastOperandIndex];
    
    if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'jal', 'jalr'].includes(inst.opcode)) {
      if (labels.hasOwnProperty(lastOperand)) {
        const currentPC = resolvedProgram.length * 4;
        const targetPC = labels[lastOperand];
        const offset = (targetPC - currentPC) / 4;
        
        const newOperands = [...inst.operands];
        newOperands[lastOperandIndex] = offset.toString();
        resolvedInst.operands = newOperands;
      }
    }
    
    resolvedProgram.push(resolvedInst);
  }
  
  return resolvedProgram;
}

function loadCode() {
  const code = codeEditor.value;
  const lines = code.split('\n');
  const rawProgram = [];
  
  // Primera pasada: parsear todas las líneas
  for (let line of lines) {
    const inst = parseInstruction(line);
    if (inst) rawProgram.push(inst);
  }
  
  // Coleccionar etiquetas
  state.labels = collectLabels(lines);
  console.log("🏷️ Etiquetas encontradas:", state.labels);
  
  // Resolver etiquetas
  state.program = resolveLabels(rawProgram, state.labels);
  
  // Reiniciar estado
  state.pc = 0;
  state.registers = Array(32).fill(0);
  state.memory = Array(256).fill(0);
  state.signalStates = {};
  state.wireValues = {
    PC: 0,
    PC_Plus_4: 4,
    Instruction: "---",
    ReadData1: 0,
    ReadData2: 0,
    Immediate: 0,
    ALU_Src_B: 0,
    ALU_Result: 0,
    Data_Mem_Read: 0,
    Branch_Target: 0,
    Write_Data: 0,
  };
  
  addLog(`Cargadas ${state.program.length} instrucciones`, 'success');
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
  let isBranchTaken = false;
  let isJumpTaken = false;

  const currentPC = state.pc * 4;
  const pc_plus_4 = currentPC + 4;
  
  // Valores del datapath
  let rs1_data = 0, rs2_data = 0, imm_val = 0;
  let alu_input_b = 0, alu_result = 0;
  let data_mem_read = 0, write_data_val = 0;
  let branch_target_val = 0;

  try {
    const instructionInfo = RISC_V_INSTRUCTIONS[op];
    if (!instructionInfo) {
      throw new Error(`Instrucción no soportada: ${op}`);
    }
    
    switch(instructionInfo.type) {
      case 'R':
        rs1_data = state.registers[getRegIndex(ops[1])];
        rs2_data = state.registers[getRegIndex(ops[2])];
        signals = { 
          type: 'R', 
          alu_op: op.toUpperCase(), 
          wer: 1, 
          alu_src: 1, 
          alu2reg: 1, 
          wem: 0, 
          branch: 0,
          jump: 0
        };
        alu_input_b = rs2_data;
        break;
        
      case 'I':
        if (['jalr'].includes(op)) {
          // JALR
          rs1_data = state.registers[getRegIndex(ops[1])];
          imm_val = signExtend(parseInt(ops[2]), 12);
          signals = {
            type: 'I',
            alu_op: 'ADD',
            wer: 1,
            alu_src: 0,
            alu2reg: 0,
            wem: 0,
            branch: 0,
            jump: 1
          };
          alu_input_b = imm_val;
          isJumpTaken = true;
        } else if (['lw', 'lh', 'lb', 'lhu', 'lbu'].includes(op)) {
          // Load
          rs1_data = state.registers[getRegIndex(ops[2])];
          imm_val = signExtend(parseInt(ops[1]), 12);
          signals = {
            type: 'L',
            alu_op: 'ADD',
            wer: 1,
            alu_src: 0,
            alu2reg: 0,
            wem: 0,
            branch: 0,
            jump: 0
          };
          alu_input_b = imm_val;
        } else {
          // I-Type ALU
          rs1_data = state.registers[getRegIndex(ops[1])];
          imm_val = signExtend(parseInt(ops[2]), 12);
          signals = {
            type: 'I',
            alu_op: op.replace('i', '').toUpperCase(),
            wer: 1,
            alu_src: 0,
            alu2reg: 1,
            wem: 0,
            branch: 0,
            jump: 0
          };
          alu_input_b = imm_val;
        }
        break;
        
      case 'S':
        rs1_data = state.registers[getRegIndex(ops[2])];
        rs2_data = state.registers[getRegIndex(ops[0])];
        imm_val = signExtend(parseInt(ops[1]), 12);
        signals = {
          type: 'S',
          alu_op: 'ADD',
          wer: 0,
          alu_src: 0,
          alu2reg: 0,
          wem: 1,
          branch: 0,
          jump: 0
        };
        alu_input_b = imm_val;
        break;
        
      case 'B':
        rs1_data = state.registers[getRegIndex(ops[0])];
        rs2_data = state.registers[getRegIndex(ops[1])];
        const offset = parseInt(ops[2]) * 4;
        imm_val = signExtend(offset, 12);
        signals = {
          type: 'B',
          alu_op: 'CMP',
          wer: 0,
          alu_src: 1,
          alu2reg: 0,
          wem: 0,
          branch: 1,
          jump: 0
        };
        alu_input_b = rs2_data;
        branch_target_val = pc_plus_4 + imm_val;
        break;
        
      case 'J':
        // JAL
        imm_val = parseInt(ops[1]) * 4;
        signals = {
          type: 'J',
          alu_op: 'JUMP',
          wer: 1,
          alu_src: 0,
          alu2reg: 0,
          wem: 0,
          branch: 0,
          jump: 1
        };
        isJumpTaken = true;
        break;
        
      case 'U':
        // LUI, AUIPC
        imm_val = parseInt(ops[1]) << 12;
        signals = {
          type: 'U',
          alu_op: op.toUpperCase(),
          wer: 1,
          alu_src: 0,
          alu2reg: 1,
          wem: 0,
          branch: 0,
          jump: 0
        };
        alu_input_b = imm_val;
        break;
    }
    
    // Ejecutar operación ALU
    switch(op) {
      // R-Type
      case 'add': alu_result = (rs1_data + alu_input_b) | 0; break;
      case 'sub': alu_result = (rs1_data - alu_input_b) | 0; break;
      case 'and': alu_result = rs1_data & alu_input_b; break;
      case 'or': alu_result = rs1_data | alu_input_b; break;
      case 'xor': alu_result = rs1_data ^ alu_input_b; break;
      case 'sll': alu_result = rs1_data << (alu_input_b & 0x1F); break;
      case 'srl': alu_result = rs1_data >>> (alu_input_b & 0x1F); break;
      case 'sra': alu_result = rs1_data >> (alu_input_b & 0x1F); break;
      case 'slt': alu_result = (rs1_data | 0) < (alu_input_b | 0) ? 1 : 0; break;
      case 'sltu': alu_result = (rs1_data >>> 0) < (alu_input_b >>> 0) ? 1 : 0; break;
      
      // I-Type ALU
      case 'addi': alu_result = (rs1_data + alu_input_b) | 0; break;
      case 'andi': alu_result = rs1_data & alu_input_b; break;
      case 'ori': alu_result = rs1_data | alu_input_b; break;
      case 'xori': alu_result = rs1_data ^ alu_input_b; break;
      case 'slti': alu_result = (rs1_data | 0) < alu_input_b ? 1 : 0; break;
      case 'sltiu': alu_result = (rs1_data >>> 0) < (alu_input_b >>> 0) ? 1 : 0; break;
      case 'slli': alu_result = rs1_data << (alu_input_b & 0x1F); break;
      case 'srli': alu_result = rs1_data >>> (alu_input_b & 0x1F); break;
      case 'srai': alu_result = rs1_data >> (alu_input_b & 0x1F); break;
      
      // Load/Store/JALR
      case 'lw': case 'sw': case 'jalr':
      case 'lh': case 'lhu': case 'lb': case 'lbu':
      case 'sh': case 'sb':
        alu_result = (rs1_data + alu_input_b) | 0;
        break;
        
      // U-Type
      case 'lui': alu_result = alu_input_b; break;
      case 'auipc': alu_result = currentPC + alu_input_b; break;
    }
    
    // Manejar memoria
    if (op.startsWith('l')) {
      const addr = alu_result;
      if (addr >= 0 && addr < newMem.length) {
        data_mem_read = newMem[addr];
      }
    }
    
    // Determinar write back data
    if (['jal', 'jalr'].includes(op)) {
      write_data_val = pc_plus_4; // Dirección de retorno
    } else if (['lw', 'lh', 'lb', 'lhu', 'lbu'].includes(op)) {
      write_data_val = data_mem_read;
    } else if (['lui', 'auipc'].includes(op) || instructionInfo.type === 'R' || 
               (instructionInfo.type === 'I' && !op.startsWith('csr'))) {
      write_data_val = alu_result;
    }
    
    // Determinar si hay salto
    if (instructionInfo.type === 'B') {
      let condition = false;
      switch(op) {
        case 'beq': condition = rs1_data === rs2_data; break;
        case 'bne': condition = rs1_data !== rs2_data; break;
        case 'blt': condition = (rs1_data | 0) < (rs2_data | 0); break;
        case 'bge': condition = (rs1_data | 0) >= (rs2_data | 0); break;
        case 'bltu': condition = (rs1_data >>> 0) < (rs2_data >>> 0); break;
        case 'bgeu': condition = (rs1_data >>> 0) >= (rs2_data >>> 0); break;
      }
      if (condition) {
        newPc += parseInt(ops[2]);
        isBranchTaken = true;
      }
    } else if (isJumpTaken) {
      if (op === 'jal') {
        newPc += parseInt(ops[1]);
      } else if (op === 'jalr') {
        const target = (rs1_data + imm_val) & ~1;
        newPc = target / 4;
      }
    }
    
    // Actualizar wire values
    state.wireValues = {
      PC: currentPC,
      PC_Plus_4: pc_plus_4,
      Instruction: inst.raw,
      ReadData1: rs1_data,
      ReadData2: rs2_data,
      Immediate: imm_val,
      ALU_Src_B: alu_input_b,
      ALU_Result: alu_result,
      Data_Mem_Read: data_mem_read,
      Branch_Target: branch_target_val,
      Write_Data: write_data_val,
    };
    
    // Write back a registros
    if (signals.wer === 1) {
      const rd = getRegIndex(ops[0]);
      if (rd !== 0) {
        newRegs[rd] = state.wireValues.Write_Data;
      }
    }
    
    // Write a memoria
    if (signals.wem === 1) {
      const addr = state.wireValues.ALU_Result;
      if (addr >= 0 && addr < newMem.length) {
        newMem[addr] = state.wireValues.ReadData2;
      }
    }
    
    // Actualizar PC si no hubo salto/jump
    if (!isBranchTaken && !isJumpTaken) {
      newPc++;
    }
    
    // Actualizar estado
    state.registers = newRegs;
    state.memory = newMem;
    state.pc = newPc;
    state.signalStates = signals;
    
    // Log
    let logMsg = `PC=${currentPC / 4}: ${inst.raw}`;
    if (isBranchTaken) logMsg += ' [SALTO TOMADO]';
    if (isJumpTaken) logMsg += ' [SALTO INCONDICIONAL]';
    addLog(logMsg, 'success');
    
    updateUI();
    highlightWires();
    
  } catch (error) {
    addLog(`Error ejecutando ${inst.raw}: ${error.message}`, 'error');
    console.error(error);
    state.running = false;
    document.getElementById('runBtn').textContent = 'Ejecutar';
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
  
  if (state.running) {
    runLoop();
  }
}

function runLoop() {
  if (!state.running) return;
  
  if (state.pc < state.program.length) {
    executeInstruction(state.program[state.pc]);
    setTimeout(runLoop, 800);
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
  state.wireValues = {
    PC: 0,
    PC_Plus_4: 4,
    Instruction: "---",
    ReadData1: 0,
    ReadData2: 0,
    Immediate: 0,
    ALU_Src_B: 0,
    ALU_Result: 0,
    Data_Mem_Read: 0,
    Branch_Target: 0,
    Write_Data: 0,
  };
  document.getElementById('runBtn').textContent = 'Ejecutar';
  addLog('Sistema reiniciado', 'success');
  updateUI();
  resetWires();
}

function updateUI() {
  // Actualizar PC
  if (pcValue) {
    pcValue.textContent = state.pc;
  }
  
  // Actualizar instrucción actual
  if (currentInstruction) {
    if (state.pc < state.program.length) {
      currentInstruction.textContent = state.program[state.pc].raw;
    } else {
      currentInstruction.textContent = 'Fin del programa';
    }
  }
  
  // Actualizar registros
  updateRegisterList();
  
  // Actualizar zoom display
  updateZoomDisplay();
  
  // Actualizar botones de control
  updateControlButtons();
}

function updateRegisterList() {
  if (!registerList) return;
  
  const importantRegs = [0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  let html = '';
  
  for (let i of importantRegs) {
    const abiNames = {
      0: 'zero (x0)', 1: 'ra (x1)', 2: 'sp (x2)', 5: 't0 (x5)', 6: 't1 (x6)',
      7: 't2 (x7)', 8: 's0/fp (x8)', 9: 's1 (x9)', 10: 'a0 (x10)', 11: 'a1 (x11)',
      12: 'a2 (x12)', 13: 'a3 (x13)', 14: 'a4 (x14)', 15: 'a5 (x15)'
    };
    
    html += `
      <div class="list-item">
        <span class="reg-name">${abiNames[i] || `x${i}`}:</span>
        <span class="reg-value">${state.registers[i]}</span>
        <span class="reg-hex">0x${state.registers[i].toString(16).padStart(8, '0')}</span>
      </div>
    `;
  }
  
  registerList.innerHTML = html;
}

function updateZoomDisplay() {
  if (zoomLevel) {
    zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
  }
}

function updateControlButtons() {
  const signals = state.signalStates;
  const controlSection = document.querySelector('.state-box');
  
  if (!controlSection || !signals.type) return;
  
  // Crear o actualizar botones de control
  let buttonsHTML = '<div class="control-signals"><h4>Señales de Control:</h4><div class="signal-buttons">';
  
  const buttons = [
    { name: 'Wer', value: signals.wer, desc: 'Write Enable Register' },
    { name: 'ALUsrc', value: signals.alu_src, desc: 'ALU Source (0=Imm, 1=RS2)' },
    { name: 'ALU2reg', value: signals.alu2reg, desc: 'ALU to Register (0=Mem, 1=ALU)' },
    { name: 'Wem', value: signals.wem, desc: 'Write Enable Memory' },
    { name: 'Branch', value: signals.branch, desc: 'Branch Signal' },
    { name: 'Jump', value: signals.jump || 0, desc: 'Jump Signal' },
  ];
  
  buttons.forEach(btn => {
    const active = btn.value === 1;
    buttonsHTML += `
      <div class="signal-button ${active ? 'active' : ''}" title="${btn.desc}">
        <span class="signal-name">${btn.name}</span>
        <span class="signal-value">${active ? '1' : '0'}</span>
      </div>
    `;
  });
  
  // Agregar ALU OP
  if (signals.alu_op) {
    buttonsHTML += `
      <div class="signal-button alu-op" title="ALU Operation">
        <span class="signal-name">ALU_OP</span>
        <span class="signal-value">${signals.alu_op}</span>
      </div>
    `;
  }
  
  buttonsHTML += '</div></div>';
  
  // Insertar después del estado actual
  const existingSignals = controlSection.querySelector('.control-signals');
  if (existingSignals) {
    existingSignals.innerHTML = buttonsHTML;
  } else {
    controlSection.innerHTML += buttonsHTML;
  }
}

// ==================== FUNCIONES SVG ====================

function getSVGElement(id) {
  if (!svgElement) return null;
  
  // Buscar en el SVG principal y en los SVGs internos
  let element = svgElement.getElementById(id);
  if (!element) {
    const innerSVG = svgElement.querySelector('svg');
    if (innerSVG) {
      element = innerSVG.getElementById(id);
    }
  }
  return element;
}

function highlightWires() {
  if (!state.svgInitialized) {
    console.warn("⚠️ SVG no inicializado, no se pueden resaltar cables");
    return;
  }
  
  resetWires();
  
  const signals = state.signalStates;
  if (!signals.type) return;
  
  console.log(`🎨 Activando camino tipo ${signals.type}`);
  
  // Colores por tipo de instrucción
  const colors = {
    'R': '#FF1493',  // Rosa
    'I': '#00FF00',  // Verde
    'L': '#FFD700',  // Amarillo
    'S': '#FF4500',  // Naranja-rojo
    'B': '#00BFFF',  // Azul
    'J': '#9B59B6',  // Púrpura
    'U': '#FF69B4'   // Rosa claro
  };
  
  const color = colors[signals.type] || '#6A9C89';
  const wiresToActivate = getWiresForType(signals.type);
  
  wiresToActivate.forEach(wireId => {
    activateWire(wireId, color);
  });
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
      'wire-branchadd-to-mux'
    ],
    'J': [
      'wire-pc-to-imem',
      'wire-imem-to-branch',
      'wire-pc4-to-branchadd',
      'wire-branchadd-to-mux',
      'wire-wb-to-reg'
    ]
  };
  
  return wireMap[type] || [];
}

function activateWire(wireId, color) {
  const wire = getSVGElement(wireId);
  if (wire) {
    // Guardar color original si no existe
    if (!wire.hasAttribute('data-original-stroke')) {
      const originalStroke = wire.getAttribute('stroke') || '#6A9C89';
      wire.setAttribute('data-original-stroke', originalStroke);
    }
    
    // Aplicar nuevo estilo
    wire.setAttribute('stroke', color);
    wire.setAttribute('stroke-width', '4');
    wire.setAttribute('opacity', '1');
    wire.classList.add('active');
    
    return true;
  } else {
    console.warn(`Cable no encontrado: ${wireId}`);
    return false;
  }
}

function resetWires() {
  if (!svgElement || !state.svgInitialized) return;
  
  // Buscar todos los cables en todos los SVGs
  const wires = [];
  
  // En el SVG principal
  wires.push(...svgElement.querySelectorAll('.wire'));
  
  // En SVGs internos
  const innerSVG = svgElement.querySelector('svg');
  if (innerSVG) {
    wires.push(...innerSVG.querySelectorAll('.wire'));
  }
  
  wires.forEach(wire => {
    wire.classList.remove('active');
    const originalStroke = wire.getAttribute('data-original-stroke');
    if (originalStroke) {
      wire.setAttribute('stroke', originalStroke);
    } else {
      // Colores por defecto basados en el ID
      if (wire.id.includes('pc')) wire.setAttribute('stroke', '#6A9C89');
      else if (wire.id.includes('reg')) wire.setAttribute('stroke', '#7BA97C');
      else if (wire.id.includes('alu')) wire.setAttribute('stroke', '#C17B7B');
      else if (wire.id.includes('dmem')) wire.setAttribute('stroke', '#D4A574');
      else if (wire.id.includes('signext')) wire.setAttribute('stroke', '#9B8FC2');
      else if (wire.id.includes('branch')) wire.setAttribute('stroke', '#457B9D');
      else if (wire.id.includes('control')) wire.setAttribute('stroke', '#9B8FC2');
      else wire.setAttribute('stroke', '#6A9C89');
    }
    wire.setAttribute('stroke-width', '2');
    wire.setAttribute('opacity', '0.3');
  });
}

// Función de debug para ver todos los cables
function debugWires() {
  console.log("🔌 Lista de cables en el SVG:");
  
  // Buscar en el SVG principal
  const wires1 = svgElement.querySelectorAll('[id^="wire-"]');
  wires1.forEach(w => console.log(`  - ${w.id}`));
  
  // Buscar en SVGs internos
  const innerSVG = svgElement.querySelector('svg');
  if (innerSVG) {
    const wires2 = innerSVG.querySelectorAll('[id^="wire-"]');
    wires2.forEach(w => console.log(`  - ${w.id}`));
  }
}