/**
 * JSON Loader - Lataa pelin data-tiedostot
 */

class JSONLoader {
  constructor(basePath = './data') {
    this.basePath = basePath;
    this.cache = new Map();
  }

  /**
   * Lataa JSON-tiedoston
   */
  async load(path) {
    // Tarkista cache
    if (this.cache.has(path)) {
      console.log(`📦 Loaded from cache: ${path}`);
      return this.cache.get(path);
    }

    try {
      const fullPath = `${this.basePath}/${path}`;
      console.log(`📥 Loading: ${fullPath}`);
      
      const response = await fetch(fullPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Tallenna cacheen
      this.cache.set(path, data);
      console.log(`✅ Loaded successfully: ${path}`);
      
      return data;
    } catch (error) {
      console.error(`❌ Failed to load ${path}:`, error);
      throw error;
    }
  }

  /**
   * Lataa kaikki globaalit JSON:t kerralla
   */
  async loadCore() {
    console.log('🌍 Loading core game data...');
    
    const [diplomacyCore, npcRules, npcs, npcMatrix] = await Promise.all([
      this.load('core/diplomacy_core.json'),
      this.load('core/npc_diplomacy_rules.json'),
      this.load('core/npcs.json'),
      this.load('core/npc_relationship_matrix.json')
    ]);

    return { diplomacyCore, npcRules, npcs, npcMatrix };
  }

  /**
   * Lataa prologin JSON:t
   */
  async loadPrologue() {
    console.log('🎭 Loading prologue data...');
    
    const [diplomacy, stateMachine, aiProfiles, scenes] = await Promise.all([
      this.load('prologue/viesti2_corrected.json'),
      this.load('prologue/viesti3_corrected.json'),
      this.load('prologue/viesti4.json'),
      this.load('prologue/viesti5_corrected.json')
    ]);

    return { diplomacy, stateMachine, aiProfiles, scenes };
  }

  /**
   * Tyhjennä cache
   */
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JSONLoader;
}

export default JSONLoader;
