/**
 * AI Worker - NPC Dialogue Management
 * 
 * Hallinnoi NPC-dialogeja ja soveltaa AI-analyysien perusteella
 * diplomatiavaikutuksia pelitilaan.
 */

import AIClient from './ai_client.js';

class AIWorker {
  constructor(gameData, aiConfig = {}) {
    this.npcs = gameData.npcs; // npcs.json
    this.diplomacyRules = gameData.npcRules; // npc_diplomacy_rules.json
    this.currentModuleDiplomacy = gameData.moduleDiplomacy; // esim. viesti2_corrected.json
    this.aiProfiles = gameData.aiProfiles; // esim. viesti4.json
    
    this.aiClient = new AIClient(aiConfig);
    
    // Cache NPC-profiileja
    this.npcCache = new Map();
  }

  /**
   * Käynnistää AI-dialogin NPC:n kanssa
   * 
   * @param {string} npcId - NPC:n ID
   * @param {string} sceneId - Nykyinen scene
   * @param {string} playerText - Pelaajan vapaa teksti
   * @param {Object} gameState - Pelitila
   * @returns {Promise<Object>} - { npcResponse, diplomacyEffects }
   */
  async startDialogue(npcId, sceneId, playerText, gameState) {
    // 1. Hae NPC:n täysi profiili
    const npcProfile = this.getNPCProfile(npcId);
    
    // 2. Validoi että NPC on sallittu tässä scenessä
    if (!this.isNPCAllowedInScene(npcId, sceneId)) {
      throw new Error(`NPC ${npcId} is not available in scene ${sceneId}`);
    }
    
    // 3. Kutsu AI:ta analysoimaan dialogi
    const aiResult = await this.aiClient.analyzeDialogue(
      npcId,
      npcProfile,
      playerText,
      gameState
    );
    
    // 4. Sovella diplomatiavaikutukset
    const diplomacyEffects = this.calculateDiplomacyEffects(
      npcId,
      sceneId,
      aiResult.analysis,
      gameState
    );
    
    // 5. Tarkista fallback-säännöt
    this.applyFallbackProtections(npcId, diplomacyEffects, gameState);
    
    return {
      npcResponse: aiResult.response,
      analysis: aiResult.analysis,
      diplomacyEffects: diplomacyEffects,
      npcProfile: {
        id: npcId,
        name: npcProfile.name
      }
    };
  }

  /**
   * Hakee NPC:n täyden profiilin (yhdistää npcs.json + viesti4.json)
   */
  getNPCProfile(npcId) {
    // Tarkista cache
    if (this.npcCache.has(npcId)) {
      return this.npcCache.get(npcId);
    }
    
    // Tarkista että data on olemassa
    if (!this.npcs) {
      throw new Error('NPC data not loaded');
    }
    
    // npcs.json voi olla joko { npcs: [...] } tai suoraan [...]
    const npcList = this.npcs.npcs || this.npcs;
    
    if (!Array.isArray(npcList)) {
      throw new Error('NPC data is not in correct format');
    }
    
    // Hae perusprofiili npcs.json:sta
    const baseProfile = npcList.find(n => n.id === npcId);
    if (!baseProfile) {
      throw new Error(`NPC ${npcId} not found in npcs.json`);
    }
    
    // Hae AI Worker -profiili viesti4.json:sta (jos on)
    let aiProfile = null;
    if (this.aiProfiles) {
      const aiProfileList = this.aiProfiles.npcs || this.aiProfiles;
      if (Array.isArray(aiProfileList)) {
        aiProfile = aiProfileList.find(n => n.id === npcId);
      }
    }
    
    // Yhdistä profiilit
    const fullProfile = {
      ...baseProfile,
      ...(aiProfile || {}),
      // AI profile overridaa base profiilin
      persona: aiProfile?.persona || baseProfile.persona,
      alignment_behavior: aiProfile?.alignment_behavior || baseProfile.alignment_behavior,
      dialogue_output_rules: aiProfile?.dialogue_output_rules || baseProfile.dialogue_output_rules
    };
    
    // Tallenna cacheen
    this.npcCache.set(npcId, fullProfile);
    
    return fullProfile;
  }

  /**
   * Tarkistaa onko NPC sallittu tässä scenessä
   */
  isNPCAllowedInScene(npcId, sceneId) {
    const aiProfile = this.aiProfiles.npcs.find(n => n.id === npcId);
    if (!aiProfile) return false;
    
    return aiProfile.scene_scope.includes(sceneId);
  }

