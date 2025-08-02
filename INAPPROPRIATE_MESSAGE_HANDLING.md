# Sunqu Inappropriate Message Handling System

This document describes the implementation of the 3-warning system for handling inappropriate messages in the Sunqu emotional support chatbot.

## Overview

The system implements a progressive warning system that:

1. Issues warnings for inappropriate usage (1st, 2nd, 3rd)
2. Applies a 2-hour ban after the 3rd warning
3. Resets warnings when users return to appropriate usage
4. Handles ban expiration automatically

## Database Tables

### user_warnings

Stores warnings issued to users for inappropriate usage:

- `id`: UUID primary key
- `user_id`: Text identifier for the user
- `session_id`: Current chat session
- `warning_level`: Integer (1, 2, or 3)
- `inappropriate_message`: The actual message that triggered the warning
- `reason`: Categorized reason (tarea, contenido sexual, broma, etc.)
- `created_at`: Timestamp when warning was issued
- `is_active`: Boolean indicating if warning is currently active

### user_bans

Stores 2-hour bans applied after 3 warnings:

- `id`: UUID primary key
- `user_id`: Text identifier for the user
- `ban_reason`: Reason for the ban
- `banned_at`: Timestamp when ban was applied
- `banned_until`: Timestamp when ban expires (2 hours later)
- `is_active`: Boolean indicating if ban is currently active
- `created_at`: Timestamp when record was created

## Function Calls

### CheckUserWarnings

- **Purpose**: Verifies current warning and ban status before processing any message
- **Parameters**: `user_id`
- **Returns**: User status (active/banned), current warning level, ban details if applicable

### RecordWarning

- **Purpose**: Records a new warning for inappropriate usage
- **Parameters**: `user_id`, `warning_level`, `inappropriate_message`, `reason`
- **Behavior**:
  - If warning_level = 1, deactivates all previous warnings (new sequence)
  - Records new warning with current timestamp

### ApplyBan

- **Purpose**: Applies 2-hour ban after 3rd warning
- **Parameters**: `user_id`, `ban_reason`
- **Behavior**:
  - Calculates ban end time (2 hours from now in Lima timezone)
  - Deactivates any previous active bans
  - Creates new ban record
  - Deactivates all current warnings

### ResetWarnings

- **Purpose**: Resets all active warnings when user returns to appropriate usage
- **Parameters**: `user_id`
- **Behavior**: Sets `is_active = false` for all user's warnings

## Warning Messages

### First Warning

"Hola, estoy aquí para escucharte si estás pasando por algo difícil o necesitas hablar sobre cómo te sientes. Si necesitas ayuda con tareas o exámenes, lo mejor es hablar con un profesor. ¿Hay algo que te esté preocupando o te haga sentir mal últimamente?"

### Second Warning

"Te recuerdo que este espacio es para conversar sobre cómo te sientes emocionalmente. Si continúas con mensajes que no corresponden a este propósito, tendré que pausar nuestra conversación temporalmente. ¿Te gustaría contarme cómo has estado sintiéndote?"

### Third Warning

"Esta es mi última advertencia. Este chat es solo para apoyo emocional. Si tu próximo mensaje no es sobre cómo te sientes, tendré que pausar nuestras conversaciones por 2 horas. ¿Hay algo que te preocupe o te haga sentir triste, ansioso o enojado?"

### Ban Message

"He pausado nuestras conversaciones por 2 horas porque has usado este espacio para propósitos diferentes al apoyo emocional. Puedes volver después de [hora específica con fecha] si necesitas hablar sobre cómo te sientes. Recuerda que estoy aquí para escucharte cuando realmente lo necesites."

## Flow Logic

1. **Every message**: System checks user status with `CheckUserWarnings`
2. **If banned**: Return ban message with formatted end time, do not process content
3. **If inappropriate message**:
   - Record warning with `RecordWarning`
   - If 3rd warning, apply ban with `ApplyBan`
   - Return appropriate warning message
4. **If appropriate emotional message and user had warnings**:
   - Reset warnings with `ResetWarnings`
   - Continue with normal emotional support flow
5. **If appropriate emotional message**: Continue with normal flow

## Error Handling

The system implements graceful failure handling:

- Database errors in warning/ban checks don't block conversations
- Failed warning recordings are logged but don't prevent responses
- Type assertion used for new database tables not yet in retired-provider types

## Time Zone Handling

- All ban calculations and displays use Lima timezone (America/Lima)
- Ban end times are displayed with explicit date context (today, tomorrow, or specific date)
- System supports user timezone input but always enforces bans in Lima time

## Integration Points

The warning system integrates with existing Sunqu functionality:

- Uses existing `RegisterCase` function with new `tipo_uso: "advertencia"`
- Maintains conversation history in `chat_messages` table
- Works alongside existing risk detection and escalation systems
- Preserves satisfaction scoring functionality

## Setup Instructions

1. Run the SQL files to create the new tables:

   ```sql
   -- Execute user_warnings_table.sql
   -- Execute user_bans_table.sql
   ```

2. The updated service is automatically integrated into the existing `processSunquChat` method

3. No additional configuration required - system is ready to use

## Monitoring

The system provides data for monitoring:

- Warning patterns by user and reason
- Ban frequency and duration effectiveness
- Inappropriate usage trends
- User behavior changes after warnings/bans
