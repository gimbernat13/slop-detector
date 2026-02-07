import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NormalizedChannel, ClassificationResult } from "./schema";

// ============================================================
// Rate limiting helpers
// ============================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Global rate limiter: minimum 4 seconds between Gemini calls
let lastCallTime = 0;
const MIN_DELAY_MS = 4000; // 4 seconds between calls for free tier

async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - timeSinceLastCall);
    }

    lastCallTime = Date.now();
    return fn();
}

// Retry with exponential backoff
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 2000
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await rateLimitedCall(fn);
        } catch (error: any) {
            const isRateLimit = error?.status === 429 ||
                error?.message?.includes("429") ||
                error?.message?.includes("quota");

            if (isRateLimit && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt); // 2s, 4s, 8s
                console.log(`Rate limited, retrying in ${delay}ms...`);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }
    throw new Error("Max retries exceeded");
}

// ============================================================
// Gemini AI Classification
// ============================================================

function getGeminiClient() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    return new GoogleGenerativeAI(key);
}

export async function classifyChannel(channel: NormalizedChannel): Promise<ClassificationResult> {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Analyze this YouTube channel and classify it for AI-generated slop/spam content.

CHANNEL:
- Title: "${channel.title}"
- Description: "${channel.description.slice(0, 500)}"
- Recent Video Titles: ${channel.recentVideos.slice(0, 10).map(v => `"${v}"`).join(", ")}

METRICS:
- Videos per day: ${channel.velocity.toFixed(2)}
- Account age: ${channel.ageInDays} days
- Total videos: ${channel.videoCount}
- Subscribers: ${channel.subscriberCount.toLocaleString()}
- Views per subscriber: ${channel.viewsPerSub.toFixed(2)}

TASK: Determine if this is AI-generated spam/slop content (lofi streams, AI voice narration, algorithmic kids content farms, compilation spam, etc.)

IMPORTANT GUIDELINES:
1. **Kids Content**: Be careful. High quality, human-animated or educational content (like Cocomelon, PBS Kids style) is OKAY.
   - SLOP = Weird algorithmic combinations (e.g. "Elsa vs Spiderman Toilet"), repetitive nonsensical titles, low-effort AI animation.
   - OKAY = Structured stories, educational value, consistent characters.
2. **AI Voice**: AI narration alone is not slop if the content is high effort. Slop is "Wikipedia reading" or "Reddit reading".

Respond with ONLY valid JSON:
{
  "classification": "SLOP" | "SUSPICIOUS" | "OKAY",
  "confidence": 0-100,
  "slopType": "ai_music" | "kids_content" | "ai_voice" | "background_music" | "templated_spam" | null,
  "reasoning": "brief explanation",
  "nlpSignals": {
    "hasSpamKeywords": boolean,
    "templatedTitles": boolean,
    "genericDescription": boolean,
    "contentType": string | null
  },
  "behaviorSignals": {
    "highVelocity": boolean,
    "deadEngagement": boolean,
    "newOperation": boolean
  }
}`;

    try {
        const result = await retryWithBackoff(() => model.generateContent(prompt));
        const text = result.response.text();

        // Parse JSON from response
        // Clean up markdown code blocks if present
        let cleanText = text.replace(/```json\n?|\n?```/g, "").trim();

        // Find the first '{' and last '}' to handle any preamble/postamble
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleanText);

        return {
            channelId: channel.channelId,
            title: channel.title,
            classification: parsed.classification,
            confidence: parsed.confidence,
            slopScore: parsed.classification === "SLOP" ? 80 : parsed.classification === "SUSPICIOUS" ? 50 : 20,
            slopType: parsed.slopType,
            method: "ai",
            metrics: {
                velocity: channel.velocity,
                ageInDays: channel.ageInDays,
                viewsPerSub: channel.viewsPerSub,
                videoCount: channel.videoCount,
            },
            aiAnalysis: {
                reasoning: parsed.reasoning,
                nlpSignals: parsed.nlpSignals,
                behaviorSignals: parsed.behaviorSignals,
            },
            reasons: [parsed.reasoning],
            recentVideos: channel.recentVideos,
        };
    } catch (error) {
        console.error("AI classification failed:", error);
        // Fallback to suspicious if AI fails
        return {
            channelId: channel.channelId,
            title: channel.title,
            classification: "SUSPICIOUS",
            confidence: 50,
            slopScore: 50,
            slopType: null,
            method: "ai",
            metrics: {
                velocity: channel.velocity,
                ageInDays: channel.ageInDays,
                viewsPerSub: channel.viewsPerSub,
                videoCount: channel.videoCount,
            },
            reasons: [`AI classification failed: ${error}`],
            recentVideos: channel.recentVideos,
        };
    }
}
