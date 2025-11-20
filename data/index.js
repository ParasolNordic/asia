/**
 * Cloudflare Workers AI Proxy
 * 
 * Käyttää Cloudflare Workers AI:ta (Meta Llama)
 * EI tarvitse Anthropic API-avainta!
 */

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Tuotannossa: vaihda omaan domainiin
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      // Parse request body
      const body = await request.json();
      
      // Validate required fields
      if (!body.messages) {
        return new Response(JSON.stringify({
          error: 'Missing required field: messages'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Rakenna prompti Workers AI:lle
      // Workers AI käyttää yksinkertaisempaa formaattia
      let fullPrompt = '';
      
      // System prompt (jos on)
      if (body.system) {
        fullPrompt += body.system + '\n\n';
      }
      
      // Messages
      for (const msg of body.messages) {
        if (msg.role === 'user') {
          fullPrompt += msg.content + '\n';
        }
      }

      // Kutsu Cloudflare Workers AI:ta
      const aiResponse = await env.AI.run(
        '@cf/meta/llama-3.1-8b-instruct', // Meta Llama -malli
        {
          messages: body.messages,
          max_tokens: body.max_tokens || 150,
          temperature: 0.7
        }
      );

      // Muotoile vastaus Claude API -yhteensopivaksi
      const response = {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: aiResponse.response || aiResponse.result?.response || ''
          }
        ],
        model: '@cf/meta/llama-3.1-8b-instruct',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: Math.round(fullPrompt.length / 4), // Arvio
          output_tokens: Math.round((aiResponse.response?.length || 0) / 4)
        }
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Workers AI error:', error);
      
      return new Response(JSON.stringify({
        error: 'AI processing error',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  },
};
