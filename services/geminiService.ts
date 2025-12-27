
import { GoogleGenAI, Type } from "@google/genai";
import { AnimationScene } from "../types";

export class GeminiService {
  private static getAI() {
    // Mencipta instans baharu setiap kali untuk memastikan API Key yang dipilih (via openSelectKey) digunakan.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  static async analyzeHero(base64Images: string[]): Promise<string> {
    const ai = this.getAI();
    const parts: any[] = base64Images.map(img => {
      const base64Data = img.split(',')[1];
      const mimeType = img.split(';')[0].split(':')[1] || 'image/png';
      return { inlineData: { data: base64Data, mimeType } };
    });

    parts.push({ 
      text: "ACT AS A CHARACTER DESIGNER. Analyze these images and create a technical DNA profile. Focus on: Facial structure (jawline, cheekbones), Eye shape/color, Hair texture/flow, and specific micro-features. This profile will be used to maintain 100% consistency across different scenes." 
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts }
    });
    return response.text?.trim() || "";
  }

  static async generateProductionManifest(
    title: string, 
    synopsis: string, 
    heroDesc: string, 
    style: string, 
    count: number = 10,
    language: string = "Bahasa Melayu"
  ): Promise<Array<any>> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `ACT AS A WORLD-CLASS FILM DIRECTOR AND SCREENWRITER.
      MOVIE TITLE: "${title}"
      SYNOPSIS: "${synopsis}"
      CHARACTER DNA: "${heroDesc}"
      VISUAL STYLE: "${style}"
      TARGET LANGUAGE: "${language}"

      TASK: Generate a sequence of exactly ${count} cinematic scenes. 
      The narrative must have a clear arc: Introduction -> Rising Action -> Climax -> Resolution.
      
      MANDATORY: All text fields (Title, Location, Visual Description, Character Action, Emotion, Dialogue, and Cinematic Notes) MUST be written in ${language}.

      FOR EACH SCENE, PROVIDE:
      1. Scene Number
      2. Title
      3. Location (Specific, cinematic)
      4. Time of Day
      5. Visual Description (Lighting, composition, atmosphere)
      6. Character Action (What is the character doing?)
      7. Emotional Tone
      8. Dialogue (Brief, impactful)
      9. Cinematic Notes (Camera lens, movement, sound design)

      MANDATORY: NO TEXT, SUBTITLES OR SPEECH BUBBLES in visual descriptions. 
      Output must be valid JSON matching the schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sceneNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              location: { type: Type.STRING },
              timeOfDay: { type: Type.STRING },
              visual: { type: Type.STRING },
              action: { type: Type.STRING },
              emotion: { type: Type.STRING },
              dialogue: { type: Type.STRING },
              cinematicNotes: { type: Type.STRING }
            },
            required: ["sceneNumber", "title", "location", "timeOfDay", "visual", "action", "emotion", "dialogue", "cinematicNotes"]
          }
        }
      }
    });

    const text = response.text?.trim() || "[]";
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse production manifest JSON", e);
      return [];
    }
  }

  static async generateSceneVisual(
    scene: AnimationScene, 
    heroImages: string[], 
    heroDesc: string, 
    style: string,
    remakeInstruction?: string
  ): Promise<string> {
    const ai = this.getAI();
    const parts: any[] = [];
    
    heroImages.forEach((img: string) => {
      const data = img.split(',')[1];
      const mimeType = img.split(';')[0].split(':')[1] || 'image/png';
      parts.push({ inlineData: { data, mimeType } });
    });

    const prompt = `
      CINEMATIC PRODUCTION FRAME:
      - SCENE: ${scene.visual}
      - LOCATION: ${scene.location} at ${scene.timeOfDay}
      - ACTION: ${scene.action}
      - EMOTION: ${scene.emotion}
      - STYLE: ${style}
      - TECHNICAL: ${scene.cinematicNotes}
      ${remakeInstruction ? `- REMAKE REQUEST: ${remakeInstruction}` : ''}

      NEGATIVE CONSTRAINTS: 
      - ABSOLUTELY NO TEXT, NO SUBTITLES, NO LETTERS, NO NUMBERS.
      - NO SPEECH BUBBLES.
      - NO WATERMARKS.
      
      CHARACTER CONSISTENCY: Use the attached images and DNA profile (${heroDesc}) to ensure the character's face, hair, and build are identical in this frame.
      
      Render in 8K resolution, cinematic lighting, professional color grading.
    `;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: { 
        imageConfig: { aspectRatio: "16:9" }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Visual generation failed: No image data returned from model.");
  }

  static async extendSceneToVideo(scene: AnimationScene, heroDesc: string): Promise<string> {
    const ai = this.getAI();
    if (!scene.image) throw new Error("Scene must have an image to extend.");

    const base64Data = scene.image.split(',')[1];
    const mimeType = scene.image.split(';')[0].split(':')[1] || 'image/png';

    const prompt = `Animate this cinematic scene: ${scene.visual}. The character (${heroDesc}) should move naturally. Dramatic lighting, high resolution, 16:9 aspect ratio. No text or watermarks.`;

    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      image: {
        imageBytes: base64Data,
        mimeType: mimeType,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed.");

    // Gunakan kunci terkini semasa fetch juga
    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await videoResponse.blob();
    return URL.createObjectURL(blob);
  }
}
