/**
 * AI Client - Cloudflare Workers AI Proxy Integration
 * 
 * Käyttää Cloudflare Workers -proxya kommunikoidakseen Claude API:n kanssa.
 * Proxy-URL: https://ai.miltton-ai.workers.dev
 */

class AIClient {
  constructor(config = {}) {
    this.proxyURL = config.proxyURL || 'https://ai.miltton-ai.workers.dev';
    this.model = config.model || 'claude-sonnet-4-20250514';
    // OPTIMOITU: 400 tokenia ≈ 1000-1200 merkkiä suomeksi (varmistaa kokonaiset lauseet)
    this.maxTokens = config.maxTokens || 400;
    this.timeout = config.timeout || 30000; // 30 seconds
    
    // Token-kustannusten seuranta
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
  }

  /**
   * Analysoi pelaajan vapaan tekstin ja palauttaa strukturoidun vastauksen
   * 
   * @param {string} npcId - NPC:n ID (esim. "trepov")
   * @param {Object} npcProfile - NPC:n profiili viesti4.json:sta
   * @param {string} playerText - Pelaajan kirjoittama teksti
   * @param {Object} gameState - Nykyinen pelitila
   * @returns {Promise<Object>} - { response: string, analysis: Object }
   */
  async analyzeDialogue(npcId, npcProfile, playerText, gameState) {
    const prompt = this.buildPrompt(npcProfile, playerText, gameState);
    
    try {
      const response = await this.callClaude(prompt);
      return this.parseResponse(response);
    } catch (error) {
      console.error('AI Worker error:', error);
      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }

  /**
   * Rakentaa OPTIMOIDUN promptin Claude API:lle
   * 
   * TAVOITE: Minimoida input-tokeneja säilyttäen laatu
   * - Lyhyet, ytimekkäät ohjeet
   * - Vain kriittisin tieto
   * - Max 1000-1200 merkkiä vastaukseen (≈400 tokenia)
   */
  buildPrompt(npcProfile, playerText, gameState) {
    const { persona, dialogue_output_rules } = npcProfile;
    
    // Valitse vain AKTIIVISET alignment-efektit (säästää tokeneja)
    const activeAlignments = this.getActiveAlignments(
      npcProfile.alignment_behavior, 
      gameState
    ).slice(0, 2); // Maksimissaan 2 aktiivista efektiä
    
    // OPTIMOITU SYSTEM PROMPT: ~400 tokenia → ~200 tokenia
    const systemPrompt = `Olet ${npcProfile.name} (${persona.role}) vuonna 1906.

TYYLI: ${persona.speech_style.tone}. ${dialogue_output_rules.style_constraints[0]}

${activeAlignments.length > 0 ? `ASENNE: ${activeAlignments[0].bias[0]}` : ''}

VASTAA JSON-muodossa (max ${dialogue_output_rules.max_sentences_per_reply} lausetta):
{"response":"Vastauksesi suomeksi","analysis":{"overall_tone":["loyal/critical/neutral"],"detected_stance_towards_russia":"positive/neutral/negative","cooperativeness":"high/medium/low"}}

EI markdown-koodilohkoja, vain JSON.`;

    // OPTIMOITU USER PROMPT: ~50 tokenia → ~20 tokenia
    const userPrompt = `Mannerheim: "${playerText}"`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Palauttaa aktiiviset alignment-käytösmallit nykyisen pelitilanteen perusteella
   */
  getActiveAlignments(alignmentBehavior, gameState) {
    const active = [];
    
    for (const behavior of alignmentBehavior) {
      const { condition, effect_on_tone, dialogue_bias } = behavior;
      
      // Tarkista onko condition täyttynyt
      let conditionMet = false;
      
      for (const [key, requirement] of Object.entries(condition)) {
        if (key === 'player_traits') {
          // Tarkista player traits
          for (const [trait, req] of Object.entries(requirement)) {
            if (gameState.player_traits[trait] >= (req.min || 0)) {
              conditionMet = true;
            }
          }
        } else {
          // Tarkista faction
          if (gameState.factions[key] >= (requirement.min || 0)) {
            conditionMet = true;
          }
        }
      }
      
      if (conditionMet) {
        active.push({
          description: `${Object.keys(condition)[0]} condition met`,
          effect: Object.values(effect_on_tone)[0],
          bias: dialogue_bias
        });
      }
    }
    
    return active;
  }

  /**
   * Kutsuu Claude API:a Cloudflare Workers -proxyn kautta
   */
  async callClaude(prompt) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.proxyURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: prompt.systemPrompt,
          messages: [
            {
              role: 'user',
              content: prompt.userPrompt
            }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Seuraa token-käyttöä
      if (data.usage) {
        this.totalInputTokens += data.usage.input_tokens || 0;
        this.totalOutputTokens += data.usage.output_tokens || 0;
        this.requestCount++;
        
        // Logita säännöllisesti
        if (this.requestCount % 10 === 0) {
          this.logTokenUsage();
        }
      }
      
      // Cloudflare Workers palauttaa Claude API:n vastauksen suoraan
      return data.content[0].text;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('AI request timeout');
      }
      throw error;
    }
  }

