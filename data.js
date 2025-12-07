import React, { useState, useEffect, useRef } from 'react';

const RISCVSimulator = () => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Estado del simulador
  const [pc, setPc] = useState(0);
  const [registers, setRegisters] = useState(Array(32).fill(0));
  const [memory, setMemory] = useState(Array(256).fill(0));
  const [program, setProgram] = useState([]);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [code, setCode] = useState(`# Ejemplo: Suma de números
addi x5, x0, 10
addi x6, x0, 20
add x7, x5, x6
sw x7, 0(x0)`);
  
  // Controles de zoom y pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  
  // Estados de señales
  const [signalStates, setSignalStates] = useState({});
  
  const datapathWidth = 1200;
  const datapathHeight = 650;
  
  // Componentes del datapath (posiciones fijas)
  const components = {
    pc: { x: 50, y: 100, w: 80, h: 50, label: 'PC', color: '#4ade80' },
    pcAdder: { x: 50, y: 200, w: 80, h: 50, label: 'PC+4', color: '#60a5fa' },
    instMem: { x: 200, y: 50, w: 140, h: 180, label: 'Memoria de\nInstrucciones', color: '#a78bfa' },
    regBank: { x: 450, y: 80, w: 150, h: 160, label: 'Banco de\nRegistros', color: '#34d399' },
    alu: { x: 700, y: 120, w: 120, h: 100, label: 'ALU', color: '#f472b6' },
    dataMem: { x: 920, y: 80, w: 140, h: 160, label: 'Memoria de\nDatos', color: '#fb923c' },
    muxAluSrc: { x: 640, y: 150, w: 40, h: 60, label: 'MUX', color: '#94a3b8' },
    muxAlu2Reg: { x: 860, y: 130, w: 40, h: 60, label: 'MUX', color: '#94a3b8' },
    control: { x: 400, y: 350, w: 200, h: 80, label: 'Unidad de Control', color: '#c084fc' }
  };

  // Agregar log
  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev.slice(-20), { msg, type, time: new Date().toLocaleTimeString() }]);
  };

  // Parser de instrucciones
  const parseInstruction = (line) => {
    line = line.trim().split('#')[0].trim();
    if (!line) return null;
    
    const parts = line.split(/[\s,()]+/).filter(x => x);
    if (parts.length === 0) return null;
    
    return {
      raw: line,
      opcode: parts[0].toLowerCase(),
      operands: parts.slice(1)
    };
  };

  // Cargar código
  const loadCode = () => {
    const lines = code.split('\n');
    const parsedProgram = [];
    
    for (let line of lines) {
      const inst = parseInstruction(line);
      if (inst) parsedProgram.push(inst);
    }
    
    setProgram(parsedProgram);
    setPc(0);
    setRegisters(Array(32).fill(0));
    setMemory(Array(256).fill(0));
    setSignalStates({});
    addLog(`Cargadas ${parsedProgram.length} instrucciones`, 'success');
  };

  // Obtener índice de registro
  const getRegIndex = (reg) => {
    if (reg.startsWith('x')) return parseInt(reg.substring(1));
    return 0;
  };

  // Ejecutar instrucción
  const executeInstruction = (inst) => {
    const op = inst.opcode;
    const ops = inst.operands;
    const newRegs = [...registers];
    const newMem = [...memory];
    let newSignals = {};

    try {
      switch(op) {
        case 'add': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] + newRegs[rs2]) | 0;
          newSignals = { type: 'R', alu_op: 'ADD', wer: 1, alu_src: 1, alu2reg: 1 };
          break;
        }
        case 'sub': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] - newRegs[rs2]) | 0;
          newSignals = { type: 'R', alu_op: 'SUB', wer: 1, alu_src: 1, alu2reg: 1 };
          break;
        }
        case 'addi': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const imm = parseInt(ops[2]);
          if (rd !== 0) newRegs[rd] = (newRegs[rs1] + imm) | 0;
          newSignals = { type: 'I', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 1 };
          break;
        }
        case 'and': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] & newRegs[rs2];
          newSignals = { type: 'R', alu_op: 'AND', wer: 1, alu_src: 1, alu2reg: 1 };
          break;
        }
        case 'or': {
          const rd = getRegIndex(ops[0]);
          const rs1 = getRegIndex(ops[1]);
          const rs2 = getRegIndex(ops[2]);
          if (rd !== 0) newRegs[rd] = newRegs[rs1] | newRegs[rs2];
          newSignals = { type: 'R', alu_op: 'OR', wer: 1, alu_src: 1, alu2reg: 1 };
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
          newSignals = { type: 'L', alu_op: 'ADD', wer: 1, alu_src: 0, alu2reg: 0, wem: 0 };
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
          newSignals = { type: 'S', alu_op: 'ADD', wer: 0, alu_src: 0, alu2reg: 0, wem: 1 };
          break;
        }
        case 'beq': {
          const rs1 = getRegIndex(ops[0]);
          const rs2 = getRegIndex(ops[1]);
          const offset = parseInt(ops[2]);
          newSignals = { type: 'B', alu_op: 'EQ', wer: 0, alu_src: 1, branch: 1 };
          if (newRegs[rs1] === newRegs[rs2]) {
            setPc(p => p + offset);
            setRegisters(newRegs);
            setMemory(newMem);
            setSignalStates(newSignals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        case 'bne': {
          const rs1 = getRegIndex(ops[0]);
          const rs2 = getRegIndex(ops[1]);
          const offset = parseInt(ops[2]);
          newSignals = { type: 'B', alu_op: 'NE', wer: 0, alu_src: 1, branch: 1 };
          if (newRegs[rs1] !== newRegs[rs2]) {
            setPc(p => p + offset);
            setRegisters(newRegs);
            setMemory(newMem);
            setSignalStates(newSignals);
            addLog(`PC=${pc}: ${inst.raw} [TOMADO]`, 'success');
            return;
          }
          break;
        }
        default:
          addLog(`Instrucción no soportada: ${op}`, 'error');
          return;
      }

      setPc(p => p + 1);
      setRegisters(newRegs);
      setMemory(newMem);
      setSignalStates(newSignals);
      addLog(`PC=${pc}: ${inst.raw}`, 'success');
      
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      setRunning(false);
    }
  };

  // Paso a paso
  const step = () => {
    if (pc >= program.length) {
      addLog('Programa terminado', 'success');
      return;
    }
    executeInstruction(program[pc]);
  };

  // Ejecutar todo
  const run = () => {
    if (running) {
      setRunning(false);
      return;
    }
    setRunning(true);
  };

  useEffect(() => {
    if (running && pc < program.length) {
      const timer = setTimeout(() => {
        executeInstruction(program[pc]);
      }, 600);
      return () => clearTimeout(timer);
    } else if (running) {
      setRunning(false);
      addLog('Programa finalizado', 'success');
    }
  }, [running, pc]);

  // Reset
  const reset = () => {
    setPc(0);
    setRegisters(Array(32).fill(0));
    setMemory(Array(256).fill(0));
    setRunning(false);
    setSignalStates({});
    addLog('Sistema reiniciado', 'success');
  };

  // Zoom y Pan
  const zoomIn = () => setZoom(z => Math.min(2.5, z * 1.2));
  const zoomOut = () => setZoom(z => Math.max(0.5, z / 1.2));
  const zoomReset = () => {
    setZoom(1);
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: (rect.width - datapathWidth) / 2,
        y: (rect.height - datapathHeight) / 2
      });
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMouse.x;
    const deltaY = e.clientY - lastMouse.y;
    setPan(p => ({ x: p.x + deltaX, y: p.y + deltaY }));
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = zoom * delta;
    
    if (newZoom >= 0.5 && newZoom <= 2.5) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const scaleChange = newZoom / zoom;
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * scaleChange,
        y: mouseY - (mouseY - p.y) * scaleChange
      }));
      setZoom(newZoom);
    }
  };

  // Dibujar datapath
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // Limpiar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Aplicar transformación
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    // Grid de fondo
    ctx.strokeStyle = 'rgba(100, 120, 180, 0.1)';
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
    
    // Dibujar conexiones primero
    drawWires(ctx);
    
    // Dibujar componentes
    Object.values(components).forEach(comp => {
      drawComponent(ctx, comp);
    });
    
    // Dibujar señales de control
    drawControlSignals(ctx);
    
  }, [zoom, pan, signalStates]);

  const drawComponent = (ctx, comp) => {
    const active = signalStates.type !== undefined;
    
    // Sombra
    ctx.shadowColor = active ? 'rgba(0, 240, 255, 0.4)' : 'rgba(0, 240, 255, 0.2)';
    ctx.shadowBlur = active ? 15 : 8;
    
    // Rectángulo
    ctx.fillStyle = comp.color;
    ctx.fillRect(comp.x, comp.y, comp.w, comp.h);
    
    ctx.strokeStyle = active ? '#00f0ff' : '#334155';
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeRect(comp.x, comp.y, comp.w, comp.h);
    
    ctx.shadowBlur = 0;
    
    // Etiqueta
    ctx.fillStyle = '#ffffff';
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

  const drawWires = (ctx) => {
    const signals = signalStates;
    
    // PC a Memoria de Instrucciones
    drawLine(ctx, 
      components.pc.x + components.pc.w, components.pc.y + components.pc.h / 2,
      components.instMem.x, components.instMem.y + 50,
      true, '#00f0ff', 2
    );
    
    // PC a PC+4
    drawLine(ctx,
      components.pc.x + components.pc.w / 2, components.pc.y + components.pc.h,
      components.pcAdder.x + components.pcAdder.w / 2, components.pcAdder.y,
      true, '#00f0ff', 2
    );
    
    // Memoria Inst a Banco Registros
    drawLine(ctx,
      components.instMem.x + components.instMem.w, components.instMem.y + 80,
      components.regBank.x, components.regBank.y + 60,
      signals.type !== undefined, '#00ff88', 2
    );
    
    // Banco Registros a ALU
    drawLine(ctx,
      components.regBank.x + components.regBank.w, components.regBank.y + 60,
      components.alu.x, components.alu.y + 30,
      signals.alu_op !== undefined, '#00ff88', 3
    );
    
    // Banco Registros a MUX ALU_SRC
    drawLine(ctx,
      components.regBank.x + components.regBank.w, components.regBank.y + 120,
      components.muxAluSrc.x, components.muxAluSrc.y + components.muxAluSrc.h / 2,
      signals.alu_src !== undefined, '#ff00ff', 3
    );
    
    // MUX ALU_SRC a ALU
    drawLine(ctx,
      components.muxAluSrc.x + components.muxAluSrc.w, components.muxAluSrc.y + components.muxAluSrc.h / 2,
      components.alu.x, components.alu.y + 70,
      signals.alu_op !== undefined, '#00f0ff', 3
    );
    
    // ALU a MUX ALU2REG
    drawLine(ctx,
      components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
      components.muxAlu2Reg.x, components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2,
      signals.alu2reg === 1, '#ffff00', 3
    );
    
    // ALU a Memoria Datos (para direcciones)
    drawLine(ctx,
      components.alu.x + components.alu.w, components.alu.y + components.alu.h / 2,
      components.dataMem.x, components.dataMem.y + 60,
      signals.wem === 1 || signals.alu2reg === 0, '#00f0ff', 2
    );
    
    // Memoria Datos a MUX ALU2REG
    drawLine(ctx,
      components.dataMem.x, components.dataMem.y + 120,
      components.muxAlu2Reg.x + components.muxAlu2Reg.w, components.muxAlu2Reg.y + 15,
      signals.alu2reg === 0, '#00ff88', 3
    );
    
    // MUX ALU2REG a Banco Registros (writeback)
    const wbX = components.muxAlu2Reg.x;
    const wbY = components.muxAlu2Reg.y + components.muxAlu2Reg.h / 2;
    drawLine(ctx, wbX, wbY, wbX - 30, wbY, signals.wer === 1, '#00ff88', 3);
    drawLine(ctx, wbX - 30, wbY, wbX - 30, components.regBank.y - 20, signals.wer === 1, '#00ff88', 3);
    drawLine(ctx, wbX - 30, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, signals.wer === 1, '#00ff88', 3);
    drawLine(ctx, components.regBank.x + components.regBank.w / 2, components.regBank.y - 20, components.regBank.x + components.regBank.w / 2, components.regBank.y, signals.wer === 1, '#00ff88', 3);
  };

  const drawLine = (ctx, x1, y1, x2, y2, active, color = '#00f0ff', width = 2) => {
    ctx.strokeStyle = active ? color : '#1e293b';
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
  };

  const drawControlSignals = (ctx) => {
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
      
      ctx.fillStyle = active ? '#00ff88' : '#1e293b';
      ctx.beginPath();
      ctx.arc(cx, y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      if (active) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      
      ctx.fillStyle = active ? '#00ff88' : '#64748b';
      ctx.fillText(sig.name, cx, y + 25);
    });
    
    if (signals.alu_op) {
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ffff00';
      ctx.textAlign = 'left';
      ctx.fillText(`ALU_OP: ${signals.alu_op}`, x + controlLabels.length * spacing + 10, y + 5);
    }
  };

  return (
    <div className="w-full h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 p-4 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-cyan-400">Simulador RISC-V - Datapath Visual</h1>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Panel Izquierdo */}
        <div className="w-80 bg-slate-800 p-4 overflow-y-auto border-r border-slate-700">
          <div className="space-y-4">
            {/* Editor de Código */}
            <div>
              <h3 className="font-bold mb-2 text-cyan-300">Editor de Código</h3>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-48 bg-slate-900 text-green-400 p-2 rounded font-mono text-sm border border-slate-600"
                spellCheck="false"
              />
            </div>
            
            {/* Controles */}
            <div className="flex flex-wrap gap-2">
              <button onClick={loadCode} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
                Cargar
              </button>
              <button onClick={step} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded">
                Paso
              </button>
              <button onClick={run} className={`px-4 py-2 rounded ${running ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                {running ? 'Pausar' : 'Ejecutar'}
              </button>
              <button onClick={reset} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded">
                Reset
              </button>
            </div>
            
            {/* Estado */}
            <div>
              <h3 className="font-bold mb-2 text-cyan-300">Estado del Sistema</h3>
              <div className="bg-slate-900 p-3 rounded text-sm space-y-1">
                <div><span className="text-yellow-400">PC:</span> {pc}</div>
                <div><span className="text-yellow-400">Instrucción:</span> {program[pc]?.raw || 'Fin'}</div>
              </div>
            </div>
            
            {/* Registros */}
            <div>
              <h3 className="font-bold mb-2 text-cyan-300">Registros</h3>
              <div className="bg-slate-900 p-2 rounded text-xs max-h-40 overflow-y-auto space-y-1">
                {[0, 5, 6, 7, 28, 29, 30, 31].map(i => (
                  <div key={i} className="flex justify-between">
                    <span className="text-blue-400">x{i}:</span>
                    <span className="text-green-400">{registers[i]}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Memoria */}
            <div>
              <h3 className="font-bold mb-2 text-cyan-300">Memoria</h3>
              <div className="bg-slate-900 p-2 rounded text-xs max-h-32 overflow-y-auto space-y-1">
                {memory.map((val, i) => val !== 0 && (
                  <div key={i} className="flex justify-between">
                    <span className="text-orange-400">[{i}]:</span>
                    <span className="text-green-400">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Log */}
            <div>
              <h3 className="font-bold mb-2 text-cyan-300">Log de Ejecución</h3>
              <div className="bg-slate-900 p-2 rounded text-xs max-h-32 overflow-y-auto space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className={log.type === 'error' ? 'text-red-400' : 'text-gray-300'}>
                    [{log.time}] {log.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Canvas Principal */}
        <div className="flex-1 flex flex-col">
          {/* Controles de Zoom */}
          <div className="bg-slate-800 p-2 flex items-center gap-2 border-b border-slate-700">
            <button onClick={zoomIn} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded">+</button>
            <button onClick={zoomOut} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded">-</button>
            <button onClick={zoomReset} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded">Reset</button>
            <span className="text-sm text-slate-400">{Math.round(zoom * 100)}%</span>
          </div>
          
          {/* Canvas */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RIS