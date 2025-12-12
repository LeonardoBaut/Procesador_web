// ==================== DICCIONARIOS RISC-V ====================
const OPCODES = {
  ADD: "0110011", SUB: "0110011", AND: "0110011", OR: "0110011", XOR: "0110011", SLT: "0110011", SLTU: "0110011", SLL: "0110011", SRL: "0110011", SRA: "0110011",
  ADDI: "0010011", ANDI: "0010011", ORI: "0010011", XORI: "0010011", SLTI: "0010011", SLTUI: "0010011", SLLI: "0010011", SRLI: "0010011", SRAI: "0010011",
  LW: "0000011",
  SW: "0100011",
  BEQ: "1100011", BNE: "1100011", BLT: "1100011", BGE: "1100011",
  // JAL y JALR no implementados en la ejecución, pero necesarios para el ensamblaje
};

const FUNCT3 = {
  ADD: "000", SUB: "000", AND: "111", OR: "110", XOR: "100", SLT: "010", SLTU: "011", SLL: "001", SRL: "101", SRA: "101",
  ADDI: "000", ANDI: "111", ORI: "110", XORI: "100", SLTI: "010", SLTUI: "011", SLLI: "001", SRLI: "101", SRAI: "101",
  LW: "010",
  SW: "010",
  BEQ: "000", BNE: "001", BLT: "100", BGE: "101"
};

const FUNCT7 = {
  ADD: "0000000", SUB: "0100000", AND: "0000000", OR: "0000000", XOR: "0000000", SLT: "0000000", SLTU: "0000000", SLL: "0000000", SRL: "0000000",
  SRA: "0100000",
  SLLI: "0000000", SRLI: "0000000", SRAI: "0100000",
};

// ==================== ESTADO DEL SIMULADOR ====================
let state = {
  pc: 0, // Índice de la instrucción (PC / 4)
  registers: Array(32).fill(0),
  memory: Array(256).fill(0), // 256 Palabras (1024 bytes)
  program: [], // Contiene objetos { raw: '...', binary: '...' }
  labels: {}, // Almacena etiquetas
  running: false,
  signalStates: {},
  logs: [],
  zoom: 0.8,
  pan: { x: 0, y: 0 },
  isDragging: false,
  lastMouse: { x: 0, y: 0 }
};

// Colores por tipo de instrucción
const COLORS = {
  R: '#FF1493',   // Rosa fuerte para tipo R
  I: '#00FF00',   // Verde para tipo I (incluye ADDI, SLTI)
  L: '#FFD700',   // Amarillo para Load (LW)
  S: '#FF4500',   // Naranja para Store (SW)
  B: '#00BFFF'    // Azul para Branch (BEQ, BNE, etc)
};

// Elementos del DOM (variables globales ya declaradas)
let svgElement, mainGroup;
let codeEditor, pcValue, currentInstruction, instType, registerList, zoomLevel, svgContainer, logMessages;

// ==================== ENSAMBLADOR Y UTILIDADES ====================

// Convierte x5 → 5 → binario 5 bits
function reg(x) {
  if (x.toLowerCase() === 'zero') return '00000';
  if (x.toLowerCase() === 'ra') return '00001';
  if (x.toLowerCase() === 'sp') return '00010';
  const num = parseInt(x.replace(/[^0-9]/g, "").toLowerCase().replace('x', ''));
  if (isNaN(num) || num < 0 || num > 31) return '00000'; // Fallback seguro
  return num.toString(2).padStart(5, "0");
}

// Convierte decimal → binario (12 bits) con extensión de signo
function imm12(n) {
  // Usamos Int32 para manejar la extensión de signo si es negativo
  const val = (n < 0) ? (n & 0xFFF) : n;
  return val.toString(2).padStart(12, "0").slice(-12);
}

// Para convertir a Hexadecimal (útil para logs/debugging)
function toHex(bin) {
  return "0x" + parseInt(bin, 2).toString(16).padStart(8, "0");
}

function collectLabels(lines) {
  const labels = {};
  let pc_index = 0; // PC en índice de instrucción (pc_bytes / 4)

  lines.forEach(line => {
    line = line.split("#")[0].trim();
    if (line === "") return;

    if (line.endsWith(":")) {
      const label = line.replace(":", "");
      labels[label] = pc_index; // Almacena el índice de instrucción
    } else {
      pc_index += 1;
    }
  });

  return labels;
}

