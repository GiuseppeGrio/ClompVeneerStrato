import { useEffect, useRef, useCallback } from 'react';

// ============================================================
// CLOMP e il Mondo di Venere - Complete Game
// ============================================================

// === CONFIG ===
const CONFIG = {
  TILE: 32,
  PLAYER_SPEED: 2.5,
  ANXIETY_MAX: 100,
  GAZE_RANGE: 150,
  GAZE_ANGLE: Math.PI / 3,
  RUMINATION_SPEED: 0.8,
  SAVE_KEY: 'clomp_venere_save',
  ZONES: ['acqua', 'fuoco', 'vento', 'tuono', 'foglie', 'terra', 'spirito'],
  COLORS: {
    acqua: '#1a4a6e',
    fuoco: '#6e1a1a',
    vento: '#4a6e1a',
    tuono: '#3a1a6e',
    foglie: '#1a6e3a',
    terra: '#6e5a1a',
    spirito: '#1a1a4e',
    hub: '#2a3a5a',
    player: '#4488ff',
    adultClomp: '#2244aa',
    anxiety: '#ff4444',
    courage: '#ffaa00',
    authenticity: '#44ff88',
    refuge: '#44aa88',
    wall: '#334455',
    floor: '#1a2a3a',
    gaze: '#ffcc00',
    rumination: '#aa44ff',
    boss: '#ff2266',
    technique: '#00ffcc',
  }
};

// === TYPES ===
interface Vec2 { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }
interface Entity { pos: Vec2; vel: Vec2; radius: number; active: boolean; }
interface Player extends Entity {
  anxiety: number; courage: number; authenticity: number;
  techniques: string[]; masks: string[]; currentMask: string | null;
  frozen: boolean; freezeTimer: number;
  zone: string; room: number;
  allies: string[];
  memories: number;
  exposureLevel: number;
  dialogueActive: boolean;
}
interface GazeEntity extends Entity {
  angle: number; range: number; sweepSpeed: number; sweepDir: number;
  type: 'npc' | 'eye';
}
interface GazeData {
  pos: Vec2; angle: number; range: number; sweepSpeed: number; type: 'npc' | 'eye';
}
interface Rumination extends Entity {
  text: string; life: number; speed: number;
}
interface NPC extends Entity {
  name: string; dialogue: DialogueNode[]; talked: boolean; type: string;
}
interface DialogueNode {
  text: string;
  choices?: { text: string; approach: 'avoid' | 'brief' | 'open'; next?: number; effect?: string }[];
  next?: number;
}
interface Boss extends Entity {
  name: string; hp: number; maxHp: number; phase: number;
  pattern: string; timer: number; zone: string;
  defeated: boolean; dialogue: string[];
}
interface Room {
  walls: Rect[]; gazes: GazeEntity[]; ruminations: Rumination[];
  npcs: NPC[]; exits: Rect[]; items: { pos: Vec2; type: string; collected: boolean }[];
  isRefuge: boolean; events: { trigger: Rect; once: boolean; fired: boolean; action: string }[];
  boss?: Boss;
}
type GazeInput = { pos: Vec2; angle: number; range: number; sweepSpeed: number; type: 'npc' | 'eye' };
interface Zone {
  name: string; rooms: Room[]; theme: string; color: string;
  techniqueReward: string; bossDefeated: boolean;
  description: string;
}
interface GameState {
  scene: 'title' | 'hub' | 'zone' | 'boss' | 'dialogue' | 'refuge' | 'ending';
  player: Player;
  zones: Zone[];
  currentZone: number;
  currentRoom: number;
  camera: Vec2;
  time: number;
  deltaTime: number;
  paused: boolean;
  showMap: boolean;
  notifications: { text: string; timer: number }[];
  dialogueState: { npc: NPC | null; nodeIndex: number; choices: boolean } | null;
  techniqueActive: string | null;
  techniqueTimer: number;
  bossActive: Boss | null;
  particles: { pos: Vec2; vel: Vec2; life: number; color: string; size: number }[];
  clocks: { pos: Vec2; time: number; active: boolean }[];
  exposureChallenges: { zone: number; level: number; completed: boolean }[];
  introPhase: number;
  titleAlpha: number;
  transitionAlpha: number;
  transitioning: boolean;
  transitionTarget: { zone: number; room: number } | null;
}

// === AUDIO SYSTEM ===
class AudioSystem {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  musicOsc: OscillatorNode | null = null;
  musicGain: GainNode | null = null;
  
  init() {
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
    } catch(e) { console.log('Audio unavailable'); }
  }
  
  playNote(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.1) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  
  playSfx(name: string) {
    if (!this.ctx) return;
    switch(name) {
      case 'step': this.playNote(200 + Math.random() * 50, 0.05, 'sine', 0.02); break;
      case 'anxiety': this.playNote(100, 0.3, 'sawtooth', 0.05); break;
      case 'relief': this.playNote(440, 0.2, 'sine', 0.08); this.playNote(660, 0.2, 'sine', 0.06); break;
      case 'technique': this.playNote(523, 0.15, 'triangle', 0.1); this.playNote(659, 0.15, 'triangle', 0.08); break;
      case 'boss': this.playNote(80, 0.5, 'sawtooth', 0.1); break;
      case 'victory': this.playNote(523, 0.2, 'sine', 0.1); setTimeout(() => this.playNote(659, 0.2, 'sine', 0.1), 200); setTimeout(() => this.playNote(784, 0.4, 'sine', 0.1), 400); break;
      case 'dialogue': this.playNote(600, 0.05, 'square', 0.03); break;
      case 'collect': this.playNote(880, 0.1, 'sine', 0.08); this.playNote(1100, 0.15, 'sine', 0.06); break;
      case 'freeze': this.playNote(60, 0.5, 'square', 0.1); break;
      case 'rumination': this.playNote(150, 0.3, 'sawtooth', 0.04); break;
    }
  }
  
  startMusic(zone: string) {
    if (!this.ctx || !this.masterGain) return;
    this.stopMusic();
    const scales: Record<string, number[]> = {
      hub: [262, 294, 330, 349, 392, 440, 494],
      acqua: [262, 311, 349, 392, 466, 523, 587],
      fuoco: [262, 294, 330, 370, 392, 440, 494],
      vento: [262, 330, 392, 440, 523, 587, 659],
      tuono: [262, 311, 349, 415, 466, 523, 622],
      foglie: [262, 294, 349, 392, 440, 523, 587],
      terra: [262, 277, 311, 349, 370, 415, 466],
      spirito: [262, 330, 392, 523, 659, 784, 1047],
    };
    const scale = scales[zone] || scales.hub;
    let noteIndex = 0;
    const playNext = () => {
      if (!this.ctx) return;
      const freq = scale[noteIndex % scale.length];
      this.playNote(freq, 1.5, 'sine', 0.03);
      if (Math.random() > 0.5) this.playNote(freq * 0.5, 2, 'triangle', 0.02);
      noteIndex++;
    };
    playNext();
    this.musicOsc = this.ctx.createOscillator();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicOsc.connect(this.musicGain);
    this.musicGain.connect(this.masterGain);
    this.musicOsc.start();
    (this as any)._musicInterval = setInterval(playNext, 2000);
  }
  
  stopMusic() {
    if ((this as any)._musicInterval) clearInterval((this as any)._musicInterval);
    try { this.musicOsc?.stop(); } catch(e) {}
    this.musicOsc = null;
  }
}

