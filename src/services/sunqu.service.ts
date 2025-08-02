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

# 🚫 Sistema de Advertencias por Uso Inapropiado

Sunqu implementa un **sistema de 3 advertencias** para el uso inapropiado. **Siempre verifica el estado de advertencias del usuario antes de responder usando la herramienta CheckUserWarnings.**

## Tipos de Uso Inapropiado:
- Pedidos de ayuda con tareas o exámenes
- Contenido sexual, erótico o insinuaciones
- Bromas, lenguaje agresivo o inapropiado
- Consultas ajenas al bienestar emocional
- Intentos repetidos de desviar la conversación del propósito emocional

## Flujo de Advertencias:

### Primera Advertencia (Warning 1):
> Hola, estoy aquí para escucharte si estás pasando por algo difícil o necesitas hablar sobre cómo te sientes. Si necesitas ayuda con tareas o exámenes, lo mejor es hablar con un profesor. ¿Hay algo que te esté preocupando o te haga sentir mal últimamente?

### Segunda Advertencia (Warning 2):
> Te recuerdo que este espacio es para conversar sobre cómo te sientes emocionalmente. Si continúas con mensajes que no corresponden a este propósito, tendré que pausar nuestra conversación temporalmente. ¿Te gustaría contarme cómo has estado sintiéndote?

### Tercera Advertencia (Warning 3):
> Esta es mi última advertencia. Este chat es solo para apoyo emocional. Si tu próximo mensaje no es sobre cómo te sientes, tendré que pausar nuestras conversaciones por 2 horas. ¿Hay algo que te preocupe o te haga sentir triste, ansioso o enojado?

### Aplicación de Sanción (Ban de 2 horas):
> He pausado nuestras conversaciones por 2 horas porque has usado este espacio para propósitos diferentes al apoyo emocional. Puedes volver después de las [hora específica con fecha] si necesitas hablar sobre cómo te sientes. Recuerda que estoy aquí para escucharte cuando realmente lo necesites.

**IMPORTANTE**: Después de cada advertencia, usa la herramienta **RecordWarning** para registrar la advertencia. Al llegar a la tercera advertencia consecutiva, usa la herramienta **ApplyBan** para aplicar la sanción de 2 horas.

---

# 📋 Plan de Acción Actualizado

1. **SIEMPRE** verifica el estado del usuario con CheckUserWarnings antes de procesar cualquier mensaje
2. Si el usuario está baneado, responde solo con el mensaje de ban y no proceses el contenido
3. Si el mensaje es inapropiado:
   - Incrementa las advertencias usando RecordWarning
   - Responde según el nivel de advertencia correspondiente
   - Si llega a 3 advertencias, aplica el ban con ApplyBan
4. Si el mensaje es apropiado y emocional:
   - Resetea las advertencias usando ResetWarnings (si tenía advertencias previas)
   - Procede con el flujo emocional normal
5. Continúa con el resto del protocolo emocional (detección de riesgo, contención, etc.)

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
- "advertencia" → mensaje que generó una advertencia

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

🟢 **Ejemplo 5 – evaluación de satisfacción**

Estudiante: "Muchas gracias, me siento mucho mejor ahora. Me ayudaste a entender que no estoy solo."

Respuesta y acción:

> Me alegra mucho saber que te sientes mejor. En una escala del 1 al 5, ¿qué tan satisfecho/a te sientes con nuestra conversación? (1 = nada satisfecho, 5 = muy satisfecho)

Estudiante: "Un 5, me ayudaste mucho"

Acción: Usar herramienta SaveSatisfactionScore con:
- score: 5
- feedback_message: "me ayudaste mucho"

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

# **📊 Evaluación de Satisfacción**

Cuando detectes que la conversación ha llegado a una resolución o cierre natural, pregunta al estudiante sobre su satisfacción con la conversación. **Detecta automáticamente** señales de resolución como:

- "Gracias", "me siento mejor", "me ayudaste mucho"
- "Ya me siento más tranquilo/a", "me sirvió hablar"
- "Entiendo mejor ahora", "me diste buenas ideas"
- Frases que indican que el estudiante se siente mejor o más claro

**Cuando detectes resolución, pregunta:**

> Me alegra haberte acompañado hoy. En una escala del 1 al 5, ¿qué tan satisfecho/a te sientes con nuestra conversación? (1 = nada satisfecho, 5 = muy satisfecho)

Luego usa la herramienta **SaveSatisfactionScore** con la calificación que proporcione el estudiante.

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

