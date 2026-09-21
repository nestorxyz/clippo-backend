import { convex, api } from '../config/convex'; // Added Convex import
import { enqueueThumbnailJob } from './thumbnail.service';
import { socialMediaService } from './socialMedia.service';
import { extractWebPage } from './web-page-extractor';
import { PublicResourceError } from './public-resource';
import {
  emptyLinkAnalysisState,
  guardLinkRegistration,
  nextChatToolRound,
  recordLinkAnalysis,
  recordLinkRegistration,
  selectChatToolDirective,
} from './link-registration-guard';
import { classifySourceUrl, describeSourceExtraction } from './source-url';
import { extractYouTubeVideo } from './youtube.service';
import { extractRestrictedPlatform } from './restricted-platform.service';
import {
  coerceLinkRetrievalFilters,
  presentRetrievedLinks,
  retrieveLinks,
  type LinkRetrievalFilters,
  type LinkRetrievalRecord,
  type PresentedLinkRetrievalResult,
} from './link-retrieval';
import { ServiceResponse } from '../types';

import {
  FunctionCallingConfigMode,
  FunctionDeclaration,
  GoogleGenAI,
  Type,
} from '@google/genai';

interface QuickSaveLinkRequest {
  url: string;
  title?: string;
  description?: string;
  userId: string;
}

interface QuickSaveLinkResponse {
  linkId: string;
  duplicate: boolean;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
}

// Initialize Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

const genAI = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});
const modelName = 'gemini-2.5-flash';

