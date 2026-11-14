const { getAiConfig, AiError } = require('./aiConfig');

/**
 * PIXX Rota System — Voice Service
 * Multilingual Speech-to-Text & Text-to-Speech (English, Urdu, Roman Urdu)
 * Powered by Google Gemini AI API
 */

/**
 * Transcribe spoken audio using Gemini multimodal audio model
 * @param {Buffer} audioBuffer - Binary audio buffer
 * @param {string} mimeType - e.g. 'audio/webm', 'audio/wav', 'audio/mp4', 'audio/ogg'
 * @param {string} languageHint - Optional language hint ('auto', 'en', 'ur', 'ur-PK')
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/webm', languageHint = 'auto') {
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
    throw new AiError('Invalid audio buffer provided for transcription.', 400, 'INVALID_AUDIO');
  }

  // File size validation: minimum 200 bytes, maximum 15MB
  if (audioBuffer.length < 200) {
    throw new AiError('Audio recording is too short or empty. Please speak clearly into the microphone.', 400, 'EMPTY_AUDIO');
  }
  if (audioBuffer.length > 15 * 1024 * 1024) {
    throw new AiError('Audio recording exceeds the 15MB limit. Please keep voice questions concise.', 400, 'AUDIO_TOO_LARGE');
  }

  const config = getAiConfig();
  if (!config.enabled || !config.configured) {
    throw new AiError('AI Voice service is not configured with an active API key.', 503, 'VOICE_NOT_CONFIGURED');
  }

  // Normalize MIME type
  let cleanMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (cleanMime === 'audio/x-wav') cleanMime = 'audio/wav';
  if (!['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/aac'].includes(cleanMime)) {
    cleanMime = 'audio/webm';
  }

  const base64Audio = audioBuffer.toString('base64');
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

  const promptText = `You are a precision speech-to-text transcriber for Pixx Technologies Ltd (UK Bicycle Shop Rota & Workforce System).
Transcribe the spoken audio verbatim.
The speaker may speak in:
- English (e.g. "Who was late at Station shop today?", "Give me Shiva's attendance report in PDF")
- Urdu in Urdu script (e.g. "کیمڈن شاپ میں کل کون لیٹ تھا؟", "شیوہ کی حاضری بتاؤ")
- Roman Urdu (e.g. "Kal Camden shop par kon late aya tha?", "Shiva ki attendance batao", "Kamran ka salary ledger dikhao")
- Mixed Urdu and English (e.g. "Station shop par kitne workers absent thay aaj?")

Important guidelines:
1. Preserve employee names (Shiva, Qasim, Arslan, Sam, Fardin, Shafique, Ash, Ubaid, Anas, Dave, Wali Ullah, Zamad, Shahzad, Ali Bhai, Usman, Sarfraz, Adeel, Jebran, Abdullah, Sajid).
2. Preserve shop names (Station, Camden, Chelsea, Edgware, Southwark, Leebridge).
3. Return ONLY the exact transcribed text. Do NOT add preamble, quotation marks, explanations, notes, or translations.
4. If the audio is completely silent or unintelligible noise, reply with: [UNINTELLIGIBLE]`;

  let lastError = null;
  for (const model of candidateModels) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${config.key}`, {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: cleanMime, data: base64Audio } },
              { text: promptText }
            ]
          }]
        })
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      let text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

      // Clean up common wrapping quotes or markdown backticks
      text = text.replace(/^["'`]+|["'`]+$/g, '').trim();

      if (text === '[UNINTELLIGIBLE]' || !text) {
        throw new AiError("Could not understand your speech. Please speak a little louder and clearer.", 400, 'UNINTELLIGIBLE');
      }

      // Detect language family of transcription
      const isUrduScript = /[\u0600-\u06FF]/.test(text);
      const isRomanUrdu = /\b(ka|ki|ke|ko|tha|thi|the|hoga|hogi|batao|dikhao|karo|aaj|kal|par|mein|kitna|kitne|kon|kisko|unka|uska)\b/i.test(text);
      const detectedLang = isUrduScript ? 'ur' : (isRomanUrdu ? 'ur-Latn' : 'en');

      return {
        success: true,
        text,
        language: detectedLang,
        engine: model
      };
    } catch (err) {
      lastError = err;
      console.warn(`[Voice Transcription ${model} failed]:`, err.message);
    }
  }

  throw new AiError(lastError?.message || 'Speech recognition service temporarily unavailable. Please try again or type your question.', 500, 'TRANSCRIPTION_FAILED');
}

/**
 * Synthesize spoken audio using Gemini TTS
 * @param {string} text - Clean text to speak
 * @param {string} language - 'en', 'ur', or 'ur-Latn'
 */
async function synthesizeSpeech(text, language = 'en') {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError('Text is required for speech synthesis.', 400, 'EMPTY_TEXT');
  }

  const config = getAiConfig();
  if (!config.enabled || !config.configured) {
    return { success: false, fallbackToBrowser: true, message: 'Gemini TTS not configured.' };
  }

  // Strip Markdown, links, and tables from text to ensure smooth pronunciation
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/^[\s*-]+/gm, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 500); // Cap at 500 chars for optimal audio latency

  if (!cleanText) {
    return { success: false, fallbackToBrowser: true, message: 'Text contained no speakable content.' };
  }

  const ttsModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

  for (const model of ttsModels) {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${config.key}`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: cleanText }] }]
        })
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (inlineData && inlineData.data) {
        return {
          success: true,
          audioBase64: inlineData.data,
          mimeType: inlineData.mimeType || 'audio/wav',
          engine: model
        };
      }
    } catch (ttsErr) {
      console.warn(`[TTS ${model} attempt failed]:`, ttsErr.message);
    }
  }

  // Graceful fallback to client browser speech synthesis
  return {
    success: false,
    fallbackToBrowser: true,
    cleanText
  };
}

module.exports = {
  transcribeAudio,
  synthesizeSpeech
};