// Ensamblador (modificado para devolver la instrucción en binario)
function assemble(line, pc_index, labels) {
  const parts = line.split(/[ ,\t()]+/).filter(x => x).map(x => x.replace(':', ''));
  const inst = parts[0].toUpperCase();

  // NOP (addi x0, x0, 0)
  if (inst === "NOP") return { raw: line, type: 'I', binary: "00000000000000000000000000010011" };

  // -----------------------------
  // 1) TIPO R
  // -----------------------------
  if (OPCODES[inst] === "0110011") {
    let rd = reg(parts[1]);
    let rs1 = reg(parts[2]);
    let rs2 = reg(parts[3]);
    let binary = FUNCT7[inst] + rs2 + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    return { raw: line, type: 'R', binary };
  }

  // -----------------------------
  // 2) TIPO I (ADDI, ORI, XORI, LW, SLLI/SRLI/SRAI)
  // -----------------------------
  if (OPCODES[inst] === "0010011" || OPCODES[inst] === "0000011") { // R-I y Load
    let rd = reg(parts[1]);
    let rs1 = reg(parts[2]); // ADDI/Logi/Shift: rs1 | LW: rs1 (base register)
    let imm_val = parts[3]; // ADDI/Logi/Shift: imm | LW: offset

    if (inst === "LW") {
      imm_val = parts[2]; // LW xd, IMM(xs) -> parts[1]=xd, parts[2]=imm, parts[3]=xs
      rs1 = reg(parts[3]);
      rd = reg(parts[1]);
    }

    let imm = imm12(Number(imm_val));
    let binary;
    let type = (inst === "LW") ? 'L' : 'I';

    // Instrucciones I de desplazamiento (SLLI/SRLI/SRAI)
    if (inst.endsWith("I") && (inst.includes("LL") || inst.includes("RA"))) {
      let shamt = parseInt(imm_val).toString(2).padStart(5, "0");
      binary = FUNCT7[inst] + shamt + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    } else {
      binary = imm + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    }

    return { raw: line, type, binary };
  }

  // -----------------------------
  // 3) TIPO S (SW)
  // -----------------------------
  if (inst === "SW") {
    let rs2 = reg(parts[1]); // SW rs2, imm(rs1) -> parts[1]=rs2, parts[2]=imm, parts[3]=rs1
    let imm_val = parts[2];
    let rs1 = reg(parts[3]);

    let imm = imm12(Number(imm_val));

    const immHigh = imm.slice(0, 7);
    const immLow = imm.slice(7);

    let binary = immHigh + rs2 + rs1 + FUNCT3[inst] + immLow + OPCODES[inst];
    return { raw: line, type: 'S', binary };
  }

  // -----------------------------
  // 4) TIPO B (Branches)
  // -----------------------------
  if (OPCODES[inst] === "1100011") {
    let rs1 = reg(parts[1]);
    let rs2 = reg(parts[2]);
    let target = parts[3];
    let type = 'B';

    let offset;
    if (labels[target] !== undefined) {
      offset = labels[target] - pc_index; // Desplazamiento en número de instrucciones
    } else {
      // Manejar offset inmediato (como en el código original, ej: bge x7, x5, 2)
      offset = parseInt(target);
    }

    const imm_int = offset * 4; // El ensamblador real trabaja con desplazamiento en bytes.
    let binary = encodeBranch(inst, rs1, rs2, imm_int);

    return { raw: line, type, binary, offset }; // Almacenamos offset para la simulación
  }

  return { raw: line, type: 'UNKNOWN', binary: "ERROR" };
}


function encodeBranch(op, rs1, rs2, offset_bytes) {
  const opcode = "1100011";
  const funct3 = FUNCT3[op];

  let imm_val = offset_bytes & 0b1111111111111; // 13 bits (bits 12 a 1, más signo)

  // Desensamblar imm en campos tipo B (orden para ensamblaje RISC-V)
  let imm12 = (imm_val >> 12) & 1;
  let imm10_5 = (imm_val >> 5) & 0b111111;
  let imm4_1 = (imm_val >> 1) & 0b1111;
  let imm11 = (imm_val >> 11) & 1;

  return (
    imm12.toString() +
    imm10_5.toString(2).padStart(6, "0") +
    rs2 +
    rs1 +
    funct3 +
    imm4_1.toString(2).padStart(4, "0") +
    imm11.toString() +
    opcode
  );
}

// ==================== PARSING Y EJECUCIÓN (MODIFICADO) ====================