// === ZONE DATA ===
function createZones(): Zone[] {
  return [
    // ZONA 1: ACQUA (Piedi) - Paura di cominciare
    {
      name: 'Acqua', theme: 'Paura di cominciare', color: CONFIG.COLORS.acqua,
      techniqueReward: 'peggiora_apposta', bossDefeated: false,
      description: 'Le acque riflettono ogni sguardo. Ogni passo è un atto di coraggio.',
      rooms: [
        createRoom('acqua_inizio', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [
          { pos: { x: 10, y: 5 }, angle: 0, range: 120, sweepSpeed: 0.01, type: 'eye' as const },
          { pos: { x: 15, y: 10 }, angle: Math.PI, range: 100, sweepSpeed: 0.015, type: 'npc' as const },
        ], [], [
          { x: 17, y: 9, w: 1, h: 2 }
        ]),
        createRoom('acqua_pozze', [
          { x: 0, y: 0, w: 25, h: 2 }, { x: 0, y: 18, w: 25, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 23, y: 0, w: 2, h: 20 },
          { x: 8, y: 5, w: 4, h: 4 }, { x: 15, y: 10, w: 4, h: 4 }
        ], [
          { pos: { x: 6, y: 10 }, angle: 0, range: 130, sweepSpeed: 0.012, type: 'eye' as const },
          { pos: { x: 18, y: 8 }, angle: Math.PI/2, range: 110, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 12, y: 15 }, angle: -Math.PI/4, range: 100, sweepSpeed: 0.008, type: 'npc' as const },
        ], [
          { text: 'Le pozze riflettono... tu stesso?', choices: [
            { text: '(Evita lo sguardo)', approach: 'avoid' as const },
            { text: '(Guarda brevemente)', approach: 'brief' as const },
            { text: '(Accetta il riflesso)', approach: 'open' as const }
          ]}
        ], [{ x: 22, y: 9, w: 1, h: 2 }]),
        createRoom('acqua_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('acqua_boss', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [], [], [], false, false,
          { name: "L'Onda del Primo Passo", hp: 100, maxHp: 100, phase: 0,
            pattern: 'wave', timer: 0, zone: 'acqua', defeated: false,
            pos: { x: 10, y: 5 }, vel: { x: 0, y: 0 }, radius: 40, active: true,
            dialogue: ['Ogni inizio è una montagna...', 'Perché non resti dove sei sicuro?', 'Il primo passo è il più difficile...']
          }
        ),
      ]
    },
    // ZONA 2: FUOCO (Gambe) - Fuga e vergogna
    {
      name: 'Fuoco', theme: 'Fuga e vergogna', color: CONFIG.COLORS.fuoco,
      techniqueReward: 'missione_imbarazzo', bossDefeated: false,
      description: 'Le fiamme della vergogna inseguono chi fugge. Chi si ferma, le doma.',
      rooms: [
        createRoom('fuoco_inizio', [
          { x: 0, y: 0, w: 22, h: 2 }, { x: 0, y: 18, w: 22, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 20, y: 0, w: 2, h: 20 },
          { x: 6, y: 6, w: 3, h: 3 }, { x: 14, y: 10, w: 3, h: 3 }
        ], [
          { pos: { x: 10, y: 10 }, angle: 0, range: 140, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 5, y: 14 }, angle: Math.PI/3, range: 120, sweepSpeed: 0.015, type: 'eye' as const },
        ], [], [{ x: 19, y: 9, w: 1, h: 2 }]),
        createRoom('fuoco_stealth', [
          { x: 0, y: 0, w: 28, h: 2 }, { x: 0, y: 18, w: 28, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 26, y: 0, w: 2, h: 20 },
          { x: 5, y: 4, w: 2, h: 6 }, { x: 10, y: 8, w: 2, h: 6 },
          { x: 16, y: 4, w: 2, h: 6 }, { x: 22, y: 8, w: 2, h: 6 }
        ], [
          { pos: { x: 8, y: 10 }, angle: 0, range: 100, sweepSpeed: 0.025, type: 'eye' as const },
          { pos: { x: 14, y: 10 }, angle: Math.PI, range: 100, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 20, y: 10 }, angle: Math.PI/2, range: 100, sweepSpeed: 0.03, type: 'eye' as const },
        ], [], [{ x: 25, y: 9, w: 1, h: 2 }]),
        createRoom('fuoco_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('fuoco_boss', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [], [], [], false, false,
          { name: 'La Vergogna', hp: 100, maxHp: 100, phase: 0,
            pattern: 'chase', timer: 0, zone: 'fuoco', defeated: false,
            pos: { x: 10, y: 5 }, vel: { x: 0, y: 0 }, radius: 35, active: true,
            dialogue: ['Tutti ti guardano...', 'Sei ridicolo...', 'Non meritisci di essere visto...']
          }
        ),
      ]
    },
    // ZONA 3: VENTO (Ventre) - Nodi allo stomaco
    {
      name: 'Vento', theme: 'Nodi allo stomaco e ruminazione', color: CONFIG.COLORS.vento,
      techniqueReward: 'appuntamento_paura', bossDefeated: false,
      description: 'Il vento porta pensieri che non smettono mai di girare.',
      rooms: [
        createRoom('vento_inizio', [
          { x: 0, y: 0, w: 24, h: 2 }, { x: 0, y: 18, w: 24, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 22, y: 0, w: 2, h: 20 }
        ], [
          { pos: { x: 8, y: 8 }, angle: 0, range: 120, sweepSpeed: 0.018, type: 'eye' as const },
        ], [
          { pos: { x: 15, y: 12 }, vel: { x: -0.3, y: 0 }, radius: 15, active: true, text: '"E se ridono di me?"', life: 999, speed: 0.3 },
          { pos: { x: 18, y: 8 }, vel: { x: -0.2, y: 0.1 }, radius: 15, active: true, text: '"Farò una figuraccia"', life: 999, speed: 0.2 },
        ], [{ x: 21, y: 9, w: 1, h: 2 }]),
        createRoom('vento_correnti', [
          { x: 0, y: 0, w: 26, h: 2 }, { x: 0, y: 18, w: 26, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 24, y: 0, w: 2, h: 20 },
          { x: 8, y: 6, w: 3, h: 2 }, { x: 16, y: 10, w: 3, h: 2 }
        ], [
          { pos: { x: 6, y: 10 }, angle: 0, range: 130, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 20, y: 8 }, angle: Math.PI, range: 110, sweepSpeed: 0.015, type: 'eye' as const },
        ], [
          { pos: { x: 12, y: 14 }, vel: { x: -0.4, y: 0.2 }, radius: 15, active: true, text: '"Tutti mi osservano"', life: 999, speed: 0.4 },
          { pos: { x: 10, y: 6 }, vel: { x: 0.1, y: -0.3 }, radius: 15, active: true, text: '"Non sono abbastanza"', life: 999, speed: 0.3 },
          { pos: { x: 20, y: 14 }, vel: { x: -0.2, y: -0.1 }, radius: 15, active: true, text: '"E se sbaglio?"', life: 999, speed: 0.2 },
        ], [{ x: 23, y: 9, w: 1, h: 2 }]),
        createRoom('vento_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('vento_boss', [
          { x: 0, y: 0, w: 22, h: 2 }, { x: 0, y: 20, w: 22, h: 2 },
          { x: 0, y: 0, w: 2, h: 22 }, { x: 20, y: 0, w: 2, h: 22 }
        ], [], [], [], false, false,
          { name: 'Il Coro dei "E Se..."', hp: 100, maxHp: 100, phase: 0,
            pattern: 'swarm', timer: 0, zone: 'vento', defeated: false,
            pos: { x: 11, y: 11 }, vel: { x: 0, y: 0 }, radius: 30, active: true,
            dialogue: ['E se fallisci?', 'E se ti umiliano?', 'E se non ce la fai?', 'E se... e se... e se...']
          }
        ),
      ]
    },
    // ZONA 4: TUONO (Petto) - Attacco di panico
    {
      name: 'Tuono', theme: 'Attacco di panico', color: CONFIG.COLORS.tuono,
      techniqueReward: 'osservatore_esterno', bossDefeated: false,
      description: 'Il cuore batte all impazzita. I fulmini colpiscono a caso. Respira.',
      rooms: [
        createRoom('tuono_inizio', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [
          { pos: { x: 10, y: 10 }, angle: 0, range: 150, sweepSpeed: 0.025, type: 'eye' as const },
        ], [
          { pos: { x: 5, y: 10 }, vel: { x: 0.2, y: 0.2 }, radius: 15, active: true, text: '"Mi manca il respiro"', life: 999, speed: 0.2 },
        ], [{ x: 17, y: 9, w: 1, h: 2 }]),
        createRoom('tuono_fulmini', [
          { x: 0, y: 0, w: 24, h: 2 }, { x: 0, y: 18, w: 24, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 22, y: 0, w: 2, h: 20 },
          { x: 6, y: 5, w: 2, h: 4 }, { x: 12, y: 10, w: 2, h: 4 }, { x: 18, y: 5, w: 2, h: 4 }
        ], [
          { pos: { x: 8, y: 10 }, angle: 0, range: 120, sweepSpeed: 0.03, type: 'eye' as const },
          { pos: { x: 16, y: 10 }, angle: Math.PI, range: 120, sweepSpeed: 0.02, type: 'eye' as const },
        ], [
          { pos: { x: 10, y: 14 }, vel: { x: -0.3, y: 0 }, radius: 15, active: true, text: '"Sto per svenire"', life: 999, speed: 0.3 },
          { pos: { x: 18, y: 6 }, vel: { x: 0, y: 0.3 }, radius: 15, active: true, text: '"Non posso controllare"', life: 999, speed: 0.2 },
        ], [{ x: 21, y: 9, w: 1, h: 2 }]),
        createRoom('tuono_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('tuono_boss', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [], [], [], false, false,
          { name: 'Il Cuore Impazzito', hp: 100, maxHp: 100, phase: 0,
            pattern: 'panic', timer: 0, zone: 'tuono', defeated: false,
            pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, radius: 45, active: true,
            dialogue: ['BATTI! BATTI! BATTI!', 'Non riesci a respirare!', 'Stai morendo... o no?', 'Lascia andare il controllo.']
          }
        ),
      ]
    },
    // ZONA 5: FOGLIE (Braccia) - Raggiungere gli altri
    {
      name: 'Foglie', theme: 'Raggiungere gli altri', color: CONFIG.COLORS.foglie,
      techniqueReward: 'alleato', bossDefeated: false,
      description: 'I ponti crescono solo quando ci si apre agli altri.',
      rooms: [
        createRoom('foglie_inizio', [
          { x: 0, y: 0, w: 22, h: 2 }, { x: 0, y: 18, w: 22, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 20, y: 0, w: 2, h: 20 }
        ], [
          { pos: { x: 10, y: 10 }, angle: 0, range: 100, sweepSpeed: 0.01, type: 'npc' as const },
        ], [
          { text: 'Ciao... vuoi parlare?', choices: [
            { text: '(Scappa via)', approach: 'avoid' as const },
            { text: '(Ciao.)', approach: 'brief' as const },
            { text: '(Ciao! Mi piacerebbe parlare.)', approach: 'open' as const }
          ]}
        ], [{ x: 19, y: 9, w: 1, h: 2 }]),
        createRoom('foglie_ponti', [
          { x: 0, y: 0, w: 26, h: 2 }, { x: 0, y: 18, w: 26, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 24, y: 0, w: 2, h: 20 },
          { x: 8, y: 2, w: 2, h: 6 }, { x: 16, y: 12, w: 2, h: 6 }
        ], [
          { pos: { x: 6, y: 10 }, angle: 0, range: 110, sweepSpeed: 0.012, type: 'npc' as const },
          { pos: { x: 20, y: 10 }, angle: Math.PI, range: 110, sweepSpeed: 0.015, type: 'npc' as const },
        ], [
          { text: 'Ti senti solo?', choices: [
            { text: '(Non rispondere)', approach: 'avoid' as const },
            { text: '(A volte.)', approach: 'brief' as const },
            { text: '(Sì... mi sento solo spesso.)', approach: 'open' as const }
          ]}
        ], [{ x: 23, y: 9, w: 1, h: 2 }]),
        createRoom('foglie_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('foglie_boss', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [], [], [], false, false,
          { name: 'Il Muro di Vetro', hp: 100, maxHp: 100, phase: 0,
            pattern: 'dialogue', timer: 0, zone: 'foglie', defeated: false,
            pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, radius: 50, active: true,
            dialogue: ['Non puoi raggiungermi...', 'Le parole non bastano...', 'Mostrami chi sei davvero.', 'Il vetro si incrina solo con la verità.']
          }
        ),
      ]
    },
    // ZONA 6: TERRA (Viso e Collo) - Identità e maschere
    {
      name: 'Terra', theme: 'Identità e maschere', color: CONFIG.COLORS.terra,
      techniqueReward: 'autenticita', bossDefeated: false,
      description: 'Ogni specchio mostra una maschera. Quale sei davvero?',
      rooms: [
        createRoom('terra_specchi', [
          { x: 0, y: 0, w: 24, h: 2 }, { x: 0, y: 18, w: 24, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 22, y: 0, w: 2, h: 20 },
          { x: 6, y: 4, w: 1, h: 5 }, { x: 12, y: 4, w: 1, h: 5 },
          { x: 18, y: 4, w: 1, h: 5 }, { x: 6, y: 12, w: 1, h: 5 },
          { x: 12, y: 12, w: 1, h: 5 }, { x: 18, y: 12, w: 1, h: 5 }
        ], [
          { pos: { x: 8, y: 10 }, angle: 0, range: 120, sweepSpeed: 0.015, type: 'eye' as const },
          { pos: { x: 16, y: 10 }, angle: Math.PI, range: 120, sweepSpeed: 0.02, type: 'eye' as const },
        ], [
          { pos: { x: 10, y: 14 }, vel: { x: 0, y: -0.2 }, radius: 15, active: true, text: '"Chi sei davvero?"', life: 999, speed: 0.2 },
        ], [{ x: 21, y: 9, w: 1, h: 2 }]),
        createRoom('terra_maschere', [
          { x: 0, y: 0, w: 22, h: 2 }, { x: 0, y: 18, w: 22, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 20, y: 0, w: 2, h: 20 }
        ], [
          { pos: { x: 10, y: 8 }, angle: 0, range: 130, sweepSpeed: 0.018, type: 'eye' as const },
        ], [
          { text: 'Quale maschera indossi oggi?', choices: [
            { text: '(Il Sorriso - nascondi il disagio)', approach: 'brief' as const },
            { text: '(Il Silenzio - non dire nulla)', approach: 'avoid' as const },
            { text: '(Nessuna - sono io)', approach: 'open' as const }
          ]}
        ], [{ x: 19, y: 9, w: 1, h: 2 }]),
        createRoom('terra_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('terra_boss', [
          { x: 0, y: 0, w: 20, h: 2 }, { x: 0, y: 18, w: 20, h: 2 },
          { x: 0, y: 0, w: 2, h: 20 }, { x: 18, y: 0, w: 2, h: 20 }
        ], [], [], [], false, false,
          { name: 'Il Volto Perfetto', hp: 100, maxHp: 100, phase: 0,
            pattern: 'mirror', timer: 0, zone: 'terra', defeated: false,
            pos: { x: 10, y: 10 }, vel: { x: 0, y: 0 }, radius: 40, active: true,
            dialogue: ['Io sono ciò che dovresti essere.', 'Perfetto. Infallibile. Amato.', 'Rinuncia a me... e sarai libero.', 'La perfezione è una gabbia dorata.']
          }
        ),
      ]
    },
    // ZONA 7: SPIRITO (Aureola) - Accettazione di sé
    {
      name: 'Spirito', theme: 'Accettazione di sé', color: CONFIG.COLORS.spirito,
      techniqueReward: 'accettazione', bossDefeated: false,
      description: 'Il cielo stellato osserva. Tu parli comunque.',
      rooms: [
        createRoom('spirito_stelle', [
          { x: 0, y: 0, w: 26, h: 2 }, { x: 0, y: 20, w: 26, h: 2 },
          { x: 0, y: 0, w: 2, h: 22 }, { x: 24, y: 0, w: 2, h: 22 }
        ], [
          { pos: { x: 6, y: 10 }, angle: 0, range: 140, sweepSpeed: 0.015, type: 'eye' as const },
          { pos: { x: 13, y: 6 }, angle: Math.PI/2, range: 130, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 20, y: 14 }, angle: Math.PI, range: 140, sweepSpeed: 0.018, type: 'eye' as const },
        ], [
          { pos: { x: 8, y: 16 }, vel: { x: -0.2, y: -0.1 }, radius: 15, active: true, text: '"Tutti guardano"', life: 999, speed: 0.2 },
          { pos: { x: 18, y: 8 }, vel: { x: 0.1, y: 0.2 }, radius: 15, active: true, text: '"Giudicano"', life: 999, speed: 0.2 },
        ], [{ x: 23, y: 10, w: 1, h: 2 }]),
        createRoom('spirito_combinato', [
          { x: 0, y: 0, w: 28, h: 2 }, { x: 0, y: 20, w: 28, h: 2 },
          { x: 0, y: 0, w: 2, h: 22 }, { x: 26, y: 0, w: 2, h: 22 },
          { x: 8, y: 6, w: 3, h: 3 }, { x: 18, y: 12, w: 3, h: 3 }
        ], [
          { pos: { x: 5, y: 10 }, angle: 0, range: 120, sweepSpeed: 0.02, type: 'eye' as const },
          { pos: { x: 14, y: 10 }, angle: Math.PI, range: 130, sweepSpeed: 0.025, type: 'eye' as const },
          { pos: { x: 22, y: 10 }, angle: Math.PI/2, range: 110, sweepSpeed: 0.015, type: 'eye' as const },
        ], [
          { pos: { x: 10, y: 16 }, vel: { x: -0.3, y: 0 }, radius: 15, active: true, text: '"Non ce la farai"', life: 999, speed: 0.3 },
          { pos: { x: 20, y: 6 }, vel: { x: 0, y: 0.2 }, radius: 15, active: true, text: '"Sei inadeguato"', life: 999, speed: 0.2 },
          { pos: { x: 14, y: 18 }, vel: { x: -0.1, y: -0.2 }, radius: 15, active: true, text: '"Meglio tacere"', life: 999, speed: 0.2 },
        ], [{ x: 25, y: 10, w: 1, h: 2 }]),
        createRoom('spirito_rifugio', [
          { x: 0, y: 0, w: 12, h: 12 }, { x: 0, y: 0, w: 12, h: 1 },
          { x: 0, y: 11, w: 12, h: 1 }, { x: 0, y: 0, w: 1, h: 12 }, { x: 11, y: 0, w: 1, h: 12 }
        ], [], [], [{ x: 10, y: 5, w: 1, h: 2 }], true),
        createRoom('spirito_boss', [
          { x: 0, y: 0, w: 24, h: 2 }, { x: 0, y: 22, w: 24, h: 2 },
          { x: 0, y: 0, w: 2, h: 24 }, { x: 22, y: 0, w: 2, h: 24 }
        ], [], [], [], false, false,
          { name: 'Il Pubblico delle Stelle', hp: 150, maxHp: 150, phase: 0,
            pattern: 'audience', timer: 0, zone: 'spirito', defeated: false,
            pos: { x: 12, y: 12 }, vel: { x: 0, y: 0 }, radius: 50, active: true,
            dialogue: ['Ti osserviamo...', 'Parla... se hai il coraggio.', 'Non puoi nasconderti per sempre.', 'Il pubblico aspetta. La tua voce conta.']
          }
        ),
      ]
    },
  ];
}

