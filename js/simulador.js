// Estado del simulador
let state = {
  pc: 0,
  registers: Array(32).fill(0),
  memory: Array(256).fill(0),
  program: [],
  running: false,
  signalStates: {},
  
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
  pan: { x: 50, y: 50 },
  isDragging: false,
  lastMouse: { x: 0, y: 0 }
};

// Constantes del datapath
const datapathWidth = 1400;
const datapathHeight = 700;

// Componentes del datapath
const components = {
  pc: { x: 50, y: 100, w: 80, h: 50, label: 'PC', color: '#B8E0D2', border: '#6A9C89' },
  pcAdder: { x: 50, y: 200, w: 80, h: 50, label: 'PC+4', color: '#A8DADC', border: '#457B9D' },
  muxPC: { x: 100, y: 30, w: 40, h: 60, label: 'MUX \nPC', color: '#D4D4D4', border: '#8E8E8E' },
  instMem: { x: 220, y: 50, w: 140, h: 180, label: 'Memoria de\nInstrucciones', color: '#D5B9E0', border: '#8B7BA8' },
  regBank: { x: 480, y: 80, w: 150, h: 160, label: 'Banco de\nRegistros', color: '#C7E9C0', border: '#7BA97C' },
  signExtend: { x: 400, y: 280, w: 100, h: 50, label: 'Sign\nExtend', color: '#E8DFF5', border: '#9B8FC2' },
  muxImmRd: { x: 400, y: 200, w: 40, h: 60, label: 'MUX \nImm', color: '#D4D4D4', border: '#8E8E8E' }, 
  muxAluSrc: { x: 670, y: 150, w: 40, h: 60, label: 'MUX \nALU \nsrc', color: '#D4D4D4', border: '#8E8E8E' },
  alu: { x: 740, y: 120, w: 120, h: 100, label: 'ALU', color: '#F4C4C4', border: '#C17B7B' },
  muxAlu2Reg: { x: 900, y: 130, w: 40, h: 60, label: 'MUX \nALU \n2reg', color: '#D4D4D4', border: '#8E8E8E' },
  dataMem: { x: 980, y: 80, w: 140, h: 160, label: 'Memoria de\nDatos', color: '#FFD6A5', border: '#D4A574' },
  BranchImmGen: { x: 220, y: 280, w: 100, h: 50, label: 'Imm\nBranch Gen', color: '#FFE5B4', border: '#D4A574' },
  BranchAdder: { x: 150, y: 280, w: 80, h: 50, label: 'Branch\nAdder', color: '#A8DADC', border: '#457B9D' },
  control: { x: 450, y: 380, w: 200, h: 80, label: 'Unidad de Control', color: '#E0D4F7', border: '#9B8FC2' }
};

// Mapeo de coordenadas y etiquetas para las líneas (wires)
const wireMap = {
    // [Value Key, Label Text, X, Y, Alignment ('L'eft, 'R'ight, 'C'enter)]
    
    // --- FETCH ---
    PC_Value:     ['PC', 'PC:', components.pc.x + components.pc.w + 10, components.pc.y + components.pc.h / 2 - 15, 'L'],
    PC_Plus_4:    ['PC_Plus_4', 'PC+4:', components.pcAdder.x + components.pcAdder.w + 10, components.pcAdder.y + components.pcAdder.h / 2, 'L'],
    
    // --- DECODE ---
    Instruction_RegBank: ['Instruction', 'Inst (Asm):', components.regBank.x - 10, components.regBank.y - 15, 'R'],
    Read_Data_1:  ['ReadData1', 'RS1 Data:', components.regBank.x + components.regBank.w + 10, components.regBank.y + 60, 'L'],
    Read_Data_2:  ['ReadData2', 'RS2 Data:', components.regBank.x + components.regBank.w + 10, components.regBank.y + 120, 'L'],
    Immediate_Value:['Immediate', 'Imm (SE):', components.signExtend.x + components.signExtend.w + 10, components.signExtend.y + components.signExtend.h / 2, 'L'],
    
    // --- EXECUTE ---
    ALU_Input_A:  ['ReadData1', 'ALU A:', components.alu.x - 10, components.alu.y + 30, 'R'],
    ALU_Input_B:  ['ALU_Src_B', 'ALU B:', components.alu.x - 10, components.alu.y + 70, 'R'],
    ALU_Result_Out:['ALU_Result', 'ALU Res:', components.alu.x + components.alu.w + 10, components.alu.y + components.alu.h / 2, 'L'],
    
    // --- MEMORY ---
    Mem_Address:  ['ALU_Result', 'Addr:', components.dataMem.x - 10, components.dataMem.y + 60, 'R'],
    Mem_Write_Data:['ReadData2', 'WD (RS2):', components.dataMem.x + components.dataMem.w + 10, components.dataMem.y + 120, 'L'],
    Mem_Read_Data:['Data_Mem_Read', 'RD (Mem):', components.dataMem.x + components.dataMem.w + 10, components.dataMem.y + 150, 'L'],
    
    // --- WRITE BACK (Result of MUX) ---
    Write_Back_Data:['Write_Data', 'WB Data:', components.muxAlu2Reg.x + components.muxAlu2Reg.w + 10, components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2, 'L'],

    // --- BRANCH ---
    Branch_Target:['Branch_Target', 'Branch Target:', components.BranchAdder.x - 10, components.BranchAdder.y + components.BranchAdder.h / 2, 'R'],
};


