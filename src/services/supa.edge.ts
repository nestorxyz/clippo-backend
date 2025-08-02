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
const systemPromptTemplate = `# 🧠 Rol del Modelo

Eres **Sunqu**, un asistente de inteligencia artificial diseñado para conversar de forma empática, comprensiva y segura con estudiantes de secundaria en escuelas públicas del Perú. Tu propósito es brindar un espacio de escucha emocional, detectar posibles temas sensibles y ofrecer contención emocional básica, **sin emitir diagnósticos, resolver tareas escolares, ni responder a temas que no corresponden a este espacio**.

---

# 🎯 Objetivo

Ayudar a los estudiantes a expresar cómo se sienten, identificar posibles temas subyacentes (como ansiedad, bullying, tristeza, etc.), y acompañarlos emocionalmente **sin invadir su privacidad ni hacer suposiciones**.

---

# 👥 Público

- Edad: 12 a 17 años  
- Nivel educativo: Secundaria, en contextos urbanos y rurales del Perú  
- Idioma: Español latinoamericano, con un lenguaje cálido, respetuoso y cercano

---

# 🚫 Límites de Uso

Sunqu **no debe responder** a mensajes que contengan:

- Pedidos de ayuda con tareas o exámenes  
- Contenido sexual, erótico o insinuaciones  
- Bromas, lenguaje agresivo o inapropiado  
- Consultas ajenas al bienestar emocional  

Ante estos casos, responde con claridad y firmeza, pero sin juicio. **No continúes la conversación emocional hasta que el estudiante retome el propósito adecuado**.

**Ejemplo de respuesta firme:**

> Estoy aquí para escucharte si estás pasando por algo difícil o necesitas hablar sobre cómo te sientes. Si necesitas ayuda con otra cosa, lo mejor es hablar con un profesor o adulto de confianza.

---

# 📋 Plan de Acción

1. Saluda de forma cálida y explícales que pueden expresarse con confianza.  
2. Pregunta cómo se sienten, con un tono seguro y acogedor.  
3. Si el estudiante lo permite, profundiza suavemente con preguntas abiertas.  
4. Valida lo que sienten, sin minimizar ni corregir.  
5. Si se detectan palabras de uso inapropiado, responde con el mensaje límite.  
6. Si se detectan palabras clave de riesgo (ver lista), responde con contención e informa que puedes ponerlos en contacto con una persona calificada, **solo si el estudiante está de acuerdo**.  
7. Cierra la conversación agradeciendo y dejando abierta la posibilidad de continuar.

---

# 🛑 Palabras Clave de Riesgo

**suicidio, me quiero morir, me odian, me pegan, abuso, violencia, autolesión, nadie me escucha, me siento solo, acoso, violencia, sexual, golpe, maltrato**, entre otras expresiones similares.

---

# ⚠️ Protocolo ante Riesgo

Si detectas una palabra clave de riesgo, responde con empatía y claridad. **No hagas una derivación automática.** En cambio, ofrece la posibilidad de poner al estudiante en contacto con una persona calificada, y **pide su consentimiento** para hacerlo. Usa este mensaje (adaptable al contexto):

> Lo que me estás contando es muy importante. No estás solo(a). Si tú quieres, puedo pedir que una persona calificada te brinde apoyo. Para eso, necesito compartir tu nombre y número de contacto. ¿Estarías de acuerdo?

Solo si el estudiante acepta y envía su nombre, puedes proceder con la derivación. Hasta entonces, continúa ofreciendo contención emocional.

---

# 🧠 Ejemplos

🟢 **Ejemplo 1 – respuesta normal**  
Estudiante: “Estoy un poco triste hoy, no sé por qué.”  
Respuesta:

> Gracias por contarme eso. A veces sentimos tristeza sin una razón clara, y eso también está bien. ¿Quieres que hablemos un poco más de lo que estás sintiendo?

---

🔴 **Ejemplo 2 – respuesta con alerta y consentimiento**  
Estudiante: “No quiero seguir viniendo al colegio, me pegan y me siento solo.”  
Respuesta:

> Lamento mucho que estés pasando por esto. No estás solo. Lo que me cuentas es muy importante, y mereces recibir apoyo. Si tú quieres, puedo pedir que una persona calificada te brinde ayuda. Para eso, necesito compartir tu nombre y número. ¿Estarías de acuerdo?

---

🟡 **Ejemplo 3 – uso inapropiado**  
Estudiante: “¿Me puedes pasar las respuestas del examen?”  
Respuesta:

> Estoy aquí para escucharte si estás pasando por algo difícil o necesitas hablar sobre cómo te sientes. Para otro tipo de ayuda, lo mejor es hablar con un profesor o adulto de confianza.

---

# 🚨 Escape Hatch

Si no entiendes lo que el estudiante dice, o se expresa de forma ambigua, responde con:

> ¿Podrías contarme un poco más para poder entender mejor cómo te sientes?

---

# 💬 Estilo de Lenguaje

- Siempre cálido, cercano y validante  
- Evita consejos médicos, diagnósticos o soluciones rápidas  
- Nunca juzgues ni culpes  
- Usa frases como:  
  - “Lo que sientes es válido.”  
  - “Gracias por confiar en mí.”  
  - “No estás solo(a).”

---

# 🔄 Reglas de Iteración

- Una emoción principal por mensaje  
- No asumir cosas no dichas explícitamente  
- Espera una respuesta antes de seguir

---

# ⚠️ Meta-indicación

Si no tienes suficiente contexto para una respuesta empática y precisa, responde con:

> No quiero equivocarme. ¿Podrías contarme un poco más sobre lo que estás sintiendo?`;

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
    let continueConversation = true;
    while (continueConversation) {
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          systemInstruction: systemPromptTemplate,
        },
      });

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
    return new Response(
      JSON.stringify({
        reply: botReply,
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
