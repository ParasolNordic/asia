/**
 * AI Worker - Simplified & Safe Version
 * Käsittelee AI-dialogit ilman kaatumista
 */

class AIWorker {
  constructor(gameData, config = {}) {
    this.npcs = gameData.npcs;
    this.npcRules = gameData.npcRules;
    this.moduleDiplomacy = gameData.moduleDiplomacy;
    this.aiProfiles = gameData.aiProfiles;
    this.proxyURL = config.proxyURL || 'https://ai-proxy.arkisto-kaksi.workers.dev';
    this.npcCache = new Map();
    
    console.log('🤖 AIWorker initialized');
  }

  /**
   * Hakee NPC:n profiilin TURVALLISESTI
   */
  getNPCProfile(npcId) {
    // Cache
    if (this.npcCache.has(npcId)) {
      return this.npcCache.get(npcId);
    }
    
    // Yksinkertainen fallback-profiili jos data puuttuu
    const fallbackProfile = {
      id: npcId,
      name: this.getNPCName(npcId),
      personality: 'formal, diplomatic',
      goals: ['complete mission'],
      background: 'Russian official',
      role: 'Official'
    };
    
    try {
      // Yritä hakea oikea profiili npcs.json:sta
      let baseProfile = null;
      
      if (this.npcs) {
        // npcs.json käyttää suomenkielisiä kenttiä
        const npcList = Array.isArray(this.npcs) ? this.npcs : (this.npcs.npcs || []);
        const npcData = npcList.find(n => {
          if (!n || !n.Nimi) return false;
          // Tarkista nimi-match (case-insensitive)
          const name = n.Nimi.toLowerCase();
          const searchName = this.getNPCName(npcId).toLowerCase();
          return name === searchName || name.includes(searchName) || searchName.includes(name);
        });
        
        if (npcData) {
          // Muunna suomenkieliset kentät englanniksi
          baseProfile = {
            id: npcId,
            name: npcData.Nimi,
            background: npcData.Tausta || fallbackProfile.background,
            motivations: npcData.Motivaatiot || '',
            speech_style: npcData.Puhetapa || fallbackProfile.personality,
            role: npcData.Rooli || fallbackProfile.role,
            phase: npcData.Kasikirjoituksen_vaihe || ''
          };
        }
      }
      
      // AI profile viesti4.json:sta
      let aiProfile = null;
      if (this.aiProfiles) {
        const aiList = Array.isArray(this.aiProfiles) ? this.aiProfiles : (this.aiProfiles.npcs || []);
        aiProfile = aiList.find(n => n && n.id === npcId);
      }
      
      // Yhdistä profiilit
      const profile = {
        ...fallbackProfile,
        ...(baseProfile || {}),
        ...(aiProfile || {})
      };
      
      // Varmista että personality on olemassa (yhteensopivuus AI-promptien kanssa)
      if (!profile.personality && profile.speech_style) {
        profile.personality = profile.speech_style;
      }
      
      console.log(`✅ Loaded NPC profile for ${npcId}:`, profile.name);
      
      this.npcCache.set(npcId, profile);
      return profile;
      
    } catch (error) {
      console.warn(`⚠️ Could not load full profile for ${npcId}, using fallback:`, error);
      this.npcCache.set(npcId, fallbackProfile);
      return fallbackProfile;
    }
  }

  /**
   * Palauttaa NPC:n nimen ID:n perusteella
   */
  getNPCName(npcId) {
    const names = {
      'trepov': 'Dmitri Trepov',
      'kf': 'K.F.',
      'samsonov': 'Samsonov',
      'sokolov': 'Sokolov'
    };
    return names[npcId] || npcId.toUpperCase();
  }

  /**
   * Aloita dialogi NPC:n kanssa
   */
  async startDialogue(npcId, sceneId, playerText, gameState) {
    console.log(`💬 Starting dialogue with ${npcId}`);
    
    try {
      const npcProfile = this.getNPCProfile(npcId);
      
      // Rakenna prompt
      const systemPrompt = this.buildSystemPrompt(npcProfile, sceneId, gameState);
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: playerText }
      ];
      