// La instrucción ahora es un objeto { raw, type, binary, [offset] }
// La instrucción 'inst' ahora es un objeto { raw, type, binary, [offset] }
function executeInstruction(inst) {
  const bin = inst.binary;
  const type = inst.type;
  const newRegs = [...state.registers];
  const newMem = [...state.memory];
  let newPc = state.pc + 1; // PC se incrementa por defecto
  let signals = {};
  let modifiedRegIndex = -1; // Rastrea el registro que se modificó

  // --- 1. Decodificación de campos basada en el binario ---
  const rd_bin = bin.slice(20, 25);
  const rs1_bin = bin.slice(12, 17);
  const rs2_bin = bin.slice(7, 12);
  const funct3_bin = bin.slice(17, 20);
  const funct7_bin = bin.slice(0, 7);

  // Funciones de utilidad (asumidas implementadas externamente)
  const binToRegIndex = (b) => parseInt(b, 2);
  const getImmediate = (type, binary) => {
    let imm_bin;
    if (type === 'I' || type === 'L') { // I-type (ADDI, LW)
      imm_bin = binary.slice(0, 12);
    } else if (type === 'S') { // S-type (SW)
      const imm_high = binary.slice(0, 7);
      const imm_low = binary.slice(20, 25);
      imm_bin = imm_high + imm_low;
    } else if (type === 'B') { // B-type (BEQ, BNE, etc.)
      const imm12 = binary.slice(0, 1);
      const imm10_5 = binary.slice(1, 7);
      const imm4_1 = binary.slice(20, 24);
      const imm11 = binary.slice(24, 25);
      imm_bin = imm12 + imm11 + imm10_5 + imm4_1 + '0';
    } else {
      return 0;
    }

    let imm_int = parseInt(imm_bin, 2);
    if (imm_bin[0] === '1') {
      const mask = (-1) << imm_bin.length;
      imm_int = imm_int | mask;
    }
    return imm_int;
  };


  const rd = binToRegIndex(rd_bin);
  const rs1 = binToRegIndex(rs1_bin);
  const rs2 = binToRegIndex(rs2_bin);

  const imm = getImmediate(type, bin);
  const rs1_val = newRegs[rs1] | 0;
  const rs2_val = newRegs[rs2] | 0;


  try {
    switch (type) {
      case 'R': {
        signals = { type: 'R', alu_op: '?', components: ['PC', 'IMEM', 'REGISTERS', 'ALU', 'CONTROL'] };
        let result = 0;
        // Buscamos la instrucción usando OPCODES (0110011), FUNCT3 y FUNCT7
        let op_name = Object.keys(FUNCT3).find(
          key => FUNCT3[key] === funct3_bin &&
            OPCODES[key] === '0110011' &&
            FUNCT7[key] === funct7_bin
        );

        if (op_name) {
          signals.alu_op = op_name;
          switch (op_name) {
            case 'ADD':
              result = (rs1_val + rs2_val) | 0;
              break;
            case 'SUB':
              result = (rs1_val - rs2_val) | 0;
              break;

            // ⭐️ OPERACIONES LÓGICAS (AND, OR, XOR) ⭐️
            case 'AND':
              result = (rs1_val & rs2_val) | 0;
              break;
            case 'OR':
              result = (rs1_val | rs2_val) | 0;
              break;
            case 'XOR':
              result = (rs1_val ^ rs2_val) | 0;
              break;

            // ⭐️ COMPARACIÓN (SLT, SLTU) ⭐️
            case 'SLT': // Set Less Than (con signo)
              // El resultado es 1 si rs1 < rs2, 0 en caso contrario.
              result = (rs1_val < rs2_val) ? 1 : 0;
              break;
            case 'SLTU': // Set Less Than Unsigned (sin signo)
              // Usamos el bitwise zero-fill right shift (>>> 0) para forzar la comparación sin signo en JavaScript
              result = (rs1_val >>> 0) < (rs2_val >>> 0) ? 1 : 0;
              break;

            // ⭐️ DESPLAZAMIENTO (SLL, SRL, SRA) ⭐️
            // El valor de desplazamiento (shamt) se toma de los 5 bits menos significativos de rs2.
            case 'SLL': // Shift Left Logical
              // El desplazamiento en JS es aritmético por defecto, pero el SLL de RISC-V es lógico.
              result = rs1_val << (rs2_val & 0b11111);
              break;
            case 'SRL': // Shift Right Logical (con relleno de ceros)
              result = rs1_val >>> (rs2_val & 0b11111);
              break;
            case 'SRA': // Shift Right Arithmetic (mantiene el bit de signo)
              result = rs1_val >> (rs2_val & 0b11111);
              break;

            default:
              addLog(`R-Type '${op_name}' no implementado`, 'warning');
              return;
          }

          if (rd !== 0) {
            newRegs[rd] = result;
            modifiedRegIndex = rd;
          }
          addLog(`${op_name}: x${rd} = x${rs1}(${rs1_val}) ${op_name} x${rs2}(${rs2_val}) = ${result}`, 'success');
        } else {
          addLog(`R-Type desconocido: f3=${funct3_bin}, f7=${funct7_bin} (Bin: ${bin})`, 'error');
          return;
        }
        break;
      }

      case 'I': {
        signals = { type: 'I', alu_op: '?', components: ['PC', 'IMEM', 'REGISTERS', 'SIGN_EXTEND', 'ALU', 'CONTROL'] };
        let result = 0;

        // Buscamos la instrucción I (ADDI, ANDI, ORI, XORI, etc.)
        // Tienen el mismo OPcode ("0010011") pero diferente FUNCT3.
        let op_name = Object.keys(FUNCT3).find(key => FUNCT3[key] === funct3_bin && OPCODES[key] === '0010011');

        if (op_name) {
          signals.alu_op = op_name;
          switch (op_name) {
            case 'ADDI':
              result = (rs1_val + imm) | 0;
              break;

            // ⭐️ OPERACIONES LÓGICAS CON INMEDIATO (ANDI, ORI, XORI) ⭐️
            case 'ANDI':
              result = (rs1_val & imm) | 0;
              break;
            case 'ORI':
              result = (rs1_val | imm) | 0;
              break;
            case 'XORI':
              result = (rs1_val ^ imm) | 0;
              break;

            // ⭐️ Instrucciones I de Comparación (SLTI, SLTUI) ⭐️
            case 'SLTI': // Set Less Than Immediate (con signo)
              result = (rs1_val < imm) ? 1 : 0;
              break;
            case 'SLTUI': // Set Less Than Immediate Unsigned (sin signo)
              result = (rs1_val >>> 0) < (imm >>> 0) ? 1 : 0;
              break;

            // Las instrucciones I de desplazamiento (SLLI/SRLI/SRAI)
            // usan los 5 bits inferiores del inmediato como shamt y FUNCT7,
            // la decodificación es ligeramente diferente. Usaremos el FUNCT7 para distinguir SLLI/SRLI/SRAI

            case 'SLLI': // Shift Left Logical Immediate
              // En SLLI, el inmediato (shamt) es de 5 bits y no está sign-extended.
              // En el ensamblador original, el shamt se obtiene de parts[3] o imm (12 bits)
              // Aquí, usamos los 5 bits más bajos de 'imm' si asumimos que 'imm' ya fue limitado/truncado a 5 bits por el ensamblador.
              let shamt_sll = imm & 0b11111;
              result = rs1_val << shamt_sll;
              break;

            case 'SRLI': // Shift Right Logical Immediate
              let shamt_srl = imm & 0b11111;
              result = rs1_val >>> shamt_srl;
              break;

            case 'SRAI': // Shift Right Arithmetic Immediate
              // SRAI usa el FUNCT7 (bit 30) para distinguirse. Ya está manejado por 'op_name' si se ensambló correctamente.
              let shamt_sra = imm & 0b11111;
              result = rs1_val >> shamt_sra;
              break;

            default:
              addLog(`I-Type '${op_name}' no implementado`, 'warning');
              return;
          }

          if (rd !== 0) {
            newRegs[rd] = result;
            modifiedRegIndex = rd;
          }
          addLog(`${op_name}: x${rd} = x${rs1}(${rs1_val}) ${op_name} ${imm} = ${result}`, 'success');
        } else {
          addLog(`I-Type desconocido: f3=${funct3_bin} (Bin: ${bin})`, 'error');
          return;
        }
        break;
      }
      case 'L': { // LW (Load)
        signals = { type: 'L', alu_op: 'ADD', components: ['PC', 'IMEM', 'REGISTERS', 'SIGN_EXTEND', 'ALU', 'DMEM', 'CONTROL'] };
        const addr_byte = (rs1_val + imm) | 0;
        const memIndex = addr_byte / 4; // Asume memoria de palabras (4 bytes)

        if (rd !== 0 && memIndex >= 0 && memIndex < newMem.length && addr_byte % 4 === 0) {
          newRegs[rd] = newMem[memIndex];
          modifiedRegIndex = rd;
          addLog(`LW: x${rd} = MEM[x${rs1}(${rs1_val}) + ${imm}] = MEM[${addr_byte}] = ${newRegs[rd]}`, 'success');
        } else if (addr_byte % 4 !== 0) {
          addLog(`LW: Dirección no alineada: ${addr_byte}`, 'error');
        } else {
          addLog(`LW: Error de acceso a memoria en addr ${addr_byte}`, 'error');
        }
        break;
      }

      case 'S': { // SW (Store)
        signals = { type: 'S', alu_op: 'ADD', components: ['PC', 'IMEM', 'REGISTERS', 'SIGN_EXTEND', 'ALU', 'DMEM', 'CONTROL'] };

        // 1. Cálculo de la dirección
        const addr_byte = (rs1_val + imm) | 0;
        const memIndex = addr_byte / 4;
        const store_val = rs2_val;

        // 2. Validación y Ejecución
        if (memIndex >= 0 && memIndex < newMem.length && addr_byte % 4 === 0) {

          // Asegurarse de que el valor se almacene como un entero de 32 bits.
          // ¡Corrección clave aquí! Asignamos el valor al array newMem.
          newMem[memIndex] = store_val | 0;

          state.modifiedMemIndex = memIndex; // Resaltado

          addLog(`SW: MEM[x${rs1}(${rs1_val}) + ${imm}] = MEM[0x${addr_byte.toString(16)}] = x${rs2}(${store_val | 0})`, 'success');
        } else if (addr_byte % 4 !== 0) {
          addLog(`SW: Dirección no alineada: ${addr_byte}`, 'error');
        } else {
          addLog(`SW: Error de acceso a memoria en addr ${addr_byte}`, 'error');
        }
        break;
      }

      case 'B': { // Branches (BEQ, BNE, BGE, BLT)
        signals = { type: 'B', alu_op: 'CMP', components: ['PC', 'IMEM', 'REGISTERS', 'ALU', 'CONTROL', 'PC_ADDER'] };
        const offset = imm / 4; // Inmediato de Branch es en bytes, lo convertimos a índice de instrucción (PC + offset)
        let branch_taken = false;
        let op_name = Object.keys(FUNCT3).find(key => FUNCT3[key] === funct3_bin && OPCODES[key] === '1100011');

        if (op_name) {
          signals.alu_op = op_name;
          switch (op_name) {
            case 'BEQ': branch_taken = (rs1_val === rs2_val); break;
            case 'BNE': branch_taken = (rs1_val !== rs2_val); break;
            case 'BLT': branch_taken = (rs1_val < rs2_val); break;
            case 'BGE': branch_taken = (rs1_val >= rs2_val); break;
            default: addLog(`Branch '${op_name}' no implementado`, 'warning'); return;
          }

          if (branch_taken) {
            newPc = state.pc + offset; // Actualiza el PC con el salto
            addLog(`${op_name}: x${rs1}(${rs1_val}) vs x${rs2}(${rs2_val}) → TOMADO (PC+${offset})`, 'success');
          } else {
            // Si no se toma, newPc ya es state.pc + 1 (por la inicialización)
            addLog(`${op_name}: x${rs1}(${rs1_val}) vs x${rs2}(${rs2_val}) → NO TOMADO`, 'info');
          }
        } else {
          addLog(`Branch desconocido: f3=${funct3_bin}`, 'error'); return;
        }
        break;
      }
      default:
        addLog(`Tipo de instrucción '${type}' no manejado o desconocido.`, 'error');
        return;
    }

  } catch (error) {
    addLog(`Error ejecutando instrucción: ${error.message}`, 'error');
    console.error(error);
    return;
  }

  // --- 3. Actualizar estado (de forma unificada) ---
  state.registers = newRegs;
  state.memory = newMem;
  state.pc = newPc;
  state.signalStates = signals;
  state.modifiedReg = modifiedRegIndex; // Pasa el índice del registro modificado para el resaltado de la UI
}