function createRoom(
  _name: string, walls: Rect[], gazes: GazeInput[], ruminations?: (Rumination | any)[],
  exits?: Rect[], isRefuge = false, _hasItems = false, boss?: Boss
): Room {
  return {
    walls: walls.map(w => ({ x: w.x * CONFIG.TILE, y: w.y * CONFIG.TILE, w: w.w * CONFIG.TILE, h: w.h * CONFIG.TILE })),
    gazes: gazes.map((g: GazeInput) => ({
      pos: { x: g.pos.x * CONFIG.TILE, y: g.pos.y * CONFIG.TILE },
      vel: { x: 0, y: 0 }, radius: 12, active: true,
      angle: g.angle, range: g.range, sweepSpeed: g.sweepSpeed, sweepDir: 1, type: g.type
    })),
    ruminations: (ruminations || []).map(r => ({
      ...r,
      pos: { x: r.pos.x * CONFIG.TILE, y: r.pos.y * CONFIG.TILE },
    })),
    npcs: [],
    exits: (exits || []).map(e => ({ x: e.x * CONFIG.TILE, y: e.y * CONFIG.TILE, w: e.w * CONFIG.TILE, h: e.h * CONFIG.TILE })),
    items: [],
    isRefuge,
    events: [],
    boss,
  };
}

