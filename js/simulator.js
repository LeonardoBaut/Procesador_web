// ==================== DICCIONARIOS RISC-V (ACTUALIZADOS) ====================
const OPCODES = {
    // R-Type
    ADD: "0110011", SUB: "0110011", AND: "0110011", OR: "0110011", XOR: "0110011", SLT: "0110011", SLTU: "0110011", SLL: "0110011", SRL: "0110011", SRA: "0110011",
    // I-Type (Arith/Logic)
    ADDI: "0010011", ANDI: "0010011", ORI: "0010011", XORI: "0010011", SLTI: "0010011", SLTUI: "0010011", SLLI: "0010011", SRLI: "0010011", SRAI: "0010011",
    // L-Type (Load)
    LW: "0000011",
    // S-Type (Store)
    SW: "0100011",
    // B-Type (Branch)
    BEQ: "1100011", BNE: "1100011", BLT: "1100011", BGE: "1100011", BLTU: "1100011", BGEU: "1100011",
};

const FUNCT3 = {
    ADD: "000", SUB: "000", AND: "111", OR: "110", XOR: "100", SLT: "010", SLTU: "011", SLL: "001", SRL: "101", SRA: "101",
    ADDI: "000", ANDI: "111", ORI: "110", XORI: "100", SLTI: "010", SLTUI: "011", SLLI: "001", SRLI: "101", SRAI: "101",
    LW: "010", SW: "010",
    BEQ: "000", BNE: "001", BLT: "100", BGE: "101", BLTU: "110", BGEU: "111"
};

const FUNCT7 = {
    ADD: "0000000", SUB: "0100000", AND: "0000000", OR: "0000000", XOR: "0000000", SLT: "0000000", SLTU: "0000000", SLL: "0000000", SRL: "0000000",
    SRA: "0100000", 
    // Los shifts inmediatos también usan funct7
    SLLI: "0000000", SRLI: "0000000", SRAI: "0100000",
};

// ==================== MAPEO DE IDS DEL SVG (MANTENIDOS DE LA CORRECCIÓN ANTERIOR) ====================

const SVG_ID_MAP = {
    // Componentes principales
    'PC': 'k_13so6M85FCIRrfIg3Z-1',
    'IMEM': 'k_13so6M85FCIRrfIg3Z-4',
    'REGISTERS': 'k_13so6M85FCIRrfIg3Z-5',
    'ALU': 'k_13so6M85FCIRrfIg3Z-57', 
    'DMEM': 'k_13so6M85FCIRrfIg3Z-7',
    'CONTROL': 'k_13so6M85FCIRrfIg3Z-29',
    'IMM_GEN': 'k_13so6M85FCIRrfIg3Z-56', // Bloque superior
    'SIGN_EXTEND': 'k_13so6M85FCIRrfIg3Z-16', // Usar el ID correcto para extensión/generación de inmediato

    // Cables (Wires) 
    'wire-pc-to-imem': ['k_13so6M85FCIRrfIg3Z-42', 'k_13so6M85FCIRrfIg3Z-43'],
    'wire-imem-to-reg': ['k_13so6M85FCIRrfIg3Z-74', 'k_13so6M85FCIRrfIg3Z-54'],
    'wire-imem-to-signext': ['k_13so6M85FCIRrfIg3Z-78', 'k_13so6M85FCIRrfIg3Z-79'],
    'wire-reg-rs1-to-alu': ['k_13so6M85FCIRrfIg3Z-91', 'k_13so6M85FCIRrfIg3Z-93'],
    'wire-reg-rs2-to-mux': ['k_13so6M85FCIRrfIg3Z-62', 'k_13so6M85FCIRrfIg3Z-92'], 
    'wire-mux-to-alu': ['k_13so6M85FCIRrfIg3Z-60', 'k_13so6M85FCIRrfIg3Z-88'],
    'wire-alu-result': ['k_13so6M85FCIRrfIg3Z-67'], 
    'wire-alu-to-dmem': ['k_13so6M85FCIRrfIg3Z-71', 'k_13so6M85FCIRrfIg3Z-73'],
    'wire-wb-to-reg': ['k_13so6M85FCIRrfIg3Z-81'],
    'wire-branch': ['k_13so6M85FCIRrfIg3Z-36', 'k_13so6M85FCIRrfIg3Z-20']
};

