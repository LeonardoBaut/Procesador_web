// Diccionarios de códigos RISC-V
const OPCODES = {
    ADD:  "0110011",
    SUB:  "0110011",
    AND:  "0110011",
    OR:   "0110011",
    XOR:  "0110011",
    SLT:  "0110011",
    SLTU: "0110011",
    SLL:  "0110011",
    SRL:  "0110011",
    SRA:  "0110011",

    ADDI:  "0010011",
    ANDI:  "0010011",
    ORI:   "0010011",
    XORI:  "0010011",
    SLTI:  "0010011",
    SLTUI: "0010011",
    SLLI:  "0010011",
    SRLI:  "0010011",
    SRAI:  "0010011",

    LW:   "0000011",
    SW:   "0100011",
    
};

const FUNCT3 = {
    ADD:  "000",
    SUB:  "000",
    AND:  "111",
    OR:   "110",
    XOR:  "100",
    SLT:  "010",
    SLTU: "011",
    SLL:  "001",
    SRL:  "101",
    SRA:  "101",

    ADDI:  "000",
    ANDI:  "111",
    ORI:   "110",
    XORI:  "100",
    SLTI:  "010",
    SLTUI: "011",
    SLLI:  "001",
    SRLI:  "101",
    SRAI:  "101",

    LW:   "010",
    SW:   "010"
};

const FUNCT7 = {
    ADD:  "0000000",
    SUB:  "0100000",
    AND:  "0000000",
    OR:   "0000000",
    XOR:  "0000000",
    SLT:  "0000000",
    SLTU: "0000000",
    SLL:  "0000000",
    SRL:  "0000000",
    SRA:  "0100000",

    SLLI:  "0000000",
    SRLI:  "0000000",
    SRAI:  "0100000",

};

// Convierte x5 → 5 → binario 5 bits
function reg(x) {
    const num = parseInt(x.replace(/[^0-9]/g, ""));
    return num.toString(2).padStart(5, "0");
}


// Convierte decimal → binario 12 bits
function imm12(n) {
    return (n >>> 0).toString(2).padStart(12, "0").slice(-12);
}

// Ensamblador principal
function assemble(line, pc, labels) {

    const parts = line.split(/[ ,\t]+/);
    const inst  = parts[0].toUpperCase();
    //addi x0, x0, 0
    if (inst === "NOP") return "00000000000000000000000000010011";
    // -----------------------------
    // 1) INSTRUCCIONES TIPO R
    // -----------------------------
    if (OPCODES[inst] && FUNCT7[inst] && FUNCT3[inst]) {
        let rd  = reg(parts[1]);
        let rs1 = reg(parts[2]);
        let rs2 = reg(parts[3]);

        return FUNCT7[inst] + rs2 + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    }

    // -----------------------------
    // 2) INSTRUCCIONES TIPO I (ADDI, ORI, XORI...)
    // -----------------------------
    if (OPCODES[inst] === "0010011") {
        let rd  = reg(parts[1]);
        let rs1 = reg(parts[2]);
        let imm = imm12(Number(parts[3]));

        // Instrucciones I de desplazamiento (SLLI/SRLI/SRAI)
        if (inst.endsWith("I") && (inst === "SLLI" || inst === "SRLI" || inst === "SRAI")) {
            let shamt = parseInt(parts[3]).toString(2).padStart(5, "0");
            return FUNCT7[inst] + shamt + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
        }

        return imm + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    }

    // -----------------------------
    // 3) LOAD → LW
    // -----------------------------
    if (inst === "LW") {
        let rd = reg(parts[1]);
        let [imm, r] = parts[2].split("(");
        let rs1 = reg(r.replace(")", ""));
        imm = imm12(Number(imm));

        return imm + rs1 + FUNCT3[inst] + rd + OPCODES[inst];
    }

    // -----------------------------
    // 4) STORE → SW
    // -----------------------------
    if (inst === "SW") {
        let rs2 = reg(parts[1]);
        let [imm, r] = parts[2].split("(");
        let rs1 = reg(r.replace(")", ""));
        imm = imm12(Number(imm));

        const immHigh = imm.slice(0, 7);
        const immLow  = imm.slice(7);

        return immHigh + rs2 + rs1 + FUNCT3[inst] + immLow + OPCODES[inst];
    }

    // -----------------------------
    // 5) BRANCH
    // -----------------------------
    if (["BEQ","BNE","BLT","BGE"].includes(inst)) {
        let rs1 = reg(parts[1]);
        let rs2 = reg(parts[2]);
        let label = parts[3];

        let targetPC = labels[label];
        if (targetPC === undefined) return "ERROR: etiqueta no encontrada " + label;

        let offset = (targetPC - pc);  
        return encodeBranch(inst, rs1, rs2, offset);
    }
    


    return "ERROR: instrucción no soportada: " + inst;
}


function encodeBranch(op, rs1, rs2, offset) {
    const opcode = "1100011";   // opcode único para beq/bne/blt/bge
    const funct3 = {
        BEQ: "000",
        BNE: "001",
        BLT: "100",
        BGE: "101"
    }[op];

    let imm = offset & 0x1FFF; // lo limito a 13 bits (incluye bit 12)

    // Desensamblar imm en campos tipo B
    let imm12   = (imm >> 12) & 1;
    let imm10_5 = (imm >> 5)  & 0b111111;
    let imm4_1  = (imm >> 1)  & 0b1111;
    let imm11   = (imm >> 11) & 1;

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

function collectLabels(lines) {
    const labels = {};
    let pc = 0; // contador de programa en bytes

    lines.forEach(line => {
        line = line.split("#")[0].trim();
        if (line === "") return;

        if (line.endsWith(":")) {
            const label = line.replace(":", "");
            labels[label] = pc;
        } else {
            pc += 4; // cada instrucción son 4 bytes
        }
    });

    return labels;
}

function convert() {
    let lines = document.getElementById("codeEditor").value.trim().split("\n");
    const labels = collectLabels(lines);

    let out = "";
    let pc = 0;
    let lista_inst = [];

    lines.forEach(line => {
        line = line.split("#")[0].trim();
        if (line === "") return;

        // ignorar las líneas que son SOLO un label
        if (line.endsWith(":")) return;

        // ensamblar instrucción
        const bin = assemble(line, pc, labels);
        const bloque = `${line}\n${bin}\n${toHex(bin)}\n\n`;
        console.log(bin)
        out += bloque;         // salida completa
        lista_inst.push(bin); // solo esta instrucción

        pc += 4;
    });
    console.log(lista_inst);
    //document.getElementById("output").innerText = out;
}


function toHex(bin) {
    return "0x" + parseInt(bin, 2).toString(16).padStart(8, "0");
}