// Referencias a elementos del DOM
let canvas, ctx, input, pcValue, currentInstruction, registerList, zoomLevel;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  initializeDOM();
  setupEventListeners();
  loadInitialCode();
  updateUI();
  drawDatapath();
});

function initializeDOM() {
  canvas = document.getElementById('datapathCanvas');
  ctx = canvas.getContext('2d');
  input = document.getElementById('input');
  pcValue = document.getElementById('pcValue');
  currentInstruction = document.getElementById('currentInstruction');
  registerList = document.getElementById('registerList');
  zoomLevel = document.getElementById('zoomLevel');
  
  // Configurar tamaño del canvas
  const container = document.getElementById('canvasContainer');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  
  // Redimensionar canvas al cambiar tamaño de ventana
  window.addEventListener('resize', () => {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawDatapath();
  });
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
    drawDatapath();
  });
  
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    state.zoom = Math.max(0.5, state.zoom / 1.2);
    updateZoomDisplay();
    drawDatapath();
  });
  
  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    state.zoom = 1;
    state.pan = { x: 50, y: 50 };
    updateZoomDisplay();
    drawDatapath();
  });
  
  // Eventos del canvas para pan
  canvas.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.lastMouse = { x: e.clientX, y: e.clientY };
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const deltaX = e.clientX - state.lastMouse.x;
    const deltaY = e.clientY - state.lastMouse.y;
    state.pan.x += deltaX;
    state.pan.y += deltaY;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    drawDatapath();
  });
  
  canvas.addEventListener('mouseup', () => {
    state.isDragging = false;
  });
  
  canvas.addEventListener('mouseleave', () => {
    state.isDragging = false;
  });
}

function loadInitialCode() {
  const initialCode = `# Programa de ejemplo: Fibonacci
addi x10, x0, 0
addi x11, x0, 1
addi x5, x0, 500
addi x7, x0, 0

loop:
add x12, x10, x11
addi x7, x7, 1
bge x12, x5, end

add x10, x0, x11
add x11, x0, x12
beq x0, x0, loop

end:
# Programa terminado`;
  input.value = initialCode;
}

function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  state.logs.push({ time, msg, type });
  if (state.logs.length > 50) {
    state.logs.shift();
  }
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
      // [rd/rs2, offset, rs1]
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
  if (reg === 'x0') return 0;
  // Fallback for other non-xN registers
  return 0; 
}

// Función placeholder para collectLabels
function collectLabels(lines) {
    const labels = {};
    let pc_bytes = 0;
    
    for (const line of lines) {
        let content = line.trim().split('#')[0].trim();
        if (content.endsWith(':')) {
            const label = content.slice(0, -1);
            labels[label] = pc_bytes;
        } else if (content) {
            // Asumimos que cada línea válida es una instrucción de 4 bytes
            pc_bytes += 4;
        }
    }
    return labels;
}


