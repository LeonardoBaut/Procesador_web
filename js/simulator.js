// ====================== SIMULADOR RISC-V ======================
// Estado del simulador
let pc = 0;
let registers = Array(32).fill(0);
let memory = Array(256).fill(0);
let program = [];
let running = false;
let signalStates = {};

// Zoom y Pan
let zoom = 1;
let pan = { x: 50, y: 50 };
let isDragging = false;
let lastMouse = { x: 0, y: 0 };

const datapathWidth = 1200;
const datapathHeight = 650;

// Componentes del datapath
const components = {
    pc: { x: 50, y: 100, w: 80, h: 50, label: 'PC', color: '#B8E0D2', border: '#6A9C89' },
    pcAdder: { x: 50, y: 200, w: 80, h: 50, label: 'PC+4', color: '#A8DADC', border: '#457B9D' },
    instMem: { x: 200, y: 50, w: 140, h: 180, label: 'Memoria de\nInstrucciones', color: '#D5B9E0', border: '#8B7BA8' },
    regBank: { x: 450, y: 80, w: 150, h: 160, label: 'Banco de\nRegistros', color: '#C7E9C0', border: '#7BA97C' },
    alu: { x: 700, y: 120, w: 120, h: 100, label: 'ALU', color: '#F4C4C4', border: '#C17B7B' },
    dataMem: { x: 920, y: 80, w: 140, h: 160, label: 'Memoria de\nDatos', color: '#FFD6A5', border: '#D4A574' },
    muxAluSrc: { x: 640, y: 150, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    muxAlu2Reg: { x: 860, y: 130, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    control: { x: 400, y: 350, w: 200, h: 80, label: 'Unidad de Control', color: '#E0D4F7', border: '#9B8FC2' }
};

// Referencias DOM
const canvas = document.getElementById('datapathCanvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');

// ====================== FUNCIONES AUXILIARES ======================

function addLog(msg, type = 'info') {
    const logDiv = document.getElementById('executionLog');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${msg}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
    
    // Mantener solo los últimos 50 logs
    while (logDiv.children.length > 50) {
        logDiv.removeChild(logDiv.firstChild);
    }
}

function parseInstruction(line) {
    line = line.trim().split('#')[0].trim();
    if (!line) return null;
    
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

// ====================== CARGA DE CÓDIGO ======================

function loadCode() {
    const code = document.getElementById('input').value;
    const lines = code.split('\n');
    program = [];
    
    for (let line of lines) {
        const inst = parseInstruction(line);
        if (inst) program.push(inst);
    }
    
    pc = 0;
    registers.fill(0);
    memory.fill(0);
    signalStates = {};
    
    updateUI();
    drawDatapath();
    addLog(`Cargadas ${program.length} instrucciones`, 'success');
}

// ====================== EJECUCIÓN DE INSTRUCCIONES ======================

function executeInstruction(inst) {
    const op = inst.opcode;
    const ops = inst.operands;

    try {
        switch(op) {
            case 'add': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = (registers[rs1] + registers[rs2]) | 0;
                signalStates = { type: 'R', alu_op: 'ADD', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'sub': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = (registers[rs1] - registers[rs2]) | 0;
                signalStates = { type: 'R', alu_op: 'SUB', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'addi': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const imm = parseInt(ops[2]);
                if (rd !== 0) registers[rd] = (registers[rs1] + imm) | 0;
                signalStates = { type: 'I', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 1 };
                break;
            }
            case 'and': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] & registers[rs2];
                signalStates = { type: 'R', alu_op: 'AND', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'or': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] | registers[rs2];
                signalStates = { type: 'R', alu_op: 'OR', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'xor': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] ^ registers[rs2];
                signalStates = { type: 'R', alu_op: 'XOR', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'sll': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] << (registers[rs2] & 0x1F);
                signalStates = { type: 'R', alu_op: 'SLL', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'srl': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const rs2 = getRegIndex(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] >>> (registers[rs2] & 0x1F);
                signalStates = { type: 'R', alu_op: 'SRL', wer: 1, alu_src: 1, alu2reg: 1 };
                break;
            }
            case 'slli': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const shamt = parseInt(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] << shamt;
                signalStates = { type: 'I', alu_op: 'SLL', wer: 1, alu_src: 0, alu2reg: 1 };
                break;
            }
            case 'srli': {
                const rd = getRegIndex(ops[0]);
                const rs1 = getRegIndex(ops[1]);
                const shamt = parseInt(ops[2]);
                if (rd !== 0) registers[rd] = registers[rs1] >>> shamt;
                signalStates = { type: 'I', alu_op: 'SRL', wer: 1, alu_src: 0, alu2reg: 1 };
                break;
            }
            case 'lw': {
                const rd = getRegIndex(ops[0]);
                const offset = parseInt(ops[1]);
                const rs1 = getRegIndex(ops[2]);
                const addr = (registers[rs1] + offset) | 0;
                if (rd !== 0 && addr >= 0 && addr < memory.length) {
                    registers[rd] = memory[addr];
                }
                signalStates = { type: 'L', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 0, wem: 0 };
                break;
            }
            case 'sw': {
                const rs2 = getRegIndex(ops[0]);
                const offset = parseInt(ops[1]);
                const rs1 = getRegIndex(ops[2]);
                const addr = (registers[rs1] + offset) | 0;
                if (addr >= 0 && addr < memory.length) {
                    memory[addr] = registers[rs2];
                }
                signalStates = { type: 'S', alu_op: 'ADD', wer: 0, alu_src: 0, alu2reg: 0, wem: 1 };
                break;
            }
            case 'beq': {
                const rs1 = getRegIndex(ops[0]);
                const rs2 = getRegIndex(ops[1]);
                const offset = parseInt(ops[2]);
                signalStates = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, branch: 1 };
                if (registers[rs1] === registers[rs2]) {
                    pc += offset;
                    addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
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
                signalStates = { type: 'B', alu_op: 'NE', wer: 0, alu_src: 1, branch: 1 };
                if (registers[rs1] !== registers[rs2]) {
                    pc += offset;
                    addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
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

        pc++;
        addLog(`PC=${pc-1}: ${inst.raw}`, 'success');
        
    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
        running = false;
    }
    
    updateUI();
    drawDatapath();
}

function step() {
    if (pc >= program.length) {
        addLog('Programa terminado', 'success');
        return;
    }
    executeInstruction(program[pc]);
}

function run() {
    running = !running;
    document.getElementById('runBtn').textContent = running ? 'Pausar' : 'Ejecutar';
    
    if (running) {
        runLoop();
    }
}

function runLoop() {
    if (!running || pc >= program.length) {
        running = false;
        document.getElementById('runBtn').textContent = 'Ejecutar';
        if (pc >= program.length) {
            addLog('Programa finalizado', 'success');
        }
        return;
    }
    
    executeInstruction(program[pc]);
    setTimeout(runLoop, 600);
}

function reset() {
    pc = 0;
    registers.fill(0);
    memory.fill(0);
    running = false;
    signalStates = {};
    document.getElementById('runBtn').textContent = 'Ejecutar';
    
    updateUI();
    drawDatapath();
    addLog('Sistema reiniciado', 'success');
}

// ====================== ACTUALIZACIÓN DE UI ======================

function updateUI() {
    // PC
    document.getElementById('pcValue').textContent = pc;
    
    // Instrucción actual
    const instElem = document.getElementById('currentInstruction');
    instElem.textContent = pc < program.length ? program[pc].raw : 'Fin';
    
    // Registros
    const regList = document.getElementById('registerList');
    regList.innerHTML = '';
    [0, 5, 6, 7, 28, 29, 30, 31].forEach(i => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span class="reg-name">x${i}:</span>
            <span class="reg-value">${registers[i]}</span>
        `;
        regList.appendChild(div);
    });
    
    // Memoria
    const memList = document.getElementById('memoryList');
    memList.innerHTML = '';
    memory.forEach((val, i) => {
        if (val !== 0) {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <span class="mem-addr">[${i}]:</span>
                <span class="mem-value">${val}</span>
            `;
            memList.appendChild(div);
        }
    });
}

// ====================== ZOOM Y PAN ======================

function zoomIn() {
    zoom = Math.min(2.5, zoom * 1.2);
    updateZoomDisplay();
    drawDatapath();
}

function zoomOut() {
    zoom = Math.max(0.5, zoom / 1.2);
    updateZoomDisplay();
    drawDatapath();
}

function zoomReset() {
    zoom = 1;
    pan = { x: 50, y: 50 };
    updateZoomDisplay();
    drawDatapath();
}

function updateZoomDisplay() {
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
}

function handleMouseDown(e) {
    isDragging = true;
    lastMouse = { x: e.clientX, y: e.clientY };
}

function handleMouseMove(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - lastMouse.x;
    const deltaY = e.clientY - lastMouse.y;
    
    pan.x += deltaX;
    pan.y += deltaY;
    
    lastMouse = { x: e.clientX, y: e.clientY };
    drawDatapath();
}

function handleMouseUp() {
    isDragging = false;
}

function handleWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = zoom * delta;
    
    if (newZoom >= 0.5 && newZoom <= 2.5) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scaleChange = newZoom / zoom;
        pan.x = mouseX - (mouseX - pan.x) * scaleChange;
        pan.y = mouseY - (mouseY - pan.y) * scaleChange;
        
        zoom = newZoom;
        updateZoomDisplay();
        drawDatapath();
    }
}

// ====================== DIBUJO DEL DATAPATH ======================

function setupCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

function drawDatapath() {
    // Limpiar
    ctx.fillStyle = '#F5F7FA';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Guardar contexto y aplicar transformación
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    // Grid
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
    
    // Dibujar conexiones
    drawWires();
    
    // Dibujar componentes
    Object.values(components).forEach(comp => drawComponent(comp));
    
    // Dibujar señales de control
    drawControlSignals();
    
    ctx.restore();
}

function drawComponent(comp) {
    const active = signalStates.type !== undefined;
    
    // Sombra
    ctx.shadowColor = active ? 'rgba(100, 150, 200, 0.3)' : 'rgba(100, 150, 200, 0.15)';
    ctx.shadowBlur = active ? 12 : 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Rectángulo
    ctx.fillStyle = comp.color;
    ctx.fillRect(comp.x, comp.y, comp.w, comp.h);
    
    ctx.strokeStyle = active ? comp.border : comp.border + '80';
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeRect(comp.x, comp.y, comp.w, comp.h);
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Etiqueta
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
    const signals = signalStates;
    
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
}

function drawControlSignals() {
    const signals = signalStates;
    if (!signals.type) return;
    
    const x = 450;
    const y = 500;
    const spacing = 80;
    
    const controlLabels = [
        { name: 'WER', value: signals.wer },
        { name: 'ALU_SRC', value: signals.alu_src },
        { name: 'ALU2REG', value: signals.alu2reg },
        { name: 'WEM', value: signals.wem },
        { name: 'BRANCH', value: signals.branch }
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

// ====================== INICIALIZACIÓN ======================

document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.getElementById('loadBtn').addEventListener('click', loadCode);
    document.getElementById('stepBtn').addEventListener('click', step);
    document.getElementById('runBtn').addEventListener('click', run);
    document.getElementById('resetBtn').addEventListener('click', reset);
    
    document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
    document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
    document.getElementById('zoomResetBtn').addEventListener('click', zoomReset);
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);
    
    window.addEventListener('resize', () => {
        setupCanvas();
        drawDatapath();
    });
    
    // Inicialización
    setupCanvas();
    loadCode();
    updateUI();
    drawDatapath();
    
    addLog('Simulador RISC-V inicializado', 'success');
});