// Mapeo de qué cables encender por tipo de instrucción
const WIRES_BY_TYPE = {
    'R': ['wire-pc-to-imem', 'wire-imem-to-reg', 'wire-reg-rs1-to-alu', 'wire-reg-rs2-to-mux', 'wire-mux-to-alu', 'wire-alu-result', 'wire-wb-to-reg'],
    'I': ['wire-pc-to-imem', 'wire-imem-to-reg', 'wire-imem-to-signext', 'wire-reg-rs1-to-alu', 'wire-mux-to-alu', 'wire-alu-result', 'wire-wb-to-reg'],
    'L': ['wire-pc-to-imem', 'wire-imem-to-reg', 'wire-imem-to-signext', 'wire-reg-rs1-to-alu', 'wire-mux-to-alu', 'wire-alu-to-dmem', 'wire-wb-to-reg'],
    'S': ['wire-pc-to-imem', 'wire-imem-to-reg', 'wire-imem-to-signext', 'wire-reg-rs1-to-alu', 'wire-mux-to-alu', 'wire-alu-to-dmem', 'wire-reg-rs2-to-mux'], // S necesita rs2
    'B': ['wire-pc-to-imem', 'wire-imem-to-reg', 'wire-imem-to-signext', 'wire-reg-rs1-to-alu', 'wire-reg-rs2-to-mux', 'wire-mux-to-alu', 'wire-branch']
};

// ==================== ESTADO DEL SIMULADOR ====================
let state = {
    pc: 0, 
    registers: Array(32).fill(0),
    memory: Array(256).fill(0),
    program: [],
    labels: {},
    running: false,
    signalStates: {},
    logs: [],
    zoom: 1,
    pan: { x: 0, y: 0 },
    isDragging: false,
    lastMouse: { x: 0, y: 0 }
};

const COLORS = {
    R: '#FF1493', I: '#00FF00', L: '#FFD700', S: '#FF4500', B: '#00BFFF'
};

// Elementos del DOM
let svgElement, mainGroup;
let codeEditor, pcValue, currentInstruction, instType, registerList, zoomLevel, svgContainer, logMessages;

// ==================== ENSAMBLADOR ====================
function reg(x) {
    if (x.toLowerCase() === 'zero') return '00000';
    if (x.toLowerCase() === 'ra') return '00001';
    if (x.toLowerCase() === 'sp') return '00010';
    const num = parseInt(x.replace(/[^0-9]/g, "").toLowerCase().replace('x', ''));
    if (isNaN(num) || num < 0 || num > 31) return '00000';
    return num.toString(2).padStart(5, "0");
}

function imm12(n) {
    const val = (n < 0) ? (n & 0xFFF) : n;
    return val.toString(2).padStart(12, "0").slice(-12);
}

function toHex(bin) {
    return "0x" + parseInt(bin, 2).toString(16).padStart(8, "0");
}

function collectLabels(lines) {
    const labels = {};
    let pc_index = 0;
    lines.forEach(line => {
        line = line.split("#")[0].trim();
        if (line === "") return;
        if (line.endsWith(":")) {
            labels[line.replace(":", "")] = pc_index;
        } else {
            pc_index += 1;
        }
    });
    return labels;
}