function loadCode() {
    const code = input.value;
    const lines = code.split('\n');
    const newProgram = [];
    
    // 1. Recoger etiquetas: labels es un mapa { etiqueta: PC_en_bytes }
    const labels = collectLabels(lines); 
    let current_pc_index = 0; // Índice de la instrucción en state.program (PC en unidades de instrucción)
    
    // 2. Iterar las líneas para construir el programa y resolver saltos
    for (let line of lines) {
        let line_content = line.split("#")[0].trim();
        // Ignorar líneas vacías o líneas que solo son una etiqueta (ya procesadas en collectLabels)
        if (line_content === "" || line_content.endsWith(":")) continue; 

        // Intentar parsear la instrucción
        const inst = parseInstruction(line);

        if (inst) {
            // Lógica para resolver etiquetas
            const lastOperandIndex = inst.operands.length - 1;

            if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu', 'jal', 'jalr'].includes(inst.opcode) && 
                isNaN(parseInt(inst.operands[lastOperandIndex]))) {
                
                const label = inst.operands[lastOperandIndex]; 
                
                if (labels[label] !== undefined) {
                    const targetPC = labels[label];
                    const currentPC = current_pc_index * 4; 
                    const offsetBytes = targetPC - currentPC; 
                    const offsetInstructions = offsetBytes / 4;
                    
                    // Reemplazar la etiqueta por el offset numérico
                    inst.operands[lastOperandIndex] = offsetInstructions.toString(); 
                    
                } else {
                    addLog(`Error de ensamblaje: Etiqueta no encontrada: ${label}`, 'error');
                    return; 
                }
            }
            newProgram.push(inst);
            current_pc_index++;
        }
    }

    // Reinicio del estado del simulador
    state.pc = 0;
    state.registers = Array(32).fill(0);
    state.memory = Array(256).fill(0);
    state.signalStates = {};
    state.wireValues = {}; // Limpiar valores de líneas
    state.program = newProgram;
    state.logs = [];
    
    addLog(`Cargadas ${newProgram.length} instrucciones y resueltas etiquetas.`, 'success');
    updateUI();
    drawDatapath();
}

/**
 * Ejecuta una instrucción en el Datapath.
 * @param {object} inst - La instrucción a ejecutar.
 */