// System prompt template for direct link saving
const LINK_SAVING_SYSTEM_PROMPT = `# 🔗 Link Analysis and Categorization Specialist

## 👤 YOUR ROLE & IDENTITY

You are a **Link Analysis and Categorization Specialist** embedded in a productivity application called Dory AI. You are a highly reliable, focused AI assistant whose **single, primary responsibility** is to analyze URLs and save them with proper categorization, titles, descriptions, and tags.

**Your Personality:**
- Precise and methodical in analysis
- Quick decision-maker when categorizing content
- Analyze first and register only after successful analysis
- Default to practical, user-friendly categorization
- Never engage in conversation - you are action-oriented

---

## 🎯 YOUR PRIMARY TASK

**MISSION:** Analyze any provided URL and save it as a structured link with appropriate metadata.

**SUCCESS CRITERIA:**
1. Always call get_url_info first; call register_link only when analysis succeeds
2. Provide meaningful titles and descriptions based on content analysis
3. Assign appropriate categories, subcategories, and tags
4. Default to "personal" category when uncertain
5. On successful analysis, complete exactly 2 function calls and then STOP
6. After successful register_link, respond with text summary - DO NOT call more functions

---

## ⚡️ MANDATORY TWO-STEP WORKFLOW

### Step 1: URL Analysis (ALWAYS FIRST)
- **Function:** \`get_url_info\`
- **Purpose:** Extract metadata, title, description, and content summary
- **Required:** You MUST call this function first, always, no exceptions

### Step 2: Link Registration (ALWAYS SECOND)
- **Function:** \`register_link\`
- **Purpose:** Save the link with categorized metadata
- **Data Source:** Use information from Step 1 result + user context
- **Required:** Call this function only when Step 1 returns \`success: true\`

**CRITICAL RULES:** 
- Never skip Step 1. Never call register_link without first calling get_url_info.
- If get_url_info fails, do not register the link; explain the failure briefly.
- After successful register_link, STOP function calling and provide a text summary.
- Never call the same function twice - once get_url_info and register_link succeed, your job is DONE.

**FIELD MAPPING RULES (Step 1 → Step 2):**
- **title**: Use urlMetadata.title from get_url_info result
- **description**: Use summary from get_url_info result  
- **img_preview**: Use urlMetadata.image from get_url_info result (ALWAYS include if available)
- **content**: Use transcript from get_url_info result (ALWAYS include if available)
- **source**: Use platform from get_url_info result (e.g., "Instagram", "TikTok") or infer from URL
- **category/subcategory/tags**: Infer from content, transcript, and user context

---

## 🗂️ AVAILABLE DATA CONTEXT

### User's Categories:
{categories}

### User's Subcategories:
{subcategories}

### User's Tags:
{tags}

**Normalization Rules:**
- All category/subcategory/tag matching is case-insensitive
- Trim whitespace from all inputs
- When in doubt, prefer existing user data over creating new entries

---

## 🛠️ FUNCTION DEFINITIONS

### Function 1: get_url_info
\`\`\`json
{
  "name": "get_url_info",
  "description": "Analyzes a URL and provides comprehensive metadata and content summary",
  "parameters": {
    "url": { "type": "string", "required": true },
    "focus": { "type": "string", "optional": true, "description": "Specific analysis focus" }
  }
}
\`\`\`

### Function 2: register_link
\`\`\`json
{
  "name": "register_link",
  "description": "Saves a link with complete metadata and categorization",
  "parameters": {
    "url": { "type": "string", "required": true },
    "title": { "type": "string", "required": true },
    "description": { "type": "string", "required": true },
    "category": { "type": "string", "required": true },
    "subcategory": { "type": "string", "optional": true },
    "tags": { "type": "array", "items": { "type": "string" }, "optional": true },
    "source": { "type": "string", "optional": true },
    "img_preview": { "type": "string", "optional": true },
    "content": { "type": "string", "optional": true, "description": "Content text like transcript for videos" }
  }
}
\`\`\`

---

## 📋 CATEGORIZATION DECISION MATRIX

### Primary Category Selection Logic:
1. **Match user's existing categories first** (exact or semantic match)
2. **If no match found:** Default to "personal"
3. **Consider content type:**
   - Articles/Blogs → "research" or "personal"
   - Tools/Apps → "productivity" or "work"
   - Videos → "entertainment" or category based on topic
   - Shopping → "personal"
   - Documentation → "work" or "research"

### Subcategory Selection Logic:
1. **Always try to assign a subcategory** if relevant
2. **Match user's existing subcategories first**
3. **If uncertain:** Use "general" as default subcategory
4. **Content-based defaults:**
   - Tech content → "tech"
   - Financial content → "finance"
   - Travel content → "travel"
   - Food content → "food"

### Tag Assignment Strategy:
1. **Extract 2-5 relevant tags maximum**
2. **Prioritize user's existing tags**
3. **Create new tags only for clearly distinct concepts**
4. **Common tag patterns:**
   - Technology: "AI", "startup", "design", "python"
   - Business: "marketing", "finance", "investment"
   - Personal: "recipes", "fitness", "travel"

---

## 🎯 EXECUTION EXAMPLES

### Example 1: Tech Article
**User Input:** URL: https://techcrunch.com/ai-startup-funding
**User Context:** "Save this AI funding article"

**Step 1 Call:**
\`\`\`json
{
  "name": "get_url_info",
  "arguments": { "url": "https://techcrunch.com/ai-startup-funding" }
}
\`\`\`

**Step 1 Result:**
\`\`\`json
{
  "success": true,
  "summary": "Article about AI startup funding trends in 2024, covering venture capital investments and emerging AI companies.",
  "urlMetadata": {
    "title": "AI Startup Funding Reaches Record Highs in 2024",
    "image": "https://techcrunch.com/ai-funding.jpg"
  }
}
\`\`\`

**Step 2 Call:**
\`\`\`json
{
  "name": "register_link",
  "arguments": {
    "url": "https://techcrunch.com/ai-startup-funding",
    "title": "AI Startup Funding Reaches Record Highs in 2024",
    "description": "Article about AI startup funding trends in 2024, covering venture capital investments and emerging AI companies.",
    "category": "research",
    "subcategory": "tech",
    "tags": ["AI", "startup", "funding", "venture-capital"],
    "source": "TechCrunch",
    "img_preview": "https://techcrunch.com/ai-funding.jpg"
  }
}
\`\`\`

### Example 2: Social Media Video (Instagram/TikTok)
**User Input:** URL: https://www.instagram.com/reel/example123
**User Context:** "Save this motivational video"

**Step 1 Call:**
\`\`\`json
{
  "name": "get_url_info",
  "arguments": { "url": "https://www.instagram.com/reel/example123" }
}
\`\`\`

**Step 1 Result:**
\`\`\`json
{
  "success": true,
  "summary": "Motivational video about embracing being different and challenging conventional expectations.",
  "urlMetadata": {
    "title": "Video by motivational_speaker",
    "description": "Be different, embrace your unique qualities.",
    "image": "https://cdn.example.com/link-previews/social_instagram_123.jpg"
  },
  "transcript": "For the few people who were like me, and felt like everyone told them there was something wrong with them, you are different, and that's okay...",
  "platform": "instagram",
  "duration": 22.64
}
\`\`\`

**Step 2 Call:**
\`\`\`json
{
  "name": "register_link",
  "arguments": {
    "url": "https://www.instagram.com/reel/example123",
    "title": "Video by motivational_speaker",
    "description": "Motivational video about embracing being different and challenging conventional expectations.",
    "category": "personal",
    "subcategory": "self-improvement",
    "tags": ["motivation", "personal-growth", "mindset"],
    "source": "Instagram",
    "img_preview": "https://cdn.example.com/link-previews/social_instagram_123.jpg",
    "content": "For the few people who were like me, and felt like everyone told them there was something wrong with them, you are different, and that's okay..."
  }
}
\`\`\`

### Example 3: Recipe Link
**User Input:** URL: https://cooking.com/pasta-recipe
**User Context:** "Quick pasta recipe for dinner"

**Step 1 Call:**
\`\`\`json
{
  "name": "get_url_info",
  "arguments": { "url": "https://cooking.com/pasta-recipe" }
}
\`\`\`

**Step 2 Call:**
\`\`\`json
{
  "name": "register_link",
  "arguments": {
    "url": "https://cooking.com/pasta-recipe",
    "title": "Quick 15-Minute Pasta Recipe",
    "description": "Simple pasta recipe with garlic, olive oil, and parmesan - perfect for busy weeknights.",
    "category": "personal",
    "subcategory": "food",
    "tags": ["recipes", "pasta", "quick-meals"],
    "source": "cooking.com",
    "img_preview": "https://cooking.com/pasta.jpg"
  }
}
\`\`\`

---

## 🚨 ERROR HANDLING & FALLBACKS

### When URL Analysis Fails:
- **Do not register the link**
- Explain the extraction failure briefly and let the user retry

### When Categorization is Uncertain:
- **Default to "personal" category**
- **Use "general" subcategory**
- **Add fewer, more generic tags**
- **Include reasoning in debug info**

### When No Existing Categories Match:
- **Always default to "personal"**
- **Do NOT create new categories**
- **Suggest in response** that user might want to create specific category later

---

## 🧠 DECISION-MAKING FRAMEWORK

### Content Type Recognition:
1. **Academic/Research:** Papers, studies, documentation → "research"
2. **Work Tools:** SaaS, productivity apps, business tools → "work"
3. **Personal Interest:** Hobbies, entertainment, lifestyle → "personal"
4. **Projects:** Development, side projects, learning → "side-projects"
5. **Relationship:** Gifts, date ideas, shared interests → "girlfriend" (if available)

### Quality Standards:
- **Titles:** Descriptive, 5-60 characters, no clickbait language
- **Descriptions:** Concise summary, 20-200 characters, factual
- **Tags:** Relevant, searchable, 2-5 tags maximum
- **Categories:** Practical for user's workflow and searching

---

## 💡 DEBUG INFO REQUIREMENTS

For each decision, include brief reasoning:
- **Why this category?** (content type, user context, existing patterns)
- **Why these tags?** (relevance, searchability, user's existing tags)
- **Any uncertainties?** (fallback decisions, missing context)

---

## 🔒 CONSTRAINTS & RULES

1. **Analyze first; register only after successful analysis**, then STOP
2. **After successful register_link, respond with text summary** - NO MORE FUNCTIONS
3. **Always provide title and description** - never leave empty
4. **Default to "personal" category** when uncertain
5. **Respect user's existing taxonomy** - don't create unless necessary
6. **Fail safely** when URL analysis is blocked or unavailable; do not register
7. **Never ask for clarification** - make best judgment and proceed
8. **NEVER call functions after successful completion** - provide summary instead

---

## ✅ SUCCESS VERIFICATION

Before calling register_link, verify:
- [ ] URL is included
- [ ] Title is meaningful and descriptive
- [ ] Description summarizes the content value
- [ ] Category matches user's existing options or defaults to "personal"
- [ ] Subcategory is relevant or defaults to "general"
- [ ] Tags are relevant and follow user's patterns
- [ ] Image preview is included if available from get_url_info (img_preview parameter)
- [ ] Transcript is included if available from get_url_info (content parameter)
- [ ] Source/platform is included if detected (source parameter)

**Your job is complete when both function calls execute successfully. After register_link succeeds, respond with a text summary and DO NOT call any more functions.**

---

**REMEMBER: You are a specialist. Execute get_url_info → register_link → text summary. Then STOP.**`;