function assemble(line, pc_index, labels) {
    const parts = line.split(/[ ,\t()]+/).filter(x => x).map(x => x.replace(':', ''));
    const inst = parts[0].toUpperCase();

    if (inst === "NOP") return { raw: line, type: 'I', binary: "00000000000000000000000000010011" };

    if (OPCODES[inst] === "0110011") { // TIPO R
        let rd = reg(parts[1]), rs1 = reg(parts[2]), rs2 = reg(parts[3]);
        return { raw: line, type: 'R', binary: FUNCT7[inst] + rs2 + rs1 + FUNCT3[inst] + rd + OPCODES[inst] };
    }

    if (OPCODES[inst] === "0010011" || OPCODES[inst] === "0000011") { // TIPO I (Arith/Logic/Load)
        let rd, rs1, imm_val;
        if (inst === "LW") {
            rd = reg(parts[1]); imm_val = parts[2]; rs1 = reg(parts[3]);
        } else {
            rd = reg(parts[1]); rs1 = reg(parts[2]); imm_val = parts[3];
        }
        
        let type = (inst === "LW") ? 'L' : 'I';
        let binary;
        
        // Manejo especial para shifts inmediatos (SLLI, SRLI, SRAI)
        if (inst.endsWith("I") && (inst.includes("LL") || inst.includes("RA") || inst.includes("RL"))) {
             // El inmediato es el shamt (5 bits)
             let shamt = parseInt(imm_val).toString(2).padStart(5, "0");
             binary = FUNCT7[inst] + shamt + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
        } else {
             // Immediato normal de 12 bits
             let imm = imm12(Number(imm_val));
             binary = imm + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
        }
        return { raw: line, type, binary };
    }

    if (OPCODES[inst] === "0100011") { // TIPO S (Store)
        let rs2 = reg(parts[1]), imm_val = parts[2], rs1 = reg(parts[3]);
        let imm = imm12(Number(imm_val));
        return { raw: line, type: 'S', binary: imm.slice(0, 7) + rs2 + rs1 + FUNCT3[inst] + imm.slice(7) + OPCODES[inst] };
    }

    if (OPCODES[inst] === "1100011") { // TIPO B (Branch)
        let rs1 = reg(parts[1]), rs2 = reg(parts[2]), target = parts[3];
        let offset = (labels[target] !== undefined) ? labels[target] - pc_index : parseInt(target);
        return { raw: line, type: 'B', binary: encodeBranch(inst, rs1, rs2, offset * 4), offset };
    }

    return { raw: line, type: 'UNKNOWN', binary: "ERROR" };
}

function encodeBranch(op, rs1, rs2, offset_bytes) {
    const opcode = "1100011";
    // Solo necesitamos los 12 bits del offset (incluyendo el bit de signo)
    let imm_val = offset_bytes & 0b1111111111111;
    let imm12 = (imm_val >> 12) & 1, imm10_5 = (imm_val >> 5) & 0b111111;
    let imm4_1 = (imm_val >> 1) & 0b1111, imm11 = (imm_val >> 11) & 1;
    return imm12.toString() + imm10_5.toString(2).padStart(6, "0") + rs2 + rs1 + FUNCT3[op] + imm4_1.toString(2).padStart(4, "0") + imm11.toString() + opcode;
}

