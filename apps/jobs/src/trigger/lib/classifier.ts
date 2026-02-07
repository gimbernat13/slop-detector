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

// ============================================================
// Rule-Based Classification
// ============================================================

// --- SCORING ENGINE (Architecture 2.0) ---

// Risk Score: 0 (Safe) -> 100 (Critical Slop)
// Thresholds: < 20 = OKAY | 20-80 = SUSPICIOUS (AI Check) | > 80 = SLOP
export function calculateRiskScore(channel: NormalizedChannel): {
    score: number;
    reasons: string[];
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
} {
    let score = 50; // Start neutral
    const reasons: string[] = [];

    // 1. POSITIVE SIGNALS (Reduce Risk)
    // --------------------------------------------------

    // Mega-Channel Safety Valve (MrBeast, PewDiePie level)
    // BUT: Ignore if they are a content farm (high volume)
    const isContentFarm = channel.videoCount && Number(channel.videoCount) > 10000;

    if (channel.subscriberCount > 5_000_000) {
        if (!isContentFarm) {
            score -= 40;
            reasons.push("Mega-Channel (>5M Subs)");
        } else {
            reasons.push("Mega-Channel (>5M Subs) but High Volume (ignored)");
        }
    } else if (channel.subscriberCount > 1_000_000) {
        if (!isContentFarm) {
            score -= 20;
            reasons.push("Large Channel (>1M Subs)");
        }
    }

    // High Engagement Ratio (Views/Subs) - Indicates actual humans watching
    if (channel.viewsPerSub > 50) {
        score -= 10;
        reasons.push("High Engagement Ratio (>50 views/sub)");
    }

    // Low Velocity (The "Quality over Quantity" signal)
    if (channel.recentVelocity < 0.15) { // Less than 1 video/week
        score -= 10;
        reasons.push("Low Velocity (<1 video/week)");
    }

    // Long-term Creator
    if (channel.ageInDays > 730) {
        score -= 10;
        reasons.push("Established Channel (>2 years old)");
    }

    // 2. NEGATIVE SIGNALS (Increase Risk)
    // --------------------------------------------------

    // "Slop" Keywords in Title (Strong Signal)
    const slopKeywords = [
        /no copyright/i, /royalty free/i, /relaxing music/i, /lofi hip hop/i,
        /satisfying/i, /asmr/i, /compilation/i, /tiktok mashup/i,
        /ai generated/i, /chatgpt/i, /midjourney/i,
        /minecraft but/i, /skibidi/i
    ];

    if ((channel.title && channel.title.match(/vevo/i)) || (channel.title && channel.title.match(/official/i))) {
        score -= 30; // VEVO is safe
        reasons.push("Official Artist/Brand Keyword");
    } else {
        if (channel.title) {
            for (const regex of slopKeywords) {
                if (channel.title.match(regex)) {
                    score += 20;
                    reasons.push(`Title matches spam keyword: ${regex}`);
                }
            }
        }
    }

    // Excessive Hashtags
    if (channel.title && (channel.title.match(/#/g) || []).length > 3) {
        score += 15;
        reasons.push("Excessive Hashtags in Title");
    }

    // High Velocity (Content Farm Signal)
    if (channel.recentVelocity > 5.0) {
        score += 40;
        reasons.push("Extreme Velocity (>5 videos/day)");
    } else if (channel.recentVelocity > 2.0) {
        score += 20;
        reasons.push("High Velocity (>2 videos/day)");
    }

    // Brand New Channel (<30 days)
    if (channel.ageInDays < 30) {
        score += 20;
        reasons.push("Brand New Channel (<30 days)");
    }

    // 3. NORMALIZE & CLASSIFY
    // --------------------------------------------------
    score = Math.max(0, Math.min(100, score)); // Clamp 0-100

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
    if (score < 30) riskLevel = "LOW";        // Safe
    else if (score > 80) riskLevel = "HIGH";  // Critical Slop

    return { score, reasons, riskLevel };
}

function classifyByRules(channel: NormalizedChannel): ClassificationResult | null {
    // 0. STRICT EXCLUSIONS (Safety First)
    // Made for Kids = SLOP (Kids content farm/slop)
    if (channel.isMadeForKids) {
        return {
            ...getBaseResult(channel),
            classification: "SLOP",
            confidence: 95,
            slopScore: 90,
            slopType: "kids_content",
            method: "rule",
            metrics: { ...getMetrics(channel), isMadeForKids: true },
            reasons: ["Channel is marked as 'Made for Kids' (Strict Exclusion Rule)"],
        };
    }

    // --- SCORING ENGINE INTEGRATION ---
    const { score, reasons, riskLevel } = calculateRiskScore(channel);

    // Filter out internal scoring reasons from final output if needed, but beneficial for debugging
    console.log(`📊 Risk Score: ${score} (${riskLevel}) | Reasons: ${reasons.join(", ")}`);

    // 1. Safe (Auto-Approve)
    if (riskLevel === "LOW") {
        return {
            ...getBaseResult(channel),
            classification: "OKAY",
            confidence: 90,
            slopScore: score,
            slopType: null,
            method: "rules",
            metrics: { ...getMetrics(channel), isMadeForKids: false },
            reasons
        };
    }

    // 2. Slop (Auto-Reject)
    if (riskLevel === "HIGH") {
        return {
            ...getBaseResult(channel),
            classification: "SLOP",
            confidence: 90,
            slopScore: score,
            slopType: "templated_spam",
            method: "rules",
            metrics: { ...getMetrics(channel), isMadeForKids: false },
            reasons
        };
    }

    // 3. Medium Risk -> Return NULL to trigger AI
    return null;
}

function getBaseResult(channel: NormalizedChannel) {
    return {
        channelId: channel.channelId,
        title: channel.title,
        description: channel.description,
        thumbnailUrl: channel.thumbnailUrl,
        recentVideos: channel.recentVideos.map(v => v.title),
        latestVideoId: channel.latestVideoId,
    };
}

function getMetrics(channel: NormalizedChannel) {
    return {
        velocity: channel.velocity,
        ageInDays: channel.ageInDays,
        viewsPerSub: channel.viewsPerSub,
        videoCount: channel.videoCount,
        subscriberCount: channel.subscriberCount,
        viewCount: channel.viewCount,
        isMadeForKids: channel.isMadeForKids,
        categoryId: channel.categoryId,
    };
}


export async function classifyChannel(channel: NormalizedChannel, options?: { forceAi?: boolean }): Promise<ClassificationResult> {
    // 1. Try Fast Path (Rules), unless forced to use AI
    if (!options?.forceAi) {
        const ruleResult = classifyByRules(channel);
        if (ruleResult) {
            console.log(`⚡ Rule Matched: ${ruleResult.classification} (${ruleResult.reasons[0]})`);
            return ruleResult;
        }
    } else {
        console.log("⚡ Skipping rules (Force AI enabled)...");
    }

    // 2. Slow Path (AI)
    console.log("🤖 No rule match. Calling Gemini AI...");
    loadEnv();
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
    const model = getAI().getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
    });


    // Format rich video context for the prompt
    const videoContext = channel.recentVideos.slice(0, 10).map((v, i) => {
        const durationStr = v.duration ? ` | Duration: ${v.duration}` : "";
        const tagsStr = v.tags && v.tags.length > 0 ? ` | Tags: [${v.tags.slice(0, 5).join(", ")}]` : "";
        const viewsStr = v.viewCount ? ` | Views: ${Number(v.viewCount).toLocaleString()}` : "";
        return `Video ${i + 1}: "${v.title}"${durationStr}${viewsStr}${tagsStr}`;
    }).join("\n");

    const prompt = `Analyze this YouTube channel and classify it for AI-generated slop/spam content.

- Title: "${channel.title}"
- Description: "${channel.description.slice(0, 500)}"
- Category ID: ${channel.categoryId || "Unknown"}

RECENT VIDEOS (with context):
${videoContext}

METRICS:
- Videos per day: ${channel.velocity.toFixed(2)}
- Account age: ${channel.ageInDays} days
- Made for Kids: ${channel.isMadeForKids ? "YES" : "NO"}
- Total videos: ${channel.videoCount}
- Subscribers: ${channel.subscriberCount.toLocaleString()}
- Views per subscriber: ${channel.viewsPerSub.toFixed(2)}

TASK: Determine if this is AI-generated spam/slop content (lofi streams, AI voice narration, algorithmic kids content farms, compilation spam, etc.)

IMPORTANT GUIDELINES:
1. **Quality over Format**: Even if a channel posts frequently or uses "hooks", look for High-Quality Indicators:
    - **Human Curation**: Does the channel curate unique speeches, motivational content, or drama with a consistent aesthetic? (e.g., Sandeep Goswami, Motivation Madness). If it shows human investment in curation/presentation, it is **OKAY**.
    - **High Production Value**: Unique b-roll, face-on-camera, custom animations, or on-location filming.
    - **Unique Insights**: Does the content offer deep analysis, personal experience, or unique perspectives.
    - **Rich Context**: Deeply tagged videos and longer durations (10m+) often signal human effort.
2. **Be Careful with "Templated Spam", Drama & Lifestyle**: 
    - Reputable channels often use consistent branding, but SLOP/SPAM is characterized by lack of human personality, repetitive generic footage, and generic AI-written scripts.
    - **Drama / Commentary / Motivation / Viral Creators**: Do NOT label human-led commentary, social media vlogs, high-quality motivational curation, or unique viral creators (e.g., "That Little Puff", "Luziwei") as "ai_voice" or "templated_spam". Authenticity and high production value override "generic style".
    - **Human Personality**: If a channel shows a consistent human presence, authentic personality, or unique framing of content, it is **OKAY**.
    - **Cooking/DIY Hacks**: If they show humans, high production value, and unique effort, they are **OKAY**.
    - **Human "Cringe" / Pranks / Challenges**: 
        - **CRITICAL**: Do NOT flag channels as "templated_spam" just because they do "24 Hour Challenges", "Pranks", or "Family Vlogs" (e.g. Piper Rockelle, AKSTAR, Stokes Twins). 
        - These are **HUMAN-LED** entertainment, even if formulaic. **SLOP = AI GENERATED** or **LOW EFFORT STOCK LOOP**.
        - If there are real humans on camera speaking naturally, it is **OKAY**.
        - Only flag if the humans are **AI Avatars** or the content is **repetitive stock footage** with **AI Voiceover**.

SPECIFIC ARCHETYPES TO FLAG AS SLOP:
1. **AI Voice/Content**: Synthetic narration, robotic delivery, or AI-generated scripts/images.
2. **Templated Spam**: Repetitive video formats (e.g., "Minecraft But...", "Satisfying Slime") designed purely for algorithmic engagement.
3. **Kids Content**: Low-effort animations or toy play videos targeted at toddlers.
4. **Political Slop**: 
   - Channels posing as "Breaking News" using synthetic voices and stock footage loops.
   - High-volume, low-effort political commentary with sensationalist/clickbait titles and no unique reporting or reputable sources.
   - AI-generated "discussions" about government secrets, election leaks, or polarizing political drama.

Return a JSON object:
{
  "classification": "SLOP" | "SUSPICIOUS" | "OKAY",
  "confidence": number,
  "slopScore": number,
  "slopType": "ai_music" | "kids_content" | "ai_voice" | "background_music" | "templated_spam" | "political_slop" | null,
  "reasoning": "Brief explanation",
  "nlpSignals": {
    "hasSpamKeywords": boolean,
    "templatedTitles": boolean,
    "genericDescription": boolean,
    "contentType": "string"
  },
  "behaviorSignals": {
    "highVelocity": boolean,
    "deadEngagement": boolean,
    "newOperation": boolean
  }
}
`;

    console.log("📝 GEMINI PROMPT:\n", prompt);
    try {
        const result = await retryWithBackoff(() => model.generateContent(prompt));
        const text = result.response.text();
        console.log("📝 GEMINI RAW RESPONSE:\n", text);
        const cleanedText = text.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleanedText);

        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: parsed.classification,
            confidence: Math.round((parsed.confidence <= 1 ? parsed.confidence * 100 : parsed.confidence) || 0),
            slopScore: Math.round((parsed.slopScore <= 1 ? parsed.slopScore * 100 : parsed.slopScore) || 0),
            slopType: parsed.slopType,
            method: "ai",
            metrics: {
                velocity: channel.velocity,
                ageInDays: channel.ageInDays,
                viewsPerSub: channel.viewsPerSub,
                videoCount: channel.videoCount,
                subscriberCount: channel.subscriberCount,
                viewCount: channel.viewCount,
                isMadeForKids: channel.isMadeForKids,
            },
            aiAnalysis: {
                reasoning: parsed.reasoning,
                nlpSignals: parsed.nlpSignals,
                behaviorSignals: parsed.behaviorSignals,
            },
            reasons: [parsed.reasoning],
            recentVideos: channel.recentVideos.map(v => typeof v === "string" ? v : v.title),
            latestVideoId: channel.latestVideoId,
        };
    } catch (error) {
        console.error("AI classification failed:", error);
        console.log("📝 FAILED PROMPT DUMP:\n", prompt);
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
                isMadeForKids: channel.isMadeForKids,
            },
            reasons: [`AI classification failed: ${error}`],
            recentVideos: channel.recentVideos.map(v => typeof v === "string" ? v : v.title),
            latestVideoId: channel.latestVideoId,
        };
    }
}
