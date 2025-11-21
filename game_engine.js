/**
 * Game Engine - Päämoottori joka yhdistää kaiken
 */

import JSONLoader from './json_loader.js';
import StateMachine from './state_machine.js';
import DiplomacyEngine from './diplomacy_engine.js';
import SceneRenderer from './scene_renderer.js';
import AIClient from './ai_client.js';
import AIWorker from './ai_worker.js';

class GameEngine {
  constructor() {
    this.loader = new JSONLoader('./data');
    this.stateMachine = null;
    this.diplomacy = null;
    this.renderer = null;
    this.aiClient = null;
    this.aiWorker = null;
    
    this.coreData = null;
    this.prologueData = null;
    
    this.isInitialized = false;
  }

  /**
   * Alusta peli
   */
  async initialize() {
    try {
      console.log('🎮 Initializing Mannerheim Game Engine...');

      // Lataa data
      console.log('📦 Loading game data...');
      this.coreData = await this.loader.loadCore();
      this.prologueData = await this.loader.loadPrologue();

      // Alusta moduulit
      console.log('⚙️ Initializing modules...');
      
      this.stateMachine = new StateMachine(this.prologueData.stateMachine);
      this.diplomacy = new DiplomacyEngine(this.coreData, this.prologueData);
      this.renderer = new SceneRenderer(this.prologueData.scenes);
      
      // AI Client ja Worker (valinnainen)
      if (window.AI_PROXY_ENABLED) {
        try {
          console.log('🤖 Initializing AI modules...');
          
          this.aiClient = new AIClient({
            proxyURL: window.AI_PROXY_URL || 'https://ai-proxy.arkisto-kaksi.workers.dev',
            maxTokens: 150
          });
          
          this.aiWorker = new AIWorker({
            npcs: this.coreData.npcs,
            npcRules: this.coreData.npcRules,
            moduleDiplomacy: this.prologueData.diplomacy,
            aiProfiles: this.prologueData.aiProfiles
          }, {
            proxyURL: window.AI_PROXY_URL
          });

          console.log('✅ AI modules initialized');
        } catch (error) {
          console.warn('⚠️ AI modules failed to initialize:', error);
          console.warn('Game will continue without AI dialogues');
          this.aiClient = null;
          this.aiWorker = null;
        }
      } else {
        console.log('ℹ️ AI dialogues disabled (AI_PROXY_ENABLED = false)');
      }

      this.isInitialized = true;
      console.log('✅ Game engine initialized');

      return true;
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Aloita peli
   */
  start() {
    if (!this.isInitialized) {
      throw new Error('Game engine not initialized');
    }

    console.log('🚀 Starting game...');
    this.processCurrentState();
  }

  /**
   * Käsittele nykyinen tila
   */
  processCurrentState() {
    const state = this.stateMachine.getCurrentState();
    const stateId = this.stateMachine.getCurrentStateId();

    console.log(`📍 Current state: ${stateId} (${state.type})`);

    switch (state.type) {
      case 'system':
        this.handleSystemState(state);
        break;
      case 'scene':
        this.handleSceneState(state, stateId);
        break;
      case 'hub':
        this.handleHubState(state, stateId);
        break;
      case 'ai_dialogue':
        this.handleAIDialogueState(state, stateId);
        break;
      default:
        console.error(`Unknown state type: ${state.type}`);
    }

    // Päivitä debug
    this.updateDebug();
  }

  /**
   * Käsittele system-tila
   */
  handleSystemState(state) {
    console.log(`⚙️ System state: ${state.description || 'no description'}`);
    
    // System-tilat siirtyvät automaattisesti
    this.stateMachine.transition();
    this.processCurrentState();
  }

  /**
   * Käsittele scene-tila
   */
  handleSceneState(state, stateId) {
    // Renderöi scene
    this.renderer.renderScene(state.scene_id);

    // Jos ei valintoja (esim. Scene 6), siirry automaattisesti
    if (!state.choices || state.choices.length === 0) {
      setTimeout(() => {
        this.stateMachine.transition();
        this.processCurrentState();
      }, 2000);
      return;
    }

    // Renderöi valinnat
    this.renderer.renderChoices(state.choices, (choiceId) => {
      this.handleChoice(state.scene_id, choiceId);
    });
  }

  /**
   * Käsittele valinta
   */
  handleChoice(sceneId, choiceId) {
    console.log(`✅ Player chose: ${choiceId}`);

    // Sovella diplomatiavaikutukset
    this.diplomacy.applyChoice(sceneId, choiceId);

    // Siirry seuraavaan tilaan
    this.stateMachine.transition(choiceId);
    this.processCurrentState();
  }

  /**
   * Käsittele hub-tila
   */
  handleHubState(state, stateId) {
    const aiDialogue = state.ai_dialogue;

    // Tarkista onko AI käytettävissä
    const aiEnabled = window.AI_PROXY_ENABLED && this.aiWorker && this.aiClient;

    if (!aiDialogue || !aiEnabled) {
      // Ei AI-dialogia tai AI ei käytössä - skipaa automaattisesti
      console.log('⏭️ Skipping AI dialogue (AI not enabled or not available)');
      this.stateMachine.transition();
      this.processCurrentState();
      return;
    }

    // Tarjoa AI-dialogia
    try {
      const npcProfile = this.aiWorker.getNPCProfile(aiDialogue.npc_id);
      
      this.renderer.renderAIDialogue(
        aiDialogue.npc_id,
        npcProfile.name,
        (text) => this.handleAIDialogueSubmit(state, aiDialogue.npc_id, text),
        () => this.handleAIDialogueSkip()
      );
    } catch (error) {
      console.error('Error rendering AI dialogue:', error);
      // Jos virhe, skipaa
      this.stateMachine.transition();
      this.processCurrentState();
    }
  }

  /**
   * Käsittele AI-dialogin lähetys
   */
  async handleAIDialogueSubmit(state, npcId, playerText) {
    try {
      this.renderer.showLoading('AI analysoi vastaustasi...');

      // Hae sceneId (POST-hubista täytyy päätellä)
      const sceneId = state.description?.match(/(\d+_\w+)/)?.[1];
      
      const result = await this.aiWorker.startDialogue(
        npcId,
        sceneId,
        playerText,
        this.diplomacy.getGameState()
      );

      // Näytä NPC:n vastaus
      this.renderer.showNPCResponse(result.npcProfile.name, result.npcResponse);

      // Sovella diplomatiavaikutukset
      this.diplomacy.applyEffects(result.diplomacyEffects);

      // Jatka
      setTimeout(() => {
        this.stateMachine.transition();
        this.processCurrentState();
      }, 3000);

    } catch (error) {
      console.error('AI dialogue error:', error);
      this.renderer.showError('AI-dialogi epäonnistui. Jatketaan ilman sitä.');
      
      setTimeout(() => {
        this.handleAIDialogueSkip();
      }, 2000);
    }
  }

  /**
   * Ohita AI-dialogi
   */
  handleAIDialogueSkip() {
    console.log('⏭️ AI dialogue skipped');
    this.stateMachine.transition();
    this.processCurrentState();
  }

  /**
   * Käsittele AI dialogue -tila
   */
  handleAIDialogueState(state, stateId) {
    // Tämä ei pitäisi tapahtua normaalissa kulkussa
    // (AI-dialogit ovat hubien sisällä)
    console.warn('AI dialogue state reached directly - skipping');
    this.stateMachine.transition();
    this.processCurrentState();
  }

  /**
   * Päivitä debug-paneeli
   */
  updateDebug() {
    const gameState = this.diplomacy.getGameState();
    let stats = null;
    
    if (this.aiClient) {
      stats = this.aiClient.getUsageStats();
    }

    this.renderer.updateDebugPanel(gameState, stats);
  }

  /**
   * Logita tilanne
   */
  logStatus() {
    console.log('=== GAME STATUS ===');
    console.log('State:', this.stateMachine.getCurrentStateId());
    this.diplomacy.logState();
    
    if (this.aiClient) {
      this.aiClient.logTokenUsage();
    }
  }
}

// Export
export default GameEngine;