// ==================== EJECUCIÓN (LÓGICA CORREGIDA) ====================
function executeInstruction(inst) {
    const bin = inst.binary, type = inst.type;
    const newRegs = [...state.registers], newMem = [...state.memory];
    let newPc = state.pc + 1;
    let signals = { type: type, alu_op: '?', components: ['PC', 'IMEM', 'REGISTERS', 'CONTROL'] };

    const rd = parseInt(bin.slice(20, 25), 2);
    const rs1 = parseInt(bin.slice(12, 17), 2);
    const rs2 = parseInt(bin.slice(7, 12), 2);
    const funct3 = bin.slice(17, 20);
    const funct7 = bin.slice(0, 7);
    
    // Usamos enteros firmados de 32 bits (el default en JS) y sin signo (>>> 0) para las comparaciones/ops no firmadas
    const rs1_val = newRegs[rs1] | 0;
    const rs2_val = newRegs[rs2] | 0;
    
    // Helper para inmediatos
    const getImm = () => {
        let imm_val = 0;
        if(type === 'S') imm_val = parseInt(bin.slice(0,7) + bin.slice(20,25), 2);
        else if(type === 'B') imm_val = inst.offset * 4; 
        else imm_val = parseInt(bin.slice(0, 12), 2);
        
        // Sign extend for 12-bit immediates (I, S, L)
        if ((type === 'I' || type === 'L' || type === 'S') && (imm_val & 0x800)) {
            imm_val = imm_val | 0xFFFFF000; 
        }
        return imm_val;
    };
    let imm = getImm();

    try {
        if (type === 'R') {
            signals.components.push('ALU');
            let op_name = Object.keys(FUNCT3).find(k => FUNCT3[k] === funct3 && OPCODES[k] === '0110011' && (FUNCT7[k] === undefined || FUNCT7[k] === funct7));
            signals.alu_op = op_name || 'ALU';
            let res = 0;
            
            // El shamt es de 5 bits del rs2 para R-Type
            const shamt = rs2_val & 0b11111; 
            
            switch(op_name) {
                case 'ADD': res = rs1_val + rs2_val; break;
                case 'SUB': res = rs1_val - rs2_val; break;
                case 'AND': res = rs1_val & rs2_val; break;
                case 'OR': res = rs1_val | rs2_val; break;
                case 'XOR': res = rs1_val ^ rs2_val; break;
                case 'SLT': res = (rs1_val < rs2_val) ? 1 : 0; break;
                case 'SLTU': res = ((rs1_val >>> 0) < (rs2_val >>> 0)) ? 1 : 0; break;
                case 'SLL': res = rs1_val << shamt; break;
                case 'SRL': res = rs1_val >>> shamt; break;
                case 'SRA': res = rs1_val >> shamt; break;
                default: throw new Error(`Inst. R desconocida: ${bin}`);
            }
            if (rd !== 0) { newRegs[rd] = res; state.modifiedReg = rd; }
            addLog(`${op_name || 'R-Type'} x${rd}, x${rs1}, x${rs2} -> ${res}`, 'success');
        } 
        else if (type === 'I') {
            signals.components.push('ALU', 'IMM_GEN');
            let op_name = Object.keys(FUNCT3).find(k => FUNCT3[k] === funct3 && OPCODES[k] === '0010011' && (FUNCT7[k] === undefined || FUNCT7[k] === funct7));
            signals.alu_op = op_name || 'ALU';
            let res = 0;
            
            // Para shifts inmediatos (SLLI, SRLI, SRAI), el shamt son los 5 bits inferiores del imm
            const i_shamt = parseInt(bin.slice(7, 12), 2) & 0b11111; 

            switch(op_name) {
                case 'ADDI': res = rs1_val + imm; break;
                case 'ANDI': res = rs1_val & imm; break;
                case 'ORI': res = rs1_val | imm; break;
                case 'XORI': res = rs1_val ^ imm; break;
                case 'SLTI': res = (rs1_val < imm) ? 1 : 0; break;
                case 'SLTUI': res = ((rs1_val >>> 0) < (imm >>> 0)) ? 1 : 0; break;
                case 'SLLI': res = rs1_val << i_shamt; break;
                case 'SRLI': res = rs1_val >>> i_shamt; break;
                case 'SRAI': res = rs1_val >> i_shamt; break;
                default: throw new Error(`Inst. I desconocida: ${bin}`);
            }
            
            if (rd !== 0) { newRegs[rd] = res; state.modifiedReg = rd; }
            addLog(`${op_name || 'I-Type'} x${rd}, x${rs1}, ${op_name.includes('L') ? i_shamt : imm} -> ${res}`, 'success');
        }
        else if (type === 'L') { // LW
            signals.components.push('ALU', 'IMM_GEN', 'DMEM');
            let addr = rs1_val + imm;
            if(addr % 4 !== 0) throw new Error(`Dirección de LW no alineada: ${addr}`);
            
            if(rd !== 0) { newRegs[rd] = newMem[addr/4] | 0; state.modifiedReg = rd; } 
            addLog(`LW x${rd}, ${imm}(x${rs1}) -> MEM[${addr}] = ${newRegs[rd] | 0}`, 'success');
        }
        else if (type === 'S') { // SW
            signals.components.push('ALU', 'IMM_GEN', 'DMEM');
            let addr = rs1_val + imm;
            if(addr % 4 !== 0) throw new Error(`Dirección de SW no alineada: ${addr}`);
            
            newMem[addr/4] = rs2_val;
            addLog(`SW x${rs2}, ${imm}(x${rs1}) -> MEM[${addr}] = ${rs2_val}`, 'success');
        }
        else if (type === 'B') {
            signals.components.push('ALU', 'IMM_GEN', 'PC');
            let take = false;
            
            const rs1_unsigned = rs1_val >>> 0;
            const rs2_unsigned = rs2_val >>> 0;

            if (funct3 === '000') take = (rs1_val === rs2_val);          // BEQ
            else if (funct3 === '001') take = (rs1_val !== rs2_val);          // BNE
            else if (funct3 === '100') take = (rs1_val < rs2_val);            // BLT (Signed <)
            else if (funct3 === '101') take = (rs1_val >= rs2_val);           // BGE (Signed >=)
            else if (funct3 === '110') take = (rs1_unsigned < rs2_unsigned);  // BLTU (Unsigned <)
            else if (funct3 === '111') take = (rs1_unsigned >= rs2_unsigned); // BGEU (Unsigned >=)
            else throw new Error(`Inst. B desconocida: ${bin}`);

            if (take) newPc = state.pc + inst.offset;
            
            let op_name = Object.keys(FUNCT3).find(k => FUNCT3[k] === funct3 && OPCODES[k] === '1100011');

            addLog(`${op_name || 'B-Type'} ${take ? 'TOMADO' : 'NO TOMADO'} (Offset: ${inst.offset})`, take ? 'warning' : 'info');
        }
        else {
            addLog(`Tipo de instrucción no soportado: ${type}`, 'error');
        }
    } catch (e) { 
        addLog(`Error en ejecución: ${e.message}`, 'error'); 
        state.running = false; 
    }

    state.registers = newRegs;
    state.memory = newMem;
    state.pc = newPc;
    state.signalStates = signals;
}

