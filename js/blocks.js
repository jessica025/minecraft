'use strict';

const CHUNK_SIZE = 16;
const WORLD_H    = 64;
const SEA_LEVEL  = 12;

const B = {
  AIR:0, GRASS:1, DIRT:2, STONE:3, WOOD:4,
  LEAVES:5, SAND:6, BEDROCK:7, SNOW_GRASS:8,
  GRAVEL:9, PLANKS:10, GLASS:11, SNOW:12,
  COBBLE:13, BRICK:14,
};

const BLOCK_NAME = {
  [B.GRASS]:'草地', [B.DIRT]:'泥土', [B.STONE]:'石头',
  [B.WOOD]:'木头', [B.LEAVES]:'树叶', [B.SAND]:'沙子',
  [B.BEDROCK]:'基岩', [B.SNOW_GRASS]:'雪地', [B.GRAVEL]:'砾石',
  [B.PLANKS]:'木板', [B.GLASS]:'玻璃', [B.SNOW]:'雪',
  [B.COBBLE]:'圆石', [B.BRICK]:'砖块',
};

// Face color indices: top, bottom, N(-z), S(+z), E(+x), W(-x)
const BLOCK_COLORS = {
  [B.GRASS]:    ['#5c9e30','#6b4423','#8b6c42','#8b6c42','#8b6c42','#8b6c42'],
  [B.DIRT]:     ['#8b6c42','#7a5c35','#8b6c42','#8b6c42','#8b6c42','#8b6c42'],
  [B.STONE]:    ['#8a8a8a','#7a7a7a','#888','#888','#8a8a8a','#8a8a8a'],
  [B.WOOD]:     ['#5a3d12','#5a3d12','#7a5a22','#7a5a22','#7a5a22','#7a5a22'],
  [B.LEAVES]:   ['#2a6e1a','#1e5412','#2d7020','#2d7020','#2a6e1a','#2a6e1a'],
  [B.SAND]:     ['#d9c87a','#c8b86a','#d9c87a','#d9c87a','#d9c87a','#d9c87a'],
  [B.BEDROCK]:  ['#2a2a2a','#222','#2a2a2a','#2a2a2a','#2a2a2a','#2a2a2a'],
  [B.SNOW_GRASS]:['#eef0f5','#6b4423','#8b6c42','#8b6c42','#8b6c42','#8b6c42'],
  [B.GRAVEL]:   ['#9a8a7a','#8a7a6a','#9a8a7a','#9a8a7a','#9a8a7a','#9a8a7a'],
  [B.PLANKS]:   ['#b08040','#b08040','#b08040','#b08040','#b08040','#b08040'],
  [B.GLASS]:    ['#a0c8e8','#a0c8e8','#a0c8e8','#a0c8e8','#a0c8e8','#a0c8e8'],
  [B.SNOW]:     ['#eef0f8','#dde0f0','#e8eaf5','#e8eaf5','#e8eaf5','#e8eaf5'],
  [B.COBBLE]:   ['#7a7a7a','#6a6a6a','#7a7a7a','#7a7a7a','#7a7a7a','#7a7a7a'],
  [B.BRICK]:    ['#9a4a3a','#8a3a2a','#9a4a3a','#9a4a3a','#9a4a3a','#9a4a3a'],
};

// Break duration in seconds; Infinity = unbreakable
const BREAK_TIME = {
  [B.GRASS]:0.4, [B.DIRT]:0.4, [B.STONE]:1.5, [B.WOOD]:1.0,
  [B.LEAVES]:0.3, [B.SAND]:0.4, [B.BEDROCK]:Infinity, [B.SNOW_GRASS]:0.4,
  [B.GRAVEL]:0.5, [B.PLANKS]:0.7, [B.GLASS]:0.3, [B.SNOW]:0.3,
  [B.COBBLE]:1.2, [B.BRICK]:1.2,
};

function parseColor(hex) {
  hex = hex.replace('#','');
  if (hex.length===3) hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [
    parseInt(hex.slice(0,2),16)/255,
    parseInt(hex.slice(2,4),16)/255,
    parseInt(hex.slice(4,6),16)/255,
  ];
}
