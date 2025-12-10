import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, RotateCcw, Upload, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const RISCVSimulator = () => {
  const [pc, setPc] = useState(0);
  const [registers, setRegisters] = useState(Array(32).fill(0));
  const [memory, setMemory] = useState(Array(256).fill(0));
  const [program, setProgram] = useState([]);
  const [running, setRunning] = useState(false);
  const [signalStates, setSignalStates] = useState({});
  const [logs, setLogs] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const runningRef = useRef(false);

  const [code, setCode] = useState(`# Programa de ejemplo: Fibonacci
addi x10, x0, 0
addi x11, x0, 1
addi x5, x0, 500
addi x7, x0, 0
add x12, x10, x11
addi x7, x7, 1
bge x12, x5, 2
add x10, x0, x11
add x11, x0, x12
beq x0, x0, -5`);

  const datapathWidth = 1400;
  const datapathHeight = 700;

  const components = {
    pc: { x: 50, y: 100, w: 80, h: 50, label: 'PC', color: '#B8E0D2', border: '#6A9C89' },
    pcAdder: { x: 50, y: 200, w: 80, h: 50, label: 'PC+4', color: '#A8DADC', border: '#457B9D' },
    muxPC: { x: 100, y: 30, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    instMem: { x: 220, y: 50, w: 140, h: 180, label: 'Memoria de\nInstrucciones', color: '#D5B9E0', border: '#8B7BA8' },
    regBank: { x: 480, y: 80, w: 150, h: 160, label: 'Banco de\nRegistros', color: '#C7E9C0', border: '#7BA97C' },
    signExtend: { x: 400, y: 280, w: 100, h: 50, label: 'Sign\nExtend', color: '#E8DFF5', border: '#9B8FC2' },
    muxImmRd: { x: 400, y: 200, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    muxAluSrc: { x: 670, y: 150, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    alu: { x: 740, y: 120, w: 120, h: 100, label: 'ALU', color: '#F4C4C4', border: '#C17B7B' },
    muxAlu2Reg: { x: 900, y: 130, w: 40, h: 60, label: 'MUX', color: '#D4D4D4', border: '#8E8E8E' },
    dataMem: { x: 980, y: 80, w: 140, h: 160, label: 'Memoria de\nDatos', color: '#FFD6A5', border: '#D4A574' },
    ordenamiento: { x: 220, y: 280, w: 100, h: 50, label: 'Branch\nOffset', color: '#FFE5B4', border: '#D4A574' },
    sumadorBranch: { x: 150, y: 280, w: 80, h: 50, label: 'PC+\nOffset', color: '#A8DADC', border: '#457B9D' },
    control: { x: 450, y: 380, w: 200, h: 80, label: 'Unidad de Control', color: '#E0D4F7', border: '#9B8FC2' }
  };

  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), { time, msg, type }]);
  };

  const signExtend = (value, bits) => {
    const signBit = (value >> (bits - 1)) & 1;
    if (signBit === 1) {
      const mask = (-1) << bits;
      return value | mask;
    }
    return value;
  };

  const parseInstruction = (line) => {
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
  };

  const getRegIndex = (reg) => {
    if (reg.startsWith('x')) return parseInt(reg.substring(1));
    return 0;
  };

  const loadCode = () => {
    const lines = code.split('\n');
    const newProgram = [];
    
    for (let line of lines) {
      const inst = parseInstruction(line);
      if (inst) newProgram.push(inst);
    }
    
    setPc(0);
    setRegisters(Array(32).fill(0));
    setMemory(Array(256).fill(0));
    setSignalStates({});
    setProgram(newProgram);
    setLogs([]);
    
    addLog(`Cargadas ${newProgram.length} instrucciones`, 'success');
  };

  const executeInstruction = (inst) => {
    const op = inst.opcode;
    const ops = inst.operands;
    const newRegs = [...registers];
    const newMem = [...memory];
    let newPc = pc;
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
        case 'and': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] & newRegs[rs2];
          signals = { type: 'R', alu_op: 'AND', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'andi': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = signExtend(parseInt(ops[2]), 12);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] & imm;
          signals = { type: 'I', alu_op: 'AND', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'or': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] | newRegs[rs2];
          signals = { type: 'R', alu_op: 'OR', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'ori': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = signExtend(parseInt(ops[2]), 12);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] | imm;
          signals = { type: 'I', alu_op: 'OR', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'xor': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] ^ newRegs[rs2];
          signals = { type: 'R', alu_op: 'XOR', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'xori': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = signExtend(parseInt(ops[2]), 12);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] ^ imm;
          signals = { type: 'I', alu_op: 'XOR', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'sll': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] << (newRegs[rs2] & 0x1F);
          signals = { type: 'R', alu_op: 'SLL', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'slli': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const shamt = parseInt(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] << shamt;
          signals = { type: 'I', alu_op: 'SLL', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'srl': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] >>> (newRegs[rs2] & 0x1F);
          signals = { type: 'R', alu_op: 'SRL', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'srli': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const shamt = parseInt(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] >>> shamt;
          signals = { type: 'I', alu_op: 'SRL', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'sra': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] >> (newRegs[rs2] & 0x1F);
          signals = { type: 'R', alu_op: 'SRA', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'srai': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const shamt = parseInt(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] >> shamt;
          signals = { type: 'I', alu_op: 'SRA', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'slt': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] | 0) < (newRegs[rs2] | 0) ? 1 : 0;
          signals = { type: 'R', alu_op: 'SLT', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'slti': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = signExtend(parseInt(ops[2]), 12);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] | 0) < imm ? 1 : 0;
          signals = { type: 'I', alu_op: 'SLT', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'sltu': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] >>> 0) < (newRegs[rs2] >>> 0) ? 1 : 0;
          signals = { type: 'R', alu_op: 'SLTU', wer: 1, alu_src: 1, alu2reg: 1, wem: 0, branch: 0 };
          break;
        }
        case 'sltiu': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = parseInt(ops[2]) & 0xFFF;
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] >>> 0) < (imm >>> 0) ? 1 : 0;
          signals = { type: 'I', alu_op: 'SLTU', wer: 1, alu_src: 0, alu2reg: 1, wem: 0, branch: 0 };
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
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
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
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        case 'blt': {
          const rs1 = getRegIndex(ops[0]);
          const rs2 = getRegIndex(ops[1]);
          const offset = parseInt(ops[2]);
          signals = { type: 'B', alu_op: 'SLT', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
          if ((newRegs[rs1] | 0) < (newRegs[rs2] | 0)) {
            newPc += offset;
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
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
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        case 'bltu': {
          const rs1 = getRegIndex(ops[0]);
          const rs2 = getRegIndex(ops[1]);
          const offset = parseInt(ops[2]);
          signals = { type: 'B', alu_op: 'SLTU', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
          if ((newRegs[rs1] >>> 0) < (newRegs[rs2] >>> 0)) {
            newPc += offset;
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        case 'bgeu': {
          const rs1 = getRegIndex(ops[0]);
          const rs2 = getRegIndex(ops[1]);
          const offset = parseInt(ops[2]);
          signals = { type: 'B', alu_op: 'SLTU', wer: 0, alu_src: 1, alu2reg: 0, wem: 0, branch: 1 };
          if ((newRegs[rs1] >>> 0) >= (newRegs[rs2] >>> 0)) {
            newPc += offset;
            setRegisters(newRegs);
            setMemory(newMem);
            setPc(newPc);
            setSignalStates(signals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        default:
          addLog(`Instrucción no soportada: ${op}`, 'error');
          return;
      }

      newPc++;
      setRegisters(newRegs);
      setMemory(newMem);
      setPc(newPc);
      setSignalStates(signals);
      addLog(`PC=${pc}: ${inst.raw}`, 'success');
      
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      setRunning(false);
      runningRef.current = false;
    }
  };

  const step = () => {
    if (pc >= program.length) {
      addLog('Programa terminado', 'success');
      return;
    }
    executeInstruction(program[pc]);
  };

  const toggleRun = () => {
    const newRunning = !running;
    setRunning(newRunning);
    runningRef.current = newRunning;
  };

  useEffect(() => {
    if (running && pc < program.length) {
      const timer = setTimeout(() => {
        executeInstruction(program[pc]);
      }, 600);
      return () => clearTimeout(timer);
    } else if (running && pc >= program.length) {
      setRunning(false);
      runningRef.current = false;
      addLog('Programa finalizado', 'success');
    }
  }, [running, pc]);

  const reset = () => {
    setPc(0);
    setRegisters(Array(32).fill(0));
    setMemory(Array(256).fill(0));
    setRunning(false);
    runningRef.current = false;
    setSignalStates({});
    addLog('Sistema reiniciado', 'success');
  };

  useEffect(() => {
    loadCode();
  }, []);

  useEffect(() => {
    drawDatapath();
  }, [signalStates, zoom, pan]);

  const drawDatapath = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#F5F7FA';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
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
    
    drawWires(ctx);
    
    Object.values(components).forEach(comp => drawComponent(ctx, comp));
    
    drawControlSignals(ctx);
    
    ctx.restore();
  };

  const drawComponent = (ctx, comp) => {
    const active = signalStates.type !== undefined;
    
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
  };

  const drawLine = (ctx, x1, y1, x2, y2, active, color = '#6A9C89', width = 2) => {
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
  };

  const drawWires = (ctx) => {
    const signals = signalStates;
    
    // PC a Memoria de Instrucciones
    drawLine(ctx,
      components.pc.x + components.pc.w, components.pc.y + components.pc.h / 2,
      components.instMem.x, components.instMem.y + 50,
      true, '#6A9C89', 2
    );
    
    // PC a PC+4
    drawLine(ctx,
      components.pc.x + components.pc.w / 2, components.pc.y + components.pc.h,
      components.pcAdder.x + components.pcAdder.w / 2, components.pcAdder.y,
      true, '#6A9C89', 2
    );
    
    // Memoria Inst a Banco Registros
    drawLine(ctx,
      components.instMem.x + components.instMem.w, components.instMem.y + 80,
      components.regBank.x, components.regBank.y + 60,
      signals.type !== undefined, '#7BA97C', 2
    );
    
    // Banco Registros a ALU
    drawLine(ctx,
      components.regBank.x + components.regBank.w, components.regBank.y + 60,
      components.alu.x, components.alu.y + 30,
      signals.alu_op !== undefined, '#7BA97C', 3
    );
    
    // Banco Registros a MUX ALU_SRC
    drawLine(ctx,
      components.regBank.x + components.regBank.w, components.regBank.y + 120,
      components.muxAluSrc.x, components.muxAluSrc.y + components.muxAluSrc.h / 2,
      signals.alu_src !== undefined, '#8B7BA8', 3
    );
    
    // Sign Extend a MUX ALU_SRC
    drawLine(ctx,
      components.signExtend.x + components.signExtend.w, components.signExtend.y + 25,
      components.muxAluSrc.x, components.muxAluSrc.y + 40,
      signals.alu_src === 0, '#9B8FC2', 2
    );
    
    // MUX ALU_SRC a ALU
    drawLine(ctx,
      components.muxAluSrc.x + components.muxAluSrc.w, components.muxAluSrc.y + components.muxAluSrc.h / 2,
      components.alu.x, components.alu.y + 70,
      signals.alu_op !== undefined, '#457B9D', 3
    );
    
    // ALU a MUX ALU2REG
    drawLine(ctx,
      components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
      components.muxAlu2Reg.x, components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2,
      signals.alu2reg === 1, '#C17B7B', 3
    );
    
    // ALU a Memoria Datos
    drawLine(ctx,
      components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
      components.dataMem.x, components.dataMem.y + 60,
      signals.wem === 1 || signals.alu2reg === 0, '#D4A574', 2
    );
    
    // Memoria Datos a MUX ALU2REG
    drawLine(ctx,
      components.dataMem.x, components.dataMem.y + 120,
      components.muxAlu2Reg.x + components.muxAlu2Reg.w, components.muxAlu2Reg.y + 15,
      signals.alu2reg === 0, '#D4A574', 3
    );
    
    // MUX ALU2REG a Banco Registros (writeback)
    const wbX = components.muxAlu2Reg.x;
    const wbY = components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2;
    drawLine(ctx, wbX, wbY, wbX - 30, wbY, signals.wer === 1, '#7BA97C', 3);
    drawLine(ctx, wbX - 30, wbY, wbX - 30, components.regBank.y - 20, signals.wer === 1, '#7BA97C', 3);
    drawLine(ctx, wbX - 30, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, signals.wer === 1, '#7BA97C', 3);
    drawLine(ctx, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y, signals.wer === 1, '#7BA97C', 3);
    
    // Branch connections
    if (signals.branch === 1) {
      drawLine(ctx,
        components.instMem.x + components.instMem.w, components.instMem.y + 150,
        components.ordenamiento.x, components.ordenamiento.y + 25,
        true, '#D4A574', 2
      );
      
      drawLine(ctx,
        components.ordenamiento.x, components.ordenamiento.y + 25,
        components.sumadorBranch.x + components.sumadorBranch.w, components.sumadorBranch.y + 25,
        true, '#457B9D', 3
      );
      
      drawLine(ctx,
        components.pcAdder.x, components.pcAdder.y + 25,
        components.sumadorBranch.x + components.sumadorBranch.w, components.sumadorBranch.y + 35,
        true, '#6A9C89', 2
      );
      
      drawLine(ctx,
        components.sumadorBranch.x, components.sumadorBranch.y + 25,
        components.muxPC.x + 20, components.muxPC.y + 50,
        true, '#457B9D', 2
      );
    }
  };

  const drawControlSignals = (ctx) => {
    const signals = signalStates;
    if (!signals.type) return;
    
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
  };

  return (
    <div className="w-full h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4 shadow-lg">
        <h1 className="text-2xl font-bold">Simulador RISC-V Completo</h1>
        <p className="text-sm opacity-90">Visualización del Datapath con todas las instrucciones</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Code Editor */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="font-bold text-lg mb-2">Editor de Código</h2>
            <button
              onClick={loadCode}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              Cargar Código
            </button>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 p-3 font-mono text-sm resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* Center Panel - Datapath Visualization */}
        <div className="flex-1 flex flex-col">
          {/* Controls */}
          <div className="bg-white border-b p-3 flex items-center gap-2">
            <button
              onClick={step}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2"
            >
              <SkipForward size={16} />
              Paso
            </button>
            <button
              onClick={toggleRun}
              className={`${running ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'} text-white px-4 py-2 rounded flex items-center gap-2`}
            >
              {running ? <Pause size={16} /> : <Play size={16} />}
              {running ? 'Pausar' : 'Ejecutar'}
            </button>
            <button
              onClick={reset}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded flex items-center gap-2"
            >
              <RotateCcw size={16} />
              Reset
            </button>
            
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setZoom(Math.min(2.5, zoom * 1.2)); }}
                className="bg-gray-200 hover:bg-gray-300 p-2 rounded"
              >
                <ZoomIn size={16} />
              </button>
              <span className="text-sm font-mono">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => { setZoom(Math.max(0.5, zoom / 1.2)); }}
                className="bg-gray-200 hover:bg-gray-300 p-2 rounded"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => { setZoom(1); setPan({ x: 50, y: 50 }); }}
                className="bg-gray-200 hover:bg-gray-300 p-2 rounded"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-hidden bg-gray-100">
            <canvas
              ref={canvasRef}
              width={1200}
              height={700}
              className="w-full h-full cursor-move"
              onMouseDown={(e) => {
                setIsDragging(true);
                setLastMouse({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => {
                if (!isDragging) return;
                const deltaX = e.clientX - lastMouse.x;
                const deltaY = e.clientY - lastMouse.y;
                setPan({ x: pan.x + deltaX, y: pan.y + deltaY });
                setLastMouse({ x: e.clientX, y: e.clientY });
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            />
          </div>
        </div>

        {/* Right Panel - State */}
        <div className="w-80 bg-white border-l flex flex-col">
          {/* PC and Instruction */}
          <div className="p-4 border-b bg-gray-50">
            <div className="mb-3">
              <div className="text-sm text-gray-600">Program Counter</div>
              <div className="text-2xl font-bold text-blue-600">{pc}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Instrucción Actual</div>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                {pc < program.length ? program[pc].raw : 'Fin'}
              </div>
            </div>
          </div>

          {/* Registers */}
          <div className="p-4 border-b">
            <h3 className="font-bold mb-2">Registros</h3>
            <div className="space-y-1 text-sm font-mono max-h-48 overflow-y-auto">
              {[0, 5, 6, 7, 10, 11, 12, 28, 29, 30, 31].map(i => (
                <div key={i} className="flex justify-between bg-gray-50 p-1 rounded">
                  <span className="text-gray-600">x{i}:</span>
                  <span className="font-bold">{registers[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Memory */}
          <div className="p-4 border-b">
            <h3 className="font-bold mb-2">Memoria (No Cero)</h3>
            <div className="space-y-1 text-sm font-mono max-h-32 overflow-y-auto">
              {memory.map((val, i) => val !== 0 && (
                <div key={i} className="flex justify-between bg-gray-50 p-1 rounded">
                  <span className="text-gray-600">[{i}]:</span>
                  <span className="font-bold">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Execution Log */}
          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <h3 className="font-bold mb-2">Log de Ejecución</h3>
            <div className="flex-1 overflow-y-auto space-y-1 text-xs font-mono">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`p-1 rounded ${
                    log.type === 'error' ? 'bg-red-100 text-red-800' :
                    log.type === 'success' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  <span className="text-gray-500">[{log.time}]</span> {log.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RISCVSimulator;