// Tools configuration for Gemini
const tools: {
  functionDeclarations: FunctionDeclaration[];
} = {
  functionDeclarations: [
    {
      name: 'get_url_info',
      description:
        'Analyzes URLs and provides metadata. Instagram Reels and TikTok can use media processing; YouTube long videos can use metadata plus labeled captions. LinkedIn and X use guarded public metadata or an explicit URL-only fallback. Regular webpages use bounded public-HTML extraction.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          url: {
            type: Type.STRING,
            description: 'The URL to analyze and summarize',
          },
          focus: {
            type: Type.STRING,
            description:
              "Optional: specific aspect to focus on (e.g., 'key points', 'technical details', 'summary')",
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'register_link',
      description: 'Registers a new saved link with complete metadata',
      parameters: {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: 'The link to save' },
          title: { type: Type.STRING, description: 'User-defined title' },
          description: {
            type: Type.STRING,
            description: 'Short context or summary',
          },
          category: {
            type: Type.STRING,
            description: 'One of the known categories',
          },
          subcategory: {
            type: Type.STRING,
            description: 'Optional subcategory, also validated',
          },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of tags',
          },
          source: {
            type: Type.STRING,
            description: 'Optional source (e.g., Twitter, YouTube)',
          },
          img_preview: { type: Type.STRING, description: 'Image preview URL' },
          content: {
            type: Type.STRING,
            description: 'Optional content text (e.g., transcript for videos)',
          },
        },
        required: ['url', 'category', 'title'],
      },
    },
    {
      name: 'get_links',
      description:
        'Retrieves saved links using lexical relevance plus category, subcategory, tag, and UTC date filters.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          stringQuery: {
            type: Type.STRING,
            description:
              'Natural-language terms matched across title, description, saved content, source, URL, and taxonomy.',
          },
          category: {
            type: Type.STRING,
            description: 'Exact category name, compared case-insensitively.',
          },
          subcategory: {
            type: Type.STRING,
            description: 'Exact subcategory name, compared case-insensitively.',
          },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Tag names that every result must contain.',
          },
          dateRange: {
            type: Type.OBJECT,
            properties: {
              from: {
                type: Type.STRING,
                description: 'Inclusive UTC start date in YYYY-MM-DD format.',
              },
              to: {
                type: Type.STRING,
                description: 'Inclusive UTC end date in YYYY-MM-DD format.',
              },
            },
          },
        },
      },
    },
  ],
};