// ==================== VISUALIZACIÓN (MANTENIDOS DE LA CORRECCIÓN ANTERIOR) ====================
function findAndInitSVG() {
    const container = document.getElementById('svgContainer');
    svgElement = container.querySelector('svg');

    if (!svgElement) {
        console.error("No SVG Found");
        return;
    }

    // --- CORRECCIÓN FONDO BLANCO ---
    const backgroundRect = svgElement.querySelector('rect');
    if (backgroundRect) {
        backgroundRect.style.fill = '#ffffff'; 
        backgroundRect.style.cssText = "fill: #ffffff !important;"; 
    }
    svgElement.style.background = '#ffffff';
    svgElement.style.backgroundColor = '#ffffff';

    // Identificar el grupo principal
    mainGroup = svgElement.querySelector('g').querySelector('g'); 
    if(!mainGroup) mainGroup = svgElement.querySelector('g');

    // Inicializar cables
    const paths = svgElement.querySelectorAll('path');
    paths.forEach(p => {
        if(p.getAttribute('stroke') && p.getAttribute('fill') === 'none') {
            p.classList.add('wire');
            p.dataset.originalStroke = p.getAttribute('stroke');
            p.style.stroke = '#555555'; 
            p.style.opacity = '0.3'; 
        }
    });

    applyTransform();
}

