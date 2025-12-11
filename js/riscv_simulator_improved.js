// ============================================
// RISC-V Simulator - Core Logic con Zoom y Pan
// ============================================

class RISCVSimulator {
    constructor() {
        this.pc = 0;
        this.registers = new Array(32).fill(0);
        this.memory = new Array(256).fill(0);
        this.instructions = [];
        this.currentInstruction = null;
        this.isRunning = false;
        this.signalStates = {};
        this.animationFrame = null;
        
        // Propiedades de zoom y pan
        this.zoom = 1.0;
        this.minZoom = 0.5;
        this.maxZoom = 2.5;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // Tamaño del datapath (más grande para evitar cortes)
        this.datapathWidth = 1200;
        this.datapathHeight = 650;
        
        // Inicializar canvas
        this.canvasContainer = document.getElementById('canvasContainer');
        this.canvas = document.getElementById('datapathCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        
        // Bindings
        this.setupEventListeners();
        this.initializeUI();
    }
    
    setupCanvas() {
        // Ajustar tamaño del canvas al contenedor
        const rect = this.canvasContainer.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        
        // Centrar el datapath inicialmente
        this.panX = (this.canvasWidth - this.datapathWidth) / 2;
        this.panY = (this.canvasHeight - this.datapathHeight) / 2;
    }
    
    setupEventListeners() {
        // Botones principales
        document.getElementById('loadBtn').addEventListener('click', () => this.loadCode());
        document.getElementById('stepBtn').addEventListener('click', () => this.step());
        document.getElementById('runBtn').addEventListener('click', () => this.run());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        
        // Controles de zoom
        document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomResetBtn').addEventListener('click', () => this.zoomReset());
        
        // Pan con mouse
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Zoom con rueda del mouse
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        
        // Redimensionar ventana
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.drawDatapath();
        });
    }
    
    // ============================================
    // Controles de Zoom y Pan
    // ============================================
    
    zoomIn() {
        this.setZoom(this.zoom * 1.2);
    }
    
    zoomOut() {
        this.setZoom(this.zoom / 1.2);
    }
    
    zoomReset() {
        this.zoom = 1.0;
        this.panX = (this.canvasWidth - this.datapathWidth) / 2;
        this.panY = (this.canvasHeight - this.datapathHeight) / 2;
        this.updateZoomDisplay();
        this.drawDatapath();
    }
    
    setZoom(newZoom) {
        // Limitar zoom
        newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
        
        // Calcular centro del viewport
        const centerX = this.canvasWidth / 2;
        const centerY = this.canvasHeight / 2;
        
        // Ajustar pan para mantener el centro
        const scaleChange = newZoom / this.zoom;
        this.panX = centerX - (centerX - this.panX) * scaleChange;
        this.panY = centerY - (centerY - this.panY) * scaleChange;
        
        this.zoom = newZoom;
        this.updateZoomDisplay();
        this.drawDatapath();
    }
    
    updateZoomDisplay() {
        document.getElementById('zoomLevel').textContent = Math.round(this.zoom * 100) + '%';
    }
    
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvasContainer.style.cursor = 'grabbing';
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.lastMouseX;
        const deltaY = e.clientY - this.lastMouseY;
        
        this.panX += deltaX;
        this.panY += deltaY;
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        
        this.drawDatapath();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.canvasContainer.style.cursor = 'grab';
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = this.zoom * delta;
        
        if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
            // Zoom hacia la posición del mouse
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const scaleChange = newZoom / this.zoom;
            this.panX = mouseX - (mouseX - this.panX) * scaleChange;
            this.panY = mouseY - (mouseY - this.panY) * scaleChange;
            
            this.zoom = newZoom;
            this.updateZoomDisplay();
            this.drawDatapath();
        }
    }
    
    // ============================================
    // Transformación del contexto
    // ============================================
    
    applyTransform() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.zoom, this.zoom);
    }
    
    resetTransform() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    initializeUI() {
        this.updateRegisterDisplay();
        this.updateMemoryDisplay();
        this.updatePCDisplay();
        this.updateZoomDisplay();
        this.drawDatapath();
    }
    
    // ============================================
    // Parser de instrucciones RISC-V
    // ============================================
    
    parseInstruction(line) {
        line = line.trim().split('#')[0].trim();
        if (!line) return null;
        
        const parts = line.split(/[\s,()]+/).filter(x => x);
        if (parts.length === 0) return null;
        
        const inst = {
            raw: line,
            opcode: parts[0].toLowerCase(),
            operands: parts.slice(1)
        };
        
        return inst;
    }
    
    loadCode() {
        const code = document.getElementById('input').value;
        const lines = code.split('\n');
        
        this.instructions = [];
        for (let line of lines) {
            const inst = this.parseInstruction(line);
            if (inst) {
                this.instructions.push(inst);
            }
        }
        
        this.addLog(`Cargadas ${this.instructions.length} instrucciones`, 'success');
        this.reset();
    }
    
    // ============================================
    // Ejecución de instrucciones
    // ============================================
    
    step() {
        if (this.pc >= this.instructions.length) {
            this.addLog('Programa terminado', 'success');
            return;
        }
        
        const inst = this.instructions[this.pc];
        this.currentInstruction = inst;
        
        this.addLog(`PC=${this.pc}: ${inst.raw}`, 'success');
        
        this.executeInstruction(inst);
        
        this.updateCurrentInstruction();
        this.updatePCDisplay();
        this.updateRegisterDisplay();
        this.updateMemoryDisplay();
        
        this.animateDatapath(inst);
    }
    
    executeInstruction(inst) {
        const op = inst.opcode;
        const operands = inst.operands;
        
        try {
            switch(op) {
                // Tipo R
                case 'add': this.execADD(operands); break;
                case 'sub': this.execSUB(operands); break;
                case 'and': this.execAND(operands); break;
                case 'or': this.execOR(operands); break;
                case 'xor': this.execXOR(operands); break;
                case 'sll': this.execSLL(operands); break;
                case 'srl': this.execSRL(operands); break;
                case 'sra': this.execSRA(operands); break;
                case 'slt': this.execSLT(operands); break;
                case 'sltu': this.execSLTU(operands); break;
                
                // Tipo I
                case 'addi': this.execADDI(operands); break;
                case 'andi': this.execANDI(operands); break;
                case 'ori': this.execORI(operands); break;
                case 'xori': this.execXORI(operands); break;
                case 'slli': this.execSLLI(operands); break;
                case 'srli': this.execSRLI(operands); break;
                case 'srai': this.execSRAI(operands); break;
                case 'slti': this.execSLTI(operands); break;
                case 'sltiu': this.execSLTIU(operands); break;
                
                // Load/Store
                case 'lw': this.execLW(operands); break;
                case 'sw': this.execSW(operands); break;
                
                // Branch
                case 'beq': this.execBEQ(operands); return;
                case 'bne': this.execBNE(operands); return;
                case 'blt': this.execBLT(operands); return;
                case 'bge': this.execBGE(operands); return;
                case 'bltu': this.execBLTU(operands); return;
                case 'bgeu': this.execBGEU(operands); return;
                
                default:
                    this.addLog(`Instrucción no soportada: ${op}`, 'error');
            }
            
            this.pc++;
        } catch (error) {
            this.addLog(`Error: ${error.message}`, 'error');
            this.isRunning = false;
        }
    }
    
    // ============================================
    // Implementación de instrucciones
    // ============================================
    
    getRegisterIndex(reg) {
        if (reg.startsWith('x')) {
            return parseInt(reg.substring(1));
        }
        return 0;
    }
    
    getImmediate(imm) {
        return parseInt(imm);
    }
    
    // Tipo R
    execADD(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = (this.registers[rs1] + this.registers[rs2]) | 0;
        }
        this.signalStates = { type: 'R', alu_op: 'ADD', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSUB(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = (this.registers[rs1] - this.registers[rs2]) | 0;
        }
        this.signalStates = { type: 'R', alu_op: 'SUB', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execAND(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] & this.registers[rs2];
        }
        this.signalStates = { type: 'R', alu_op: 'AND', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execOR(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] | this.registers[rs2];
        }
        this.signalStates = { type: 'R', alu_op: 'OR', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execXOR(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] ^ this.registers[rs2];
        }
        this.signalStates = { type: 'R', alu_op: 'XOR', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSLL(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] << (this.registers[rs2] & 0x1F);
        }
        this.signalStates = { type: 'R', alu_op: 'SLL', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSRL(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] >>> (this.registers[rs2] & 0x1F);
        }
        this.signalStates = { type: 'R', alu_op: 'SRL', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSRA(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] >> (this.registers[rs2] & 0x1F);
        }
        this.signalStates = { type: 'R', alu_op: 'SRA', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSLT(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = (this.registers[rs1] < this.registers[rs2]) ? 1 : 0;
        }
        this.signalStates = { type: 'R', alu_op: 'SLT', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    execSLTU(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const rs2 = this.getRegisterIndex(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = ((this.registers[rs1] >>> 0) < (this.registers[rs2] >>> 0)) ? 1 : 0;
        }
        this.signalStates = { type: 'R', alu_op: 'SLTU', wer: 1, alu_src: 1, alu2reg: 1, branch: 0 };
    }
    
    // Tipo I
    execADDI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = (this.registers[rs1] + imm) | 0;
        }
        this.signalStates = { type: 'I', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execANDI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] & imm;
        }
        this.signalStates = { type: 'I', alu_op: 'AND', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execORI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] | imm;
        }
        this.signalStates = { type: 'I', alu_op: 'OR', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execXORI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] ^ imm;
        }
        this.signalStates = { type: 'I', alu_op: 'XOR', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execSLLI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const shamt = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] << shamt;
        }
        this.signalStates = { type: 'I', alu_op: 'SLL', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execSRLI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const shamt = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] >>> shamt;
        }
        this.signalStates = { type: 'I', alu_op: 'SRL', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execSRAI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const shamt = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = this.registers[rs1] >> shamt;
        }
        this.signalStates = { type: 'I', alu_op: 'SRA', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execSLTI(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = (this.registers[rs1] < imm) ? 1 : 0;
        }
        this.signalStates = { type: 'I', alu_op: 'SLT', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    execSLTIU(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[1]);
        const imm = this.getImmediate(ops[2]);
        if (rd !== 0) {
            this.registers[rd] = ((this.registers[rs1] >>> 0) < (imm >>> 0)) ? 1 : 0;
        }
        this.signalStates = { type: 'I', alu_op: 'SLTU', wer: 1, alu_src: 0, alu2reg: 1, branch: 0 };
    }
    
    // Load/Store
    execLW(ops) {
        const rd = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[2]);
        const offset = this.getImmediate(ops[1]);
        const addr = (this.registers[rs1] + offset) | 0;
        
        if (rd !== 0 && addr >= 0 && addr < this.memory.length) {
            this.registers[rd] = this.memory[addr];
        }
        this.signalStates = { type: 'L', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 0, wem: 0, branch: 0 };
    }
    
    execSW(ops) {
        const rs2 = this.getRegisterIndex(ops[0]);
        const rs1 = this.getRegisterIndex(ops[2]);
        const offset = this.getImmediate(ops[1]);
        const addr = (this.registers[rs1] + offset) | 0;
        
        if (addr >= 0 && addr < this.memory.length) {
            this.memory[addr] = this.registers[rs2];
        }
        this.signalStates = { type: 'S', alu_op: 'ADD', wer: 0, alu_src: 0, alu2reg: 0, wem: 1, branch: 0 };
    }
    
    // Branch
    execBEQ(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, branch: 1, br_neg: 0 };
        if (this.registers[rs1] === this.registers[rs2]) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    execBNE(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, branch: 1, br_neg: 1 };
        if (this.registers[rs1] !== this.registers[rs2]) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    execBLT(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'SLT', wer: 0, alu_src: 1, branch: 1, br_neg: 0 };
        if (this.registers[rs1] < this.registers[rs2]) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    execBGE(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'SLT', wer: 0, alu_src: 1, branch: 1, br_neg: 1 };
        if (this.registers[rs1] >= this.registers[rs2]) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    execBLTU(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'SLTU', wer: 0, alu_src: 1, branch: 1, br_neg: 0 };
        if ((this.registers[rs1] >>> 0) < (this.registers[rs2] >>> 0)) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    execBGEU(ops) {
        const rs1 = this.getRegisterIndex(ops[0]);
        const rs2 = this.getRegisterIndex(ops[1]);
        const offset = this.getImmediate(ops[2]);
        this.signalStates = { type: 'B', alu_op: 'SLTU', wer: 0, alu_src: 1, branch: 1, br_neg: 1 };
        if ((this.registers[rs1] >>> 0) >= (this.registers[rs2] >>> 0)) {
            this.pc += offset;
        } else {
            this.pc++;
        }
    }
    
    // ============================================
    // Ejecución continua
    // ============================================
    
    run() {
        if (this.isRunning) {
            this.isRunning = false;
            document.getElementById('runBtn').textContent = 'Ejecutar';
            return;
        }
        
        this.isRunning = true;
        document.getElementById('runBtn').textContent = 'Pausar';
        this.runLoop();
    }
    
    runLoop() {
        if (!this.isRunning || this.pc >= this.instructions.length) {
            this.isRunning = false;
            document.getElementById('runBtn').textContent = 'Ejecutar';
            return;
        }
        
        this.step();
        setTimeout(() => this.runLoop(), 800);
    }
    
    reset() {
        this.pc = 0;
        this.registers.fill(0);
        this.memory.fill(0);
        this.currentInstruction = null;
        this.isRunning = false;
        this.signalStates = {};
        document.getElementById('runBtn').textContent = 'Ejecutar';
        
        this.updatePCDisplay();
        this.updateRegisterDisplay();
        this.updateMemoryDisplay();
        this.updateCurrentInstruction();
        this.drawDatapath();
        
        this.addLog('Sistema reiniciado', 'success');
    }
    
    // ============================================
    // Visualización del Datapath
    // ============================================
    
    drawDatapath() {
        // Limpiar canvas completamente
        this.resetTransform();
        this.ctx.fillStyle = '#f5f7fb';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        // Aplicar transformación de zoom y pan
        this.applyTransform();
        
        // Grid de referencia sutil
        this.drawGrid();
        
        // Definir componentes con posiciones
        const components = {
            // Extremo izquierdo - PC y sumadores
            pc: { x: 50, y: 50, w: 60, h: 40, label: 'PC', type: 'register' },
            pcMux: { x: 150, y: 50, w: 30, h: 50, label: '', type: 'mux' },
            pcAdder4: { x: 50, y: 120, w: 35, h: 35, label: '+4', type: 'adder' },
            branchAdder: { x: 150, y: 120, w: 35, h: 35, label: '+', type: 'adder' },
            
            // Memoria de instrucciones
            instructionMemory: { x: 250, y: 20, w: 140, h: 200, label: 'Memoria de\nPrograma', type: 'memory' },
            
            // Orden y Sign Extend
            orderUnit: { x: 250, y: 250, w: 100, h: 50, label: 'Orden &\nSign Extend', type: 'logic' },
            
            // Multiplexor pequeño
            muxImmRd: { x: 420, y: 70, w: 25, h: 50, label: '', type: 'mux' },
            
            // Sign Extend
            signExtend: { x: 420, y: 150, w: 80, h: 50, label: 'Sign\nExtend', type: 'logic' },
            
            // Banco de registros
            registerBank: { x: 520, y: 50, w: 150, h: 180, label: 'Banco de\nRegistros\n(RF)', type: 'register' },
            
            // MUX ALU_SRC
            muxALUSrc: { x: 720, y: 120, w: 30, h: 60, label: '', type: 'mux' },
            
            // ALU
            alu: { x: 780, y: 100, w: 100, h: 120, label: 'ALU', type: 'alu' },
            
            // MUX ALU2REG
            muxALU2Reg: { x: 920, y: 100, w: 30, h: 60, label: '', type: 'mux' },
            
            // Memoria de datos
            dataMemory: { x: 980, y: 50, w: 120, h: 200, label: 'Memoria de\nDatos\n(DM)', type: 'memory' },
            
            // Unidad de Control
            controlUnit: { x: 420, y: 300, w: 180, h: 90, label: 'Unidad de Control (CU)', type: 'control' }
        };

        // Primero dibujar las líneas
        this.drawAllWires(components);
        
        // Luego dibujar componentes
        for (let key in components) {
            this.drawComponent(components[key]);
        }
        
        // Dibujar señales de control
        this.drawControlSignals();
        
        // Etiquetas de señales
        this.drawSignalLabels(components);
        
        // Resetear transformación para elementos fijos (si los hay)
        this.resetTransform();
    }
    
    drawComponent(comp) {
        const ctx = this.ctx;
        
        // Sombra según tipo
        if (comp.type === 'alu' || comp.type === 'control') {
            ctx.shadowColor = 'rgba(255, 0, 255, 0.4)';
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowColor = 'rgba(0, 240, 255, 0.3)';
            ctx.shadowBlur = 10;
        }
        
        // Color según tipo
        switch(comp.type) {
            case 'memory':
                ctx.fillStyle = '#c0d6f0';
                ctx.strokeStyle = '#4a6fa5';
                break;
            case 'register':
                ctx.fillStyle = '#d6e8c3';
                ctx.strokeStyle = '#6b8e23';
                break;
            case 'alu':
                this.drawALU(comp);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#f5e0c3';   // naranja suave
                ctx.strokeStyle = '#d28c45'; // naranja más oscuro
                return;
            case 'control':
                ctx.fillStyle = '#f0d6f0';   // lila suave
                ctx.strokeStyle = '#a05ca0'; // lila más oscuro
                break;
            case 'mux':
                this.drawMux(comp);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#e0e0e0';   // gris claro
                ctx.strokeStyle = '#888888'; // gris medio
                return;
            case 'adder':
                this.drawAdder(comp);
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffe0b2';   // amarillo pastel
                ctx.strokeStyle = '#ccaa66'; // amarillo más oscuro
                return;
            default:
                ctx.fillStyle = '#d0d0d0';
                ctx.strokeStyle = '#888888';
        }
        
        ctx.lineWidth = 2;
        ctx.fillRect(comp.x, comp.y, comp.w, comp.h);
        ctx.strokeRect(comp.x, comp.y, comp.w, comp.h);
        ctx.shadowBlur = 0;
        
        // Etiqueta
        ctx.fillStyle = '#e0e6ff';
        ctx.font = 'bold 11px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const lines = comp.label.split('\n');
        const lineHeight = 14;
        const startY = comp.y + comp.h / 2 - (lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, i) => {
            ctx.fillText(line, comp.x + comp.w / 2, startY + i * lineHeight);
        });
    }
    
    drawALU(comp) {
        const ctx = this.ctx;
        const signals = this.signalStates;
        const active = signals.alu_op !== undefined;
        
        ctx.fillStyle = active ? '#3a2f5a' : '#2a1f4a';
        ctx.strokeStyle = active ? '#ff00ff' : '#8844ff';
        ctx.lineWidth = active ? 3 : 2;
        
        if (active) {
            ctx.shadowColor = '#ff00ff';
            ctx.shadowBlur = 20;
        }
        
        // Trapecio para ALU
        ctx.beginPath();
        ctx.moveTo(comp.x + 10, comp.y);
        ctx.lineTo(comp.x + comp.w - 10, comp.y);
        ctx.lineTo(comp.x + comp.w, comp.y + comp.h);
        ctx.lineTo(comp.x, comp.y + comp.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Label
        ctx.fillStyle = active ? '#ff00ff' : '#e0e6ff';
        ctx.font = 'bold 16px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ALU', comp.x + comp.w / 2, comp.y + comp.h / 2 - 10);
        
        // Operación actual
        if (active && signals.alu_op) {
            ctx.font = 'bold 10px JetBrains Mono';
            ctx.fillStyle = '#ffff00';
            ctx.fillText(signals.alu_op, comp.x + comp.w / 2, comp.y + comp.h / 2 + 15);
        }
    }
    
    drawMux(comp) {
        const ctx = this.ctx;
        const signals = this.signalStates;
        
        let active = false;
        if (comp.x > 600 && comp.x < 700) {
            active = signals.alu_src !== undefined;
        } else if (comp.x > 850) {
            active = signals.alu2reg !== undefined;
        } else {
            active = signals.branch !== undefined;
        }
        
        ctx.fillStyle = active ? '#2a3f5a' : '#1e2749';
        ctx.strokeStyle = active ? '#00f0ff' : '#4466aa';
        ctx.lineWidth = active ? 3 : 2;
        
        if (active) {
            ctx.shadowColor = '#00f0ff';
            ctx.shadowBlur = 15;
        }
        
        // Trapecio para MUX
        ctx.beginPath();
        ctx.moveTo(comp.x + comp.w * 0.3, comp.y);
        ctx.lineTo(comp.x + comp.w * 0.7, comp.y);
        ctx.lineTo(comp.x + comp.w, comp.y + comp.h);
        ctx.lineTo(comp.x, comp.y + comp.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Label
        ctx.fillStyle = active ? '#00f0ff' : '#8892b8';
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('M', comp.x + comp.w / 2, comp.y + comp.h / 2 - 5);
        ctx.fillText('U', comp.x + comp.w / 2, comp.y + comp.h / 2 + 3);
        ctx.fillText('X', comp.x + comp.w / 2, comp.y + comp.h / 2 + 11);
    }
    
    drawAdder(comp) {
        const ctx = this.ctx;
        const signals = this.signalStates;
        const active = signals.branch !== undefined || comp.label === '+4';
        
        const cx = comp.x + comp.w / 2;
        const cy = comp.y + comp.h / 2;
        const r = comp.w / 2;
        
        ctx.fillStyle = active ? '#2a3f5a' : '#1e2749';
        ctx.strokeStyle = active ? '#00ff88' : '#4466aa';
        ctx.lineWidth = active ? 3 : 2;
        
        if (active) {
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 15;
        }
        
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Label
        ctx.fillStyle = active ? '#00ff88' : '#e0e6ff';
        ctx.font = 'bold 18px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(comp.label, cx, cy);
    }
    
    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(100, 120, 180, 0.1)';
        ctx.lineWidth = 1;
        
        for (let x = 0; x < this.datapathWidth; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.datapathHeight);
            ctx.stroke();
        }
        
        for (let y = 0; y < this.datapathHeight; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.datapathWidth, y);
            ctx.stroke();
        }
    }
    
    // Continúa en la siguiente parte...
    drawAllWires(components) {
        const ctx = this.ctx;
        const signals = this.signalStates;
        
        // PC salida
        const pcOut = {
            x: components.pc.x + components.pc.w,
            y: components.pc.y + components.pc.h / 2
        };
        
        // PC a PC+4 Adder
        this.drawLine(pcOut.x, pcOut.y, components.pcAdder4.x, components.pcAdder4.y + components.pcAdder4.h / 2, true, '#00f0ff', 1);
        
        // PC a Instruction Memory
        this.drawLine(pcOut.x, pcOut.y, pcOut.x + 50, pcOut.y, true, '#00f0ff', 1);
        this.drawLine(pcOut.x + 50, pcOut.y, pcOut.x + 50, components.instructionMemory.y + 250, true, '#00f0ff', 1);
        this.drawLine(pcOut.x + 50, components.instructionMemory.y + 250, components.instructionMemory.x, components.instructionMemory.y + 250, true, '#00f0ff', 1);
        
        // PC+4 salida
        const pc4Out = {
            x: components.pcAdder4.x + components.pcAdder4.w,
            y: components.pcAdder4.y + components.pcAdder4.h / 2
        };
        
        // PC+4 al MUX
        this.drawLine(pc4Out.x, pc4Out.y, pc4Out.x + 20, pc4Out.y, true, '#00f0ff', 1);
        this.drawLine(pc4Out.x + 20, pc4Out.y, pc4Out.x + 20, components.pcMux.y + 10, true, '#00f0ff', 1);
        this.drawLine(pc4Out.x + 20, components.pcMux.y + 10, components.pcMux.x, components.pcMux.y + 10, true, '#00f0ff', 1);
        
        // PC+4 al Branch Adder
        this.drawLine(pc4Out.x, pc4Out.y, pc4Out.x, components.branchAdder.y + components.branchAdder.h / 2, signals.branch === 1, '#00f0ff', 1);
        this.drawLine(pc4Out.x, components.branchAdder.y + components.branchAdder.h / 2, components.branchAdder.x, components.branchAdder.y + components.branchAdder.h / 2, signals.branch === 1, '#00f0ff', 1);
        
        // Branch Adder output al MUX PC
        const branchOut = {
            x: components.branchAdder.x,
            y: components.branchAdder.y + components.branchAdder.h / 2
        };
        this.drawLine(branchOut.x, branchOut.y, branchOut.x - 20, branchOut.y, signals.branch === 1, '#ffff00', 1);
        this.drawLine(branchOut.x - 20, branchOut.y, branchOut.x - 20, components.pcMux.y + 40, signals.branch === 1, '#ffff00', 1);
        this.drawLine(branchOut.x - 20, components.pcMux.y + 40, components.pcMux.x, components.pcMux.y + 40, signals.branch === 1, '#ffff00', 1);
        
        // MUX PC salida a PC
        this.drawLine(components.pcMux.x, components.pcMux.y + components.pcMux.h / 2, components.pc.x, components.pc.y + components.pc.h / 2, true, '#00f0ff', 1);
        
        // Instruction Memory salidas
        this.drawLine(components.instructionMemory.x + 30, components.instructionMemory.y + components.instructionMemory.h, components.instructionMemory.x + 30, components.controlUnit.y, signals.type !== undefined, '#00f0ff', 1, 'l(31:25)');
        
        const instToRegA2X = components.instructionMemory.x + components.instructionMemory.w;
        const instToRegA2Y = components.instructionMemory.y + 120;
        this.drawLine(instToRegA2X, instToRegA2Y, components.registerBank.x, components.registerBank.y + 80, signals.type !== undefined, '#00ff88', 2, 'l(24:20)');
        
        const instToRegA1Y = components.instructionMemory.y + 160;
        this.drawLine(instToRegA2X, instToRegA1Y, components.registerBank.x, components.registerBank.y + 120, signals.type !== undefined, '#ff4444', 2, 'l(19:15)');
        
        const instToMuxY = components.instructionMemory.y + 200;
        this.drawLine(instToRegA2X, instToMuxY, components.muxImmRd.x, components.muxImmRd.y + components.muxImmRd.h / 2, true, '#6666ff', 2, 'l(11:7)');
        
        this.drawLine(components.instructionMemory.x + 60, components.instructionMemory.y + components.instructionMemory.h, components.instructionMemory.x + 60, components.controlUnit.y, signals.type !== undefined, '#ff00ff', 1, 'l(14:12)');
        
        this.drawLine(components.instructionMemory.x + 90, components.instructionMemory.y + components.instructionMemory.h, components.instructionMemory.x + 90, components.controlUnit.y, signals.type !== undefined, '#ffff00', 1, 'l(6:0)');
        
        this.drawLine(instToRegA2X, components.instructionMemory.y + 60, components.signExtend.x, components.signExtend.y + components.signExtend.h / 2, signals.alu_src === 0, '#00ffff', 2, 'imm');
        
        this.drawLine(components.instructionMemory.x + components.instructionMemory.w / 2, components.instructionMemory.y + components.instructionMemory.h, components.orderUnit.x + components.orderUnit.w / 2, components.orderUnit.y, signals.branch === 1, '#00ffff', 1, 'l(31:7)');
        
        // Order Unit a Branch Adder
        this.drawLine(components.orderUnit.x, components.orderUnit.y + components.orderUnit.h / 2, components.branchAdder.x, components.branchAdder.y + 5, signals.branch === 1, '#ffff00', 2, 'imm');
        
        // Sign Extend a MUX ALU_SRC
        const signExtOut = {
            x: components.signExtend.x + components.signExtend.w,
            y: components.signExtend.y + components.signExtend.h / 2
        };
        this.drawLine(signExtOut.x, signExtOut.y, signExtOut.x + 120, signExtOut.y, signals.alu_src === 0, '#ffff00', 2);
        this.drawLine(signExtOut.x + 120, signExtOut.y, signExtOut.x + 120, components.muxALUSrc.y + 15, signals.alu_src === 0, '#ffff00', 2);
        this.drawLine(signExtOut.x + 120, components.muxALUSrc.y + 15, components.muxALUSrc.x, components.muxALUSrc.y + 15, signals.alu_src === 0, '#ffff00', 2, 'imm[31:0]');
        
        // MUX imm_rd a Register Bank
        this.drawLine(components.muxImmRd.x + components.muxImmRd.w, components.muxImmRd.y + components.muxImmRd.h / 2, components.registerBank.x, components.registerBank.y + components.registerBank.h - 40, true, '#6666ff', 2, 'ad');
        
        // Register Bank salidas
        const do1Out = {
            x: components.registerBank.x + components.registerBank.w,
            y: components.registerBank.y + 60
        };
        this.drawLine(do1Out.x, do1Out.y, components.alu.x, components.alu.y + 40, signals.alu_op !== undefined, '#00ff88', 3, 'do1[31:0]');
        
        const do2Out = {
            x: components.registerBank.x + components.registerBank.w,
            y: components.registerBank.y + 140
        };
        this.drawLine(do2Out.x, do2Out.y, components.muxALUSrc.x, components.muxALUSrc.y + 45, signals.alu_src !== undefined, '#ff00ff', 3, 'do2[31:0]');
        
        // do2 a Data Memory
        const do2ToMemX = do2Out.x + 20;
        this.drawLine(do2Out.x, do2Out.y, do2ToMemX, do2Out.y, signals.wem === 1, '#ff00ff', 2);
        this.drawLine(do2ToMemX, do2Out.y, do2ToMemX, components.dataMemory.y + 180, signals.wem === 1, '#ff00ff', 2);
        this.drawLine(do2ToMemX, components.dataMemory.y + 180, components.dataMemory.x, components.dataMemory.y + 180, signals.wem === 1, '#ff00ff', 2);
        
        // MUX ALU_SRC a ALU
        this.drawLine(components.muxALUSrc.x + components.muxALUSrc.w, components.muxALUSrc.y + components.muxALUSrc.h / 2, components.alu.x, components.alu.y + 90, signals.alu_op !== undefined, '#00f0ff', 3);
        
        // ALU salida
        const aluOut = {
            x: components.alu.x + components.alu.w,
            y: components.alu.y + components.alu.h / 2
        };
        
        // ALU a MUX ALU2REG
        this.drawLine(aluOut.x, aluOut.y, components.muxALU2Reg.x, components.muxALU2Reg.y + 45, signals.alu2reg === 1, '#ffff00', 3, 'alu_result');
        
        // ALU a Data Memory
        this.drawLine(aluOut.x, aluOut.y, aluOut.x + 30, aluOut.y, signals.wem === 1 || signals.alu2reg === 0, '#00f0ff', 2);
        this.drawLine(aluOut.x + 30, aluOut.y, aluOut.x + 30, components.dataMemory.y + 80, signals.wem === 1 || signals.alu2reg === 0, '#00f0ff', 2);
        this.drawLine(aluOut.x + 30, components.dataMemory.y + 80, components.dataMemory.x, components.dataMemory.y + 80, signals.wem === 1 || signals.alu2reg === 0, '#00f0ff', 2, 'addr');
        
        // Data Memory salida a MUX ALU2REG
        this.drawLine(components.dataMemory.x, components.dataMemory.y + 140, components.muxALU2Reg.x + components.muxALU2Reg.w, components.muxALU2Reg.y + 15, signals.alu2reg === 0, '#00ff88', 3, 'data_out');
        
        // MUX ALU2REG a Register Bank (writeback)
        const wbOut = {
            x: components.muxALU2Reg.x,
            y: components.muxALU2Reg.y + components.muxALU2Reg.h / 2
        };
        
        this.drawLine(wbOut.x, wbOut.y, wbOut.x - 30, wbOut.y, signals.wer === 1, '#00ff88', 3);
        this.drawLine(wbOut.x - 30, wbOut.y, wbOut.x - 30, components.registerBank.y - 30, signals.wer === 1, '#00ff88', 3);
        this.drawLine(wbOut.x - 30, components.registerBank.y - 30, components.registerBank.x + components.registerBank.w / 2, components.registerBank.y - 30, signals.wer === 1, '#00ff88', 3);
        this.drawLine(components.registerBank.x + components.registerBank.w / 2, components.registerBank.y - 30, components.registerBank.x + components.registerBank.w / 2, components.registerBank.y, signals.wer === 1, '#00ff88', 3, 'di[31:0]');
        
        // Líneas de control
        this.drawControlLines(components);
    }
    
    drawLine(x1, y1, x2, y2, active, color = '#00f0ff', width = 2, label = '') {
        const ctx = this.ctx;
        
        ctx.strokeStyle = active ? color : '#2a3550';
        ctx.lineWidth = active ? width : 1;
        
        if (active) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
        }
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        
        if (label && active && Math.abs(x2 - x1) > 40) {
            ctx.fillStyle = color;
            ctx.font = 'bold 8px JetBrains Mono';
            ctx.textAlign = 'center';
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            ctx.fillText(label, midX, midY - 5);
        }
        
        if (active && Math.abs(x2 - x1) + Math.abs(y2 - y1) > 50) {
            this.drawLinePulse(x1, y1, x2, y2, color);
        }
    }
    
    drawLinePulse(x1, y1, x2, y2, color) {
        const ctx = this.ctx;
        const progress = (Date.now() % 1000) / 1000;
        
        const x = x1 + (x2 - x1) * progress;
        const y = y1 + (y2 - y1) * progress;
        
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    drawControlLines(components) {
        const ctx = this.ctx;
        const cuX = components.controlUnit.x + components.controlUnit.w / 2;
        const cuY = components.controlUnit.y;
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        
        const controlPoints = [
            { x: components.registerBank.x + components.registerBank.w / 2, y: components.registerBank.y + components.registerBank.h },
            { x: components.muxALUSrc.x + components.muxALUSrc.w / 2, y: components.muxALUSrc.y + components.muxALUSrc.h },
            { x: components.alu.x + components.alu.w / 2, y: components.alu.y + components.alu.h },
            { x: components.dataMemory.x, y: components.dataMemory.y + components.dataMemory.h }
        ];
        
        controlPoints.forEach(point => {
            ctx.beginPath();
            ctx.moveTo(cuX, cuY);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        });
        
        ctx.setLineDash([]);
    }
    
    drawSignalLabels(components) {
        const ctx = this.ctx;
        ctx.font = 'bold 9px JetBrains Mono';
        ctx.fillStyle = '#8892b8';
        ctx.textAlign = 'left';
        
        // Etiquetas en Register Bank
        ctx.fillText('a1', components.registerBank.x - 25, components.registerBank.y + 125);
        ctx.fillText('a2', components.registerBank.x - 25, components.registerBank.y + 85);
        ctx.fillText('ad', components.registerBank.x - 25, components.registerBank.y + components.registerBank.h - 35);
        ctx.fillText('we', components.registerBank.x - 25, components.registerBank.y + components.registerBank.h - 10);
        
        ctx.textAlign = 'right';
        ctx.fillText('do1', components.registerBank.x + components.registerBank.w + 35, components.registerBank.y + 65);
        ctx.fillText('do2', components.registerBank.x + components.registerBank.w + 35, components.registerBank.y + 145);
        
        // Etiquetas en Data Memory
        ctx.textAlign = 'left';
        ctx.fillText('addr', components.dataMemory.x - 35, components.dataMemory.y + 85);
        ctx.fillText('di', components.dataMemory.x - 20, components.dataMemory.y + 185);
        ctx.fillText('we', components.dataMemory.x - 20, components.dataMemory.y + 210);
        
        ctx.textAlign = 'right';
        ctx.fillText('do', components.dataMemory.x + components.dataMemory.w + 25, components.dataMemory.y + 145);
        
        // Etiquetas en ALU
        ctx.textAlign = 'center';
        ctx.fillText('alu_src', components.muxALUSrc.x + components.muxALUSrc.w / 2, components.muxALUSrc.y - 5);
        ctx.fillText('alu2reg', components.muxALU2Reg.x + components.muxALU2Reg.w / 2, components.muxALU2Reg.y - 5);
        ctx.fillText('imm_rd', components.muxImmRd.x + components.muxImmRd.w / 2, components.muxImmRd.y - 5);
    }
    
    drawControlSignals() {
        const ctx = this.ctx;
        const signals = this.signalStates;
        
        if (!signals.type) return;
        
        const x = 450;
        const y = 550;
        const spacing = 70;
        
        const controlLabels = [
            { name: 'WER', value: signals.wer },
            { name: 'ALU_SRC', value: signals.alu_src },
            { name: 'ALU2REG', value: signals.alu2reg },
            { name: 'WEM', value: signals.wem },
            { name: 'BRANCH', value: signals.branch }
        ];
        
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.textAlign = 'center';
        
        controlLabels.forEach((sig, i) => {
            const active = sig.value === 1;
            const cx = x + i * spacing;
            
            ctx.fillStyle = active ? '#00ff88' : '#2a3550';
            ctx.beginPath();
            ctx.arc(cx, y, 8, 0, Math.PI * 2);
            ctx.fill();
            
            if (active) {
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 10;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            
            ctx.fillStyle = active ? '#00ff88' : '#8892b8';
            ctx.fillText(sig.name, cx, y + 20);
        });
        
        if (signals.alu_op) {
            ctx.font = 'bold 12px JetBrains Mono';
            ctx.fillStyle = '#ffff00';
            ctx.textAlign = 'left';
            ctx.fillText(`ALU_OP: ${signals.alu_op}`, x + controlLabels.length * spacing + 20, y + 5);
        }
    }
    
    animateDatapath(inst) {
        let frame = 0;
        const animate = () => {
            this.drawDatapath();
            frame++;
            
            if (frame < 60) {
                requestAnimationFrame(animate);
            }
        };
        animate();
    }
    
    // ============================================
    // Actualización de UI
    // ============================================
    
    updatePCDisplay() {
        document.getElementById('pcValue').textContent = this.pc;
    }
    
    updateCurrentInstruction() {
        const elem = document.getElementById('currentInstruction');
        if (this.currentInstruction) {
            elem.textContent = this.currentInstruction.raw;
        } else {
            elem.textContent = 'Sin instrucción';
        }
    }
    
    updateRegisterDisplay() {
        const container = document.getElementById('registerList');
        container.innerHTML = '';
        
        const regsToShow = [0, 5, 6, 7, 28, 29, 30, 31];
        
        for (let i of regsToShow) {
            const div = document.createElement('div');
            div.className = 'register-item';
            div.innerHTML = `
                <span class="register-name">x${i}</span>
                <span class="register-value">${this.registers[i]}</span>
            `;
            container.appendChild(div);
        }
    }
    
    updateMemoryDisplay() {
        const container = document.getElementById('memoryList');
        container.innerHTML = '';
        
        for (let i = 0; i < 16; i++) {
            if (this.memory[i] !== 0) {
                const div = document.createElement('div');
                div.className = 'memory-item';
                div.innerHTML = `
                    <span class="memory-addr">[${i}]</span>
                    <span class="memory-value">${this.memory[i]}</span>
                `;
                container.appendChild(div);
            }
        }
    }
    
    addLog(message, type = '') {
        const container = document.getElementById('executionLog');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }
}

// ============================================
// Inicialización
// ============================================

let simulator;

window.addEventListener('DOMContentLoaded', () => {
    simulator = new RISCVSimulator();
    
    // Código de ejemplo
    const exampleCode = `# Programa ejemplo: Conjetura de Collatz
addi x5, x0, 200
addi x7, x0, 0
sw x5, 0(x6)
addi x6, x6, 1
addi x7, x7, 1
addi x28, x0, 1
beq x5, x28, 12
addi x29, x0, 1
and x30, x5, x29
beq x30, x0, 6
slli x31, x5, 1
add x31, x31, x5
addi x5, x31, 1
beq x0, x0, -12
srli x5, x5, 1
beq x0, x0, -14
beq x0, x0, 0`;
    
    document.getElementById('input').value = exampleCode;
});