// ==================== CÓDIGO INICIAL (MODIFICADO) ====================
function loadInitialCode() {
  const initialCode = `# Programa Fibonacci
addi x10, x0, 0
addi x11, x0, 1
addi x5, x0, 10
addi x7, x0, 0
loop:
add x12, x10, x11
addi x7, x7, 1
bge x7, x5, end
add x10, x0, x11
add x11, x0, x12
beq x0, x0, loop
end:
nop`;
  codeEditor.value = initialCode;
}

// Nueva función loadCode que usa el ensamblador
function loadCode() {
  const code = codeEditor.value;
  const lines = code.split('\n');
  const labels = collectLabels(lines);
  const newProgram = [];
  let pc_index = 0;
  state.labels = labels;

  for (let line of lines) {
    line = line.split("#")[0].trim();
    if (line === "") continue;

    if (line.endsWith(":")) continue; // Ignorar líneas que son SOLO un label

    const inst = assemble(line, pc_index, labels);

    if (inst.binary !== "ERROR" && inst.type !== 'UNKNOWN') {
      newProgram.push(inst);
      pc_index += 1;
    } else {
      addLog(`Error al ensamblar: ${line} -> ${inst.binary}`, "error");
    }
  }

  if (newProgram.length === 0) {
    addLog("No se encontraron instrucciones válidas", "error");
    return;
  }

  // Resetear estado del simulador
  state.pc = 0;
  state.registers = Array(32).fill(0);
  state.memory = Array(256).fill(0);
  state.signalStates = {};
  state.program = newProgram;
  state.logs = [];

  addLog(`✅ Cargadas ${newProgram.length} instrucciones`, 'success');
  addLog(`Etiquetas: ${JSON.stringify(labels)}`, 'info');
  updateUI();
  resetWires();
}

