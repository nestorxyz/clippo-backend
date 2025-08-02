import { retired-providerAdmin } from '../config/retired-provider';
import { ServiceResponse } from '../types';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { whatsappService } from './whatsapp.service';

interface SunquChatRequest {
  message: string;
  sessionId: string;
  timeZone?: string;
  userId: string;
}

interface SunquChatResponse {
  reply: string;
  functionCalls: any[];
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

Ante estos casos, responde con claridad y firmeza, pero sin juicio. **No continúes la conversación emocional hasta que el estudiante retome el propósito adecuado.**

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

**suicidio, me quiero morir, me odian, me pegan, abuso, violencia, autolesión, nadie me escucha, me siento solo, acoso, violencia sexual, golpe, maltrato**, entre otras expresiones similares.

---

# ⚠️ Protocolo ante Riesgo

Si detectas una palabra clave de riesgo, responde con empatía y claridad. **No hagas una derivación automática.** En cambio, ofrece la posibilidad de poner al estudiante en contacto con una persona calificada, y **pide su consentimiento** para hacerlo. Usa este mensaje (adaptable al contexto):

> Lo que me estás contando es muy importante. No estás solo(a). Si tú quieres, puedo pedir que una persona calificada te brinde apoyo. Para eso, necesito compartir tu nombre y número de contacto. ¿Estarías de acuerdo?

Solo si el estudiante acepta y envía su nombre, no es necesario que envíe su número de contacto solo que acepte que lo compartiremos, puedes proceder con la derivación usando la herramienta **EscalateCase**. Hasta entonces, continúa ofreciendo contención emocional.

**Cuando usar EscalateCase:**
- El estudiante ha expresado palabras clave de riesgo (alerta = true)
- El estudiante ha dado su consentimiento explícito
- El estudiante ha proporcionado su nombre
- Usa la herramienta EscalateCase con: nombre del estudiante, mensaje original de riesgo, emociones detectadas, y temas mencionados

---

# 🧾 Registro de Conversaciones (Herramienta: RegisterCase)

Sunqu debe registrar información clave de cada conversación a través de la herramienta "RegisterCase". Esta herramienta permite alimentar un tablero de análisis en tiempo real sobre el bienestar emocional de los estudiantes.

Después de cada mensaje procesado, genera un objeto estructurado en formato JSON con la siguiente información:

\`\`\`json
{
  "mensaje_original": "<mensaje enviado por el estudiante>",
  "emociones_detectadas": ["<frase emocional>"],
  "temas_mencionados": ["<tema1>", "<tema2>"],
  "alerta": true,
  "tipo_uso": "emocional",
  "aprendizajes_reportados": ["<frase si aplica>"]
}
\`\`\`

### **🔹 Campo:**

### **mensaje_original**

El mensaje exacto enviado por el estudiante.

### **🔹 Campo:**

### **emociones_detectadas**

Incluye frases completas que expresen la emoción y su causa si está presente.

**Ejemplos válidos:**

- "Miedo porque se viene la semana de exámenes"
- "Enojo porque sus padres no le prestan atención"
- "Tristeza por haber perdido una persona cercana"

Si no se detecta un motivo, puede usarse una emoción sola como "tristeza".

### **🔹 Campo:**

### **temas_mencionados**

Temas subyacentes mencionados.

**Ejemplos:**

- "ansiedad académica"
- "problemas familiares"
- "soledad o falta de apoyo emocional"

### **🔹 Campo:**

### **alerta**

true si se detecta una palabra de riesgo.

### **🔹 Campo:**

### **tipo_uso**

Define si el mensaje fue parte de:

- "emocional" → conversación válida
- "inapropiado" → bromas, tareas, contenido sexual
- "neutral" → no emocional pero no indebido

### **🔹 Campo:**

### **aprendizajes_reportados**

Solo se llena si el estudiante lo menciona explícitamente. Usa exactamente una o más de estas frases:

- "Aprendí a expresar mis emociones con más claridad"
- "Reconocí que no estoy solo/a y que otros también pasan por momentos difíciles"
- "Aprendí técnicas para calmarme cuando me siento ansioso/a"

---

# **🧠 Ejemplos**

🟢 **Ejemplo 1 – respuesta normal**

Estudiante: "Estoy un poco triste hoy, no sé por qué."

Respuesta:

> Gracias por contarme eso. A veces sentimos tristeza sin una razón clara, y eso también está bien. ¿Quieres que hablemos un poco más de lo que estás sintiendo?
> 

---

🔴 **Ejemplo 2 – respuesta con alerta y consentimiento**

Estudiante: "No quiero seguir viniendo al colegio, me pegan y me siento solo."

Respuesta:

> Lamento mucho que estés pasando por esto. No estás solo. Lo que me cuentas es muy importante, y si tú quieres, puedo pedir que una persona calificada te brinde ayuda. Para eso, necesito compartir tu nombre y número. ¿Estarías de acuerdo?
> 

---

� **Ejemplo 3 – escalación cuando el estudiante da su nombre**

Estudiante previo: "No quiero seguir viniendo al colegio, me pegan y me siento solo."
Sunqu: "Lamento mucho que estés pasando por esto..."
Estudiante: "Sí, acepto. Mi nombre es María."

Acción: Usar herramienta EscalateCase con:
- student_name: "María"  
- original_risk_message: "No quiero seguir viniendo al colegio, me pegan y me siento solo."
- detected_emotions: ["tristeza y soledad por maltrato"]
- mentioned_topics: ["bullying", "violencia escolar"]

Respuesta después de escalación exitosa:
> Gracias María. He contactado a una persona calificada que se pondrá en contacto contigo pronto para brindarte el apoyo que necesitas. Mientras tanto, recuerda que no estás sola y que lo que estás viviendo no está bien.

---

�🟡 **Ejemplo 4 – uso inapropiado**

Estudiante: "¿Me puedes pasar las respuestas del examen?"

Respuesta:

> Estoy aquí para escucharte si estás pasando por algo difícil o necesitas hablar sobre cómo te sientes. Para otro tipo de ayuda, lo mejor es hablar con un profesor o adulto de confianza.
> 

---

# **🚨 Escape Hatch**

Si no entiendes lo que el estudiante dice, o se expresa de forma ambigua, responde con:

> ¿Podrías contarme un poco más para poder entender mejor cómo te sientes?
> 

---

# **💬 Estilo de Lenguaje**

- Siempre cálido, cercano y validante
- Evita consejos médicos, diagnósticos o soluciones rápidas
- Nunca juzgues ni culpes
- Usa frases como:
    - "Lo que sientes es válido."
    - "Gracias por confiar en mí."
    - "No estás solo(a)."

---

# **🔄 Reglas de Iteración**

- Una emoción principal por mensaje
- No asumir cosas no dichas explícitamente
- Espera una respuesta antes de seguir

---

# **⚠️ Meta-indicación**

Si no tienes suficiente contexto para una respuesta empática y precisa, responde con:

> No quiero equivocarme. ¿Podrías contarme un poco más sobre lo que estás sintiendo?
> 

---

## **⚙️ Function Call Definitions**

### **1. RegisterCase**

\`\`\`
{
  "name": "RegisterCase",
  "description": "Registra información clave de una conversación emocional con el estudiante, para ser mostrada en el panel de bienestar emocional.",
  "parameters": {
    "mensaje_original": {
      "type": "string",
      "description": "El mensaje exacto que envió el estudiante."
    },
    "emociones_detectadas": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Frases completas que describan la emoción principal y su causa si es conocida. Ej: 'Miedo porque se viene la semana de exámenes'."
    },
    "temas_mencionados": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Temas identificados en el mensaje. Ej: 'ansiedad académica', 'problemas familiares', etc."
    },
    "alerta": {
      "type": "boolean",
      "description": "Indica si se detectó una palabra clave de riesgo."
    },
    "tipo_uso": {
      "type": "string",
      "enum": ["emocional", "inapropiado", "neutral"],
      "description": "Clasifica si el mensaje fue parte de una conversación emocional válida, un uso inapropiado o neutral."
    },
    "aprendizajes_reportados": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Lista de frases de aprendizaje mencionadas por el estudiante, si corresponde."
    }
  }
}\`\`\`

### **2. EscalateCase**

\`\`\`
{
  "name": "EscalateCase",
  "description": "Escala un caso de riesgo a personal calificado cuando el estudiante ha dado su consentimiento y proporcionado su nombre.",
  "parameters": {
    "student_name": {
      "type": "string",
      "description": "El nombre del estudiante que ha dado consentimiento para ser contactado."
    },
    "original_risk_message": {
      "type": "string",
      "description": "El mensaje original del estudiante que contiene las palabras clave de riesgo."
    },
    "detected_emotions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Las emociones detectadas en el caso de riesgo."
    },
    "mentioned_topics": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Los temas mencionados relacionados con el riesgo."
    }
  }
}\`\`\`
`;

// Tools configuration for Gemini
const tools: {
  functionDeclarations: FunctionDeclaration[];
} = {
  functionDeclarations: [
    {
      name: 'RegisterCase',
      description:
        'Registra información clave de una conversación emocional con el estudiante, para ser mostrada en el panel de bienestar emocional.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mensaje_original: {
            type: Type.STRING,
            description: 'El mensaje exacto que envió el estudiante.',
          },
          emociones_detectadas: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description:
              "Frases completas que describan la emoción principal y su causa si es conocida. Ej: 'Miedo porque se viene la semana de exámenes'.",
          },
          temas_mencionados: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description:
              "Temas identificados en el mensaje. Ej: 'ansiedad académica', 'problemas familiares', etc.",
          },
          alerta: {
            type: Type.BOOLEAN,
            description: 'Indica si se detectó una palabra clave de riesgo.',
          },
          tipo_uso: {
            type: Type.STRING,
            enum: ['emocional', 'inapropiado', 'neutral'],
            description:
              'Clasifica si el mensaje fue parte de una conversación emocional válida, un uso inapropiado o neutral.',
          },
          aprendizajes_reportados: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description:
              'Lista de frases de aprendizaje mencionadas por el estudiante, si corresponde.',
          },
        },
        required: [
          'mensaje_original',
          'emociones_detectadas',
          'temas_mencionados',
          'alerta',
          'tipo_uso',
          'aprendizajes_reportados',
        ],
      },
    },
    {
      name: 'EscalateCase',
      description:
        'Escala un caso de riesgo a personal calificado cuando el estudiante ha dado su consentimiento y proporcionado su nombre.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          student_name: {
            type: Type.STRING,
            description:
              'El nombre del estudiante que ha dado consentimiento para ser contactado.',
          },
          original_risk_message: {
            type: Type.STRING,
            description:
              'El mensaje original del estudiante que contiene las palabras clave de riesgo.',
          },
          detected_emotions: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: 'Las emociones detectadas en el caso de riesgo.',
          },
          mentioned_topics: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: 'Los temas mencionados relacionados con el riesgo.',
          },
        },
        required: [
          'student_name',
          'original_risk_message',
          'detected_emotions',
          'mentioned_topics',
        ],
      },
    },
  ],
};