  /**
   * Laskee diplomatiavaikutukset AI-analyysin perusteella
   * 
   * Käyttää viesti2.json:n ai_dialogue.effects_mapping -sääntöjä
   */
  calculateDiplomacyEffects(npcId, sceneId, analysis, gameState) {
    // Hae scenen AI-dialogin säännöt
    const scene = this.currentModuleDiplomacy.acts.find(a => a.scene === sceneId);
    if (!scene || !scene.ai_dialogue) {
      console.warn(`No AI dialogue rules for scene ${sceneId}`);
      return this.getDefaultEffects();
    }
    
    const mappings = scene.ai_dialogue.effects_mapping;
    
    // Etsi matching mapping
    for (const mapping of mappings) {
      if (this.matchesCondition(mapping.condition, analysis)) {
        return {
          factions: mapping.effects.factions || {},
          player_traits: mapping.effects.player_traits || {},
          npc_opinions: mapping.effects.npc_opinions || {},
          flags: mapping.effects.flags || {}
        };
      }
    }
    
    // Fallback: neutraali vaikutus
    return this.getDefaultEffects();
  }

  /**
   * Tarkistaa vastaako analyysi ehtoa
   */
  matchesCondition(condition, analysis) {
    for (const [key, expectedValues] of Object.entries(condition)) {
      const actualValue = analysis[key];
      
      if (Array.isArray(expectedValues)) {
        // Tarkista onko actualValue jossain expectedValues-listassa
        const matches = expectedValues.some(expected => {
          if (Array.isArray(actualValue)) {
            return actualValue.some(v => v === expected);
          }
          return actualValue === expected;
        });
        
        if (!matches) return false;
      } else {
        if (actualValue !== expectedValues) return false;
      }
    }
    
    return true;
  }

  /**
   * Soveltaa fallback-suojauksia (ei hard lockeja)
   */
  applyFallbackProtections(npcId, effects, gameState) {
    const npcRules = this.diplomacyRules.npc_rules[npcId];
    if (!npcRules) return;
    
    // Laske ennustettu NPC opinion
    const currentOpinion = gameState.npc_opinions[npcId] || 0;
    const opinionDelta = effects.npc_opinions[npcId] || 0;
    const predictedOpinion = currentOpinion + opinionDelta;
    
    // Jos opinion menisi liian alas, sovella fallback-sääntöä
    const softLockThreshold = -40;
    const hardLockThreshold = -80;
    
    if (predictedOpinion < softLockThreshold) {
      console.warn(`NPC ${npcId} opinion approaching soft lock (${predictedOpinion})`);
      
      if (npcRules.fallback_rule) {
        console.log(`Fallback rule: ${npcRules.fallback_rule}`);
      }
      
      // Lievennä rangaistusta hieman
      if (effects.npc_opinions[npcId] < 0) {
        effects.npc_opinions[npcId] = Math.max(effects.npc_opinions[npcId], -3);
        console.log(`Opinion penalty softened to ${effects.npc_opinions[npcId]}`);
      }
    }
    
    if (predictedOpinion < hardLockThreshold) {
      console.error(`CRITICAL: NPC ${npcId} opinion at hard lock threshold!`);
      // Aktivoi hätäprotokolla: neutraloi kaikki negatiiviset vaikutukset
      if (effects.npc_opinions[npcId] < 0) {
        effects.npc_opinions[npcId] = 0;
      }
    }
  }

  /**
   * Palauttaa oletusarvoiset (neutraalit) vaikutukset
   */
  getDefaultEffects() {
    return {
      factions: {},
      player_traits: {},
      npc_opinions: {},
      flags: {}
    };
  }

  /**
   * Testaa AI Worker -toiminnallisuutta
   */
  async test() {
    console.log('Testing AI Worker...');
    
    // 1. Testaa AI Client
    const connectionOk = await this.aiClient.testConnection();
    if (!connectionOk) {
      console.error('AI Client connection failed');
      return false;
    }
    
    // 2. Testaa NPC-profiilin lataus
    try {
      const trepovProfile = this.getNPCProfile('trepov');
      console.log('Trepov profile loaded:', trepovProfile.name);
    } catch (error) {
      console.error('Failed to load NPC profile:', error);
      return false;
    }
    
    // 3. Testaa mock-dialogi
    try {
      const mockGameState = {
        factions: { RUS: 5, BRIT: 0 },
        player_traits: { INDEPENDENCE: 2, NEUTRALITY: 1 },
        npc_opinions: { trepov: 0 }
      };
      
      const result = await this.startDialogue(
        'trepov',
        '2_trepov_meeting',
        'Olen valmis palvelemaan keisaria.',
        mockGameState
      );
      
      console.log('Test dialogue successful:', {
        response: result.npcResponse.substring(0, 50) + '...',
        effects: result.diplomacyEffects
      });
      
    } catch (error) {
      console.error('Test dialogue failed:', error);
      return false;
    }
    
    console.log('✓ AI Worker test passed');
    return true;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIWorker;
}

export default AIWorker;