// ==================== INICIALIZACIÓN Y FUNCIONES DEL DATAPATH ORIGINAL ====================

// [Las siguientes funciones se mantienen y están intactas del código original, excepto 'loadCode']

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Iniciando simulador RISC-V Datapath...");
  initializeDOM();
  initializeSVG();
  setupEventListeners();
  loadInitialCode();
  updateUI();
});

function initializeDOM() {
  codeEditor = document.getElementById('codeEditor');
  pcValue = document.getElementById('pcValue');
  currentInstruction = document.getElementById('currentInstruction');
  instType = document.getElementById('instType');
  registerList = document.getElementById('registerList');
  zoomLevel = document.getElementById('zoomLevel');
  svgContainer = document.getElementById('svgContainer');
  logMessages = document.getElementById('logMessages');

  console.log("✓ DOM inicializado");
}

function initializeSVG() {
  svgElement = svgContainer.querySelector('svg');
  mainGroup = svgElement.querySelector('g');

  if (!svgElement || !mainGroup) {
    console.error("❌ Error: No se pudo encontrar el SVG correctamente");
    addLog("Error al cargar el datapath", "error");
    return;
  }

  const allPaths = svgElement.querySelectorAll('path[stroke]');
  allPaths.forEach(path => {
    const strokeColor = path.getAttribute('stroke');
    if (strokeColor && strokeColor.includes('#') && path.getAttribute('fill') === 'none') {
      path.classList.add('wire');
      path.setAttribute('data-original-stroke', strokeColor);
    }
  });

  console.log("✅ SVG inicializado correctamente");
  console.log(`📊 Total de cables detectados: ${allPaths.length}`);
  addLog(`Datapath listo - ${allPaths.length} cables detectados`, "success");

  applyTransform();
}