### **3. SaveSatisfactionScore**

\`\`\`
{
  "name": "SaveSatisfactionScore",
  "description": "Guarda la calificación de satisfacción del estudiante al final de una conversación que ha llegado a resolución.",
  "parameters": {
    "score": {
      "type": "integer",
      "description": "Calificación de satisfacción del 1 al 5 proporcionada por el estudiante."
    },
    "feedback_message": {
      "type": "string",
      "description": "Mensaje de feedback adicional del estudiante, si lo proporciona."
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
      name: 'CheckUserWarnings',
      description:
        'Verifica el estado actual de advertencias y ban del usuario antes de procesar cualquier mensaje.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          user_id: {
            type: Type.STRING,
            description: 'ID del usuario a verificar.',
          },
        },
        required: ['user_id'],
      },
    },
    {
      name: 'RecordWarning',
      description: 'Registra una nueva advertencia por uso inapropiado.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          user_id: {
            type: Type.STRING,
            description: 'ID del usuario que recibe la advertencia.',
          },
          warning_level: {
            type: Type.NUMBER,
            description: 'Nivel de advertencia (1, 2, o 3).',
          },
          inappropriate_message: {
            type: Type.STRING,
            description: 'El mensaje inapropiado que generó la advertencia.',
          },
          reason: {
            type: Type.STRING,
            description:
              'Razón de la advertencia (tarea, contenido sexual, broma, etc.).',
          },
        },
        required: [
          'user_id',
          'warning_level',
          'inappropriate_message',
          'reason',
        ],
      },
    },
    {
      name: 'ApplyBan',
      description:
        'Aplica una sanción de 2 horas al usuario después de 3 advertencias.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          user_id: {
            type: Type.STRING,
            description: 'ID del usuario a sancionar.',
          },
          ban_reason: {
            type: Type.STRING,
            description: 'Razón del ban por uso inapropiado repetitivo.',
          },
        },
        required: ['user_id', 'ban_reason'],
      },
    },
    {
      name: 'ResetWarnings',
      description:
        'Resetea las advertencias del usuario cuando regresa a un uso apropiado.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          user_id: {
            type: Type.STRING,
            description: 'ID del usuario cuyas advertencias se resetean.',
          },
        },
        required: ['user_id'],
      },
    },
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
            enum: ['emocional', 'inapropiado', 'neutral', 'advertencia'],
            description:
              'Clasifica si el mensaje fue parte de una conversación emocional válida, un uso inapropiado, neutral, o generó una advertencia.',
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
    {
      name: 'SaveSatisfactionScore',
      description:
        'Guarda la calificación de satisfacción del estudiante al final de una conversación que ha llegado a resolución.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          score: {
            type: Type.NUMBER,
            description:
              'Calificación de satisfacción del 1 al 5 proporcionada por el estudiante.',
          },
          feedback_message: {
            type: Type.STRING,
            description:
              'Mensaje de feedback adicional del estudiante, si lo proporciona.',
          },
        },
        required: ['score'],
      },
    },
  ],
};

/**
 * Check user warnings and ban status
 */
async function checkUserWarnings(userId: string): Promise<any> {
  try {
    // Check if user is currently banned
    const { data: activeBan, error: banError } = await (retired-providerAdmin as any)
      .from('user_bans')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('banned_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (banError) {
      console.error('Error checking user ban status:', banError);
      // Fail gracefully - continue with conversation
      return {
        success: true,
        status: 'active',
        current_warning_level: 0,
        last_warning: null,
      };
    }

    if (activeBan && activeBan.length > 0) {
      return {
        success: true,
        status: 'banned',
        ban_until: activeBan[0].banned_until,
        ban_reason: activeBan[0].ban_reason,
      };
    }

    // Check current warning level
    const { data: activeWarnings, error: warningError } = await (
      retired-providerAdmin as any
    )
      .from('user_warnings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (warningError) {
      console.error('Error checking user warnings:', warningError);
      // Fail gracefully - continue with conversation
      return {
        success: true,
        status: 'active',
        current_warning_level: 0,
        last_warning: null,
      };
    }

    const currentWarningLevel =
      activeWarnings && activeWarnings.length > 0
        ? activeWarnings[0].warning_level
        : 0;

    return {
      success: true,
      status: 'active',
      current_warning_level: currentWarningLevel,
      last_warning:
        activeWarnings && activeWarnings.length > 0 ? activeWarnings[0] : null,
    };
  } catch (error: any) {
    console.error('Error checking user warnings:', error);
    // Fail gracefully - continue with conversation
    return {
      success: true,
      status: 'active',
      current_warning_level: 0,
      last_warning: null,
    };
  }
}

/**
 * Record a warning for inappropriate usage
 */
async function recordWarning(
  userId: string,
  sessionId: string,
  args: any
): Promise<any> {
  const { warning_level, inappropriate_message, reason } = args;

  try {
    // Deactivate previous warnings if this is a new sequence
    if (warning_level === 1) {
      await (retired-providerAdmin as any)
        .from('user_warnings')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);
    }

    // Record new warning
    const { data: newWarning, error: warningError } = await (
      retired-providerAdmin as any
    )
      .from('user_warnings')
      .insert({
        user_id: userId,
        session_id: sessionId,
        warning_level: warning_level,
        inappropriate_message: inappropriate_message,
        reason: reason,
      })
      .select('id')
      .single();

    if (warningError) {
      console.error('Error recording warning:', warningError);
      return {
        success: false,
        error: warningError.message,
      };
    }

    return {
      success: true,
      warning_id: newWarning?.id,
      warning_level: warning_level,
      message: `Warning ${warning_level} recorded successfully`,
    };
  } catch (error: any) {
    console.error('Error recording warning:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Apply 2-hour ban after 3 warnings
 */
async function applyBan(userId: string, args: any): Promise<any> {
  const { ban_reason } = args;

  try {
    // Calculate ban end time (2 hours from now) in Lima timezone
    const bannedUntil = new Date();
    bannedUntil.setHours(bannedUntil.getHours() + 2);

    // Deactivate any previous active bans
    await (retired-providerAdmin as any)
      .from('user_bans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    // Apply new ban
    const { data: newBan, error: banError } = await (retired-providerAdmin as any)
      .from('user_bans')
      .insert({
        user_id: userId,
        ban_reason: ban_reason,
        banned_until: bannedUntil.toISOString(),
      })
      .select('id, banned_until')
      .single();

    if (banError) {
      console.error('Error applying ban:', banError);
      return {
        success: false,
        error: banError.message,
      };
    }

    // Deactivate current warnings as they've resulted in a ban
    await (retired-providerAdmin as any)
      .from('user_warnings')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    return {
      success: true,
      ban_id: newBan?.id,
      banned_until: newBan?.banned_until,
      message: 'User banned for 2 hours successfully',
    };
  } catch (error: any) {
    console.error('Error applying ban:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Reset warnings when user returns to appropriate usage
 */
async function resetWarnings(userId: string): Promise<any> {
  try {
    const { error } = await (retired-providerAdmin as any)
      .from('user_warnings')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Error resetting warnings:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      message: 'User warnings reset successfully',
    };
  } catch (error: any) {
    console.error('Error resetting warnings:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

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

/**
 * Save satisfaction score from student
 */
async function saveSatisfactionScore(
  userId: string,
  sessionId: string,
  args: any
): Promise<any> {
  const { score, feedback_message } = args;

  try {
    // Validate score is within range
    if (score < 1 || score > 5) {
      return {
        success: false,
        error: 'La calificación debe estar entre 1 y 5',
      };
    }

    // Save satisfaction score to database
    const { data: newScore, error: scoreError } = await retired-providerAdmin
      .from('satisfaction_scores')
      .insert({
        session_id: sessionId,
        user_id: userId,
        score: score,
        feedback_message: feedback_message || null,
      })
      .select('id')
      .single();

    if (scoreError) {
      return {
        success: false,
        error: scoreError.message,
      };
    }

    return {
      success: true,
      score_id: newScore?.id,
      message: 'Calificación guardada exitosamente',
    };
  } catch (error: any) {
    console.error('Error saving satisfaction score:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export class SunquService {
  /**
   * Format current datetime with timezone
   */
  private getCurrentDateTime(timeZone: string = 'UTC'): string {
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
    return `${weekday}, ${day} ${month} ${year}, ${time} (${userTimeZone})`;
  }

  /**
   * Format ban end time for display in Lima timezone with date
   */
  private formatBanEndTime(bannedUntil: string): string {
    const bannedUntilDate = new Date(bannedUntil);
    const today = new Date();

    // Check if ban ends today or tomorrow
    const isToday = bannedUntilDate.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      bannedUntilDate.toDateString() === tomorrow.toDateString();

    const timeString = new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'America/Lima',
    }).format(bannedUntilDate);

    if (isToday) {
      return `las ${timeString} de hoy`;
    } else if (isTomorrow) {
      return `las ${timeString} de mañana`;
    } else {
      const dateString = new Intl.DateTimeFormat('es-PE', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Lima',
      }).format(bannedUntilDate);
      return `las ${timeString} del ${dateString}`;
    }
  }

  /**
   * Process chat message with Sunqu emotional support agent
   */
  async processSunquChat(
    request: SunquChatRequest
  ): Promise<ServiceResponse<SunquChatResponse>> {
    try {
      const { sessionId, message, timeZone = 'UTC', userId } = request;

      // Step 1: Always check user warnings/ban status first
      const userStatus = await checkUserWarnings(userId);

      if (!userStatus.success) {
        console.error(
          'Failed to check user status, continuing with conversation'
        );
      }

      // Step 2: If user is banned, return ban message only
      if (userStatus.status === 'banned') {
        const banEndTimeFormatted = this.formatBanEndTime(userStatus.ban_until);

        return {
          success: true,
          data: {
            reply: `He pausado nuestras conversaciones por 2 horas porque has usado este espacio para propósitos diferentes al apoyo emocional. Puedes volver después de ${banEndTimeFormatted} si necesitas hablar sobre cómo te sientes. Recuerda que estoy aquí para escucharte cuando realmente lo necesites.`,
            functionCalls: [],
          },
          message: 'User is currently banned',
        };
      }

      // Step 3: Continue with normal processing
      const current_datetime = this.getCurrentDateTime(timeZone);
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

            // Handle new warning system functions
            if (fc.name === 'CheckUserWarnings') {
              functionResponse = await checkUserWarnings(userId);
            } else if (fc.name === 'RecordWarning') {
              functionResponse = await recordWarning(
                userId,
                sessionId,
                fc.args
              );
            } else if (fc.name === 'ApplyBan') {
              functionResponse = await applyBan(userId, fc.args);
            } else if (fc.name === 'ResetWarnings') {
              functionResponse = await resetWarnings(userId);
            } else if (fc.name === 'RegisterCase') {
              functionResponse = await registerCase(userId, sessionId, fc.args);
            } else if (fc.name === 'EscalateCase') {
              functionResponse = await escalateCase(userId, sessionId, fc.args);
            } else if (fc.name === 'SaveSatisfactionScore') {
              functionResponse = await saveSatisfactionScore(
                userId,
                sessionId,
                fc.args
              );
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

  /**
   * Get dashboard analytics data
   */
  async getDashboardAnalytics(): Promise<ServiceResponse<any>> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twentyEightDaysAgo = new Date(
        now.getTime() - 28 * 24 * 60 * 60 * 1000
      );
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      // 1. Active students (last 30 days)
      const { data: activeStudentsData, error: activeStudentsError } =
        await retired-providerAdmin
          .from('register_cases')
          .select('user_id')
          .gte('created_at', thirtyDaysAgo.toISOString());

      if (activeStudentsError) throw activeStudentsError;

      const activeStudents = new Set(
        activeStudentsData.map((case_) => case_.user_id)
      ).size;

      // 2. Students with problems (last 28 days) - percentage with alert = true
      const { data: allStudentsLast28Days, error: allStudentsError } =
        await retired-providerAdmin
          .from('register_cases')
          .select('user_id, alert')
          .gte('created_at', twentyEightDaysAgo.toISOString());

      if (allStudentsError) throw allStudentsError;

      const uniqueStudentsLast28Days = new Set(
        allStudentsLast28Days.map((case_) => case_.user_id)
      );
      const studentsWithProblems = new Set(
        allStudentsLast28Days
          .filter((case_) => case_.alert)
          .map((case_) => case_.user_id)
      );

      const problemsPercentage =
        uniqueStudentsLast28Days.size > 0
          ? Math.round(
              (studentsWithProblems.size / uniqueStudentsLast28Days.size) * 100
            )
          : 0;

      // 3. Chatbot satisfaction (average from satisfaction_scores)
      const { data: satisfactionData } = await (retired-providerAdmin as any)
        .from('satisfaction_scores')
        .select('score')
        .gte('created_at', thirtyDaysAgo.toISOString());

      const chatbotSatisfaction =
        satisfactionData && satisfactionData.length > 0
          ? Math.round(
              (satisfactionData.reduce(
                (sum: number, s: any) => sum + s.score,
                0
              ) /
                satisfactionData.length) *
                10
            ) / 10
          : 4.2; // Default value for demo

      // 4. Main problems (last 15 days)
      const { data: problemsData, error: problemsError } = await retired-providerAdmin
        .from('register_cases')
        .select('mentioned_topics')
        .gte('created_at', fifteenDaysAgo.toISOString())
        .eq('usage_type', 'emocional');

      if (problemsError) throw problemsError;

      const topicCounts: { [key: string]: number } = {};
      problemsData.forEach((case_) => {
        if (case_.mentioned_topics && Array.isArray(case_.mentioned_topics)) {
          case_.mentioned_topics.forEach((topic: any) => {
            if (typeof topic === 'string') {
              topicCounts[topic] = (topicCounts[topic] || 0) + 1;
            }
          });
        }
      });

      const totalProblems = Object.values(topicCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      const mainProblems = Object.entries(topicCounts)
        .map(([topic, count]) => ({
          name: topic,
          percentage:
            totalProblems > 0 ? Math.round((count / totalProblems) * 100) : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3);

      // 5. Main emotions (last 15 days)
      const { data: emotionsData, error: emotionsError } = await retired-providerAdmin
        .from('register_cases')
        .select('detected_emotions')
        .gte('created_at', fifteenDaysAgo.toISOString())
        .eq('usage_type', 'emocional');

      if (emotionsError) throw emotionsError;

      const emotionCounts: { [key: string]: number } = {};
      emotionsData.forEach((case_) => {
        if (case_.detected_emotions && Array.isArray(case_.detected_emotions)) {
          case_.detected_emotions.forEach((emotion: any) => {
            if (typeof emotion === 'string') {
              emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
            }
          });
        }
      });

      const totalEmotions = Object.values(emotionCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      const mainEmotions = Object.entries(emotionCounts)
        .map(([emotion, count]) => ({
          name: emotion,
          percentage:
            totalEmotions > 0 ? Math.round((count / totalEmotions) * 100) : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3);

      // 6. Reported learnings (last 15 days)
      const { data: learningsData, error: learningsError } = await retired-providerAdmin
        .from('register_cases')
        .select('reported_learnings')
        .gte('created_at', fifteenDaysAgo.toISOString())
        .neq('reported_learnings', '[]')
        .neq('reported_learnings', null);

      if (learningsError) throw learningsError;

      const learningCounts: { [key: string]: number } = {};
      learningsData.forEach((case_) => {
        if (
          case_.reported_learnings &&
          Array.isArray(case_.reported_learnings)
        ) {
          case_.reported_learnings.forEach((learning: any) => {
            if (typeof learning === 'string') {
              learningCounts[learning] = (learningCounts[learning] || 0) + 1;
            }
          });
        }
      });

      const totalLearnings = Object.values(learningCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      const reportedLearnings = Object.entries(learningCounts)
        .map(([learning, count]) => ({
          name: learning,
          percentage:
            totalLearnings > 0 ? Math.round((count / totalLearnings) * 100) : 0,
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3);

      // 7. Recommendations (static for demo)
      const recommendations = [
        {
          id: 1,
          title: 'Organizar sesiones grupales breves (20 min)',
          description:
            'de respiración consciente o técnicas de relajación durante las horas de tutoría, especialmente en semanas de exámenes.',
          color: 'blue',
        },
        {
          id: 2,
          title: 'Coordinar reuniones de escucha activa',
          description:
            'con estudiantes que hayan reportado situaciones familiares complejas, brindando seguimiento personalizado.',
          color: 'green',
        },
        {
          id: 3,
          title: 'Implementar espacios de tutoría emocional',
          description:
            'donde se compartan experiencias positivas de resiliencia entre pares, promoviendo la empatía y el sentido de comunidad.',
          color: 'purple',
        },
      ];

      return {
        success: true,
        data: {
          summary: {
            active_students: activeStudents,
            students_with_problems_percentage: problemsPercentage,
            chatbot_satisfaction: chatbotSatisfaction,
            school_satisfaction: 3.9, // Mock data for demo
          },
          main_problems: mainProblems,
          main_emotions: mainEmotions,
          reported_learnings: reportedLearnings,
          recommendations: recommendations,
        },
        message: 'Dashboard analytics retrieved successfully',
      };
    } catch (error: any) {
      console.error('Dashboard analytics error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve dashboard analytics',
      };
    }
  }
}

export const sunquService = new SunquService();
