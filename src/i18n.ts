export type Lang = 'en' | 'zh';

const STORAGE_KEY = 'gridmaze-lang';

const translations = {
  en: {
    ui: {
      title: 'Gridmaze',
      floor: 'Floor {floor} / {max}',
      floorLabel: 'Floor',
      floorClear: 'CLEAR!',
      position: 'Position',
      shieldActive: 'Shield active',
      langButton: '中 / EN',
    },
    overlay: {
      subtitle: 'Escape the dungeon!<br>Reach the <span style="color:#06d6a0">Exit ▨</span> on each floor to descend.<br>Clear all <b>99 floors</b> to win.',
      controlsTitle: '▸ Controls',
      controls: '<b>WASD</b> / <b>Arrow Keys</b> — Move one tile<br><b>Scroll</b> — Zoom · <b>Right-drag</b> — Rotate view<br><b>Swipe</b> on mobile to move',
      tileTypesTitle: '▸ Tile Types',
      dismiss: 'Click anywhere to begin',
    },
    legend: {
      title: 'Tile Types',
      exit: 'Exit',
      empty: 'Empty',
      wall: 'Wall',
      reset: 'Reset',
      resetEffect: '→start',
      teleport: 'Teleport',
      randomMap: 'Random',
      randomMapEffect: 'reshuffle',
      compass: 'Compass',
      compassEffect: '→exit',
      scan: 'Scan',
      scanEffect: 'all',
      shield: 'Shield',
      shieldEffect: 'block 1',
    },
    log: {
      cannotMove: 'Cannot move there.',
      moveTo: 'Move to ({x}, {y}) — {tile}',
      escaped: 'You escaped the dungeon!',
      descended: 'Descended to Floor {floor} / {max}!',
      shieldAbsorbed: 'Shield absorbed the effect!',
      sentBack: 'Sent back to start!',
      teleported: 'Teleported to ({x}, {y})!',
      dungeonShifts: 'The dungeon shifts around you...',
      exitLocated: 'Exit located at ({x}, {y})!',
      scanned: 'Scanned entire floor!',
      gainedShield: 'Gained a shield! Next hazard will be blocked.',
      debug: 'Debug: at ({x},{y}) moving={moving} floor={floor}',
      proximity: [
        'You feel a warm breeze... the exit is near.',
        'A faint glow emanates from nearby.',
        'The air feels different here. The exit is close.',
      ],
    },
    tileLabels: {
      [0]: '',        // Empty
      [1]: '↺',       // Reset
      [2]: '↗',       // Teleport
      [3]: '?',       // RandomMap
      [4]: '⌖',       // Compass
      [5]: '◎',       // Scan
      [6]: '◈',       // Shield
      [7]: 'EX',      // Exit
      [8]: '',        // Wall
      [9]: '',        // Start
    },
    tileNames: {
      empty: 'Empty',
      reset: 'Reset',
      teleport: 'Teleport',
      randomMap: 'Random Map',
      compass: 'Compass',
      scan: 'Scan',
      shield: 'Shield',
      exit: 'Exit!',
      start: 'Start',
      unknown: '?',
    },
  },
  zh: {
    ui: {
      title: 'Gridmaze',
      floor: '第 {floor} / {max} 层',
      floorLabel: '楼层',
      floorClear: '通关！',
      position: '位置',
      shieldActive: '护盾生效中',
      langButton: 'EN / 中',
    },
    overlay: {
      subtitle: '逃离迷宫！<br>抵达每层的 <span style="color:#06d6a0">出口 ▨</span> 向下深入。<br>通关全部 <b>99 层</b> 即可获胜。',
      controlsTitle: '▸ 操作方式',
      controls: '<b>WASD</b> / <b>方向键</b> — 移动一格<br><b>滚轮</b> — 缩放 · <b>右键拖拽</b> — 旋转视角<br>手机上 <b>滑动</b> 移动',
      tileTypesTitle: '▸ 地砖类型',
      dismiss: '点击任意位置开始',
    },
    legend: {
      title: '地砖类型',
      exit: '出口',
      empty: '空地',
      wall: '墙壁',
      reset: '回起点',
      resetEffect: '→起点',
      teleport: '传送',
      randomMap: '随机地图',
      randomMapEffect: '重洗牌',
      compass: '指南针',
      compassEffect: '→出口',
      scan: '扫描',
      scanEffect: '全部',
      shield: '护盾',
      shieldEffect: '挡 1 次',
    },
    log: {
      cannotMove: '无法移动到那里。',
      moveTo: '移动到 ({x}, {y}) — {tile}',
      escaped: '你逃出了迷宫！',
      descended: '已抵达第 {floor} / {max} 层！',
      shieldAbsorbed: '护盾抵消了效果！',
      sentBack: '被送回起点！',
      teleported: '传送到了 ({x}, {y})！',
      dungeonShifts: '迷宫在你周围变幻……',
      exitLocated: '出口位于 ({x}, {y})！',
      scanned: '扫描了整层！',
      gainedShield: '获得护盾！下一次危险效果将被阻挡。',
      debug: '调试：位于 ({x},{y}) 移动中={moving} 层数={floor}',
      proximity: [
        '你感到一阵暖风……出口就在附近。',
        '附近散发出微弱的光芒。',
        '这里的空气不一样。出口很近了。',
      ],
    },
    tileLabels: {
      [0]: '',    // Empty
      [1]: '回',  // Reset
      [2]: '传',  // Teleport
      [3]: '乱',  // RandomMap
      [4]: '指',  // Compass
      [5]: '扫',  // Scan
      [6]: '盾',  // Shield
      [7]: '出',  // Exit
      [8]: '',    // Wall
      [9]: '',    // Start
    },
    tileNames: {
      empty: '空地',
      reset: '回起点',
      teleport: '传送',
      randomMap: '随机地图',
      compass: '指南针',
      scan: '扫描',
      shield: '护盾',
      exit: '出口！',
      start: '起点',
      unknown: '?',
    },
  },
};

let currentLang: Lang = 'en';

function detectDefaultLang(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function getLang(): Lang {
  return currentLang;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  applyTranslations();
}

export function init(): Lang {
  let saved: Lang | null = null;
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'en' || raw === 'zh') saved = raw;
  }
  currentLang = saved ?? detectDefaultLang();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, currentLang);
  }
  applyTranslations();
  return currentLang;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = translations[currentLang] as any;
  const parts = key.split('.');
  let value: any = dict;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return key;
    value = value[part];
  }
  if (typeof value !== 'string') return key;

  if (params) {
    return value.replace(/\{([^{}]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  }
  return value;
}

export function applyTranslations(): void {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });
}

export function getTileLabel(type: number): string {
  return translations[currentLang].tileLabels[type as keyof typeof translations.en.tileLabels] ?? '';
}

export function getTileName(key: keyof typeof translations.en.tileNames): string {
  return translations[currentLang].tileNames[key] ?? key;
}

export function getProximityMessage(index: number): string {
  const msgs = translations[currentLang].log.proximity;
  return msgs[index % msgs.length];
}

/**
 * Update tile labels in dungeon data to match current language.
 * Call after setLang() when language changes at runtime.
 */
export function refreshTileLabels(tiles: { type: number; label: string }[][]): void {
  for (const row of tiles) {
    for (const tile of row) {
      // Only update non-numeric special-tile labels; numbers and 'EX' are language-independent
      if (tile.type >= 1 && tile.type <= 7) {
        tile.label = getTileLabel(tile.type);
      }
    }
  }
}