// ==================== EVENT LISTENERS ====================
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
    state.zoom = Math.max(0.4, state.zoom / 1.2);
    updateZoomDisplay();
    applyTransform();
  });

  document.getElementById('zoomResetBtn').addEventListener('click', () => {
    state.zoom = 0.8;
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

// ==================== SISTEMA DE LOGS ====================
function addLog(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  state.logs.unshift({ time, msg, type });
  if (state.logs.length > 20) state.logs.pop();

  updateLogDisplay();
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

function updateLogDisplay() {
  const html = state.logs.map(log => `
        <div class="list-item" style="border-left-color: ${getLogColor(log.type)}">
            <span style="font-size: 0.85em; color: #666;">${log.time}</span>
            <span style="color: ${getLogColor(log.type)};">${log.msg}</span>
        </div>
    `).join('');
  logMessages.innerHTML = html;
}

function getLogColor(type) {
  const colors = {
    success: '#4CAF50',
    error: '#f44336',
    warning: '#FF9800',
    info: '#2196F3'
  };
  return colors[type] || colors.info;
}

// ==================== EJECUCIÓN DEL SIMULADOR ====================

function step() {
  if (!state.program.length) {
    addLog("Primero carga un programa", "warning");
    return;
  }

  if (state.pc < 0 || state.pc >= state.program.length) {
    addLog("Fin del programa o PC fuera de rango", "info");
    state.running = false;
    updateUI();
    return;
  }

  const inst = state.program[state.pc];
  executeInstruction(inst);

  updateUI();
  highlightDatapath();
}

function toggleRun() {
  state.running = !state.running;
  const runBtn = document.getElementById('runBtn');
  runBtn.textContent = state.running ? 'Pausar' : 'Ejecutar';

  if (state.running) {
    runLoop();
  }
}

async function runLoop() {
  while (state.running && state.pc >= 0 && state.pc < state.program.length) {
    step();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Si estamos al final o fuera de rango, detener
    if (state.pc >= state.program.length || state.pc < 0) {
      state.running = false;
      document.getElementById('runBtn').textContent = 'Ejecutar';
      addLog("Programa terminado", "success");
      break;
    }
  }
}

function reset() {
  state.pc = 0;
  state.registers = Array(32).fill(0);
  state.memory = Array(256).fill(0);
  state.signalStates = {};
  state.running = false;

  document.getElementById('runBtn').textContent = 'Ejecutar';
  addLog("Estado reiniciado", "info");

  updateUI();
  resetWires();
}

// ==================== VISUALIZACIÓN DEL DATAPATH (SIMPLIFICADO) ====================
function highlightDatapath() {
    // 1. Apaga todos los cables y reinicia estilos
    resetWires();

    const signals = state.signalStates;
    const instructionType = signals.type; // Obtiene el tipo (ej: 'R')
    const color = COLORS[instructionType] || '#2196F3'; // Obtiene el color correspondiente

    if (!signals || !signals.components || !instructionType) return;

    // Resaltado de Componentes (se mantiene igual la lógica)
    signals.components.forEach(compName => {
        // ... (Tu código existente para resaltar texto y rectángulos) ...
        const allTexts = svgElement.querySelectorAll('text, tspan');
        allTexts.forEach(text => {
            if (text.textContent && text.textContent.includes(compName)) {
                let parent = text.parentElement;
                while (parent && parent.tagName !== 'g') {
                    parent = parent.parentElement;
                }

                if (parent) {
                    const rect = parent.querySelector('rect');
                    if (rect) {
                        rect.style.fill = `${color}33`; // Fondo semitransparente del color
                        rect.style.stroke = color;
                        rect.style.strokeWidth = '2px';
                    }
                }

                text.style.fill = color;
                text.style.fontWeight = 'bold';
            }
        });
    });

    // 2. Resaltar cables Específicos (solo los que tienen la clase del tipo actual)
    
    // Selector: Busca todos los elementos que tengan la clase 'wire' Y la clase del tipo actual (ej: '.wire.wire-R')
    const selector = `.wire.wire-${instructionType}`;
    
    const relevantWires = svgElement.querySelectorAll(selector);

    relevantWires.forEach(wire => {
        // Aplica el estilo al cable con el color definido
        wire.style.stroke = color;
        wire.style.strokeWidth = '3px';
        wire.style.filter = 'drop-shadow(0 0 5px currentColor)';
    });

    if (signals.alu_op) {
        highlightALU(signals.alu_op);
    }
}
function highlightALU(aluOp) {
  const aluTexts = svgElement.querySelectorAll('text');
  aluTexts.forEach(text => {
    if (text.textContent && text.textContent.includes('ALU')) {
      text.style.fill = COLORS[state.signalStates.type] || '#2196F3';
      text.style.fontWeight = 'bold';
    }
  });
}

function resetWires() {
  const wires = svgElement.querySelectorAll('.wire');
  wires.forEach(wire => {
    wire.style.stroke = wire.getAttribute('data-original-stroke');
    wire.style.strokeWidth = '1px';
    wire.style.filter = 'none';
  });

  const rects = svgElement.querySelectorAll('rect');
  rects.forEach(rect => {
    rect.style.fill = '';
    rect.style.stroke = '';
    rect.style.strokeWidth = '';
  });

  const texts = svgElement.querySelectorAll('text');
  texts.forEach(text => {
    text.style.fill = '';
    text.style.fontWeight = '';
  });
}

// ==================== UI UPDATES ====================
function updateUI() {
  pcValue.textContent = state.pc;

  if (state.pc >= 0 && state.pc < state.program.length) {
    const inst = state.program[state.pc];
    currentInstruction.textContent = inst.raw + ` (${toHex(inst.binary)})`;
    instType.textContent = inst.type || '-';
    instType.style.color = COLORS[inst.type] || '#000';
  } else {
    currentInstruction.textContent = '-';
    instType.textContent = '-';
  }

  updateRegisterDisplay();
  updateMemoryDisplay();
  updateZoomDisplay();
}

function updateRegisterDisplay() {
  const registers = state.registers;
  // Lista completa de 32 nombres de registros RISC-V
  const regNames = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0/fp', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];

  const modifiedIndex = state.modifiedReg;

  // Generar la lista de registros con campos de entrada
  const html = registers.map((value, i) => {
    // x0 (zero) nunca debe ser modificable (está hardcodeado a 0)
    const isEditable = (i !== 0);

    const highlightClass = (i === modifiedIndex) ? 'highlight-register' : '';

    return `
            <div class="list-item ${highlightClass}" style="justify-content: space-between;">
                <span>
                    <strong>x${i}</strong>
                    <span style="font-size: 0.8em; color: #888;">(${regNames[i] || 'res'})</span>
                </span>
                
                <input 
                    type="number" 
                    value="${value}" 
                    data-reg-index="${i}" 
                    onchange="handleRegisterChange(this)"
                    ${isEditable ? '' : 'disabled'}
                    style="font-family: monospace; width: 60px; text-align: right; padding: 4px; border: 1px solid #ccc; border-radius: 3px; background-color: ${isEditable ? 'white' : '#f0f0f0'};"
                />
            </div>
        `;
  }).join('');

  registerList.innerHTML = html;
  state.modifiedReg = -1;
}
/**
 * Maneja el cambio manual de valor en un registro.
 * @param {HTMLInputElement} inputElement - El elemento input que cambió.
 */
function handleRegisterChange(inputElement) {
  const index = parseInt(inputElement.getAttribute('data-reg-index'), 10);
  const newValue = parseInt(inputElement.value, 10);

  if (isNaN(newValue)) {
    addLog(`Valor inválido introducido en x${index}.`, 'error');
    // Opcional: restablecer el valor en el campo si es inválido
    inputElement.value = state.registers[index];
    return;
  }

  if (index === 0) {
    // El registro x0 (zero) siempre debe ser 0. Forzamos el valor.
    state.registers[0] = 0;
    inputElement.value = 0;
    addLog(`El registro x0 (zero) no puede ser modificado.`, 'warning');
    return;
  }

  // Actualizar el valor en el estado del simulador
  state.registers[index] = newValue;
  addLog(`Registro x${index} (${state.regNames[index]}) actualizado manualmente a ${newValue}`, 'info');

  // Forzar una actualización de la UI por si algún otro componente depende de este cambio
  updateUI();
}

function updateMemoryDisplay() {
  const memory = state.memory;
  const modifiedIndex = state.modifiedMemIndex;
  let html = '';

  // Muestra solo las primeras 64 palabras de memoria (256 bytes) por defecto
  // Puedes ajustar el límite si necesitas más o menos.
  const displayLimit = Math.min(memory.length, 64);

  for (let i = 0; i < displayLimit; i++) {
    const address = i * 4; // Dirección en bytes (offset 0, 4, 8, 12...)
    const value = memory[i];
    const highlightClass = (i === modifiedIndex) ? 'highlight-memory' : '';

    html += `
            <div class="list-item ${highlightClass}" style="justify-content: space-between; align-items: center;">
                <span style="font-family: monospace; color: #6A0DAD;">
                    0x${address.toString(16).padStart(3, '0')}
                </span>
                
                <input 
                    type="number" 
                    value="${value}" 
                    data-mem-index="${i}" 
                    onchange="handleMemoryChange(this)"
                    style="font-family: monospace; width: 80px; text-align: right; padding: 4px; border: 1px solid #ccc; border-radius: 3px;"
                />
            </div>
        `;
  }

  document.getElementById("memoryList").innerHTML = html;

  // Importante: Resetear el índice modificado para que el resaltado sea temporal
  state.modifiedMemIndex = -1;
}

/**
 * Maneja el cambio manual de valor en una palabra de la memoria.
 * @param {HTMLInputElement} inputElement - El elemento input que cambió.
 */
function handleMemoryChange(inputElement) {
  const index = parseInt(inputElement.getAttribute('data-mem-index'), 10);
  const newValue = parseInt(inputElement.value, 10);
  const address = index * 4;

  if (isNaN(newValue)) {
    addLog(`Valor inválido introducido en la memoria ${address}.`, 'error');
    inputElement.value = state.memory[index];
    return;
  }

  // Actualizar el valor en el estado del simulador
  state.memory[index] = newValue;

  // Solo loguea el valor de 32 bits (entero con signo)
  const signedValue = newValue | 0;

  addLog(`Memoria [0x${address.toString(16).padStart(3, '0')}] actualizada manualmente a ${signedValue}`, 'info');

  // Forzar una actualización de la UI
  updateUI();
}

function updateZoomDisplay() {
  zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
}

// ==================== UTILIDADES ADICIONALES ====================
// El resto de funciones (loadSampleProgram, addSampleMenu) se mantienen igual 
// pero 'loadSampleProgram' llamará a la nueva 'loadCode'.

function loadSampleProgram(programName) {
  const samples = {
    'fibonacci': `# Programa Fibonacci con etiquetas
addi x10, x0, 0
addi x11, x0, 1
addi x5, x0, 10
addi x7, x0, 0
loop:
add x12, x10, x11
addi x7, x7, 1
bge x7, x5, end
add x10, x0, x11
add x11, x0, x12
beq x0, x0, loop
end:
nop`,

    'factorial': `# Factorial de 5
addi x5, x0, 5 # Contador/Límite
addi x6, x0, 1 # Resultado (1)
addi x7, x0, 1 # Iterador (i)
loop:
# Asumimos que MUL no está implementado para simplicidad, usa ADD/SUB si es necesario
# mul x6, x6, x7
addi x7, x7, 1
bge x7, x5, end
beq x0, x0, loop
end:
nop`,

    'array_sum': `# Suma de array
addi x5, x0, 0    # Base de la memoria (Dir: 0)
addi x6, x0, 5    # Contador (5 elementos)
addi x7, x0, 0    # Suma
# Inicialización de memoria para demostración:
# state.memory[0]=1, state.memory[1]=2, state.memory[2]=3, etc.

# Esto debe hacerse ANTES de loadCode si quieres que se muestre en la UI.
state.memory = [1, 2, 3, 4, 5].concat(Array(256-5).fill(0));

loop:
lw x8, 0(x5)
add x7, x7, x8
addi x5, x5, 4 # Mover 4 bytes (1 palabra)
addi x6, x6, -1
bne x6, x0, loop
end:
nop`
  };

  if (samples[programName]) {
    codeEditor.value = samples[programName];
    loadCode();
    addLog(`Programa '${programName}' cargado`, 'success');
  }
}

// Llamar a la inicialización extendida
function addSampleMenu() {
  const controls = document.querySelector('.controls');
  if (!controls) return;

  const sampleDiv = document.createElement('div');
  sampleDiv.className = 'control-group';
  sampleDiv.innerHTML = `
        <label>Ejemplos:</label>
        <select id="sampleSelect" style="flex: 1; padding: 6px;">
            <option value="">Seleccionar programa...</option>
            <option value="fibonacci">Fibonacci (con etiquetas)</option>
            <option value="factorial">Factorial</option>
            <option value="array_sum">Suma de Array (requiere inicialización manual de Memoria)</option>
        </select>
    `;

  controls.appendChild(sampleDiv);

  document.getElementById('sampleSelect').addEventListener('change', (e) => {
    if (e.target.value) {
      loadSampleProgram(e.target.value);
      e.target.value = '';
    }
  });
}

setTimeout(addSampleMenu, 100);

console.log("✅ Simulador RISC-V completamente inicializado");
addLog("Simulador listo. Carga un programa para comenzar.", "info");