      // Kutsu AI:ta
      const response = await fetch(this.proxyURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          max_tokens: 150
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ AI request failed:', response.status, errorText);
        throw new Error(`AI request failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📦 Raw AI response:', data);
      console.log('📝 Content array:', data.content);
      console.log('📄 First content:', data.content?.[0]);
      console.log('✍️ Text:', data.content?.[0]?.text);
      
      const npcResponse = data.content?.[0]?.text || 'Anteeksi, en voi vastata juuri nyt.';
      console.log('💬 Final NPC response:', npcResponse);
      
      // Analysoi diplomatiavaikutukset
      const analysis = this.analyzePlayerResponse(playerText, npcProfile);
      const diplomacyEffects = this.calculateDiplomacyEffects(npcId, sceneId, analysis);
      
      console.log('✅ AI dialogue completed');
      
      return {
        npcProfile,
        npcResponse,
        analysis,
        diplomacyEffects
      };
      
    } catch (error) {
      console.error('❌ AI dialogue error:', error);
      throw error;
    }
  }

  /**
   * Rakenna system prompt NPC:lle
   */
  buildSystemPrompt(npcProfile, sceneId, gameState) {
    // Käytä npcs.json motivaatioita jos saatavilla
    const motivations = npcProfile.motivations || (npcProfile.goals ? npcProfile.goals.join(', ') : 'complete mission');
    const personality = npcProfile.personality || npcProfile.speech_style || 'formal, diplomatic';
    
    const prompt = `You are ${npcProfile.name}, a character in a historical game set in 1906.

BACKGROUND: ${npcProfile.background || 'Russian official'}

MOTIVATIONS: ${motivations}

SPEECH STYLE: ${personality}

${npcProfile.role ? `ROLE: ${npcProfile.role}` : ''}

IMPORTANT RULES:
1. Stay in character as ${npcProfile.name}
2. Respond in Finnish (suomi)
3. Keep response under 100 words
4. Be historically appropriate (1906 Russia/Central Asia)
5. Reference the player's statement directly
6. Match the speech style described above

The player is Mannerheim, a Russian officer on a secret mission to Central Asia.

Current situation: Scene ${sceneId}

Respond naturally and in character.`;

    return prompt;
  }
1. Stay in character as ${npcProfile.name}
2. Respond in Finnish (suomi)
3. Keep response under 100 words
4. Be historically appropriate (1906 Russia/Central Asia)
5. Reference the player's statement directly

The player is Mannerheim, a Russian officer on a secret mission to Central Asia.

Current situation: Scene ${sceneId}

Respond naturally and in character.`;

    return prompt;
  }

  /**
   * Analysoi pelaajan vastaus
   */
  analyzePlayerResponse(playerText, npcProfile) {
    const lowerText = playerText.toLowerCase();
    
    // Yksinkertainen sentiment-analyysi
    const analysis = {
      tone: 'neutral',
      themes: [],
      sentiment: 'neutral'
    };
    
    // Avainsana-analyysi
    if (lowerText.match(/velvollisuus|käsky|palvelen|totelen/)) {
      analysis.tone = 'loyal';
      analysis.themes.push('duty');
      analysis.sentiment = 'positive';
    } else if (lowerText.match(/epäilen|huolestun|riski|vaara/)) {
      analysis.tone = 'concerned';
      analysis.themes.push('caution');
      analysis.sentiment = 'neutral';
    } else if (lowerText.match(/kieltäy|en voi|vastustan/)) {
      analysis.tone = 'defiant';
      analysis.themes.push('resistance');
      analysis.sentiment = 'negative';
    } else if (lowerText.match(/ymmärrän|selvä|hyvä/)) {
      analysis.tone = 'cooperative';
      analysis.themes.push('agreement');
      analysis.sentiment = 'positive';
    }
    
    return analysis;
  }

  /**
   * Laske diplomatiavaikutukset
   */
  calculateDiplomacyEffects(npcId, sceneId, analysis) {
    const effects = {
      factions: {},
      npc_opinions: {},
      player_traits: {}
    };
    
    // Yksinkertainen logiikka
    const opinionChange = {
      'positive': 5,
      'neutral': 0,
      'negative': -5
    };
    
    effects.npc_opinions[npcId] = opinionChange[analysis.sentiment] || 0;
    
    // Tone-based faction changes
    if (analysis.tone === 'loyal') {
      effects.factions.RUS = 3;
    } else if (analysis.tone === 'defiant') {
      effects.player_traits.INDEPENDENCE = 3;
    } else if (analysis.tone === 'concerned') {
      effects.player_traits.NEUTRALITY = 2;
    }
    
    return effects;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIWorker;
}

export default AIWorker;