// Chat system prompt template (from edge function)
const CHAT_SYSTEM_PROMPT = `# 🧠 AI System Prompt for Link Categorization Assistant

## 👤 Role

You are Dory AI, a **highly reliable, action-oriented AI assistant** embedded in a productivity app designed to help users **save, organize, and retrieve important links**.

**Your Personality & Rules:**
- Precise and methodical in analysis.
- Quick decision-maker when categorizing content.
- Analyze first and register only after successful analysis when a URL is provided.
- Default to practical, user-friendly categorization ("personal" as safe default).
- **Do not ask for permission to save a link.** If the user provides a URL, assume they want to save it and proceed immediately.
- Never engage in unnecessary conversation. Output structured function calls whenever possible.

Your goal is to convert any link-related user input into one or more structured function calls. You must always rely on existing data (provided below).

---

## 🕒 Current Context
Date and time: {current_datetime}

---

## 🎯 Primary Tasks

1. **Register Links**:
   - Interpret user input where they want to save a link.
   - Follow the two-step "Saving a Link" workflow below.

2. **Search Links**:
   - Interpret user inputs like "show me links about startups from last week" and convert into filter parameters:
     - stringQuery → searches title or description
     - category
     - subcategory
     - tags (array)
     - dateRange → from/to in YYYY-MM-DD
   - Output: A get_links function call with relevant fields only.

---

## ⚡️ Workflows

### Saving a Link (Two-Step Process)

To ensure high-quality data and a great user experience, saving a link is a two-step process orchestrated by you:

1.  **Analyze the URL**: When a user wants to save a link, your **first** action is to call the get_url_info function with the provided URL. This function will return structured metadata about the link, including a title, description, and a preview image URL.

2.  **Register the Link**: Only when get_url_info returns \`success: true\`, call register_link as your **second** action. If analysis fails, do not save the link. Use the successful get_url_info output to populate register_link.

    **CRITICAL MAPPING RULES:**
    -   Map urlMetadata.title to title parameter
    -   Map summary to description parameter  
    -   Map urlMetadata.image to img_preview parameter (ALWAYS include if present)
    -   Map transcript to content parameter (ALWAYS include if present - especially for social media videos)
    -   Map platform info to source parameter (e.g., "Instagram", "TikTok")
    -   Infer category, subcategory, and tags based on the user's initial prompt and the content summary.

    **IMPORTANT:** Always pass img_preview and content if they exist in the get_url_info response!

    **VERIFICATION CHECKLIST before calling register_link:**
    - ✅ Did get_url_info return urlMetadata.image? → Pass as img_preview
    - ✅ Did get_url_info return transcript? → Pass as content
    - ✅ Did get_url_info return platform? → Pass as source
    - ✅ Are all required fields (url, title, description, category) included?

    **ERROR HANDLING & FALLBACKS (If no suitable category or subcategory is found):**
    - **Always default to "personal" category**
    - **Use "general" subcategory**
    - **Add fewer, more generic tags**
    - **Do NOT ask for confirmation.** Make your best judgment, save the link, and inform the user.
---

## 🧠 Background Context

- Users often talk informally. You must **understand intent even from vague or casual input**.
- Use this normalized user context to **infer categories, subcategories, and tags**.
- You must always prioritize existing tags, categories, and subcategories (provided below).
- If you find no suitable match, default to "personal" category and "general" subcategory.
- **Do not ask the user for clarification** unless absolutely necessary to complete a search. If they send a link, just save it.

---

## 🗂️ Available Data

### Categories:
- {categories}

### Subcategories:
- {subcategories}

### Tags (user-defined, dynamically fetched from DB):
- {tags}

_Note: These will be passed to you in system prompt each time dynamically. Always match against these lists. Normalize using lowercase + trim._

---

## ⚙️ Function Call Definitions

### 1. register_link

\`\`\`json
{
  "name": "register_link",
  "description": "Registers a new saved link",
  "parameters": {
    "url": { "type": "string", "description": "The link to save" },
    "title": { "type": "string", "description": "User-defined title" },
    "description": {
      "type": "string",
      "description": "Short context or summary"
    },
    "category": {
      "type": "string",
      "description": "One of the known categories"
    },
    "subcategory": {
      "type": "string",
      "description": "Optional subcategory, also validated"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of tags"
    },
    "source": {
      "type": "string",
      "description": "Optional source (e.g., Twitter, YouTube)"
    },
    "img_preview": {
      "type": "string",
      "description": "Image preview URL"
    },
    "content": {
      "type": "string",
      "description": "Optional content text (e.g., transcript for videos)"
    }
  }
}
\`\`\`

### 2. get_links

\`\`\`json
{
  "name": "get_links",
  "description": "Fetches links using filters (not raw queries)",
  "parameters": {
    "stringQuery": {
      "type": "string",
      "description": "Ranks matches across title, description, saved content, source, URL, and taxonomy",
      "optional": true
    },
    "category": {
      "type": "string",
      "description": "Filter by category name",
      "optional": true
    },
    "subcategory": {
      "type": "string",
      "description": "Filter by subcategory name",
      "optional": true
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Filter by tag(s)",
      "optional": true
    },
    "dateRange": {
      "type": "object",
      "description": "Date filtering options",
      "properties": {
        "from": { "type": "string", "description": "Start date (YYYY-MM-DD)" },
        "to": { "type": "string", "description": "End date (YYYY-MM-DD)" }
      },
      "optional": true
    }
  }
}
\`\`\`

### 3. get_url_info

\`\`\`json
{
 "name": "get_url_info",
 "description": "Analyzes URLs and provides metadata. Instagram Reels and TikTok can use specialized media processing; YouTube long videos can use metadata and labeled captions. LinkedIn and X use guarded public metadata or an explicit URL-only fallback. Regular webpages use bounded public-HTML extraction.",
 "parameters": {
   "url": { "type": "string", "description": "The URL to analyze" },
   "focus": { "type": "string", "description": "Optional focus area for analysis" }
 }
}
\`\`\`

Use this when users ask for information about a specific URL, want to summarize a link, or need details about web content. This tool is especially powerful for social media videos as it provides transcripts and custom thumbnails.

---

## 💡 Gemini URL Context Tool (Built-in)

Gemini can ingest and analyze URLs directly to enhance responses. Use this context-aware tool to:

- Extract key data points from a link
- Compare across multiple links
- Summarize or synthesize link content
- Answer questions based on webpage content
- Analyze articles for specific outcomes (job posts, quizzes, insights, etc.)

Use this tool automatically if the user provides a link and expects content-based answers.

---

## ✅ Expected Output Behavior

- If the user provides a URL, execute the 2-step process immediately (get_url_info -> register_link). Do not say "Do you want me to save it?".
- Always fill parameters in the tool call with normalized values.
- Default missing required metadata intelligently.
- Structure output using tool calls primarily.
- After successfully saving a link, provide a short text summary acknowledging it was saved.

---
`;

export class AIService {
  /**
   * Ensure conversation starts with a user message for valid Gemini API flow
   * Finds the first user message and returns conversation from that point
   */
  private ensureStartsWithUserMessage(contents: any[]): any[] {
    // Find the first user message
    const firstUserIndex = contents.findIndex(
      (content) => content.role === 'user',
    );

    if (firstUserIndex === -1) {
      // No user messages found, return empty array (shouldn't happen in normal flow)
      console.log('⚠️ No user messages found in conversation history');
      return [];
    }

    if (firstUserIndex === 0) {
      // Already starts with user message, return as is
      console.log('✅ Conversation already starts with user message');
      return contents;
    }

    // Start conversation from first user message
    const trimmedContents = contents.slice(firstUserIndex);
    console.log(
      `🔄 Trimmed conversation: ${contents.length} → ${trimmedContents.length} messages (started from first user message at index ${firstUserIndex})`,
    );

    return trimmedContents;
  }

