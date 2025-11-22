/**
 * Scene Renderer - Renderöi kohtaukset ja käyttöliittymän
 */

class SceneRenderer {
  constructor(scenesData) {
    this.scenes = scenesData.scenes;
    this.container = document.getElementById('game-container');
    this.choicesContainer = document.getElementById('choices-container');
    this.debugPanel = document.getElementById('debug-panel');
  }

  /**
   * Renderöi kohtaus
   */
  renderScene(sceneId) {
    const scene = this.scenes.find(s => s.scene_id === sceneId);
    
    if (!scene) {
      console.error(`Scene not found: ${sceneId}`);
      this.container.innerHTML = `<p class="error">Scene not found: ${sceneId}</p>`;
      return;
    }

    // Renderöi HTML
    this.container.innerHTML = scene.html;

    // Aseta värit
    if (scene.color_palette) {
      document.documentElement.style.setProperty('--primary-color', scene.color_palette.primary);
      document.documentElement.style.setProperty('--secondary-color', scene.color_palette.secondary);
      document.documentElement.style.setProperty('--accent-color', scene.color_palette.accent);
    }

    // Logita ambient
    if (scene.ambient) {
      console.log(`🎭 Scene: ${scene.name}`);
      console.log(`   Mood: ${scene.ambient.mood}`);
      if (scene.ambient.sound) {
        console.log(`   Sounds: ${scene.ambient.sound.join(', ')}`);
      }
    }

    // Scroll to top
    this.container.scrollTop = 0;
  }

  /**
   * Renderöi valinnat
   */
  renderChoices(choices, onChoiceCallback) {
    if (!choices || choices.length === 0) {
      this.choicesContainer.innerHTML = '';
      return;
    }

    const html = choices.map((choice, index) => `
      <button class="choice-button" data-choice-id="${choice.id}" data-index="${index}">
        <span class="choice-number">${index + 1}</span>
        <span class="choice-text">${choice.display_text || choice.text || choice.id}</span>
      </button>
    `).join('');

    this.choicesContainer.innerHTML = html;

    // Lisää event listenerit
    const buttons = this.choicesContainer.querySelectorAll('.choice-button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const choiceId = button.dataset.choiceId;
        onChoiceCallback(choiceId);
      });
    });

    // Keyboard navigation (1, 2, 3...)
    document.addEventListener('keydown', (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= choices.length) {
        const choice = choices[num - 1];
        onChoiceCallback(choice.id);
      }
    }, { once: true });
  }

  /**
   * Renderöi AI-dialogin UI
   */
  renderAIDialogue(npcId, npcName, onSubmitCallback, onSkipCallback) {
    const html = `
      <div class="ai-dialogue-container">
        <h3>Keskustele: ${npcName}</h3>
        <textarea id="ai-input" placeholder="Kirjoita vastauksesi..." rows="4"></textarea>
        <div class="ai-buttons">
          <button id="ai-submit" class="choice-button primary">Lähetä</button>
          <button id="ai-skip" class="choice-button secondary">Ohita keskustelu</button>
        </div>
        <p class="ai-hint">💡 Vihje: Kirjoita muutama lause. Vastauksesi vaikuttaa diplomatiaan.</p>
      </div>
    `;

    this.choicesContainer.innerHTML = html;

    // Event listenerit
    document.getElementById('ai-submit').addEventListener('click', () => {
      const text = document.getElementById('ai-input').value.trim();
      if (text) {
        onSubmitCallback(text);
      }
    });

    document.getElementById('ai-skip').addEventListener('click', () => {
      onSkipCallback();
    });

    // Enter = submit
    document.getElementById('ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        const text = e.target.value.trim();
        if (text) {
          onSubmitCallback(text);
        }
      }
    });

    // Focus textarea
    document.getElementById('ai-input').focus();
  }

  /**
   * Näytä loading-tila
   */
  showLoading(message = 'Ladataan...') {
    this.choicesContainer.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  /**
   * Näytä NPC:n vastaus
   */
  showNPCResponse(npcName, response) {
    // Tarkista että response on kunnollinen
    if (!response || response === 'undefined') {
      console.error('⚠️ Invalid NPC response:', response);
      response = 'Anteeksi, en voi vastata juuri nyt.';
    }
    
    console.log('💬 Showing NPC response:', npcName, response);
    
    const responseHTML = `
      <div class="npc-response">
        <h4>${npcName}:</h4>
        <p>${response}</p>
      </div>
    `;

    // Lisää responsen scenen jälkeen
    this.container.insertAdjacentHTML('beforeend', responseHTML);

    // Scroll to response
    const responseEl = this.container.querySelector('.npc-response:last-child');
    if (responseEl) {
      responseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Näytä virhe
   */
  showError(message) {
    this.choicesContainer.innerHTML = `
      <div class="error-message">
        <p>❌ ${message}</p>
        <button class="choice-button" onclick="location.reload()">Lataa uudelleen</button>
      </div>
    `;
  }

  /**
   * Päivitä debug-paneeli
   */
  updateDebugPanel(gameState, stats = null) {
    if (!this.debugPanel) return;

    const factionsHTML = Object.entries(gameState.factions)
      .filter(([_, v]) => v !== 0)
      .map(([k, v]) => `<div>${k}: ${v > 0 ? '+' : ''}${v}</div>`)
      .join('');

    const traitsHTML = Object.entries(gameState.player_traits)
      .filter(([_, v]) => v !== 0)
      .map(([k, v]) => `<div>${k}: ${v}</div>`)
      .join('');

    const opinionsHTML = Object.entries(gameState.npc_opinions)
      .map(([k, v]) => `<div>${k}: ${v > 0 ? '+' : ''}${v}</div>`)
      .join('');

    const flagsHTML = Object.keys(gameState.flags)
      .filter(k => gameState.flags[k])
      .map(k => `<div>✓ ${k}</div>`)
      .join('') || '<div class="empty">Ei flageja</div>';

    let statsHTML = '';
    if (stats) {
      statsHTML = `
        <div class="debug-section">
          <h4>AI Kustannukset</h4>
          <div>Pyyntöjä: ${stats.requests}</div>
          <div>Kustannus: $${stats.totalCost.toFixed(4)}</div>
        </div>
      `;
    }

    this.debugPanel.innerHTML = `
      <h3>Debug Info</h3>
      <div class="debug-section">
        <h4>Factions</h4>
        ${factionsHTML || '<div class="empty">Ei muutoksia</div>'}
      </div>
      <div class="debug-section">
        <h4>Player Traits</h4>
        ${traitsHTML || '<div class="empty">Ei muutoksia</div>'}
      </div>
      <div class="debug-section">
        <h4>NPC Opinions</h4>
        ${opinionsHTML}
      </div>
      <div class="debug-section">
        <h4>Flags</h4>
        ${flagsHTML}
      </div>
      ${statsHTML}
    `;
  }

  /**
   * Tyhjennä näyttö
   */
  clear() {
    this.container.innerHTML = '';
    this.choicesContainer.innerHTML = '';
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SceneRenderer;
}

export default SceneRenderer;