function highlightDatapath() {
    resetVisuals();
    const signals = state.signalStates;
    if (!signals || !signals.type) return;

    const color = COLORS[signals.type] || '#2196F3';

    // 1. Resaltar Componentes (Cajas)
    if (signals.components) {
        signals.components.forEach(compKey => {
            const drawIoId = SVG_ID_MAP[compKey];
            if (drawIoId) highlightElement(drawIoId, color, true);
        });
    }

    // 2. Resaltar Cables (Wires)
    const wires = WIRES_BY_TYPE[signals.type] || [];
    wires.forEach(wireKey => {
        const wireIds = SVG_ID_MAP[wireKey];
        if (wireIds && Array.isArray(wireIds)) {
            wireIds.forEach(id => highlightElement(id, color, false));
        }
    });
}

function highlightElement(drawIoId, color, isComponent) {
    if (!svgElement) return;

    const group = svgElement.querySelector(`g[data-cell-id="${drawIoId}"]`);

    if (group) {
        const shapes = group.querySelectorAll('path, rect, ellipse, polygon');

        shapes.forEach(shape => {
            // Guardar estado original si no existe
            if (!shape.dataset.origStroke) shape.dataset.origStroke = shape.getAttribute('stroke') || 'none';
            if (!shape.dataset.origWidth) shape.dataset.origWidth = shape.getAttribute('stroke-width') || '1';
            if (!shape.dataset.origFill) shape.dataset.origFill = shape.getAttribute('fill') || 'none';

            if (!isComponent) {
                shape.style.fill = 'none';
            }

            // --- APLICAR RESALTADO ---
            shape.style.stroke = color;
            shape.style.strokeWidth = isComponent ? '4' : '4';
            shape.style.filter = `drop-shadow(0 0 5px ${color})`;
            shape.style.opacity = '1';
            
            if (!isComponent) {
                shape.classList.add('active'); 
            }
        });
    }
}

function resetVisuals() {
    if (!svgElement) return;

    const allModified = svgElement.querySelectorAll('[style*="stroke"]');
    
    allModified.forEach(el => {
        // Restaurar stroke original
        if (el.dataset.origStroke) {
            el.style.stroke = (el.dataset.origStroke === 'none') ? '' : el.dataset.origStroke;
        } else if (el.classList.contains('wire')) {
            el.style.stroke = '#555555'; 
        } else {
            el.style.stroke = '';
        }

        // Restaurar ancho original
        if (el.dataset.origWidth) el.style.strokeWidth = el.dataset.origWidth;
        else el.style.strokeWidth = '';

        // Restaurar relleno (fill)
        if (el.dataset.origFill) {
            el.style.fill = (el.dataset.origFill === 'none' || el.dataset.origFill === 'null') ? '' : el.dataset.origFill;
        } else {
            el.style.fill = '';
        }

        // Quitar filtros (brillo)
        el.style.filter = '';
        
        // Restaurar opacidad
        el.classList.remove('active');
        el.style.opacity = '';

        if (el.classList.contains('wire')) {
            el.style.opacity = '0.3'; 
        }
    });
}

// ==================== UI & INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeDOM();
    setupEventListeners();
    findAndInitSVG(); // Inicializar SVG al cargar
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
}

