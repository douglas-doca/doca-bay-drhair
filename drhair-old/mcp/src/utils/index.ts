// src/utils/index.ts (additions)
// ============================================
// Novos exports para refactoring
// ============================================

export { resolveLidPhone, saveLidMapping, registerLidPhone, stripSuffix } from "./lid-resolver.js";
export { getSetting, upsertSetting, getDefaultHumanizerConfig, splitIntoBubbles, SETTINGS_KEYS } from "./settings-helper.js";