  /**
   * Parsii Claude API:n vastauksen
   */
  parseResponse(responseText) {
    try {
      // Poista mahdolliset markdown-koodilohkot
      let cleanText = responseText.trim();
      cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      const parsed = JSON.parse(cleanText);
      
      // Validoi rakenne
      if (!parsed.response || !parsed.analysis) {
        throw new Error('Invalid response structure');
      }
      
      if (!parsed.analysis.overall_tone || !parsed.analysis.detected_stance_towards_russia) {
        throw new Error('Missing required analysis fields');
      }
      
      return parsed;
      
    } catch (error) {
      console.error('Failed to parse AI response:', responseText);
      
      // Fallback: palauta neutraali vastaus
      return {
        response: "Anteeksi, en voi nyt keskustella. Jatketaan myöhemmin.",
        analysis: {
          overall_tone: ["neutral"],
          detected_stance_towards_russia: "neutral",
          cooperativeness: "medium"
        }
      };
    }
  }

  /**
   * Testaa yhteyttä AI proxyn
   */
  async testConnection() {
    try {
      const testPrompt = {
        systemPrompt: "You are a test assistant. Respond with valid JSON.",
        userPrompt: 'Say hello in JSON format: {"response": "Hello", "status": "ok"}'
      };
      
      const response = await this.callClaude(testPrompt);
      console.log('AI Proxy connection test successful:', response);
      return true;
    } catch (error) {
      console.error('AI Proxy connection test failed:', error);
      return false;
    }
  }

  /**
   * Logittaa token-käytön ja kustannukset
   */
  logTokenUsage() {
    const inputCost = (this.totalInputTokens / 1000000) * 3.00;  // $3/M tokens
    const outputCost = (this.totalOutputTokens / 1000000) * 15.00; // $15/M tokens
    const totalCost = inputCost + outputCost;
    
    console.log('📊 AI Token Usage Statistics:');
    console.log(`   Requests: ${this.requestCount}`);
    console.log(`   Input tokens: ${this.totalInputTokens.toLocaleString()} ($${inputCost.toFixed(4)})`);
    console.log(`   Output tokens: ${this.totalOutputTokens.toLocaleString()} ($${outputCost.toFixed(4)})`);
    console.log(`   Total cost: $${totalCost.toFixed(4)}`);
    console.log(`   Avg per request: ${Math.round(this.totalInputTokens/this.requestCount)}in + ${Math.round(this.totalOutputTokens/this.requestCount)}out tokens`);
  }

  /**
   * Palauttaa token-käytön tilastot
   */
  getUsageStats() {
    const inputCost = (this.totalInputTokens / 1000000) * 3.00;
    const outputCost = (this.totalOutputTokens / 1000000) * 15.00;
    
    return {
      requests: this.requestCount,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      inputCost: inputCost,
      outputCost: outputCost,
      totalCost: inputCost + outputCost,
      avgInputPerRequest: this.requestCount > 0 ? Math.round(this.totalInputTokens / this.requestCount) : 0,
      avgOutputPerRequest: this.requestCount > 0 ? Math.round(this.totalOutputTokens / this.requestCount) : 0
    };
  }

  /**
   * Resetoi token-tilastot
   */
  resetUsageStats() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIClient;
}

export default AIClient;
