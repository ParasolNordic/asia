/**
 * State Machine - Hallinnoi pelin tiloja ja siirtymiä
 */

class StateMachine {
  constructor(stateMachineData) {
    this.states = stateMachineData.states;
    this.currentState = stateMachineData.entry_state;
    this.exitState = stateMachineData.exit_state;
    this.history = [];
  }

  /**
   * Hae nykyinen tila
   */
  getCurrentState() {
    return this.states[this.currentState];
  }

  /**
   * Hae nykyisen tilan ID
   */
  getCurrentStateId() {
    return this.currentState;
  }

  /**
   * Siirry seuraavaan tilaan
   */
  transition(choiceId = null) {
    const state = this.getCurrentState();
    
    if (!state) {
      throw new Error(`State not found: ${this.currentState}`);
    }

    let nextState = null;

    // Scene-tyyppi: etsi valinta
    if (state.type === 'scene' && state.choices) {
      const choice = state.choices.find(c => c.id === choiceId);
      if (choice) {
        nextState = choice.next;
      } else if (!choiceId && state.transitions) {
        // Jos ei valintaa mutta on transitions (esim. Scene 6)
        nextState = state.transitions[0].to;
      }
    }
    
    // Hub-tyyppi: transitiot
    else if (state.type === 'hub' && state.transitions) {
      // Jos ei valintaa, käytä ensimmäistä transitiota (skip)
      if (!choiceId && state.transitions.length > 0) {
        nextState = state.transitions[0].to;
      }
    }
    
    // AI dialogue -tyyppi
    else if (state.type === 'ai_dialogue' && state.transitions) {
      nextState = state.transitions[0].to;
    }
    
    // System-tyyppi
    else if (state.type === 'system' && state.transitions) {
      nextState = state.transitions[0].to;
    }

    if (!nextState) {
      throw new Error(`No valid transition from ${this.currentState} with choice ${choiceId}`);
    }

    // Tallenna historiaan
    this.history.push({
      from: this.currentState,
      to: nextState,
      choice: choiceId,
      timestamp: Date.now()
    });

    // Siirry
    console.log(`🔄 State transition: ${this.currentState} → ${nextState}`);
    this.currentState = nextState;

    return this.getCurrentState();
  }

  /**
   * Onko peli päättynyt?
   */
  isFinished() {
    return this.currentState === this.exitState;
  }

  /**
   * Hae historia
   */
  getHistory() {
    return this.history;
  }

  /**
   * Resetoi tilakone
   */
  reset(entryState) {
    this.currentState = entryState || this.states.entry_state;
    this.history = [];
    console.log('🔄 State machine reset');
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StateMachine;
}

export default StateMachine;