function executeInstruction(inst) {
  const op = inst.opcode;
  const ops = inst.operands;
  const newRegs = [...state.registers];
  const newMem = [...state.memory];
  let newPc = state.pc;
  let signals = {};
  let offsetInstructions = 0;

  // --- PASO 1: DECODE/EXECUTE LÓGICO Y CAPTURA DE VALORES DE REGISTROS/INMEDIATO ---
  const currentPC = state.pc * 4; // PC en bytes
  const pc_plus_4 = currentPC + 4;
  
  // Variables de entrada del Datapath
  let rs1_data = 0; 
  let rs2_data = 0; 
  let imm_val = 0;  
  
  let alu_input_b = 0;
  let alu_result = 0;
  let data_mem_read = 0;
  let write_data_val = 0;
  let branch_target_val = 0;
  let isBranchTaken = false;


  // 1a. Determinar los valores correctos según el tipo de instrucción
  try {
      if (['add', 'sub', 'and', 'or', 'xor', 'sll', 'srl', 'sra', 'slt', 'sltu'].includes(op)) {
          // R-Type: rd, rs1, rs2 -> ops[0], ops[1], ops[2]
          rs1_data = state.registers[getRegIndex(ops[1])];
          rs2_data = state.registers[getRegIndex(ops[2])];
          
      } else if (['addi', 'andi', 'ori', 'xori', 'slti', 'slli', 'srli', 'srai', 'sltiu'].includes(op)) {
          // I-Type (ALU): rd, rs1, imm -> ops[0], ops[1], ops[2]
          rs1_data = state.registers[getRegIndex(ops[1])];
          imm_val = signExtend(parseInt(ops[2]), 12); 
          
      } else if (['lw', 'sw'].includes(op)) {
          // L/S-Type: rd/rs2, offset, rs1 -> ops[0], ops[1], ops[2]
          rs1_data = state.registers[getRegIndex(ops[2])]; // Base register es ops[2]
          imm_val = signExtend(parseInt(ops[1]), 12);     // Offset es ops[1]
          
          if (op === 'sw') {
              rs2_data = state.registers[getRegIndex(ops[0])]; // Dato a guardar (rs2) es ops[0]
          }

      } else if (['beq', 'bne', 'blt', 'bge', 'bltu', 'bgeu'].includes(op)) {
          // B-Type: rs1, rs2, offset -> ops[0], ops[1], ops[2]
          rs1_data = state.registers[getRegIndex(ops[0])]; // Rs1 es ops[0]
          rs2_data = state.registers[getRegIndex(ops[1])]; // Rs2 es ops[1]
          offsetInstructions = parseInt(ops[2]);
          imm_val = signExtend(offsetInstructions * 4, 12); // Immediate es offset * 4 bytes
      }
      
      // 1b. Ejecución Lógica y Señales (Definimos el resultado de la ALU y las señales de control)
      
      switch(op) {
          // --- R-Type ---
          case 'add': case 'sub': case 'and': case 'or': case 'xor': 
          case 'sll': case 'srl': case 'sra': case 'slt': case 'sltu': {
              signals = { type: 'R', alu_op: op.toUpperCase(), wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
              alu_input_b = rs2_data; 
              // Lógica de ALU para R-Type
              alu_result = (op === 'add') ? (rs1_data + alu_input_b) | 0 : 
                           (op === 'sub') ? (rs1_data - alu_input_b) | 0 : 
                           (op === 'and') ? (rs1_data & alu_input_b) : 
                           (op === 'or') ? (rs1_data | alu_input_b) : 
                           (op === 'xor') ? (rs1_data ^ alu_input_b) : 
                           (op === 'sll') ? (rs1_data << (alu_input_b & 0x1F)) : 
                           (op === 'srl') ? (rs1_data >>> (alu_input_b & 0x1F)) : 
                           (op === 'sra') ? (rs1_data >> (alu_input_b & 0x1F)) : 
                           (op === 'slt') ? ((rs1_data | 0) < (alu_input_b | 0) ? 1 : 0) : 
                           (op === 'sltu') ? ((rs1_data >>> 0) < (alu_input_b >>> 0) ? 1 : 0) : 0;
              write_data_val = alu_result;
              break;
          }
          // --- I-Type (ALU) ---
          case 'addi': case 'andi': case 'ori': case 'xori': case 'slti': case 'slli': case 'srli': case 'srai': case 'sltiu': {
              signals = { type: 'I', alu_op: op.toUpperCase().replace('I', ''), wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
              alu_input_b = imm_val; 
              // Lógica de ALU para I-Type
              alu_result = (op === 'addi') ? (rs1_data + alu_input_b) | 0 : 
                           (op === 'andi') ? (rs1_data & alu_input_b) : 
                           (op === 'ori') ? (rs1_data | alu_input_b) : 
                           (op === 'xori') ? (rs1_data ^ alu_input_b) : 
                           (op === 'slli') ? (rs1_data << (alu_input_b & 0x1F)) : 
                           (op === 'srli') ? (rs1_data >>> (alu_input_b & 0x1F)) : 
                           (op === 'srai') ? (rs1_data >> (alu_input_b & 0x1F)) : 
                           (op === 'slti') ? ((rs1_data | 0) < alu_input_b ? 1 : 0) : 
                           (op === 'sltiu') ? ((rs1_data >>> 0) < (alu_input_b >>> 0) ? 1 : 0) : 0;
              write_data_val = alu_result;
              break;
          }
          // --- L-Type (Load) ---
          case 'lw': {
              signals = { type: 'L', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 0, wem: 0, branch: 0 };
              alu_input_b = imm_val;
              alu_result = (rs1_data + alu_input_b) | 0; // Dirección de Memoria
              
              const addr = alu_result;
              if (addr >= 0 && addr < newMem.length) {
                  data_mem_read = newMem[addr];
              }
              write_data_val = data_mem_read; 
              break;
          }
          // --- S-Type (Store) ---
          case 'sw': {
              signals = { type: 'S', alu_op: 'ADD', wer: 0, alu_src: 0, alu2reg: 0, wem: 1, branch: 0 };
              alu_input_b = imm_val;
              alu_result = (rs1_data + alu_input_b) | 0; // Dirección de Memoria
              // Dato a escribir es rs2_data, no hay Write Back a registro.
              break;
          }
          // --- B-Type (Branch) ---
          case 'beq': case 'bne': case 'blt': case 'bge': case 'bltu': case 'bgeu': {
              signals = { type: 'B', alu_op: 'CMP', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
              alu_input_b = rs2_data; 
              alu_result = (rs1_data - alu_input_b) | 0; // ALU para comparación
              
              branch_target_val = pc_plus_4 + imm_val; // Dirección absoluta del salto
              
              if ((op === 'beq' && rs1_data === rs2_data) ||
                  (op === 'bne' && rs1_data !== rs2_data) ||
                  (op === 'blt' && (rs1_data | 0) < (rs2_data | 0)) ||
                  (op === 'bge' && (rs1_data | 0) >= (rs2_data | 0)) ||
                  (op === 'bltu' && (rs1_data >>> 0) < (rs2_data >>> 0)) ||
                  (op === 'bgeu' && (rs1_data >>> 0) >= (rs2_data >>> 0))) {
                  
                  newPc += offsetInstructions;
                  isBranchTaken = true;
              }
              break;
          }
          // --- J-Type (Saltos) ---
          case 'jal': {
              // Simplificado: asume que el offset ya fue resuelto en loadCode (offsetInstructions)
              signals = { type: 'J', alu_op: 'JUMP', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
              
              // Dato a escribir (dirección de retorno)
              write_data_val = pc_plus_4;
              
              // Actualizar PC (se hace en el paso final, solo marcamos el salto)
              newPc += offsetInstructions;
              isBranchTaken = true; // Forzamos el salto
              break;
          }
          case 'jalr': {
              // Simplificado: asume que el offset ya fue resuelto en loadCode
              signals = { type: 'J', alu_op: 'JUMPR', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
              
              // Dato a escribir (dirección de retorno)
              write_data_val = pc_plus_4;
              
              // Calcular PC destino: (rs1 + offset) & ~1
              const imm = signExtend(parseInt(ops[2]), 12);
              const rs1 = getRegIndex(ops[1]);
              const jumpTargetBytes = (state.registers[rs1] + imm) & ~1;
              
              // Actualizar newPc (en instrucciones)
              newPc = jumpTargetBytes / 4;
              isBranchTaken = true; 
              break;
          }
          
          default:
              addLog(`Instrucción no soportada: ${op}`, 'error');
              return;
      }
      
      // --- PASO 2: CAPTURA DE VALORES AL ESTADO GLOBAL (Para el Dibujo) ---
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

      // --- PASO 3: ESCRITURA DE REGISTROS/MEMORIA (Write Back - ¡CORREGIDO Y SIMPLIFICADO!) ---
      
      // 3a. Escritura de Registro (si wer=1)
      if (signals.wer === 1) {
          const rd = getRegIndex(ops[0]); // RD es el primer operando para R, I, L, J-types
          if (rd !== 0) {
              // Escribimos el valor que pasó por el MUX ALU2REG (Write_Data)
              newRegs[rd] = state.wireValues.Write_Data;
          }
      }
      
      // 3b. Escritura de Memoria (si wem=1, solo para SW)
      if (signals.wem === 1) {
          const addr = state.wireValues.ALU_Result; // Dirección calculada por la ALU
          const data_to_write = state.wireValues.ReadData2; // Dato a guardar (RS2)
          
          if (addr >= 0 && addr < newMem.length) {
              newMem[addr] = data_to_write;
          }
      }

      // 4. Actualizar PC (Si no hubo salto, avanza 1 instrucción)
      if (!isBranchTaken) {
        newPc++;
      }
      
      // 5. Escribir el estado final y logging
      state.registers = newRegs;
      state.memory = newMem;
      state.pc = newPc;
      state.signalStates = signals;
      
      const logMsg = isBranchTaken ? `PC=${currentPC / 4}: ${inst.raw} [SALTO TOMADO]` : `PC=${currentPC / 4}: ${inst.raw}`;
      addLog(logMsg, 'success');
      updateUI();
      drawDatapath();
      
  } catch (error) {
    // Si hay un error, el programa se detiene y loggea el error
    addLog(`Error fatal en la ejecución de ${inst.raw}: ${error.message}`, 'error');
    console.error(error); // Log en la consola para debugging
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
    // Ajustar el tiempo para que el simulador no corra demasiado rápido
    setTimeout(runLoop, 1500); 
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
  state.wireValues = {}; // Limpiar valores de líneas
  document.getElementById('runBtn').textContent = 'Ejecutar';
  addLog('Sistema reiniciado', 'success');
  updateUI();
  drawDatapath();
}

function updateUI() {
  // Actualizar PC
  pcValue.textContent = state.pc;
  
  // Actualizar instrucción actual
  if (state.pc < state.program.length) {
    currentInstruction.textContent = state.program[state.pc].raw;
  } else {
    currentInstruction.textContent = 'Fin del programa';
  }
  
  // Actualizar registros
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

// NUEVO: Función para dibujar las etiquetas y valores en las líneas
function drawWireLabels() {
    ctx.font = 'bold 10px monospace';
    ctx.strokeStyle = 'transparent';
    
    for (const key in wireMap) {
        const [valueKey, label, x, y, align] = wireMap[key];
        
        let value = state.wireValues[valueKey];
        
        // Formato del valor
        if (valueKey === 'Instruction') {
            value = state.program[state.pc] ? state.program[state.pc].raw : '---';
        } else {
            // Aseguramos que solo mostramos 32 bits, si es numérico
            value = (value === undefined || value === null) ? '---' : value;
            
            if (valueKey === 'PC' || valueKey === 'PC_Plus_4' || valueKey === 'Branch_Target') {
                // Formato hexadecimal para direcciones
                value = '0x' + (state.wireValues[valueKey] >>> 0).toString(16).padStart(8, '0');
            } else if (!isNaN(state.wireValues[valueKey])) {
                 // Formato decimal con signo para otros valores de 32 bits
                 value = (state.wireValues[valueKey] | 0).toString(10);
            }
        }

        ctx.textAlign = align === 'L' ? 'left' : (align === 'R' ? 'right' : 'center');

        // Dibujar la etiqueta fija
        ctx.fillStyle = '#457B9D'; // Color del label (azul)
        ctx.fillText(label, x, y);
        
        // Dibujar el valor dinámico
        ctx.fillStyle = '#C17B7B'; // Color del valor (rojo/vino)
        if (valueKey === 'Instruction') {
            ctx.font = '10px monospace';
            ctx.fillText(value, x, y + 12);
            ctx.font = 'bold 10px monospace';
        } else {
            ctx.fillText(value, x, y + 12); 
        }
    }
}


function drawDatapath() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = '#F5F7FA';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(state.pan.x, state.pan.y);
  ctx.scale(state.zoom, state.zoom);
  
  // Dibujar grid
  drawGrid();
  
  // Dibujar conexiones
  drawWires();
  
  // Dibuja etiquetas de líneas y valores
  drawWireLabels(); 
  
  // Dibujar componentes
  for (let comp of Object.values(components)) {
    drawComponent(comp);
  }
  
  // Dibujar señales de control
  drawControlSignals();
  
  ctx.restore();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(189, 195, 199, 0.2)';
  ctx.lineWidth = 1;
  
  for (let x = 0; x < datapathWidth; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, datapathHeight);
    ctx.stroke();
  }
  
  for (let y = 0; y < datapathHeight; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(datapathWidth, y);
    ctx.stroke();
  }
}

function drawComponent(comp) {
  const active = state.signalStates.type !== undefined;
  
  ctx.shadowColor = active ? 'rgba(100, 150, 200, 0.3)' : 'rgba(100, 150, 200, 0.15)';
  ctx.shadowBlur = active ? 12 : 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  ctx.fillStyle = comp.color;
  ctx.fillRect(comp.x, comp.y, comp.w, comp.h);
  
  ctx.strokeStyle = active ? comp.border : comp.border + '80';
  ctx.lineWidth = active ? 3 : 2;
  ctx.strokeRect(comp.x, comp.y, comp.w, comp.h);
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  ctx.fillStyle = '#2C3E50';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = comp.label.split('\n');
  const lineHeight = 16;
  const startY = comp.y + comp.h / 2 - (lines.length - 1) * lineHeight / 2;
  
  lines.forEach((line, i) => {
    ctx.fillText(line, comp.x + comp.w / 2, startY + i * lineHeight);
  });
}

function drawLine(x1, y1, x2, y2, active, color = '#6A9C89', width = 2) {
  ctx.strokeStyle = active ? color : '#BDC3C7';
  ctx.lineWidth = active ? width : 1.5;
  
  if (active) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
  }
  
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  
  ctx.shadowBlur = 0;
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
    components.dataMem.x + components.dataMem.w, components.dataMem.y + 120,
    components.muxAlu2Reg.x, components.muxAlu2Reg.y + 15,
    signals.alu2reg === 0, '#D4A574', 3
  );
  
  // MUX ALU2REG a Banco Registros (writeback)
  const wbX = components.muxAlu2Reg.x + components.muxAlu2Reg.w; // Sale del MUX
  const wbY = components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2;
  const isWritingBack = signals.wer === 1;

  drawLine(wbX, wbY, wbX + 30, wbY, isWritingBack, '#7BA97C', 3);
  drawLine(wbX + 30, wbY, wbX + 30, components.regBank.y - 20, isWritingBack, '#7BA97C', 3);
  drawLine(wbX + 30, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, isWritingBack, '#7BA97C', 3);
  drawLine(components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y, isWritingBack, '#7BA97C', 3);
  
  // Branch connections (usa BranchImmGen y BranchAdder)
  if (signals.branch === 1) {
    // Instruction Mem (Opcode/Func) to Branch Imm Generator
    drawLine(
      components.instMem.x + components.instMem.w, components.instMem.y + 150,
      components.BranchImmGen.x, components.BranchImmGen.y + 25,
      true, '#D4A574', 2
    );
    
    // Branch Imm Generator to Branch Adder (Offset)
    drawLine(
      components.BranchImmGen.x, components.BranchImmGen.y + 25,
      components.BranchAdder.x + components.BranchAdder.w, components.BranchAdder.y + 25,
      true, '#457B9D', 3
    );
    
    // PC+4 (pcAdder) to Branch Adder (Base Address)
    drawLine(
      components.pcAdder.x + components.pcAdder.w / 2, components.pcAdder.y + components.pcAdder.h,
      components.BranchAdder.x + components.BranchAdder.w / 2, components.BranchAdder.y,
      true, '#6A9C89', 2
    );
    
    // Branch Adder to PC MUX (New PC Target)
    drawLine(
      components.BranchAdder.x, components.BranchAdder.y + 25,
      components.muxPC.x + 20, components.muxPC.y + 50,
      true, '#457B9D', 2
    );
  }
}

function drawControlSignals() {
  const signals = state.signalStates;
  if (!signals.type) return;
  
  const x = 450;
  const y = 490;
  const spacing = 80;
  
  const controlLabels = [
    { name: 'Wer', value: signals.wer },
    { name: 'ALUsrc', value: signals.alu_src },
    { name: 'ALU2reg', value: signals.alu2reg },
    { name: 'Wem', value: signals.wem },
    { name: 'Branch', value: signals.branch }
  ];
  
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  
  controlLabels.forEach((sig, i) => {
    const active = sig.value === 1;
    const cx = x + i * spacing;
    
    ctx.fillStyle = active ? '#7BA97C' : '#E8E8E8';
    ctx.beginPath();
    ctx.arc(cx, y, 10, 0, Math.PI * 2);
    ctx.fill();
    
    if (active) {
      ctx.strokeStyle = '#5A8A5C';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#7BA97C';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = '#BDC3C7';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    
    ctx.fillStyle = active ? '#2C5F2D' : '#7F8C8D';
    ctx.fillText(sig.name, cx, y + 25);
  });
  
  if (signals.alu_op) {
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#C17B7B';
    ctx.textAlign = 'left';
    ctx.fillText(`ALU_OP: ${signals.alu_op}`, x + controlLabels.length * spacing + 10, y + 5);
  }
}