// === MAIN GAME ===
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const audioRef = useRef<AudioSystem>(new AudioSystem());
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const touchDirRef = useRef<Vec2>({ x: 0, y: 0 });
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const initGame = useCallback((): GameState => {
    const saved = localStorage.getItem(CONFIG.SAVE_KEY);
    let playerData: Partial<Player> = {};
    let zoneProgress: boolean[] = Array(7).fill(false);
    
    if (saved) {
      try {
        const data = JSON.parse(saved);
        playerData = data.player || {};
        zoneProgress = data.zoneProgress || Array(7).fill(false);
      } catch(e) {}
    }

    const zones = createZones();
    zones.forEach((z, i) => { z.bossDefeated = zoneProgress[i]; });

    return {
      scene: 'title',
      player: {
        pos: { x: 5 * CONFIG.TILE, y: 10 * CONFIG.TILE },
        vel: { x: 0, y: 0 },
        radius: 12,
        active: true,
        anxiety: playerData.anxiety || 20,
        courage: playerData.courage || 0,
        authenticity: playerData.authenticity || 50,
        techniques: playerData.techniques || [],
        masks: playerData.masks || ['sorriso', 'silenzio', 'ombra'],
        currentMask: playerData.currentMask || null,
        frozen: false,
        freezeTimer: 0,
        zone: 'hub',
        room: 0,
        allies: playerData.allies || [],
        memories: playerData.memories || 0,
        exposureLevel: playerData.exposureLevel || 0,
        dialogueActive: false,
      },
      zones,
      currentZone: -1,
      currentRoom: 0,
      camera: { x: 0, y: 0 },
      time: 0,
      deltaTime: 0,
      paused: false,
      showMap: false,
      notifications: [],
      dialogueState: null,
      techniqueActive: null,
      techniqueTimer: 0,
      bossActive: null,
      particles: [],
      clocks: [],
      exposureChallenges: [],
      introPhase: 0,
      titleAlpha: 1,
      transitionAlpha: 0,
      transitioning: false,
      transitionTarget: null,
    };
  }, []);

  const saveGame = useCallback(() => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    const data = {
      player: {
        anxiety: g.player.anxiety,
        courage: g.player.courage,
        authenticity: g.player.authenticity,
        techniques: g.player.techniques,
        masks: g.player.masks,
        currentMask: g.player.currentMask,
        allies: g.player.allies,
        memories: g.player.memories,
        exposureLevel: g.player.exposureLevel,
      },
      zoneProgress: g.zones.map(z => z.bossDefeated),
    };
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(data));
    addNotification('Partita salvata!');
  }, []);

  const addNotification = (text: string) => {
    if (!gameRef.current) return;
    gameRef.current.notifications.push({ text, timer: 3 });
  };

  const addParticle = (pos: Vec2, color: string, count = 5) => {
    if (!gameRef.current) return;
    for (let i = 0; i < count; i++) {
      gameRef.current.particles.push({
        pos: { ...pos },
        vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
        life: 1,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  };

  const getCurrentRoom = (): Room | null => {
    if (!gameRef.current) return null;
    const g = gameRef.current;
    if (g.currentZone < 0 || g.currentZone >= g.zones.length) return null;
    const zone = g.zones[g.currentZone];
    if (g.currentRoom < 0 || g.currentRoom >= zone.rooms.length) return null;
    return zone.rooms[g.currentRoom];
  };

  const checkCollision = (pos: Vec2, radius: number): boolean => {
    const room = getCurrentRoom();
    if (!room) return false;
    for (const wall of room.walls) {
      const closestX = Math.max(wall.x, Math.min(pos.x, wall.x + wall.w));
      const closestY = Math.max(wall.y, Math.min(pos.y, wall.y + wall.h));
      const dx = pos.x - closestX;
      const dy = pos.y - closestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  };

  const isInGaze = (pos: Vec2): boolean => {
    const room = getCurrentRoom();
    if (!room) return false;
    for (const gaze of room.gazes) {
      if (!gaze.active) continue;
      const dx = pos.x - gaze.pos.x;
      const dy = pos.y - gaze.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > gaze.range) continue;
      const angle = Math.atan2(dy, dx);
      let diff = angle - gaze.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < CONFIG.GAZE_ANGLE / 2) {
        // Check wall occlusion
        let blocked = false;
        for (const wall of room.walls) {
          const steps = Math.ceil(dist / 8);
          for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const cx = gaze.pos.x + dx * t;
            const cy = gaze.pos.y + dy * t;
            if (cx >= wall.x && cx <= wall.x + wall.w && cy >= wall.y && cy <= wall.y + wall.h) {
              blocked = true;
              break;
            }
          }
          if (blocked) break;
        }
        if (!blocked) return true;
      }
    }
    return false;
  };

  const enterZone = (zoneIndex: number) => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    g.currentZone = zoneIndex;
    g.currentRoom = 0;
    g.player.zone = g.zones[zoneIndex].name.toLowerCase();
    g.player.pos = { x: 4 * CONFIG.TILE, y: 10 * CONFIG.TILE };
    g.scene = 'zone';
    g.transitioning = true;
    g.transitionAlpha = 1;
    audioRef.current.startMusic(g.player.zone);
    addNotification(`Zona: ${g.zones[zoneIndex].name} - ${g.zones[zoneIndex].theme}`);
  };

  const nextRoom = () => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    const zone = g.zones[g.currentZone];
    if (g.currentRoom < zone.rooms.length - 1) {
      g.currentRoom++;
      g.player.pos = { x: 4 * CONFIG.TILE, y: 10 * CONFIG.TILE };
      g.transitioning = true;
      g.transitionAlpha = 1;
      // Check if boss room
      const room = zone.rooms[g.currentRoom];
      if (room.boss && !room.boss.defeated) {
        g.bossActive = { ...room.boss };
        g.scene = 'boss';
        audioRef.current.playSfx('boss');
      }
    } else {
      // Return to hub
      g.scene = 'hub';
      g.currentZone = -1;
      g.player.pos = { x: 10 * CONFIG.TILE, y: 10 * CONFIG.TILE };
      audioRef.current.startMusic('hub');
      g.transitioning = true;
      g.transitionAlpha = 1;
    }
  };

  const update = (dt: number) => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    g.time += dt;
    g.deltaTime = dt;

    // Transition fade
    if (g.transitioning) {
      g.transitionAlpha -= dt * 2;
      if (g.transitionAlpha <= 0) {
        g.transitionAlpha = 0;
        g.transitioning = false;
      }
    }

    // Notifications
    g.notifications = g.notifications.filter(n => {
      n.timer -= dt;
      return n.timer > 0;
    });

    // Particles
    g.particles = g.particles.filter(p => {
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.life -= dt * 2;
      return p.life > 0;
    });

    if (g.paused || g.scene === 'title') return;

    // Player movement
    if (!g.player.frozen && !g.dialogueState) {
      let dx = 0, dy = 0;
      const keys = keysRef.current;
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) dx -= 1;
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dx += 1;
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) dy -= 1;
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) dy += 1;

      // Touch input
      if (touchRef.current.active) {
        dx = touchDirRef.current.x;
        dy = touchDirRef.current.y;
      }

      // Normalize
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { dx /= len; dy /= len; }

      // Anxiety effects on speed
      let speed = CONFIG.PLAYER_SPEED;
      if (g.player.anxiety >= 60) speed *= 0.8; // Delayed/sluggish
      if (g.player.anxiety >= 90) speed *= 0.5;

      const newPos = {
        x: g.player.pos.x + dx * speed,
        y: g.player.pos.y + dy * speed,
      };

      if (!checkCollision(newPos, g.player.radius)) {
        g.player.pos = newPos;
      } else {
        // Try sliding
        const slideX = { x: g.player.pos.x + dx * speed, y: g.player.pos.y };
        if (!checkCollision(slideX, g.player.radius)) g.player.pos.x = slideX.x;
        const slideY = { x: g.player.pos.x, y: g.player.pos.y + dy * speed };
        if (!checkCollision(slideY, g.player.radius)) g.player.pos.y = slideY.y;
      }

      // Step sound
      if (len > 0 && Math.floor(g.time * 8) % 4 === 0) {
        audioRef.current.playSfx('step');
      }
    }

    // Freeze timer
    if (g.player.frozen) {
      g.player.freezeTimer -= dt;
      if (g.player.freezeTimer <= 0) {
        g.player.frozen = false;
      }
    }

    // Anxiety system
    const room = getCurrentRoom();
    if (room && !room.isRefuge) {
      if (isInGaze(g.player.pos)) {
        let anxietyRate = 8;
        if (g.player.currentMask === 'sorriso') anxietyRate *= 0.6;
        if (g.techniqueActive === 'peggiora_apposta') anxietyRate *= 0.3;
        g.player.anxiety = Math.min(CONFIG.ANXIETY_MAX, g.player.anxiety + anxietyRate * dt);
      }
      // Ruminations increase anxiety
      for (const rum of room.ruminations || []) {
        if (!rum.active) continue;
        const dx = g.player.pos.x - rum.pos.x;
        const dy = g.player.pos.y - rum.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) {
          g.player.anxiety = Math.min(CONFIG.ANXIETY_MAX, g.player.anxiety + 3 * dt);
        }
      }
      // Natural slight increase in open areas
      g.player.anxiety = Math.min(CONFIG.ANXIETY_MAX, g.player.anxiety + 0.5 * dt);
    }

    // Refuge anxiety reduction
    if (room && room.isRefuge) {
      g.player.anxiety = Math.max(0, g.player.anxiety - 15 * dt);
    }

    // Anxiety freeze
    if (g.player.anxiety >= 90 && !g.player.frozen) {
      g.player.frozen = true;
      g.player.freezeTimer = 3;
      audioRef.current.playSfx('freeze');
      addNotification('Blocco d\'ansia! (3 secondi)');
      addParticle(g.player.pos, '#ff4444', 10);
    }

    // Anxiety tunnel vision effect handled in render

    // Gaze sweep
    if (room) {
      for (const gaze of room.gazes) {
        gaze.angle += gaze.sweepSpeed * gaze.sweepDir;
        if (gaze.angle > Math.PI * 2) gaze.angle -= Math.PI * 2;
        if (gaze.angle < 0) gaze.angle += Math.PI * 2;
        // Reverse sweep at limits
        if (Math.random() < 0.005) gaze.sweepDir *= -1;
      }
    }

    // Rumination movement
    if (room) {
      for (const rum of room.ruminations || []) {
        if (!rum.active) continue;
        // Follow player slowly
        const dx = g.player.pos.x - rum.pos.x;
        const dy = g.player.pos.y - rum.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          rum.pos.x += (dx / dist) * rum.speed;
          rum.pos.y += (dy / dist) * rum.speed;
        }
        // Dissolve with techniques
        if (g.techniqueActive === 'osservatore_esterno') {
          rum.speed *= 0.95;
          if (dist < 100) {
            rum.active = false;
            addParticle(rum.pos, '#44ff88', 5);
            audioRef.current.playSfx('relief');
          }
        }
        if (g.techniqueActive === 'appuntamento_paura') {
          rum.speed *= 0.9;
          if (dist < 80) {
            rum.active = false;
            g.player.anxiety = Math.max(0, g.player.anxiety - 5);
            addParticle(rum.pos, '#00ffcc', 5);
            audioRef.current.playSfx('relief');
          }
        }
      }
    }

    // Technique timer
    if (g.techniqueActive) {
      g.techniqueTimer -= dt;
      if (g.techniqueTimer <= 0) {
        g.techniqueActive = null;
      }
    }

    // Check exits
    if (room && g.scene === 'zone') {
      for (const exit of room.exits) {
        if (g.player.pos.x > exit.x && g.player.pos.x < exit.x + exit.w &&
            g.player.pos.y > exit.y && g.player.pos.y < exit.y + exit.h) {
          nextRoom();
          break;
        }
      }
    }

    // Boss update
    if (g.scene === 'boss' && g.bossActive) {
      updateBoss(dt);
    }

    // Camera follow
    g.camera.x = g.player.pos.x - (canvasRef.current?.width || 800) / 2;
    g.camera.y = g.player.pos.y - (canvasRef.current?.height || 600) / 2;

    // Save at refuge
    if (room && room.isRefuge && g.player.anxiety < 10) {
      // Auto-save hint
    }
  };

  const updateBoss = (dt: number) => {
    if (!gameRef.current || !gameRef.current.bossActive) return;
    const g = gameRef.current;
    const boss: Boss = g.bossActive!;
    boss.timer += dt;
    const pSpeed = Math.sqrt(g.player.vel.x * g.player.vel.x + g.player.vel.y * g.player.vel.y);

    const p = g.player;
    const dx = p.pos.x - boss.pos.x;
    const dy = p.pos.y - boss.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (boss.pattern) {
      case 'wave': // Acqua - advance when player moves forward
        // Boss advances, player must keep moving forward (toward exit)
        if (boss.timer % 3 < 1.5) {
          boss.pos.x += Math.sin(boss.timer * 2) * 0.5;
          boss.pos.y += 0.3;
        }
        // Player moving right (toward exit) damages boss
        if (p.vel.x > 0 || keysRef.current.has('ArrowRight') || keysRef.current.has('d')) {
          boss.hp -= 15 * dt;
          addParticle(boss.pos, '#4488ff', 2);
        }
        // If player retreats, boss heals
        if (keysRef.current.has('ArrowLeft') || keysRef.current.has('a')) {
          boss.hp = Math.min(boss.maxHp, boss.hp + 5 * dt);
          p.anxiety = Math.min(100, p.anxiety + 5 * dt);
        }
        break;

      case 'chase': // Fuoco - faster when player flees
        const speed = dist < 200 ? 2.5 : 1.5;
        if (dist > 0) {
          boss.pos.x += (dx / dist) * speed * (dist > 100 ? 1 : -0.5);
          boss.pos.y += (dy / dist) * speed * (dist > 100 ? 1 : -0.5);
        }
        // Standing still near boss damages it (acceptance)
        if (dist < 80 && Math.abs(p.vel.x) < 0.1 && Math.abs(p.vel.y) < 0.1) {
          boss.hp -= 20 * dt;
          p.anxiety = Math.min(100, p.anxiety + 3 * dt);
          addParticle(boss.pos, '#ff8844', 3);
        }
        // Fleeing makes boss faster
        if (dist < 150 && (Math.abs(p.vel.x) > 1 || Math.abs(p.vel.y) > 1)) {
          boss.pos.x += (dx / dist) * 1;
          boss.pos.y += (dy / dist) * 1;
        }
        break;

      case 'swarm': // Vento - multiple fears, accept one
        // Boss spawns mini-ruminations
        if (boss.timer % 2 < 0.1) {
          const room = getCurrentRoom();
          if (room) {
            room.ruminations?.push({
              pos: { x: boss.pos.x + (Math.random() - 0.5) * 100, y: boss.pos.y + (Math.random() - 0.5) * 100 },
              vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
              radius: 12, active: true,
              text: ['"E se..."', '"Troppo tardi"', '"Non puoi"', '"Fallimento"'][Math.floor(Math.random() * 4)],
              life: 999, speed: 0.5 + Math.random() * 0.5,
            });
          }
        }
        // Using technique clears them
        if (g.techniqueActive === 'appuntamento_paura') {
          boss.hp -= 25 * dt;
          const room = getCurrentRoom();
          if (room) room.ruminations = (room.ruminations || []).filter(r => r.active);
        }
        // Moving through them damages boss
        const activeRums = getCurrentRoom()?.ruminations?.filter(r => r.active) || [];
        for (const rum of activeRums) {
          const rdx = p.pos.x - rum.pos.x;
          const rdy = p.pos.y - rum.pos.y;
          if (Math.sqrt(rdx * rdx + rdy * rdy) < 30) {
            boss.hp -= 10 * dt;
            rum.active = false;
            addParticle(rum.pos, '#88ff44', 3);
          }
        }
        break;

      case 'panic': // Tuono - chaos, accept the feeling
        // Boss pulses and creates visual chaos
        boss.radius = 40 + Math.sin(boss.timer * 5) * 15;
        // Not fighting = winning
        if (dist < boss.radius + 30) {
          p.anxiety = Math.min(100, p.anxiety + 8 * dt);
        }
        // Standing calm near boss
        if (dist < 150 && pSpeed < 1) {
          boss.hp -= 15 * dt;
          p.anxiety = Math.max(0, p.anxiety - 2 * dt);
          addParticle(boss.pos, '#aa44ff', 2);
        }
        // Technique helps
        if (g.techniqueActive === 'osservatore_esterno') {
          boss.hp -= 20 * dt;
          boss.radius = Math.max(20, boss.radius - 1);
        }
        break;

      case 'dialogue': // Foglie - conversation boss
        // Boss requires player to stay close and "open up"
        if (dist < 80) {
          boss.hp -= 10 * dt;
          p.authenticity = Math.min(100, p.authenticity + 2 * dt);
          addParticle(boss.pos, '#44ff88', 2);
        }
        if (dist > 150) {
          boss.hp = Math.min(boss.maxHp, boss.hp + 5 * dt);
        }
        // Technique accelerates
        if (g.techniqueActive) {
          boss.hp -= 15 * dt;
        }
        break;

      case 'mirror': // Terra - give up perfection
        // Boss mirrors player, player must stop trying to match
        boss.pos.x = p.pos.x + Math.cos(boss.timer) * 60;
        boss.pos.y = p.pos.y + Math.sin(boss.timer) * 60;
        // Standing still = accepting imperfection
        if (pSpeed < 0.5) {
          boss.hp -= 20 * dt;
          p.authenticity = Math.min(100, p.authenticity + 3 * dt);
          addParticle(boss.pos, '#ffaa44', 3);
        }
        // Moving fast = trying to be perfect, boss heals
        if (pSpeed > 2) {
          boss.hp = Math.min(boss.maxHp, boss.hp + 10 * dt);
        }
        break;

      case 'audience': // Spirito - speak despite the gaze
        // Multiple gazes all around, player must keep moving forward
        boss.pos.y = 12 * CONFIG.TILE + Math.sin(boss.timer) * 50;
        // Keep moving forward (right)
        if (keysRef.current.has('ArrowRight') || keysRef.current.has('d') || touchDirRef.current.x > 0.5) {
          boss.hp -= 15 * dt;
          p.courage = Math.min(100, p.courage + 2 * dt);
          addParticle(boss.pos, '#ffffff', 2);
        }
        // Standing still increases anxiety
        if (pSpeed < 0.3) {
          p.anxiety = Math.min(100, p.anxiety + 5 * dt);
        }
        // All techniques combined help
        if (g.techniqueActive) {
          boss.hp -= 10 * dt;
          p.anxiety = Math.max(0, p.anxiety - 3 * dt);
        }
        break;
    }

    // Boss defeat
    if (boss.hp <= 0) {
      boss.defeated = true;
      g.zones[g.currentZone].bossDefeated = true;
      g.scene = 'zone';
      g.bossActive = null;
      audioRef.current.playSfx('victory');
      
      // Award technique
      const zone = g.zones[g.currentZone];
      if (!p.techniques.includes(zone.techniqueReward)) {
        p.techniques.push(zone.techniqueReward);
        addNotification(`Nuova tecnica: ${getTechniqueName(zone.techniqueReward)}`);
      }
      p.courage = Math.min(100, p.courage + 15);
      
      // Check for ending
      if (g.currentZone === 6) {
        g.scene = 'ending';
      }
      
      saveGame();
      addNotification('Boss superato! Il coraggio cresce.');
    }

    // Boss dialogue
    if (boss.dialogue.length > 0 && Math.floor(boss.timer) % 5 === 0 && Math.floor(boss.timer) !== Math.floor(boss.timer - dt)) {
      const idx = Math.floor(boss.timer / 5) % boss.dialogue.length;
      addNotification(boss.dialogue[idx]);
    }
  };

  const getTechniqueName = (tech: string): string => {
    const names: Record<string, string> = {
      'peggiora_apposta': 'Peggiora Apposta',
      'missione_imbarazzo': 'Missione Imbarazzo',
      'appuntamento_paura': 'Appuntamento con la Paura',
      'osservatore_esterno': 'Osservatore Esterno',
      'alleato': 'Alleanza',
      'autenticita': 'Autenticità',
      'accettazione': 'Accettazione',
    };
    return names[tech] || tech;
  };

  const activateTechnique = (tech: string) => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    if (!g.player.techniques.includes(tech)) return;
    
    g.techniqueActive = tech;
    g.techniqueTimer = 8; // 8 seconds
    audioRef.current.playSfx('technique');
    addNotification(`Tecnica attivata: ${getTechniqueName(tech)}`);
    addParticle(g.player.pos, '#00ffcc', 10);
    
    // Specific effects
    switch(tech) {
      case 'peggiora_apposta':
        g.player.anxiety = Math.max(0, g.player.anxiety - 10);
        g.player.courage = Math.min(100, g.player.courage + 5);
        break;
      case 'appuntamento_paura':
        // Stop ruminations temporarily
        const room = getCurrentRoom();
        if (room) {
          room.ruminations?.forEach(r => { r.speed *= 0.1; });
        }
        break;
      case 'osservatore_esterno':
        g.player.anxiety = Math.max(0, g.player.anxiety - 15);
        break;
    }
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas || !gameRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = gameRef.current;
    const W = canvas.width;
    const H = canvas.height;

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    switch (g.scene) {
      case 'title': renderTitle(ctx, W, H); break;
      case 'hub': renderHub(ctx, W, H); break;
      case 'zone': renderZone(ctx, W, H); break;
      case 'boss': renderBossScene(ctx, W, H); break;
      case 'ending': renderEnding(ctx, W, H); break;
    }

    // HUD
    if (g.scene !== 'title') renderHUD(ctx, W, H);

    // Notifications
    renderNotifications(ctx, W, H);

    // Transition overlay
    if (g.transitionAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${g.transitionAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Anxiety tunnel vision
    if (g.player.anxiety >= 30 && g.scene !== 'title') {
      const intensity = (g.player.anxiety - 30) / 70;
      const gradient = ctx.createRadialGradient(W/2, H/2, W * 0.2, W/2, H/2, W * 0.6);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(20,0,0,${intensity * 0.6})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    }

    // Anxiety tremor at 60+
    if (g.player.anxiety >= 60 && g.scene !== 'title') {
      const tremor = (g.player.anxiety - 60) / 40 * 2;
      ctx.save();
      ctx.translate(Math.sin(g.time * 20) * tremor, Math.cos(g.time * 15) * tremor);
      ctx.restore();
    }
  };

  const renderTitle = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    
    // Background - starfield
    ctx.fillStyle = '#0a0a2a';
    ctx.fillRect(0, 0, W, H);
    
    // Stars
    for (let i = 0; i < 100; i++) {
      const x = (i * 137.5 + g.time * 10) % W;
      const y = (i * 97.3 + Math.sin(g.time + i) * 5) % H;
      const brightness = 0.3 + Math.sin(g.time * 2 + i) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${brightness})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Venus silhouette
    const gradient = ctx.createRadialGradient(W/2, H * 0.6, 50, W/2, H * 0.6, 200);
    gradient.addColorStop(0, 'rgba(100,60,120,0.4)');
    gradient.addColorStop(0.5, 'rgba(60,30,80,0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaccff';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText('CLOMP', W/2, H * 0.25);
    ctx.font = '20px Georgia, serif';
    ctx.fillStyle = '#88aadd';
    ctx.fillText('e il Mondo di Venere', W/2, H * 0.32);

    // Subtitle
    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = '#6688aa';
    ctx.fillText('Un viaggio nell\'ansia sociale', W/2, H * 0.40);
    ctx.fillText('Il coraggio non è l\'assenza di paura,', W/2, H * 0.46);
    ctx.fillText('ma la capacità di proseguire nonostante essa.', W/2, H * 0.50);

    // Floating clocks
    for (let i = 0; i < 5; i++) {
      const cx = W * 0.2 + i * W * 0.15;
      const cy = H * 0.65 + Math.sin(g.time + i * 1.5) * 15;
      drawClock(ctx, cx, cy, 15 + i * 3, g.time + i);
    }

    // Start prompt
    const alpha = 0.5 + Math.sin(g.time * 3) * 0.5;
    ctx.fillStyle = `rgba(170,200,255,${alpha})`;
    ctx.font = '18px Georgia, serif';
    ctx.fillText('Premi qualsiasi tasto o tocca per iniziare', W/2, H * 0.82);

    // Credits
    ctx.fillStyle = '#445566';
    ctx.font = '11px Georgia, serif';
    ctx.fillText('WASD/Frecce per muoversi · 1-4 per le tecniche · M per la mappa · S per salvare', W/2, H * 0.92);
    ctx.fillText('Un gioco sulla comprensione dell\'ansia sociale', W/2, H * 0.96);
  };

  const drawClock = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(170,200,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    
    // Hands
    const hourAngle = (time * 0.1) % (Math.PI * 2);
    const minAngle = (time * 0.5) % (Math.PI * 2);
    
    ctx.strokeStyle = 'rgba(170,200,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(hourAngle) * r * 0.5, y + Math.sin(hourAngle) * r * 0.5);
    ctx.stroke();
    
    ctx.strokeStyle = 'rgba(200,220,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(minAngle) * r * 0.7, y + Math.sin(minAngle) * r * 0.7);
    ctx.stroke();
    ctx.restore();
  };

  const renderHub = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    
    // Hub background
    const gradient = ctx.createRadialGradient(W/2, H/2, 50, W/2, H/2, W);
    gradient.addColorStop(0, '#1a2a4a');
    gradient.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // La Conchiglia - spiral structure
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.strokeStyle = 'rgba(100,150,200,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.1) {
      const r = 20 + a * 15;
      const x = Math.cos(a + g.time * 0.1) * r;
      const y = Math.sin(a + g.time * 0.1) * r;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Zone portals
    const zoneNames = ['Acqua', 'Fuoco', 'Vento', 'Tuono', 'Foglie', 'Terra', 'Spirito'];
    const zoneColors = [CONFIG.COLORS.acqua, CONFIG.COLORS.fuoco, CONFIG.COLORS.vento, CONFIG.COLORS.tuono, CONFIG.COLORS.foglie, CONFIG.COLORS.terra, CONFIG.COLORS.spirito];
    
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const radius = Math.min(W, H) * 0.32;
      const px = W/2 + Math.cos(angle) * radius;
      const py = H/2 + Math.sin(angle) * radius;
      
      // Portal glow
      const portalGrad = ctx.createRadialGradient(px, py, 5, px, py, 30);
      portalGrad.addColorStop(0, zoneColors[i]);
      portalGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = portalGrad;
      ctx.fillRect(px - 30, py - 30, 60, 60);
      
      // Portal circle
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fillStyle = zoneColors[i] + '88';
      ctx.fill();
      ctx.strokeStyle = zoneColors[i];
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Check if player is near
      const dx = g.player.pos.x - (px - g.camera.x);
      const dy = g.player.pos.y - (py - g.camera.y);
      // Zone labels
      ctx.fillStyle = '#aaccff';
      ctx.font = '11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(zoneNames[i], px, py + 32);
      
      if (g.zones[i].bossDefeated) {
        ctx.fillStyle = '#44ff88';
        ctx.fillText('✓', px, py + 5);
      }
    }

    // Center - Adult Clomp
    const acX = W/2;
    const acY = H/2;
    ctx.beginPath();
    ctx.arc(acX, acY, 20, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.adultClomp;
    ctx.fill();
    ctx.strokeStyle = '#6688cc';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Light wand
    ctx.beginPath();
    ctx.moveTo(acX + 15, acY - 15);
    ctx.lineTo(acX + 25, acY - 25);
    ctx.strokeStyle = '#aaddff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Light
    const lightGrad = ctx.createRadialGradient(acX + 25, acY - 25, 2, acX + 25, acY - 25, 15);
    lightGrad.addColorStop(0, 'rgba(170,220,255,0.8)');
    lightGrad.addColorStop(1, 'rgba(170,220,255,0)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(acX + 10, acY - 40, 30, 30);

    ctx.fillStyle = '#88aadd';
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Adulto-Clomp', acX, acY + 35);
    ctx.fillText('«Il coraggio è proseguire nonostante la paura.»', acX, acY + 50);

    // Instructions
    ctx.fillStyle = '#668899';
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Avvicinati a un portale per entrare nella zona', W/2, H - 40);
    ctx.fillText('Usa WASD o le frecce per muoverti', W/2, H - 25);

    // Player in hub
    drawPlayer(ctx, W/2, H/2 + 80);

    // Check portal proximity
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
      const radius = Math.min(W, H) * 0.32;
      const px = W/2 + Math.cos(angle) * radius;
      const py = H/2 + Math.sin(angle) * radius;
      
      const playerScreenX = g.player.pos.x + g.camera.x;
      const playerScreenY = g.player.pos.y + g.camera.y;
      // Actually let's use a simpler approach - keyboard shortcuts for zones
    }
  };

  const renderZone = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    const room = getCurrentRoom();
    if (!room) return;

    ctx.save();
    ctx.translate(-g.camera.x, -g.camera.y);

    // Floor
    const zoneColor = g.currentZone >= 0 ? g.zones[g.currentZone].color : CONFIG.COLORS.hub;
    ctx.fillStyle = zoneColor + '33';
    ctx.fillRect(g.camera.x, g.camera.y, W, H);

    // Grid pattern
    ctx.strokeStyle = zoneColor + '11';
    ctx.lineWidth = 0.5;
    const startX = Math.floor(g.camera.x / CONFIG.TILE) * CONFIG.TILE;
    const startY = Math.floor(g.camera.y / CONFIG.TILE) * CONFIG.TILE;
    for (let x = startX; x < g.camera.x + W; x += CONFIG.TILE) {
      ctx.beginPath(); ctx.moveTo(x, g.camera.y); ctx.lineTo(x, g.camera.y + H); ctx.stroke();
    }
    for (let y = startY; y < g.camera.y + H; y += CONFIG.TILE) {
      ctx.beginPath(); ctx.moveTo(g.camera.x, y); ctx.lineTo(g.camera.x + W, y); ctx.stroke();
    }

    // Walls
    for (const wall of room.walls) {
      const wallGrad = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y + wall.h);
      wallGrad.addColorStop(0, CONFIG.COLORS.wall);
      wallGrad.addColorStop(1, '#223344');
      ctx.fillStyle = wallGrad;
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = zoneColor + '44';
      ctx.lineWidth = 1;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }

    // Refuge indicator
    if (room.isRefuge) {
      ctx.fillStyle = 'rgba(68,170,136,0.1)';
      ctx.fillRect(g.camera.x, g.camera.y, W, H);
      ctx.fillStyle = '#44aa88';
      ctx.font = '14px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('~ Rifugio ~', g.player.pos.x, g.player.pos.y - 40);
      ctx.font = '11px Georgia, serif';
      ctx.fillText('Premi S per salvare', g.player.pos.x, g.player.pos.y - 25);
    }

    // Exits
    for (const exit of room.exits) {
      ctx.fillStyle = 'rgba(100,200,255,0.3)';
      ctx.fillRect(exit.x, exit.y, exit.w, exit.h);
      ctx.strokeStyle = '#66ccff';
      ctx.lineWidth = 2;
      ctx.strokeRect(exit.x, exit.y, exit.w, exit.h);
      // Arrow
      ctx.fillStyle = '#66ccff';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('→', exit.x + exit.w/2, exit.y + exit.h/2 + 5);
    }

    // Gaze cones
    for (const gaze of room.gazes) {
      if (!gaze.active) continue;
      ctx.save();
      ctx.translate(gaze.pos.x, gaze.pos.y);
      ctx.rotate(gaze.angle);
      
      // Cone
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, gaze.range, -CONFIG.GAZE_ANGLE/2, CONFIG.GAZE_ANGLE/2);
      ctx.closePath();
      const coneGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, gaze.range);
      coneGrad.addColorStop(0, 'rgba(255,200,0,0.3)');
      coneGrad.addColorStop(1, 'rgba(255,200,0,0)');
      ctx.fillStyle = coneGrad;
      ctx.fill();
      ctx.restore();

      // Eye/NPC
      ctx.beginPath();
      ctx.arc(gaze.pos.x, gaze.pos.y, gaze.radius, 0, Math.PI * 2);
      ctx.fillStyle = gaze.type === 'eye' ? '#ffcc00' : '#cc88ff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Pupil
      ctx.beginPath();
      ctx.arc(gaze.pos.x + Math.cos(gaze.angle) * 4, gaze.pos.y + Math.sin(gaze.angle) * 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
    }

    // Ruminations
    for (const rum of room.ruminations || []) {
      if (!rum.active) continue;
      // Ghostly text cloud
      const alpha = 0.5 + Math.sin(g.time * 3 + rum.pos.x) * 0.3;
      ctx.fillStyle = `rgba(170,68,255,${alpha})`;
      ctx.font = '10px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(rum.text, rum.pos.x, rum.pos.y);
      
      // Ghostly circle
      ctx.beginPath();
      ctx.arc(rum.pos.x, rum.pos.y, rum.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(170,68,255,${alpha * 0.2})`;
      ctx.fill();
    }

    // Clocks
    for (const clock of g.clocks) {
      if (clock.active) {
        drawClock(ctx, clock.pos.x, clock.pos.y, 12, clock.time + g.time);
      }
    }

    // Particles
    for (const p of g.particles) {
      ctx.fillStyle = p.color + Math.floor(p.life * 255).toString(16).padStart(2, '0');
      ctx.fillRect(p.pos.x - p.size/2, p.pos.y - p.size/2, p.size, p.size);
    }

    // Player
    drawPlayer(ctx, g.player.pos.x, g.player.pos.y);

    // Technique active visual
    if (g.techniqueActive) {
      ctx.beginPath();
      ctx.arc(g.player.pos.x, g.player.pos.y, 40 + Math.sin(g.time * 5) * 5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,255,204,${0.3 + Math.sin(g.time * 3) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  };

  const renderBossScene = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    if (!g.bossActive) return;
    const boss = g.bossActive;

    ctx.save();
    ctx.translate(-g.camera.x, -g.camera.y);

    // Background
    const zoneColor = g.currentZone >= 0 ? g.zones[g.currentZone].color : '#1a1a3a';
    ctx.fillStyle = zoneColor + '44';
    ctx.fillRect(g.camera.x, g.camera.y, W, H);

    // Boss
    const bossAlpha = 0.6 + Math.sin(g.time * 3) * 0.3;
    
    // Boss aura
    const auraGrad = ctx.createRadialGradient(boss.pos.x, boss.pos.y, boss.radius * 0.5, boss.pos.x, boss.pos.y, boss.radius * 2);
    auraGrad.addColorStop(0, `rgba(255,34,102,${bossAlpha * 0.3})`);
    auraGrad.addColorStop(1, 'rgba(255,34,102,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(boss.pos.x - boss.radius * 2, boss.pos.y - boss.radius * 2, boss.radius * 4, boss.radius * 4);

    // Boss body
    ctx.beginPath();
    ctx.arc(boss.pos.x, boss.pos.y, boss.radius, 0, Math.PI * 2);
    const bossGrad = ctx.createRadialGradient(boss.pos.x, boss.pos.y, 0, boss.pos.x, boss.pos.y, boss.radius);
    bossGrad.addColorStop(0, CONFIG.COLORS.boss);
    bossGrad.addColorStop(1, '#440022');
    ctx.fillStyle = bossGrad;
    ctx.fill();
    ctx.strokeStyle = '#ff4488';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Boss name
    ctx.fillStyle = '#ff88aa';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(boss.name, boss.pos.x, boss.pos.y - boss.radius - 20);

    // Boss HP bar
    const hpW = 100;
    const hpH = 8;
    const hpX = boss.pos.x - hpW/2;
    const hpY = boss.pos.y - boss.radius - 10;
    ctx.fillStyle = '#330011';
    ctx.fillRect(hpX, hpY, hpW, hpH);
    ctx.fillStyle = '#ff2266';
    ctx.fillRect(hpX, hpY, hpW * (boss.hp / boss.maxHp), hpH);
    ctx.strokeStyle = '#ff4488';
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpW, hpH);

    // Player
    drawPlayer(ctx, g.player.pos.x, g.player.pos.y);

    // Particles
    for (const p of g.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.pos.x - p.size/2, p.pos.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Boss instructions
    ctx.fillStyle = '#aaccff';
    ctx.font = '12px Georgia, serif';
    ctx.textAlign = 'center';
    const instructions = getBossInstructions(boss.pattern);
    ctx.fillText(instructions, W/2, H - 30);
  };

  const getBossInstructions = (pattern: string): string => {
    switch(pattern) {
      case 'wave': return 'Continua ad andare avanti! Non arretrare! (→ o D)';
      case 'chase': return 'Fermati e accetta lo sguardo. Non fuggire.';
      case 'swarm': return 'Attraversa le paure! Usa Appuntamento con la Paura (2)!';
      case 'panic': return 'Non combattere. Respira. Resta calmo vicino al cuore.';
      case 'dialogue': return 'Avvicinati e resta. Apri il tuo cuore.';
      case 'mirror': return 'Fermati. Accetta l\'imperfezione. Non cercare di essere perfetto.';
      case 'audience': return 'Parla comunque. Vai avanti nonostante gli sguardi. (→ o D)';
      default: return '';
    }
  };

  const renderEnding = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    
    // Starfield
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 200; i++) {
      const x = (i * 137.5) % W;
      const y = (i * 97.3) % H;
      const b = 0.3 + Math.sin(g.time + i) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Determine ending
    const { anxiety, courage, authenticity } = g.player;
    let endingText = '';
    let endingTitle = '';

    if (authenticity >= 70 && courage >= 60) {
      endingTitle = 'Finale: Luce Propria';
      endingText = `Clomp ha imparato che l'ansia non è un nemico da sconfiggere,\nma una compagna di viaggio da comprendere.\n\nCon coraggio ${Math.floor(courage)} e autenticità ${Math.floor(authenticity)},\nha scoperto che la propria voce ha valore.\n\nNon ha eliminato la paura.\nHa smesso di organizzarci la vita attorno.\n\n«Il pubblico delle stelle continua a osservare.\nMa ora Clomp parla comunque.»`;
    } else if (courage >= 50) {
      endingTitle = 'Finale: Il Coraggioso';
      endingText = `Clomp ha trovato il coraggio di affrontare il mondo.\nNon senza paura, ma insieme ad essa.\n\nCoraggio: ${Math.floor(courage)}\nAutenticità: ${Math.floor(authenticity)}\n\n«Ogni passo avanti è una vittoria.\nOgni giorno è una scelta.\nE Clomp sceglie di proseguire.»`;
    } else {
      endingTitle = 'Finale: Il Viaggio Continua';
      endingText = `Il viaggio di Clomp non è finito.\nMa ha fatto il primo passo più importante:\nha affrontato il suo mondo interiore.\n\nCoraggio: ${Math.floor(courage)}\nAutenticità: ${Math.floor(authenticity)}\n\n«La strada è lunga, ma non è più solo.\nAdulto-Clomp cammina accanto a lui.\nE le stelle, forse, sorridono.»`;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaccff';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText(endingTitle, W/2, H * 0.15);

    ctx.fillStyle = '#8899bb';
    ctx.font = '14px Georgia, serif';
    const lines = endingText.split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, W/2, H * 0.28 + i * 22);
    });

    // Adult Clomp and Clomp together
    const baseY = H * 0.78;
    drawPlayer(ctx, W/2 - 20, baseY);
    // Adult Clomp
    ctx.beginPath();
    ctx.arc(W/2 + 20, baseY, 14, 0, Math.PI * 2);
    ctx.fillStyle = CONFIG.COLORS.adultClomp;
    ctx.fill();
    ctx.strokeStyle = '#6688cc';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#668899';
    ctx.font = '12px Georgia, serif';
    ctx.fillText('Premi R per ricominciare', W/2, H * 0.92);
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const g = gameRef.current!;
    
    // Body
    ctx.beginPath();
    ctx.arc(x, y, g.player.radius, 0, Math.PI * 2);
    
    // Rainbow shirt effect
    const shirtGrad = ctx.createLinearGradient(x - 12, y - 12, x + 12, y + 12);
    shirtGrad.addColorStop(0, '#ff4444');
    shirtGrad.addColorStop(0.2, '#ffaa00');
    shirtGrad.addColorStop(0.4, '#44ff44');
    shirtGrad.addColorStop(0.6, '#4444ff');
    shirtGrad.addColorStop(0.8, '#aa44ff');
    shirtGrad.addColorStop(1, '#ff44aa');
    ctx.fillStyle = shirtGrad;
    ctx.fill();
    
    // Blue hair
    ctx.beginPath();
    ctx.arc(x, y - 6, 8, Math.PI, 0);
    ctx.fillStyle = '#4488ff';
    ctx.fill();
    // Long hair strands
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 4);
    ctx.quadraticCurveTo(x - 12, y + 8, x - 10, y + 14);
    ctx.strokeStyle = '#3366dd';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 4);
    ctx.quadraticCurveTo(x + 12, y + 8, x + 10, y + 14);
    ctx.stroke();

    // Face
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffddbb';
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 3, y - 2, 2, 2);
    ctx.fillRect(x + 1, y - 2, 2, 2);

    // Frozen effect
    if (g.player.frozen) {
      ctx.strokeStyle = `rgba(255,100,100,${0.5 + Math.sin(g.time * 10) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, g.player.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Mask indicator
    if (g.player.currentMask) {
      ctx.fillStyle = '#ffffff88';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      const maskEmoji: Record<string, string> = {
        'sorriso': '😊', 'silenzio': '🤫', 'ombra': '🌑', 'risata': '😄', 'specchio': '🪞'
      };
      ctx.fillText(maskEmoji[g.player.currentMask] || '?', x, y - 20);
    }
  };

  const renderHUD = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    const g = gameRef.current!;
    const padding = 10;
    const barW = 120;
    const barH = 12;

    // Background panel
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 55);

    // Anxiety bar
    ctx.fillStyle = '#333';
    ctx.fillRect(padding, padding, barW, barH);
    const anxietyColor = g.player.anxiety > 60 ? '#ff4444' : g.player.anxiety > 30 ? '#ffaa44' : '#44aa44';
    ctx.fillStyle = anxietyColor;
    ctx.fillRect(padding, padding, barW * (g.player.anxiety / 100), barH);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Ansia: ${Math.floor(g.player.anxiety)}`, padding + 2, padding + 10);

    // Courage bar
    ctx.fillStyle = '#333';
    ctx.fillRect(padding, padding + 16, barW, barH);
    ctx.fillStyle = CONFIG.COLORS.courage;
    ctx.fillRect(padding, padding + 16, barW * (g.player.courage / 100), barH);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(padding, padding + 16, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Coraggio: ${Math.floor(g.player.courage)}`, padding + 2, padding + 26);

    // Authenticity bar
    ctx.fillStyle = '#333';
    ctx.fillRect(padding, padding + 32, barW, barH);
    ctx.fillStyle = CONFIG.COLORS.authenticity;
    ctx.fillRect(padding, padding + 32, barW * (g.player.authenticity / 100), barH);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(padding, padding + 32, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Autenticità: ${Math.floor(g.player.authenticity)}`, padding + 2, padding + 42);

    // Techniques
    ctx.fillStyle = '#aaccff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Tecniche:', padding + barW + 20, padding + 10);
    g.player.techniques.forEach((tech, i) => {
      const isActive = g.techniqueActive === tech;
      ctx.fillStyle = isActive ? '#00ffcc' : '#668899';
      ctx.fillText(`${i + 1}: ${getTechniqueName(tech)}${isActive ? ' ✓' : ''}`, padding + barW + 20, padding + 24 + i * 13);
    });

    // Zone info
    if (g.currentZone >= 0) {
      ctx.fillStyle = '#aaccff';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${g.zones[g.currentZone].name} - Stanza ${g.currentRoom + 1}/${g.zones[g.currentZone].rooms.length}`, W - padding, padding + 12);
    } else if (g.scene === 'hub') {
      ctx.fillStyle = '#aaccff';
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText('La Conchiglia (Hub)', W - padding, padding + 12);
      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#668899';
      ctx.fillText('Premi 1-7 per entrare nelle zone', W - padding, padding + 26);
    }

    // Technique timer
    if (g.techniqueActive) {
      ctx.fillStyle = '#00ffcc';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Tecnica attiva: ${Math.ceil(g.techniqueTimer)}s`, W - padding, padding + 42);
    }

    // Mobile controls hint
    if ('ontouchstart' in window) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H - 80, W, 80);
      ctx.fillStyle = '#668899';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tocca e trascina per muoverti', W/2, H - 60);
      ctx.fillText('Tap destro: tecnica | Tap sinistro: azione', W/2, H - 45);
    }
  };

  const renderNotifications = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    if (!gameRef.current) return;
    const g = gameRef.current;
    g.notifications.forEach((n, i) => {
      const alpha = Math.min(1, n.timer);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;
      const textW = ctx.measureText(n.text).width + 20;
      ctx.fillRect(W/2 - textW/2, H - 100 - i * 30, textW, 24);
      ctx.fillStyle = `rgba(170,200,255,${alpha})`;
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, W/2, H - 84 - i * 30);
    });
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const g = gameRef.current;
    if (!g) return;

    // Initialize audio on first interaction
    if (!audioRef.current.ctx) audioRef.current.init();

    if (g.scene === 'title') {
      g.scene = 'hub';
      g.player.pos = { x: 400, y: 400 };
      audioRef.current.init();
      audioRef.current.startMusic('hub');
      return;
    }

    if (g.scene === 'ending') {
      if (e.key === 'r' || e.key === 'R') {
        gameRef.current = initGame();
      }
      return;
    }

    // Save
    if (e.key === 's' || e.key === 'S') {
      saveGame();
    }

    // Techniques (1-4)
    if (e.key >= '1' && e.key <= '7') {
      const idx = parseInt(e.key) - 1;
      if (g.scene === 'hub') {
        // Enter zone
        if (idx < 7) enterZone(idx);
      } else if (g.player.techniques[idx]) {
        activateTechnique(g.player.techniques[idx]);
      }
    }

    // Pause
    if (e.key === 'Escape' || e.key === 'p') {
      g.paused = !g.paused;
    }
  }, [initGame, saveGame]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key);
  }, []);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (!audioRef.current.ctx) audioRef.current.init();
    const g = gameRef.current;
    if (!g) return;
    
    if (g.scene === 'title') {
      g.scene = 'hub';
      g.player.pos = { x: 400, y: 400 };
      audioRef.current.startMusic('hub');
      return;
    }

    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    touchRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      active: true,
    };
    
    // Calculate direction from player
    const playerScreenX = g.player.pos.x + g.camera.x;
    const playerScreenY = g.player.pos.y + g.camera.y;
    const dx = touchRef.current.x - playerScreenX;
    const dy = touchRef.current.y - playerScreenY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 10) {
      touchDirRef.current = { x: dx / len, y: dy / len };
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || !gameRef.current) return;
    const rect = canvas.getBoundingClientRect();
    touchRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      active: true,
    };
    
    const g = gameRef.current;
    const playerScreenX = g.player.pos.x + g.camera.x;
    const playerScreenY = g.player.pos.y + g.camera.y;
    const dx = touchRef.current.x - playerScreenX;
    const dy = touchRef.current.y - playerScreenY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 10) {
      touchDirRef.current = { x: dx / len, y: dy / len };
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchRef.current.active = false;
    touchDirRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    gameRef.current = initGame();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    const gameLoop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      
      update(dt);
      render();
      
      frameRef.current = requestAnimationFrame(gameLoop);
    };
    
    lastTimeRef.current = performance.now();
    frameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(frameRef.current);
      audioRef.current.stopMusic();
    };
  }, [initGame, handleKeyDown, handleKeyUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
        background: '#0a0a1a',
        touchAction: 'none',
        cursor: 'default',
      }}
    />
  );
}
