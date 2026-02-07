import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NormalizedChannel, ClassificationResult } from "@slop-detector/shared";
import { loadEnv } from "./env.js";

// ============================================================
// Rate limiting helpers
// ============================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry with exponential backoff
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 2000
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            const isRateLimit = error?.status === 429 ||
                error?.status === 503 ||
                error?.message?.includes("429") ||
                error?.message?.includes("503") ||
                error?.message?.includes("quota") ||
                error?.message?.includes("overloaded");

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
    loadEnv();
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    return new GoogleGenerativeAI(key);
}

let _genAI: GoogleGenerativeAI | null = null;
function getAI() {
    if (!_genAI) _genAI = getGeminiClient();
    return _genAI;
}

// removed top-level initializer to avoid crashes during import/build


// ============================================================
// Rule-Based Classification
// ============================================================

export function classifyByRules(channel: NormalizedChannel): ClassificationResult | null {
    // 1. SLOP RULES
    // Velocity > 10/day = SLOP (Spam)
    if (channel.velocity > 10) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SLOP",
            confidence: 95,
            slopScore: 100,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["High velocity (>10 videos/day)"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // Velocity > 5/day AND keywords = SLOP
    const spamKeywords = ["lofi", "meditation", "rain", "frequency", "binaural", "study", "relaxing", "24/7"];
    const hasSpamKeywords = spamKeywords.some(k =>
        channel.title.toLowerCase().includes(k) ||
        channel.description.toLowerCase().includes(k)
    );

    if (channel.velocity > 5 && hasSpamKeywords) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SLOP",
            confidence: 90,
            slopScore: 90,
            slopType: "background_music", // Most likely for this keyword set
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["High velocity (>5/day) with spam keywords"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // 2. OKAY RULES - REMOVED
    // User feedback: Rules were too lenient.
    // We will let the AI decide for "normal" looking channels to avoid false negatives.

    // Only keeping obvious SLOP rules.

    return null; // No rule match -> Send to AI
}

function getMetrics(channel: NormalizedChannel) {
    return {
        velocity: channel.velocity,
        ageInDays: channel.ageInDays,
        viewsPerSub: channel.viewsPerSub,
        videoCount: channel.videoCount,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
    };
}


export async function classifyChannel(channel: NormalizedChannel): Promise<ClassificationResult> {
    // 1. Try Fast Path (Rules)
    const ruleResult = classifyByRules(channel);
    if (ruleResult) {
        console.log(`⚡ Rule Matched: ${ruleResult.classification} (${ruleResult.reasons[0]})`);
        return ruleResult;
    }

    // 2. Slow Path (AI)
    console.log("🤖 No rule match. Calling Gemini AI...");
    loadEnv();
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const model = getAI().getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
    });


    const prompt = `Analyze this YouTube channel and classify it for AI-generated slop/spam content.

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
    - OKAY = Structured stories, educational value, consistent characters, high production value.
    - Mixed/Unsure = SUSPICIOUS using slop tactics.
2. **AI Voice**: AI narration alone is not slop if the content is high effort. Slop is "Wikipedia reading", "Reddit reading", or "Low effort compilations".
3. **Be STRICT**: If it looks like a content farm, it probably is. Lean towards SUSPICIOUS or SLOP if in doubt.

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
        const cleanedText = text.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);

        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
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
                subscriberCount: channel.subscriberCount,
                viewCount: channel.viewCount,
            },
            aiAnalysis: {
                reasoning: parsed.reasoning,
                nlpSignals: parsed.nlpSignals,
                behaviorSignals: parsed.behaviorSignals,
            },
            reasons: [parsed.reasoning],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
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
                subscriberCount: channel.subscriberCount,
                viewCount: channel.viewCount,
            },
            reasons: [`AI classification failed: ${error}`],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }
}
