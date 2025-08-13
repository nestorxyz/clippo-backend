import { supabaseAdmin } from '../config/supabase';
import { ServiceResponse } from '../types';
import { sessionManager } from '../utils/session';
import { Tables } from '../types/supabase';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import fetch from 'node-fetch';

type ChatMessage = Tables<'chat_messages'>;

interface ChatRequest {
  message: string;
  phoneNumber: string;
  userId: string;
}

interface ChatResponse {
  reply: string;
  sessionId: string;
}

interface QuickSaveLinkRequest {
  url: string;
  title?: string;
  description?: string;
  userId: string;
}

interface QuickSaveLinkResponse {
  linkId: string;
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
const modelName = 'gemini-2.5-flash-preview-05-20';

// System prompt template for direct link saving
const LINK_SAVING_SYSTEM_PROMPT = `# 🔗 Link Analysis and Categorization Specialist

## 👤 YOUR ROLE & IDENTITY

You are a **Link Analysis and Categorization Specialist** embedded in a productivity application called Clippo. You are a highly reliable, focused AI assistant whose **single, primary responsibility** is to analyze URLs and save them with proper categorization, titles, descriptions, and tags.

**Your Personality:**
- Precise and methodical in analysis
- Quick decision-maker when categorizing content
- Always follow the two-step process religiously
- Default to practical, user-friendly categorization
- Never engage in conversation - you are action-oriented

---

## 🎯 YOUR PRIMARY TASK

**MISSION:** Analyze any provided URL and save it as a structured link with appropriate metadata.

**SUCCESS CRITERIA:**
1. Always execute the two-step process (get_url_info → register_link)
2. Provide meaningful titles and descriptions based on content analysis
3. Assign appropriate categories, subcategories, and tags
4. Default to "personal" category when uncertain
5. Complete the task in exactly 2 function calls, then STOP and provide a summary
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
- **Required:** You MUST call this function second, always, no exceptions

**CRITICAL RULES:** 
- Never skip Step 1. Never call register_link without first calling get_url_info.
- After successful register_link, STOP function calling and provide a text summary.
- Never call the same function twice - once get_url_info and register_link succeed, your job is DONE.

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
    "img_preview": { "type": "string", "optional": true }
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

### Example 2: Recipe Link
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
- **Still proceed** with registration using provided user context
- **Use user-provided title** or extract from URL
- **Set category to "personal"** as safe default
- **Add "needs-review" tag** to flag for user attention

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

1. **Execute exactly 2 function calls** (get_url_info → register_link), then STOP
2. **After successful register_link, respond with text summary** - NO MORE FUNCTIONS
3. **Always provide title and description** - never leave empty
4. **Default to "personal" category** when uncertain
5. **Respect user's existing taxonomy** - don't create unless necessary
6. **Complete the task** regardless of URL access issues
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
- [ ] Image preview is included if available

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
        'Analyzes a URL and provides a summary and key information about its content',
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
        },
        required: ['url', 'category', 'title'],
      },
    },
  ],
};

export class AIService {
  /**
   * Process chat message from WhatsApp user
   */
  async processWhatsAppMessage(
    request: ChatRequest
  ): Promise<ServiceResponse<ChatResponse>> {
    try {
      // Get or create session for user
      const sessionResult = await sessionManager.getOrCreateSession(
        request.userId
      );

      if (!sessionResult.success || !sessionResult.data) {
        throw new Error('Failed to get session');
      }

      const sessionId = sessionResult.data.sessionId;

      // Call the existing gemini-chat Edge Function with service role and userId
      const { data, error } = await supabaseAdmin.functions.invoke(
        'gemini-chat',
        {
          body: {
            message: request.message,
            sessionId: sessionId,
            timeZone: 'UTC',
            userId: request.userId, // Pass userId for service role access
          },
        }
      );

      if (error) {
        console.error('Edge Function error:', error);
        throw error;
      }

      const aiReply =
        data?.reply || "I couldn't process your request. Please try again.";

      return {
        success: true,
        data: {
          reply: aiReply,
          sessionId,
        },
        message: 'Message processed successfully',
      };
    } catch (error: any) {
      console.error('AI processing error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process message',
      };
    }
  }

  /**
   * Process quick save link with direct AI analysis and categorization
   */
  async processQuickSaveLink(
    request: QuickSaveLinkRequest
  ): Promise<ServiceResponse<QuickSaveLinkResponse>> {
    try {
      const { url, title, description, userId } = request;

      console.log('Direct link save request:', request);

      // Get user's existing categories, subcategories, and tags
      const [categoriesResult, subcategoriesResult, tagsResult] =
        await Promise.all([
          supabaseAdmin.from('categories').select('name').eq('user_id', userId),
          supabaseAdmin
            .from('sub_categories')
            .select('name')
            .eq('user_id', userId),
          supabaseAdmin.from('tags').select('name').eq('user_id', userId),
        ]);

      const categories =
        categoriesResult.data?.map((c) => c.name).join('\n- ') ||
        'personal\n- work\n- research\n- side-projects';
      const subcategories =
        subcategoriesResult.data?.map((s) => s.name).join('\n- ') ||
        'general\n- tech\n- finance\n- food';
      const tags =
        tagsResult.data?.map((t) => t.name).join('\n- ') ||
        'startup\n- design\n- AI\n- recipes';

      // Create system prompt with user's data
      const systemPrompt = LINK_SAVING_SYSTEM_PROMPT.replace(
        '{categories}',
        categories
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

      console.log('🚀 Starting AI conversation for link saving');
      console.log('📝 User message:', userMessage);

      // Sequential conversation loop (like edge function)
      while (continueConversation && conversationStep < 5) {
        conversationStep++;
        console.log(
          `\n🔄 Conversation step ${conversationStep} contents:`,
          JSON.stringify(contents, null, 2)
        );

        const result = await genAI.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: tools.functionDeclarations }],
          },
        });

        console.log('🤖 AI Response received');
        console.log('📞 Function calls:', result.functionCalls?.length || 0);

        const functionCalls = result.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
          // Add AI's function calls to conversation
          const functionCallParts = functionCalls.map((fc) => ({
            functionCall: fc,
          }));
          contents.push({ role: 'model', parts: functionCallParts });

          // Execute function calls and collect responses
          const functionResponseParts = [];
          for (const fc of functionCalls) {
            let functionResponse;
            if (fc.name === 'get_url_info') {
              urlInfo = await this.getUrlInfo(
                fc.args?.url as string,
                fc.args?.focus as string
              );
              functionResponse = urlInfo;
            } else if (fc.name === 'register_link') {
              linkResult = await this.registerLink(userId, fc.args);
              functionResponse = linkResult;
            } else {
              console.log('❌ Unknown function:', fc.name);
              functionResponse = { success: false, error: 'Unknown function' };
            }

            functionResponseParts.push({
              functionResponse: { name: fc.name, response: functionResponse },
            });
          }

          // Add function responses to conversation
          contents.push({ role: 'function', parts: functionResponseParts });
        } else {
          console.log('🏁 No more function calls - ending conversation');
          continueConversation = false;
          if (result.text) {
            console.log('💬 Final AI text response:', result.text);
          }
        }
      }

      console.log('\n📊 Final Results:');
      console.log('🔍 URL Info available:', !!urlInfo);
      console.log('💾 Link saved:', !!linkResult?.success);

      // If AI didn't follow the two-step process, handle it
      if (!urlInfo && !linkResult) {
        console.log('⚠️ AI did not complete two-step process - using fallback');
        // Fallback: do the two-step process manually
        urlInfo = await this.getUrlInfo(url);
        console.log('🔍 Fallback URL Info:', JSON.stringify(urlInfo, null, 2));

        // Create fallback registration data
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

        console.log(
          '💾 Fallback registration data:',
          JSON.stringify(fallbackData, null, 2)
        );
        linkResult = await this.registerLink(userId, fallbackData);
        console.log(
          '💾 Fallback link result:',
          JSON.stringify(linkResult, null, 2)
        );
      } else if (!linkResult) {
        console.log(
          '⚠️ URL info available but no link saved - this should not happen'
        );
        console.log('🔍 Available URL Info:', JSON.stringify(urlInfo, null, 2));
      }

      if (!linkResult || !linkResult.success) {
        console.error('❌ Failed to save link');
        console.error('📊 Link result:', JSON.stringify(linkResult, null, 2));
        console.error('📊 URL info:', JSON.stringify(urlInfo, null, 2));
        throw new Error(
          `Failed to save link: ${linkResult?.error || 'Unknown error'}`
        );
      }

      console.log('✅ Link saved successfully!');

      // Get the saved link data to return
      const { data: savedLink, error: fetchError } = await supabaseAdmin
        .from('links')
        .select(
          `
           id,
           title,
           description,
           sub_categories (
             name,
             categories (name)
           ),
           link_tags (
             tags (name)
           )
         `
        )
        .eq('id', linkResult.data.id)
        .single();

      if (fetchError || !savedLink) {
        throw new Error('Failed to fetch saved link data');
      }

      return {
        success: true,
        data: {
          linkId: savedLink.id,
          title: savedLink.title,
          description: savedLink.description || '',
          category: savedLink.sub_categories?.categories?.name || 'personal',
          subcategory: savedLink.sub_categories?.name,
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
      const prompt = focus
        ? `Analyze this URL and provide detailed information focusing on: ${focus}. URL: ${url}`
        : `Analyze this URL and provide a comprehensive summary including: main topic, key points, type of content, and any important details. URL: ${url}`;

      // Get OpenGraph metadata (simplified version)
      let ogMetadata: any = {};
      try {
        const response = await fetch(url);
        const html = await response.text();

        // Simple regex to extract basic metadata
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const descMatch = html.match(
          /<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i
        );
        const imageMatch = html.match(
          /<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i
        );

        ogMetadata = {
          title: titleMatch?.[1] || '',
          description: descMatch?.[1] || '',
          image: imageMatch?.[1] || '',
        };
      } catch (err) {
        console.error('Failed to fetch URL metadata:', err);
      }

      const result = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          tools: [{ urlContext: {} }],
        },
      });
      const responseText = result.text || (ogMetadata as any).description || '';

      const finalResult = {
        success: true,
        summary: responseText || ogMetadata.description || '',
        urlMetadata: {
          title: ogMetadata.title || 'Untitled',
          description: ogMetadata.description || '',
          image: ogMetadata.image || null,
        },
      };

      return finalResult;
    } catch (error: any) {
      console.error('Error analyzing URL:', error);
      return {
        success: false,
        error: `Failed to analyze URL: ${error.message}`,
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
      } = args;

      // Quota enforcement (friendly message)
      try {
        const { subscriptionService } = await import(
          './subscription.service.js'
        );
        const plan = await subscriptionService.getEnrichedPlan(userId);
        if (plan.used >= plan.limit) {
          const upgradeMsg =
            plan.plan === 'free'
              ? `🚀 Free plan limit reached (${plan.limit} links). Upgrade to Premium for 200 links each period and unlimited organization power.`
              : `⚠️ You've reached your current subscription period limit (${
                  plan.limit
                }). It resets on ${new Date(plan.period.end).toLocaleDateString(
                  'en-US'
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

      const sub_category_name = subcategory || 'general';

      // Get or create category
      let { data: category } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('name', category_name)
        .eq('user_id', userId)
        .maybeSingle();

      if (!category) {
        const { data: newCategory, error: newCatError } = await supabaseAdmin
          .from('categories')
          .insert({ name: category_name, user_id: userId })
          .select('id')
          .single();
        if (newCatError) throw newCatError;
        category = newCategory;
      }

      // Get or create subcategory
      let { data: subCategory } = await supabaseAdmin
        .from('sub_categories')
        .select('id')
        .eq('name', sub_category_name)
        .eq('category_id', category.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!subCategory) {
        console.log('🆕 Creating new subcategory:', sub_category_name);
        const { data: newSubCategory, error: newSubCatError } =
          await supabaseAdmin
            .from('sub_categories')
            .insert({
              name: sub_category_name,
              category_id: category.id,
              user_id: userId,
            })
            .select('id')
            .single();
        if (newSubCatError) throw newSubCatError;
        subCategory = newSubCategory;
      }
      // Create the link
      const { data: newLink, error: linkError } = await supabaseAdmin
        .from('links')
        .insert({
          url,
          description,
          sub_category_id: subCategory.id,
          user_id: userId,
          title,
          source,
          img_preview,
        })
        .select(
          'id, title, description, sub_categories (name, categories (name)), link_tags (tags (name))'
        )
        .single();

      if (linkError) {
        console.error('❌ Link creation error:', linkError);
        return { success: false, error: linkError.message };
      }
      if (!newLink) {
        console.error('❌ No link data returned');
        return { success: false, error: 'Failed to create link.' };
      }

      // Handle tags if provided
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const tagObjects = tags
          .map((tagName: string) => ({
            name: String(tagName).trim().toLowerCase(),
            user_id: userId,
          }))
          .filter((t) => t.name.length > 0);

        if (tagObjects.length > 0) {
          const { data: upsertedTags, error: tagsUpsertError } =
            await supabaseAdmin
              .from('tags')
              .upsert(tagObjects, { onConflict: 'user_id, name' })
              .select('id');

          if (tagsUpsertError) {
            console.error('Error upserting tags:', tagsUpsertError);
          } else if (upsertedTags) {
            const linkTagRelations = upsertedTags.map(
              (tag: { id: string }) => ({
                link_id: newLink.id,
                tag_id: tag.id,
              })
            );

            const { error: linkTagsError } = await supabaseAdmin
              .from('link_tags')
              .insert(linkTagRelations);

            if (linkTagsError) {
              console.error(
                'Error creating link-tag associations:',
                linkTagsError
              );
            }
          }
        }
      }

      console.log('🎉 Link registration completed successfully!');
      return { success: true, data: newLink };
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
    limit: number = 10
  ): Promise<ServiceResponse<any[]>> {
    try {
      const { data, error } = await supabaseAdmin
        .from('links')
        .select(
          `
          id,
          title,
          url,
          description,
          created_at,
          categories (
            id,
            name,
            color
          ),
          subcategories (
            id,
            name
          )
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return {
        success: true,
        data: data || [],
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
   * Get recent messages from a session
   */
  async getSessionMessages(
    sessionId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Get session messages error:', error);
      return [];
    }
  }
}

export const aiService = new AIService();