  /**
   * Unified chat message processing method (replaces edge function logic)
   */
  async processChatMessage(request: {
    message: string;
    sessionId: string;
    timeZone?: string;
    userId: string;
  }): Promise<ServiceResponse<{ reply: string; functionCalls?: any[] }>> {
    try {
      const { message, sessionId, timeZone = 'UTC', userId } = request;

      // Get user's categories, subcategories, and tags using Convex
      const [categoriesData, subCategoriesData, tagsData] = await Promise.all([
        convex.query(api.categories.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
        convex.query(api.subCategories.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
        convex.query(api.tags.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
      ]);

      const categories =
        categoriesData?.map((c: any) => c.name).join('\n- ') ||
        'personal\n- work\n- research\n- side-projects\n- girlfriend';
      const subcategories =
        subCategoriesData?.map((s: any) => s.name).join('\n- ') ||
        'travel\n- finance\n- tech\n- product\n- books\n- food';
      const tags =
        tagsData?.map((t: any) => t.name).join('\n- ') ||
        'startup\n- design\n- AI\n- python\n- recipes\n- fitness\n- product-management\n- investment';

      // Calculate last month date range for system prompt
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const fromDate = new Date(
        lastMonth.getFullYear(),
        lastMonth.getMonth(),
        1,
      )
        .toISOString()
        .split('T')[0];
      const toDate = new Date(
        lastMonth.getFullYear(),
        lastMonth.getMonth() + 1,
        0,
      )
        .toISOString()
        .split('T')[0];

      // Format current date time
      const now = new Date();
      const weekday = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        timeZone,
      }).format(now);
      const day = new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        timeZone,
      }).format(now);
      const month = new Intl.DateTimeFormat('en-GB', {
        month: 'long',
        timeZone,
      }).format(now);
      const year = new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        timeZone,
      }).format(now);
      const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone,
      }).format(now);
      const current_datetime = `${weekday}, ${day} ${month} ${year}, ${time} (${timeZone})`;

      // Create system instruction with user's data
      const systemInstruction = CHAT_SYSTEM_PROMPT.replace(
        '{categories}',
        categories,
      )
        .replace('{subcategories}', subcategories)
        .replace('{tags}', tags)
        .replace('2025-05-01', fromDate)
        .replace('2025-05-31', toDate)
        .replace('{current_datetime}', current_datetime);

      await convex.mutation(api.chat.saveMessage, {
        sessionId: sessionId as any,
        role: 'user',
        parts: [{ text: message }],
        secret: process.env.CONVEX_BACKEND_SECRET,
      });

      const historyDataRaw = await convex.query(
        api.chat.getMessagesForBackend,
        {
          sessionId: sessionId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        },
      );

      console.log(
        `📚 Retrieved ${historyDataRaw.length} messages from chat history`,
      );

      // Debug: Count messages by role
      const roleCounts = historyDataRaw.reduce(
        (acc: Record<string, number>, msg: any) => {
          acc[msg.role] = (acc[msg.role] || 0) + 1;
          return acc;
        },
        {},
      );
      console.log(`📊 Message counts by role:`, roleCounts);

      // Validate and fix conversation flow to prevent API errors
      const validatedHistory = [...historyDataRaw]; // Convex query returns ascending (oldest first) by default

      // Build contents array ensuring it starts with a user message
      const rawContents = validatedHistory.map((h: any) => ({
        role: h.role,
        parts: h.parts,
      }));

      // Find first user message and start conversation from there
      const contents = this.ensureStartsWithUserMessage(rawContents);

      console.log(`📝 Prepared ${contents.length} content items for AI`);

      let botReply = '';
      const functionCallsForClient: any[] = [];
      let continueConversation = true;
      let linkAnalysis = emptyLinkAnalysisState();
      let registrationAttempted = false;
      let retrievalCompleted = false;
      let toolRounds = 0;

      // Process conversation with function calls
      while (continueConversation) {
        toolRounds = nextChatToolRound(toolRounds);
        console.log(
          `🔄 AI call ${toolRounds} - ${contents.length} conversation items`,
        );

        const directive = selectChatToolDirective({
          message,
          linkAnalysis,
          registrationAttempted,
          retrievalCompleted,
        });
        const functionCallingConfig =
          directive.mode === 'tool'
            ? {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: [directive.name],
              }
            : directive.mode === 'text'
              ? { mode: FunctionCallingConfigMode.NONE }
              : undefined;

        const result = await genAI.models.generateContent({
          model: modelName,
          contents: contents as any,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: tools.functionDeclarations }],
            ...(functionCallingConfig
              ? { toolConfig: { functionCallingConfig } }
              : {}),
          },
        });

        const functionCalls = result.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          console.log(
            `🛠️ AI tool calls: ${functionCalls.map(({ name }) => name).join(', ')}`,
          );

          const functionCallParts = functionCalls.map((fc) => ({
            functionCall: fc,
          }));

          // Save function calls to chat history via Convex
          await convex.mutation(api.chat.saveMessage, {
            sessionId: sessionId as any,
            role: 'model',
            parts: functionCallParts,
            secret: process.env.CONVEX_BACKEND_SECRET,
          });

          contents.push({ role: 'model', parts: functionCallParts as any });

          const functionResponseParts: any[] = [];
          for (const fc of functionCalls) {
            let functionResponse: any;

            if (fc.name === 'register_link') {
              registrationAttempted = true;
              const guard = guardLinkRegistration(
                linkAnalysis,
                fc.args?.url,
              );
              if (guard.allowed) {
                functionResponse = await this.registerLink(userId, fc.args);
                linkAnalysis = recordLinkRegistration(
                  linkAnalysis,
                  fc.args?.url,
                  functionResponse,
                );
              } else {
                functionResponse = guard.response;
              }
            } else if (fc.name === 'get_links') {
              retrievalCompleted = true;
              const filters = coerceLinkRetrievalFilters(fc.args);
              const linksResult = await this.searchUserLinks(
                userId,
                filters,
                20,
              );
              functionResponse = linksResult.success
                ? {
                    links: linksResult.data,
                    retrieval: {
                      strategy: 'lexical-v1',
                      candidateWindow: 200,
                      returned: linksResult.data?.length ?? 0,
                    },
                  }
                : {
                    result: 'Search failed',
                    error: linksResult.error ?? 'Unknown retrieval failure',
                  };
            } else if (fc.name === 'get_url_info') {
              functionResponse = await this.getUrlInfo(
                fc.args?.url as string,
                fc.args?.focus as string,
              );
              linkAnalysis = recordLinkAnalysis(
                fc.args?.url,
                functionResponse,
                linkAnalysis,
              );
            }

            functionCallsForClient.push({
              function: {
                name: fc.name,
                result: functionResponse,
              },
            });

            functionResponseParts.push({
              functionResponse: {
                name: fc.name,
                response: functionResponse,
              },
            });
          }

          // Save function responses to chat history via Convex
          console.log(`💾 Saving function responses to database...`);
          await convex.mutation(api.chat.saveMessage, {
            sessionId: sessionId as any,
            role: 'function',
            parts: functionResponseParts,
            secret: process.env.CONVEX_BACKEND_SECRET,
          });
          console.log(`✅ Function responses saved successfully`);

          contents.push({
            role: 'function',
            parts: functionResponseParts as any,
          });
        } else {
          continueConversation = false;
          if (result.text) {
            botReply = result.text;
            // Save bot reply to chat history via Convex
            await convex.mutation(api.chat.saveMessage, {
              sessionId: sessionId as any,
              role: 'model',
              parts: [{ text: botReply }],
              secret: process.env.CONVEX_BACKEND_SECRET,
            });
          }
        }
      }

      return {
        success: true,
        data: {
          reply: botReply,
          functionCalls: functionCallsForClient,
        },
        message: 'Chat message processed successfully',
      };
    } catch (error: any) {
      console.error('Chat processing error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process chat message',
      };
    }
  }

  /**
   * Process quick save link with direct AI analysis and categorization
   */
  async processQuickSaveLink(
    request: QuickSaveLinkRequest,
  ): Promise<ServiceResponse<QuickSaveLinkResponse>> {
    try {
      const { url, title, description, userId } = request;

      console.log('Direct link save request received', {
        hasProvidedTitle: Boolean(title),
        hasProvidedDescription: Boolean(description),
      });

      // Get user's categories, subcategories, and tags using Convex
      const [categoriesData, subCategoriesData, tagsData] = await Promise.all([
        convex.query(api.categories.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
        convex.query(api.subCategories.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
        convex.query(api.tags.getByUser, {
          userId,
          secret: process.env.CONVEX_BACKEND_SECRET,
        }),
      ]);

      const categories =
        categoriesData?.map((c: any) => c.name).join('\n- ') ||
        'personal\n- work\n- research\n- side-projects';
      const subcategories =
        subCategoriesData?.map((s: any) => s.name).join('\n- ') ||
        'general\n- tech\n- finance\n- food';
      const tags =
        tagsData?.map((t: any) => t.name).join('\n- ') ||
        'startup\n- design\n- AI\n- recipes';

      // Create system prompt with user's data
      const systemPrompt = LINK_SAVING_SYSTEM_PROMPT.replace(
        '{categories}',
        categories,
      )
        .replace('{subcategories}', subcategories)
        .replace('{tags}', tags);

      // Create user message with context
      const userMessage = `Analyze and save this link:
URL: ${url}
${title ? `Provided Title: ${title}` : ''}
${description ? `Provided Description: ${description}` : ''}

Execute the two-step process to analyze and save this link with appropriate categorization.`;

      // Initialize conversation contents
      const contents: any[] = [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ];

      let continueConversation = true;
      let urlInfo: any = null;
      let linkResult: any = null;
      let conversationStep = 0;
      let linkAnalysis = emptyLinkAnalysisState();

      console.log('🚀 Starting AI conversation for link saving');

      // Sequential conversation loop
      while (continueConversation && conversationStep < 5) {
        conversationStep++;
        const result = await genAI.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: tools.functionDeclarations }],
          },
        });

        const functionCalls = result.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const functionCallParts = functionCalls.map((fc) => ({
            functionCall: fc,
          }));
          contents.push({ role: 'model', parts: functionCallParts });

          const functionResponseParts: any[] = [];
          for (const fc of functionCalls) {
            let functionResponse: any;
            if (fc.name === 'get_url_info') {
              urlInfo = await this.getUrlInfo(
                fc.args?.url as string,
                fc.args?.focus as string,
              );
              linkAnalysis = recordLinkAnalysis(
                fc.args?.url,
                urlInfo,
                linkAnalysis,
              );
              functionResponse = urlInfo;
            } else if (fc.name === 'register_link') {
              const guard = guardLinkRegistration(
                linkAnalysis,
                fc.args?.url,
              );
              if (guard.allowed) {
                functionResponse = await this.registerLink(userId, fc.args);
                linkAnalysis = recordLinkRegistration(
                  linkAnalysis,
                  fc.args?.url,
                  functionResponse,
                );
                if (!linkResult?.success) linkResult = functionResponse;
              } else {
                functionResponse = guard.response;
                if (!linkResult) linkResult = functionResponse;
              }
            } else {
              functionResponse = { success: false, error: 'Unknown function' };
            }
            functionResponseParts.push({
              functionResponse: { name: fc.name, response: functionResponse },
            });
          }
          contents.push({ role: 'function', parts: functionResponseParts });
        } else {
          continueConversation = false;
        }
      }

      // If AI didn't follow the two-step process, do fallback
      if (!urlInfo && !linkResult) {
        urlInfo = await this.getUrlInfo(url);
        linkAnalysis = recordLinkAnalysis(url, urlInfo, linkAnalysis);
        const guard = guardLinkRegistration(linkAnalysis, url);
        if (!guard.allowed) {
          throw new Error(`Failed to analyze link: ${guard.response.message}`);
        }
        const fallbackData = {
          url,
          title: title || urlInfo?.urlMetadata?.title || 'Saved Link',
          description:
            description || urlInfo?.summary || 'Link saved for later reference',
          category: 'personal',
          subcategory: 'general',
          tags: ['saved-link'],
          source: 'web',
          img_preview: urlInfo?.urlMetadata?.image || null,
        };
        linkResult = await this.registerLink(userId, fallbackData);
      }

      if (!linkResult) {
        const guard = guardLinkRegistration(linkAnalysis, url);
        if (!guard.allowed) {
          throw new Error(`Failed to analyze link: ${guard.response.message}`);
        }
        throw new Error('Failed to save link: no registration result');
      }

      if (!linkResult.success) {
        throw new Error(
          `Failed to save link: ${linkResult.error || 'Unknown error'}`,
        );
      }

      // Get the saved link data from registerLink response
      const savedLink = linkResult.data;

      return {
        success: true,
        data: {
          linkId: savedLink.id,
          duplicate: savedLink.duplicate === true,
          title: savedLink.title,
          description: savedLink.description || '',
          category: savedLink.category || 'personal',
          subcategory: savedLink.subcategory,
        },
        message: 'Link saved successfully with AI categorization',
      };
    } catch (error: any) {
      console.error('Direct link save error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process and save link',
      };
    }
  }

  /**
   * Analyze URL and get metadata (copied from edge function)
   */
  private async getUrlInfo(url: string, focus?: string): Promise<any> {
    try {
      const classifiedSource = classifySourceUrl(url);
      if (classifiedSource.kind === 'youtube-video') {
        try {
          const video = await extractYouTubeVideo(url);
          return {
            success: true,
            summary: video.description || video.title,
            urlMetadata: {
              title: video.title,
              description: video.description,
              image: video.thumbnailUrl,
            },
            transcript: video.transcript,
            transcriptLanguage: video.transcriptLanguage,
            transcriptSource: video.transcriptSource,
            transcriptTruncated: video.transcriptTruncated,
            platform: 'YouTube',
            channel: video.channel,
            duration: video.duration,
            sourceExtraction: describeSourceExtraction(
              url,
              'youtube-metadata',
            ),
            limitations: video.limitations,
          };
        } catch (error) {
          console.warn(
            'YouTube metadata extraction failed; using webpage fallback:',
            error,
          );
        }
      }

      if (
        classifiedSource.kind === 'linkedin' ||
        classifiedSource.kind === 'x'
      ) {
        const restricted = await extractRestrictedPlatform(url);
        const sourceExtraction = describeSourceExtraction(
          url,
          restricted.usedStrategy,
        );
        const limitations = sourceExtraction.limitation
          ? [sourceExtraction.limitation]
          : [];
        return {
          success: true,
          summary: restricted.summary,
          urlMetadata: {
            title: restricted.title,
            description: restricted.description,
            image: restricted.imageUrl,
          },
          platform: restricted.platform,
          contentAvailable: restricted.contentAvailable,
          extractionFailureCode: restricted.failureCode,
          sourceExtraction,
          limitations,
        };
      }

      // Check if this is a social media URL that needs special processing
      if (socialMediaService.isSocialMediaUrl(url)) {
        console.log(
          '🎬 Detected social media URL, processing with enhanced extraction...',
        );

        const socialResult =
          await socialMediaService.processSocialMediaVideo(url);

        if (socialResult.success && socialResult.info) {
          const { info } = socialResult;

          // Create enhanced prompt with transcript
          const enhancedPrompt = focus
            ? `Analyze this ${info.platform} video focusing on: ${focus}. 
               Title: ${info.title}
               Description: ${info.description}
               Transcript: ${info.transcript || 'No transcript available'}
               Duration: ${
                 info.duration
                   ? `${Math.round(info.duration)} seconds`
                   : 'Unknown'
               }
               URL: ${url}`
            : `Analyze this ${
                info.platform
              } video and provide a comprehensive summary including: main topic, key points, type of content, and any important details.
               Title: ${info.title}
               Description: ${info.description}
               Transcript: ${info.transcript || 'No transcript available'}
               Duration: ${
                 info.duration
                   ? `${Math.round(info.duration)} seconds`
                   : 'Unknown'
               }
               URL: ${url}`;

          // Get AI analysis with transcript context
          let aiSummary = '';
          try {
            const result = await genAI.models.generateContent({
              model: modelName,
              contents: enhancedPrompt,
              config: {
                tools: [{ urlContext: {} }],
              },
            });
            aiSummary = result.text || '';
          } catch (aiError) {
            console.error('AI analysis failed, using basic info:', aiError);
            aiSummary = `${info.platform} video: ${info.title}. ${info.description}`;
          }

          return {
            success: true,
            summary:
              aiSummary || info.description || `${info.platform} video content`,
            urlMetadata: {
              title: info.title || 'Untitled Video',
              description: info.description || '',
              image: info.thumbnailUrl || null,
            },
            transcript: info.transcript, // Include transcript for storage in content column
            platform: info.platform,
            duration: info.duration,
            sourceExtraction: describeSourceExtraction(url, 'short-video'),
          };
        } else {
          console.log(
            '🔄 Social media processing failed, falling back to standard method',
          );
          // Fall back to standard processing if social media processing fails
        }
      }

      // Standard webpage processing stays deterministic and bounded. Full page
      // text is not forwarded to Gemini without an explicit privacy decision.
      const page = await extractWebPage(url);
      const localSummary = page.description || page.text.slice(0, 500);
      const sourceExtraction = describeSourceExtraction(url, 'web-page');
      const limitations = [
        focus
          ? 'Focused AI summarization is not enabled for general webpages'
          : null,
        sourceExtraction.limitation,
      ].filter((limitation): limitation is string => limitation !== null);

      return {
        success: true,
        summary: localSummary,
        urlMetadata: {
          title: page.title,
          description: page.description,
          image: page.imageUrl,
        },
        finalUrl: page.finalUrl,
        provenance: page.provenance,
        sourceExtraction,
        limitations,
      };
    } catch (error: any) {
      console.error('Error analyzing URL:', error);
      return {
        success: false,
        error:
          error instanceof PublicResourceError
            ? `${error.code}: ${error.message}`
            : `Failed to analyze URL: ${error.message}`,
      };
    }
  }

  /**
   * Register link in database (copied from edge function)
   */
  private async registerLink(userId: string, args: any): Promise<any> {
    try {
      const {
        url,
        title,
        description,
        category: category_name,
        subcategory,
        tags,
        source,
        img_preview,
        content, // Add support for content (transcript)
      } = args;

      console.log('📥 Registering analyzed link', {
        source: typeof source === 'string' ? source : 'unknown',
        hasPreview: Boolean(img_preview),
        hasContent: Boolean(content),
      });

      const existingLink = await convex.query(
        api.links.findLinkByUrlForBackend,
        {
          userId: userId as any,
          url,
          secret: process.env.CONVEX_BACKEND_SECRET,
        },
      );
      if (existingLink?.linkId) {
        return {
          success: true,
          data: { id: existingLink.linkId, ...args, duplicate: true },
        };
      }

      // Quota enforcement (friendly message)
      try {
        const plan: any = await convex.query(api.billing.getPlanForBackend, {
          userId: userId as any,
          secret: process.env.CONVEX_BACKEND_SECRET,
        });

        if (plan && plan.used >= plan.limit) {
          const upgradeMsg =
            plan.plan === 'free'
              ? `🚀 Free plan limit reached (${plan.limit} links). Upgrade to Premium for a higher link limit.`
              : `⚠️ You've reached your current subscription period limit (${
                  plan.limit
                }). It resets on ${new Date(plan.period.end).toLocaleDateString(
                  'en-US',
                )} (UTC).`;
          return {
            success: false,
            error: 'LINK_QUOTA_EXCEEDED',
            message: upgradeMsg,
          };
        }
      } catch (quotaErr) {
        console.error('Quota check error (continuing):', quotaErr);
      }

      // Call Convex mutation to register the link
      const result = await convex.mutation(api.links.registerLinkForBackend, {
        userId: userId as any,
        url,
        title,
        description,
        category: category_name,
        subcategory,
        tags,
        secret: process.env.CONVEX_BACKEND_SECRET,
        source,
        imgPreview: img_preview,
        content,
      });

      if (!result.success || !result.linkId) {
        throw new Error('Failed to register link in Convex');
      }

      console.log('🎉 Link registration completed successfully', {
        duplicate: result.duplicate === true,
      });

      // If we have a remote preview, enqueue background thumbnail processing
      if (img_preview && result.linkId && !result.duplicate) {
        enqueueThumbnailJob({
          userId,
          linkId: result.linkId,
          sourceUrl: img_preview,
        }).catch((e: unknown) =>
          console.warn('enqueueThumbnailJob failed:', e),
        );
      }

      return {
        success: true,
        data: { id: result.linkId, ...args, duplicate: result.duplicate === true },
      };
    } catch (error: any) {
      console.error('Register link error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's recent links
   */
  async getUserRecentLinks(
    userId: string,
    limit: number = 10,
  ): Promise<ServiceResponse<any[]>> {
    try {
      const links = await convex.query(api.links.getRecentLinksForUser, {
        userId: userId as any,
        limit,
        secret: process.env.CONVEX_BACKEND_SECRET,
      });

      return {
        success: true,
        data: links || [],
        message: 'Recent links retrieved successfully',
      };
    } catch (error: any) {
      console.error('Get recent links error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve recent links',
      };
    }
  }

  /**
   * Search a bounded recent candidate set using deterministic lexical ranking.
   */
  async searchUserLinks(
    userId: string,
    filters: LinkRetrievalFilters,
    limit: number = 20,
  ): Promise<ServiceResponse<PresentedLinkRetrievalResult[]>> {
    const candidates = await this.getUserRecentLinks(userId, 200);
    if (!candidates.success) return candidates;

    try {
      return {
        success: true,
        data: presentRetrievedLinks(
          retrieveLinks(
            (candidates.data ?? []) as LinkRetrievalRecord[],
            filters,
            limit,
          ),
        ),
        message: 'Links retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Retrieval failed',
        message: 'Failed to retrieve links',
      };
    }
  }

  /**
   * Get recent messages from a session
   */
  async getSessionMessages(
    sessionId: string,
    limit: number = 10,
  ): Promise<any[]> {
    // Changed return type to any[] for now as ChatMessage type might differ
    try {
      // Use Convex to get messages
      // We use getMessagesForBackend which is an internal query
      const messages = await convex.query(api.chat.getMessagesForBackend, {
        sessionId: sessionId as any,
        secret: process.env.CONVEX_BACKEND_SECRET,
      });
      return messages.slice(0, limit);
    } catch (error) {
      console.error('Get session messages error:', error);
      return [];
    }
  }
}

export const aiService = new AIService();
