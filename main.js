/**
 * Main Entry Point - Käynnistää pelin
 */

import GameEngine from './game_engine.js';

// Globaali game engine -instanssi
let gameEngine = null;

/**
 * Käynnistä peli
 */
async function startGame() {
  try {
    // Näytä loading
    const container = document.getElementById('game-container');
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <h2>Ladataan peliä...</h2>
        <p>Tämä voi kestää hetken.</p>
      </div>
    `;

    // Luo ja alusta game engine
    gameEngine = new GameEngine();
    await gameEngine.initialize();

    // Aloita peli
    gameEngine.start();

    // Debug-komennot konsoliin
    window.game = gameEngine;
    console.log('💡 Debug-komennot:');
    console.log('   game.logStatus()     - Näytä tila');
    console.log('   game.diplomacy.logState() - Näytä diplomatiatieto');
    
  } catch (error) {
    console.error('❌ Game startup failed:', error);
    
    const container = document.getElementById('game-container');
    container.innerHTML = `
      <div class="error-message">
        <h2>❌ Virhe pelin käynnistyksessä</h2>
        <p>${error.message}</p>
        <p><strong>Varmista että:</strong></p>
        <ul style="text-align: left; margin: 1rem 0;">
          <li>Kaikki JSON-tiedostot ovat <code>data/</code> -hakemistossa</li>
          <li>Palvelin on käynnissä (esim. <code>python -m http.server</code>)</li>
          <li>Selain tukee ES6 modules</li>
        </ul>
        <button class="choice-button" onclick="location.reload()">
          Yritä uudelleen
        </button>
      </div>
    `;
  }
}

/**
 * Debug-paneelin toggle
 */
function setupDebugToggle() {
  const toggleBtn = document.getElementById('toggle-debug');
  const debugPanel = document.getElementById('debug-panel');
  
  if (toggleBtn && debugPanel) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      debugPanel.classList.toggle('hidden');
    });
  }
}

/**
 * DOMContentLoaded - Aloita kun sivu on ladattu
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎮 Mannerheimin Aasian-matka');
  console.log('📅 Versio: 1.0.0');
  console.log('');
  
  setupDebugToggle();
  startGame();
});

/**
 * Error handling
 */
window.addEventListener('error', (e) => {
  console.error('Uncaught error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
