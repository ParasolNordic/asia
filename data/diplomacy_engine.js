/**
 * Diplomacy Engine - Laskee ja soveltaa diplomatiavaikutuksia
 */

class DiplomacyEngine {
  constructor(coreData, moduleData) {
    this.diplomacyCore = coreData.diplomacyCore;
    this.npcRules = coreData.npcRules;
    this.npcs = coreData.npcs;
    this.moduleDiplomacy = moduleData.diplomacy;
    
    // Alusta game state
    this.gameState = this.initializeGameState();
  }

  /**
   * Alusta game state
   */
  initializeGameState() {
    const state = {
      factions: {},
      player_traits: {},
      npc_opinions: {},
      flags: {}
    };

    // Alusta fraktiot
    for (const factionId of Object.keys(this.diplomacyCore.factions)) {
      state.factions[factionId] = 0;
    }

    // Alusta player traits
    state.player_traits = {
      INDEPENDENCE: 0,
      NEUTRALITY: 0
    };

    // Alusta NPC opinions
    // Haetaan kaikki NPC:t jotka on prologissa
    const prologueNPCs = ['trepov', 'kf', 'samsonov', 'sokolov'];
    for (const npcId of prologueNPCs) {
      state.npc_opinions[npcId] = 0;
    }

    console.log('✅ Game state initialized');
    return state;
  }

  /**
   * Sovella lineaarisen valinnan vaikutukset
   */
  applyChoice(sceneId, choiceId) {
    const scene = this.moduleDiplomacy.acts.find(a => a.scene === sceneId);
    if (!scene) {
      console.warn(`Scene not found in diplomacy data: ${sceneId}`);
      return;
    }

    let choice = null;
    
    // Etsi valinta joko choices tai linear_choices -listasta
    if (scene.choices) {
      choice = scene.choices.find(c => c.id === choiceId);
    } else if (scene.linear_choices) {
      choice = scene.linear_choices.find(c => c.id === choiceId);
    }

    if (!choice) {
      console.warn(`Choice not found: ${choiceId} in scene ${sceneId}`);
      return;
    }

    this.applyEffects(choice.effects);
    console.log(`✅ Applied choice effects: ${sceneId} / ${choiceId}`);
  }

  /**
   * Sovella AI-dialogin vaikutukset
   */
  applyAIDialogue(sceneId, analysis) {
    const scene = this.moduleDiplomacy.acts.find(a => a.scene === sceneId);
    if (!scene || !scene.ai_dialogue) {
      return;
    }

    const mappings = scene.ai_dialogue.effects_mapping;
    
    // Etsi sopiva mapping
    for (const mapping of mappings) {
      if (this.matchesCondition(mapping.condition, analysis)) {
        this.applyEffects(mapping.effects);
        console.log(`✅ Applied AI dialogue effects: ${sceneId}`);
        return;
      }
    }

    // Ei löytynyt matchaavaa mappingia - ei vaikutusta
    console.log(`ℹ️ No matching AI mapping for ${sceneId}`);
  }

  /**
   * Tarkista vastaako analyysi ehtoa
   */
  matchesCondition(condition, analysis) {
    for (const [key, expectedValues] of Object.entries(condition)) {
      const actualValue = analysis[key];
      
      if (Array.isArray(expectedValues)) {
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
   * Sovella vaikutukset game stateen
   */
  applyEffects(effects) {
    // Factions
    if (effects.factions) {
      for (const [faction, value] of Object.entries(effects.factions)) {
        this.gameState.factions[faction] = 
          (this.gameState.factions[faction] || 0) + value;
        
        // Clamp -100...100
        this.gameState.factions[faction] = Math.max(-100, 
          Math.min(100, this.gameState.factions[faction]));
      }
    }

    // Player traits
    if (effects.player_traits) {
      for (const [trait, value] of Object.entries(effects.player_traits)) {
        this.gameState.player_traits[trait] = 
          (this.gameState.player_traits[trait] || 0) + value;
      }
    }

    // NPC opinions
    if (effects.npc_opinions) {
      for (const [npc, value] of Object.entries(effects.npc_opinions)) {
        this.gameState.npc_opinions[npc] = 
          (this.gameState.npc_opinions[npc] || 0) + value;
        
        // Clamp -100...100
        this.gameState.npc_opinions[npc] = Math.max(-100, 
          Math.min(100, this.gameState.npc_opinions[npc]));
      }
    }

    // Flags
    if (effects.flags) {
      Object.assign(this.gameState.flags, effects.flags);
    }
  }

  /**
   * Hae game state
   */
  getGameState() {
    return this.gameState;
  }

  /**
   * Hae diplomaattinen taso NPC:n kanssa
   */
  getRelationshipTier(npcId) {
    const opinion = this.gameState.npc_opinions[npcId] || 0;
    
    if (opinion <= -50) return 'HOSTILE';
    if (opinion <= -10) return 'COLD';
    if (opinion <= 9) return 'NEUTRAL';
    if (opinion <= 49) return 'FRIENDLY';
    return 'ALLY';
  }

  /**
   * Logita nykyinen tila
   */
  logState() {
    console.log('📊 Current Game State:');
    console.log('Factions:', this.gameState.factions);
    console.log('Player Traits:', this.gameState.player_traits);
    console.log('NPC Opinions:', this.gameState.npc_opinions);
    console.log('Flags:', Object.keys(this.gameState.flags).filter(k => this.gameState.flags[k]));
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiplomacyEngine;
}

export default DiplomacyEngine;
