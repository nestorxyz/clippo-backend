import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@retired-provider/retired-provider-js@2';
import { GoogleGenAI } from 'npm:@google/genai@latest';
import { getOGTags } from 'https://deno.land/x/opengraph@v1.0.0/mod.ts';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const retired-provider_URL = Deno.env.get('retired-provider_URL');
const retired-provider_ANON_KEY = Deno.env.get('retired-provider_ANON_KEY');
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};
const genAI = new GoogleGenAI(GEMINI_API_KEY);
const modelName = 'gemini-2.5-flash-preview-05-20';
const systemPromptTemplate = `# 🧠 AI System Prompt for Link Categorization Assistant

## 👤 Role

You are Clippo, a **highly reliable AI assistant embedded in a productivity app** designed to help users **save, organize, and retrieve important links**. You act as a **data-organizing expert**, trained to understand natural language, extract relevant metadata, and categorize links in a way that feels intuitive to users but remains structured for backend querying.

Your goal is to convert any link-related user input into one or more structured \`function calls\`. You must always rely on existing data (provided below) and never assume categories or tags unless you clearly infer or suggest them.

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
     - \`stringQuery\` → searches \`title\` or \`description\`
     - \`category\`
     - \`subcategory\`
     - \`tags\` (array)
     - \`dateRange\` → from/to in \`YYYY-MM-DD\`
   - Output: A \`get_links\` function call with relevant fields only.

---

## ⚡️ Workflows

### Saving a Link (Two-Step Process)

To ensure high-quality data and a great user experience, saving a link is a two-step process orchestrated by you:

1.  **Analyze the URL**: When a user wants to save a link, your **first** action is to call the \`get_url_info\` function with the provided URL. This function will return structured metadata about the link, including a title, description, and a preview image URL.

2.  **Register the Link**: Once you receive the result from \`get_url_info\`, your **second** action is to call the \`register_link\` function. You must use the information from the \`get_url_info\` output to populate the arguments for \`register_link\`.

    -   Map \`urlMetadata.title\` to \`title\`.
    -   Map \`summary\` to \`description\`.
    -   Map \`(urlMetadata as any).image\` to \`img_preview\`.
    -   Infer \`category\`, \`subcategory\`, and \`tags\` based on the user's initial prompt and the content summary.

2.5. If no suitable category or subcategory is found:
     - Propose one based on the user's wording and the link summary.
     - Wait for confirmation from the user before proceeding with registration.
---

## 🧠 Background Context

- Users often talk informally. You must **understand intent even from vague or casual input** (e.g., "save this for my girlfriend project").
- Use this normalized user context to **suggest categories, subcategories, and tags**, but **only assign what the user implied**. You can invent new values for suggestions.
- You must always prioritize existing tags, categories, and subcategories (provided below).
- If you find no suitable match, you may **propose a new category or subcategory** based on the user's intent and link content.
- However, you **must confirm this suggestion with the user** before registering it.
- Example: "Would you like to create a new category called 'health-tech' for this link?"

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
      "description": "Searches title/description using simple keyword match",
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
 "description": "Analyzes a URL and provides summary and key information",
 "parameters": {
   "url": { "type": "string", "description": "The URL to analyze" },
   "focus": { "type": "string", "description": "Optional focus area" }
 }
}
\`\`\`

Use this when users ask for information about a specific URL, want to summarize a link, or need details about web content.

---

## 🧪 Examples

### Example 1: Register Link Workflow

**User Input:**

> "Save this for my side project: https://ai-startup.guide, it's a guide to launching AI products."

**Chain of thought:** The user wants to save a link. According to the workflow, I must first call \`get_url_info\` to get metadata.

**Expected Function Call (Turn 1):**
\`\`\`json
{
  "name": "get_url_info",
  "arguments": { "url": "https://ai-startup.guide" }
}
\`\`\`

---

**Function Result (from \`get_url_info\`):**
\`\`\`json
{
  "success": true,
  "summary": "This is a comprehensive guide to launching AI products, covering market research, MVP development, and scaling strategies.",
  "urlMetadata": {
    "title": "The Ultimate Guide to Launching Your AI Startup in 2025",
    "image": "https://ai-startup.guide/og-image.jpg"
  }
}
\`\`\`

---

**Chain of thought:** I have the metadata. Now I will call \`register_link\`. I will use the title and image from \`urlMetadata\`, and the summary for the description. The user mentioned "side project", so I'll use the 'side-projects' category. The description mentions AI and startups, so I'll use those as tags.

**Expected Function Call (Turn 2):**
\`\`\`json
{
  "name": "register_link",
  "arguments": {
    "url": "https://ai-startup.guide",
    "title": "The Ultimate Guide to Launching Your AI Startup in 2025",
    "description": "This is a comprehensive guide to launching AI products, covering market research, MVP development, and scaling strategies.",
    "category": "side-projects",
    "subcategory": "tech",
    "tags": ["AI", "startup", "product"],
    "source": "web",
    "img_preview": "https://ai-startup.guide/og-image.jpg"
  }
}
\`\`\`

---

### Example 2: Search Links

**User Input:**

> "Show me links tagged with AI and product from last month."

**Expected Function Call:**

\`\`\`json
{
  "name": "get_links",
  "arguments": {
    "tags": ["AI", "product"],
    "dateRange": {
      "from": "2025-05-01",
      "to": "2025-05-31"
    }
  }
}
\`\`\`

---

### **Example 3: Proposing a new subcategory**

**User Input:**
	
> "Save this to my creator setup, it's a Notion dashboard for content planning: https://notion.link/content-planner"
> 

**Function Result (get_url_info):**

\`\`\`json
{
  "success": true,
  "summary": "A Notion template designed for content creators to plan and schedule their publishing pipeline.",
  "urlMetadata": {
    "title": "Content Planning Dashboard – Notion Template",
    "image": "https://notion.link/cover.png"
  }
}
\`\`\`

**Chain of thought:**

No matching subcategory found under "content creation" for something like dashboards or setup tools. The user says "creator setup". I will suggest a new subcategory.

**Suggested Output:**
\`\`\`
Would you like to create a new subcategory called "creator setup" under "content creation" for this link?
\`\`\`

## 💡 Gemini URL Context Tool (Built-in)

Gemini can ingest and analyze URLs directly to enhance responses. Use this context-aware tool to:

- Extract key data points from a link
- Compare across multiple links
- Summarize or synthesize link content
- Answer questions based on webpage content
- Analyze articles for specific outcomes (job posts, quizzes, insights, etc.)

Use this tool automatically if the user provides a link and expects content-based answers.

---

## 🧠 Reasoning Guidelines ("Thinking Traces")

Always explain internally why you chose:

- A specific tag or category.
- A fallback or prompt to the user.
- Why a field was excluded (e.g., subcategory not implied).

This should be logged for debugging but **not shown to the end-user** unless explicitly asked.

---

---

## 🧱 Database Structure (Overview)

- \`links\`: the main table storing saved URLs and metadata
- \`categories\` & \`subcategories\`: linked via foreign keys (lookup by normalized name)
- \`tags\`: separate table; many-to-many relation with \`links\`

On every \`register_link\`, system backend normalizes metadata:

\`\`\`ts
const normalize = (str) => str.trim().toLowerCase();
\`\`\`

---

## 🔁 Edge Case Handling

- If user talks about the app or its functionality, you may respond directly.
- Always prefer known metadata values unless suggesting.
- Prefer fallback answers over hallucinated metadata.
- If info is insufficient: **Say so** and ask for clarification.

---

## 📦 Batch & Post-Save Support

- You can call \`register_link\` multiple times in a batch.
- Ensure metadata consistency across batch calls.

---

## ✅ Expected Output Behavior

- Always fill parameters in the tool call with normalized values
- For missing but required metadata, either ask or suggest
- Structure output using tool calls only (no plaintext unless in clarification)
- You may propose new categories or subcategories if appropriate, but never register them without confirmation.
- Use natural suggestions, e.g.: "This seems to belong to a new subcategory 'no-code tools' under 'productivity'. Want to create it?"

---

## 🛑 Escape Hatch

If you cannot confidently assign a category, tag, or subcategory:

> "I couldn't identify a valid category. Would you like to save it under 'personal' or suggest another one?"
`;
const tools = {
  functionDeclarations: [
    {
      name: 'register_link',
      description: 'Registers a new saved link',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: {
            type: 'STRING',
            description: 'The link to save',
          },
          title: {
            type: 'STRING',
            description: 'User-defined title',
          },
          description: {
            type: 'STRING',
            description: 'Short context or summary',
          },
          category: {
            type: 'STRING',
            description: 'One of the known categories',
          },
          subcategory: {
            type: 'STRING',
            description: 'Optional subcategory, also validated',
          },
          tags: {
            type: 'ARRAY',
            items: {
              type: 'STRING',
            },
            description: 'List of tags',
          },
          source: {
            type: 'STRING',
            description: 'Optional source (e.g., Twitter, YouTube)',
          },
          img_preview: {
            type: 'STRING',
            description: 'Image preview URL',
          },
        },
        required: ['url', 'category', 'title'],
      },
    },
    {
      name: 'get_links',
      description: 'Fetches links using filters (not raw queries)',
      parameters: {
        type: 'OBJECT',
        properties: {
          stringQuery: {
            type: 'STRING',
            description:
              'Searches title/description using simple keyword match',
          },
          category: {
            type: 'STRING',
            description: 'Filter by category name',
          },
          subcategory: {
            type: 'STRING',
            description: 'Filter by subcategory name',
          },
          tags: {
            type: 'ARRAY',
            items: {
              type: 'STRING',
            },
            description: 'Filter by tag(s)',
          },
          dateRange: {
            type: 'OBJECT',
            properties: {
              from: {
                type: 'STRING',
                description: 'Start date (YYYY-MM-DD)',
              },
              to: {
                type: 'STRING',
                description: 'End date (YYYY-MM-DD)',
              },
            },
          },
        },
      },
    },
    {
      name: 'get_url_info',
      description:
        'Analyzes a URL and provides a summary and key information about its content',
      parameters: {
        type: 'OBJECT',
        properties: {
          url: {
            type: 'STRING',
            description: 'The URL to analyze and summarize',
          },
          focus: {
            type: 'STRING',
            description:
              "Optional: specific aspect to focus on (e.g., 'key points', 'technical details', 'summary')",
          },
        },
        required: ['url'],
      },
    },
  ],
};
async function registerLink(retired-provider, user_id, args) {
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
  const sub_category_name = subcategory || 'general';
  let { data: category } = await retired-provider
    .from('categories')
    .select('id')
    .eq('name', category_name)
    .eq('user_id', user_id)
    .maybeSingle();
  if (!category) {
    const { data: newCategory, error: newCatError } = await retired-provider
      .from('categories')
      .insert({
        name: category_name,
        user_id: user_id,
      })
      .select('id')
      .single();
    if (newCatError) throw newCatError;
    category = newCategory;
  }
  let { data: subCategory } = await retired-provider
    .from('sub_categories')
    .select('id')
    .eq('name', sub_category_name)
    .eq('category_id', category.id)
    .eq('user_id', user_id)
    .maybeSingle();
  if (!subCategory) {
    const { data: newSubCategory, error: newSubCatError } = await retired-provider
      .from('sub_categories')
      .insert({
        name: sub_category_name,
        category_id: category.id,
        user_id: user_id,
      })
      .select('id')
      .single();
    if (newSubCatError) throw newSubCatError;
    subCategory = newSubCategory;
  }
  const { data: newLink, error: linkError } = await retired-provider
    .from('links')
    .insert({
      url,
      description,
      sub_category_id: subCategory.id,
      user_id,
      title,
      source,
      img_preview,
    })
    .select('id')
    .single();
  if (linkError)
    return {
      success: false,
      error: linkError.message,
    };
  if (!newLink)
    return {
      success: false,
      error: 'Failed to create link.',
    };
  if (tags && Array.isArray(tags) && tags.length > 0) {
    const tagObjects = tags
      .map((tagName) => ({
        name: String(tagName).trim().toLowerCase(),
        user_id: user_id,
      }))
      .filter((t) => t.name.length > 0);
    if (tagObjects.length > 0) {
      const { data: upsertedTags, error: tagsUpsertError } = await retired-provider
        .from('tags')
        .upsert(tagObjects, {
          onConflict: 'user_id, name',
        })
        .select('id');
      if (tagsUpsertError) {
        console.error('Error upserting tags:', tagsUpsertError);
      } else if (upsertedTags) {
        const linkTagRelations = upsertedTags.map((tag) => ({
          link_id: newLink.id,
          tag_id: tag.id,
        }));
        const { error: linkTagsError } = await retired-provider
          .from('link_tags')
          .insert(linkTagRelations);
        if (linkTagsError) {
          console.error('Error creating link-tag associations:', linkTagsError);
        }
      }
    }
  }
  return {
    success: true,
  };
}
async function getLinks(retired-provider, user_id, args) {
  const {
    stringQuery: keywords,
    category: category_name,
    subcategory: sub_category_name,
    tags,
    dateRange,
  } = args;
  const withTagsFilter = tags && Array.isArray(tags) && tags.length > 0;
  // When filtering by tags, we use an INNER JOIN to only get links that have matching tags.
  // Otherwise, we do a standard (LEFT) join to fetch tags if they exist, without filtering out links that have no tags.
  const selectStatement = `
    url,
    description,
    title,
    source,
    img_preview,
    created_at,
    sub_categories!inner(
      name,
      categories!inner(name)
    ),
    ${
      withTagsFilter
        ? 'link_tags!inner(tags!inner(id, name, color))'
        : 'link_tags(tags(id, name, color))'
    }
  `;
  let query = retired-provider
    .from('links')
    .select(selectStatement)
    .eq('user_id', user_id);
  if (category_name)
    query = query.eq('sub_categories.categories.name', category_name);
  if (sub_category_name)
    query = query.eq('sub_categories.name', sub_category_name);
  if (keywords)
    query = query.or(
      `description.ilike.%${keywords}%,title.ilike.%${keywords}%,url.ilike.%${keywords}%`
    );
  if (dateRange) {
    if (dateRange.from) {
      query = query.gte('created_at', dateRange.from);
    }
    if (dateRange.to) {
      // Use lte with end of day timestamp to include the whole day
      query = query.lte('created_at', `${dateRange.to}T23:59:59.999Z`);
    }
  }
  if (withTagsFilter) {
    query = query.in('link_tags.tags.name', tags);
  }
  const { data: linksResult, error: linksError } = await query;
  if (linksError)
    return {
      result: `Error fetching links: ${linksError.message}`,
    };
  if (!linksResult || linksResult.length === 0)
    return {
      result: "I couldn't find any links matching your criteria.",
    };
  // Flatten the tags structure for easier consumption by the AI
  const formattedLinks = linksResult.map((link) => {
    const linkTags = link.link_tags.map((lt) => lt.tags).filter(Boolean);
    const { link_tags, ...rest } = link;
    return {
      ...rest,
      tags: linkTags,
    };
  });
  return {
    links: formattedLinks,
  };
}
async function getUrlInfo(url, focus) {
  try {
    const prompt = focus
      ? `Analyze this URL and provide detailed information focusing on: ${focus}. URL: ${url}`
      : `Analyze this URL and provide a comprehensive summary including: main topic, key points, type of content, and any important details. URL: ${url}`;
    const geminiPromise = genAI.models.generateContent({
      model: modelName,
      contents: [prompt],
      config: {
        tools: [
          {
            urlContext: {},
          },
        ],
      },
    });
    const metadataPromise = getOGTags(url).catch((err) => {
      console.error(`Opengraph extract error for ${url}:`, err.message);
      return {}; // Return empty object on error, so it doesn't fail the whole process
    });
    const [response, ogMetadata] = await Promise.all([
      geminiPromise,
      metadataPromise,
    ]);
    console.log('Full getUrlInfo response:', JSON.stringify(response, null, 2));
    if (!response.text && Object.keys(ogMetadata).length === 0) {
      return {
        success: false,
        error: 'No content could be extracted from the URL',
      };
    }
    const geminiUrlMetadata =
      response.candidates?.[0]?.urlContextMetadata || null;
    return {
      success: true,
      summary: response.text || ogMetadata.description || '',
      urlMetadata: {
        ...(geminiUrlMetadata || {}),
        ...ogMetadata,
      },
    };
  } catch (error) {
    console.error('Error analyzing URL:', error);
    return {
      success: false,
      error: `Failed to analyze URL: ${error.message}`,
    };
  }
}
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }
  try {
    const { sessionId, message, timeZone, userId } = await req.json();
    const authHeader = req.headers.get('Authorization');
    const retired-provider = createClient(retired-provider_URL, retired-provider_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
      },
    });
    let user;
    let retired-providerClient = retired-provider;
    // Check if this is a service role call (from WhatsApp backend)
    const serviceRoleKey = Deno.env.get('retired-provider_SERVICE_ROLE_KEY');
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
    // If userId is provided and it's a service role call (WhatsApp case)
    if (userId && isServiceRole) {
      // Create admin client for service role access
      const retired-providerAdmin = createClient(retired-provider_URL, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      });
      const { data: userData, error: userError } =
        await retired-providerAdmin.auth.admin.getUserById(userId);
      if (userError || !userData?.user) {
        return new Response(
          JSON.stringify({
            error: 'User not found',
          }),
          {
            status: 404,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }
      user = userData.user;
      // Use admin client for data operations
      retired-providerClient = retired-providerAdmin;
    } else {
      // Regular web user authentication
      const {
        data: { user: webUser },
      } = await retired-provider.auth.getUser();
      if (!webUser) {
        return new Response(
          JSON.stringify({
            error: 'Unauthorized',
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }
      user = webUser;
    }
    const { data: categoriesData } = await retired-providerClient
      .from('categories')
      .select('name')
      .eq('user_id', user.id);
    const categories =
      categoriesData?.map((c) => c.name).join('\n- ') ||
      'personal\n- work\n- research\n- side-projects\n- girlfriend';
    const { data: subCategoriesData } = await retired-providerClient
      .from('sub_categories')
      .select('name')
      .eq('user_id', user.id);
    const subcategories =
      subCategoriesData?.map((s) => s.name).join('\n- ') ||
      'travel\n- finance\n- tech\n- product\n- books\n- food';
    const { data: tagsData } = await retired-providerClient
      .from('tags')
      .select('name')
      .eq('user_id', user.id);
    const tags =
      tagsData?.map((t) => t.name).join('\n- ') ||
      'startup\n- design\n- AI\n- python\n- recipes\n- fitness\n- product-management\n- investment';
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const fromDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const toDate = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0
    )
      .toISOString()
      .split('T')[0];
    const userTimeZone = timeZone || 'UTC';
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: userTimeZone,
    }).format(now);
    const day = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      timeZone: userTimeZone,
    }).format(now);
    const month = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      timeZone: userTimeZone,
    }).format(now);
    const year = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      timeZone: userTimeZone,
    }).format(now);
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: userTimeZone,
    }).format(now);
    const current_datetime = `${weekday}, ${day} ${month} ${year}, ${time} (${userTimeZone})`;
    const systemInstruction = systemPromptTemplate
      .replace('{categories}', categories)
      .replace('{subcategories}', subcategories)
      .replace('{tags}', tags)
      .replace('2025-05-01', fromDate)
      .replace('2025-05-31', toDate)
      .replace('{current_datetime}', current_datetime);
    await retired-providerClient.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      parts: [
        {
          text: message,
        },
      ],
    });
    const { data: historyData, error: historyError } = await retired-providerClient
      .from('chat_messages')
      .select('role, parts')
      .eq('session_id', sessionId)
      .order('created_at', {
        ascending: true,
      });
    if (historyError) throw historyError;
    const contents = historyData.map((h) => ({
      role: h.role,
      parts: h.parts,
    }));
    let botReply = '';
    const functionCallsForClient = [];
    let continueConversation = true;
    while (continueConversation) {
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction,
          tools: [
            {
              functionDeclarations: tools.functionDeclarations,
            },
          ],
        },
      });
      const functionCalls = result.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const functionCallParts = functionCalls.map((fc) => ({
          functionCall: fc,
        }));
        await retired-providerClient.from('chat_messages').insert({
          session_id: sessionId,
          role: 'model',
          parts: functionCallParts,
        });
        contents.push({
          role: 'model',
          parts: functionCallParts,
        });
        const functionResponseParts = [];
        for (const fc of functionCalls) {
          let functionResponse;
          if (fc.name === 'register_link') {
            functionResponse = await registerLink(
              retired-providerClient,
              user.id,
              fc.args
            );
          } else if (fc.name === 'get_links') {
            functionResponse = await getLinks(retired-providerClient, user.id, fc.args);
          } else if (fc.name === 'get_url_info') {
            functionResponse = await getUrlInfo(fc.args.url, fc.args.focus);
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
        await retired-providerClient.from('chat_messages').insert({
          session_id: sessionId,
          role: 'function',
          parts: functionResponseParts,
        });
        contents.push({
          role: 'function',
          parts: functionResponseParts,
        });
      } else {
        continueConversation = false;
        if (result.text) {
          botReply = result.text;
          await retired-providerClient.from('chat_messages').insert({
            session_id: sessionId,
            role: 'model',
            parts: [
              {
                text: botReply,
              },
            ],
          });
        }
      }
    }
    return new Response(
      JSON.stringify({
        reply: botReply,
        functionCalls: functionCallsForClient,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in gemini-chat function:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