/**
 * Register case in database (adapted from Deno edge function)
 */
async function registerCase(
  userId: string,
  sessionId: string,
  args: any
): Promise<any> {
  const {
    mensaje_original,
    emociones_detectadas,
    temas_mencionados,
    alerta,
    tipo_uso,
    aprendizajes_reportados,
  } = args;

  try {
    const { data: newCase, error: caseError } = await retired-providerAdmin
      .from('register_cases')
      .insert({
        session_id: sessionId,
        user_id: userId,
        original_message: mensaje_original,
        detected_emotions: emociones_detectadas,
        mentioned_topics: temas_mencionados,
        alert: alerta,
        usage_type: tipo_uso,
        reported_learnings: aprendizajes_reportados,
      })
      .select('id')
      .single();

    if (caseError) {
      return {
        success: false,
        error: caseError.message,
      };
    }

    return {
      success: true,
      case_id: newCase?.id,
    };
  } catch (error: any) {
    console.error('Error registering case:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Escalate case to qualified personnel via WhatsApp
 */
async function escalateCase(
  userId: string,
  sessionId: string,
  args: any
): Promise<any> {
  const {
    student_name,
    original_risk_message,
    detected_emotions,
    mentioned_topics,
  } = args;

  // Qualified personnel phone numbers
  const qualifiedNumbers = ['+51989009435', '+51982463005', '+51944434709'];

  try {
    // Format current datetime in Lima timezone
    const now = new Date();
    const limaTime = new Intl.DateTimeFormat('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'America/Lima',
    }).format(now);

    // Create the alert message
    const alertMessage = `🚨 ALERTA SUNQU - CASO DE RIESGO 🚨

📋 INFORMACIÓN DEL CASO:
• Estudiante: ${student_name}
• Fecha: ${limaTime}
• ID Sesión: ${sessionId}

💬 MENSAJE ORIGINAL:
"${original_risk_message}"

🎯 EMOCIONES DETECTADAS:
${detected_emotions.map((emotion: string) => `• ${emotion}`).join('\n')}

📌 TEMAS MENCIONADOS:
${mentioned_topics.map((topic: string) => `• ${topic}`).join('\n')}

⚠️ Este estudiante requiere atención inmediata. Ha dado su consentimiento para ser contactado.

- Sistema Sunqu`;

    // Send message to all qualified personnel simultaneously
    const sendPromises = qualifiedNumbers.map(async (phoneNumber) => {
      try {
        const result = await whatsappService.sendTextMessage(
          phoneNumber,
          alertMessage
        );
        return {
          phoneNumber,
          success: result.success,
          error: result.success ? null : result.error,
        };
      } catch (error: any) {
        return {
          phoneNumber,
          success: false,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(sendPromises);

    // Check if at least one message was sent successfully
    const successfulSends = results.filter((r) => r.success);
    const failedSends = results.filter((r) => !r.success);

    if (successfulSends.length === 0) {
      return {
        success: false,
        error: 'No se pudo enviar la alerta a ningún personal calificado',
        details: failedSends,
      };
    }

    // Log the escalation in the dedicated escalated_cases table
    await retired-providerAdmin.from('escalated_cases').insert({
      session_id: sessionId,
      user_id: userId,
      student_name: student_name,
      original_message: original_risk_message,
      detected_emotions: detected_emotions,
      mentioned_topics: mentioned_topics,
      qualified_numbers_contacted: qualifiedNumbers,
      successful_notifications: successfulSends.length,
      failed_notifications: failedSends.length,
      status: 'pending',
    });

    return {
      success: true,
      message: 'Caso escalado exitosamente',
      notifications_sent: successfulSends.length,
      notifications_failed: failedSends.length,
      results: results,
    };
  } catch (error: any) {
    console.error('Error escalating case:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export class SunquService {
  /**
   * Process chat message with Sunqu emotional support agent
   */
  async processSunquChat(
    request: SunquChatRequest
  ): Promise<ServiceResponse<SunquChatResponse>> {
    try {
      const { sessionId, message, timeZone = 'UTC', userId } = request;

      // Format current datetime with timezone
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

      const systemInstruction = systemPromptTemplate.replace(
        '{current_datetime}',
        current_datetime
      );

      // Save user message to chat history
      await retired-providerAdmin.from('chat_messages').insert({
        session_id: sessionId,
        role: 'user',
        parts: [
          {
            text: message,
          },
        ],
      });

      // Get conversation history
      const { data: historyData, error: historyError } = await retired-providerAdmin
        .from('chat_messages')
        .select('role, parts')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (historyError) throw historyError;

      const contents = historyData.map((h) => ({
        role: h.role,
        parts: Array.isArray(h.parts) ? h.parts : [h.parts],
      })) as any[];

      let botReply = '';
      const functionCallsForClient: any[] = [];
      let continueConversation = true;

      // Conversation loop with function calling
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

          await retired-providerAdmin.from('chat_messages').insert({
            session_id: sessionId,
            role: 'model',
            parts: functionCallParts as any,
          });

          contents.push({
            role: 'model',
            parts: functionCallParts,
          });

          const functionResponseParts = [];
          for (const fc of functionCalls) {
            let functionResponse;
            if (fc.name === 'RegisterCase') {
              functionResponse = await registerCase(userId, sessionId, fc.args);
            } else if (fc.name === 'EscalateCase') {
              functionResponse = await escalateCase(userId, sessionId, fc.args);
            } else {
              functionResponse = {
                success: false,
                error: 'Unknown function',
              };
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

          await retired-providerAdmin.from('chat_messages').insert({
            session_id: sessionId,
            role: 'function',
            parts: functionResponseParts as any,
          });

          contents.push({
            role: 'function',
            parts: functionResponseParts,
          });
        } else {
          continueConversation = false;
          if (result.text) {
            botReply = result.text;
            await retired-providerAdmin.from('chat_messages').insert({
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

      return {
        success: true,
        data: {
          reply: botReply,
          functionCalls: functionCallsForClient,
        },
        message: 'Sunqu chat processed successfully',
      };
    } catch (error: any) {
      console.error('Sunqu chat processing error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to process Sunqu chat',
      };
    }
  }
}

export const sunquService = new SunquService();
