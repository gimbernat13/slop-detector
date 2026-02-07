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

export function classifyByRules(channel: NormalizedChannel): ClassificationResult | null {
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
            metrics: getMetrics(channel),
            reasons: ["Channel is marked as 'Made for Kids' (Strict Exclusion Rule)"],
        };
    }

    const avgTags = channel.recentVideos.reduce((acc, v) => acc + (v.tags?.length || 0), 0) / (channel.recentVideos.length || 1);
    const avgDurationSeconds = channel.recentVideos.reduce((acc, v) => {
        if (!v.duration) return acc;
        const match = v.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
        const mins = parseInt(match?.[1] || "0");
        const secs = parseInt(match?.[2] || "0");
        return acc + (mins * 60 + secs);
    }, 0) / (channel.recentVideos.length || 1);

    // Heuristic slop keywords that should NEVER be auto-OKAY via rules
    // ( Softened: Removed "puff" and "creative cooking" as these can be high-quality creators )
    const slopArchetypeKeywords = [
        "banana", "satisfying", "slime", "skibidi", "toilet", "minecraft but",
        "toy play", "bad baby"
    ];
    const hasSlopArchetype = slopArchetypeKeywords.some(k =>
        channel.title.toLowerCase().includes(k) ||
        channel.description.toLowerCase().includes(k)
    );

    // 0.5 SAFE PATH RULES (Early OKAY for reputation)
    // Rule: Major Authority (>5M subs AND shows human effort markers)
    // EXCLUSION: Slop archetypes (Banana, toilet, etc.) must always go to AI/other rules.
    if (channel.subscriberCount > 5000000 && avgTags > 3 && avgDurationSeconds > 45 && !hasSlopArchetype) {
        return {
            ...getBaseResult(channel),
            classification: "OKAY",
            confidence: 95,
            slopScore: 5,
            slopType: null,
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Major established channel (>5M subscribers) with human effort indicators"],
        };
    }

    // Rule: High Viral Engagement (Exclude if suspiciously low effort/slop markers)
    // Requirement for OKAY: Must have decent tags and not be a slop archetype
    if (channel.viewsPerSub > 1000 && channel.subscriberCount > 5000 && avgTags > 4 && !hasSlopArchetype) {
        return {
            ...getBaseResult(channel),
            classification: "OKAY",
            confidence: 90,
            slopScore: 10,
            slopType: null,
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Exceptional viral engagement (>1000 views/sub)"],
        };
    }

    // Rule: Established Creator (Account Age + Volume + Low Velocity)
    if (channel.ageInDays > 365 && channel.videoCount > 100 && channel.velocity < 1.0 && channel.subscriberCount > 10000 && avgTags > 2 && !hasSlopArchetype) {
        return {
            ...getBaseResult(channel),
            classification: "OKAY",
            confidence: 85,
            slopScore: 15,
            slopType: null,
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Established long-term creator (Age > 1yr, low velocity)"],
        };
    }

    // 1. SLOP RULES (Bypass AI for obvious spam)
    // Rule: Extreme High Velocity (>10/day for non-established)
    if (channel.velocity > 10 && channel.subscriberCount < 100000) {
        return {
            ...getBaseResult(channel),
            classification: "SLOP",
            confidence: 95,
            slopScore: 100,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Extreme high velocity (>10 videos/day) for a non-established channel"],
        };
    }

    // Rule: High Velocity + Content Keywords
    const spamKeywords = ["lofi", "meditation", "rain", "frequency", "binaural", "study", "relaxing", "24/7"];
    const hasSpamKeywords = spamKeywords.some(k =>
        channel.title.toLowerCase().includes(k) ||
        channel.description.toLowerCase().includes(k)
    );
    if (channel.velocity > 5 && hasSpamKeywords) {
        return {
            ...getBaseResult(channel),
            classification: "SLOP",
            confidence: 90,
            slopScore: 90,
            slopType: "background_music",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["High velocity (>5/day) with spam keywords"],
        };
    }

    // 4. POLITICAL SLOP RULES
    const alarmistKeywords = ["secret leaked", "election fraud", "breaking political", "government leak", "insider reveals", "martial law"];
    const hasAlarmistKeywords = alarmistKeywords.some(k =>
        channel.title.toLowerCase().includes(k) ||
        channel.description.toLowerCase().includes(k)
    );

    // If Category is News (25) AND has alarmist keywords AND substantial velocity -> SLOP
    if (channel.categoryId === "25" && hasAlarmistKeywords && channel.velocity > 3) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SLOP",
            confidence: 90,
            slopScore: 95,
            slopType: "political_slop",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Deterministic Political Slop: News category with alarmist keywords and high velocity"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // 5. VELOCITY GUARDRAILS
    // Any channel posting > 8 videos/day that isn't established (subs < 20k) -> SUSPICIOUS
    if (channel.velocity > 8 && channel.subscriberCount < 20000) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SUSPICIOUS",
            confidence: 85,
            slopScore: 70,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Extreme velocity (>8/day) with low subscriber base"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // 6. PHASE 2: ADVANCED DETERMINISTIC SIGNALS

    // Rule: Zero Tags (Legitimate creators almost always tag videos)
    // If average tags < 1 AND channel is small/medium -> SUSPICIOUS
    if (avgTags < 1 && channel.subscriberCount < 50000) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SUSPICIOUS",
            confidence: 80,
            slopScore: 60,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Zero tags detected across recent videos (Average tags < 1)"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // Rule: Engagement Gap (Posting frequently but no sub interest)
    // If velocity > 2 AND views-per-sub is extremely low AND established enough for subs to matter (>10k)
    if (channel.velocity > 2 && channel.viewsPerSub < 0.1 && channel.subscriberCount > 10000) {
        return {
            channelId: channel.channelId,
            title: channel.title,
            description: channel.description,
            thumbnailUrl: channel.thumbnailUrl,
            classification: "SLOP",
            confidence: 90,
            slopScore: 85,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Engagement Gap: High velocity with extremely low subscriber interest (< 0.1 views/sub)"],
            recentVideos: channel.recentVideos.map(v => v.title),
            latestVideoId: channel.latestVideoId,
        };
    }

    // 7. PHASE 3: SHORTS CHURNERS & HASHTAG SPAM (TL;DR Efficiency)

    const hasHashtagSpam = channel.recentVideos.some(v => (v.title.match(/#/g) || []).length >= 3);
    const movieShowPattern = /".*"\s*#movie|#show|#edit/i;
    const hasMovieShowPattern = channel.recentVideos.some(v => movieShowPattern.test(v.title));

    // Rule: Shorts Churner (Short videos + No tags + Not huge subs)
    if (avgDurationSeconds < 65 && avgTags < 1 && channel.subscriberCount < 500000) {
        return {
            ...getBaseResult(channel),
            classification: "SUSPICIOUS",
            confidence: 85,
            slopScore: 75,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: ["Shorts Churner pattern: Average duration < 65s with zero tags"],
        };
    }

    // Rule: Hashtag Spam or Movie Clip pattern
    if ((hasHashtagSpam || hasMovieShowPattern) && channel.subscriberCount < 100000) {
        return {
            ...getBaseResult(channel),
            classification: "SUSPICIOUS",
            confidence: 80,
            slopScore: 65,
            slopType: "templated_spam",
            method: "rule",
            metrics: getMetrics(channel),
            reasons: [hasHashtagSpam ? "Excessive hashtag usage in titles" : "Movie/Show clip re-upload pattern detected"],
        };
    }

    return null; // No rule match -> Send to AI
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
