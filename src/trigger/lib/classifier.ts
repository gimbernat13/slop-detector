import { GoogleGenerativeAI } from "@google/generative-ai";
import type { NormalizedChannel, ClassificationResult, SlopType } from "./schema";

// ============================================================
// Spam keywords for rule-based detection
// ============================================================

const SPAM_KEYWORDS = [
    "24/7", "lofi", "lo-fi", "lo fi",
    "meditation", "relaxing", "sleep", "study beats",
    "asmr", "white noise", "rain sounds",
    "nursery rhymes", "kids songs", "cocomelon",
    "ai generated", "ai voice", "text to speech",
    "shorts compilation", "tiktok compilation",
];

const TEMPLATED_PATTERNS = [
    /mix\s*#?\d+/i,
    /episode\s*#?\d+/i,
    /part\s*#?\d+/i,
    /vol\.?\s*#?\d+/i,
    /#\d{2,}/,
];

// ============================================================
// Rule-based classification (fast path)
// ============================================================

export function hasSpamKeywords(text: string): boolean {
    const lower = text.toLowerCase();
    return SPAM_KEYWORDS.some(kw => lower.includes(kw));
}

export function hasTemplatedTitles(titles: string[]): boolean {
    if (titles.length < 3) return false;

    // Check for numbered patterns
    const matchCount = titles.filter(title =>
        TEMPLATED_PATTERNS.some(pattern => pattern.test(title))
    ).length;

    return matchCount >= titles.length * 0.5; // 50%+ titles match pattern
}

export function ruleBasedClassify(channel: NormalizedChannel): ClassificationResult | null {
    const reasons: string[] = [];
    let slopScore = 0;

    // High velocity is strong signal
    if (channel.velocity > 10) {
        slopScore += 40;
        reasons.push(`Extreme velocity: ${channel.velocity.toFixed(1)} videos/day`);
    } else if (channel.velocity > 5) {
        slopScore += 30;
        reasons.push(`High velocity: ${channel.velocity.toFixed(1)} videos/day`);
    } else if (channel.velocity > 3) {
        slopScore += 20;
        reasons.push(`Elevated velocity: ${channel.velocity.toFixed(1)} videos/day`);
    }

    // Spam keywords
    const titleHasSpam = hasSpamKeywords(channel.title);
    const descHasSpam = hasSpamKeywords(channel.description);
    if (titleHasSpam || descHasSpam) {
        slopScore += 25;
        reasons.push("Spam keywords detected in title/description");
    }

    // Templated titles
    if (hasTemplatedTitles(channel.recentVideos)) {
        slopScore += 25;
        reasons.push("Templated video titles detected");
    }

    // Dead engagement
    if (channel.viewsPerSub < 1) {
        slopScore += 15;
        reasons.push(`Dead engagement: ${channel.viewsPerSub.toFixed(2)} views/subscriber`);
    }

    // New account with high output
    if (channel.ageInDays < 90 && channel.videoCount > 100) {
        slopScore += 10;
        reasons.push("New account with high video count");
    }

    // OBVIOUS SLOP - return immediately
    if (slopScore >= 60) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            classification: "SLOP",
            confidence: 100,
            slopScore,
            slopType: detectSlopType(channel),
            method: "rule",
            metrics: {
                velocity: channel.velocity,
                ageInDays: channel.ageInDays,
                viewsPerSub: channel.viewsPerSub,
                videoCount: channel.videoCount,
            },
            reasons,
            recentVideos: channel.recentVideos,
        };
    }

    // OBVIOUS SAFE
    if (channel.velocity < 0.5 && channel.viewsPerSub > 50 && slopScore < 20) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            classification: "OKAY",
            confidence: 100,
            slopScore,
            slopType: null,
            method: "rule",
            metrics: {
                velocity: channel.velocity,
                ageInDays: channel.ageInDays,
                viewsPerSub: channel.viewsPerSub,
                videoCount: channel.videoCount,
            },
            reasons: ["Low velocity, healthy engagement"],
            recentVideos: channel.recentVideos,
        };
    }

    // EDGE CASE - needs AI
    return null;
}

function detectSlopType(channel: NormalizedChannel): SlopType {
    const text = `${channel.title} ${channel.description}`.toLowerCase();

    if (text.includes("lofi") || text.includes("lo-fi") || text.includes("beats") || text.includes("music")) {
        return "ai_music";
    }
    if (text.includes("kids") || text.includes("nursery") || text.includes("children")) {
        return "kids_content";
    }
    if (text.includes("ai voice") || text.includes("text to speech") || text.includes("narrator")) {
        return "ai_voice";
    }
    if (text.includes("meditation") || text.includes("sleep") || text.includes("relaxing")) {
        return "background_music";
    }
    if (hasTemplatedTitles(channel.recentVideos)) {
        return "templated_spam";
    }

    return null;
}

// ============================================================
// AI Classification (for edge cases)
// ============================================================

function getGeminiClient() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    return new GoogleGenerativeAI(key);
}

export async function aiClassify(channel: NormalizedChannel): Promise<ClassificationResult> {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Classify this YouTube channel for AI-generated slop/spam.

CHANNEL METADATA:
- Title: "${channel.title}"
- Description: "${channel.description.slice(0, 500)}"
- Recent Videos: ${channel.recentVideos.slice(0, 5).map(v => `"${v}"`).join(", ")}

QUANTITATIVE SIGNALS:
- Videos per day: ${channel.velocity.toFixed(2)}
- Account age: ${channel.ageInDays} days
- Total videos: ${channel.videoCount}
- Subscribers: ${channel.subscriberCount}
- Views per subscriber: ${channel.viewsPerSub.toFixed(2)}

ANALYSIS REQUIRED:
1. NLP: Check for spam keywords (24/7, lofi, AI), templated titles, generic descriptions
2. Behavior: Is velocity humanly possible? Is engagement dead? New spam operation?
3. Combined: Does this pattern indicate AI-generated spam content?

Respond ONLY with valid JSON (no markdown):
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
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in response");

        const parsed = JSON.parse(jsonMatch[0]);

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
            reasons: ["AI classification failed, marked as suspicious for review"],
            recentVideos: channel.recentVideos,
        };
    }
}

// ============================================================
// Main classifier (rules first, AI for edge cases)
// ============================================================

export async function classifyChannel(channel: NormalizedChannel): Promise<ClassificationResult> {
    // Try rule-based first (fast path)
    const ruleResult = ruleBasedClassify(channel);
    if (ruleResult) {
        return ruleResult;
    }

    // Edge case - use AI
    return aiClassify(channel);
}