function setupEventListeners() {
    document.getElementById('loadBtn').addEventListener('click', loadCode);
    document.getElementById('stepBtn').addEventListener('click', step);
    document.getElementById('runBtn').addEventListener('click', toggleRun);
    document.getElementById('resetBtn').addEventListener('click', reset);
    
    // Zoom y Pan
    document.getElementById('zoomInBtn').addEventListener('click', () => { state.zoom *= 1.2; applyTransform(); });
    document.getElementById('zoomOutBtn').addEventListener('click', () => { state.zoom /= 1.2; applyTransform(); });
    document.getElementById('zoomResetBtn').addEventListener('click', () => { state.zoom = 1; state.pan = {x:0, y:0}; applyTransform(); });

    svgContainer.addEventListener('mousedown', e => { state.isDragging = true; state.lastMouse = {x: e.clientX, y: e.clientY}; });
    window.addEventListener('mousemove', e => {
        if (!state.isDragging) return;
        state.pan.x += e.clientX - state.lastMouse.x;
        state.pan.y += e.clientY - state.lastMouse.y;
        state.lastMouse = {x: e.clientX, y: e.clientY};
        applyTransform();
    });
    window.addEventListener('mouseup', () => state.isDragging = false);
}

function applyTransform() {
    if (mainGroup) mainGroup.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
    if (zoomLevel) zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
}

function loadInitialCode() {
    codeEditor.value = `# Fibonacci Simple (Ejemplo de uso de R, I, B)
# x5 = Contador (10)
# x10 = F(n-2) = 0
# x11 = F(n-1) = 1
addi x5, x0, 10
addi x10, x0, 0
addi x11, x0, 1
loop:
# Tipo R: Suma x12 = x10 + x11
add x12, x10, x11
# Tipo R: Desplazamiento
slli x13, x12, 2 # x13 = x12 * 4 (Ejemplo de Shift)
# Tipo R: XOR
xor x14, x13, x12
# Actualizar Fibonacci
add x10, x0, x11
add x11, x0, x12
# Tipo I: Decrementar contador
addi x5, x5, -1
# Tipo B: Salto condicional
bne x5, x0, loop
end:
nop`;
}

function loadCode() {
    const lines = codeEditor.value.split('\n');
    const labels = collectLabels(lines);
    state.program = [];
    let pc = 0;
    
    lines.forEach(line => {
        line = line.split('#')[0].trim();
        if (!line || line.endsWith(':')) return;
        const inst = assemble(line, pc++, labels);
        if (inst.binary !== 'ERROR') state.program.push(inst);
    });
    
    state.pc = 0;
    state.running = false;
    resetVisuals();
    updateUI();
    addLog('Programa cargado exitosamente', 'success');
}

function step() {
    if (state.pc >= state.program.length) return;
    const inst = state.program[state.pc];
    executeInstruction(inst);
    updateUI();
    highlightDatapath(); // Pintar el camino
}

function toggleRun() {
    state.running = !state.running;
    document.getElementById('runBtn').textContent = state.running ? 'Pausar' : 'Ejecutar';
    if (state.running) runLoop();
}

async function runLoop() {
    while (state.running && state.pc < state.program.length) {
        step();
        await new Promise(r => setTimeout(r, 500));
    }
    if (state.pc >= state.program.length) {
        state.running = false;
        document.getElementById('runBtn').textContent = 'Ejecutar';
    }
}

function reset() {
    state.pc = 0;
    state.registers.fill(0);
    state.memory.fill(0);
    state.signalStates = {};
    resetVisuals();
    updateUI();
}

function addLog(msg, type) {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.borderLeftColor = type === 'error' ? 'red' : (type === 'success' ? 'green' : 'blue');
    div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logMessages.prepend(div);
}

function updateUI() {
    pcValue.textContent = state.pc * 4;
    if (state.pc < state.program.length) {
        const inst = state.program[state.pc];
        currentInstruction.textContent = inst.raw;
        instType.textContent = inst.type;
        instType.style.color = COLORS[inst.type];
    } else {
        currentInstruction.textContent = 'FIN DEL PROGRAMA';
        instType.textContent = '';
    }
    
    // Actualizar registros
    registerList.innerHTML = state.registers.map((val, i) => `
        <div class="list-item ${state.modifiedReg === i ? 'highlight-register' : ''}">
            <span class="reg-name">x${i}</span>
            <span class="reg-value">${val}</span>
        </div>
    `).join('');
    state.modifiedReg = -1;
}